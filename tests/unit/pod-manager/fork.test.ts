/**
 * `PodManager.forkPod` — the manager half of Pod branching.
 *
 * EVERY TEST HERE INJECTS A FAKE FORK PORT. The harness default rejects with a
 * message naming the omission, so a test that forgot one fails rather than
 * reaching the SDK's real `forkSession`. The store is the real `:memory:` one,
 * so "no row was created" is a claim about SQLite, not about a double.
 */

import { afterEach, describe, expect, it } from 'vitest';

import type { EventStore } from '../../../src/shared/contracts/event-store';
import { EventStoreError } from '../../../src/shared/contracts/event-store';
import type { Pod, PodId, PodStatus } from '../../../src/shared/contracts/events';
import { IpcFailure } from '../../../src/main/ipc/failure';
import type { ForkSession } from '../../../src/main/pod';
import { createPushes, PodManager, ROUTING_MODE } from '../../../src/main/pod-manager';
import { openEventStore } from '../../../src/main/store';

import { makeManagerHarness, seedPod, type ManagerHarness } from './helpers';

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

interface FakeForkPort {
  port: ForkSession;
  calls: { sourceSessionId: string; options: { dir: string } }[];
  /** True once the promise the port last returned has resolved or rejected. */
  settled: boolean;
  resolve(sessionId: string): void;
  reject(err: unknown): void;
}

/** A port whose answer the test decides, AFTER the call has been made. */
function deferredForkPort(): FakeForkPort {
  let resolveNext: ((id: string) => void) | null = null;
  let rejectNext: ((err: unknown) => void) | null = null;
  const fake: FakeForkPort = {
    calls: [],
    settled: false,
    port: (sourceSessionId, options) => {
      fake.calls.push({ sourceSessionId, options });
      return new Promise<string>((resolve, reject) => {
        resolveNext = (id) => {
          fake.settled = true;
          resolve(id);
        };
        rejectNext = (err) => {
          fake.settled = true;
          reject(err);
        };
      });
    },
    resolve(id) {
      if (resolveNext === null) throw new Error('the fork port was never called');
      resolveNext(id);
    },
    reject(err) {
      if (rejectNext === null) throw new Error('the fork port was never called');
      rejectNext(err);
    },
  };
  return fake;
}

/** A port that answers at once. */
function answeringForkPort(answer: string | Error): FakeForkPort {
  const fake = deferredForkPort();
  const inner = fake.port;
  fake.port = (sourceSessionId, options) => {
    const pending = inner(sourceSessionId, options);
    if (answer instanceof Error) fake.reject(answer);
    else fake.resolve(answer);
    return pending;
  };
  return fake;
}

/** Lets every queued microtask and the I/O phase run once. Not a timed wait. */
function flush(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

// ---------------------------------------------------------------------------
// Rig
// ---------------------------------------------------------------------------

const harnesses: ManagerHarness[] = [];

function harness(port: FakeForkPort): ManagerHarness {
  const made = makeManagerHarness({ forkSession: port.port });
  harnesses.push(made);
  return made;
}

afterEach(async () => {
  while (harnesses.length > 0) await harnesses.pop()?.dispose();
});

interface RowCounts {
  pods: number;
  lanes: number;
  events: number;
}

/** pods, lanes and events rows across the whole store. */
function rowCounts(store: EventStore): RowCounts {
  const pods = store.listPods();
  return {
    pods: pods.length,
    lanes: pods.reduce((n, pod) => n + store.listLanes(pod.id).length, 0),
    events: pods.reduce((n, pod) => n + store.readEvents({ podId: pod.id, limit: 5000 }).length, 0),
  };
}

/** Appends `count` user messages to the Pod's first lane; returns their seqs. */
function appendMessages(h: ManagerHarness, podId: PodId, count: number, label = 'm'): number[] {
  const laneId = h.raw.listLanes(podId)[0]?.id;
  if (laneId === undefined) throw new Error(`pod ${podId} has no lane to append to`);
  const seqs: number[] = [];
  for (let i = 0; i < count; i += 1) {
    const stored = h.raw.append({
      podId,
      laneId,
      type: 'user_message',
      payload: { type: 'user_message', text: `${label}-${i}` },
      createdAt: '2026-08-20T11:00:00.000Z',
    });
    seqs.push(stored.seq);
  }
  return seqs;
}

function seedParent(
  h: ManagerHarness,
  options: { status?: PodStatus; ccSessionId?: string | null; title?: string } = {},
): Pod {
  const podId = seedPod(h, {
    status: options.status ?? 'closed',
    title: options.title ?? 'Parent Pod',
    ...(options.ccSessionId === null ? {} : { ccSessionId: options.ccSessionId ?? 'cc-parent' }),
  });
  appendMessages(h, podId, 2);
  h.spy.reset();
  const pod = h.raw.getPod(podId);
  if (pod === null) throw new Error('seeded parent vanished');
  return pod;
}

async function expectIpcFailure(promise: Promise<unknown>, code: string): Promise<IpcFailure> {
  const err = await promise.then(
    () => {
      throw new Error(`expected a ${code} rejection, but forkPod resolved`);
    },
    (caught: unknown) => caught,
  );
  expect(err).toBeInstanceOf(IpcFailure);
  expect((err as IpcFailure).code).toBe(code);
  return err as IpcFailure;
}

// ---------------------------------------------------------------------------
// Success
// ---------------------------------------------------------------------------

describe('forkPod on an eligible parent', () => {
  it("calls the fork port exactly once, with the parent's ccSessionId and { dir: parent cwd }", async () => {
    const fork = answeringForkPort('cc-forked');
    const h = harness(fork);
    const parent = seedParent(h);

    await h.manager.forkPod(parent.id);

    expect(fork.calls).toEqual([{ sourceSessionId: 'cc-parent', options: { dir: parent.cwd } }]);
  });

  it("resolves a Pod whose ccSessionId is the port's answer, not the parent's", async () => {
    const h = harness(answeringForkPort('cc-forked'));
    const parent = seedParent(h);

    const forked = await h.manager.forkPod(parent.id);

    expect(forked.ccSessionId).toBe('cc-forked');
    expect(forked.ccSessionId).not.toBe(parent.ccSessionId);
  });

  it('records the parent Pod and the parent session it was forked from', async () => {
    const h = harness(answeringForkPort('cc-forked'));
    const parent = seedParent(h);

    const forked = await h.manager.forkPod(parent.id);

    expect(forked.forkedFromPodId).toBe(parent.id);
    expect(forked.forkedFromCcSessionId).toBe('cc-parent');
  });

  it("titles the fork '<parent title> (fork)'", async () => {
    const h = harness(answeringForkPort('cc-forked'));
    const parent = seedParent(h, { title: 'Refactor the router' });

    const forked = await h.manager.forkPod(parent.id);

    expect(forked.title).toBe('Refactor the router (fork)');
  });

  it("resolves a 'closed' Pod and starts no runner for either Pod", async () => {
    const h = harness(answeringForkPort('cc-forked'));
    const parent = seedParent(h);

    const forked = await h.manager.forkPod(parent.id);

    expect(forked.status).toBe('closed');
    expect(h.runners(forked.id)).toEqual([]);
    expect(h.runners(parent.id)).toEqual([]);
  });

  it("leaves the parent's getPod result deep-equal to its value before the fork", async () => {
    const h = harness(answeringForkPort('cc-forked'));
    const parent = seedParent(h);
    const before = structuredClone(h.raw.getPod(parent.id));

    await h.manager.forkPod(parent.id);

    expect(h.raw.getPod(parent.id)).toEqual(before);
  });

  it('emits no push on any channel', async () => {
    const h = harness(answeringForkPort('cc-forked'));
    const parent = seedParent(h);
    const attemptedBefore = h.attemptedCounts();
    const pushedBefore = h.pushed.length;

    await h.manager.forkPod(parent.id);

    expect(h.attemptedCounts()).toEqual(attemptedBefore);
    expect(h.pushed).toHaveLength(pushedBefore);
  });

  it.each(['idle', 'beached'] as const)('forks a %s parent too', async (status) => {
    const fork = answeringForkPort('cc-forked');
    const h = harness(fork);
    const parent = seedParent(h, { status });

    const forked = await h.manager.forkPod(parent.id);

    expect(fork.calls).toHaveLength(1);
    expect(forked.forkedFromPodId).toBe(parent.id);
  });

  it("opening the fork resumes the fork's own ccSessionId, never the parent's", async () => {
    const h = harness(answeringForkPort('cc-forked'));
    const parent = seedParent(h);
    const forked = await h.manager.forkPod(parent.id);

    await h.manager.openPod(forked.id);

    const resume = h.runner(forked.id).options.resume;
    expect(resume).toBe('cc-forked');
    expect(resume).not.toBe(parent.ccSessionId);
    expect(resume).not.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Refusals and failures
// ---------------------------------------------------------------------------

describe('forkPod refuses, and writes nothing', () => {
  it.each(['running', 'waiting'] as const)(
    'rejects a %s parent with CONFLICT, without calling the port or writing a row',
    async (status) => {
      const fork = answeringForkPort('cc-forked');
      const h = harness(fork);
      const parent = seedParent(h, { status });
      const before = rowCounts(h.raw);

      const err = await expectIpcFailure(h.manager.forkPod(parent.id), 'CONFLICT');

      expect(err.message).toContain('mid-turn');
      expect(fork.calls).toEqual([]);
      expect(rowCounts(h.raw)).toEqual(before);
    },
  );

  it('rejects a parent with no ccSessionId with CONFLICT, without calling the port or writing a row', async () => {
    const fork = answeringForkPort('cc-forked');
    const h = harness(fork);
    const parent = seedParent(h, { ccSessionId: null });
    expect(parent.ccSessionId).toBeNull();
    const before = rowCounts(h.raw);

    const err = await expectIpcFailure(h.manager.forkPod(parent.id), 'CONFLICT');

    expect(err.message).toContain('no-session');
    expect(fork.calls).toEqual([]);
    expect(rowCounts(h.raw)).toEqual(before);
  });

  it('rejects with IO when the fork port rejects, and writes no row', async () => {
    const h = harness(answeringForkPort(new Error('session file not found')));
    const parent = seedParent(h);
    const before = rowCounts(h.raw);

    await expectIpcFailure(h.manager.forkPod(parent.id), 'IO');

    expect(rowCounts(h.raw)).toEqual(before);
  });

  it("names the fork operation and the parent PodId in the IO failure's message", async () => {
    const h = harness(answeringForkPort(new Error('session file not found')));
    const parent = seedParent(h);

    const err = await expectIpcFailure(h.manager.forkPod(parent.id), 'IO');

    expect(err.message).toContain('forkSession');
    expect(err.message).toContain(parent.id);
  });

  it('rejects an unknown PodId with NOT_FOUND, without calling the port', async () => {
    const fork = answeringForkPort('cc-forked');
    const h = harness(fork);

    await expectIpcFailure(h.manager.forkPod('no-such-pod'), 'NOT_FOUND');

    expect(fork.calls).toEqual([]);
  });

  it('rejects with NOT_FOUND when the parent is deleted while the port is pending', async () => {
    const fork = deferredForkPort();
    const h = harness(fork);
    const parent = seedParent(h);

    const pending = h.manager.forkPod(parent.id);
    await flush();
    h.raw.deletePod(parent.id);
    const before = rowCounts(h.raw);
    fork.resolve('cc-forked');

    const err: unknown = await pending.then(
      () => null,
      (caught: unknown) => caught,
    );
    expect((err as { code?: string } | null)?.code).toBe('NOT_FOUND');
    expect(rowCounts(h.raw)).toEqual(before);
  });
});

// ---------------------------------------------------------------------------
// A fork session id that is not a distinct session
// ---------------------------------------------------------------------------

describe('forkPod refuses a fork session id that is empty or the parent\'s own', () => {
  // `seedParent` gives the parent the ccSessionId 'cc-parent'; every test below
  // asserts that before relying on it, so the source-equal case stays one.
  const cases = [
    { name: 'an empty id', answer: '' },
    { name: "the parent's own ccSessionId", answer: 'cc-parent' },
  ];

  it.each(cases)('rejects $name with IO', async ({ answer }) => {
    const h = harness(answeringForkPort(answer));
    const parent = seedParent(h);
    expect(parent.ccSessionId).toBe('cc-parent');

    await expectIpcFailure(h.manager.forkPod(parent.id), 'IO');
  });

  it.each(cases)('never calls store.forkPod for $name, and writes no row', async ({ answer }) => {
    const h = harness(answeringForkPort(answer));
    const parent = seedParent(h);
    expect(parent.ccSessionId).toBe('cc-parent');
    const before = rowCounts(h.raw);

    await expectIpcFailure(h.manager.forkPod(parent.id), 'IO');

    expect(h.spy.writes.filter((w) => w.method === 'forkPod')).toEqual([]);
    expect(rowCounts(h.raw)).toEqual(before);
  });

  it.each(cases)("names forkSession, the parent PodId and the parent's ccSessionId for $name", async ({ answer }) => {
    const h = harness(answeringForkPort(answer));
    const parent = seedParent(h);
    expect(parent.ccSessionId).toBe('cc-parent');

    const err = await expectIpcFailure(h.manager.forkPod(parent.id), 'IO');

    expect(err.message).toContain('forkSession');
    expect(err.message).toContain(parent.id);
    expect(err.message).toContain('cc-parent');
  });

  it.each(cases)('logs nothing for $name', async ({ answer }) => {
    const h = harness(answeringForkPort(answer));
    const parent = seedParent(h);
    expect(parent.ccSessionId).toBe('cc-parent');

    await expectIpcFailure(h.manager.forkPod(parent.id), 'IO');

    expect(h.logged).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Ordering against the outside world
// ---------------------------------------------------------------------------

describe('forkPod orders the store write against the SDK call', () => {
  it("captures throughSeq before awaiting the port: an event appended meanwhile is absent from the fork", async () => {
    const fork = deferredForkPort();
    const h = harness(fork);
    const parent = seedParent(h);
    const forkPointSeqs = h.raw.readEvents({ podId: parent.id }).map((event) => event.seq);
    expect(forkPointSeqs.length).toBeGreaterThan(0);

    const pending = h.manager.forkPod(parent.id);
    await flush();
    expect(fork.calls).toHaveLength(1);
    const [lateSeq] = appendMessages(h, parent.id, 1, 'late');
    fork.resolve('cc-forked');
    const forked = await pending;

    const forkSeqs = h.raw.readEvents({ podId: forked.id }).map((event) => event.seq);
    expect(forkSeqs).toEqual(forkPointSeqs);
    expect(forkSeqs).not.toContain(lateSeq);
  });

  it("calls store.forkPod only after the port's promise has settled", async () => {
    const fork = deferredForkPort();
    const h = harness(fork);
    const parent = seedParent(h);
    const storeForks = (): number => h.spy.writes.filter((w) => w.method === 'forkPod').length;

    const pending = h.manager.forkPod(parent.id);
    await flush();
    expect(fork.calls).toHaveLength(1);
    expect(fork.settled).toBe(false);
    expect(storeForks()).toBe(0);

    fork.resolve('cc-forked');
    await pending;
    expect(storeForks()).toBe(1);
  });

  it('never calls store.forkPod when the port rejects', async () => {
    const fork = deferredForkPort();
    const h = harness(fork);
    const parent = seedParent(h);

    const pending = h.manager.forkPod(parent.id);
    await flush();
    fork.reject(new Error('refused'));
    await pending.catch(() => undefined);

    expect(h.spy.writes.filter((w) => w.method === 'forkPod')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// A store IO fault after the SDK already forked
// ---------------------------------------------------------------------------

describe('forkPod when the store write fails with an IO fault', () => {
  it('rejects with IO naming the fork operation and the parent PodId, and logs the orphaned session', async () => {
    const raw = openEventStore(':memory:');
    raw.migrate();
    try {
      const store = new Proxy(raw, {
        get(target, property, receiver) {
          if (property === 'forkPod') {
            return (): never => {
              throw new EventStoreError('IO', 'disk I/O error');
            };
          }
          const value = Reflect.get(target, property, receiver) as unknown;
          return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(target) : value;
        },
      });
      const warned: unknown[][] = [];
      const fork = answeringForkPort('cc-orphan');
      const manager = new PodManager({
        store,
        createRunner: () => {
          throw new Error('forkPod must not start a runner');
        },
        push: createPushes(() => {}),
        routingMode: ROUTING_MODE,
        forkSession: fork.port,
        logger: { warn: (...args: unknown[]) => warned.push(args), error: () => {} },
      });
      raw.createPod({
        id: 'parent-io',
        title: 'P',
        cwd: process.cwd(),
        permissionMode: 'default',
        envOverrides: {},
        tabOrder: 0,
      });
      raw.updatePod('parent-io', { ccSessionId: 'cc-parent' });

      const err = await expectIpcFailure(manager.forkPod('parent-io'), 'IO');

      expect(err.message).toContain('forkPod');
      expect(err.message).toContain('parent-io');
      expect(warned.map((args) => String(args[0])).join('\n')).toContain('cc-orphan');
    } finally {
      raw.close();
    }
  });
});

// ---------------------------------------------------------------------------
// The store refuses a lane reference it cannot remap
// ---------------------------------------------------------------------------

describe("forkPod when the parent holds an event on another Pod's lane", () => {
  /** A parent whose stored events include one whose lane_id is another Pod's lane. */
  function seedParentWithForeignLaneEvent(h: ManagerHarness): { parent: Pod; foreignLaneId: string } {
    const parent = seedParent(h);
    const otherPodId = seedPod(h, { title: 'Other Pod' });
    const foreignLaneId = h.raw.listLanes(otherPodId)[0]?.id;
    if (foreignLaneId === undefined) throw new Error('the other Pod has no lane');
    h.raw.append({
      podId: parent.id,
      laneId: foreignLaneId,
      type: 'user_message',
      payload: { type: 'user_message', text: 'on a lane that is not the parent\'s' },
      createdAt: '2026-08-20T11:00:00.000Z',
    });
    h.spy.reset();
    return { parent, foreignLaneId };
  }

  it("rejects with IO whose message is 'forkPod failed for pod <parent>: forkPod:…' naming the lane, and writes no row", async () => {
    const h = harness(answeringForkPort('cc-orphan'));
    const { parent, foreignLaneId } = seedParentWithForeignLaneEvent(h);
    const before = rowCounts(h.raw);

    const err = await expectIpcFailure(h.manager.forkPod(parent.id), 'IO');

    expect(err.message.startsWith(`forkPod failed for pod ${parent.id}: forkPod:`)).toBe(true);
    expect(err.message).toContain(foreignLaneId);
    expect(rowCounts(h.raw)).toEqual(before);
  });

  it("warns that the session the fork port returned is left orphaned", async () => {
    const h = harness(answeringForkPort('cc-orphan'));
    const { parent } = seedParentWithForeignLaneEvent(h);

    await expectIpcFailure(h.manager.forkPod(parent.id), 'IO');

    const warnings = h.logged.filter((entry) => entry.level === 'warn').map((entry) => String(entry.args[0]));
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('cc-orphan');
    expect(warnings[0]).toContain('orphaned');
  });
});
