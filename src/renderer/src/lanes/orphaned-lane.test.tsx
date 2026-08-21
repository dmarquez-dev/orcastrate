// @vitest-environment jsdom
/**
 * SYMPTOM 1, VERIFIED RATHER THAN REIMPLEMENTED (invariant I6).
 *
 * The reproduced bug: after a relaunch the rail showed the Matriarch lane as
 * Running with a duration ticking from the original `started_at`. The fix is
 * entirely upstream — the boot sweep flips such a lane to `orphaned` and stamps
 * `ended_at` — and the renderer needs NO change to show it correctly, because
 * `orphaned` was reused rather than replaced by a new LANE status. The existing
 * `LANE_STATUS_LABEL`, the existing `TOKENS.statusOrphaned` and the existing
 * "or to now while the lane is running" rule already do the whole job.
 *
 * That claim is worth nothing unasserted, so this suite asserts it: the row
 * reads `Orphaned`, and its duration is FROZEN while a live lane's duration in
 * the same rail keeps moving.
 *
 * WHY A SECOND, RUNNING LANE IS IN THE FIXTURE. "The number did not change" is
 * satisfied by a clock that never advanced at all. The running Calf beside the
 * orphaned Matriarch is the control: it must tick over the same interval, so
 * the frozen row is frozen because it is TERMINAL and not because nothing
 * happened.
 *
 * ONLY `Date` IS FAKED. `setInterval` stays real, because the state layer's
 * one-second elapsed clock is what has to actually fire for the control lane to
 * move; faking the timer as well would prove only that a stopped clock is
 * stopped.
 */

import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from '../App';
import { TEST_IDS } from '../contracts/renderer-view';
import { WorkspaceProvider } from '../state';
import { testId } from '../shell/contract-runtime';
import {
  makeStubLane,
  makeStubPod,
  registerWorkspaceProvider,
  renderWithWorkspace,
  stubOrcastrateApi,
} from '../test-utils';
import { formatElapsed } from './format-elapsed';

beforeAll(() => {
  registerWorkspaceProvider(WorkspaceProvider);
});

const T0 = Date.parse('2026-01-01T00:00:00.000Z');
const POD = makeStubPod({ id: 'pod-1', title: 'Alpha', status: 'closed' });

/** The reconciled Matriarch: terminal, with `ended_at` stamped by the sweep. */
const ORPHANED = makeStubLane({
  id: 'lane-matriarch',
  status: 'orphaned',
  startedAt: new Date(T0).toISOString(),
  endedAt: new Date(T0 + 90_000).toISOString(),
});

/** The control: still running, so its duration must keep moving. */
const RUNNING = makeStubLane({
  id: 'lane-calf-1',
  kind: 'calf',
  toolUseId: 'toolu_1',
  agentId: 'agent_1',
  parentLaneId: 'lane-matriarch',
  depth: 1,
  subagentType: 'reviewer',
  description: 'Review the diff',
  status: 'running',
  startedAt: new Date(T0).toISOString(),
  endedAt: null,
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(T0 + 120_000);
});

afterEach(() => {
  vi.useRealTimers();
});

function railApi() {
  return stubOrcastrateApi({
    pods: { list: async () => ({ ok: true, value: [POD] }) },
    lanes: { list: async () => ({ ok: true, value: [ORPHANED, RUNNING] }) },
  });
}

function rowText(laneId: string): string {
  return screen.getByTestId(testId(TEST_IDS.laneRow, laneId)).textContent ?? '';
}

describe('an orphaned Matriarch lane after a relaunch', () => {
  it('reads Orphaned, not Running', async () => {
    renderWithWorkspace(<App />, { api: railApi() });

    // AND IT IS ON THE RAIL, not behind the finished-lane disclosure. The
    // Matriarch is NEVER collapsed whatever its status
    // (`contracts/renderer-panes.ts` section 6, rule 1) — this `findByTestId`
    // is what would fail if that rule were dropped.
    const row = await screen.findByTestId(testId(TEST_IDS.laneRow, ORPHANED.id));
    expect(row.getAttribute('data-matriarch')).toBe('true');
    // The word, through the existing label map — colour is never the only
    // carrier of the state.
    expect(within(row).getByText('Orphaned')).toBeDefined();
    expect(row.textContent).not.toContain('Running');
    // And the swatch is the existing orphaned token, keyed off `data-status`.
    expect(row.querySelector('[data-status]')?.getAttribute('data-status')).toBe('orphaned');
  });

  it('freezes its elapsed time while a running lane in the same rail keeps ticking', async () => {
    renderWithWorkspace(<App />, { api: railApi() });

    await screen.findByTestId(testId(TEST_IDS.laneRow, ORPHANED.id));

    // `ended_at - started_at`, and NOT `now - started_at`: the sweep stamped
    // the end 90s in, and the clock is 120s in.
    const frozen = formatElapsed(90_000);
    expect(frozen).toBe('1m 30s');
    expect(rowText(ORPHANED.id)).toContain(frozen);
    await waitFor(() => {
      expect(rowText(RUNNING.id)).toContain(formatElapsed(120_000));
    });

    // Advance the clock. The state layer's real one-second interval recomputes
    // `elapsedMs` for every row from the new `now`.
    vi.setSystemTime(T0 + 125_000);

    await waitFor(
      () => {
        expect(rowText(RUNNING.id)).toContain(formatElapsed(125_000));
      },
      { timeout: 4000 },
    );

    // The control moved. The orphaned row did not, and that is invariant I6.
    expect(rowText(ORPHANED.id)).toContain(frozen);
    expect(rowText(ORPHANED.id)).not.toContain(formatElapsed(125_000));
  });
});
