/**
 * Harness for the startup-reconciliation and Pod-lifecycle suite.
 *
 * DELIBERATELY SEPARATE FROM `tests/unit/ipc/helpers.ts`. That harness assembles
 * the REAL `PodRunner` over a fixture-driven fake SDK, which is what makes it
 * the right place to test the stream pipeline — and the wrong place to test the
 * boot sweep, which needs no runner at all, and the close race, which needs a
 * runner whose `stop()` misbehaves on command. This one talks to `PodManager`
 * directly with a scripted runner double.
 *
 * The STORE is real (`:memory:`, migrated), because the sweep's whole subject is
 * what rows survive a restart; a fake store would let a write pass that SQLite's
 * CHECK constraint would reject. It is wrapped in a counting spy so a test can
 * assert that a second sweep wrote NOTHING, which is a claim about calls and not
 * about final state.
 */

import type { EventStore } from '../../../src/shared/contracts/event-store';
import type {
  Lane,
  LaneId,
  NewEvent,
  NormalizedEvent,
  Pod,
  PodId,
  PodStatus,
} from '../../../src/shared/contracts/events';
import type { PodEventPush, PodStatusPush } from '../../../src/shared/contracts/ipc';
import { EVENT_CHANNELS } from '../../../src/shared/contracts/ipc';
import type {
  CreatePodRunner,
  PermissionHandler,
  PodRunner,
  PodRunnerHandlers,
  PodRunnerOptions,
} from '../../../src/shared/contracts/pod-runner';
import type { ForkSession } from '../../../src/main/pod';
import type { Pushes } from '../../../src/main/pod-manager';
import { createPushes, PodManager, ROUTING_MODE } from '../../../src/main/pod-manager';
import { openEventStore } from '../../../src/main/store';

// ---------------------------------------------------------------------------
// The runner double
// ---------------------------------------------------------------------------

export interface FakeRunnerScript {
  /** Reject `start()` with this instead of resolving. */
  failStartWith?: unknown;
  /**
   * How many `start()` attempts fail with `failStartWith`, counted across every
   * runner built for the Pod. Default: all of them.
   *
   * Needed by the resume-fallback tests, where the FIRST start must be rejected
   * and the retry must come up. Counting across runners rather than per runner
   * is the point: the retry builds a SECOND runner, and a per-runner counter
   * would let it fail again.
   */
  failStartTimes?: number;
  /** Reject `stop()` with this. */
  failStopWith?: unknown;
  /** Statuses `stop()` emits through `onStatus` before it settles. */
  emitOnStop?: PodStatus[];
  /**
   * Runs inside `send()`, before it resolves.
   *
   * The seam for asserting STATEMENT ORDER inside `PodManager.send`: a hook
   * here can read the store at the moment the runner is handed the text, which
   * is the only place "the append happened first" is observable. Driving the
   * same claim through the assembled pipeline does not work — `PodRunner.send`
   * resolves on one microtask and nothing is ingested inside it — so a
   * pipeline test stays green against the swapped order.
   */
  onSend?: (text: string) => void;
  /**
   * Runs inside `start()`, after `startCalls` and `handlers` are recorded and
   * before `failStartWith` is consulted. Throwing from it rejects the start.
   *
   * Two seams in one. Reading the store from here observes it at the moment a
   * runner is started, which is the only place "the write happened before the
   * start" is visible. And throwing on the runner's own `options` lets a double
   * reject by WHAT it was asked to resume rather than by how many times it has
   * been asked — the CLI refuses a session id, not an attempt number, and a
   * double that fails regardless of `resume` also fails the fresh start that
   * is meant to succeed.
   */
  onStart?: (options: PodRunnerOptions) => void;
}

export interface FakeRunner extends PodRunner {
  readonly options: PodRunnerOptions;
  startCalls: number;
  stopCalls: number;
  /**
   * Every text `send()` was handed, in order. A LIST, not a counter: a runner
   * that was never sent to and one that was sent the wrong text must not read
   * the same.
   */
  sent: string[];
  /** The handlers `start()` was given, so a test can drive a late callback. */
  handlers: PodRunnerHandlers | null;
}

/**
 * `start()` failures already spent, keyed by the script object so the count is
 * shared by every runner the same script builds.
 */
const startFailuresUsed = new WeakMap<FakeRunnerScript, number>();

function makeFakeRunner(options: PodRunnerOptions, script: FakeRunnerScript): FakeRunner {
  const runner: FakeRunner = {
    options,
    podId: options.podId,
    status: 'idle',
    startCalls: 0,
    stopCalls: 0,
    sent: [],
    handlers: null,
    async start(handlers: PodRunnerHandlers, _onPermission: PermissionHandler): Promise<void> {
      runner.startCalls += 1;
      runner.handlers = handlers;
      script.onStart?.(options);
      if (script.failStartWith === undefined) return;
      const used = startFailuresUsed.get(script) ?? 0;
      if (script.failStartTimes !== undefined && used >= script.failStartTimes) return;
      startFailuresUsed.set(script, used + 1);
      throw script.failStartWith;
    },
    async send(text: string): Promise<void> {
      runner.sent.push(text);
      script.onSend?.(text);
    },
    async interrupt(): Promise<void> {},
    async setPermissionMode(): Promise<void> {},
    async stop(): Promise<void> {
      runner.stopCalls += 1;
      // The real `PodRunner.stop()` ends by emitting `'idle'`. Reproduced here
      // because the close race turns on exactly that callback arriving while
      // `closePod` is between `#dispose` and its `'closed'` write.
      for (const status of script.emitOnStop ?? []) runner.handlers?.onStatus(status);
      if (script.failStopWith !== undefined) throw script.failStopWith;
    },
    async sendToAgent(): Promise<{ supported: boolean }> {
      return { supported: false };
    },
  };
  return runner;
}

// ---------------------------------------------------------------------------
// The store spy
// ---------------------------------------------------------------------------

/** Every store method that MUTATES. Reads are not counted. */
export type StoreWrite =
  | 'createPod'
  | 'updatePod'
  | 'deletePod'
  | 'createLane'
  | 'setLaneStatus'
  | 'setLaneAgentId'
  | 'append'
  | 'appendMany'
  | 'forkPod';

export interface StoreSpy {
  /** Every mutating call, in order, with its arguments. */
  writes: { method: StoreWrite; args: unknown[] }[];
  /** Writes recorded since the last `reset()`. */
  reset(): void;
  /**
   * Makes `getMatriarchLane` answer `null` for every Pod, from here on.
   *
   * There is no `deleteLane` on `EventStore` and `#ensureMatriarchLane` creates
   * the row during `openPod`, so a Pod with a LIVE SESSION and NO Matriarch
   * lane is otherwise unreachable from a test — which is exactly the state
   * `#appendUserPrompt`'s guard exists for, and the one branch a corrupted or
   * concurrently-modified store would land in. Only the READ is blinded; the
   * write spy underneath is untouched, so "zero rows written" is still a claim
   * about the real store.
   */
  blindMatriarchLane(): void;
}

function spyOnWrites(store: EventStore): { store: EventStore; spy: StoreSpy } {
  const writes: { method: StoreWrite; args: unknown[] }[] = [];
  let matriarchLaneBlinded = false;
  const methods: StoreWrite[] = [
    'createPod',
    'updatePod',
    'deletePod',
    'createLane',
    'setLaneStatus',
    'setLaneAgentId',
    'append',
    'appendMany',
    'forkPod',
  ];

  const wrapped = new Proxy(store, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver) as unknown;
      if (typeof value !== 'function') return value;
      if (property === 'getMatriarchLane' && matriarchLaneBlinded) {
        return (): Lane | null => null;
      }
      const name = property as StoreWrite;
      if (!methods.includes(name)) return (value as (...a: unknown[]) => unknown).bind(target);
      return (...args: unknown[]): unknown => {
        writes.push({ method: name, args });
        return (value as (...a: unknown[]) => unknown).apply(target, args);
      };
    },
  });

  return {
    store: wrapped,
    spy: {
      writes,
      reset() {
        writes.length = 0;
      },
      blindMatriarchLane() {
        matriarchLaneBlinded = true;
      },
    },
  };
}

// ---------------------------------------------------------------------------
// The harness
// ---------------------------------------------------------------------------

export interface Pushed {
  channel: string;
  payload: unknown;
}

/**
 * Records every `Pushes` call BEFORE `createPushes` gets to filter it.
 *
 * `createPushes` DROPS a `podEvent` whose `events` array is empty (`pushes.ts`,
 * "Contract: Batched in `seq` order. Never empty."). That filter is correct and
 * stays, but it means the `send` collector downstream of it can never observe
 * an empty batch — so a test that watched only `pushed` could not tell a
 * PodManager that never made a bad call from one that made it and had it
 * swallowed. Those are different defects: the second leaves a method whose
 * correctness depends entirely on a filter one layer away.
 *
 * This proxy sits ABOVE the filter, so `attempted` is what `PodManager` ACTUALLY
 * called. `pushed` keeps its old meaning — what reached the renderer — and every
 * existing assertion over it is unaffected.
 *
 * TRANSPARENT: the wrapper hands the underlying method EVERY argument it was
 * given, with `this` bound to the target, and returns what it returned. What it
 * RECORDS is the channel and the first argument, which is the payload on every
 * `Pushes` method. And ONE wrapper per method, built on first read and returned
 * on every read after, so `proxy.podEvent === proxy.podEvent` — a caller that
 * caches or compares a method by identity sees the same function a plain
 * object would give it. The cache is keyed by the property and re-validated
 * against the target's current value, so a replaced method is re-wrapped
 * rather than shadowed by a stale wrapper.
 */
export function recordAttempts(pushes: Pushes, attempted: Pushed[]): Pushes {
  type Method = (...args: unknown[]) => unknown;
  const wrappers = new Map<PropertyKey, { value: Method; wrapper: Method }>();
  return new Proxy(pushes, {
    get(target, property, receiver) {
      const read = Reflect.get(target, property, receiver) as unknown;
      if (typeof read !== 'function') return read;
      const value = read as Method;
      const cached = wrappers.get(property);
      if (cached !== undefined && cached.value === value) return cached.wrapper;
      // The method names on `Pushes` are the `EVENT_CHANNELS` keys, so the
      // recorded channel is the same string `send` would have been handed.
      const channel = channelOf(property);
      const wrapper: Method = (...args) => {
        attempted.push({ channel, payload: args[0] });
        return Reflect.apply(value, target, args);
      };
      wrappers.set(property, { value, wrapper });
      return wrapper;
    },
  });
}

/** The channel a `Pushes` method sends on: its `EVENT_CHANNELS` value, else its own name. */
function channelOf(property: PropertyKey): string {
  return (EVENT_CHANNELS as Record<string, string>)[property as string] ?? String(property);
}

/**
 * Every channel a `Pushes` method maps to, read off the object `createPushes`
 * actually returns rather than typed out here, so a sixth method is counted the
 * moment it exists.
 */
function pushChannels(): string[] {
  return Object.keys(createPushes(() => {})).map(channelOf);
}

/**
 * HARNESS-WIDE: `PodManager` may never CALL `podEvent` with an empty `events`
 * array. That channel means "something arrived", and a push that announced
 * nothing would hand the renderer's merge nothing to merge.
 *
 * Read from `attempted`, NOT from `pushed`: `createPushes` drops an empty batch
 * before `send`, so `pushed` cannot tell a manager that never made the call
 * from one that made it and had it swallowed one layer down. The second is the
 * defect this guards — a method whose correctness would rest on a filter it
 * does not own. `attempted` is recorded above that filter, so a push added
 * anywhere in `PodManager` fails here, whichever method it was added to.
 *
 * Checked in `dispose()`, which every test file that builds a harness awaits in
 * its `afterEach`; a throw there fails the test that built the harness.
 */
function emptyPodEventAttempts(attempted: readonly Pushed[]): Pushed[] {
  return attempted.filter(
    (entry) =>
      entry.channel === EVENT_CHANNELS.podEvent &&
      (entry.payload as PodEventPush).events.length === 0,
  );
}

export interface ManagerHarness {
  /** The spied store. Reads go straight through. */
  store: EventStore;
  /** The same store with no spy wrapper, for seeding. */
  raw: EventStore;
  spy: StoreSpy;
  manager: PodManager;
  /** What reached the renderer: recorded by `createPushes`'s `send`. */
  pushed: Pushed[];
  /**
   * What `PodManager` CALLED, recorded above `createPushes`'s empty-batch
   * filter. Use this — never `pushed` — to assert that a push was not MADE, as
   * opposed to not delivered.
   */
  attempted: Pushed[];
  /**
   * How many pushes `PodManager` has ATTEMPTED so far, per channel. Keyed by
   * every channel a `Pushes` method maps to, derived from `createPushes` at
   * runtime; a channel never called reads 0. Snapshot it before and after an
   * action and compare the whole record, so a push on a channel the test did
   * not think of is still counted.
   */
  attemptedCounts(): Record<string, number>;
  pushesOn<T>(channel: string): T[];
  statusPushes(podId: PodId): PodStatusPush[];
  logged: { level: 'warn' | 'error'; args: unknown[] }[];
  runners(podId: PodId): FakeRunner[];
  /** The newest runner built for a Pod. */
  runner(podId: PodId): FakeRunner;
  /** What the next `createRunner` for this Pod should do. */
  script(podId: PodId, script: FakeRunnerScript): void;
  /** The clock the manager was given; each call advances one second. */
  now(): string;
  dispose(): Promise<void>;
}

export interface ManagerHarnessOptions {
  isDirectory?: (path: string) => boolean;
  /**
   * The fork port handed to `PodManager`. Default: one that REJECTS, so a test
   * that forgot to supply a fake can never reach the SDK's real `forkSession`
   * — it fails with this message instead.
   */
  forkSession?: ForkSession;
}

/** The harness default: refuses, and says why. */
const noForkPortSupplied: ForkSession = () =>
  Promise.reject(new Error('this test supplied no fork port; pass forkSession to makeManagerHarness'));

export function makeManagerHarness(options: ManagerHarnessOptions = {}): ManagerHarness {
  const raw = openEventStore(':memory:');
  raw.migrate();
  const { store, spy } = spyOnWrites(raw);

  const pushed: Pushed[] = [];
  const attempted: Pushed[] = [];
  const logged: { level: 'warn' | 'error'; args: unknown[] }[] = [];
  const built = new Map<PodId, FakeRunner[]>();
  const scripts = new Map<PodId, FakeRunnerScript>();

  const createRunner: CreatePodRunner = (runnerOptions) => {
    const runner = makeFakeRunner(runnerOptions, scripts.get(runnerOptions.podId) ?? {});
    const list = built.get(runnerOptions.podId) ?? [];
    list.push(runner);
    built.set(runnerOptions.podId, list);
    return runner;
  };

  let ids = 0;
  let clock = 0;
  const now = (): string =>
    new Date(Date.UTC(2026, 7, 20, 12, 0, (clock += 1))).toISOString();

  const manager = new PodManager({
    store,
    createRunner,
    push: recordAttempts(
      createPushes((channel, payload) => {
        pushed.push({ channel, payload });
      }),
      attempted,
    ),
    routingMode: ROUTING_MODE,
    newId: () => `id-${(ids += 1)}`,
    now,
    isDirectory: options.isDirectory ?? ((): boolean => true),
    forkSession: options.forkSession ?? noForkPortSupplied,
    logger: {
      warn: (...args: unknown[]) => logged.push({ level: 'warn', args }),
      error: (...args: unknown[]) => logged.push({ level: 'error', args }),
    },
  });

  return {
    store,
    raw,
    spy,
    manager,
    pushed,
    attempted,
    attemptedCounts() {
      const counts: Record<string, number> = {};
      for (const channel of pushChannels()) counts[channel] = 0;
      for (const entry of attempted) counts[entry.channel] = (counts[entry.channel] ?? 0) + 1;
      return counts;
    },
    logged,
    now,
    pushesOn<T>(channel: string): T[] {
      return pushed.filter((entry) => entry.channel === channel).map((entry) => entry.payload as T);
    },
    statusPushes(podId) {
      return pushed
        .filter((entry) => entry.channel === EVENT_CHANNELS.podStatus)
        .map((entry) => entry.payload as PodStatusPush)
        .filter((push) => push.podId === podId);
    },
    runners: (podId) => built.get(podId) ?? [],
    runner(podId) {
      const list = built.get(podId) ?? [];
      const last = list[list.length - 1];
      if (last === undefined) throw new Error(`no runner was created for pod ${podId}`);
      return last;
    },
    script(podId, next) {
      scripts.set(podId, next);
    },
    async dispose() {
      try {
        await manager.disposeAll();
      } finally {
        raw.close();
      }
      // After `disposeAll`, so a push made while tearing down is held to the
      // rule too; after `close`, so a violation never leaks the store.
      const empty = emptyPodEventAttempts(attempted);
      if (empty.length > 0) {
        throw new Error(
          `PodManager attempted ${empty.length} podEvent push(es) with an empty events array ` +
            `(pods: ${empty.map((entry) => (entry.payload as PodEventPush).podId).join(', ')})`,
        );
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Seeding
// ---------------------------------------------------------------------------

export interface SeedPodOptions {
  status?: PodStatus;
  lastActiveAt?: string;
  title?: string;
  /**
   * Claude Code's own session id, as a Pod that reached its first turn would
   * have persisted it. Left unset, the seeded Pod has `null` — a Pod that never
   * reached a first turn and so has nothing to resume.
   */
  ccSessionId?: string;
  /** Lane statuses to create, Matriarch first. Default: one running Matriarch. */
  lanes?: { kind: Lane['kind']; status: Lane['status'] }[];
}

let seedCounter = 0;

/**
 * Writes a Pod straight into the store, bypassing `PodManager`, so a test can
 * express "this is what a previous process left behind" without pretending to
 * run one.
 */
export function seedPod(h: ManagerHarness, options: SeedPodOptions = {}): PodId {
  seedCounter += 1;
  const podId = `seed-pod-${seedCounter}`;
  h.raw.createPod({
    id: podId,
    title: options.title ?? `Seeded ${seedCounter}`,
    cwd: process.cwd(),
    permissionMode: 'default',
    envOverrides: {},
    tabOrder: seedCounter,
  });

  const patch: Parameters<EventStore['updatePod']>[1] = {};
  if (options.status !== undefined) patch.status = options.status;
  if (options.lastActiveAt !== undefined) patch.lastActiveAt = options.lastActiveAt;
  if (options.ccSessionId !== undefined) patch.ccSessionId = options.ccSessionId;
  if (Object.keys(patch).length > 0) h.raw.updatePod(podId, patch);

  const lanes = options.lanes ?? [{ kind: 'matriarch' as const, status: 'running' as const }];
  let laneIndex = 0;
  let matriarchLaneId: LaneId | null = null;
  for (const lane of lanes) {
    laneIndex += 1;
    const laneId = `${podId}-lane-${laneIndex}`;
    h.raw.createLane({
      id: laneId,
      podId,
      kind: lane.kind,
      toolUseId: lane.kind === 'calf' ? `tool-${laneId}` : null,
      agentId: null,
      parentLaneId: lane.kind === 'calf' ? matriarchLaneId : null,
      depth: lane.kind === 'calf' ? 1 : 0,
      subagentType: null,
      description: null,
    });
    if (lane.kind === 'matriarch') matriarchLaneId = laneId;
    // `createLane` starts every lane at 'running'; anything else is an
    // explicit transition, which also stamps `ended_at` the way a real one did.
    if (lane.status !== 'running') h.raw.setLaneStatus(laneId, lane.status);
  }

  h.spy.reset();
  return podId;
}

/** Lane ids for a seeded Pod, in `listLanes` order. */
export function laneIds(h: ManagerHarness, podId: PodId): LaneId[] {
  return h.raw.listLanes(podId).map((lane) => lane.id);
}

/** Every event on a Pod, ascending by `seq`. */
export function eventsFor(h: ManagerHarness, podId: PodId): NormalizedEvent[] {
  return h.raw.readEvents({ podId });
}

// ---------------------------------------------------------------------------
// The openness invariant
// ---------------------------------------------------------------------------

/**
 * The product's ONE definition of openness, written in the positive form so it
 * fails CLOSED: an unrecognised future status reads as not-open, which shows a
 * run control that is at worst redundant rather than enabling a composer over a
 * process that is not there.
 */
export function isOpenStatus(status: PodStatus): boolean {
  return status === 'idle' || status === 'running' || status === 'waiting';
}

/**
 * Whether `PodManager` holds a live session for this Pod.
 *
 * `#sessions` is private and must stay private — the alternative is a second
 * public method on `PodManager` for a test's benefit. `interrupt` is the
 * cheapest faithful probe: `#requireSession` throws `NOT_RUNNING` when there is
 * no session and otherwise forwards to the runner, where this suite's double
 * makes it a recorded no-op. It answers exactly `#sessions.has(podId)`.
 */
export async function hasSession(h: ManagerHarness, podId: PodId): Promise<boolean> {
  try {
    await h.manager.interrupt(podId);
    return true;
  } catch (err) {
    if ((err as { code?: string }).code === 'NOT_RUNNING') return false;
    throw err;
  }
}

/**
 * THE SINGLE ASSERTION THAT CATCHES A MISSED STATUS WRITE ANYWHERE IN THE
 * CLASS: the session registry and the persisted status never disagree about
 * whether a Pod is open. Asserted after EVERY public method returns.
 */
export async function expectOpennessAgrees(
  h: ManagerHarness,
  podId: PodId,
  where: string,
): Promise<{ pod: Pod | null; open: boolean }> {
  const pod = h.raw.getPod(podId);
  const open = await hasSession(h, podId);
  const expected = pod === null ? false : isOpenStatus(pod.status);
  if (open !== expected) {
    throw new Error(
      `openness disagreed after ${where}: #sessions.has=${open}, status=${pod?.status ?? 'deleted'}`,
    );
  }
  return { pod, open };
}

/** Narrowing helper so a test can read a `system` event's data without a cast chain. */
export function systemData(event: NormalizedEvent): Record<string, unknown> {
  if (event.payload.type !== 'system') throw new Error(`event ${event.seq} is not a system event`);
  return event.payload.data as Record<string, unknown>;
}

export type { NewEvent };
