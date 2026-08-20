/**
 * The other half of this task: what happens to a Pod's status and to its
 * Matriarch lane AFTER the boot sweep has run.
 *
 * The sweep on its own is a one-way door — it orphans the Matriarch and nothing
 * puts it back — and `'closed'` on its own is a race, because `PodRunner.stop()`
 * ends by emitting `'idle'` and `closePod` calls `stop()` BEFORE it writes
 * `'closed'`. Both are tested here rather than reasoned about, because both are
 * invisible to a reviewer reading statement order.
 */

import { describe, expect, it, afterEach } from 'vitest';

import type { LaneChangedPush, PodStatusPush } from '../../../src/shared/contracts/ipc';
import { EVENT_CHANNELS } from '../../../src/shared/contracts/ipc';
import {
  expectOpennessAgrees,
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

// ---------------------------------------------------------------------------
// Criterion 8 — reconciliation is reversible
// ---------------------------------------------------------------------------

describe('criterion 8: opening a swept Pod revives its Matriarch, and only its Matriarch', () => {
  it("puts the Matriarch back to 'running' with endedAt cleared while an orphaned Calf stays orphaned", async () => {
    const h = harness();
    const podId = seedPod(h, {
      status: 'running',
      lanes: [
        { kind: 'matriarch', status: 'running' },
        { kind: 'calf', status: 'running' },
      ],
    });
    const [matriarchId, calfId] = laneIds(h, podId);

    h.manager.reconcileStartup();
    expect(h.raw.getLane(matriarchId as string)?.status).toBe('orphaned');

    await h.manager.openPod(podId);

    // Without this the sweep is a ONE-WAY DOOR: every subsequent Open would
    // leave the rail showing the Matriarch as Orphaned forever while the Pod
    // ran normally underneath it.
    const matriarch = h.raw.getLane(matriarchId as string);
    expect(matriarch?.status).toBe('running');
    // No `endedAt`, which is what the
    // `(status = 'running') = (ended_at IS NULL)` CHECK requires.
    expect(matriarch?.endedAt).toBeNull();

    // A Calf's worker process is genuinely gone and cannot be resumed, so
    // `orphaned` is the truth for it.
    expect(h.raw.getLane(calfId as string)?.status).toBe('orphaned');
  });

  it('pushes laneChanged carrying the refreshed list', async () => {
    const h = harness();
    const podId = seedPod(h, { status: 'running' });
    const [matriarchId] = laneIds(h, podId);
    h.manager.reconcileStartup();

    await h.manager.openPod(podId);

    const pushes = h.pushesOn<LaneChangedPush>(EVENT_CHANNELS.laneChanged);
    const revival = pushes.find((push) =>
      push.lanes.some((lane) => lane.id === matriarchId && lane.status === 'running'),
    );
    expect(revival?.podId).toBe(podId);
    // The list is refreshed AFTER the write, or the renderer redraws the row it
    // was already showing.
    expect(revival?.lanes).toEqual(h.raw.listLanes(podId));
  });

  it('leaves an already-running Matriarch untouched, writing nothing', async () => {
    const h = harness();
    const podId = seedPod(h, { status: 'closed' });

    await h.manager.openPod(podId);

    expect(h.spy.writes.filter((w) => w.method === 'setLaneStatus')).toHaveLength(0);
  });

  it('revives on reconnect too, because both routes go through #start', async () => {
    const h = harness();
    const podId = seedPod(h, { status: 'beached' });
    const [matriarchId] = laneIds(h, podId);
    h.manager.reconcileStartup();
    expect(h.raw.getLane(matriarchId as string)?.status).toBe('orphaned');

    await h.manager.reconnectPod(podId);

    expect(h.raw.getLane(matriarchId as string)?.status).toBe('running');
    expect(h.raw.getLane(matriarchId as string)?.endedAt).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Criteria 9 and 10 — the two status writes, and the close race
// ---------------------------------------------------------------------------

describe('criterion 9: the status writes that move to closed', () => {
  it("closePod persists and pushes 'closed'", async () => {
    const h = harness();
    const podId = seedPod(h, { status: 'closed' });
    await h.manager.openPod(podId);
    expect(h.raw.getPod(podId)?.status).toBe('idle');

    await h.manager.closePod(podId);

    expect(h.raw.getPod(podId)?.status).toBe('closed');
    expect(h.statusPushes(podId).at(-1)).toEqual({ podId, status: 'closed' });
  });

  it("preserves the 'beached' guard: closing a Beached Pod keeps its status and its cause", async () => {
    const h = harness();
    const podId = seedPod(h, { status: 'closed' });
    h.script(podId, { failStartWith: new Error('spawn failed') });
    await expect(h.manager.openPod(podId)).rejects.toThrow();
    expect(h.raw.getPod(podId)?.status).toBe('beached');
    const beachedPush = h.statusPushes(podId).at(-1);

    await h.manager.closePod(podId);

    // Rewriting it would erase why the Pod stopped and send the user to `Open`
    // instead of `Reconnect`.
    expect(h.raw.getPod(podId)?.status).toBe('beached');
    expect(h.statusPushes(podId).at(-1)).toEqual(beachedPush);
  });

  it("#start's success tail still writes 'idle', whose meaning is now exact", async () => {
    const h = harness();
    const podId = seedPod(h, { status: 'closed' });

    await h.manager.openPod(podId);

    expect(h.raw.getPod(podId)?.status).toBe('idle');
    expect(h.statusPushes(podId).at(-1)).toEqual({ podId, status: 'idle' });
  });
});

describe('criterion 10: the close race that closed exposes', () => {
  it("survives a stop() that emits onStatus('idle') from inside #dispose", async () => {
    const h = harness();
    const podId = seedPod(h, { status: 'closed' });
    // The real `PodRunner.stop()` ends with `#setStatus('idle')`, which reaches
    // this class's `onStatus` handler and writes `'idle'`. `closePod` calls
    // `#dispose` — which calls `stop()` — and only THEN writes `'closed'`.
    h.script(podId, { emitOnStop: ['idle'] });
    await h.manager.openPod(podId);

    const before = h.statusPushes(podId).length;
    await h.manager.closePod(podId);

    expect(h.raw.getPod(podId)?.status).toBe('closed');
    // No push after the close carries `'idle'` — a status push for a Pod that
    // has no runner is a lie the renderer would believe.
    const after = h.statusPushes(podId).slice(before);
    expect(after.map((push) => push.status)).toEqual(['closed']);
  });

  it('drops a late runner callback that arrives after the session was disposed', async () => {
    const h = harness();
    const podId = seedPod(h, { status: 'closed' });
    await h.manager.openPod(podId);
    const runner = h.runner(podId);
    await h.manager.closePod(podId);

    const before = h.statusPushes(podId).length;
    // A disposed session speaks for nothing. Relying on `closePod`'s statement
    // order instead would leave a reorder to reintroduce the bug silently.
    runner.handlers?.onStatus('running');

    expect(h.raw.getPod(podId)?.status).toBe('closed');
    expect(h.statusPushes(podId)).toHaveLength(before);
  });
});

// ---------------------------------------------------------------------------
// Criterion 11 — openness and the session registry never disagree
// ---------------------------------------------------------------------------

describe('criterion 11: #sessions.has(podId) agrees with the derived openness', () => {
  it('after every public method, including a start that failed', async () => {
    const h = harness();

    const created = h.manager.createPod({
      title: 'Invariant',
      cwd: process.cwd(),
      permissionMode: 'default',
    });
    const podId = created.id;
    // A Pod that has NEVER been opened is closed: there is no process.
    expect((await expectOpennessAgrees(h, podId, 'createPod')).pod?.status).toBe('closed');

    expect((await expectOpennessAgrees(h, podId, 'openPod')).open).toBe(false);
    await h.manager.openPod(podId);
    expect((await expectOpennessAgrees(h, podId, 'openPod')).open).toBe(true);

    await h.manager.closePod(podId);
    expect((await expectOpennessAgrees(h, podId, 'closePod')).open).toBe(false);

    await h.manager.reconnectPod(podId);
    expect((await expectOpennessAgrees(h, podId, 'reconnectPod')).open).toBe(true);

    h.script(podId, { failStartWith: new Error('spawn failed') });
    await h.manager.closePod(podId);
    await expect(h.manager.openPod(podId)).rejects.toThrow();
    const failed = await expectOpennessAgrees(h, podId, 'a start that failed');
    expect(failed.pod?.status).toBe('beached');
    expect(failed.open).toBe(false);

    await h.manager.deletePod(podId);
    expect((await expectOpennessAgrees(h, podId, 'deletePod')).pod).toBeNull();
  });

  it('holds across the boot sweep, which by construction leaves no session open', async () => {
    const h = harness();
    const swept = seedPod(h, { status: 'running' });
    const beached = seedPod(h, { status: 'beached' });

    h.manager.reconcileStartup();

    await expectOpennessAgrees(h, swept, 'reconcileStartup');
    await expectOpennessAgrees(h, beached, 'reconcileStartup');
  });
});

// ---------------------------------------------------------------------------
// Criterion 12 — the manager half of the reap
// ---------------------------------------------------------------------------

describe('criterion 12: a failed start reaps its own runner', () => {
  it('calls stop() exactly once, and a throwing stop() does not mask the start error', async () => {
    const h = harness();
    const podId = seedPod(h, { status: 'closed' });
    const startErr = Object.assign(new Error('cwd does not exist'), { code: 'CWD_MISSING' });
    h.script(podId, {
      failStartWith: startErr,
      failStopWith: new Error('teardown also failed'),
    });

    // The error the caller receives is still the START error, with its
    // CWD_MISSING / SPAWN_FAILED / RESUME_FAILED classification intact — that
    // classification lives on it and nowhere else.
    await expect(h.manager.openPod(podId)).rejects.toBe(startErr);
    expect(h.runner(podId).stopCalls).toBe(1);
    // Secondary but real: the teardown failure is logged, not swallowed.
    expect(h.logged.some((entry) => entry.level === 'warn')).toBe(true);
  });

  it("leaves the Pod 'beached' after a failed start — never 'idle' and never 'closed'", async () => {
    const h = harness();
    const podId = seedPod(h, { status: 'closed' });
    // `stop()` emits `'idle'` on the way out on this path too; it must not
    // overwrite the resting state a failed start is entitled to.
    h.script(podId, { failStartWith: new Error('spawn failed'), emitOnStop: ['idle'] });

    await expect(h.manager.openPod(podId)).rejects.toThrow('spawn failed');

    // A start that FAILED is a failure with a cause, and its affordance is
    // `Reconnect`, not `Open`.
    expect(h.raw.getPod(podId)?.status).toBe('beached');
    const last = h.statusPushes(podId).at(-1);
    expect(last?.status).toBe('beached');
    expect(h.statusPushes(podId).map((push) => push.status)).not.toContain('idle');
  });
});
