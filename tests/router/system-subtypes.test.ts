/**
 * `system` subtype routing.
 *
 * ONE subtype leaves the Matriarch: `task_progress`, which narrates a single
 * Calf's own work and is correlated to it by `tool_use_id`. Everything else
 * stays put — `task_started` above all, because routing it to a Calf would
 * force the premature materialization the two-phase lane lifecycle exists to
 * prevent (02-nested-dispatch line 7 precedes the dispatch on line 8).
 *
 * The destination table below is ENUMERATED FROM THE CORPUS, not from a list
 * written by hand: every subtype that appears on a `type: "system"` line in
 * `tests/fixtures/protocol/*.ndjson` is discovered and pinned. A re-probe that
 * introduces a new subtype fails here rather than routing somewhere unnoticed.
 */

import { describe, expect, it } from 'vitest';

import type { Lane, NewEvent } from '../../src/shared/contracts/events';
import {
  MATRIARCH_LANE_ID,
  discoveredFixtureFiles,
  fixtureMessages,
  makeRouter,
  replay,
  type Replay,
} from './helpers';

const PARALLEL = '01-parallel-dispatch.ndjson';

/** Subtypes that must keep their Matriarch routing (criterion 4). */
const MATRIARCH_SUBTYPES = [
  'init',
  'task_started',
  'task_updated',
  'task_notification',
  'background_tasks_changed',
];

function subtypeOf(event: NewEvent): string {
  return (event.payload as { subtype?: unknown }).subtype as string;
}

function systemEventsOf(events: NewEvent[]): NewEvent[] {
  return events.filter((event) => event.type === 'system');
}

function progressEvents(replayed: Replay): NewEvent[] {
  return systemEventsOf(replayed.events).filter((event) => subtypeOf(event) === 'task_progress');
}

/** Every `tool_use_id` -> laneId pairing the replay's own lane table records. */
function laneByToolUseId(lanes: Lane[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const lane of lanes) {
    if (lane.toolUseId !== null) map.set(lane.toolUseId, lane.id);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Criterion 4 — the destination table, enumerated from the corpus
// ---------------------------------------------------------------------------

describe('system subtype destinations (criterion 4)', () => {
  /** subtype -> the set of destinations it was routed to across the whole corpus. */
  const destinations = new Map<string, Set<'matriarch' | 'calf'>>();
  const seenIn = new Map<string, string[]>();

  for (const file of discoveredFixtureFiles()) {
    const replayed = replay(file);
    const messages = fixtureMessages(file);
    const calfIds = new Set(replayed.lanes.filter((l) => l.kind === 'calf').map((l) => l.id));

    replayed.perLine.forEach((events, index) => {
      const message = messages[index];
      if (message === null || message === undefined || message['type'] !== 'system') return;
      const subtype = typeof message['subtype'] === 'string' ? message['subtype'] : 'unknown';
      for (const event of systemEventsOf(events)) {
        const bucket = destinations.get(subtype) ?? new Set<'matriarch' | 'calf'>();
        bucket.add(
          event.laneId === MATRIARCH_LANE_ID
            ? 'matriarch'
            : calfIds.has(event.laneId)
              ? 'calf'
              : 'matriarch',
        );
        destinations.set(subtype, bucket);
        const where = seenIn.get(subtype) ?? [];
        where.push(`${file}:${index + 1}`);
        seenIn.set(subtype, where);
      }
    });
  }

  const observed = [...destinations.keys()].sort();

  it('the corpus contains every subtype this table is meant to pin', () => {
    // Not a hand-written list standing in for the corpus: this asserts the
    // corpus really does exercise each subtype the criterion names, so the
    // per-subtype tests below cannot pass vacuously.
    for (const subtype of [...MATRIARCH_SUBTYPES, 'task_progress']) {
      expect(observed, `no system/${subtype} line in the corpus`).toContain(subtype);
    }
  });

  it('an unknown system subtype, and a system message with no subtype, stay on the Matriarch', () => {
    // 05-malformed's `unknown_to_this_router` line is an unknown message TYPE,
    // not an unknown system subtype, so the corpus cannot pin this one; it is
    // exercised synthetically instead.
    const router = makeRouter();
    for (const message of [
      { type: 'system', subtype: 'some_future_subtype', tool_use_id: 'toolu_child' },
      { type: 'system' },
    ]) {
      const events = router.ingest(message);
      expect(events).toHaveLength(1);
      expect(events[0]!.type).toBe('system');
      expect(events[0]!.laneId).toBe(MATRIARCH_LANE_ID);
    }
  });

  it.each(observed)('system/%s is routed where the table says', (subtype) => {
    const routed = [...(destinations.get(subtype) ?? [])].sort();
    if (subtype === 'task_progress') {
      // Every corpus task_progress resolves to a registered Calf; none of them
      // arrive before their lane is registered.
      expect(routed, seenIn.get(subtype)?.join(', ')).toEqual(['calf']);
      return;
    }
    expect(routed, `system/${subtype} at ${seenIn.get(subtype)?.join(', ')}`).toEqual(['matriarch']);
  });

  it('task_started never leaves the Matriarch and never materializes a lane', () => {
    // Routing task_started to a Calf would force premature materialization —
    // the exact hazard the two-phase lifecycle exists for.
    for (const file of discoveredFixtureFiles()) {
      const replayed = replay(file);
      const messages = fixtureMessages(file);
      replayed.perLine.forEach((events, index) => {
        const message = messages[index];
        if (message?.['subtype'] !== 'task_started') return;
        for (const event of events) {
          expect(event.type, `${file} line ${index + 1}`).toBe('system');
          expect(event.laneId, `${file} line ${index + 1}`).toBe(MATRIARCH_LANE_ID);
        }
      });
    }
  });
});

// ---------------------------------------------------------------------------
// Criteria 1 and 2 — resolution and fallback
// ---------------------------------------------------------------------------

describe('task_progress lane resolution (criteria 1, 2)', () => {
  const DISPATCH = {
    type: 'assistant',
    message: {
      role: 'assistant',
      content: [
        {
          type: 'tool_use',
          id: 'toolu_child',
          name: 'Agent',
          input: { description: 'probe', subagent_type: 'leaf' },
        },
      ],
    },
  };

  function progress(toolUseId: string | null): Record<string, unknown> {
    const message: Record<string, unknown> = {
      type: 'system',
      subtype: 'task_progress',
      task_id: 'task-1',
      description: 'Running Bash',
    };
    if (toolUseId !== null) message['tool_use_id'] = toolUseId;
    return message;
  }

  it('routes task_progress to the lane registered for its tool_use_id', () => {
    const router = makeRouter();
    const opened = router.ingest(DISPATCH);
    const laneId = (
      opened.find((event) => event.type === 'lane_opened')!.payload as { lane: Lane }
    ).lane.id;
    expect(laneId).not.toBe(MATRIARCH_LANE_ID);

    const events = router.ingest(progress('toolu_child'));

    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe('system');
    expect(subtypeOf(events[0]!)).toBe('task_progress');
    expect(events[0]!.laneId).toBe(laneId);
    // The router's own index agrees, so this is the byToolUseId path.
    expect(router.getLaneByToolUseId('toolu_child')?.id).toBe(laneId);
  });

  it('falls back to the Matriarch when tool_use_id is absent', () => {
    const router = makeRouter();
    router.ingest(DISPATCH);
    const events = router.ingest(progress(null));

    expect(events).toHaveLength(1);
    expect(events[0]!.laneId).toBe(MATRIARCH_LANE_ID);
    expect(subtypeOf(events[0]!)).toBe('task_progress');
  });

  it('falls back to the Matriarch when tool_use_id names no registered lane', () => {
    const router = makeRouter();
    router.ingest(DISPATCH);
    const events = router.ingest(progress('toolu_never_seen'));

    expect(events).toHaveLength(1);
    expect(events[0]!.laneId).toBe(MATRIARCH_LANE_ID);
    // Dropped is not an option, and no phantom lane is invented for the id.
    expect(router.getLaneByToolUseId('toolu_never_seen')).toBeNull();
  });

  it('inline mode still collapses task_progress onto the Matriarch', () => {
    const router = makeRouter({ mode: 'inline' });
    router.ingest(DISPATCH);
    const events = router.ingest(progress('toolu_child'));

    expect(events[0]!.laneId).toBe(MATRIARCH_LANE_ID);
  });

  it('every event a task_progress produces carries a non-null laneId', () => {
    for (const file of discoveredFixtureFiles()) {
      const replayed = replay(file);
      for (const event of [...replayed.events, ...replayed.boundary]) {
        expect(event.laneId, file).toBeTruthy();
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Criterion 3 — the ordering guarantee
// ---------------------------------------------------------------------------

describe('task_progress preserves the lane_opened ordering guarantee (criterion 3)', () => {
  it('materializes a registered-but-unannounced Calf before the progress event', () => {
    const router = makeRouter();

    // `task_started` registers the lane WITHOUT announcing it — the
    // 02-nested-dispatch hazard, reproduced in isolation.
    const started = router.ingest({
      type: 'system',
      subtype: 'task_started',
      task_id: 'task-1',
      tool_use_id: 'toolu_child',
      description: 'probe',
      subagent_type: 'leaf',
    });
    expect(started.map((event) => event.type)).toEqual(['system']);

    const events = router.ingest({
      type: 'system',
      subtype: 'task_progress',
      task_id: 'task-1',
      tool_use_id: 'toolu_child',
    });

    expect(events.map((event) => event.type)).toEqual(['lane_opened', 'system']);
    const laneId = (events[0]!.payload as { lane: Lane }).lane.id;
    expect(events[1]!.laneId).toBe(laneId);
  });

  it.each(discoveredFixtureFiles())(
    '%s: no event carries a lane id before that lane was announced',
    (file) => {
      const replayed = replay(file);
      const announced = new Set<string>([MATRIARCH_LANE_ID]);
      for (const event of replayed.events) {
        if (event.type === 'lane_opened') {
          announced.add((event.payload as { lane: Lane }).lane.id);
          continue;
        }
        expect(announced.has(event.laneId), `${file}: ${event.type} on unannounced ${event.laneId}`)
          .toBe(true);
      }
    },
  );
});

// ---------------------------------------------------------------------------
// Criterion 5 — the 01-parallel-dispatch replay
// ---------------------------------------------------------------------------

describe('01-parallel-dispatch task_progress attribution (criterion 5)', () => {
  /** The corpus lines, counted here rather than taken on trust. */
  function corpusProgressLines(): { line: number; toolUseId: string | null }[] {
    return fixtureMessages(PARALLEL)
      .map((message, index) => ({ message, line: index + 1 }))
      .filter(({ message }) => message?.['type'] === 'system' && message['subtype'] === 'task_progress')
      .map(({ message, line }) => ({
        line,
        toolUseId: typeof message!['tool_use_id'] === 'string' ? (message!['tool_use_id'] as string) : null,
      }));
  }

  it('the fixture holds exactly the three task_progress lines this suite counted', () => {
    const lines = corpusProgressLines();
    expect(lines.map((entry) => entry.line)).toEqual([10, 13, 18]);
    expect(lines.every((entry) => entry.toolUseId !== null)).toBe(true);
  });

  it('each task_progress lands on the Calf its tool_use_id names', () => {
    const replayed = replay(PARALLEL);
    const byToolUse = laneByToolUseId(replayed.lanes);
    const messages = fixtureMessages(PARALLEL);

    let checked = 0;
    replayed.perLine.forEach((events, index) => {
      const message = messages[index];
      if (message?.['subtype'] !== 'task_progress') return;
      const expected = byToolUse.get(message['tool_use_id'] as string);
      expect(expected, `line ${index + 1} names an unregistered tool_use_id`).toBeDefined();
      expect(events).toHaveLength(1);
      expect(events[0]!.laneId, `line ${index + 1}`).toBe(expected);
      expect(events[0]!.laneId).not.toBe(MATRIARCH_LANE_ID);
      checked += 1;
    });
    expect(checked).toBe(corpusProgressLines().length);
  });

  it('the two Calves’ progress events do not cross', () => {
    const replayed = replay(PARALLEL);
    const byToolUse = laneByToolUseId(replayed.lanes);
    const messages = fixtureMessages(PARALLEL);

    // Grouped from the RAW lines, then compared to where the router put them.
    const expectedPerLane = new Map<string, number>();
    for (const message of messages) {
      if (message?.['subtype'] !== 'task_progress') continue;
      const laneId = byToolUse.get(message['tool_use_id'] as string)!;
      expectedPerLane.set(laneId, (expectedPerLane.get(laneId) ?? 0) + 1);
    }

    const actualPerLane = new Map<string, number>();
    for (const event of progressEvents(replayed)) {
      actualPerLane.set(event.laneId, (actualPerLane.get(event.laneId) ?? 0) + 1);
    }

    expect(actualPerLane).toEqual(expectedPerLane);
    // 01 dispatches two Calves; the three progress lines split 1 / 2 between
    // them, so a router that mixed them up could not produce this shape.
    expect([...expectedPerLane.values()].sort()).toEqual([1, 2]);
    expect(expectedPerLane.size).toBe(2);
  });

  it('the Matriarch loses exactly the progress lines that resolved to a Calf', () => {
    const replayed = replay(PARALLEL);
    const matriarchCount = replayed.events.filter(
      (event) => event.laneId === MATRIARCH_LANE_ID,
    ).length;

    const movedToCalf = progressEvents(replayed).filter(
      (event) => event.laneId !== MATRIARCH_LANE_ID,
    ).length;
    expect(movedToCalf).toBe(3);
    expect(movedToCalf).toBe(corpusProgressLines().length);

    // Reconstruct the old Matriarch total. Under the previous routing every
    // task_progress produced exactly one Matriarch event and nothing else; this
    // asserts that is still all a progress line produces, so the ONLY change to
    // the event stream is the laneId these three events carry.
    const messages = fixtureMessages(PARALLEL);
    replayed.perLine.forEach((events, index) => {
      if (messages[index]?.['subtype'] !== 'task_progress') return;
      expect(events.map((event) => event.type), `line ${index + 1}`).toEqual(['system']);
    });

    expect(matriarchCount + movedToCalf).toBe(
      replayed.events.filter(
        (event) =>
          event.laneId === MATRIARCH_LANE_ID ||
          (event.type === 'system' && subtypeOf(event) === 'task_progress'),
      ).length,
    );
    // No task_progress remains on the Matriarch in this fixture.
    expect(
      progressEvents(replayed).filter((event) => event.laneId === MATRIARCH_LANE_ID),
    ).toHaveLength(0);
  });
});
