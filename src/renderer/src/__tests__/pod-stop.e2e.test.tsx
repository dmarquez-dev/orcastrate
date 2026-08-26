// @vitest-environment jsdom
/**
 * THE STOP REGRESSION SUITE — the defect this session exists for, driven end
 * to end through the real main-side code.
 *
 * THE DEFECT, as reported: a user pressed Stop on a Pod tab. `closePod` wrote
 * `status: 'closed'` to the POD row and never ended the Matriarch LANE, so
 * `lane.ended_at` stayed NULL, `elapsedMsOf` fell back to `nowMs` for any lane
 * with a null `ended_at`, and the rail went on reading `Running` with a
 * duration counting upward on a Pod that had no process behind it.
 *
 * WHY THIS FILE TALKS TO THE REAL `PodManager`, WHICH ONLY `relaunch.e2e` else
 * does. The defect is a DISAGREEMENT between what main persisted and what the
 * renderer drew. A stub `pods.close` that resolves `{ ok: true }` and a stub
 * `lanes.list` that answers a hand-written fixture cannot reproduce a
 * disagreement, because both sides are written by the hand that writes the
 * assertion: seed `status: 'stopped'` into the fixture and the rail dutifully
 * says `Stopped`, having proved only that the fixture was typed correctly.
 *
 * So the world below is REAL on both sides of the boundary: a migrated
 * in-memory `EventStore`, a real `PodManager`, its real `openPod`, its real
 * `closePod` and the lane sweep inside it — wired to the renderer through the
 * same `IpcResult` envelopes and the same five push channels the preload
 * bridge carries. NOTHING in this file writes `'stopped'` into a fixture:
 * every lane status the renderer sees was computed by `PodManager` from a
 * click on the Pod tab's stop control.
 *
 * The ONE double is the `PodRunner`, standing in for the Claude Code child
 * process — a boundary this suite genuinely cannot cross, and the one thing
 * never under test here.
 *
 * THE CLOCK. `vi.useFakeTimers({ toFake: ['Date'] })` fakes `Date` ONLY, so
 * every timestamp is deterministic while `setTimeout`/`setInterval` stay real
 * and neither React's scheduler, `waitFor` nor `userEvent` needs pumping.
 * Nothing here sleeps, reads the wall clock, or depends on the ambient time
 * zone: every instant is a UTC literal.
 *
 * ISOLATION. Each test builds its own store and its own manager; `afterEach`
 * unmounts, disposes every runner and closes every store. Nothing is shared
 * across tests but the constants.
 */

import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { EventStore } from '@shared/contracts/event-store';
import type { Lane, LaneId, NormalizedEvent, PodId } from '@shared/contracts/events';
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
import type { PodRunner, PodRunnerOptions } from '@shared/contracts/pod-runner';

import { createPushes, PodManager, ROUTING_MODE } from '../../../../src/main/pod-manager';
import { openEventStore } from '../../../../src/main/store';

import { TEST_IDS, TRANSCRIPT_FILTER_TEST_IDS } from '../contracts/renderer-view';
import { LANE_STATUS_LABEL } from '../lanes/lane-status';
import { POD_TAB_DELETE_TEST_ID, POD_TAB_OPEN_TEST_ID, POD_TAB_STOP_TEST_ID } from '../pods/PodTab';
import { testId } from '../shell/contract-runtime';
import { PLUMBING_EVENT_TYPES } from '../transcript/transcript-filter';
import { stubOrcastrateApi, type StubOrcastrateApi } from '../test-utils';

import { installUnhandledRejectionGuard, mountWorkspace } from './harness';

installUnhandledRejectionGuard();

// ---------------------------------------------------------------------------
// The instants, and the two durations they produce
// ---------------------------------------------------------------------------

/** When both Pods are created and opened, so both Matriarchs start here. */
const OPENED_AT = '2026-08-25T09:00:00.000Z';
/** When the user presses Stop. Ninety seconds of work later. */
const STOPPED_AT = '2026-08-25T09:01:30.000Z';
/** First advance after the stop. */
const ADVANCE_ONE = '2026-08-25T09:03:00.000Z';
/** Second advance. Once is a coincidence; the row has to stay put twice. */
const ADVANCE_TWO = '2026-08-25T09:24:00.000Z';

/**
 * `ended_at - started_at` for the swept Matriarch. OPENED_AT -> STOPPED_AT.
 */
const FROZEN_DURATION = '1m 30s';

/**
 * What a STILL-RUNNING lane started at OPENED_AT reads at ADVANCE_TWO, and the
 * control that proves the app's clock genuinely moved.
 *
 * "The number did not change" is satisfied perfectly by a clock that never
 * ticked, so a second Pod is left open in the same fixture and its Matriarch
 * is read at the same moments. Neither string is a substring of the other, on
 * purpose: a build that failed to stamp `ended_at` would render `24m 00s` in
 * the stopped row too, and `'24m 00s'.includes('1m 30s')` is FALSE, so the
 * pair is what makes "frozen" falsifiable rather than merely stated.
 */
const LIVE_DURATION_AT_ADVANCE_TWO = '24m 00s';
/** The same running lane at ADVANCE_ONE. */
const LIVE_DURATION_AT_ADVANCE_ONE = '3m 00s';

// ---------------------------------------------------------------------------
// The runner double
// ---------------------------------------------------------------------------

/**
 * The Claude Code child process, and the ONLY double in this file.
 *
 * Inert on purpose: every behaviour asserted below belongs to `PodManager` and
 * the renderer, and a runner that emitted events would put a third author into
 * the fixture and make a failure ambiguous.
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

interface RecordedCalls {
  podList: number;
  podClose: PodId[];
  podOpen: PodId[];
  /**
   * How many times the renderer asked main to RE-READ the transcript.
   *
   * Counted because a `lane_closed` row appearing on screen after a stop has
   * two possible causes, and only one of them is the behaviour this suite
   * exists to protect: the event was PUSHED to a live window, or the renderer
   * happened to re-read the store and found it already durable. The second is
   * what the defect looked like in production — the row showed up on the next
   * re-read, which for a user who never switched Pods was never. Holding this
   * number still across the click is what tells the two apart.
   */
  eventsRead: number;
}

interface StopWorld {
  store: EventStore;
  manager: PodManager;
  api: StubOrcastrateApi;
  calls: RecordedCalls;
  dispose(): Promise<void>;
}

/** Alive worlds, disposed after each test whether it passed or threw. */
const worlds: StopWorld[] = [];

function toIpcError(err: unknown): IpcError {
  const code = (err as { code?: IpcError['code'] }).code;
  const message = err instanceof Error ? err.message : String(err);
  return { code: code ?? 'INTERNAL', message };
}

function makeWorld(): StopWorld {
  const store = openEventStore(':memory:');
  store.migrate();

  const calls: RecordedCalls = { podList: 0, podClose: [], podOpen: [], eventsRead: 0 };

  // Assigned immediately below. The push transport reads it lazily because the
  // manager must exist before the api that carries its pushes.
  let api: StubOrcastrateApi | null = null;

  const manager = new PodManager({
    store,
    createRunner: makeInertRunner,
    push: createPushes((channel, payload) => {
      if (api === null) return;
      // The preload bridge's fan-out, reproduced BY CHANNEL NAME so a renamed
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
    logger: { warn: () => {}, error: () => {} },
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
      reconnect: async (podId) => invoke(() => manager.reconnectPod(podId)),
      send: async (podId, text) => invoke(() => manager.send(podId, text)),
      interrupt: async (podId) => invoke(() => manager.interrupt(podId)),
    },
    lanes: {
      list: async (podId) => invoke(() => manager.listLanes(podId)),
    },
    events: {
      read: async (req: ReadEventsRequest) => {
        calls.eventsRead += 1;
        return invoke(() => manager.readEvents(req));
      },
    },
  });

  const world: StopWorld = {
    store,
    manager,
    api,
    calls,
    async dispose() {
      await manager.disposeAll();
      store.close();
    },
  };
  worlds.push(world);
  return world;
}

// ---------------------------------------------------------------------------
// The scenario
// ---------------------------------------------------------------------------

const STOPPED_POD: PodId = 'pod-stopped';
const KEPT_POD: PodId = 'pod-kept';

interface Scenario {
  world: StopWorld;
  /** The Matriarch of the Pod the test will stop from its tab. */
  stoppedLaneId: LaneId;
  /** The Matriarch of the Pod left open, whose duration must keep moving. */
  keptLaneId: LaneId;
}

/** Move the (faked) clock. Every instant in this suite is a UTC literal. */
function at(instant: string): void {
  vi.setSystemTime(new Date(instant));
}

function matriarchOf(world: StopWorld, podId: PodId): LaneId {
  const lanes = world.manager.listLanes(podId);
  // VACUITY GUARD. `find` on an empty list yields `undefined`, and a scenario
  // that opened no lane at all would otherwise sail into the assertions below
  // and fail somewhere far from the cause.
  expect(lanes.length, `pod ${podId} produced no lanes`).toBeGreaterThan(0);
  const matriarch = lanes.find((lane) => lane.kind === 'matriarch');
  if (matriarch === undefined) throw new Error(`pod ${podId} has no matriarch lane`);
  expect(matriarch.status).toBe('running');
  expect(matriarch.endedAt).toBeNull();
  return matriarch.id;
}

/**
 * TWO PODS, BOTH GENUINELY OPENED BY THE REAL MANAGER AT THE SAME INSTANT.
 *
 * One of them is stopped from the UI; the other is not touched. Both answer
 * from the SAME `pods.list` and the SAME clock, so no assertion below can be
 * satisfied by a renderer that answers a constant about every Pod, and the
 * untouched Pod is the live control the frozen duration is measured against.
 */
async function stopScenario(): Promise<Scenario> {
  at(OPENED_AT);
  const world = makeWorld();

  world.manager.createPod({
    title: 'Stopped',
    cwd: '/stub/workspace',
    permissionMode: 'default',
  });
  world.manager.createPod({
    title: 'Kept',
    cwd: '/stub/workspace',
    permissionMode: 'default',
  });

  // The ids the store minted, in creation order — which is `tabOrder` order.
  const pods = world.manager.listPods();
  expect(pods.length, 'the fixture created no Pods').toBeGreaterThan(0);
  expect(pods.map((pod) => pod.title)).toEqual(['Stopped', 'Kept']);

  // `createPod` mints its own ids, so the constants above are aliases the
  // tests read by; rename the rows onto them for legibility of the assertions.
  const [first, second] = pods;
  if (first === undefined || second === undefined) throw new Error('missing seeded Pods');

  await world.manager.openPod(first.id);
  await world.manager.openPod(second.id);

  return {
    world,
    stoppedLaneId: matriarchOf(world, first.id),
    keptLaneId: matriarchOf(world, second.id),
  };
}

/** The two Pod ids the current scenario minted, in tab order. */
function podIds(world: StopWorld): [PodId, PodId] {
  const pods = world.manager.listPods();
  const [first, second] = pods;
  if (first === undefined || second === undefined) throw new Error('missing seeded Pods');
  return [first.id, second.id];
}

// ---------------------------------------------------------------------------
// Reading the screen
// ---------------------------------------------------------------------------

function podTab(podId: PodId): HTMLElement {
  return screen.getByTestId(testId(TEST_IDS.podTab, podId));
}

function laneRow(laneId: LaneId): HTMLElement {
  return screen.getByTestId(testId(TEST_IDS.laneRow, laneId));
}

/** The RUN mode of the run/stop control, or null while the Pod has a process. */
function runControl(podId: PodId): HTMLElement | null {
  return screen.queryByTestId(testId(POD_TAB_OPEN_TEST_ID, podId));
}

/** The STOP mode of the same control. Present only while the Pod has a process. */
function stopControl(podId: PodId): HTMLElement | null {
  return screen.queryByTestId(testId(POD_TAB_STOP_TEST_ID, podId));
}

/**
 * The elapsed reading ALONE — `Elapsed 1m 30s` — never the whole row.
 *
 * The row's full text also carries the status word and the unread count, and a
 * criterion about a DURATION not moving must not be satisfiable by the rest of
 * the row holding still while the number underneath it changes.
 */
function elapsedText(laneId: LaneId): string {
  const label = within(laneRow(laneId)).getByText('Elapsed');
  const holder = label.parentElement;
  if (holder === null) throw new Error(`no elapsed holder for ${laneId}`);
  const text = holder.textContent ?? '';
  // VACUITY GUARD. An empty string is byte-identical to another empty string,
  // so "the duration did not change" would hold trivially for a row that
  // rendered no duration at all.
  expect(text.length, `lane ${laneId} rendered no elapsed text`).toBeGreaterThan(0);
  return text;
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

/** The primary transcript pane — the one the user reads without splitting. */
async function primaryTranscript(): Promise<HTMLElement> {
  return screen.findByTestId(TEST_IDS.transcriptPrimary);
}

/** The primary pane's filter toggle, whose `data-mode` is the view on screen. */
function primaryFilterToggle(): HTMLElement {
  return screen.getByTestId(testId(TRANSCRIPT_FILTER_TEST_IDS.transcriptFilter, 'primary'));
}

/** Every rendered transcript row inside a pane, in render order. */
function transcriptRows(pane: HTMLElement): HTMLElement[] {
  return within(pane).queryAllByTestId(/^transcript-event:/);
}

/**
 * The rows reading `Lane closed`, whatever status they carry.
 *
 * Both halves of the text are checked at the call sites rather than here: a
 * helper that looked for `Stopped` too could not express "no lane-closed row of
 * ANY kind is on screen", which is the before-the-click half of the proof.
 */
function laneClosedRows(pane: HTMLElement): HTMLElement[] {
  return transcriptRows(pane).filter((row) => (row.textContent ?? '').includes('Lane closed'));
}

/** Every lane the store holds for a Pod, straight from the durable side. */
function persistedLanes(world: StopWorld, podId: PodId): Lane[] {
  const lanes = world.manager.listLanes(podId);
  expect(lanes.length, `pod ${podId} has no persisted lanes`).toBeGreaterThan(0);
  return lanes;
}

/** Every event the store holds for a Pod. */
function persistedEvents(world: StopWorld, podId: PodId): NormalizedEvent[] {
  const { events } = world.manager.readEvents({ podId });
  return events;
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

describe('stopping a running Pod from its tab', () => {
  it('turns the Matriarch row from Running to Stopped and freezes its duration across two advances of the clock', async () => {
    const user = userEvent.setup();
    const { world, stoppedLaneId, keptLaneId } = await stopScenario();
    const [stoppedPod, keptPod] = podIds(world);
    mountWorkspace(world.api);

    await waitFor(() => {
      expect(podTab(stoppedPod).getAttribute('aria-current')).toBe('true');
    });
    expect(world.calls.podList).toBe(1);

    // BEFORE THE STOP the row really does read Running. Without this the test
    // could not tell "the fix works" from "the row never said Running".
    await waitFor(() => {
      expect(laneRow(stoppedLaneId).textContent).toContain(LANE_STATUS_LABEL.running);
    });
    expect(stopControl(stoppedPod)).not.toBeNull();

    // THE GESTURE. A click on the tab's stop control, which is the only route
    // to `pods.close` the UI offers.
    at(STOPPED_AT);
    await user.click(screen.getByRole('button', { name: 'Stop Stopped' }));

    // SYMPTOM 1, GONE — the rail read `Running` on a Pod with no process. It
    // now reads `Stopped`, pushed by `laneChanged` with no `pods.list` between.
    await waitFor(() => {
      expect(laneRow(stoppedLaneId).textContent).toContain(LANE_STATUS_LABEL.stopped);
    });
    expect(laneRow(stoppedLaneId).textContent).not.toContain(LANE_STATUS_LABEL.running);
    expect(world.calls.podList).toBe(1);
    expect(world.calls.podClose).toEqual([stoppedPod]);

    // SYMPTOM 2, GONE — the duration was `now - started_at` and climbed for
    // ever. It is now `ended_at - started_at` and does not move.
    const frozen = elapsedText(stoppedLaneId);
    expect(frozen).toContain(FROZEN_DURATION);

    // ADVANCE ONE. The control lane proves the app's clock actually moved;
    // without it "the number did not change" is satisfied by a dead clock.
    at(ADVANCE_ONE);
    await selectPod(user, keptPod, keptLaneId);
    await waitFor(
      () => {
        expect(elapsedText(keptLaneId)).toContain(LIVE_DURATION_AT_ADVANCE_ONE);
      },
      { timeout: 4000 },
    );
    await selectPod(user, stoppedPod, stoppedLaneId);
    expect(elapsedText(stoppedLaneId)).toBe(frozen);

    // ADVANCE TWO. Once is a coincidence.
    at(ADVANCE_TWO);
    await selectPod(user, keptPod, keptLaneId);
    await waitFor(
      () => {
        expect(elapsedText(keptLaneId)).toContain(LIVE_DURATION_AT_ADVANCE_TWO);
      },
      { timeout: 4000 },
    );
    // And the still-running control still says Running, at the same moment the
    // stopped one says Stopped — so neither word can be a constant.
    expect(laneRow(keptLaneId).textContent).toContain(LANE_STATUS_LABEL.running);

    await selectPod(user, stoppedPod, stoppedLaneId);
    expect(elapsedText(stoppedLaneId)).toBe(frozen);
    expect(elapsedText(stoppedLaneId)).not.toContain(LIVE_DURATION_AT_ADVANCE_TWO);
    // The word did not drift either.
    expect(within(laneRow(stoppedLaneId)).getByText(LANE_STATUS_LABEL.stopped)).toBeDefined();

    // And the durable side agrees with the screen: this is not a render-only
    // freeze that a reload would undo.
    const lanes = persistedLanes(world, stoppedPod);
    const matriarch = lanes.find((lane) => lane.id === stoppedLaneId);
    expect(matriarch?.status).toBe('stopped');
    expect(matriarch?.endedAt).toBe(STOPPED_AT);
  });

  it('offers Open and Delete on the stopped tab, and no longer offers Stop', async () => {
    const user = userEvent.setup();
    const { world, stoppedLaneId } = await stopScenario();
    const [stoppedPod] = podIds(world);
    mountWorkspace(world.api);

    await waitFor(() => {
      expect(laneRow(stoppedLaneId)).toBeDefined();
    });

    at(STOPPED_AT);
    await user.click(screen.getByRole('button', { name: 'Stop Stopped' }));

    // The run/stop control has two mutually exclusive modes, and a Pod with no
    // process is never in the stop one.
    await waitFor(() => {
      expect(runControl(stoppedPod)?.getAttribute('data-verb')).toBe('open');
    });
    expect(runControl(stoppedPod)?.getAttribute('aria-label')).toBe('Open Stopped');
    expect(stopControl(stoppedPod)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Stop Stopped' })).toBeNull();

    // Delete stands beside it, and its confirmation is the only route to
    // `deletePod`.
    const del = screen.getByTestId(testId(POD_TAB_DELETE_TEST_ID, stoppedPod));
    expect(del.getAttribute('aria-label')).toBe('Delete Stopped');

    // Nothing failed on the way: no alert, and the Pod is still listed.
    expect(screen.queryByRole('alert')).toBeNull();
    expect(podTab(stoppedPod)).toBeDefined();
  });

  it('records the stop durably as one lane_closed event per swept lane, reading Stopped through LANE_STATUS_LABEL', async () => {
    const user = userEvent.setup();
    const { world, stoppedLaneId } = await stopScenario();
    const [stoppedPod, keptPod] = podIds(world);
    mountWorkspace(world.api);

    await waitFor(() => {
      expect(laneRow(stoppedLaneId)).toBeDefined();
    });

    const before = persistedEvents(world, stoppedPod).filter(
      (event) => event.type === 'lane_closed',
    );
    expect(before).toEqual([]);

    at(STOPPED_AT);
    await user.click(screen.getByRole('button', { name: 'Stop Stopped' }));
    await waitFor(() => {
      expect(laneRow(stoppedLaneId).textContent).toContain(LANE_STATUS_LABEL.stopped);
    });

    const closed = persistedEvents(world, stoppedPod).filter(
      (event) => event.type === 'lane_closed',
    );
    // VACUITY GUARD, before any equality assertion. A `toEqual` over an empty
    // array is satisfied by a fixture that produced nothing at all — the exact
    // shape of the vacuous assertion this repository shipped in
    // `tests/unit/ipc/user-prompt.test.ts` one session ago.
    expect(closed.length, 'the stop appended no lane_closed event').toBeGreaterThan(0);
    expect(closed).toHaveLength(1);
    expect(closed[0]?.laneId).toBe(stoppedLaneId);
    expect(closed[0]?.payload).toEqual({
      type: 'lane_closed',
      laneId: stoppedLaneId,
      status: 'stopped',
    });
    expect(closed[0]?.createdAt).toBe(STOPPED_AT);

    // THE WORD the user would read for that event is the rail's word, from the
    // one map: `LANE_STATUS_LABEL`, which `TranscriptEventItem` renders for a
    // `lane_closed` payload. Pinned against the payload the sweep actually
    // wrote rather than against a literal typed here.
    const status = closed[0]?.payload;
    if (status === undefined || status.type !== 'lane_closed') {
      throw new Error('the appended event is not a lane_closed payload');
    }
    expect(LANE_STATUS_LABEL[status.status]).toBe('Stopped');

    // THE OTHER POD WAS NOT SWEPT. One gesture, one Pod: a sweep that ended
    // every lane in the store would satisfy every assertion above.
    expect(persistedEvents(world, keptPod).filter((e) => e.type === 'lane_closed')).toEqual([]);
    expect(persistedLanes(world, keptPod).every((lane) => lane.status === 'running')).toBe(true);
  });

  it('sweeps only lanes still running, so a second stop restamps no duration and appends no second event', async () => {
    const user = userEvent.setup();
    const { world, stoppedLaneId } = await stopScenario();
    const [stoppedPod] = podIds(world);
    mountWorkspace(world.api);

    await waitFor(() => {
      expect(laneRow(stoppedLaneId)).toBeDefined();
    });

    at(STOPPED_AT);
    await user.click(screen.getByRole('button', { name: 'Stop Stopped' }));
    await waitFor(() => {
      expect(laneRow(stoppedLaneId).textContent).toContain(LANE_STATUS_LABEL.stopped);
    });
    const frozen = elapsedText(stoppedLaneId);

    // A second close, from a clock twenty minutes on. The UI no longer offers
    // Stop here, which is why this one goes through the same IPC surface the
    // control uses rather than through the control: the guarantee is about the
    // CHANNEL being idempotent, not about the button being hidden.
    at(ADVANCE_TWO);
    const second = await world.api.pods.close(stoppedPod);
    expect(second.ok).toBe(true);

    const closed = persistedEvents(world, stoppedPod).filter((e) => e.type === 'lane_closed');
    expect(closed.length, 'the first stop appended no lane_closed event').toBeGreaterThan(0);
    expect(closed).toHaveLength(1);

    const matriarch = persistedLanes(world, stoppedPod).find((lane) => lane.id === stoppedLaneId);
    // The `ended_at` the FIRST stop stamped. A restamp would move the duration
    // forward and tell the user the work ended twenty minutes later than it did.
    expect(matriarch?.endedAt).toBe(STOPPED_AT);
    expect(elapsedText(stoppedLaneId)).toBe(frozen);
    expect(frozen).toContain(FROZEN_DURATION);
  });
});

// ---------------------------------------------------------------------------
// The filter, unmoved
// ---------------------------------------------------------------------------

describe('the transcript filter this session did not touch', () => {
  it('still hides thinking by default, as a member of PLUMBING_EVENT_TYPES', () => {
    // T7 acceptance criterion 4. The liveness finding was NOT fixed by
    // unhiding `thinking`: that reintroduces exactly the noise the filter
    // exists to remove, and thinking blocks are long. Asserted here so a later
    // change to the set breaks a test rather than a user's transcript.
    expect(PLUMBING_EVENT_TYPES.length).toBeGreaterThan(0);
    expect(PLUMBING_EVENT_TYPES).toContain('thinking');
  });

  it('renders the always-present filter toggle in the default conversation mode', async () => {
    const { world, stoppedLaneId } = await stopScenario();
    mountWorkspace(world.api);

    await waitFor(() => {
      expect(laneRow(stoppedLaneId)).toBeDefined();
    });

    const toggle = await screen.findByTestId(
      testId(TRANSCRIPT_FILTER_TEST_IDS.transcriptFilter, 'primary'),
    );
    // `DEFAULT_TRANSCRIPT_FILTER` is `'conversation'`, and the toggle is never
    // disabled and never absent.
    expect(toggle.getAttribute('data-mode')).toBe('conversation');
    expect(toggle.hasAttribute('disabled')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The joined proof
// ---------------------------------------------------------------------------

/**
 * THE ONE TEST THAT SPANS BOTH HALVES OF THE 2026-08-26 DEFECT.
 *
 * Pressing Stop left the transcript empty for two independent reasons, and
 * neither half's own suite can see the other:
 *
 *   - MAIN never published the write. `#stopRunningLanes` appended the
 *     `lane_closed` rows and pushed only `laneChanged`, so the events were
 *     durable in SQLite and never reached a live window.
 *   - THE RENDERER would have dropped them anyway. `lane_closed` is a member of
 *     `PLUMBING`, and `'conversation'` — the DEFAULT mode — hides it.
 *
 * A unit test on either side goes green with the other side still broken, and
 * the user still sees nothing. This test is the only place the whole path is
 * exercised: real sweep -> real push -> real filter -> words on screen.
 *
 * The two properties that make it a proof rather than a demonstration are the
 * DEFAULT VIEW (the filter toggle is never clicked, and `data-mode` is asserted
 * still `'conversation'` when the words are read) and the PUSH (the `events.read`
 * count is held still across the click, so a re-read cannot be what produced the
 * row). Drop either and the test would pass on the broken build.
 */
describe('the stop notice in the default transcript', () => {
  it('shows a Lane closed / Stopped row in conversation mode after the stop click, with no transcript re-read', async () => {
    const user = userEvent.setup();
    const { world, stoppedLaneId, keptLaneId } = await stopScenario();
    const [stoppedPod, keptPod] = podIds(world);
    mountWorkspace(world.api);

    await waitFor(() => {
      expect(laneRow(stoppedLaneId)).toBeDefined();
    });
    const primary = await primaryTranscript();

    // THE DEFAULT VIEW, established before anything happens. Nothing in this
    // test ever clicks the toggle, and this is the mode it stays in.
    expect(primaryFilterToggle().getAttribute('data-mode')).toBe('conversation');

    // NOT VACUOUS, DIRECTION ONE. If a lane-closed row were already on screen,
    // every assertion below would hold on a build that did nothing at all.
    await waitFor(() => {
      expect(world.calls.eventsRead, 'the renderer never backfilled the transcript').toBeGreaterThan(
        0,
      );
    });
    expect(laneClosedRows(primary)).toEqual([]);

    // The baseline the push is measured against. Captured immediately before
    // the gesture, so any read the click provoked would move it.
    const readsBeforeClick = world.calls.eventsRead;

    // THE GESTURE, by ACCESSIBLE NAME — the same string a screen-reader user
    // would hear, not a test id the UI could rename out from under them.
    at(STOPPED_AT);
    await user.click(screen.getByRole('button', { name: 'Stop Stopped' }));

    // THE OUTCOME THE SESSION EXISTS FOR: words, in the default transcript.
    // Nothing in this file wrote `'stopped'` anywhere — the status in this row
    // was computed by the real `PodManager` from the click above.
    await waitFor(() => {
      const rows = laneClosedRows(primary);
      expect(rows.length, 'the stop put no Lane closed row in the primary transcript').toBe(1);
      expect(rows[0]?.textContent ?? '').toContain('Stopped');
    });

    // AT THE MOMENT THE ROW IS FOUND, and synchronously with it, the two
    // properties that make the row mean what the test says it means.
    const row = laneClosedRows(primary)[0];
    expect(row?.textContent ?? '').toContain('Lane closed');
    expect(row?.textContent ?? '').toContain(LANE_STATUS_LABEL.stopped);
    // Still the default view: no toggle was clicked, and a proof that only held
    // in `'everything'` mode would not be a proof of the user's outcome.
    expect(primaryFilterToggle().getAttribute('data-mode')).toBe('conversation');
    // And it arrived by PUSH. Not one re-read happened between the click and
    // the row, so the durable-but-invisible failure mode cannot explain it.
    expect(world.calls.eventsRead, 'the row appeared via a re-read, not the push').toBe(
      readsBeforeClick,
    );

    // NOT VACUOUS, DIRECTION TWO. One gesture closed one Pod's lanes. A sweep
    // that ended every lane in the store would satisfy everything above.
    expect(persistedEvents(world, keptPod).filter((e) => e.type === 'lane_closed')).toEqual([]);
    await selectPod(user, keptPod, keptLaneId);
    const keptPrimary = await primaryTranscript();
    await waitFor(() => {
      expect(laneRow(keptLaneId).textContent).toContain(LANE_STATUS_LABEL.running);
    });
    expect(laneClosedRows(keptPrimary)).toEqual([]);

    // The Pod that WAS stopped still reads the notice when the user comes back
    // to it, so the row is part of the transcript and not a transient flash.
    await selectPod(user, stoppedPod, stoppedLaneId);
    const backAgain = await primaryTranscript();
    await waitFor(() => {
      expect(laneClosedRows(backAgain).length).toBe(1);
    });
  });
});
