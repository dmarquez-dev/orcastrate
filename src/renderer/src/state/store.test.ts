/**
 * The state layer's behavioural contract, exercised through the store itself
 * rather than through React — the store owns every rule that is not a
 * derivation, and driving it directly keeps these assertions about behaviour
 * instead of about rendering. `workspace-provider.test.tsx` covers the React
 * half.
 *
 * Node environment (the repo default): `./stub-api` is imported DIRECTLY, not
 * through the `test-utils` barrel, because the barrel pulls in React Testing
 * Library and its `afterEach(cleanup)`.
 */

import { describe, expect, it } from 'vitest';

import type { Lane, NormalizedEvent, Pod } from '@shared/contracts/events';
import type { IpcError, IpcResult, ReadEventsResponse } from '@shared/contracts/ipc';
import { INVOKE_CHANNELS } from '@shared/contracts/ipc';

import type { ActionResult } from '../contracts/renderer-state';
import {
  ipcError,
  makeStubLane,
  makeStubPod,
  makeStubPods,
  stubOrcastrateApi,
  type InvokeChannelKey,
  type StubOrcastrateApi,
} from '../test-utils/stub-api';

import { PanelStateStore } from './panel-store';
import { newRuntime, WorkspaceStateStore, type PodRuntimeState } from './store';
import { steerPrefill } from './steer';

const POD = 'pod-1';

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function makeStore(api: StubOrcastrateApi, pageSize?: number): WorkspaceStateStore {
  return new WorkspaceStateStore(
    api,
    pageSize === undefined
      ? { now: () => '2026-01-01T00:00:00.000Z' }
      : { now: () => '2026-01-01T00:00:00.000Z', pageSize },
  );
}

function ev(seq: number, laneId = 'lane-matriarch'): NormalizedEvent {
  return {
    id: seq,
    podId: POD,
    laneId,
    seq,
    type: 'assistant_text',
    payload: { type: 'assistant_text', text: `#${seq}` },
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

function range(from: number, to: number, laneId?: string): NormalizedEvent[] {
  const out: NormalizedEvent[] = [];
  for (let seq = from; seq <= to; seq += 1) out.push(ev(seq, laneId));
  return out;
}

const MATRIARCH = makeStubLane({ id: 'lane-matriarch', podId: POD });
const CALF_A = makeStubLane({
  id: 'lane-a',
  podId: POD,
  kind: 'calf',
  subagentType: 'explorer',
  description: 'look around',
  agentId: 'agent-7',
  startedAt: '2026-01-01T01:00:00.000Z',
});
const CALF_B = makeStubLane({
  id: 'lane-b',
  podId: POD,
  kind: 'calf',
  subagentType: 'writer',
  description: 'write it up',
  startedAt: '2026-01-01T02:00:00.000Z',
});

function withLanes(store: WorkspaceStateStore, api: StubOrcastrateApi, lanes: Lane[]): void {
  api.emit.laneChanged({ podId: POD, lanes });
  void store;
}

function runtimeOf(store: WorkspaceStateStore) {
  const runtime = store.getState().runtimes[POD];
  if (runtime === undefined) throw new Error('expected a runtime for pod-1');
  return runtime;
}

/**
 * Writes a runtime record BEHIND the store's own write path, so a state no
 * action can produce can be handed to `repairSelection`. Going through
 * `patchRuntime` would trip `assertPanePolicy` first, which is the point of
 * that assertion and the reason this bypass exists.
 */
function forceRuntime(
  store: WorkspaceStateStore,
  fn: (runtime: PodRuntimeState) => PodRuntimeState,
): void {
  const state = store.getState();
  const runtime = state.runtimes[POD];
  if (runtime === undefined) throw new Error('expected a runtime for pod-1');
  state.runtimes[POD] = fn(runtime);
}

// ---------------------------------------------------------------------------
// Criterion 3 — no action ever rejects or throws
// ---------------------------------------------------------------------------

/**
 * Every invoke channel, paired with the action that reaches it. `laneList` and
 * `appRoutingMode` have no action of their own — they are read by the
 * provider's lifecycle — and are asserted separately below.
 * `podSetPermissionMode` has no renderer action at all and is named in the
 * coverage sweep instead.
 */
interface ChannelCase {
  channel: InvokeChannelKey;
  setUp?: (store: WorkspaceStateStore) => void;
  run: (store: WorkspaceStateStore) => Promise<ActionResult<unknown>>;
  reject: (api: StubOrcastrateApi) => void;
}

const boom = (): Promise<never> => Promise.reject(new Error('preload exploded'));

const ACTION_CASES: ChannelCase[] = [
  {
    channel: 'podList',
    run: (store) => store.actions.refreshPods(),
    reject: (api) => {
      api.pods.list = boom;
    },
  },
  {
    channel: 'podCreate',
    run: (store) =>
      store.actions.createPod({ title: 'T', cwd: '/stub/workspace', permissionMode: 'default' }),
    reject: (api) => {
      api.pods.create = boom;
    },
  },
  {
    channel: 'podUpdate',
    run: (store) => store.actions.updatePod({ podId: POD, title: 'renamed' }),
    reject: (api) => {
      api.pods.update = boom;
    },
  },
  {
    channel: 'podDelete',
    run: (store) => store.actions.deletePod({ podId: POD, deleteSession: false }),
    reject: (api) => {
      api.pods.delete = boom;
    },
  },
  {
    channel: 'podOpen',
    run: (store) => store.actions.openPod(POD),
    reject: (api) => {
      api.pods.open = boom;
    },
  },
  {
    channel: 'podClose',
    run: (store) => store.actions.closePod(POD),
    reject: (api) => {
      api.pods.close = boom;
    },
  },
  {
    channel: 'podSend',
    setUp: (store) => store.actions.setComposerText(POD, 'hello'),
    run: (store) => store.actions.sendComposer(POD),
    reject: (api) => {
      api.pods.send = boom;
    },
  },
  {
    channel: 'podInterrupt',
    run: (store) => store.actions.interruptPod(POD),
    reject: (api) => {
      api.pods.interrupt = boom;
    },
  },
  {
    channel: 'podReconnect',
    run: (store) => store.actions.reconnectPod(POD),
    reject: (api) => {
      api.pods.reconnect = boom;
    },
  },
  {
    channel: 'podFork',
    run: (store) => store.actions.forkPod(POD),
    reject: (api) => {
      api.pods.fork = boom;
    },
  },
  {
    channel: 'eventsRead',
    run: (store) => store.actions.loadMoreEvents(POD),
    reject: (api) => {
      api.events.read = boom;
    },
  },
  {
    channel: 'permissionRespond',
    run: (store) =>
      store.actions.respondToPermission({ podId: POD, requestId: 'r1', decision: 'allow' }),
    reject: (api) => {
      api.permissions.respond = boom;
    },
  },
  {
    channel: 'dialogPickDirectory',
    run: (store) => store.actions.pickDirectory(),
    reject: (api) => {
      api.dialog.pickDirectory = boom;
    },
  },
];

/**
 * The six panel channels reach the bridge through `PanelStateStore`, not
 * through `WorkspaceStateStore`, so they need their own table — and the sweep
 * below unions the two, which is what keeps it a COMPLETENESS check rather
 * than a list somebody has to remember to extend.
 *
 * `setUp` runs against a HEALTHY stub and is awaited before the channel is
 * failed, because `beachcomberPreview` needs a scan and `beachcomberTrash`
 * needs a preview before either can reach the bridge at all.
 */
interface PanelChannelCase {
  channel: InvokeChannelKey;
  setUp?: (store: PanelStateStore) => Promise<unknown>;
  run: (store: PanelStateStore) => Promise<ActionResult<unknown>>;
  reject: (api: StubOrcastrateApi) => void;
}

const SELECTABLE_ID = 'entry-projects-orphan';

const PANEL_ACTION_CASES: PanelChannelCase[] = [
  {
    channel: 'beachcomberScan',
    run: (store) => store.beachcomberActions.rescan(),
    reject: (api) => {
      api.beachcomber.scan = boom;
    },
  },
  {
    channel: 'beachcomberPreview',
    setUp: async (store) => {
      await store.beachcomberActions.rescan();
      store.beachcomberActions.toggle(SELECTABLE_ID);
    },
    run: (store) => store.beachcomberActions.requestPreview(),
    reject: (api) => {
      api.beachcomber.preview = boom;
    },
  },
  {
    channel: 'beachcomberTrash',
    setUp: async (store) => {
      await store.beachcomberActions.rescan();
      store.beachcomberActions.toggle(SELECTABLE_ID);
      await store.beachcomberActions.requestPreview();
    },
    run: (store) => store.beachcomberActions.trashPreviewed(),
    reject: (api) => {
      api.beachcomber.trash = boom;
    },
  },
  {
    channel: 'helmScopes',
    run: (store) => store.refreshScopes(),
    reject: (api) => {
      api.helm.listScopes = boom;
    },
  },
  {
    channel: 'helmLoad',
    run: (store) => store.helmActions.selectScope('user'),
    reject: (api) => {
      api.helm.load = boom;
    },
  },
  {
    channel: 'helmSave',
    setUp: (store) => store.helmActions.selectScope('user'),
    run: (store) => store.helmActions.save(),
    reject: (api) => {
      api.helm.save = boom;
    },
  },
];

describe('error discipline (criterion 3)', () => {
  it('covers every invoke channel between the action table and the lifecycle reads', () => {
    const covered = new Set<InvokeChannelKey>(ACTION_CASES.map((c) => c.channel));
    for (const testCase of PANEL_ACTION_CASES) covered.add(testCase.channel);
    covered.add('laneList');
    covered.add('appRoutingMode');
    // No renderer action reaches this channel. The store's permission-mode
    // action had no caller (no affordance changes an existing Pod's mode; the
    // dialog's mode picker is create-time only) and was removed, while the
    // channel, preload method and main handler stay. Naming it here keeps the
    // equality below exact instead of letting the channel fall out silently.
    covered.add('podSetPermissionMode');
    expect([...covered].sort()).toEqual(
      (Object.keys(INVOKE_CHANNELS) as InvokeChannelKey[]).sort(),
    );
  });

  for (const testCase of PANEL_ACTION_CASES) {
    it(`${testCase.channel}: passes the IpcError through unmodified`, async () => {
      const api = stubOrcastrateApi();
      const store = new PanelStateStore(api);
      await testCase.setUp?.(store);

      const error = ipcError('IO', `${testCase.channel} failed`);
      api.failInvoke(testCase.channel, error);
      const result = await testCase.run(store);

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBe(error);
    });

    it(`${testCase.channel}: a rejecting preload becomes INTERNAL, not an unhandled rejection`, async () => {
      const api = stubOrcastrateApi();
      const store = new PanelStateStore(api);
      await testCase.setUp?.(store);

      testCase.reject(api);
      const result = await testCase.run(store);

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe('INTERNAL');
      expect(result.error.message).toBe('preload exploded');
    });
  }

  for (const testCase of ACTION_CASES) {
    it(`${testCase.channel}: passes the IpcError through unmodified`, async () => {
      const api = stubOrcastrateApi();
      const error = ipcError('IO', `${testCase.channel} failed`);
      api.failInvoke(testCase.channel, error);
      const store = makeStore(api);
      testCase.setUp?.(store);

      const result = await testCase.run(store);

      expect(result.ok).toBe(false);
      if (result.ok) return;
      // The SAME object, not a copy: the message main wrote is the message the
      // user reads.
      expect(result.error).toBe(error);
    });

    it(`${testCase.channel}: a rejecting preload becomes INTERNAL, not an unhandled rejection`, async () => {
      const api = stubOrcastrateApi();
      testCase.reject(api);
      const store = makeStore(api);
      testCase.setUp?.(store);

      const result = await testCase.run(store);

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe('INTERNAL');
      expect(result.error.message).toBe('preload exploded');
    });
  }

  it('laneList failure lands in the lane Loadable, not in a rejection', async () => {
    const api = stubOrcastrateApi();
    const error = ipcError('IO', 'lane list failed');
    api.failInvoke('laneList', error);
    const store = makeStore(api);

    store.actions.setActivePod(POD);
    await flush();

    expect(runtimeOf(store).lanesPhase).toBe('error');
    expect(runtimeOf(store).lanesError).toBe(error);
  });

  it('appRoutingMode failure leaves routingMode null and does not throw', async () => {
    const api = stubOrcastrateApi();
    api.failInvoke('appRoutingMode', ipcError('INTERNAL', 'no mode'));
    const store = makeStore(api);

    store.start();
    await flush();

    expect(store.getState().routingMode).toBeNull();
    store.stop();
  });

  it('answers every action with INTERNAL when there is no bridge at all', async () => {
    const store = new WorkspaceStateStore(null);
    expect(store.getState().podsPhase).toBe('error');
    expect(store.getState().podsError?.code).toBe('INTERNAL');

    const result = await store.actions.refreshPods();
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('INTERNAL');
  });

  it('treats a non-envelope answer as INTERNAL rather than trusting it', async () => {
    const api = stubOrcastrateApi();
    api.pods.close = (() => Promise.resolve(undefined)) as unknown as typeof api.pods.close;
    const store = makeStore(api);

    const result = await store.actions.closePod(POD);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('INTERNAL');
  });
});

// ---------------------------------------------------------------------------
// Criterion 4 — local precondition failures never reach IPC
// ---------------------------------------------------------------------------

describe('local precondition failures (criterion 4)', () => {
  for (const text of ['', '   ', '\n\t ']) {
    it(`sendComposer(${JSON.stringify(text)}) is INVALID_ARGUMENT with zero IPC calls`, async () => {
      const api = stubOrcastrateApi();
      const store = makeStore(api);
      store.actions.setComposerText(POD, text);

      const result = await store.actions.sendComposer(POD);

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe('INVALID_ARGUMENT');
      expect(api.calls.podSend).toHaveLength(0);
      expect(runtimeOf(store).composerError?.code).toBe('INVALID_ARGUMENT');
    });
  }

  for (const reason of [undefined, '', '   ']) {
    it(`deny with reason ${JSON.stringify(reason)} is INVALID_ARGUMENT with zero IPC calls`, async () => {
      const api = stubOrcastrateApi();
      const store = makeStore(api);

      const result = await store.actions.respondToPermission({
        podId: POD,
        requestId: 'r1',
        decision: 'deny',
        ...(reason === undefined ? {} : { reason }),
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe('INVALID_ARGUMENT');
      expect(api.calls.permissionRespond).toHaveLength(0);
    });
  }

  it('a deny WITH a reason does reach IPC', async () => {
    const api = stubOrcastrateApi();
    const store = makeStore(api);

    const result = await store.actions.respondToPermission({
      podId: POD,
      requestId: 'r1',
      decision: 'deny',
      reason: 'not that directory',
    });

    expect(result.ok).toBe(true);
    expect(api.calls.permissionRespond).toHaveLength(1);
  });

  it('clears the composer only on a successful send', async () => {
    const api = stubOrcastrateApi();
    const store = makeStore(api);
    store.actions.setComposerText(POD, 'ship it');

    expect((await store.actions.sendComposer(POD)).ok).toBe(true);
    expect(runtimeOf(store).composerText).toBe('');

    api.failInvoke('podSend', ipcError('NOT_RUNNING', 'pod is closed'));
    store.actions.setComposerText(POD, 'try again');
    expect((await store.actions.sendComposer(POD)).ok).toBe(false);
    expect(runtimeOf(store).composerText).toBe('try again');
    expect(runtimeOf(store).composerSending).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Criterion 5 — subscriptions
// ---------------------------------------------------------------------------

describe('subscription lifecycle (criterion 5)', () => {
  it('subscribes to all five channels once and unsubscribes every one', () => {
    const api = stubOrcastrateApi();
    const store = makeStore(api);

    store.start();
    store.start(); // idempotent: StrictMode must not double-subscribe

    for (const channel of [
      'podEvent',
      'podStatus',
      'laneChanged',
      'permissionRequested',
      'permissionResolved',
    ] as const) {
      expect(api.listenerCount(channel)).toBe(1);
    }

    store.stop();

    for (const channel of [
      'podEvent',
      'podStatus',
      'laneChanged',
      'permissionRequested',
      'permissionResolved',
    ] as const) {
      expect(api.listenerCount(channel)).toBe(0);
    }

    const before = store.getState();
    api.emit.podEvent({ podId: POD, events: range(1, 3) });
    expect(store.getState()).toBe(before);
  });
});

// ---------------------------------------------------------------------------
// Criterion 6 — transcript merge, end to end through the store
// ---------------------------------------------------------------------------

describe('transcript merge through the store (criterion 6)', () => {
  it('interleaves a live push with the backfill page that later covers it', async () => {
    const pages: ReadEventsResponse[] = [
      { events: range(1, 50), hasMore: true },
      { events: range(51, 100), hasMore: false },
    ];
    let read = 0;
    const api = stubOrcastrateApi({
      events: {
        read: async (): Promise<IpcResult<ReadEventsResponse>> => {
          const page = pages[read] ?? { events: [], hasMore: false };
          read += 1;
          return { ok: true, value: page };
        },
      },
    });
    const store = makeStore(api);
    store.start();

    // The live push lands FIRST, mid-backfill.
    api.emit.podEvent({ podId: POD, events: range(40, 45) });
    expect(runtimeOf(store).transcripts['lane-matriarch']?.events.map((e) => e.seq)).toEqual([
      40, 41, 42, 43, 44, 45,
    ]);

    await store.actions.loadMoreEvents(POD);
    await store.actions.loadMoreEvents(POD);

    const events = runtimeOf(store).transcripts['lane-matriarch']?.events ?? [];
    expect(events.map((e) => e.seq)).toEqual(range(1, 100).map((e) => e.seq));
    for (let seq = 1; seq <= 100; seq += 1) {
      expect(events.filter((e) => e.seq === seq)).toHaveLength(1);
    }
    store.stop();
  });

  it('routes each event to its own lane', () => {
    const api = stubOrcastrateApi();
    const store = makeStore(api);
    store.start();

    api.emit.podEvent({
      podId: POD,
      events: [ev(1, 'lane-matriarch'), ev(2, 'lane-a'), ev(3, 'lane-matriarch')],
    });

    const transcripts = runtimeOf(store).transcripts;
    expect(transcripts['lane-matriarch']?.events.map((e) => e.seq)).toEqual([1, 3]);
    expect(transcripts['lane-a']?.events.map((e) => e.seq)).toEqual([2]);
    store.stop();
  });
});

// ---------------------------------------------------------------------------
// Criterion 7 — backfill paging
// ---------------------------------------------------------------------------

describe('backfill paging (criterion 7)', () => {
  it('pages forward by afterSeq and stops only on hasMore === false', async () => {
    const requests: number[] = [];
    const pages: ReadEventsResponse[] = [
      { events: range(1, 10), hasMore: true },
      { events: range(11, 14), hasMore: true }, // SHORT page, still not the end
      { events: [], hasMore: false },
    ];
    let read = 0;
    const api = stubOrcastrateApi({
      events: {
        read: async (req): Promise<IpcResult<ReadEventsResponse>> => {
          requests.push(req.afterSeq ?? 0);
          const page = pages[read] ?? { events: [], hasMore: false };
          read += 1;
          return { ok: true, value: page };
        },
      },
    });
    const store = makeStore(api);

    await store.actions.loadMoreEvents(POD);
    await store.actions.loadMoreEvents(POD);
    await store.actions.loadMoreEvents(POD);
    // Exhausted: this one must not issue a fourth read.
    const afterExhaustion = await store.actions.loadMoreEvents(POD);

    expect(requests).toEqual([0, 10, 14]);
    expect(afterExhaustion.ok).toBe(true);
    expect(runtimeOf(store).backfill.hasMore).toBe(false);
    expect(runtimeOf(store).backfill.cursorSeq).toBe(14);
    expect(runtimeOf(store).transcripts['lane-matriarch']?.events).toHaveLength(14);
  });

  it('asks for the configured pageSize verbatim, even above 5000, and a shorter page is not the end', async () => {
    const limits: (number | undefined)[] = [];
    let read = 0;
    const api = stubOrcastrateApi({
      events: {
        read: async (req): Promise<IpcResult<ReadEventsResponse>> => {
          limits.push(req.limit);
          read += 1;
          // Main clamped to 5000, so the page is far shorter than requested.
          return { ok: true, value: { events: range(read, read), hasMore: read < 2 } };
        },
      },
    });
    const store = makeStore(api, 9000);

    const first = await store.actions.loadMoreEvents(POD);
    expect(first.ok).toBe(true);
    expect(runtimeOf(store).backfill.hasMore).toBe(true); // short page did NOT end paging
    await store.actions.loadMoreEvents(POD);

    expect(limits).toEqual([9000, 9000]);
    expect(runtimeOf(store).backfill.pageSize).toBe(9000);
  });

  it('coalesces concurrent calls into one in-flight request', async () => {
    let reads = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const api = stubOrcastrateApi({
      events: {
        read: async (): Promise<IpcResult<ReadEventsResponse>> => {
          reads += 1;
          await gate;
          return { ok: true, value: { events: range(1, 3), hasMore: false } };
        },
      },
    });
    const store = makeStore(api);

    const a = store.actions.loadMoreEvents(POD);
    const b = store.actions.loadMoreEvents(POD);
    const c = store.actions.loadMoreEvents(POD);
    release();
    const [ra, rb, rc] = await Promise.all([a, b, c]);

    expect(reads).toBe(1);
    expect(ra.ok && rb.ok && rc.ok).toBe(true);
    expect(runtimeOf(store).transcripts['lane-matriarch']?.events).toHaveLength(3);
  });

  it('surfaces a failed page in the backfill Loadable and allows a retry', async () => {
    const api = stubOrcastrateApi();
    const error = ipcError('IO', 'database locked');
    api.failInvoke('eventsRead', error);
    const store = makeStore(api);

    const failed = await store.actions.loadMoreEvents(POD);
    expect(failed.ok).toBe(false);
    expect(runtimeOf(store).backfill.phase).toBe('error');
    expect(runtimeOf(store).backfill.error).toBe(error);

    api.clearInvokeFailure('eventsRead');
    expect((await store.actions.loadMoreEvents(POD)).ok).toBe(true);
    expect(runtimeOf(store).backfill.phase).toBe('ready');
  });
});

// ---------------------------------------------------------------------------
// Criterion 8 — laneChanged is a snapshot
// ---------------------------------------------------------------------------

describe('laneChanged snapshot semantics (criterion 8)', () => {
  it('replaces the lane list wholesale, removing a lane the push omits', () => {
    const api = stubOrcastrateApi();
    const store = makeStore(api);
    store.start();

    withLanes(store, api, [MATRIARCH, CALF_A, CALF_B]);
    expect(runtimeOf(store).lanes.map((l) => l.id)).toEqual(['lane-matriarch', 'lane-a', 'lane-b']);

    withLanes(store, api, [MATRIARCH, CALF_B]);
    expect(runtimeOf(store).lanes.map((l) => l.id)).toEqual(['lane-matriarch', 'lane-b']);
    store.stop();
  });

  it('puts the Matriarch in the primary pane and drops a follower the snapshot removed', () => {
    const api = stubOrcastrateApi();
    const store = makeStore(api);
    store.start();

    withLanes(store, api, [CALF_A, MATRIARCH, CALF_B]);
    expect(runtimeOf(store).primaryLaneId).toBe('lane-matriarch');

    store.actions.showLane(POD, 'lane-a');
    expect(runtimeOf(store).followerLaneIds).toEqual(['lane-a']);
    expect(runtimeOf(store).focusedFollowerIndex).toBe(0);

    // A snapshot that drops the follower lane must not leave it dangling.
    withLanes(store, api, [MATRIARCH, CALF_B]);
    expect(runtimeOf(store).followerLaneIds).toEqual([]);
    expect(runtimeOf(store).focusedFollowerIndex).toBeNull();
    expect(runtimeOf(store).primaryLaneId).toBe('lane-matriarch');
    store.stop();
  });

  it('returns primaryLaneId to the Matriarch after a snapshot that drops every lane', () => {
    const api = stubOrcastrateApi();
    const store = makeStore(api);
    store.start();

    withLanes(store, api, [MATRIARCH, CALF_A]);
    store.actions.showLane(POD, 'lane-a');
    expect(runtimeOf(store).primaryLaneId).toBe('lane-matriarch');
    expect(runtimeOf(store).followerLaneIds).toEqual(['lane-a']);

    // EVERY lane gone. `primaryLaneId` is null ONLY while the list is empty.
    withLanes(store, api, []);
    expect(runtimeOf(store).primaryLaneId).toBeNull();
    expect(runtimeOf(store).followerLaneIds).toEqual([]);
    expect(runtimeOf(store).focusedFollowerIndex).toBeNull();

    // And it comes back to the Matriarch the moment the lanes do — nothing
    // latched the null, and nothing had to re-select.
    withLanes(store, api, [CALF_B, MATRIARCH]);
    expect(runtimeOf(store).primaryLaneId).toBe('lane-matriarch');
    store.stop();
  });

  it('restores all three uniqueness rules from a state that broke every one of them', () => {
    const api = stubOrcastrateApi();
    const store = makeStore(api);
    store.start();
    withLanes(store, api, [MATRIARCH, CALF_A, CALF_B]);

    // Forge the three violations the invariant names — a follower that is also
    // the primary, a duplicate, and a lane no snapshot ever carried — directly
    // on the runtime record, because no ACTION can produce them and a repair
    // that is only ever handed clean input proves nothing.
    forceRuntime(store, (runtime) => ({
      ...runtime,
      followerLaneIds: ['lane-matriarch', 'lane-a', 'lane-a', 'lane-ghost'],
      focusedFollowerIndex: 3,
    }));
    expect(runtimeOf(store).followerLaneIds).toHaveLength(4);

    // Replaying the SAME lane list is enough: repair runs on every snapshot.
    withLanes(store, api, [MATRIARCH, CALF_A, CALF_B]);

    const runtime = runtimeOf(store);
    expect(runtime.primaryLaneId).toBe('lane-matriarch');
    expect(runtime.followerLaneIds).toEqual(['lane-a']);
    expect(runtime.followerLaneIds).not.toContain(runtime.primaryLaneId);
    expect(new Set(runtime.followerLaneIds).size).toBe(runtime.followerLaneIds.length);
    expect(runtime.focusedFollowerIndex).toBe(0);
    store.stop();
  });
});

// ---------------------------------------------------------------------------
// Criterion 9 — permission cards
// ---------------------------------------------------------------------------

describe('permission cards (criterion 9)', () => {
  function withCard(): { api: StubOrcastrateApi; store: WorkspaceStateStore } {
    const api = stubOrcastrateApi();
    const store = makeStore(api);
    store.start();
    api.emit.permissionRequested({
      podId: POD,
      laneId: 'lane-a',
      requestId: 'req-1',
      toolName: 'Bash',
      input: { command: 'ls' },
    });
    return { api, store };
  }

  it('adds a card carrying the lane that asked', () => {
    const { store } = withCard();
    const cards = runtimeOf(store).pendingPermissions;
    expect(cards).toHaveLength(1);
    expect(cards[0]?.laneId).toBe('lane-a');
    expect(cards[0]?.toolName).toBe('Bash');
    expect(cards[0]?.submitting).toBe(false);
    expect(cards[0]?.error).toBeNull();
  });

  it('is NOT removed optimistically on click, and a failed respond leaves it visible', async () => {
    const { api, store } = withCard();
    const error = ipcError('NOT_RUNNING', 'the turn already ended');
    api.failInvoke('permissionRespond', error);

    const result = await store.actions.respondToPermission({
      podId: POD,
      requestId: 'req-1',
      decision: 'allow',
    });

    expect(result.ok).toBe(false);
    const cards = runtimeOf(store).pendingPermissions;
    expect(cards).toHaveLength(1);
    expect(cards[0]?.error).toBe(error);
    expect(cards[0]?.submitting).toBe(false);
  });

  it('keeps a SUCCESSFUL respond on screen until the push arrives', async () => {
    const { api, store } = withCard();

    expect(
      (await store.actions.respondToPermission({ podId: POD, requestId: 'req-1', decision: 'allow' }))
        .ok,
    ).toBe(true);
    expect(runtimeOf(store).pendingPermissions).toHaveLength(1);

    api.emit.permissionResolved({ podId: POD, requestId: 'req-1', outcome: 'allow' });
    expect(runtimeOf(store).pendingPermissions).toHaveLength(0);
  });

  it("clears the card silently on outcome 'aborted'", () => {
    const { api, store } = withCard();

    api.emit.permissionResolved({ podId: POD, requestId: 'req-1', outcome: 'aborted' });

    expect(runtimeOf(store).pendingPermissions).toHaveLength(0);
    expect(runtimeOf(store).composerError).toBeNull();
  });

  it('is a no-op for an unknown or already-removed requestId', () => {
    const { api, store } = withCard();

    api.emit.permissionResolved({ podId: POD, requestId: 'nobody', outcome: 'deny' });
    expect(runtimeOf(store).pendingPermissions).toHaveLength(1);

    api.emit.permissionResolved({ podId: POD, requestId: 'req-1', outcome: 'deny' });
    api.emit.permissionResolved({ podId: POD, requestId: 'req-1', outcome: 'deny' });
    expect(runtimeOf(store).pendingPermissions).toHaveLength(0);
  });

  it('ignores a replayed request push rather than showing the card twice', () => {
    const { api, store } = withCard();
    api.emit.permissionRequested({
      podId: POD,
      laneId: 'lane-a',
      requestId: 'req-1',
      toolName: 'Bash',
      input: { command: 'ls' },
    });
    expect(runtimeOf(store).pendingPermissions).toHaveLength(1);
  });

  it('suppresses a double-click into a single decision', async () => {
    const { api, store } = withCard();
    const req = { podId: POD, requestId: 'req-1', decision: 'allow' as const };

    await Promise.all([
      store.actions.respondToPermission(req),
      store.actions.respondToPermission(req),
    ]);

    expect(api.calls.permissionRespond).toHaveLength(1);
  });

  it('tracks a pending request for a BACKGROUNDED Pod', () => {
    const api = stubOrcastrateApi();
    const store = makeStore(api);
    store.start();
    store.actions.setActivePod('pod-other');

    api.emit.permissionRequested({
      podId: POD,
      laneId: 'lane-a',
      requestId: 'req-1',
      toolName: 'Bash',
      input: null,
    });

    expect(store.getState().activePodId).toBe('pod-other');
    expect(runtimeOf(store).pendingPermissions).toHaveLength(1);
    store.stop();
  });
});

// ---------------------------------------------------------------------------
// Criterion 10 — THE PANE MODEL (`contracts/renderer-panes.ts` sections 1-2)
//
// Every assertion below reads the FULL TRIPLE. A test that checked only
// `followerLaneIds` would pass against an implementation that left
// `focusedFollowerIndex` stale, and a test that checked only the index would
// pass against one that pushed a duplicate.
// ---------------------------------------------------------------------------

describe('the pane model (criterion 10)', () => {
  function seeded(): { api: StubOrcastrateApi; store: WorkspaceStateStore } {
    const api = stubOrcastrateApi();
    const store = makeStore(api);
    store.start();
    withLanes(store, api, [MATRIARCH, CALF_A, CALF_B]);
    return { api, store };
  }

  /** `(primaryLaneId, followerLaneIds, focusedFollowerIndex)`, as one value. */
  function triple(store: WorkspaceStateStore): {
    primaryLaneId: string | null;
    followerLaneIds: string[];
    focusedFollowerIndex: number | null;
  } {
    const runtime = runtimeOf(store);
    return {
      primaryLaneId: runtime.primaryLaneId,
      followerLaneIds: [...runtime.followerLaneIds],
      focusedFollowerIndex: runtime.focusedFollowerIndex,
    };
  }

  // --- showLane's four branches, each asserting the whole triple -----------

  it('branch 1: an unknown lane leaves all three fields untouched', () => {
    const { store } = seeded();
    const before = triple(store);

    store.actions.showLane(POD, 'lane-that-never-existed');

    expect(triple(store)).toEqual(before);
    // Not vacuous: the "before" it matched is a real, populated state.
    expect(before.primaryLaneId).toBe('lane-matriarch');
  });

  it('branch 2: showing the PRIMARY lane clears its unread and opens no follower', () => {
    const { api, store } = seeded();
    store.actions.setActivePod(POD);
    // Unread only accrues for a lane that is NOT on screen, so the Matriarch's
    // count has to be built while a different lane holds the primary — which
    // cannot happen. Force it instead, so the clear has something to clear.
    forceRuntime(store, (runtime) => ({
      ...runtime,
      laneUnread: { ...runtime.laneUnread, 'lane-matriarch': 3 },
    }));
    void api;

    store.actions.showLane(POD, 'lane-matriarch');

    expect(triple(store)).toEqual({
      primaryLaneId: 'lane-matriarch',
      followerLaneIds: [],
      focusedFollowerIndex: null,
    });
    expect(runtimeOf(store).laneUnread['lane-matriarch']).toBe(0);
  });

  it('branch 3: a lane ALREADY a follower is focused, not duplicated', () => {
    const { store } = seeded();
    store.actions.showLane(POD, 'lane-a');
    expect(triple(store)).toEqual({
      primaryLaneId: 'lane-matriarch',
      followerLaneIds: ['lane-a'],
      focusedFollowerIndex: 0,
    });

    // Force the focus off the pane holding `lane-a`, so "the index moved to
    // this lane" is an observable change rather than a value that was already
    // correct — the way a push-based implementation would still look right.
    forceRuntime(store, (runtime) => ({ ...runtime, focusedFollowerIndex: null }));

    store.actions.showLane(POD, 'lane-a');

    const after = triple(store);
    expect(after.followerLaneIds).toEqual(['lane-a']);
    // THE ASSERTION A PUSH-BASED IMPLEMENTATION FAILS: length unchanged.
    expect(after.followerLaneIds).toHaveLength(1);
    expect(after.focusedFollowerIndex).toBe(0);
    expect(after.primaryLaneId).toBe('lane-matriarch');
  });

  it('branch 4: any other lane REPLACES the focused follower in place', () => {
    const { store } = seeded();

    // From empty: one pane is opened and the index becomes 0.
    store.actions.showLane(POD, 'lane-a');
    expect(triple(store)).toEqual({
      primaryLaneId: 'lane-matriarch',
      followerLaneIds: ['lane-a'],
      focusedFollowerIndex: 0,
    });

    // With a follower present: REPLACED, not appended.
    store.actions.showLane(POD, 'lane-b');
    expect(triple(store)).toEqual({
      primaryLaneId: 'lane-matriarch',
      followerLaneIds: ['lane-b'],
      focusedFollowerIndex: 0,
    });
  });

  // --- swap-on-pin is gone -------------------------------------------------

  it('SWAP-ON-PIN IS GONE: showing a lane that is already a follower leaves the Matriarch primary', () => {
    const { store } = seeded();
    // The old model's exact sequence: "pin" lane B, then "select" lane B. It
    // used to exchange the panes and put lane-b in the primary.
    store.actions.showLane(POD, 'lane-b');
    store.actions.showLane(POD, 'lane-b');

    expect(triple(store)).toEqual({
      primaryLaneId: 'lane-matriarch',
      followerLaneIds: ['lane-b'],
      focusedFollowerIndex: 0,
    });
  });

  // --- hideLane ------------------------------------------------------------

  it('hideLane closes the named pane and nulls the index when none is left', () => {
    const { store } = seeded();
    store.actions.showLane(POD, 'lane-a');

    store.actions.hideLane(POD, 'lane-a');

    expect(triple(store)).toEqual({
      primaryLaneId: 'lane-matriarch',
      followerLaneIds: [],
      focusedFollowerIndex: null,
    });
  });

  it('hideLane is a no-op for a lane that is not a follower, and for a second call', () => {
    const { store } = seeded();
    store.actions.showLane(POD, 'lane-a');

    // A different lane must not close somebody else's pane.
    store.actions.hideLane(POD, 'lane-b');
    expect(triple(store).followerLaneIds).toEqual(['lane-a']);
    // Nor may the Matriarch's row close the primary.
    store.actions.hideLane(POD, 'lane-matriarch');
    expect(triple(store).primaryLaneId).toBe('lane-matriarch');

    store.actions.hideLane(POD, 'lane-a');
    store.actions.hideLane(POD, 'lane-a');
    expect(triple(store)).toEqual({
      primaryLaneId: 'lane-matriarch',
      followerLaneIds: [],
      focusedFollowerIndex: null,
    });
  });

  // --- jumpToLane ----------------------------------------------------------

  it('jumpToLane delegates to showLane: it steers the FOLLOWER, never the primary', () => {
    const { store } = seeded();
    store.actions.jumpToLane(POD, 'lane-that-never-existed');
    expect(triple(store)).toEqual({
      primaryLaneId: 'lane-matriarch',
      followerLaneIds: [],
      focusedFollowerIndex: null,
    });

    store.actions.jumpToLane(POD, 'lane-b');
    expect(triple(store)).toEqual({
      primaryLaneId: 'lane-matriarch',
      followerLaneIds: ['lane-b'],
      focusedFollowerIndex: 0,
    });
  });

  // --- today's policy, over the WHOLE action surface -----------------------

  /**
   * ENUMERATED FROM THE OBJECT, not from a hand-written list, so an action
   * added later is covered without anyone remembering to add it here — and
   * asserted NON-EMPTY, because a test that enumerates nothing and finds
   * nothing wrong reads exactly like one that enumerated everything.
   */
  it('NO ACTION MOVES primaryLaneId OFF THE MATRIARCH — every method, enumerated', async () => {
    // A TWO-LANE POD, answered by `lanes.list` as well as by the push, so the
    // asynchronous re-read `setActivePod` starts after `deletePod` wiped the
    // runtime restores the same two lanes rather than an empty rail.
    const twoLanes = [MATRIARCH, CALF_A];
    const api = stubOrcastrateApi({
      pods: { list: async () => ({ ok: true, value: [makeStubPod({ id: POD })] }) },
      lanes: { list: async () => ({ ok: true, value: twoLanes }) },
    });
    const store = makeStore(api);
    store.start();
    withLanes(store, api, twoLanes);
    store.actions.setActivePod(POD);
    await flush();
    expect(runtimeOf(store).lanes).toHaveLength(2);

    const args: Record<string, unknown[]> = {
      refreshPods: [],
      createPod: [{ title: 'T', cwd: '/stub/workspace', permissionMode: 'default' }],
      updatePod: [{ podId: POD, title: 'renamed' }],
      reorderPods: [[POD]],
      deletePod: [{ podId: POD, deleteSession: false }],
      openPod: [POD],
      closePod: [POD],
      reconnectPod: [POD],
      forkPod: [POD],
      setActivePod: [POD],
      setComposerText: [POD, 'hello'],
      sendComposer: [POD],
      interruptPod: [POD],
      steerFromLane: [POD, 'lane-a'],
      showLane: [POD, 'lane-a'],
      hideLane: [POD, 'lane-a'],
      jumpToLane: [POD, 'lane-a'],
      loadMoreEvents: [POD],
      respondToPermission: [{ podId: POD, requestId: 'r1', decision: 'allow' }],
      pickDirectory: [],
    };

    const names = Object.keys(store.actions) as (keyof typeof store.actions)[];
    // NOT VACUOUS, twice over: the enumeration is non-empty, and every member
    // of it has arguments below — a method added without a case here fails
    // rather than being silently skipped.
    expect(names.length).toBeGreaterThan(0);
    expect(names.filter((name) => args[name] === undefined)).toEqual([]);

    let called = 0;
    for (const name of names) {
      const method = store.actions[name] as (...a: unknown[]) => unknown;
      await method.apply(store.actions, args[name] ?? []);
      called += 1;
      // `deletePod` removes the runtime; replay the snapshot so every method
      // after it in the enumeration is still exercised against two lanes.
      if (store.getState().runtimes[POD] === undefined) {
        withLanes(store, api, twoLanes);
        store.actions.setActivePod(POD);
        await flush();
      }
      const runtime = store.getState().runtimes[POD];
      // Not vacuous: every iteration really is asserting against two lanes.
      expect(runtime?.lanes.length ?? 0).toBe(2);
      if (runtime === undefined) continue;
      expect(runtime.primaryLaneId).toBe('lane-matriarch');
      expect(runtime.followerLaneIds.length).toBeLessThanOrEqual(1);
    }
    expect(called).toBe(names.length);
    store.stop();
  });
});

// ---------------------------------------------------------------------------
// `showLane` step 0 — 'inline' routing mode opens no follower
// (`contracts/lane-pin-removal.ts` section 2)
// ---------------------------------------------------------------------------

/**
 * THE RULE THE DELETED PIN-GATING VIEW-MODEL FIELD SILENTLY CARRIED. In
 * 'inline' routing mode every event arrives on the Matriarch's laneId, so a
 * follower pane opened on a Calf would show BYTE-IDENTICAL contents to the
 * primary. That field used to suppress the rail's pin button; the button is
 * gone, so the rule lives in the action, where `jumpToLane` inherits it by
 * delegating.
 *
 * EVERY TEST HERE IS A PAIR. The 'inline' half and the 'lanes' half differ in
 * the routing mode and in nothing else, and both halves assert. A `showLane`
 * that silently no-opped everywhere would satisfy the inline half alone.
 */
describe("showLane in 'inline' routing mode (step 0)", () => {
  async function seededWith(
    mode: 'inline' | 'lanes',
  ): Promise<{ api: StubOrcastrateApi; store: WorkspaceStateStore }> {
    const api = stubOrcastrateApi({
      app: { routingMode: async () => ({ ok: true, value: mode }) },
    });
    const store = makeStore(api);
    store.start();
    await flush();
    // Not an assumption: the mode the whole suite turns on is read back.
    expect(store.getState().routingMode).toBe(mode);
    store.actions.setActivePod('pod-other');
    api.emit.laneChanged({ podId: POD, lanes: [MATRIARCH, CALF_A, CALF_B] });
    // A real unread count on the Calf, accrued the ordinary way: the Pod is
    // backgrounded and the lane is in no pane, so the push counts.
    api.emit.podEvent({ podId: POD, events: [ev(1, 'lane-a'), ev(2, 'lane-a'), ev(3, 'lane-a')] });
    expect(runtimeOf(store).laneUnread['lane-a']).toBe(3);
    return { api, store };
  }

  it("opens NO follower on a Calf, and still clears that lane's unread count", async () => {
    const { store } = await seededWith('inline');

    store.actions.showLane(POD, 'lane-a');

    const runtime = runtimeOf(store);
    expect(runtime.followerLaneIds).toEqual([]);
    expect(runtime.focusedFollowerIndex).toBeNull();
    expect(runtime.primaryLaneId).toBe('lane-matriarch');
    // THE HALF THAT STOPS A TOTAL NO-OP FROM PASSING: 3 -> 0, in the same
    // assertion as the three fields that did not move.
    expect(runtime.laneUnread['lane-a']).toBe(0);
    store.stop();
  });

  it("DOES open the follower on the same call in 'lanes' mode — the mode is the only difference", async () => {
    const { store } = await seededWith('lanes');

    store.actions.showLane(POD, 'lane-a');

    const runtime = runtimeOf(store);
    expect(runtime.followerLaneIds).toEqual(['lane-a']);
    expect(runtime.focusedFollowerIndex).toBe(0);
    expect(runtime.primaryLaneId).toBe('lane-matriarch');
    expect(runtime.laneUnread['lane-a']).toBe(0);
    store.stop();
  });

  it('repeated inline selections across different Calves never accumulate a follower', async () => {
    const { store } = await seededWith('inline');

    store.actions.showLane(POD, 'lane-a');
    store.actions.showLane(POD, 'lane-b');
    store.actions.showLane(POD, 'lane-a');
    store.actions.showLane(POD, 'lane-matriarch');

    const runtime = runtimeOf(store);
    expect(runtime.followerLaneIds).toEqual([]);
    expect(runtime.focusedFollowerIndex).toBeNull();
    expect(runtime.primaryLaneId).toBe('lane-matriarch');
    store.stop();
  });

  it('jumpToLane INHERITS the rule, because it delegates', async () => {
    const inline = await seededWith('inline');
    inline.store.actions.jumpToLane(POD, 'lane-a');
    expect(runtimeOf(inline.store).followerLaneIds).toEqual([]);
    expect(runtimeOf(inline.store).focusedFollowerIndex).toBeNull();
    // The unread clear reaches the dispatch-card path too.
    expect(runtimeOf(inline.store).laneUnread['lane-a']).toBe(0);
    inline.store.stop();

    const lanes = await seededWith('lanes');
    lanes.store.actions.jumpToLane(POD, 'lane-a');
    expect(runtimeOf(lanes.store).followerLaneIds).toEqual(['lane-a']);
    expect(runtimeOf(lanes.store).focusedFollowerIndex).toBe(0);
    lanes.store.stop();
  });

  it('hideLane is still a tolerant no-op in inline mode, where there is nothing to hide', async () => {
    const { store } = await seededWith('inline');
    store.actions.showLane(POD, 'lane-a');
    store.actions.hideLane(POD, 'lane-a');
    const runtime = runtimeOf(store);
    expect(runtime.followerLaneIds).toEqual([]);
    expect(runtime.focusedFollowerIndex).toBeNull();
    store.stop();
  });
});

// ---------------------------------------------------------------------------
// Criterion 11 — Steer
// ---------------------------------------------------------------------------

describe('steer (criterion 11)', () => {
  it('is null for a lane with no agentId', () => {
    expect(steerPrefill(makeStubLane({ agentId: null }))).toBeNull();
  });

  it('names the agent id after the frozen prefix', () => {
    expect(steerPrefill(makeStubLane({ agentId: 'agent-7' }))).toBe('send this to agent agent-7');
  });

  it('writes the prefill into the Pod composer and sends NOTHING', async () => {
    const api = stubOrcastrateApi();
    const store = makeStore(api);
    store.start();
    withLanes(store, api, [MATRIARCH, CALF_A]);

    store.actions.steerFromLane(POD, 'lane-a');
    await flush();

    expect(runtimeOf(store).composerText).toBe('send this to agent agent-7');
    expect(api.calls.podSend).toHaveLength(0);
    store.stop();
  });

  it('does nothing for a lane with no agentId', () => {
    const api = stubOrcastrateApi();
    const store = makeStore(api);
    store.start();
    withLanes(store, api, [MATRIARCH, CALF_B]);

    store.actions.steerFromLane(POD, 'lane-b');

    expect(runtimeOf(store).composerText).toBe('');
    expect(api.calls.podSend).toHaveLength(0);
    store.stop();
  });
});

// ---------------------------------------------------------------------------
// Criterion 12 — routing mode and unread counts
// ---------------------------------------------------------------------------

describe('routing mode and unread counts (criterion 12)', () => {
  it('reads routingMode once and exposes it unchanged', async () => {
    const api = stubOrcastrateApi({ app: { routingMode: async () => ({ ok: true, value: 'inline' }) } });
    const store = makeStore(api);

    store.start();
    await flush();

    expect(store.getState().routingMode).toBe('inline');
    store.stop();
  });

  it('reads app.routingMode exactly once', async () => {
    const api = stubOrcastrateApi();
    const store = makeStore(api);

    store.start();
    store.start();
    await flush();

    expect(api.calls.appRoutingMode).toHaveLength(1);
    expect(store.getState().routingMode).toBe('lanes');
    store.stop();
  });

  it('counts events for a backgrounded Pod and never for the active one', () => {
    const api = stubOrcastrateApi();
    const store = makeStore(api);
    store.start();
    store.actions.setActivePod('pod-other');

    api.emit.podEvent({ podId: POD, events: range(1, 4) });
    expect(runtimeOf(store).unreadEventCount).toBe(4);

    store.actions.setActivePod(POD);
    expect(runtimeOf(store).unreadEventCount).toBe(0);

    api.emit.podEvent({ podId: POD, events: range(5, 6) });
    expect(runtimeOf(store).unreadEventCount).toBe(0);
    store.stop();
  });

  it('counts lane events only for lanes that are not on screen in either pane', () => {
    const api = stubOrcastrateApi();
    const store = makeStore(api);
    store.start();
    store.actions.setActivePod(POD);
    withLanes(store, api, [MATRIARCH, CALF_A]);

    api.emit.podEvent({ podId: POD, events: [ev(1, 'lane-a'), ev(2, 'lane-matriarch')] });

    expect(runtimeOf(store).laneUnread['lane-a']).toBe(1);
    expect(runtimeOf(store).laneUnread['lane-matriarch'] ?? 0).toBe(0);

    // Opening lane-a in the FOLLOWER pane clears it — being on screen is what
    // "read" means now, and the primary pane never moved off the Matriarch.
    store.actions.showLane(POD, 'lane-a');
    expect(runtimeOf(store).laneUnread['lane-a']).toBe(0);
    expect(runtimeOf(store).primaryLaneId).toBe('lane-matriarch');
    store.stop();
  });

  it('does not count backfilled history as unread', async () => {
    const api = stubOrcastrateApi({
      events: {
        read: async (): Promise<IpcResult<ReadEventsResponse>> => ({
          ok: true,
          value: { events: range(1, 5), hasMore: false },
        }),
      },
    });
    const store = makeStore(api);
    store.start();
    store.actions.setActivePod('pod-other');

    await store.actions.loadMoreEvents(POD);

    expect(runtimeOf(store).unreadEventCount).toBe(0);
    expect(runtimeOf(store).transcripts['lane-matriarch']?.events).toHaveLength(5);
    store.stop();
  });
});

// ---------------------------------------------------------------------------
// Pods: ordering commit, open/close tracking, cwd opacity
// ---------------------------------------------------------------------------

describe('pod actions', () => {
  it('reorderPods assigns dense tabOrder 0..n-1', async () => {
    const api = stubOrcastrateApi();
    const store = makeStore(api);

    const result = await store.actions.reorderPods(['c', 'a', 'b']);

    expect(result.ok).toBe(true);
    expect(api.calls.podUpdate.map((args) => args[0])).toEqual([
      { podId: 'c', tabOrder: 0 },
      { podId: 'a', tabOrder: 1 },
      { podId: 'b', tabOrder: 2 },
    ]);
  });

  it('reorderPods refetches on failure so the bar cannot keep a rejected order', async () => {
    const api = stubOrcastrateApi();
    const error = ipcError('CONFLICT', 'stale order');
    api.failInvoke('podUpdate', error);
    const store = makeStore(api);

    const result = await store.actions.reorderPods(['a', 'b']);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe(error);
    expect(api.calls.podList).toHaveLength(1);
  });

  // -------------------------------------------------------------------------
  // Openness is NOT STORED. Invariant I1 of `contracts/renderer-lifecycle.ts`
  // section 6, asserted against the store, where the field used to live.
  //
  // WHICH BEHAVIOUR MOVED: the deleted `tracks opened across open, close and a
  // beaching` test asserted that `runtime.opened` latched true on open, false
  // on close, false on a beaching and true on reconnect. Every one of those
  // four facts is still asserted — but on the POD ROW's `status`, which is now
  // the only field that carries them, and the derivation from that field to
  // `PodTabVm.opened` is pinned in `workspace-provider.test.tsx` (I2-I5, I7).
  // Nothing is dropped; the same four transitions are read off their real
  // owner. The tri-state `OpenedKnowledge` was never implemented.
  // -------------------------------------------------------------------------

  it('never stores openness: the runtime record carries no `opened` property', () => {
    const runtime = newRuntime('idle', null);

    // The property NAME, not its value — so the deletion cannot silently
    // regress into a re-added convenience field with a plausible default.
    expect(Object.keys(runtime)).not.toContain('opened');
    expect('opened' in runtime).toBe(false);
    expect(Object.keys(runtime).some((key) => key.toLowerCase().includes('open'))).toBe(false);
  });

  it('carries openness on the Pod row across open, close and a beaching', async () => {
    // `makeStubPods()` is two Pods on OPPOSITE sides of the derivation, so no
    // single constant can satisfy this walk.
    const seeded = makeStubPods();
    const api = stubOrcastrateApi({
      pods: { list: async (): Promise<IpcResult<Pod[]>> => ({ ok: true, value: seeded }) },
    });
    const store = makeStore(api);
    store.start();
    await flush();

    const statusOf = (id: string = POD): string | undefined =>
      store.getState().pods.find((pod) => pod.id === id)?.status;
    expect(statusOf()).toBe('closed');
    // The other side of the same reply, unaffected by everything below.
    expect(statusOf('pod-2')).toBe('running');

    // OPEN — the reply's status is the whole answer, and no runtime patch
    // accompanies it.
    await store.actions.openPod(POD);
    expect(statusOf()).toBe('running');
    expect('opened' in runtimeOf(store)).toBe(false);

    // CLOSE — `pod:close` returns void; main reports the new status by push,
    // which is the one line in `onPodStatus` that keeps the row in step.
    await store.actions.closePod(POD);
    api.emit.podStatus({ podId: POD, status: 'closed' });
    expect(statusOf()).toBe('closed');

    // BEACHING — the push alone, with no runtime reset behind it.
    await store.actions.openPod(POD);
    expect(statusOf()).toBe('running');
    api.emit.podStatus({ podId: POD, status: 'beached', exitCode: 1 });
    expect(statusOf()).toBe('beached');
    expect('opened' in runtimeOf(store)).toBe(false);

    // RECONNECT — the reply's status again, and nothing else.
    await store.actions.reconnectPod(POD);
    expect(statusOf()).toBe('running');
    store.stop();
  });

  it('passes cwd through as an opaque string, exactly as pickDirectory gave it', async () => {
    const api = stubOrcastrateApi();
    const store = makeStore(api);

    const picked = await store.actions.pickDirectory();
    expect(picked.ok).toBe(true);
    if (!picked.ok) return;
    const cwd = picked.value.path ?? '';

    await store.actions.createPod({ title: 'New', cwd, permissionMode: 'acceptEdits' });

    const createArgs = api.calls.podCreate[0]?.[0] as { cwd: string } | undefined;
    expect(createArgs?.cwd).toBe('/stub/workspace');
  });

  it('treats a cancelled directory pick as success, not failure', async () => {
    const api = stubOrcastrateApi({
      dialog: { pickDirectory: async () => ({ ok: true, value: { path: null } }) },
    });
    const store = makeStore(api);

    const result = await store.actions.pickDirectory();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.path).toBeNull();
  });

  it('activates the leftmost Pod on the first list and never steals the choice later', async () => {
    const pods: Pod[] = [
      makeStubPod({ id: 'second', tabOrder: 1 }),
      makeStubPod({ id: 'first', tabOrder: 0 }),
    ];
    const api = stubOrcastrateApi({ pods: { list: async () => ({ ok: true, value: pods }) } });
    const store = makeStore(api);

    store.start();
    await flush();
    expect(store.getState().activePodId).toBe('first');

    store.actions.setActivePod('second');
    await store.actions.refreshPods();
    expect(store.getState().activePodId).toBe('second');
    store.stop();
  });
});

// ---------------------------------------------------------------------------
// Pod lifecycle amendments (`contracts/pod-deletion.ts` section 4)
// ---------------------------------------------------------------------------

describe('createPod creates the ROW and stops there', () => {
  it('records exactly one invocation, pods.create, and zero pods.open', async () => {
    const api = stubOrcastrateApi();
    const store = makeStore(api);

    const result = await store.actions.createPod({
      title: 'New',
      cwd: '/stub/workspace',
      permissionMode: 'default',
    });

    expect(result.ok).toBe(true);
    expect(api.calls.podCreate).toHaveLength(1);
    // THE WHOLE POINT: no open. Against the pre-change store this line failed
    // with `[['pod-1']]`, because `createPod` invoked both.
    expect(api.calls.podOpen).toEqual([]);
    // And `pods.create` is the ONLY Pod channel touched — the two reads that
    // follow (`lanes.list`, `events.read`) belong to activating the new Pod,
    // which `setActivePod` has always done and which touches no Pod channel.
    const podChannels = (Object.keys(api.calls) as InvokeChannelKey[]).filter(
      (key) => key.startsWith('pod') && api.calls[key].length > 0,
    );
    expect(podChannels).toEqual(['podCreate']);
  });

  it('leaves the row in place with the status main returned', async () => {
    const api = stubOrcastrateApi();
    const store = makeStore(api);

    await store.actions.createPod({
      title: 'New',
      cwd: '/stub/workspace',
      permissionMode: 'default',
    });

    // `makeStubPod` defaults to 'closed'; the row carries what main said and
    // nothing optimistic.
    expect(store.getState().pods.map((pod) => pod.status)).toEqual(['closed']);
    expect(store.getState().activePodId).toBe(POD);
  });
});

describe('deletePod takes a request and reports a result', () => {
  function podStore(): { api: StubOrcastrateApi; store: WorkspaceStateStore } {
    const api = stubOrcastrateApi({
      pods: { list: async () => ({ ok: true, value: [makeStubPod({ id: POD })] }) },
    });
    const store = makeStore(api);
    store.start();
    return { api, store };
  }

  it('sends the whole DeletePodRequest, deleteSession included', async () => {
    const { api, store } = podStore();
    await flush();

    await store.actions.deletePod({ podId: POD, deleteSession: true });

    expect(api.calls.podDelete).toEqual([[{ podId: POD, deleteSession: true }]]);
  });

  it('resolves the PodDeletionResult rather than void', async () => {
    const { store } = podStore();
    await flush();

    const result = await store.actions.deletePod({ podId: POD, deleteSession: true });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({
      podId: POD,
      podDeleted: true,
      session: 'trashed',
      sessionError: null,
    });
  });

  it("clears the row, the runtime and activePodId even when session is 'failed'", async () => {
    const api = stubOrcastrateApi({
      pods: {
        list: async () => ({ ok: true, value: [makeStubPod({ id: POD })] }),
        delete: async (req) => ({
          ok: true,
          value: {
            podId: req.podId,
            podDeleted: true as const,
            session: 'failed' as const,
            sessionError: 'EPERM: operation not permitted',
          },
        }),
      },
    });
    const store = makeStore(api);
    store.start();
    await flush();
    expect(store.getState().activePodId).toBe(POD);
    expect(store.getState().pods.map((pod) => pod.id)).toEqual([POD]);

    const result = await store.actions.deletePod({ podId: POD, deleteSession: true });

    // The session file survived and the Pod did not. A row left on screen
    // because a FILE could not be binned would tell the user the opposite of
    // what happened.
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.session).toBe('failed');
    expect(store.getState().pods).toEqual([]);
    expect(store.getState().runtimes[POD]).toBeUndefined();
    expect(store.getState().activePodId).toBeNull();
    store.stop();
  });

  it('leaves everything in place when the delete itself failed', async () => {
    const { api, store } = podStore();
    await flush();
    api.failInvoke('podDelete', ipcError('NOT_FOUND', 'no such Pod'));

    const result = await store.actions.deletePod({ podId: POD, deleteSession: false });

    expect(result.ok).toBe(false);
    expect(store.getState().pods.map((pod) => pod.id)).toEqual([POD]);
    store.stop();
  });
});

// ---------------------------------------------------------------------------
// forkPod — the new Pod is listed and selected; a failure touches nothing
// ---------------------------------------------------------------------------

describe('forkPod', () => {
  const PARENT = makeStubPod({ id: POD, title: 'Parent', ccSessionId: 'cc-parent' });
  const OTHER = makeStubPod({ id: 'pod-2', title: 'Other', tabOrder: 1 });
  const FORKED = makeStubPod({
    id: 'pod-1-fork',
    title: 'Parent (fork)',
    tabOrder: 2,
    ccSessionId: 'cc-fork',
    forkedFromPodId: POD,
    forkedFromCcSessionId: 'cc-parent',
  });

  /** Two Pods listed, the parent active, and `pods.fork` answered by `fork`. */
  async function forkStore(
    fork: (podId: string) => Promise<IpcResult<Pod>>,
  ): Promise<WorkspaceStateStore> {
    const api = stubOrcastrateApi({
      pods: { list: async () => ({ ok: true, value: [PARENT, OTHER] }), fork },
    });
    const store = makeStore(api);
    store.start();
    await flush();
    expect(store.getState().activePodId).toBe(POD);
    return store;
  }

  it('adds the returned Pod to the list and makes it the active Pod', async () => {
    const store = await forkStore(async () => ({ ok: true, value: FORKED }));

    const result = await store.actions.forkPod(POD);

    expect(result).toEqual({ ok: true, value: FORKED });
    expect(store.getState().pods.map((pod) => pod.id)).toEqual([POD, 'pod-2', 'pod-1-fork']);
    expect(store.getState().activePodId).toBe('pod-1-fork');
    store.stop();
  });

  it('resolves the failure and leaves the list and the active Pod unchanged', async () => {
    const error = ipcError('CONFLICT', 'pod-1 is mid-turn and cannot be forked');
    const store = await forkStore(async () => ({ ok: false, error }));
    const podsBefore = store.getState().pods;

    const result = await store.actions.forkPod(POD);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe(error);
    expect(store.getState().pods).toEqual(podsBefore);
    expect(store.getState().activePodId).toBe(POD);
    store.stop();
  });

  it('issues one pods.fork for two calls made while the first is still pending', async () => {
    const calls: string[] = [];
    let settle: (result: IpcResult<Pod>) => void = () => {};
    const store = await forkStore(
      (podId) =>
        new Promise<IpcResult<Pod>>((resolve) => {
          calls.push(podId);
          settle = resolve;
        }),
    );

    const first = store.actions.forkPod(POD);
    const second = store.actions.forkPod(POD);
    await flush();
    expect(calls).toEqual([POD]);

    settle({ ok: true, value: FORKED });
    // Both callers get the one fork's answer, and only one Pod was added.
    expect(await first).toEqual({ ok: true, value: FORKED });
    expect(await second).toEqual({ ok: true, value: FORKED });
    expect(calls).toEqual([POD]);
    expect(store.getState().pods.filter((pod) => pod.id === 'pod-1-fork')).toHaveLength(1);
    store.stop();
  });
});
