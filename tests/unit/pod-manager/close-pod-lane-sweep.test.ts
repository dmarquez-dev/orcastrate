/**
 * `closePod`'s lane sweep — the only writer of `'stopped'`.
 *
 * The defect: `closePod` wrote `status: 'closed'` to the POD and never ended
 * the Matriarch LANE, so `lane.endedAt` stayed null, `elapsedMsOf` fell back to
 * `nowMs`, and the rail kept reading Running with a duration ticking up on a
 * Pod that had no process.
 *
 * Everything here runs against a REAL `PodManager` over a real, migrated
 * `SqliteEventStore` (`makeManagerHarness`), asserting lane ROWS and EVENT
 * COUNTS rather than spy call counts — a mock configured to be called once
 * proves only that it was configured. The clock is the harness's injected one;
 * nothing reads the wall clock and nothing sleeps.
 */

import { describe, expect, it, afterEach } from 'vitest';

import type { LaneChangedPush } from '../../../src/shared/contracts/ipc';
import { EVENT_CHANNELS } from '../../../src/shared/contracts/ipc';
import {
  eventsFor,
  laneIds,
  makeManagerHarness,
  seedPod,
  type ManagerHarness,
} from './helpers';

const harnesses: ManagerHarness[] = [];

function harness(): ManagerHarness {
  const made = makeManagerHarness();
  harnesses.push(made);
  return made;
}

afterEach(async () => {
  while (harnesses.length > 0) await harnesses.pop()?.dispose();
});

/** A Pod as a previous turn left it: open, with two running lanes and one done. */
function seedOpenPodWithLanes(h: ManagerHarness): {
  podId: string;
  matriarchId: string;
  runningCalfId: string;
  doneCalfId: string;
} {
  const podId = seedPod(h, {
    status: 'idle',
    lanes: [
      { kind: 'matriarch', status: 'running' },
      { kind: 'calf', status: 'running' },
      { kind: 'calf', status: 'done' },
    ],
  });
  const [matriarchId, runningCalfId, doneCalfId] = laneIds(h, podId) as string[];
  return {
    podId,
    matriarchId: matriarchId as string,
    runningCalfId: runningCalfId as string,
    doneCalfId: doneCalfId as string,
  };
}

/** Every `lane_closed` event on a Pod, in `seq` order. */
function laneClosedEvents(
  h: ManagerHarness,
  podId: string,
): { laneId: string; status: string; createdAt: string }[] {
  return eventsFor(h, podId)
    .filter((event) => event.payload.type === 'lane_closed')
    .map((event) => {
      const payload = event.payload as { laneId: string; status: string };
      return { laneId: payload.laneId, status: payload.status, createdAt: event.createdAt };
    });
}

// ---------------------------------------------------------------------------
// Criterion 1 — the rows, and ONE stamp for the whole gesture
// ---------------------------------------------------------------------------

describe("criterion 1: closePod ends every running lane as 'stopped'", () => {
  it('flips only the running lanes and stamps them all with one endedAt', async () => {
    const h = harness();
    const { podId, matriarchId, runningCalfId, doneCalfId } = seedOpenPodWithLanes(h);
    const doneEndedAtBefore = h.raw.getLane(doneCalfId)?.endedAt;

    await h.manager.closePod(podId);

    const matriarch = h.raw.getLane(matriarchId);
    const runningCalf = h.raw.getLane(runningCalfId);
    expect(matriarch?.status).toBe('stopped');
    expect(runningCalf?.status).toBe('stopped');
    // The database's `CHECK ((status = 'running') = (ended_at IS NULL))` makes
    // a null here impossible to write, but the point of the sweep is that the
    // rail has an end to measure to, so it is asserted rather than inferred.
    expect(matriarch?.endedAt).not.toBeNull();
    // ONE `#now()` for the whole sweep: two lanes stopped by one gesture read
    // as one gesture, exactly as `reconcileStartup` already does.
    expect(runningCalf?.endedAt).toBe(matriarch?.endedAt);

    // A lane that finished its own work keeps saying so, with its own stamp.
    expect(h.raw.getLane(doneCalfId)?.status).toBe('done');
    expect(h.raw.getLane(doneCalfId)?.endedAt).toBe(doneEndedAtBefore);
  });
});

// ---------------------------------------------------------------------------
// Criterion 2 — one event per swept lane, one all-or-nothing batch
// ---------------------------------------------------------------------------

describe('criterion 2: one lane_closed per swept lane in a single appendMany', () => {
  it("appends 'stopped' on each lane's own id with the sweep's single createdAt", async () => {
    const h = harness();
    const { podId, matriarchId, runningCalfId } = seedOpenPodWithLanes(h);

    await h.manager.closePod(podId);

    const closed = laneClosedEvents(h, podId);
    expect(closed.map((event) => event.laneId)).toEqual([matriarchId, runningCalfId]);
    expect(closed.map((event) => event.status)).toEqual(['stopped', 'stopped']);
    // The event's stamp is the sweep's stamp, so the transcript row and the
    // lane row cannot disagree about when the Pod was stopped.
    const at = h.raw.getLane(matriarchId)?.endedAt;
    expect(closed.map((event) => event.createdAt)).toEqual([at, at]);
  });

  it('writes them in ONE appendMany so the batch is all-or-nothing', async () => {
    const h = harness();
    const { podId } = seedOpenPodWithLanes(h);

    await h.manager.closePod(podId);

    const appends = h.spy.writes.filter(
      (write) => write.method === 'appendMany' || write.method === 'append',
    );
    expect(appends).toHaveLength(1);
    expect(appends[0]?.method).toBe('appendMany');
    expect((appends[0]?.args[0] as unknown[]).length).toBe(2);
  });

  it("leaves the per-Pod seq run contiguous, read back from the store", async () => {
    const h = harness();
    const { podId } = seedOpenPodWithLanes(h);

    await h.manager.closePod(podId);

    // Read back rather than trusting the store's return value: a gap here is a
    // hole in the transcript's only ordering. The length is asserted too, so
    // this is never the vacuous claim that an empty run is contiguous.
    const seqs = eventsFor(h, podId).map((event) => event.seq);
    expect(seqs).toHaveLength(2);
    expect(seqs).toEqual(seqs.map((_, index) => index + 1));
  });
});

// ---------------------------------------------------------------------------
// Criterion 3 — one laneChanged, and it lands BEFORE podStatus
// ---------------------------------------------------------------------------

describe('criterion 3: exactly one laneChanged push, before the podStatus push', () => {
  it('pushes the rail wholesale once and only then flips the tab', async () => {
    const h = harness();
    const { podId } = seedOpenPodWithLanes(h);
    const before = h.pushed.length;

    await h.manager.closePod(podId);

    const order = h.pushed.slice(before).map((entry) => entry.channel);
    const laneAt = order.indexOf(EVENT_CHANNELS.laneChanged);
    const statusAt = order.indexOf(EVENT_CHANNELS.podStatus);
    // `LaneChangedPush` replaces the rail wholesale, so one push per sweep and
    // never one per lane.
    expect(order.filter((channel) => channel === EVENT_CHANNELS.laneChanged)).toHaveLength(1);
    expect(laneAt).toBeGreaterThanOrEqual(0);
    // A renderer that saw the Pod closed while the rail still said Running
    // would render, for one frame, the exact disagreement this task removes.
    expect(laneAt).toBeLessThan(statusAt);

    const push = h.pushesOn<LaneChangedPush>(EVENT_CHANNELS.laneChanged).at(-1);
    expect(push?.podId).toBe(podId);
    // Refreshed AFTER the writes, or the renderer redraws what it already had.
    expect(push?.lanes).toEqual(h.raw.listLanes(podId));
  });
});

// ---------------------------------------------------------------------------
// Criterion 4 — the beached guard is preserved and NOT widened
// ---------------------------------------------------------------------------

describe('criterion 4: a beached Pod keeps its lanes', () => {
  it('sweeps nothing and appends nothing when the Pod is beached', async () => {
    const h = harness();
    const podId = seedPod(h, {
      status: 'beached',
      lanes: [
        { kind: 'matriarch', status: 'running' },
        { kind: 'calf', status: 'running' },
      ],
    });
    const [matriarchId, calfId] = laneIds(h, podId) as string[];

    await h.manager.closePod(podId);

    // `'beached'` records a CAUSE and its affordance is Reconnect; rewriting
    // its lanes as deliberately stopped would assert the opposite of what
    // happened. Those lanes belong to the boot sweep.
    expect(h.raw.getLane(matriarchId as string)?.status).toBe('running');
    expect(h.raw.getLane(matriarchId as string)?.endedAt).toBeNull();
    expect(h.raw.getLane(calfId as string)?.status).toBe('running');
    expect(h.raw.getLane(calfId as string)?.endedAt).toBeNull();
    expect(laneClosedEvents(h, podId)).toHaveLength(0);
    expect(h.spy.writes.filter((write) => write.method === 'setLaneStatus')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Criterion 5 — idempotence, the coverage gap promoted at
// `2026-08-20-orcastrate-pod-lifecycle`'s Gate 3
// ---------------------------------------------------------------------------

describe('criterion 5: a second closePod against an already-closed Pod', () => {
  it('does not restamp endedAt, appends no second lane_closed, and does not throw', async () => {
    const h = harness();
    const { podId, matriarchId, runningCalfId } = seedOpenPodWithLanes(h);

    await h.manager.closePod(podId);
    const firstEndedAt = h.raw.getLane(matriarchId)?.endedAt;
    const firstCalfEndedAt = h.raw.getLane(runningCalfId)?.endedAt;
    const firstEventCount = eventsFor(h, podId).length;
    const firstLaneChanged = h.pushesOn<LaneChangedPush>(EVENT_CHANNELS.laneChanged).length;

    // The clock advances on every read, so a restamp would be visible as a
    // different ISO string rather than as a coincidence.
    await expect(h.manager.closePod(podId)).resolves.toBeUndefined();

    // A duration that jumped forward when a user clicked Stop on an
    // already-stopped Pod would be a lie about when the work ended.
    expect(h.raw.getLane(matriarchId)?.endedAt).toBe(firstEndedAt);
    expect(h.raw.getLane(runningCalfId)?.endedAt).toBe(firstCalfEndedAt);
    expect(h.raw.getLane(matriarchId)?.status).toBe('stopped');
    expect(eventsFor(h, podId)).toHaveLength(firstEventCount);
    expect(laneClosedEvents(h, podId)).toHaveLength(2);
    expect(h.pushesOn<LaneChangedPush>(EVENT_CHANNELS.laneChanged)).toHaveLength(firstLaneChanged);
    expect(h.raw.getPod(podId)?.status).toBe('closed');
  });
});

// ---------------------------------------------------------------------------
// Criterion 7 — nothing is swallowed to keep the path quiet
// ---------------------------------------------------------------------------

describe('criterion 7: a failing sweep propagates to closePod’s caller', () => {
  it('rethrows an appendMany failure rather than closing the Pod quietly', async () => {
    const h = harness();
    const { podId } = seedOpenPodWithLanes(h);
    const boom = new Error('disk full');
    // Own property on the real store instance; the harness proxy reads through
    // to it, so this is the store failing, not a mock pretending to.
    (h.raw as unknown as { appendMany: () => never }).appendMany = (): never => {
      throw boom;
    };

    await expect(h.manager.closePod(podId)).rejects.toThrow(boom);

    // The IPC caller sees the failure; the Pod is NOT reported closed on a
    // sweep that did not finish.
    expect(h.raw.getPod(podId)?.status).not.toBe('closed');
  });
});
