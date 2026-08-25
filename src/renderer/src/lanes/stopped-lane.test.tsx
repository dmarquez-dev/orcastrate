// @vitest-environment jsdom
/**
 * THE USER-VISIBLE HALF OF THE DEFECT (T6 criteria 1 and 9).
 *
 * Reported: a Pod the user stopped kept reading `Running` on the rail with a
 * duration ticking up on a process that no longer existed. `closePod` wrote
 * `status: 'closed'` to the POD and never ended the Matriarch LANE, so
 * `lane.endedAt` stayed null and `elapsedMsOf` fell back to `nowMs`.
 *
 * The main-side half is T2's. This suite is the RENDERER's half, and it is
 * deliberately written the way `orphaned-lane.test.tsx` is: through the real
 * `WorkspaceProvider`, so the assertion is about what the provider's own clock
 * does to the row rather than about a prop a fixture pinned.
 *
 * ASSERTING `endedAt` IS SET WOULD NOT BE ENOUGH. The user did not see a null
 * field; they saw a number moving. So the frozen DURATION is asserted directly
 * — byte-identical across TWO advances of the provider's clock — with a
 * running Calf in the same rail as the control that proves the clock advanced
 * at all. "The number did not change" is satisfied perfectly by a clock that
 * never ticked.
 *
 * ONLY `Date` IS FAKED, for the reason `orphaned-lane.test.tsx` gives: the
 * state layer's one-second interval has to actually fire for the control lane
 * to move.
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

/**
 * The Matriarch of a Pod the user stopped: terminal, with `ended_at` stamped
 * by `closePod`'s sweep 90 seconds in. Non-null and FIXED, so the duration the
 * row shows can only be `ended_at - started_at`.
 */
const STOPPED = makeStubLane({
  id: 'lane-matriarch',
  status: 'stopped',
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
    lanes: { list: async () => ({ ok: true, value: [STOPPED, RUNNING] }) },
  });
}

function row(laneId: string): HTMLElement {
  return screen.getByTestId(testId(TEST_IDS.laneRow, laneId));
}

/**
 * The elapsed reading ALONE — `Elapsed 1m 30s` — not the whole row. The row's
 * text also carries the status word and the unread count, and a criterion
 * about a duration not moving must not be satisfiable by the rest of the row
 * holding still.
 */
function elapsedText(laneId: string): string {
  const label = within(row(laneId)).getByText('Elapsed');
  const holder = label.parentElement;
  if (holder === null) throw new Error(`no elapsed holder for ${laneId}`);
  return holder.textContent ?? '';
}

describe('a stopped Matriarch lane after the Pod was stopped', () => {
  it('reads Stopped, not Running, and stays ON the rail', async () => {
    renderWithWorkspace(<App />, { api: railApi() });

    // Rule 1 of `isCollapsibleFinishedLane`: the Matriarch is NEVER collapsed,
    // whatever its status. `'stopped'` joining `FINISHED_LANE_STATUSES` must
    // not put the lane the composer talks to behind a disclosure — this
    // `findByTestId` is what fails if that rule were dropped.
    const matriarch = await screen.findByTestId(testId(TEST_IDS.laneRow, STOPPED.id));
    expect(matriarch.getAttribute('data-matriarch')).toBe('true');

    // THE WORD, through `LANE_STATUS_LABEL`. Colour is never the only carrier:
    // this is what a screen reader, a greyscale display and a colour-blind
    // user actually get.
    expect(within(matriarch).getByText('Stopped')).toBeDefined();
    expect(matriarch.textContent).not.toContain('Running');

    // And the swatch, keyed off `data-status`, which is what the stylesheet's
    // `--oc-status-stopped` rule selects on.
    expect(matriarch.querySelector('[data-status]')?.getAttribute('data-status')).toBe('stopped');
  });

  it('freezes its duration across two advances of the provider clock', async () => {
    renderWithWorkspace(<App />, { api: railApi() });
    await screen.findByTestId(testId(TEST_IDS.laneRow, STOPPED.id));

    // `ended_at - started_at`, NOT `now - started_at`: the sweep stamped the
    // end 90s in, and the clock is already 120s in.
    const frozen = elapsedText(STOPPED.id);
    expect(frozen).toContain(formatElapsed(90_000));
    expect(frozen).toContain('1m 30s');
    expect(frozen).not.toContain(formatElapsed(120_000));

    await waitFor(() => {
      expect(elapsedText(RUNNING.id)).toContain(formatElapsed(120_000));
    });

    // ADVANCE ONE.
    vi.setSystemTime(T0 + 125_000);
    await waitFor(
      () => {
        expect(elapsedText(RUNNING.id)).toContain(formatElapsed(125_000));
      },
      { timeout: 4000 },
    );
    expect(elapsedText(STOPPED.id)).toBe(frozen);

    // ADVANCE TWO. Once is a coincidence; the row has to stay put.
    vi.setSystemTime(T0 + 200_000);
    await waitFor(
      () => {
        expect(elapsedText(RUNNING.id)).toContain(formatElapsed(200_000));
      },
      { timeout: 4000 },
    );
    expect(elapsedText(STOPPED.id)).toBe(frozen);

    // And the word did not drift either.
    expect(within(row(STOPPED.id)).getByText('Stopped')).toBeDefined();
  });
});
