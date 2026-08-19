/**
 * Design-spec section 9 — LANE ASSIGNMENT and INTERLEAVING OF TWO CONCURRENT
 * CALVES.
 *
 * The correlation rule under test comes from `findings.json`
 * `parentToolUseId`: every subagent-originated message carries a
 * `parent_tool_use_id` equal to the id of the `Agent` tool_use that opened it,
 * and no Matriarch message carries a non-null one. So lane assignment is a
 * total function of the raw stream, and this suite recomputes it from the
 * fixture rather than trusting the router's own bookkeeping.
 *
 * Ids are read out of the capture and compared to each other — never to a
 * literal, per `tests/fixtures/protocol/README.md` "Determinism".
 */

import { describe, expect, it } from 'vitest';

import type { Lane, NewEvent } from '../../src/shared/contracts/events';
import {
  MATRIARCH_LANE_ID,
  calfLaneSequence,
  calves,
  discoveredFixtureFiles,
  fixtureMessages,
  replay,
  switchCount,
  type Replay,
} from './helpers';

const PARALLEL = '01-parallel-dispatch.ndjson';
const TRANSCRIPT_TYPES = new Set<NewEvent['type']>([
  'user_message',
  'assistant_text',
  'thinking',
  'tool_use',
  'tool_result',
]);

/** The lane a raw line's transcript events must land on, computed independently. */
function expectedLaneFor(message: Record<string, unknown> | null, lanes: Lane[]): string {
  if (message === null) return MATRIARCH_LANE_ID;
  const type = message['type'];
  if (type !== 'assistant' && type !== 'user') return MATRIARCH_LANE_ID;

  const parent = message['parent_tool_use_id'];
  if (typeof parent !== 'string') return MATRIARCH_LANE_ID;

  const owner = lanes.find((lane) => lane.toolUseId === parent);
  // Contract: an unknown parent_tool_use_id routes to the Matriarch and the
  // event is NOT dropped.
  return owner === undefined ? MATRIARCH_LANE_ID : owner.id;
}

function transcriptEventsPerLine(replayed: Replay): NewEvent[][] {
  return replayed.perLine.map((events) => events.filter((event) => TRANSCRIPT_TYPES.has(event.type)));
}

describe('lane assignment (spec 9)', () => {
  it.each(discoveredFixtureFiles())(
    '%s routes every transcript event to the lane its parent_tool_use_id names',
    (file) => {
      const replayed = replay(file);
      const messages = fixtureMessages(file);
      const perLine = transcriptEventsPerLine(replayed);

      let checked = 0;
      perLine.forEach((events, index) => {
        const expectedLane = expectedLaneFor(messages[index] ?? null, replayed.lanes);
        for (const event of events) {
          expect(
            event.laneId,
            `${file} line ${index + 1}: ${event.type} routed to ${event.laneId}`,
          ).toBe(expectedLane);
          checked += 1;
        }
      });

      expect(checked, `${file} produced no transcript events to check`).toBeGreaterThan(0);
    },
  );

  it.each(discoveredFixtureFiles())('%s puts all control-plane traffic on the Matriarch', (file) => {
    // `system`, `result` and `rate_limit_event` are host-process traffic: their
    // TRANSCRIPT event belongs to the Matriarch. The `lane_closed` a terminal
    // `task_updated` causes is a lane state transition, not transcript, and
    // rightly carries the Calf's id — so lifecycle events are excluded here and
    // covered by ordering.test.ts instead.
    //
    // `system/task_progress` is the ONE deliberate exception: it narrates one
    // Calf's own work and is routed by its `tool_use_id`. It has its own
    // destination table below.
    const replayed = replay(file);
    const messages = fixtureMessages(file);

    replayed.perLine.forEach((events, index) => {
      const message = messages[index];
      const type = message === null || message === undefined ? null : message['type'];
      if (type !== 'system' && type !== 'result' && type !== 'rate_limit_event') return;
      if (type === 'system' && message?.['subtype'] === 'task_progress') return;
      for (const event of events) {
        if (event.type === 'lane_opened' || event.type === 'lane_closed') continue;
        expect(event.laneId, `${file} line ${index + 1}`).toBe(MATRIARCH_LANE_ID);
      }
    });
  });

  it.each(discoveredFixtureFiles())('%s gives every emitted event a non-null laneId', (file) => {
    const replayed = replay(file);
    for (const event of [...replayed.events, ...replayed.boundary]) {
      expect(event.laneId).toBeTruthy();
      expect(event.podId).toBe(replayed.events[0]?.podId);
    }
  });

  it('01: the two Calves are dispatched by one assistant message and get one lane each', () => {
    const messages = fixtureMessages(PARALLEL);
    const dispatchIds: string[] = [];
    const dispatchMessageIds = new Set<string>();

    messages.forEach((message) => {
      if (message === null || message['type'] !== 'assistant') return;
      const inner = message['message'] as { id?: unknown; content?: unknown } | undefined;
      const content = Array.isArray(inner?.content) ? inner.content : [];
      for (const block of content as Record<string, unknown>[]) {
        if (block['type'] === 'tool_use' && (block['name'] === 'Agent' || block['name'] === 'Task')) {
          dispatchIds.push(block['id'] as string);
          if (typeof inner?.id === 'string') dispatchMessageIds.add(inner.id);
        }
      }
    });

    expect(dispatchIds).toHaveLength(2);
    // findings.json fixtures[0]: both dispatch blocks belong to ONE assistant
    // message. Two lanes must still come out of it.
    expect(dispatchMessageIds.size).toBe(1);

    const replayed = replay(PARALLEL);
    const calfLanes = calves(replayed.lanes);
    expect(calfLanes).toHaveLength(2);
    expect(calfLanes.map((lane) => lane.toolUseId).sort()).toEqual([...dispatchIds].sort());

    for (const toolUseId of dispatchIds) {
      const lane = replayed.router.getLaneByToolUseId(toolUseId);
      expect(lane, `no lane for dispatch ${toolUseId}`).not.toBeNull();
      expect(lane!.kind).toBe('calf');
      expect(lane!.depth).toBe(1);
      expect(lane!.parentLaneId).toBe(MATRIARCH_LANE_ID);
    }

    // Distinct lanes, distinct agent ids — not one lane reused for both.
    expect(new Set(calfLanes.map((lane) => lane.id)).size).toBe(2);
    expect(new Set(calfLanes.map((lane) => lane.agentId)).size).toBe(2);
  });

  it('01: each dispatching tool_use lands on the Matriarch and names the lane it opened', () => {
    const replayed = replay(PARALLEL);
    const dispatches = replayed.events.filter(
      (event) =>
        event.type === 'tool_use' && (event.payload as { name: string }).name === 'Agent',
    );

    expect(dispatches).toHaveLength(2);
    for (const dispatch of dispatches) {
      const payload = dispatch.payload as { toolUseId: string; dispatchedLaneId?: string };
      expect(dispatch.laneId).toBe(MATRIARCH_LANE_ID);
      expect(payload.dispatchedLaneId).toBeDefined();
      const lane = replayed.router.getLaneByToolUseId(payload.toolUseId);
      expect(payload.dispatchedLaneId).toBe(lane!.id);
    }
  });
});

describe('interleaving of two concurrent Calves (spec 9)', () => {
  it('01: the two lanes genuinely interleave rather than running back to back', () => {
    const replayed = replay(PARALLEL);
    const sequence = calfLaneSequence(replayed);
    const lanes = [...new Set(sequence)];

    expect(lanes).toHaveLength(2);

    const [a, b] = lanes as [string, string];
    const firstA = sequence.indexOf(a);
    const lastA = sequence.lastIndexOf(a);
    const firstB = sequence.indexOf(b);
    const lastB = sequence.lastIndexOf(b);

    // Overlapping spans: each lane starts before the other finishes.
    expect(firstA).toBeLessThan(lastB);
    expect(firstB).toBeLessThan(lastA);
  });

  it('01: the capture switches lanes exactly the number of times findings.json measured', () => {
    // findings.json parentToolUseId.notes: "their messages interleave (7 lane
    // switches)". A router that batched a lane's events would report fewer.
    expect(switchCount(calfLaneSequence(replay(PARALLEL)))).toBe(7);
  });

  it('01: neither Calf ever receives the other Calf\'s events', () => {
    const replayed = replay(PARALLEL);
    const messages = fixtureMessages(PARALLEL);
    const byToolUse = new Map(calves(replayed.lanes).map((lane) => [lane.toolUseId, lane.id]));

    replayed.perLine.forEach((events, index) => {
      const message = messages[index];
      const parent = message === null || message === undefined ? null : message['parent_tool_use_id'];
      if (typeof parent !== 'string') return;
      const owner = byToolUse.get(parent);
      for (const event of events) {
        if (!TRANSCRIPT_TYPES.has(event.type)) continue;
        expect(event.laneId, `line ${index + 1} leaked across lanes`).toBe(owner);
      }
    });
  });

  it('01: both Calves close, and each closes exactly once', () => {
    const replayed = replay(PARALLEL);
    const closes = replayed.events.filter((event) => event.type === 'lane_closed');
    const closedIds = closes.map((event) => (event.payload as { laneId: string }).laneId);

    expect(closes).toHaveLength(2);
    expect(new Set(closedIds).size).toBe(2);
    expect(replayed.boundary, 'nothing should be left to orphan in 01').toHaveLength(0);
    for (const lane of calves(replayed.lanes)) expect(lane.status).toBe('done');
  });
});
