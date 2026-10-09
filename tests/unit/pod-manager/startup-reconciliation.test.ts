/**
 * The boot sweep: `PodManager.reconcileStartup()`.
 *
 * The defect, reproduced on 2026-08-20: with the app closed and no Claude Code
 * process alive, `orcastrate.db` held Matriarch lanes at `status: 'running'`
 * with `ended_at: null`, and on relaunch the rail rendered them Running with a
 * duration ticking from the original `started_at`. Nothing reconciled the store
 * against the fact that a process restart destroys every runner.
 *
 * Every test here seeds rows DIRECTLY, which is the honest model of a previous
 * process: the sweep's input is a database, not a session.
 */

import { afterEach, describe, expect, it } from 'vitest';

import {
  STARTUP_RECONCILIATION_REASON,
  STARTUP_RECONCILIATION_SUBTYPE,
} from '../../../src/main/pod-manager';
import {
  eventsFor,
  laneIds,
  makeManagerHarness,
  seedPod,
  systemData,
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

describe('step (a): every running lane is orphaned', () => {
  it('orphans a running Matriarch AND a running Calf, stamping both from one now()', () => {
    const h = harness();
    const podId = seedPod(h, {
      status: 'running',
      lanes: [
        { kind: 'matriarch', status: 'running' },
        { kind: 'calf', status: 'running' },
      ],
    });

    const result = h.manager.reconcileStartup();

    const lanes = h.raw.listLanes(podId);
    expect(lanes.map((lane) => lane.status)).toEqual(['orphaned', 'orphaned']);
    // ONE `now()` for the whole sweep, so a reader can join every row it wrote.
    for (const lane of lanes) expect(lane.endedAt).toBe(result.at);
    expect(result.pods[0]?.orphanedLaneIds).toEqual(lanes.map((lane) => lane.id));
  });

  it('leaves a lane that already ended alone', () => {
    const h = harness();
    const podId = seedPod(h, {
      status: 'idle',
      lanes: [
        { kind: 'matriarch', status: 'running' },
        { kind: 'calf', status: 'done' },
      ],
    });
    const [matriarchId, calfId] = laneIds(h, podId);

    h.manager.reconcileStartup();

    expect(h.raw.getLane(matriarchId as string)?.status).toBe('orphaned');
    const calf = h.raw.getLane(calfId as string);
    expect(calf?.status).toBe('done');
    expect(h.spy.writes.filter((w) => w.method === 'setLaneStatus')).toHaveLength(1);
  });
});

describe('step (b): the durable record', () => {
  it('appends the system notice then one lane_closed per orphaned lane, in one contiguous seq run', () => {
    const h = harness();
    const podId = seedPod(h, {
      status: 'running',
      lanes: [
        { kind: 'matriarch', status: 'running' },
        { kind: 'calf', status: 'running' },
        { kind: 'calf', status: 'running' },
      ],
    });
    const ids = laneIds(h, podId);

    h.manager.reconcileStartup();

    // ONE appendMany, so the batch is all-or-nothing.
    expect(h.spy.writes.filter((w) => w.method === 'appendMany')).toHaveLength(1);
    expect(h.spy.writes.filter((w) => w.method === 'append')).toHaveLength(0);

    const events = eventsFor(h, podId);
    expect(events).toHaveLength(4);
    expect(events.map((e) => e.type)).toEqual([
      'system',
      'lane_closed',
      'lane_closed',
      'lane_closed',
    ]);
    // The notice rides the Matriarch lane; each closure rides its OWN lane.
    expect(events.map((e) => e.laneId)).toEqual([ids[0], ids[0], ids[1], ids[2]]);
    for (const closed of events.slice(1)) {
      expect(closed.payload).toMatchObject({ type: 'lane_closed', status: 'orphaned' });
      if (closed.payload.type !== 'lane_closed') throw new Error('narrowing');
      expect(closed.payload.laneId).toBe(closed.laneId);
    }
    // Contiguous, in that order.
    expect(events.map((e) => e.seq)).toEqual([1, 2, 3, 4]);
  });

  it('carries the exact reason sentence, the subtype and no raw', () => {
    const h = harness();
    const podId = seedPod(h, { status: 'waiting' });

    const result = h.manager.reconcileStartup();
    const [notice] = eventsFor(h, podId);
    if (notice === undefined) throw new Error('no notice was appended');

    // The marker the sweep STAMPED, against its single definition. Both sides
    // were literals here; that pinned the string and said nothing about the
    // wiring, which is the half that can break.
    expect(notice.payload).toMatchObject({
      type: 'system',
      subtype: STARTUP_RECONCILIATION_SUBTYPE,
    });
    // Verbatim, and spelled out: the one place the SENTENCE is pinned as words
    // rather than as a reference. It already names `Open`, which is the
    // affordance `'closed'` selects, and rewording it desyncs the transcript
    // from the control.
    expect(systemData(notice).reason).toBe(
      'Orcastrate restarted while this Pod was still open. No Claude Code process ' +
        'survives an application restart, so lanes left running were marked ' +
        'Orphaned. Press Open to start this Pod again.',
    );
    expect(systemData(notice).reason).toBe(STARTUP_RECONCILIATION_REASON);
    expect(systemData(notice)).toMatchObject({
      subtypeMarker: STARTUP_RECONCILIATION_SUBTYPE,
      statusBefore: 'waiting',
      statusAfter: 'closed',
      orphanedLaneIds: laneIds(h, podId),
      at: result.at,
    });
    // Both appended events are SYNTHETIC, so neither carries `raw`.
    for (const event of eventsFor(h, podId)) expect(event.raw).toBeUndefined();
  });
});

describe('step (c): every non-beached Pod becomes closed (the E1 amendment)', () => {
  it("rewrites an 'idle' Pod with NO running lane to 'closed', with no system event, but DOES list it", () => {
    const h = harness();
    // The case the first draft's rule left alone as "already correct". Under
    // Option 3 `'idle'` means OPEN AND BETWEEN TURNS, and at boot no runner
    // exists by construction, so this row is a lie.
    const podId = seedPod(h, {
      status: 'idle',
      lanes: [{ kind: 'matriarch', status: 'done' }],
    });

    const result = h.manager.reconcileStartup();

    expect(h.raw.getPod(podId)?.status).toBe('closed');
    expect(eventsFor(h, podId)).toHaveLength(0);
    expect(result.pods).toEqual([
      { podId, statusBefore: 'idle', statusAfter: 'closed', orphanedLaneIds: [] },
    ]);
  });

  it.each(['idle', 'running', 'waiting'] as const)("converges '%s' to 'closed'", (status) => {
    const h = harness();
    const podId = seedPod(h, { status });
    h.manager.reconcileStartup();
    expect(h.raw.getPod(podId)?.status).toBe('closed');
  });
});

describe('step (d) and idempotence', () => {
  it("writes nothing for a Pod already 'closed' with no running lane", () => {
    const h = harness();
    const podId = seedPod(h, {
      status: 'closed',
      lanes: [{ kind: 'matriarch', status: 'orphaned' }],
    });

    const result = h.manager.reconcileStartup();

    expect(h.spy.writes).toEqual([]);
    expect(result.pods.map((p) => p.podId)).not.toContain(podId);
  });

  it('a second sweep with no intervening runner writes no row and returns no pods', () => {
    const h = harness();
    seedPod(h, {
      status: 'running',
      lanes: [
        { kind: 'matriarch', status: 'running' },
        { kind: 'calf', status: 'running' },
      ],
    });
    seedPod(h, { status: 'idle', lanes: [{ kind: 'matriarch', status: 'done' }] });
    seedPod(h, { status: 'beached' });

    const first = h.manager.reconcileStartup();
    expect(first.pods.length).toBe(3);

    h.spy.reset();
    const second = h.manager.reconcileStartup();

    expect(second.pods).toEqual([]);
    expect(h.spy.writes).toEqual([]);
  });
});

describe('criterion 4: no transcript row for a pure status correction', () => {
  it('emits the system event for exactly the Pod whose lanes were reconciled', () => {
    const h = harness();
    const withRunner = seedPod(h, {
      status: 'running',
      lanes: [{ kind: 'matriarch', status: 'running' }],
    });
    const merelyIdle = seedPod(h, {
      status: 'idle',
      lanes: [{ kind: 'matriarch', status: 'done' }],
    });

    h.manager.reconcileStartup();

    // If step (c)'s wider rule also emitted a notice, every Pod would carry a
    // reconciliation row on every relaunch — noise that trains the user to
    // ignore the one notice that matters.
    const notices = [withRunner, merelyIdle].filter(
      (podId) => eventsFor(h, podId).some((e) => e.type === 'system'),
    );
    expect(notices).toEqual([withRunner]);
    expect(h.raw.getPod(merelyIdle)?.status).toBe('closed');
  });
});

describe('criterion 5: lastActiveAt survives the sweep', () => {
  it('leaves a stamp days in the past byte-identical', () => {
    const h = harness();
    const lastActiveAt = '2026-08-11T09:15:42.123Z';
    const podId = seedPod(h, { status: 'idle', lastActiveAt });
    expect(h.raw.getPod(podId)?.lastActiveAt).toBe(lastActiveAt);

    h.manager.reconcileStartup();

    // `updatePod` refreshes `lastActiveAt` to now unless it is supplied, and
    // this sweep touches EVERY non-beached Pod on EVERY boot — so omitting it
    // would reset every Pod's last-used stamp to boot time on every launch and
    // destroy the field within one session of use.
    expect(h.raw.getPod(podId)?.status).toBe('closed');
    expect(h.raw.getPod(podId)?.lastActiveAt).toBe(lastActiveAt);
  });

  it('passes lastActiveAt explicitly on the status write', () => {
    const h = harness();
    const lastActiveAt = '2026-08-11T09:15:42.123Z';
    const podId = seedPod(h, { status: 'running', lastActiveAt });

    h.manager.reconcileStartup();

    const write = h.spy.writes.find((w) => w.method === 'updatePod');
    expect(write?.args[0]).toBe(podId);
    expect(write?.args[1]).toEqual({ status: 'closed', lastActiveAt });
  });
});

describe("criterion 6: 'beached' is not rewritten", () => {
  it('reconciles a beached Pod’s lanes while leaving its status and cause untouched', () => {
    const h = harness();
    const podId = seedPod(h, {
      status: 'beached',
      lastActiveAt: '2026-08-12T00:00:00.000Z',
      lanes: [{ kind: 'matriarch', status: 'running' }],
    });
    const before = h.raw.getPod(podId);

    const result = h.manager.reconcileStartup();

    expect(h.raw.listLanes(podId)[0]?.status).toBe('orphaned');
    // Rewriting it to `'closed'` would erase why the Pod stopped and send the
    // user to `Open` instead of `Reconnect` — a data loss, not a fix.
    expect(h.raw.getPod(podId)).toEqual(before);
    expect(h.spy.writes.some((w) => w.method === 'updatePod')).toBe(false);
    expect(result.pods).toEqual([
      {
        podId,
        statusBefore: 'beached',
        statusAfter: 'beached',
        orphanedLaneIds: laneIds(h, podId),
      },
    ]);
  });
});

describe('ordering across Pods', () => {
  it('sweeps in listPods order and writes lanes before the pod status', () => {
    const h = harness();
    const podId = seedPod(h, { status: 'running' });

    h.manager.reconcileStartup();

    const methods = h.spy.writes.map((w) => w.method);
    // Lanes first, so a crash mid-sweep leaves lanes reconciled and the status
    // stale — recoverable next boot — rather than a Pod already 'closed' with
    // running lanes, which is the bug this fixes.
    expect(methods).toEqual(['setLaneStatus', 'appendMany', 'updatePod']);
    expect(h.raw.getPod(podId)?.status).toBe('closed');
  });
});
