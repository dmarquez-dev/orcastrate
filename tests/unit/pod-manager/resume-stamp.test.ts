/**
 * The Matriarch's resume stamp comes from `PodManager`'s own clock.
 *
 * When a Pod whose Matriarch lane ended (stopped by `closePod`, orphaned by the
 * boot sweep) is opened or reconnected, the lane goes back to 'running' and the
 * store stamps `resumedAt`. The rail's elapsed readout counts from that stamp,
 * so it must be the manager's injected `now`, the same clock that stamped the
 * lane's `endedAt`, and never the store's own wall clock.
 *
 * The harness clock sits in August 2026 and advances one second per read, so a
 * stamp taken from the wall clock lands far outside the bounds asserted here:
 * later than the `endedAt` the manager wrote, earlier than a harness read taken
 * after the call returns.
 */

import { afterEach, describe, expect, it } from 'vitest';

import type { Lane } from '../../../src/shared/contracts/events';
import { laneIds, makeManagerHarness, seedPod, type ManagerHarness } from './helpers';

const harnesses: ManagerHarness[] = [];

function harness(): ManagerHarness {
  const made = makeManagerHarness();
  harnesses.push(made);
  return made;
}

afterEach(async () => {
  while (harnesses.length > 0) await harnesses.pop()?.dispose();
});

function matriarchOf(h: ManagerHarness, podId: string): Lane {
  const lane = h.raw.getMatriarchLane(podId);
  if (lane === null) throw new Error(`pod ${podId} has no Matriarch lane`);
  return lane;
}

/** `resumedAt` is strictly after `after` and strictly before `before`. */
function expectStampBetween(resumedAt: string | null, after: string, before: string): void {
  expect(resumedAt).not.toBeNull();
  const stamp = Date.parse(resumedAt as string);
  expect(stamp).toBeGreaterThan(Date.parse(after));
  expect(stamp).toBeLessThan(Date.parse(before));
}

function createPod(h: ManagerHarness): string {
  return h.manager.createPod({
    title: 'Resume stamp',
    cwd: 'C:/resume-stamp-pod',
    permissionMode: 'default',
  }).id;
}

describe('PodManager stamps a Matriarch resume from its own clock', () => {
  it('a Pod opened for the first time has a Matriarch that was never resumed', async () => {
    const h = harness();
    const podId = createPod(h);

    await h.manager.openPod(podId);

    const matriarch = matriarchOf(h, podId);
    expect(matriarch.status).toBe('running');
    expect(matriarch.resumedAt).toBeNull();
  });

  it('openPod after closePod stamps resumedAt from the manager clock', async () => {
    const h = harness();
    const podId = createPod(h);
    await h.manager.openPod(podId);
    await h.manager.closePod(podId);

    const stopped = matriarchOf(h, podId);
    expect(stopped.status).toBe('stopped');
    expect(stopped.endedAt).not.toBeNull();
    const endedAt = stopped.endedAt as string;

    await h.manager.openPod(podId);
    const later = h.now();

    const resumed = matriarchOf(h, podId);
    expect(resumed.status).toBe('running');
    expect(resumed.endedAt).toBeNull();
    expectStampBetween(resumed.resumedAt, endedAt, later);
  });

  it('reconnectPod of a beached Pod orphaned by the boot sweep stamps resumedAt from the manager clock', async () => {
    const h = harness();
    const podId = seedPod(h, { status: 'beached' });
    h.manager.reconcileStartup();

    const orphaned = matriarchOf(h, podId);
    expect(orphaned.status).toBe('orphaned');
    expect(orphaned.endedAt).not.toBeNull();
    const endedAt = orphaned.endedAt as string;

    await h.manager.reconnectPod(podId);
    const later = h.now();

    const resumed = matriarchOf(h, podId);
    expect(resumed.status).toBe('running');
    expect(resumed.endedAt).toBeNull();
    expectStampBetween(resumed.resumedAt, endedAt, later);
  });

  it('a Calf orphaned by the boot sweep is not revived by openPod and keeps resumedAt null', async () => {
    const h = harness();
    const podId = seedPod(h, {
      lanes: [
        { kind: 'matriarch', status: 'running' },
        { kind: 'calf', status: 'running' },
      ],
    });
    expect(laneIds(h, podId)).toHaveLength(2);
    const calfId = h.raw.listLanes(podId).find((lane) => lane.kind === 'calf')?.id;
    if (calfId === undefined) throw new Error(`pod ${podId} has no Calf lane`);

    h.manager.reconcileStartup();
    await h.manager.openPod(podId);

    expect(matriarchOf(h, podId).status).toBe('running');
    const calf = h.raw.getLane(calfId);
    expect(calf?.status).toBe('orphaned');
    expect(calf?.resumedAt).toBeNull();
  });
});
