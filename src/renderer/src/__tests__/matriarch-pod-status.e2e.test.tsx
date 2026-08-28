// @vitest-environment jsdom
/**
 * THE JOINED SUITE — the rail and the Pod tab agree about whether Claude Code
 * is working right now.
 *
 * THE DEFECT, as a user met it: the Matriarch row's dot pulsed continuously and
 * never rested while Claude Code sat idle. Two unions spell one word
 * differently. `PodStatus.running` is an ACTIVITY flag — `pod-runner.ts:426`
 * sets it when a turn starts and `:272` clears it when the turn ends.
 * `LaneStatus.running` is a LIFETIME flag the database enforces:
 * `store/schema.ts:355` declares `CHECK ((status = 'running') = (ended_at IS
 * NULL))`, so the Matriarch's lane reads `running` for the Pod's whole life. A
 * row keyed off the lifetime flag can never rest.
 *
 * WHY BOTH SURFACES ARE READ FROM ONE TREE, IN ONE ASSERTION. AGREEMENT is the
 * thing under test, and two separate renders cannot show it: a rail asserted in
 * one mount and a Pod tab asserted in another would both pass while the two
 * disagreed on screen, which is precisely the state the user reported. So every
 * status assertion below goes through `agreementOn`, which reads the rail row
 * and the Pod tab out of the SAME rendered document and returns them as one
 * object compared in one `toEqual`.
 *
 * THE SURFACE THIS DRIVES. The stub IPC bridge and nothing else — `pods.list`,
 * `lanes.list`, and the `podStatus` / `laneChanged` pushes. Nothing here calls
 * `deriveLaneRail`, renders `LaneRow` in isolation, or reads a component's
 * internals. The sibling `pod-stop.e2e.test.tsx` covers the same shape of
 * joined, push-driven assertion against the REAL `PodManager`; that file's
 * subject is what main persists, and this file's subject is a status main
 * pushes, which no fixture on the durable side can produce.
 *
 * THE CLOCK. `vi.useFakeTimers({ toFake: ['Date'] })` fakes `Date` ONLY, so
 * every instant below is a UTC literal and `setTimeout` / `setInterval` stay
 * real — React's scheduler and `waitFor` need no pumping and nothing here
 * sleeps. Every wait is on a CONDITION with a timeout. No test reads the wall
 * clock, the ambient time zone, the network or a port.
 *
 * ISOLATION. Each test builds its own stub API, its own Pod and its own lanes,
 * and `afterEach` unmounts. Nothing is shared across tests but the constants,
 * so the cases pass in any order.
 */

import { act, cleanup, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Lane, LaneId, LaneStatus, Pod, PodId, PodStatus } from '@shared/contracts/events';

import { TEST_IDS } from '../contracts/renderer-view';
import { LANE_STATUS_LABEL } from '../lanes/lane-status';
import { POD_STATUS_LABEL } from '../pods/pod-status';
import { testId } from '../shell/contract-runtime';
import { makeStubLane, makeStubPod, stubOrcastrateApi, type StubOrcastrateApi } from '../test-utils';

import { installUnhandledRejectionGuard, mountWorkspace } from './harness';

installUnhandledRejectionGuard();

// ---------------------------------------------------------------------------
// The instants, and the durations they produce
// ---------------------------------------------------------------------------

/** When the Pod is opened, so both the Matriarch and the Calf start here. */
const OPENED_AT = '2026-08-27T09:00:00.000Z';
/** When the Matriarch's lane ends, in the terminal cases. */
const ENDED_AT = '2026-08-27T09:01:30.000Z';
/** First advance after the lane ended. */
const ADVANCE_ONE = '2026-08-27T09:03:00.000Z';
/** Second advance. Once is a coincidence; the row has to stay put twice. */
const ADVANCE_TWO = '2026-08-27T09:24:00.000Z';

/** `ended_at - started_at` for the terminal Matriarch. */
const FROZEN_DURATION = '1m 30s';

/**
 * What the still-running Calf reads at each advance, and the control that
 * proves the app's clock genuinely moved.
 *
 * "The number did not change" is satisfied perfectly by a clock that never
 * ticked, so a running Calf is left in the same fixture and read at the same
 * moments. Neither string is a substring of the frozen one, on purpose.
 */
const LIVE_DURATION_AT_ADVANCE_ONE = '3m 00s';
const LIVE_DURATION_AT_ADVANCE_TWO = '24m 00s';

/** The five `PodStatus` values, and the three terminal `LaneStatus` values. */
const POD_STATUSES: readonly PodStatus[] = ['idle', 'running', 'waiting', 'beached', 'closed'];
const TERMINAL_LANE_STATUSES: readonly LaneStatus[] = ['stopped', 'done', 'orphaned'];

// ---------------------------------------------------------------------------
// The fixture
// ---------------------------------------------------------------------------

const POD_ID: PodId = 'pod-matriarch';
const MATRIARCH_ID: LaneId = 'lane-matriarch';
const CALF_ID: LaneId = 'lane-calf';

/**
 * One Pod, born `'closed'` exactly as `PodStatus` says a Pod is born. Every
 * status this suite asserts on arrives by a `podStatus` PUSH, so no assertion
 * below can be satisfied by the fixture the test itself typed.
 */
const POD: Pod = makeStubPod({
  id: POD_ID,
  title: 'Matriarch Pod',
  tabOrder: 0,
  status: 'closed',
  createdAt: OPENED_AT,
});

/** The Matriarch, still open: `endedAt` null, so the Pod's status governs it. */
function openMatriarch(): Lane {
  return makeStubLane({
    id: MATRIARCH_ID,
    podId: POD_ID,
    kind: 'matriarch',
    status: 'running',
    startedAt: OPENED_AT,
    endedAt: null,
  });
}

/**
 * The Matriarch after its lane ended. `endedAt` is non-null and the schema
 * `CHECK ((status = 'running') = (ended_at IS NULL))` makes the pair legal only
 * for a terminal status, so the two are set together.
 */
function endedMatriarch(status: LaneStatus): Lane {
  return makeStubLane({
    id: MATRIARCH_ID,
    podId: POD_ID,
    kind: 'matriarch',
    status,
    startedAt: OPENED_AT,
    endedAt: ENDED_AT,
  });
}

/**
 * An open Calf. It is the case that proves the change did not leak — a subagent
 * never waits on user input, so a `running` Calf genuinely IS working — and it
 * doubles as the live clock control, because `useElapsedClock` only ticks while
 * some lane on screen carries `status: 'running'`.
 */
function runningCalf(): Lane {
  return makeStubLane({
    id: CALF_ID,
    podId: POD_ID,
    kind: 'calf',
    toolUseId: 'toolu-calf',
    agentId: null,
    parentLaneId: MATRIARCH_ID,
    depth: 1,
    subagentType: 'explorer',
    description: 'Read the lane router',
    status: 'running',
    startedAt: OPENED_AT,
    endedAt: null,
  });
}

/**
 * Mounts the assembled app against a stub that lists exactly one Pod and NO
 * lanes. The rail is therefore empty until a `laneChanged` push delivers one,
 * which is asserted here — without it, a rail assertion could pass on lanes the
 * push never drove.
 */
async function mountPod(): Promise<StubOrcastrateApi> {
  const api = stubOrcastrateApi({
    pods: { list: async () => ({ ok: true, value: [POD] }) },
    lanes: { list: async () => ({ ok: true, value: [] }) },
  });
  mountWorkspace(api);
  await waitFor(() => {
    expect(podTab(POD_ID).getAttribute('aria-current')).toBe('true');
  });
  await screen.findByTestId(TEST_IDS.laneRail);
  expect(screen.queryAllByTestId(/^lane-row:/)).toEqual([]);
  return api;
}

/** Delivers a lane snapshot, as main's `laneChanged` push would. */
async function deliverLanes(api: StubOrcastrateApi, lanes: readonly Lane[]): Promise<void> {
  act(() => {
    api.emit.laneChanged({ podId: POD_ID, lanes: [...lanes] });
  });
  await waitFor(() => {
    expect(screen.queryAllByTestId(/^lane-row:/).length).toBe(lanes.length);
  });
}

/** Delivers a Pod status, as main's `podStatus` push would. */
function deliverPodStatus(api: StubOrcastrateApi, status: PodStatus): void {
  act(() => {
    api.emit.podStatus({ podId: POD_ID, status });
  });
}

/** Moves the faked `Date` to a UTC literal. Never a duration, never a sleep. */
function at(instant: string): void {
  vi.setSystemTime(new Date(instant));
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

/**
 * What the rail row and the Pod tab say about the status, read out of ONE
 * rendered document and returned together so a single `toEqual` can compare
 * them. Agreement between the two surfaces is the subject of this file, and an
 * assertion that read them in two mounts could not see a disagreement at all.
 *
 * `railPodStatus` and `railLaneStatus` are read as ATTRIBUTES rather than only
 * as text on purpose: `POD_STATUS_LABEL.running` and `LANE_STATUS_LABEL.running`
 * are both the literal string `'Running'`, so a text-only assertion cannot tell
 * the two vocabularies apart and would read identically before and after this
 * session's change.
 */
function agreementOn(
  laneId: LaneId,
  podId: PodId,
): {
  railPodStatus: string | null;
  railLaneStatus: string | null;
  railWord: string;
  podTabStatus: string | null;
} {
  const row = laneRow(laneId);
  const spans = row.querySelectorAll('[data-pod-status], [data-status]');
  // EXACTLY ONE, never both and never neither. The two vocabularies collide on
  // the literal `running`, so a row carrying both attributes would cascade two
  // meanings onto one dot.
  expect(spans.length, `lane ${laneId} renders ${spans.length} status spans, not one`).toBe(1);
  const span = spans[0] as HTMLElement;
  const dot = podTab(podId).querySelector('[data-status]');
  return {
    railPodStatus: span.getAttribute('data-pod-status'),
    railLaneStatus: span.getAttribute('data-status'),
    railWord: span.textContent ?? '',
    podTabStatus: dot === null ? null : dot.getAttribute('data-status'),
  };
}

/**
 * The elapsed reading ALONE — `Elapsed 1m 30s` — never the whole row.
 *
 * The row's full text also carries the status word, so a criterion about a
 * DURATION not moving must not be satisfiable by the rest of the row holding
 * still while the number underneath it changes.
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

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

beforeEach(() => {
  // `Date` only. `setTimeout` and `setInterval` stay real, so `waitFor` and
  // React's scheduler need no pumping and nothing here sleeps.
  vi.useFakeTimers({ toFake: ['Date'] });
  at(OPENED_AT);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// The reproduction
// ---------------------------------------------------------------------------

describe('an OPEN Matriarch row and the Pod tab, read from one rendered tree', () => {
  it('both read Running while the turn streams, and both read Idle once the turn ends', async () => {
    const api = await mountPod();
    await deliverLanes(api, [openMatriarch()]);

    // THE TURN STARTS. `pod-runner.ts:426` sets `running` on `send()`.
    deliverPodStatus(api, 'running');
    await waitFor(() => {
      expect(agreementOn(MATRIARCH_ID, POD_ID)).toEqual({
        railPodStatus: 'running',
        railLaneStatus: null,
        railWord: POD_STATUS_LABEL.running,
        podTabStatus: 'running',
      });
    });

    /*
     * THE TURN ENDS, AND THIS HALF IS THE BUG. `pod-runner.ts:272` clears the
     * Pod to `idle`, but the lane stays `running` until it ends, so before this
     * session the row went on reading `Running` and went on pulsing while
     * Claude Code sat doing nothing.
     *
     * The ATTRIBUTE is what makes this falsifiable rather than decorative:
     * `LANE_STATUS_LABEL.running` and `POD_STATUS_LABEL.running` are the same
     * five letters, so only `railLaneStatus: null` distinguishes "the row now
     * reports the Pod" from "the row still reports the lane".
     */
    deliverPodStatus(api, 'idle');
    await waitFor(() => {
      expect(agreementOn(MATRIARCH_ID, POD_ID)).toEqual({
        railPodStatus: 'idle',
        railLaneStatus: null,
        railWord: POD_STATUS_LABEL.idle,
        podTabStatus: 'idle',
      });
    });
    // The lane itself never moved: it is still `running` and still un-ended,
    // which is exactly why the old row could not rest.
    expect(agreementOn(MATRIARCH_ID, POD_ID).railWord).not.toBe(LANE_STATUS_LABEL.running);
  });

  it('both read Waiting on you when the Pod is blocked on a permission decision', async () => {
    const api = await mountPod();
    await deliverLanes(api, [openMatriarch()]);

    deliverPodStatus(api, 'waiting');
    await waitFor(() => {
      expect(agreementOn(MATRIARCH_ID, POD_ID)).toEqual({
        railPodStatus: 'waiting',
        railLaneStatus: null,
        // THE WORD, from `POD_STATUS_LABEL` rather than re-typed: colour is
        // never the only carrier, and no new status vocabulary may be invented.
        railWord: POD_STATUS_LABEL.waiting,
        podTabStatus: 'waiting',
      });
    });
    expect(POD_STATUS_LABEL.waiting).toBe('Waiting on you');
  });

  it('reports each of the five Pod statuses on the rail and the tab together, from one Pod and one lane', async () => {
    const api = await mountPod();
    await deliverLanes(api, [openMatriarch()]);

    // Driven over the whole union in one mount: a row answering a constant
    // would satisfy at most one of the five.
    for (const status of POD_STATUSES) {
      deliverPodStatus(api, status);
      await waitFor(() => {
        expect(agreementOn(MATRIARCH_ID, POD_ID)).toEqual({
          railPodStatus: status,
          railLaneStatus: null,
          railWord: POD_STATUS_LABEL[status],
          podTabStatus: status,
        });
      });
    }
  });

  it('leaves an open Calf on its own lane status Running while the Matriarch reports the idle Pod, in the same render', async () => {
    const api = await mountPod();
    await deliverLanes(api, [openMatriarch(), runningCalf()]);

    deliverPodStatus(api, 'idle');
    await waitFor(() => {
      expect(agreementOn(MATRIARCH_ID, POD_ID).railPodStatus).toBe('idle');
    });

    // SAME RENDER, both rows. A Calf is dispatched and ends when its subagent
    // finishes, and a subagent never waits on user input, so a `running` Calf
    // genuinely IS working and must keep the lane vocabulary.
    expect(agreementOn(MATRIARCH_ID, POD_ID)).toEqual({
      railPodStatus: 'idle',
      railLaneStatus: null,
      railWord: POD_STATUS_LABEL.idle,
      podTabStatus: 'idle',
    });
    expect(agreementOn(CALF_ID, POD_ID)).toEqual({
      railPodStatus: null,
      railLaneStatus: 'running',
      railWord: LANE_STATUS_LABEL.running,
      podTabStatus: 'idle',
    });
  });
});

describe('a Matriarch row whose lane has ENDED', () => {
  for (const status of TERMINAL_LANE_STATUSES) {
    it(`keeps the terminal lane word ${LANE_STATUS_LABEL[status]} with no data-pod-status, and holds its duration across two advances, while the Pod reports running`, async () => {
      const api = await mountPod();
      // The Calf is still open and still running, so the app's clock has
      // something to tick for. Without it, "the duration did not change" would
      // be satisfied by a clock that never started.
      await deliverLanes(api, [endedMatriarch(status), runningCalf()]);

      // The Pod's status is deliberately the LOUDEST one. A terminal lane state
      // is a real fact with an `ended_at` behind it and must not be overwritten.
      deliverPodStatus(api, 'running');
      await waitFor(() => {
        expect(agreementOn(MATRIARCH_ID, POD_ID)).toEqual({
          railPodStatus: null,
          railLaneStatus: status,
          railWord: LANE_STATUS_LABEL[status],
          podTabStatus: 'running',
        });
      });

      const frozen = elapsedText(MATRIARCH_ID);
      expect(frozen).toContain(FROZEN_DURATION);

      // ADVANCE ONE. The Calf proves the clock actually moved.
      at(ADVANCE_ONE);
      await waitFor(
        () => {
          expect(elapsedText(CALF_ID)).toContain(LIVE_DURATION_AT_ADVANCE_ONE);
        },
        { timeout: 4000 },
      );
      expect(elapsedText(MATRIARCH_ID)).toBe(frozen);

      // ADVANCE TWO. Once is a coincidence.
      at(ADVANCE_TWO);
      await waitFor(
        () => {
          expect(elapsedText(CALF_ID)).toContain(LIVE_DURATION_AT_ADVANCE_TWO);
        },
        { timeout: 4000 },
      );
      expect(elapsedText(MATRIARCH_ID)).toBe(frozen);
      expect(elapsedText(MATRIARCH_ID)).not.toContain(LIVE_DURATION_AT_ADVANCE_TWO);

      // And the word did not drift either, at the same moment the Pod is still
      // pushing `running`.
      expect(agreementOn(MATRIARCH_ID, POD_ID)).toEqual({
        railPodStatus: null,
        railLaneStatus: status,
        railWord: LANE_STATUS_LABEL[status],
        podTabStatus: 'running',
      });
    });
  }
});
