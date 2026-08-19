/**
 * The assembled stream pipeline (criteria 6, 7, 10), plus the two persistence
 * hazards the T4/T5 reviews flagged and the E4 agentId backfill.
 *
 * A captured fixture is driven through the REAL pipeline —
 * `PodRunner.onMessage -> LaneRouter.ingest -> EventStore.appendMany ->
 * push:podEvent` — against an in-memory store. Nothing is stubbed between the
 * SDK boundary and the push, so an assertion here is an assertion about what
 * the renderer would actually receive.
 */

import { afterEach, describe, expect, it } from 'vitest';

import type { Lane, NormalizedEvent, Pod } from '../../../src/shared/contracts/events';
import type { PodEventPush, PodStatusPush } from '../../../src/shared/contracts/ipc';
import { EVENT_CHANNELS, INVOKE_CHANNELS } from '../../../src/shared/contracts/ipc';
import { UNROUTED_LANE_ID } from '../../../src/main/pod';

import { driveFixture, makeHarness, openPod, tick, type Harness } from './helpers';

const harnesses: Harness[] = [];

function harness(): Harness {
  const made = makeHarness();
  harnesses.push(made);
  return made;
}

afterEach(async () => {
  while (harnesses.length > 0) await harnesses.pop()?.dispose();
});

function pushedEvents(h: Harness): NormalizedEvent[] {
  return h.pushesOn<PodEventPush>(EVENT_CHANNELS.podEvent).flatMap((push) => push.events);
}

describe('one runner per open Pod (criterion 6)', () => {
  it('opening the same Pod twice does not create a second runner', async () => {
    const h = harness();
    const podId = await openPod(h);
    expect(h.runnerCount(podId)).toBe(1);

    const again = await h.invoke<Pod>(INVOKE_CHANNELS.podOpen, podId);
    expect(again.ok).toBe(true);
    expect(h.runnerCount(podId)).toBe(1);
  });

  it('two concurrent opens still create only one runner', async () => {
    const h = harness();
    const created = await h.invoke<Pod>(INVOKE_CHANNELS.podCreate, {
      title: 'Racy',
      cwd: process.cwd(),
      permissionMode: 'default',
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const podId = created.value.id;

    const [a, b] = await Promise.all([
      h.invoke<Pod>(INVOKE_CHANNELS.podOpen, podId),
      h.invoke<Pod>(INVOKE_CHANNELS.podOpen, podId),
    ]);
    expect(a.ok && b.ok).toBe(true);
    expect(h.runnerCount(podId)).toBe(1);
  });

  it('pod:close disposes the runner, and reopening builds a fresh one', async () => {
    const h = harness();
    const podId = await openPod(h);

    const closed = await h.invoke(INVOKE_CHANNELS.podClose, podId);
    expect(closed.ok).toBe(true);

    // The runner is gone: control calls now answer NOT_RUNNING rather than
    // silently succeeding against a dead session.
    const send = await h.invoke(INVOKE_CHANNELS.podSend, podId, 'hello');
    expect(send.ok).toBe(false);
    if (!send.ok) expect(send.error.code).toBe('NOT_RUNNING');

    const reopened = await h.invoke<Pod>(INVOKE_CHANNELS.podOpen, podId);
    expect(reopened.ok).toBe(true);
    expect(h.runnerCount(podId)).toBe(2);
  });

  it('app quit disposes every live runner', async () => {
    const h = harness();
    const first = await openPod(h, { title: 'One' });
    const second = await openPod(h, { title: 'Two' });

    await h.manager.disposeAll();

    for (const podId of [first, second]) {
      const send = await h.invoke(INVOKE_CHANNELS.podSend, podId, 'hi');
      expect(send.ok).toBe(false);
      if (!send.ok) expect(send.error.code).toBe('NOT_RUNNING');
    }
  });
});

describe('stream events flow end to end (criterion 7)', () => {
  it('pushes store-assigned seq in ascending order with no gaps', async () => {
    const h = harness();
    const podId = await openPod(h);
    await driveFixture(h, podId, '01-parallel-dispatch.ndjson');

    const pushed = pushedEvents(h);
    expect(pushed.length).toBeGreaterThan(10);

    const seqs = pushed.map((event) => event.seq);
    expect(seqs).toEqual(seqs.map((_, index) => index + 1));

    // Each batch is non-empty and internally ordered, per the push contract.
    for (const push of h.pushesOn<PodEventPush>(EVENT_CHANNELS.podEvent)) {
      expect(push.podId).toBe(podId);
      expect(push.events.length).toBeGreaterThan(0);
    }
  });

  it('what was pushed is exactly what was persisted', async () => {
    const h = harness();
    const podId = await openPod(h);
    await driveFixture(h, podId, '01-parallel-dispatch.ndjson');

    const pushed = pushedEvents(h);
    const read = await h.invoke<{ events: NormalizedEvent[]; hasMore: boolean }>(
      INVOKE_CHANNELS.eventsRead,
      { podId, limit: 5000 },
    );
    expect(read.ok).toBe(true);
    if (!read.ok) return;

    expect(read.value.events.map((event) => event.seq)).toEqual(pushed.map((e) => e.seq));
    expect(read.value.events.map((event) => event.type)).toEqual(pushed.map((e) => e.type));
    expect(read.value.hasMore).toBe(false);
  });

  it('paginates with an honest hasMore', async () => {
    const h = harness();
    const podId = await openPod(h);
    await driveFixture(h, podId, '01-parallel-dispatch.ndjson');

    const firstPage = await h.invoke<{ events: NormalizedEvent[]; hasMore: boolean }>(
      INVOKE_CHANNELS.eventsRead,
      { podId, limit: 3 },
    );
    expect(firstPage.ok).toBe(true);
    if (!firstPage.ok) return;
    expect(firstPage.value.events).toHaveLength(3);
    expect(firstPage.value.hasMore).toBe(true);
  });
});

describe('lane persistence hazards', () => {
  it('restamps the runner sentinel lane id onto the Matriarch before persisting', async () => {
    const h = harness();
    const podId = await openPod(h);
    // 05-malformed carries a line that is not JSON at all, which makes the
    // runner emit a synthetic event carrying UNROUTED_LANE_ID ('').
    await driveFixture(h, podId, '05-malformed.ndjson');

    const malformed = pushedEvents(h).filter((event) => event.type === 'malformed');
    expect(malformed.length).toBeGreaterThan(0);

    const matriarch = h.store.getMatriarchLane(podId);
    expect(matriarch).not.toBeNull();
    for (const event of malformed) {
      expect(event.laneId).not.toBe(UNROUTED_LANE_ID);
      expect(event.laneId).toBe(matriarch?.id);
    }

    // Nothing anywhere reached the store with a lane the store does not hold.
    const laneIds = new Set(h.store.listLanes(podId).map((lane) => lane.id));
    for (const event of pushedEvents(h)) {
      expect(laneIds.has(event.laneId), `event ${event.seq} referenced ${event.laneId}`).toBe(true);
    }
  });

  /**
   * REGRESSION (review B1). `#routeLane` used to run before the lane row was
   * created, so a `lane_opened` — which in 'lanes' mode is stamped with the id
   * of the very Calf it announces — found its own id unknown and was redirected
   * onto the Matriarch. That silently discarded the router's lane assignment
   * AND fired the unknown-lane drift warning on every normal dispatch, which
   * would have masked the genuine routing bug the warning exists to catch.
   */
  it('delivers the router lane assignment through to the push, for lane_opened too', async () => {
    const h = harness();
    const podId = await openPod(h);
    await driveFixture(h, podId, '01-parallel-dispatch.ndjson');

    const matriarchId = h.store.getMatriarchLane(podId)?.id;
    const opened = pushedEvents(h).filter((event) => event.payload.type === 'lane_opened');
    expect(opened).toHaveLength(2);

    for (const event of opened) {
      if (event.payload.type !== 'lane_opened') continue;
      // The Calf's opening marker belongs in the CALF's stream, not the
      // Matriarch's — a renderer filtering by `event.laneId` depends on it.
      expect(event.laneId).toBe(event.payload.lane.id);
      expect(event.laneId).not.toBe(matriarchId);
    }

    // Every Calf event, not just the opener, keeps the lane the router chose.
    const laneIds = new Set(pushedEvents(h).map((event) => event.laneId));
    expect(laneIds.size).toBe(3);
  });

  it('logs no drift warning during a clean fixture drive', async () => {
    const h = harness();
    const podId = await openPod(h);
    for (const fixture of [
      '01-parallel-dispatch.ndjson',
      '02-nested-dispatch.ndjson',
      '03-tool-result-close.ndjson',
      '04-orphaned-calf.ndjson',
    ]) {
      await driveFixture(h, podId, fixture);
    }

    // The unknown-lane and reparent branches are DRIFT DETECTORS. If they fire
    // on normal traffic they are both wrong and useless — wrong because the
    // event was silently rerouted, useless because the noise hides a real one.
    expect(h.logged, JSON.stringify(h.logged)).toEqual([]);
  });

  it('logs no drift warning for permission prompts raised on the normal path', async () => {
    const h = harness();
    const podId = await openPod(h);
    await driveFixture(h, podId, '01-parallel-dispatch.ndjson');

    const calf = h.store
      .listLanes(podId)
      .find((lane) => lane.kind === 'calf' && lane.agentId !== null);
    expect(calf?.agentId, 'fixture produced no Calf carrying an agentId').toBeTruthy();

    // Both normal shapes, in one drive: an unattributed prompt (the Matriarch
    // asked) and an attributed one that resolves (a Calf asked). Neither is
    // drift, so the attribution fallback's detector must not fire for either.
    const prompts = [
      { requestId: 'clean-matriarch', toolUseID: '' },
      { requestId: 'clean-calf', toolUseID: '', agentID: calf?.agentId as string },
    ];
    for (const { requestId, ...attribution } of prompts) {
      const decision = h
        .sdk(podId)
        .callCanUseTool('Bash', { command: 'ls' }, { requestId, ...attribution });
      await tick();
      await h.invoke(INVOKE_CHANNELS.permissionRespond, { podId, requestId, decision: 'allow' });
      await decision;
    }

    expect(h.logged, JSON.stringify(h.logged)).toEqual([]);
  });

  it('creates lane rows from payload.lane.id, not from the carrying event laneId', async () => {
    const h = harness();
    const podId = await openPod(h);
    await driveFixture(h, podId, '01-parallel-dispatch.ndjson');

    const lanes = h.store.listLanes(podId);
    const calves = lanes.filter((lane) => lane.kind === 'calf');
    expect(calves).toHaveLength(2);
    expect(calves.map((lane) => lane.toolUseId).sort()).toEqual(
      ['toolu_014RozzngRfFYKEoprURtB63', 'toolu_01WX1FPH7kp2Umpa7GHKHcMe'].sort(),
    );

    // Every lane the router opened has its own row — none collapsed onto the
    // Matriarch, which is what keying off `event.laneId` would have done.
    const opened = pushedEvents(h).filter((event) => event.payload.type === 'lane_opened');
    for (const event of opened) {
      if (event.payload.type !== 'lane_opened') continue;
      expect(h.store.getLane(event.payload.lane.id)).not.toBeNull();
    }

    const list = await h.invoke<Lane[]>(INVOKE_CHANNELS.laneList, podId);
    expect(list.ok && list.value.length).toBe(lanes.length);
  });

  it('closes lane rows when the router closes the lane', async () => {
    const h = harness();
    const podId = await openPod(h);
    await driveFixture(h, podId, '03-tool-result-close.ndjson');

    const calves = h.store.listLanes(podId).filter((lane) => lane.kind === 'calf');
    expect(calves.length).toBeGreaterThan(0);
    for (const lane of calves) {
      expect(['done', 'orphaned']).toContain(lane.status);
      expect(lane.endedAt).not.toBeNull();
    }
  });
});

/**
 * E4 — OUT OF THIS TASK'S FROZEN ACCEPTANCE CRITERIA.
 *
 * Implemented on the orchestrator's instruction and flagged as advisory. The
 * router banks `agentId` internally and exposes it only through the pull-only
 * `agentIds()`; `EventStore.setLaneAgentId` exists for the backfill; nothing
 * connected them. Without the connection `lanes.agent_id` is permanently NULL
 * and spec 5.3's Steer feature has nothing to interpolate.
 */
describe('E4 (out of criteria): agentId backfill has a trigger', () => {
  it('persists every agentId the router learns', async () => {
    const h = harness();
    const podId = await openPod(h);
    await driveFixture(h, podId, '01-parallel-dispatch.ndjson');

    const calves = h.store.listLanes(podId).filter((lane) => lane.kind === 'calf');
    expect(calves).toHaveLength(2);
    for (const lane of calves) {
      expect(lane.agentId, `lane ${lane.id} was never backfilled`).not.toBeNull();
    }
  });

  it('leaves nothing the router knows unpersisted', async () => {
    const h = harness();
    const podId = await openPod(h);
    await driveFixture(h, podId, '02-nested-dispatch.ndjson');

    const persisted = new Map(
      h.store
        .listLanes(podId)
        .filter((lane) => lane.agentId !== null)
        .map((lane) => [lane.id, lane.agentId]),
    );
    expect(persisted.size).toBeGreaterThan(0);

    // Same lane ids, same values — the diff loop left no known id behind.
    for (const lane of h.store.listLanes(podId)) {
      if (lane.kind === 'matriarch') continue;
      expect(persisted.get(lane.id) ?? null).toBe(lane.agentId);
    }
  });
});

describe('beaching and reconnect (criterion 10)', () => {
  it('marks the Pod beached and pushes the exit code', async () => {
    const h = harness();
    const podId = await openPod(h);
    await driveFixture(h, podId, '01-parallel-dispatch.ndjson');

    const died = Object.assign(new Error('Claude Code process exited with code 3'), {
      exitCode: 3,
    });
    h.sdk(podId).failStream(died);
    await tick(3);

    const beached = h
      .pushesOn<PodStatusPush>(EVENT_CHANNELS.podStatus)
      .filter((push) => push.status === 'beached');
    expect(beached).toHaveLength(1);
    expect(beached[0]?.podId).toBe(podId);
    expect(beached[0]?.exitCode).toBe(3);

    expect(h.store.getPod(podId)?.status).toBe('beached');
  });

  it('pod:reconnect re-opens using the persisted ccSessionId as the resume option', async () => {
    const h = harness();
    const podId = await openPod(h);
    await driveFixture(h, podId, '01-parallel-dispatch.ndjson');

    const ccSessionId = h.store.getPod(podId)?.ccSessionId;
    expect(typeof ccSessionId).toBe('string');
    expect(ccSessionId).not.toBeNull();

    h.sdk(podId).failStream(new Error('Claude Code process exited with code 1'));
    await tick(3);
    expect(h.store.getPod(podId)?.status).toBe('beached');

    const reconnected = await h.invoke<Pod>(INVOKE_CHANNELS.podReconnect, podId);
    expect(reconnected.ok).toBe(true);
    expect(h.runnerCount(podId)).toBe(2);

    // The SDK option is `resume` — the contract's correction #3 — and it
    // carries Claude Code's own session id, not the Orcastrate PodId.
    const options = h.sdk(podId).calls[0]?.options as { resume?: string };
    expect(options.resume).toBe(ccSessionId);
    expect(options.resume).not.toBe(podId);
  });

  it('reconnect restores the existing lanes rather than opening a second Matriarch', async () => {
    const h = harness();
    const podId = await openPod(h);
    await driveFixture(h, podId, '01-parallel-dispatch.ndjson');
    const before = h.store.listLanes(podId);

    h.sdk(podId).failStream(new Error('Claude Code process exited with code 1'));
    await tick(3);
    await h.invoke(INVOKE_CHANNELS.podReconnect, podId);

    const after = h.store.listLanes(podId);
    expect(after.map((lane) => lane.id)).toEqual(before.map((lane) => lane.id));
    expect(after.filter((lane) => lane.kind === 'matriarch')).toHaveLength(1);
  });

  it('continues the same seq run after a reconnect — no gaps, no restarts', async () => {
    const h = harness();
    const podId = await openPod(h);
    await driveFixture(h, podId, '01-parallel-dispatch.ndjson');
    const before = pushedEvents(h).length;

    h.sdk(podId).failStream(new Error('Claude Code process exited with code 1'));
    await tick(3);
    await h.invoke(INVOKE_CHANNELS.podReconnect, podId);
    await driveFixture(h, podId, '03-tool-result-close.ndjson');

    const seqs = pushedEvents(h).map((event) => event.seq);
    expect(seqs.length).toBeGreaterThan(before);
    expect(seqs).toEqual(seqs.map((_, index) => index + 1));
  });
});
