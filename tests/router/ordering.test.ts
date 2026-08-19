/**
 * Design-spec section 9 — EVENT ORDERING.
 *
 * The ordering guarantee a consumer relies on (lane-router.ts contract): a
 * Calf's `lane_opened` is emitted before ANY event carrying that Calf's
 * `laneId`, and before the `tool_use` event that dispatched it. Nothing may
 * reference a lane the consumer has not been told about.
 *
 * The ORDERING HAZARD this must survive is measured, not hypothetical:
 * `findings.json` fixtures[1] records that `system/task_started` for the
 * depth-2 lane in `02-nested-dispatch.ndjson` arrives on line 7, BEFORE the
 * `assistant` tool_use that opens it on line 8. A `lane_opened` emitted at the
 * `task_started` could not know the lane's parent, so the tests below allow the
 * announcement to land at the tool_use — they only require that it lands before
 * anything observable references the lane.
 */

import { describe, expect, it } from 'vitest';

import type { Lane, NewEvent } from '../../src/shared/contracts/events';
import { calves, discoveredFixtureFiles, fixtureMessages, replay } from './helpers';

const NESTED = '02-nested-dispatch.ndjson';

function laneOf(event: NewEvent): string {
  return event.laneId;
}

function announcedLaneId(event: NewEvent): string {
  return (event.payload as { lane: Lane }).lane.id;
}

describe('event ordering (spec 9)', () => {
  it.each(discoveredFixtureFiles())(
    '%s announces every Calf lane before any event carries its id',
    (file) => {
      const replayed = replay(file);
      const stream = [...replayed.events, ...replayed.boundary];
      const announced = new Set<string>();
      const calfIds = new Set(calves(replayed.lanes).map((lane) => lane.id));

      stream.forEach((event, index) => {
        if (event.type === 'lane_opened') {
          announced.add(announcedLaneId(event));
          return;
        }
        if (!calfIds.has(laneOf(event))) return;
        expect(
          announced.has(laneOf(event)),
          `${file}: event #${index} (${event.type}) references unannounced lane ${laneOf(event)}`,
        ).toBe(true);
      });

      expect(announced.size, `${file} announced no Calf lanes`).toBe(calfIds.size);
    },
  );

  it.each(discoveredFixtureFiles())('%s announces each Calf lane exactly once', (file) => {
    const replayed = replay(file);
    const announcements = [...replayed.events, ...replayed.boundary]
      .filter((event) => event.type === 'lane_opened')
      .map(announcedLaneId);
    expect(announcements).toEqual([...new Set(announcements)]);
  });

  it.each(discoveredFixtureFiles())(
    '%s emits lane_opened before the tool_use that dispatched the lane',
    (file) => {
      const replayed = replay(file);

      replayed.events.forEach((event, index) => {
        if (event.type !== 'tool_use') return;
        const payload = event.payload as { dispatchedLaneId?: string };
        if (payload.dispatchedLaneId === undefined) return;

        const opened = replayed.events.findIndex(
          (candidate) =>
            candidate.type === 'lane_opened' &&
            announcedLaneId(candidate) === payload.dispatchedLaneId,
        );
        expect(opened, `${file}: dispatch at #${index} announces no lane`).toBeGreaterThanOrEqual(0);
        expect(opened).toBeLessThan(index);
      });
    },
  );

  it.each(discoveredFixtureFiles())(
    '%s closes each Calf after opening it and emits nothing on it afterwards',
    (file) => {
      const replayed = replay(file);
      const stream = [...replayed.events, ...replayed.boundary];
      const openedAt = new Map<string, number>();
      const closedAt = new Map<string, number>();

      stream.forEach((event, index) => {
        if (event.type === 'lane_opened') openedAt.set(announcedLaneId(event), index);
        if (event.type === 'lane_closed') {
          closedAt.set((event.payload as { laneId: string }).laneId, index);
        }
      });

      for (const [laneId, closeIndex] of closedAt) {
        const openIndex = openedAt.get(laneId);
        expect(openIndex, `${file}: lane ${laneId} closed without opening`).toBeDefined();
        expect(openIndex!).toBeLessThan(closeIndex);
      }

      stream.forEach((event, index) => {
        const closeIndex = closedAt.get(laneOf(event));
        if (closeIndex === undefined) return;
        expect(
          index <= closeIndex,
          `${file}: ${event.type} emitted on lane ${laneOf(event)} after it closed`,
        ).toBe(true);
      });
    },
  );

  it.each(discoveredFixtureFiles())(
    '%s emits the system event that caused a close before the lane_closed',
    (file) => {
      const replayed = replay(file);
      replayed.perLine.forEach((events, index) => {
        const closeIndex = events.findIndex((event) => event.type === 'lane_closed');
        if (closeIndex < 0) return;
        expect(
          events.slice(0, closeIndex).some((event) => event.type === 'system'),
          `${file} line ${index + 1}: lane_closed with no preceding transcript event`,
        ).toBe(true);
      });
    },
  );

  it.each(discoveredFixtureFiles())('%s produces events in source-line order', (file) => {
    const replayed = replay(file);
    // `sourceLine` is recorded as ingest happens; a router that buffered an
    // event for a later line would break monotonicity here.
    for (let i = 1; i < replayed.sourceLine.length; i += 1) {
      expect(replayed.sourceLine[i]!).toBeGreaterThanOrEqual(replayed.sourceLine[i - 1]!);
    }
  });
});

describe('the measured ordering hazard: task_started before its dispatch (spec 9)', () => {
  it('02: the fixture really does put task_started before the tool_use that opens the lane', () => {
    // Guard on the capture itself. If a re-probe reorders these lines the
    // hazard test below stops proving anything, and this fails first.
    const messages = fixtureMessages(NESTED);
    const started = messages[6];
    const dispatch = messages[7];

    expect(started?.['type']).toBe('system');
    expect(started?.['subtype']).toBe('task_started');
    expect(dispatch?.['type']).toBe('assistant');

    const startedToolUse = started?.['tool_use_id'];
    const inner = dispatch?.['message'] as { content?: unknown } | undefined;
    const blocks = (Array.isArray(inner?.content) ? inner.content : []) as Record<string, unknown>[];
    const dispatchBlock = blocks.find((block) => block['type'] === 'tool_use');

    expect(dispatchBlock?.['name']).toBe('Agent');
    expect(dispatchBlock?.['id']).toBe(startedToolUse);
  });

  it('02: the early task_started registers the lane without announcing it', () => {
    const replayed = replay(NESTED);
    const line7 = replayed.perLine[6]!;

    expect(line7.map((event) => event.type)).toEqual(['system']);
    expect(line7.every((event) => event.type !== 'lane_opened')).toBe(true);
  });

  it('02: the lane is announced at the tool_use that supplies its parent and depth', () => {
    const replayed = replay(NESTED);
    const line8 = replayed.perLine[7]!;
    const opened = line8.filter((event) => event.type === 'lane_opened');

    expect(opened).toHaveLength(1);
    const lane = (opened[0]!.payload as { lane: Lane }).lane;
    // Announced complete: had it been announced at line 7 it would have had to
    // guess depth 1 and the Matriarch as parent.
    expect(lane.depth).toBe(2);
    expect(lane.parentLaneId).not.toBe(null);
    expect(lane.parentLaneId).not.toBe(replayed.lanes[0]!.id);
  });

  it('02: the early task_started still banks the agent id onto the right lane', () => {
    const replayed = replay(NESTED);
    const messages = fixtureMessages(NESTED);
    const started = messages[6]!;
    const lane = replayed.router.getLaneByToolUseId(started['tool_use_id'] as string);

    // findings.agentId.fieldPath: system/task_started.task_id, correlated by
    // system/task_started.tool_use_id.
    expect(lane).not.toBeNull();
    expect(lane!.agentId).toBe(started['task_id']);
  });
});
