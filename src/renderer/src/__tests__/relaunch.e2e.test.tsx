// @vitest-environment jsdom
/**
 * THE RELAUNCH REGRESSION SUITE — the reproduction of the defect observed on
 * 2026-08-20, driven end to end.
 *
 * WHY THIS FILE TALKS TO THE REAL MAIN-SIDE CODE, WHICH NO OTHER SUITE IN THIS
 * DIRECTORY DOES. The defect is not a renderer bug and it is not a main bug; it
 * is a DISAGREEMENT between the two about what `status: 'idle'` means across a
 * process restart. A stub `pods.list` cannot reproduce a disagreement, because
 * the stub is written by the same hand as the assertion: seed the fixture with
 * `'closed'` and the renderer dutifully shows `Open`, having proved only that
 * the fixture was typed correctly. Worse, the stub's `pods.close` resolves
 * `{ ok: true }` unconditionally, so "close answers ok" is a tautology against
 * it — a review of T5 raised exactly that about
 * `pods/pod-lifecycle.test.tsx:105-148`, and this suite is where the
 * substantive version lives.
 *
 * So the world below is REAL on both sides of the boundary: a migrated
 * in-memory `EventStore`, a real `PodManager`, its real `reconcileStartup()`,
 * and a real `closePod` — wired to the renderer through the same `IpcResult`
 * envelopes and the same five push channels the preload bridge carries. The
 * only double is the `PodRunner`, which stands in for the Claude Code child
 * process: a boundary this suite genuinely cannot cross, and the one thing that
 * is never under test here.
 *
 * WHAT IS DELIBERATELY NOT FAKED: the Pod's status. Nothing in this file writes
 * `status: 'closed'` into a fixture. Every status the renderer sees was
 * computed by `PodManager` from the state a previous process left behind, which
 * is the whole claim the session makes.
 *
 * THE CLOCK. `vi.useFakeTimers({ toFake: ['Date'] })` fakes `Date` ONLY. That is
 * enough to make every timestamp deterministic — the store stamps `started_at`
 * from `new Date()`, the manager's injected `now` reads the same clock, and the
 * renderer's elapsed-time base is `Date.now()` — while leaving `setTimeout` and
 * `setInterval` real, so nothing here has to hand-pump React's scheduler or
 * Testing Library's `waitFor`. No test sleeps, waits on the wall clock, or
 * depends on the ambient time zone: every instant is a UTC literal.
 *
 * ISOLATION. Each test builds its own world and its own store; `afterEach`
 * unmounts, disposes every runner and drops the store. Nothing is shared across
 * tests but the constants.
 */

import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { EventStore } from '@shared/contracts/event-store';
import type { LaneId, Pod, PodId, PodStatus } from '@shared/contracts/events';
import type {
  IpcError,
  IpcResult,
  LaneChangedPush,
  PermissionRequestedPush,
  PermissionResolvedPush,
  PodEventPush,
  PodStatusPush,
  ReadEventsRequest,
} from '@shared/contracts/ipc';
import { EVENT_CHANNELS } from '@shared/contracts/ipc';
import type {
  PodRunner,
  PodRunnerOptions,
} from '@shared/contracts/pod-runner';

import { createPushes, PodManager, ROUTING_MODE } from '../../../../src/main/pod-manager';
import { openEventStore } from '../../../../src/main/store';

import { TEST_IDS } from '../contracts/renderer-view';
import { POD_TAB_DELETE_TEST_ID, POD_TAB_OPEN_TEST_ID, POD_TAB_STOP_TEST_ID } from '../pods/PodTab';
import { testId } from '../shell/contract-runtime';
import { stubOrcastrateApi, type StubOrcastrateApi } from '../test-utils';

import { installUnhandledRejectionGuard, mountWorkspace } from './harness';

installUnhandledRejectionGuard();

// ---------------------------------------------------------------------------
// The instants, and the two durations they produce
// ---------------------------------------------------------------------------

/** When the PREVIOUS process created the Pods and started their Matriarchs. */
const SEEDED_AT = '2026-08-20T11:55:00.000Z';
/** When this process boots and `reconcileStartup()` runs. Five minutes later. */
const BOOT_AT = '2026-08-20T12:00:00.000Z';
/**
 * When the renderer mounts: seventeen minutes after seeding, twelve after the
 * boot.
 *
 * SEVENTEEN RATHER THAN A ROUNDER NUMBER, on purpose. A live row would read
 * `15m 00s` at a fifteen-minute mount, and `'15m 00s'.includes('5m 00s')` is
 * TRUE — so a substring assertion could not tell the frozen row from the live
 * one. `22m 00s` shares no suffix with `5m 00s`, which makes the two genuinely
 * distinguishable by the assertions below.
 */
const MOUNT_AT = '2026-08-20T12:17:00.000Z';

/**
 * A lane the sweep orphaned reads `ended_at - started_at` and never moves.
 * SEEDED_AT -> BOOT_AT.
 */
const FROZEN_DURATION = '5m 00s';

/**
 * A lane that is genuinely still running reads `now - started_at`.
 * SEEDED_AT -> MOUNT_AT. The two are different on purpose, and neither is a
 * substring of the other: a build that failed to stamp `ended_at` would render
 * this value in the orphaned row too, so the pair is what makes "frozen"
 * falsifiable rather than merely stated.
 */
const LIVE_DURATION = '22m 00s';

// ---------------------------------------------------------------------------
// Copy this suite pins
// ---------------------------------------------------------------------------

/** `disabledReason: 'not-opened'`, verbatim. `wording.e2e.test.tsx` owns it. */
const NOT_OPENED_NOTE = 'This Pod is not running. Open it before sending a message.';

/**
 * `StartupReconciliationData.reason`, verbatim.
 *
 * Written out as a literal rather than imported from the producer, for the same
 * reason `transcript/startup-reconciliation.test.tsx` does: importing it would
 * make the assertion agree with whatever the sweep currently says instead of
 * with what the user is promised to read.
 */
const RECONCILIATION_REASON =
  'Orcastrate restarted while this Pod was still open. No Claude Code process ' +
  'survives an application restart, so lanes left running were marked ' +
  'Orphaned. Press Open to start this Pod again.';

// ---------------------------------------------------------------------------
// The runner double
// ---------------------------------------------------------------------------

/**
 * The Claude Code child process, and the ONLY double in this file.
 *
 * It does nothing on purpose. Every behaviour this suite asserts belongs to
 * `PodManager` and the renderer; a runner that emitted events would put a third
 * author in the fixture and make a failure ambiguous.
 */
function makeInertRunner(options: PodRunnerOptions): PodRunner {
  return {
    podId: options.podId,
    status: 'idle',
    async start(): Promise<void> {},
    async send(): Promise<void> {},
    async interrupt(): Promise<void> {},
    async setPermissionMode(): Promise<void> {},
    async stop(): Promise<void> {},
    async sendToAgent(): Promise<{ supported: boolean }> {
      return { supported: false };
    },
  };
}

// ---------------------------------------------------------------------------
// The world: real store, real manager, real envelopes, real pushes
// ---------------------------------------------------------------------------

/** Which invoke channels this suite counts, and with which Pod ids. */
interface RecordedCalls {
  podList: number;
  podOpen: PodId[];
  podClose: PodId[];
  podReconnect: PodId[];
}

interface RelaunchWorld {
  store: EventStore;
  manager: PodManager;
  api: StubOrcastrateApi;
  calls: RecordedCalls;
  /** Every warn/error the manager logged, so a test can assert on the sweep's log. */
  logged: string[];
  /** Make `pod:list` answer `{ ok: false }` from now on. */
  failList(error: IpcError): void;
  dispose(): Promise<void>;
}

/** Alive worlds, disposed after each test whether it passed or threw. */
const worlds: RelaunchWorld[] = [];

function toIpcError(err: unknown): IpcError {
  const code = (err as { code?: IpcError['code'] }).code;
  const message = err instanceof Error ? err.message : String(err);
  return { code: code ?? 'INTERNAL', message };
}

function makeWorld(): RelaunchWorld {
  const store = openEventStore(':memory:');
  store.migrate();

  const calls: RecordedCalls = { podList: 0, podOpen: [], podClose: [], podReconnect: [] };
  const logged: string[] = [];
  let listFailure: IpcError | null = null;

  // Assigned immediately below. The push transport reads it lazily because the
  // manager must exist before the api that carries its pushes.
  let api: StubOrcastrateApi | null = null;

  const manager = new PodManager({
    store,
    createRunner: makeInertRunner,
    push: createPushes((channel, payload) => {
      if (api === null) return;
      // The preload bridge's fan-out, reproduced by channel name so a renamed
      // channel breaks here rather than silently delivering nothing.
      if (channel === EVENT_CHANNELS.podStatus) api.emit.podStatus(payload as PodStatusPush);
      else if (channel === EVENT_CHANNELS.podEvent) api.emit.podEvent(payload as PodEventPush);
      else if (channel === EVENT_CHANNELS.laneChanged) {
        api.emit.laneChanged(payload as LaneChangedPush);
      } else if (channel === EVENT_CHANNELS.permissionRequested) {
        api.emit.permissionRequested(payload as PermissionRequestedPush);
      } else if (channel === EVENT_CHANNELS.permissionResolved) {
        api.emit.permissionResolved(payload as PermissionResolvedPush);
      }
    }),
    routingMode: ROUTING_MODE,
    newId: ((): (() => string) => {
      let n = 0;
      return () => `generated-${(n += 1)}`;
    })(),
    now: () => new Date().toISOString(),
    isDirectory: () => true,
    logger: {
      warn: (...args: unknown[]) => logged.push(args.map(String).join(' ')),
      error: (...args: unknown[]) => logged.push(args.map(String).join(' ')),
    },
  });

  async function invoke<T>(run: () => T | Promise<T>): Promise<IpcResult<T>> {
    try {
      return { ok: true, value: await run() };
    } catch (err) {
      return { ok: false, error: toIpcError(err) };
    }
  }

  api = stubOrcastrateApi({
    pods: {
      list: async () => {
        calls.podList += 1;
        if (listFailure !== null) return { ok: false, error: listFailure };
        return invoke(() => manager.listPods());
      },
      open: async (podId) => {
        calls.podOpen.push(podId);
        return invoke(() => manager.openPod(podId));
      },
      close: async (podId) => {
        calls.podClose.push(podId);
        return invoke(() => manager.closePod(podId));
      },
      reconnect: async (podId) => {
        calls.podReconnect.push(podId);
        return invoke(() => manager.reconnectPod(podId));
      },
      send: async (podId, text) => invoke(() => manager.send(podId, text)),
      interrupt: async (podId) => invoke(() => manager.interrupt(podId)),
    },
    lanes: {
      list: async (podId) => invoke(() => manager.listLanes(podId)),
    },
    events: {
      read: async (req: ReadEventsRequest) => invoke(() => manager.readEvents(req)),
    },
  });

  const world: RelaunchWorld = {
    store,
    manager,
    api,
    calls,
    logged,
    failList(error) {
      listFailure = error;
    },
    async dispose() {
      await manager.disposeAll();
      store.close();
    },
  };
  worlds.push(world);
  return world;
}

// ---------------------------------------------------------------------------
// Seeding: what a PREVIOUS process left behind
// ---------------------------------------------------------------------------

interface SeedOptions {
  id: PodId;
  title: string;
  tabOrder: number;
  /** The status the previous process persisted. */
  status: PodStatus;
  /** The Matriarch's status when the previous process died. */
  laneStatus: 'running' | 'done';
}

/**
 * Writes rows straight into the store, bypassing `PodManager` entirely, which
 * is the only honest way to express "this is what was on disk when the app
 * started". Returns the Matriarch's lane id, which is what the rail renders.
 */
function seedPreviousProcess(store: EventStore, options: SeedOptions): LaneId {
  store.createPod({
    id: options.id,
    title: options.title,
    // Opaque to everything here; `isDirectory` in the world answers true.
    cwd: '/stub/workspace',
    permissionMode: 'default',
    envOverrides: {},
    tabOrder: options.tabOrder,
  });
  if (options.status !== 'closed') {
    store.updatePod(options.id, { status: options.status, lastActiveAt: SEEDED_AT });
  }

  const laneId: LaneId = `${options.id}-matriarch`;
  // `createLane` always starts a lane `running` with `ended_at` NULL, stamped
  // from the (faked) clock — which is precisely the row the defect turns on.
  store.createLane({
    id: laneId,
    podId: options.id,
    kind: 'matriarch',
    toolUseId: null,
    agentId: null,
    parentLaneId: null,
    depth: 0,
    subagentType: null,
    description: null,
  });
  if (options.laneStatus !== 'running') store.setLaneStatus(laneId, options.laneStatus);
  return laneId;
}

/** Move the (faked) clock. Every instant in this suite is a UTC literal. */
function at(instant: string): void {
  vi.setSystemTime(new Date(instant));
}

// ---------------------------------------------------------------------------
// The scenario
// ---------------------------------------------------------------------------

const RELAUNCHED_ID: PodId = 'pod-relaunched';
const KEPT_ID: PodId = 'pod-kept';

interface Scenario {
  world: RelaunchWorld;
  /** The Pod the previous process left at `'idle'` with a running Matriarch. */
  relaunchedLaneId: LaneId;
  /** The Pod this process re-opened, so main really does hold a session. */
  keptLaneId: LaneId;
}

/**
 * THE EXACT SCENARIO OBSERVED ON 2026-08-20, plus the other direction beside
 * it in the SAME store.
 *
 * `pod-relaunched` is the defect: persisted `'idle'` with a Matriarch still
 * `running` and `ended_at` NULL, five minutes of `started_at` behind it, and no
 * process anywhere. `pod-kept` is the HMR/reload case: after the sweep, this
 * process really opens it, so `PodManager` genuinely holds a session and really
 * reports `'idle'`.
 *
 * BOTH PODS COME BACK FROM ONE `pods.list`. That is the point: `'idle'` appears
 * on neither Pod and on one of them respectively, from the same reply, so no
 * assertion below can be satisfied by a renderer that answers a constant about
 * every Pod.
 */
async function relaunchScenario(): Promise<Scenario> {
  at(SEEDED_AT);
  const world = makeWorld();
  const relaunchedLaneId = seedPreviousProcess(world.store, {
    id: RELAUNCHED_ID,
    title: 'Relaunched',
    tabOrder: 0,
    status: 'idle',
    laneStatus: 'running',
  });
  const keptLaneId = seedPreviousProcess(world.store, {
    id: KEPT_ID,
    title: 'Kept',
    tabOrder: 1,
    status: 'idle',
    laneStatus: 'running',
  });

  at(BOOT_AT);
  world.manager.reconcileStartup();
  // The other direction: this process opens one of them, exactly as a user
  // clicking Open — or an HMR reload of a live workspace — leaves things.
  await world.manager.openPod(KEPT_ID);

  at(MOUNT_AT);
  return { world, relaunchedLaneId, keptLaneId };
}

// ---------------------------------------------------------------------------
// Reading the screen
// ---------------------------------------------------------------------------

function podTab(podId: PodId): HTMLElement {
  return screen.getByTestId(testId(TEST_IDS.podTab, podId));
}

/** The RUN mode of the run/stop control, or null when the Pod has a process. */
function runControl(podId: PodId): HTMLElement | null {
  return screen.queryByTestId(testId(POD_TAB_OPEN_TEST_ID, podId));
}

/**
 * Which verb the run control currently offers, or null when it offers none.
 *
 * READ FROM `data-verb`, NOT FROM THE CONTROL'S TEXT. Both run verbs draw the
 * same PLAY glyph — the icon says "this will run" and nothing more — so the
 * verb lives in the attribute and in the accessible name. A `textContent`
 * assertion here would pin the decoration and drop the distinction the whole
 * fixture exists to make.
 */
function runVerb(podId: PodId): string | null {
  return runControl(podId)?.getAttribute('data-verb') ?? null;
}

/** The STOP mode of the same control. Present only while the Pod has a process. */
function stopControl(podId: PodId): HTMLElement | null {
  return screen.queryByTestId(testId(POD_TAB_STOP_TEST_ID, podId));
}

function laneRow(laneId: LaneId): HTMLElement {
  return screen.getByTestId(testId(TEST_IDS.laneRow, laneId));
}

/** Selects a Pod's tab and waits for its rail to be the one on screen. */
async function selectPod(
  user: ReturnType<typeof userEvent.setup>,
  podId: PodId,
  laneId: LaneId,
): Promise<void> {
  await user.click(podTab(podId));
  await waitFor(() => {
    expect(laneRow(laneId)).toBeDefined();
  });
}

/** The Pod row as `PodManager` currently holds it — the durable answer. */
function persisted(world: RelaunchWorld, podId: PodId): Pod {
  const pod = world.manager.listPods().find((candidate) => candidate.id === podId);
  if (pod === undefined) throw new Error(`no pod ${podId} in the store`);
  return pod;
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

beforeEach(() => {
  // `Date` only. `setTimeout` and `setInterval` stay real, so `waitFor`,
  // `userEvent` and React's scheduler need no pumping and nothing here sleeps.
  vi.useFakeTimers({ toFake: ['Date'] });
});

afterEach(async () => {
  // Unmount BEFORE the stores close, so no in-flight action reaches a closed
  // handle. Registered after the rejection guard, so it runs before it.
  cleanup();
  for (const world of worlds) await world.dispose();
  worlds.length = 0;
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// The reproduction
// ---------------------------------------------------------------------------

describe('relaunching over a Pod the previous process left open', () => {
  it('reads Orphaned, disables the composer with the pinned sentence, offers Open, and offers delete rather than a close that would refuse', async () => {
    const user = userEvent.setup();
    const { world, relaunchedLaneId } = await relaunchScenario();
    mountWorkspace(world.api);

    // Hydrated from ONE `pods.list`, and the leftmost tab is selected.
    await waitFor(() => {
      expect(podTab(RELAUNCHED_ID).getAttribute('aria-current')).toBe('true');
    });
    expect(world.calls.podList).toBe(1);

    // SYMPTOM 1 — the rail read `Running` with a duration ticking from the
    // original `started_at`. It now reads `Orphaned`, and the duration is the
    // one the sweep stamped rather than one still counting.
    await waitFor(() => {
      expect(laneRow(relaunchedLaneId).textContent).toContain('Orphaned');
    });
    const railText = laneRow(relaunchedLaneId).textContent ?? '';
    expect(railText).toContain(FROZEN_DURATION);
    expect(railText).not.toContain('Running');
    expect(railText).not.toContain(LIVE_DURATION);

    // SYMPTOM 2 — the composer is disabled with the sentence that names the way
    // out, and the way out is on screen.
    expect(screen.getByTestId('composer-disabled-note').textContent).toContain(NOT_OPENED_NOTE);
    expect(screen.getByTestId(TEST_IDS.composerSend).hasAttribute('disabled')).toBe(true);
    const control = runControl(RELAUNCHED_ID);
    expect(control).not.toBeNull();
    expect(control?.getAttribute('data-verb')).toBe('open');
    expect(control?.getAttribute('aria-label')).toBe('Open Relaunched');

    /*
     * SYMPTOM 3 — the tab's `x` refused with a not-running error, which was
     * the dead end the first run hit.
     *
     * IT IS GONE BY REMOVAL OF THE AFFORDANCE, NOT BY THE CALL ANSWERING OK.
     * The run/stop control has two mutually exclusive modes and a Pod with no
     * process is never in the stop one, so there is no control here that could
     * ask main to close a Pod that is already closed — `pods.close` is never
     * invoked at all. What stands beside the run control instead is the DELETE
     * control, whose confirmation is the only route to `deletePod`.
     *
     * The close path itself is still driven against the REAL
     * `PodManager.closePod` — from the Pod that genuinely has a session, in
     * "drops the live session and reveals the Open control" below. It is not
     * reachable from this Pod, and asserting it here would mean reaching past
     * the UI to a verb the UI no longer offers.
     */
    expect(stopControl(RELAUNCHED_ID)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Close Relaunched' })).toBeNull();
    const red = screen.getByTestId(testId(POD_TAB_DELETE_TEST_ID, RELAUNCHED_ID));
    expect(red.getAttribute('aria-label')).toBe('Delete Relaunched');
    expect(world.calls.podClose).toEqual([]);
    expect(screen.queryByRole('alert')).toBeNull();

    // ...and under Option 3 the seeded `'idle'` was itself part of the lie:
    // the sweep, not a close from the UI, is what wrote `'closed'`.
    expect(persisted(world, RELAUNCHED_ID).status).toBe('closed');
    // The Pod is still listed and still shows its way back in.
    expect(podTab(RELAUNCHED_ID)).toBeDefined();
    expect(runVerb(RELAUNCHED_ID)).toBe('open');
  });

  it('keeps the reconciled duration frozen while the Pod that kept its session goes on counting', async () => {
    const user = userEvent.setup();
    const { world, relaunchedLaneId, keptLaneId } = await relaunchScenario();
    mountWorkspace(world.api);

    await waitFor(() => {
      expect(laneRow(relaunchedLaneId).textContent).toContain(FROZEN_DURATION);
    });

    // The other Pod's Matriarch was revived by `openPod` and is genuinely
    // running, so its row counts to NOW from the same `started_at`. Two
    // different durations from one clock is what makes "frozen" falsifiable.
    await selectPod(user, KEPT_ID, keptLaneId);
    const keptText = laneRow(keptLaneId).textContent ?? '';
    expect(keptText).toContain('Running');
    expect(keptText).toContain(LIVE_DURATION);

    // Moving the clock an hour on does not move the reconciled row, because
    // `ended_at` is stamped and nothing recomputes it.
    at('2026-08-20T13:10:00.000Z');
    await selectPod(user, RELAUNCHED_ID, relaunchedLaneId);
    expect(laneRow(relaunchedLaneId).textContent).toContain(FROZEN_DURATION);
  });

  it('enables the composer and offers no run control for the Pod whose session survived, and never invokes pods.open', async () => {
    const user = userEvent.setup();
    const { world, keptLaneId } = await relaunchScenario();
    mountWorkspace(world.api);

    await waitFor(() => {
      expect(podTab(KEPT_ID)).toBeDefined();
    });

    // Main really does hold a session for this Pod, and really does report
    // `'idle'` for it — the state an HMR reload or a window refresh lands in.
    expect(persisted(world, KEPT_ID).status).toBe('idle');

    await selectPod(user, KEPT_ID, keptLaneId);

    // No note, no disabled send, no run control — and the composer accepts a
    // message that reaches IPC, which is the difference that matters.
    expect(screen.queryByTestId('composer-disabled-note')).toBeNull();
    expect(screen.queryByText(NOT_OPENED_NOTE)).toBeNull();
    expect(screen.getByTestId(TEST_IDS.composerSend).hasAttribute('disabled')).toBe(false);
    expect(runControl(KEPT_ID)).toBeNull();

    await user.type(screen.getByTestId(TEST_IDS.composerInput), 'still here');
    await waitFor(() => {
      expect(screen.getByTestId(TEST_IDS.composerSend).hasAttribute('disabled')).toBe(false);
    });

    // The other Pod in the same fixture answers the other way at the same
    // moment, so neither result can come from a constant.
    expect(runVerb(RELAUNCHED_ID)).toBe('open');

    // Nothing the renderer did opened this Pod. It was open when it arrived.
    expect(world.calls.podOpen).toEqual([]);
    expect(world.calls.podReconnect).toEqual([]);
  });

  it('drops the live session and reveals the Open control when the surviving Pod is closed from its tab', async () => {
    const user = userEvent.setup();
    const { world, keptLaneId } = await relaunchScenario();
    mountWorkspace(world.api);

    await waitFor(() => {
      expect(podTab(KEPT_ID)).toBeDefined();
    });
    await selectPod(user, KEPT_ID, keptLaneId);
    expect(runControl(KEPT_ID)).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Stop Kept' }));

    // A real close of a real session: the status push carries `'closed'`, the
    // composer disables and the run control appears — with no `pods.list`
    // between, so the push alone did it.
    await waitFor(() => {
      expect(runVerb(KEPT_ID)).toBe('open');
    });
    expect(screen.getByTestId('composer-disabled-note').textContent).toContain(NOT_OPENED_NOTE);
    expect(persisted(world, KEPT_ID).status).toBe('closed');
    expect(world.calls.podList).toBe(1);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('renders the reconciliation notice verbatim in the transcript of each Pod whose lanes the sweep touched, and logs the sweep once', async () => {
    const user = userEvent.setup();
    const { world, relaunchedLaneId, keptLaneId } = await relaunchScenario();
    mountWorkspace(world.api);

    await waitFor(() => {
      expect(laneRow(relaunchedLaneId)).toBeDefined();
    });
    await waitFor(() => {
      expect(screen.getByTestId(TEST_IDS.transcriptPrimary).textContent).toContain(
        RECONCILIATION_REASON,
      );
    });

    // BOTH Pods had a running Matriarch when the sweep ran, so both carry the
    // notice — including the one this process went on to re-open, whose lane
    // was revived afterwards. The notice records what the sweep DID, not what
    // the Pod is now; the case that must produce NO notice is a sweep with
    // nothing to reconcile, which the next describe asserts directly.
    await selectPod(user, KEPT_ID, keptLaneId);
    await waitFor(() => {
      expect(screen.getByTestId(TEST_IDS.transcriptPrimary).textContent).toContain(
        RECONCILIATION_REASON,
      );
    });

    // One log line for the whole sweep, naming both Pods — not one per Pod.
    expect(world.logged).toHaveLength(1);
    expect(world.logged[0]).toContain('startup reconciliation closed 2 Pod(s)');
    expect(world.logged[0]).toContain('orphaned 2 lane(s)');
  });
});

// ---------------------------------------------------------------------------
// The failure paths: the sweep with nothing to do, and the states it must not
// rewrite
// ---------------------------------------------------------------------------

describe('a startup sweep that finds nothing to reconcile', () => {
  it('changes no Pod, writes no notice, and still offers Open for the Pod at rest', async () => {
    at(SEEDED_AT);
    const world = makeWorld();
    const laneId = seedPreviousProcess(world.store, {
      id: RELAUNCHED_ID,
      title: 'At rest',
      tabOrder: 0,
      status: 'closed',
      laneStatus: 'done',
    });

    at(BOOT_AT);
    const result = world.manager.reconcileStartup();
    // Nothing to do: no Pod in the result, and no log line about a sweep.
    expect(result.pods).toEqual([]);
    expect(world.logged).toEqual([]);

    at(MOUNT_AT);
    mountWorkspace(world.api);

    await waitFor(() => {
      expect(laneRow(laneId).textContent).toContain('Done');
    });
    // No reconciliation notice anywhere on screen: a notice that fired on every
    // relaunch would carry no information.
    expect(screen.queryByText(RECONCILIATION_REASON)).toBeNull();
    expect(runVerb(RELAUNCHED_ID)).toBe('open');
    expect(screen.getByTestId('composer-disabled-note').textContent).toContain(NOT_OPENED_NOTE);
  });

  it('orphans the lane of a Pod already recorded closed without rewriting its status', async () => {
    at(SEEDED_AT);
    const world = makeWorld();
    const laneId = seedPreviousProcess(world.store, {
      id: RELAUNCHED_ID,
      title: 'Closed with a live lane',
      tabOrder: 0,
      // Already `'closed'` when the sweep runs, but with a lane the previous
      // process never finished: the lane needs reconciling, the status does not.
      status: 'closed',
      laneStatus: 'running',
    });

    at(BOOT_AT);
    const result = world.manager.reconcileStartup();
    expect(result.pods).toEqual([
      { podId: RELAUNCHED_ID, statusBefore: 'closed', statusAfter: 'closed', orphanedLaneIds: [laneId] },
    ]);

    at(MOUNT_AT);
    mountWorkspace(world.api);

    await waitFor(() => {
      expect(laneRow(laneId).textContent).toContain('Orphaned');
    });
    expect(laneRow(laneId).textContent).toContain(FROZEN_DURATION);
    expect(persisted(world, RELAUNCHED_ID).status).toBe('closed');
    expect(runVerb(RELAUNCHED_ID)).toBe('open');
  });

  it('leaves a Pod that was beached when the sweep ran beached, and offers Reconnect rather than Open', async () => {
    at(SEEDED_AT);
    const world = makeWorld();
    const laneId = seedPreviousProcess(world.store, {
      id: RELAUNCHED_ID,
      title: 'Beached',
      tabOrder: 0,
      status: 'beached',
      laneStatus: 'running',
    });

    at(BOOT_AT);
    const result = world.manager.reconcileStartup();
    expect(result.pods[0]?.statusAfter).toBe('beached');

    at(MOUNT_AT);
    mountWorkspace(world.api);

    await waitFor(() => {
      expect(laneRow(laneId).textContent).toContain('Orphaned');
    });
    // `'beached'` is a truthful not-open state WITH a recorded cause. Rewriting
    // it to `'closed'` would erase the cause and send the user to `Open`.
    expect(persisted(world, RELAUNCHED_ID).status).toBe('beached');
    expect(runVerb(RELAUNCHED_ID)).toBe('reconnect');
    expect(screen.getByTestId('composer-disabled-note').textContent).not.toContain(
      NOT_OPENED_NOTE,
    );
  });

  it('shows the pod list failure verbatim and offers no Pod tab when the first hydration fails outright', async () => {
    at(SEEDED_AT);
    const world = makeWorld();
    seedPreviousProcess(world.store, {
      id: RELAUNCHED_ID,
      title: 'Unreachable',
      tabOrder: 0,
      status: 'idle',
      laneStatus: 'running',
    });

    at(BOOT_AT);
    world.manager.reconcileStartup();
    world.failList({ code: 'IO', message: 'the Pod database could not be read' });

    at(MOUNT_AT);
    mountWorkspace(world.api);

    // Whatever main wrote, word for word — no wrapper sentence around it.
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('the Pod database could not be read');
    // The row exists in the store, but the renderer never received it, so it
    // must not invent a tab for it.
    expect(screen.queryByTestId(testId(TEST_IDS.podTab, RELAUNCHED_ID))).toBeNull();
    expect(runControl(RELAUNCHED_ID)).toBeNull();
    expect(world.calls.podOpen).toEqual([]);
  });
});
