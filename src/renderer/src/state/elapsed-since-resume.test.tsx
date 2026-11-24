// @vitest-environment jsdom

/**
 * The rail's elapsed readout counts from the lane's CURRENT RUN, which began at
 * `lane.resumedAt ?? lane.startedAt`: a resumed lane restarts from zero rather
 * than carrying the time it spent ended, and a never-resumed lane reads exactly
 * as it always has.
 *
 * THE CLOCK. `Date` alone is faked and pinned at `NOW`, so every reading below
 * is an exact equality rather than a lower bound; `setInterval` stays real, so
 * the provider's elapsed tick re-reads the same pinned instant.
 */

import type { ReactNode } from 'react';
import { act, cleanup, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Lane, Pod } from '@shared/contracts/events';

import {
  makeStubLane,
  makeStubPod,
  registerWorkspaceProvider,
  renderWithWorkspace,
  resetWorkspaceProvider,
  stubOrcastrateApi,
  type StubOrcastrateApi,
} from '../test-utils';

import { WorkspaceProvider, useLaneRail } from './workspace-provider';

const POD = 'pod-1';

/** When the lane first started. */
const STARTED_AT = '2026-03-01T09:00:00.000Z';
/** Two days after `STARTED_AT`: when the lane was resumed. */
const RESUMED_AT = '2026-03-03T09:00:00.000Z';
/** Where the faked clock is pinned. 42 seconds after `RESUMED_AT`. */
const NOW = '2026-03-03T09:00:42.000Z';
/** When a resumed lane ended again. 7 seconds after `RESUMED_AT`. */
const ENDED_AFTER_RESUME_AT = '2026-03-03T09:00:07.000Z';

const ms = (instant: string): number => Date.parse(instant);

beforeAll(() => registerWorkspaceProvider(WorkspaceProvider));
afterAll(() => resetWorkspaceProvider());

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(NOW));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function podsApi(pods: Pod[]): StubOrcastrateApi {
  return stubOrcastrateApi({ pods: { list: async () => ({ ok: true, value: pods }) } });
}

function RailProbe(): ReactNode {
  const rail = useLaneRail();
  return (
    <ul data-testid="rail">
      {rail.value.map((row) => (
        <li key={row.lane.id} data-lane={row.lane.id}>
          {String(row.elapsedMs)}
        </li>
      ))}
    </ul>
  );
}

/** Pushes `lane` by `laneChanged` and returns its row's `elapsedMs`. */
async function elapsedOf(lane: Lane): Promise<number> {
  const api = podsApi([makeStubPod({ id: POD })]);
  await act(async () => {
    renderWithWorkspace(<RailProbe />, { api });
  });
  act(() => {
    api.emit.laneChanged({ podId: POD, lanes: [lane] });
  });
  const items = [...screen.getByTestId('rail').querySelectorAll('li')];
  // VACUITY GUARD: a rail that drew no row would otherwise fail far from here.
  expect(items, 'the rail rendered no row for the pushed lane').toHaveLength(1);
  const item = items[0];
  if (item === undefined) throw new Error(`no rail row for lane ${lane.id}`);
  expect(item.getAttribute('data-lane')).toBe(lane.id);
  return Number(item.textContent);
}

describe('LaneRowVm.elapsedMs counts from the current run', () => {
  it('a running lane resumed two days after it started reads now minus resumedAt', async () => {
    const lane = makeStubLane({
      id: 'lane-matriarch',
      podId: POD,
      status: 'running',
      startedAt: STARTED_AT,
      resumedAt: RESUMED_AT,
      endedAt: null,
    });
    expect(await elapsedOf(lane)).toBe(ms(NOW) - ms(RESUMED_AT));
  });

  it('a terminal lane that had been resumed reads endedAt minus resumedAt', async () => {
    const lane = makeStubLane({
      id: 'lane-matriarch',
      podId: POD,
      status: 'stopped',
      startedAt: STARTED_AT,
      resumedAt: RESUMED_AT,
      endedAt: ENDED_AFTER_RESUME_AT,
    });
    expect(await elapsedOf(lane)).toBe(ms(ENDED_AFTER_RESUME_AT) - ms(RESUMED_AT));
  });

  it('a never-resumed running lane reads exactly now minus startedAt', async () => {
    const lane = makeStubLane({
      id: 'lane-matriarch',
      podId: POD,
      status: 'running',
      startedAt: STARTED_AT,
      resumedAt: null,
      endedAt: null,
    });
    expect(await elapsedOf(lane)).toBe(ms(NOW) - ms(STARTED_AT));
  });

  it('a lane whose resumedAt does not parse reads 0', async () => {
    const lane = makeStubLane({
      id: 'lane-matriarch',
      podId: POD,
      status: 'running',
      startedAt: STARTED_AT,
      resumedAt: 'not a timestamp',
      endedAt: null,
    });
    expect(await elapsedOf(lane)).toBe(0);
  });
});
