/**
 * T5's own coverage of the LaneRouter, replaying the real T2 protocol capture.
 *
 * The ACCEPTANCE suite is T6's (`tests/router/**`); this file exists so the
 * implementation is evidenced at the point it is written. It asserts on
 * structure and correlation only — lane assignment, depth, open/close pairing,
 * ordering, counts — never on model prose, timings or literal id values, per
 * `tests/fixtures/protocol/README.md` "Determinism".
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';

import type { Lane, LaneId, NewEvent } from '../../shared/contracts/events';
import type { LaneRouter, RoutingMode } from '../../shared/contracts/lane-router';
import { createLaneRouter } from './lane-router';

const FIXTURE_DIR = join(
  fileURLToPath(new URL('../../../', import.meta.url)),
  'tests/fixtures/protocol',
);

const POD_ID = 'pod-fixture';
const MATRIARCH = 'lane-matriarch';

function fixtureLines(file: string): string[] {
  return readFileSync(join(FIXTURE_DIR, file), 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);
}

function findings(): Record<string, unknown> {
  return JSON.parse(readFileSync(join(FIXTURE_DIR, 'findings.json'), 'utf8')) as Record<
    string,
    unknown
  >;
}

function makeRouter(mode: RoutingMode = 'lanes'): LaneRouter {
  let lane = 0;
  let tick = 0;
  return createLaneRouter({
    podId: POD_ID,
    matriarchLaneId: MATRIARCH,
    mode,
    newLaneId: () => `lane-${++lane}`,
    now: () => `2026-01-01T00:00:00.${String(tick++).padStart(3, '0')}Z`,
  });
}

interface Replay {
  router: LaneRouter;
  events: NewEvent[];
  /** Events grouped by the source line (1-based) that produced them. */
  perLine: NewEvent[][];
}

function replay(file: string, mode: RoutingMode = 'lanes'): Replay {
  const router = makeRouter(mode);
  const events: NewEvent[] = [];
  const perLine: NewEvent[][] = [];
  for (const line of fixtureLines(file)) {
    const produced = router.ingest(line);
    perLine.push(produced);
    events.push(...produced);
  }
  return { router, events, perLine };
}

function openedLanes(events: NewEvent[]): Lane[] {
  return events
    .filter((event) => event.payload.type === 'lane_opened')
    .map((event) => (event.payload as { type: 'lane_opened'; lane: Lane }).lane);
}

function closes(events: NewEvent[]): { laneId: LaneId; status: string }[] {
  return events
    .filter((event) => event.payload.type === 'lane_closed')
    .map((event) => event.payload as { type: 'lane_closed'; laneId: LaneId; status: string });
}

const ALL_FIXTURES = [
  '01-parallel-dispatch.ndjson',
  '02-nested-dispatch.ndjson',
  '03-tool-result-close.ndjson',
  '04-orphaned-calf.ndjson',
  '05-malformed.ndjson',
  '06-permission-prompt.ndjson',
];

// ---------------------------------------------------------------------------

describe('routing mode comes from the probe, not the spec (criterion 2)', () => {
  it('findings.json recommends "lanes"', () => {
    const probe = findings();
    expect(probe['recommendedRoutingMode']).toBe('lanes');
    expect((probe['parentToolUseId'] as Record<string, unknown>)['correlates']).toBe(true);
    expect((probe['nesting'] as Record<string, unknown>)['distinguishableFromDepth1']).toBe(true);
  });
});

describe('lanes mode — 01-parallel-dispatch (criterion 3)', () => {
  let result: Replay;
  beforeEach(() => {
    result = replay('01-parallel-dispatch.ndjson');
  });

  it('opens exactly two Calves, keyed by the dispatching tool_use_id', () => {
    const lanes = openedLanes(result.events);
    expect(lanes).toHaveLength(2);
    expect(lanes.map((lane) => lane.toolUseId)).toEqual([
      'toolu_01WX1FPH7kp2Umpa7GHKHcMe',
      'toolu_014RozzngRfFYKEoprURtB63',
    ]);
    expect(lanes.every((lane) => lane.kind === 'calf')).toBe(true);
    expect(lanes.every((lane) => lane.depth === 1)).toBe(true);
    expect(lanes.every((lane) => lane.parentLaneId === MATRIARCH)).toBe(true);
  });

  it('titles each Calf from subagent_type and description', () => {
    for (const lane of openedLanes(result.events)) {
      expect(lane.subagentType).toBe('leaf');
      expect(lane.description).toBe('Report current directory name');
    }
  });

  it('the two Calves’ events never cross', () => {
    const [first, second] = openedLanes(result.events);
    const laneOf = new Map<string, LaneId>([
      ['toolu_01WX1FPH7kp2Umpa7GHKHcMe', first!.id],
      ['toolu_014RozzngRfFYKEoprURtB63', second!.id],
    ]);

    let checked = 0;
    for (const [index, line] of fixtureLines('01-parallel-dispatch.ndjson').entries()) {
      const message = JSON.parse(line) as { parent_tool_use_id?: string | null };
      const expected = laneOf.get(message.parent_tool_use_id ?? '');
      if (expected === undefined) continue;
      for (const event of result.perLine[index] ?? []) {
        if (event.payload.type === 'lane_opened' || event.payload.type === 'lane_closed') continue;
        expect(event.laneId).toBe(expected);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(10);
  });

  it('routes parent_tool_use_id === null to the Matriarch', () => {
    // Line 25 is the dispatch tool_result, line 31 the Matriarch's final text.
    for (const index of [24, 30]) {
      for (const event of result.perLine[index] ?? []) {
        expect(event.laneId).toBe(MATRIARCH);
      }
    }
  });
});

describe('nesting — 02-nested-dispatch (criterion 5)', () => {
  it('recovers depth 2 despite task_started arriving before its tool_use', () => {
    const result = replay('02-nested-dispatch.ndjson');
    const lanes = openedLanes(result.events);
    expect(lanes).toHaveLength(2);

    const depth1 = lanes.find((lane) => lane.toolUseId === 'toolu_01HRtvRjfnEzDHHi12VzRDbq');
    const depth2 = lanes.find((lane) => lane.toolUseId === 'toolu_015KWKbkSggrkWHhrmaMsubr');

    expect(depth1?.depth).toBe(1);
    expect(depth1?.parentLaneId).toBe(MATRIARCH);
    expect(depth2?.depth).toBe(2);
    expect(depth2?.parentLaneId).toBe(depth1?.id);
    expect(depth2?.subagentType).toBe('leaf');
  });

  it('banks the agentId from the early task_started (line 7) before the lane opens', () => {
    const result = replay('02-nested-dispatch.ndjson');
    // task_started for the depth-2 lane is line 7; the tool_use is line 8.
    expect(result.perLine[6]?.some((e) => e.payload.type === 'lane_opened')).toBe(false);
    expect(result.perLine[7]?.[0]?.payload.type).toBe('lane_opened');

    const depth2 = result.router.getLaneByToolUseId('toolu_015KWKbkSggrkWHhrmaMsubr');
    expect(depth2?.agentId).toBe('a92a45ac57181e2b6');
  });
});

describe('malformed input — 05-malformed (criterion 6)', () => {
  it('never throws and never drops a subsequent event', () => {
    const lines = fixtureLines('05-malformed.ndjson');
    const router = makeRouter();
    const perLine = lines.map((line) => {
      let produced: NewEvent[] = [];
      expect(() => {
        produced = router.ingest(line);
      }).not.toThrow();
      return produced;
    });
    // The corruptions are on lines 11, 13 and 15 (1-based).
    for (const index of [10, 12, 14]) {
      expect(perLine[index]?.map((e) => e.payload.type)).toEqual(['malformed']);
    }
    // The valid lines around them still produce events.
    for (const index of [9, 11, 13, 15]) {
      expect(perLine[index]?.length).toBeGreaterThan(0);
      expect(perLine[index]?.every((e) => e.payload.type !== 'malformed')).toBe(true);
    }
  });

  it('reports the reason and keeps the raw line', () => {
    const router = makeRouter();
    const truncated = fixtureLines('05-malformed.ndjson')[10]!;
    const [event] = router.ingest(truncated);
    expect(event?.payload).toMatchObject({ type: 'malformed', rawLine: truncated });
    expect((event?.payload as { parseError: string }).parseError.length).toBeGreaterThan(0);

    const unknownType = fixtureLines('05-malformed.ndjson')[14]!;
    const [unknown] = router.ingest(unknownType);
    expect((unknown?.payload as { parseError: string }).parseError).toContain('quantum_flux');
  });

  it('survives inputs no stream would ever produce', () => {
    const router = makeRouter();
    for (const input of [null, undefined, 42, [], '', '   ', '{', { type: 7 }, { nope: true }]) {
      expect(() => router.ingest(input)).not.toThrow();
    }
    expect(() => router.onTurnBoundary()).not.toThrow();
  });
});

describe('ordering and totality (criteria 7 and 8)', () => {
  it.each(ALL_FIXTURES)('%s: no event ever carries an unknown laneId', (file) => {
    const result = replay(file);
    const known = new Set<LaneId>([MATRIARCH]);
    for (const event of [...result.events, ...result.router.onTurnBoundary()]) {
      if (event.payload.type === 'lane_opened') {
        known.add(event.payload.lane.id);
      }
      expect(event.laneId, `${file}: event ${event.type} on unknown lane`).not.toBeNull();
      expect(known.has(event.laneId), `${file}: unknown laneId for ${event.type}`).toBe(true);
      if (event.payload.type === 'lane_closed') {
        expect(known.has(event.payload.laneId)).toBe(true);
      }
    }
  });

  it.each(ALL_FIXTURES)('%s: lane_opened precedes the tool_use that dispatched it', (file) => {
    const result = replay(file);
    const opened = new Set<LaneId>();
    for (const event of result.events) {
      if (event.payload.type === 'lane_opened') opened.add(event.payload.lane.id);
      if (event.payload.type === 'tool_use' && event.payload.dispatchedLaneId !== undefined) {
        expect(opened.has(event.payload.dispatchedLaneId)).toBe(true);
      }
    }
  });

  it('routes an unknown parent_tool_use_id to the Matriarch rather than dropping it', () => {
    const router = makeRouter();
    const events = router.ingest({
      type: 'assistant',
      parent_tool_use_id: 'toolu_neverSeen',
      message: { role: 'assistant', content: [{ type: 'text', text: 'orphan' }] },
    });
    expect(events).toHaveLength(1);
    expect(events[0]?.laneId).toBe(MATRIARCH);
  });
});

describe('close logic (criterion 9)', () => {
  it('03: the terminal task_updated closes the Calf as done', () => {
    const result = replay('03-tool-result-close.ndjson');
    const closed = closes(result.events);
    expect(closed).toHaveLength(1);
    expect(closed[0]?.status).toBe('done');
    // Line 16 is the terminal task_updated; line 18 is the dispatch tool_result.
    expect(result.perLine[15]?.some((e) => e.payload.type === 'lane_closed')).toBe(true);
    expect(result.perLine[17]?.some((e) => e.payload.type === 'lane_closed')).toBe(false);
    expect(result.router.onTurnBoundary()).toEqual([]);
  });

  it('04: a launch acknowledgement does NOT close the lane; the turn boundary orphans it', () => {
    const result = replay('04-orphaned-calf.ndjson');
    // Line 6 is the "Async agent launched successfully" tool_result.
    expect(result.perLine[5]?.some((e) => e.payload.type === 'lane_closed')).toBe(false);
    expect(closes(result.events)).toHaveLength(0);
    expect(result.router.lanes()[1]?.status).toBe('running');

    const boundary = result.router.onTurnBoundary();
    expect(closes(boundary)).toHaveLength(1);
    expect(closes(boundary)[0]?.status).toBe('orphaned');
    // Idempotent.
    expect(result.router.onTurnBoundary()).toEqual([]);
  });

  it('01: both Calves close as done, none orphaned', () => {
    const result = replay('01-parallel-dispatch.ndjson');
    expect(closes(result.events).map((c) => c.status)).toEqual(['done', 'done']);
    expect(result.router.onTurnBoundary()).toEqual([]);
  });
});

describe('agentIds (criterion 10)', () => {
  it('populates the lane -> agent id map from system/task_started.task_id', () => {
    const result = replay('01-parallel-dispatch.ndjson');
    const map = result.router.agentIds();
    expect([...map.values()].sort()).toEqual(['a2dd230aec02c375a', 'a381eac5e0ec75778']);
    for (const [laneId] of map) {
      expect(result.router.lanes().some((lane) => lane.id === laneId)).toBe(true);
    }
  });

  it('06: the agentId matches the id the probe recorded', () => {
    const result = replay('06-permission-prompt.ndjson');
    expect([...result.router.agentIds().values()]).toEqual(['a3d3c9443c6195211']);
  });
});

describe('inline mode (criterion 4)', () => {
  it('collapses every laneId onto the Matriarch while keeping the lane lifecycle', () => {
    const result = replay('01-parallel-dispatch.ndjson', 'inline');
    expect(result.events.every((event) => event.laneId === MATRIARCH)).toBe(true);

    const lanes = openedLanes(result.events);
    expect(lanes).toHaveLength(2);
    expect(lanes.every((lane) => lane.id !== MATRIARCH)).toBe(true);
    expect(closes(result.events).map((c) => c.status)).toEqual(['done', 'done']);
    expect([...result.router.agentIds().values()].sort()).toEqual([
      'a2dd230aec02c375a',
      'a381eac5e0ec75778',
    ]);
  });

  it('produces the same event shape as lanes mode apart from laneId', () => {
    const lanesRun = replay('03-tool-result-close.ndjson', 'lanes');
    const inlineRun = replay('03-tool-result-close.ndjson', 'inline');
    expect(inlineRun.events.map((e) => e.type)).toEqual(lanesRun.events.map((e) => e.type));
    expect(inlineRun.events.map((e) => e.payload)).toEqual(lanesRun.events.map((e) => e.payload));
  });
});

describe('determinism (criterion 11)', () => {
  it.each(ALL_FIXTURES)('%s: two replays are byte-identical', (file) => {
    const first = replay(file);
    const second = replay(file);
    expect(JSON.stringify(second.events)).toBe(JSON.stringify(first.events));
    expect(JSON.stringify(second.router.onTurnBoundary())).toBe(
      JSON.stringify(first.router.onTurnBoundary()),
    );
  });
});

describe('restore (resume)', () => {
  it('adopts persisted lanes without re-emitting lane_opened', () => {
    const first = replay('03-tool-result-close.ndjson');
    const persisted = first.router.lanes();

    const resumed = makeRouter();
    resumed.restore({ lanes: persisted });
    expect(resumed.lanes()).toHaveLength(persisted.length);
    expect(resumed.getLaneByToolUseId('toolu_01QVVXmmWAUwwvbkGnKD8Hxw')?.depth).toBe(1);

    const events = resumed.ingest(fixtureLines('03-tool-result-close.ndjson')[2]!);
    expect(events.some((e) => e.payload.type === 'lane_opened')).toBe(false);
    expect(events.some((e) => e.payload.type === 'tool_use')).toBe(true);

    // Idempotent.
    resumed.restore({ lanes: persisted });
    expect(resumed.lanes()).toHaveLength(persisted.length);
  });
});

describe('maxLaneDepth', () => {
  it('attaches a dispatch beyond the cap to its nearest ancestor lane', () => {
    const result = replay('02-nested-dispatch.ndjson');
    const deep = result.router.lanes().find((lane) => lane.depth === 2)!;

    let lane = 0;
    let tick = 0;
    const capped = createLaneRouter({
      podId: POD_ID,
      matriarchLaneId: MATRIARCH,
      mode: 'lanes',
      newLaneId: () => `lane-${++lane}`,
      now: () => `2026-01-01T00:00:00.${String(tick++).padStart(3, '0')}Z`,
      maxLaneDepth: 1,
    });
    for (const line of fixtureLines('02-nested-dispatch.ndjson')) capped.ingest(line);

    expect(capped.lanes().filter((l) => l.kind === 'calf')).toHaveLength(1);
    const alias = capped.getLaneByToolUseId('toolu_015KWKbkSggrkWHhrmaMsubr');
    expect(alias?.toolUseId).toBe('toolu_01HRtvRjfnEzDHHi12VzRDbq');
    expect(deep.depth).toBe(2);
  });
});

describe('only an agent task_started opens a lane', () => {
  const TOOL_USE = 'toolu_bash_1';
  const TASK = 'task_bash_1';

  function started(taskType?: string): Record<string, unknown> {
    const message: Record<string, unknown> = {
      type: 'system',
      subtype: 'task_started',
      task_id: TASK,
      tool_use_id: TOOL_USE,
      description: 'a background task',
    };
    if (taskType !== undefined) message['task_type'] = taskType;
    return message;
  }

  const updatedCompleted = {
    type: 'system',
    subtype: 'task_updated',
    task_id: TASK,
    patch: { status: 'completed' },
  };
  const notificationCompleted = {
    type: 'system',
    subtype: 'task_notification',
    task_id: TASK,
    status: 'completed',
  };
  const progress = {
    type: 'system',
    subtype: 'task_progress',
    task_id: TASK,
    tool_use_id: TOOL_USE,
  };

  function laneLifecycle(events: NewEvent[]): NewEvent[] {
    return events.filter(
      (event) => event.payload.type === 'lane_opened' || event.payload.type === 'lane_closed',
    );
  }

  function systemSubtypes(events: NewEvent[]): { laneId: LaneId; subtype: string }[] {
    return events
      .filter((event) => event.payload.type === 'system')
      .map((event) => ({
        laneId: event.laneId,
        subtype: (event.payload as { type: 'system'; subtype: string }).subtype,
      }));
  }

  it('local_bash: task_started then a terminal task_updated opens and closes no lane', () => {
    const router = makeRouter();
    const first = router.ingest(started('local_bash'));
    const second = router.ingest(updatedCompleted);
    expect(laneLifecycle(first)).toEqual([]);
    expect(laneLifecycle(second)).toEqual([]);
  });

  it('local_bash: its task_progress is one Matriarch system event and opens no lane', () => {
    const router = makeRouter();
    router.ingest(started('local_bash'));
    const produced = router.ingest(progress);
    expect(produced).toHaveLength(1);
    expect(produced[0]?.laneId).toBe(MATRIARCH);
    expect(produced[0]?.payload.type).toBe('system');
    expect(laneLifecycle(produced)).toEqual([]);
  });

  it('local_bash: a terminal task_notification opens and closes no lane', () => {
    const router = makeRouter();
    const first = router.ingest(started('local_bash'));
    const second = router.ingest(notificationCompleted);
    expect(laneLifecycle(first)).toEqual([]);
    expect(laneLifecycle(second)).toEqual([]);
  });

  it('local_bash: the turn boundary has nothing to orphan', () => {
    const router = makeRouter();
    router.ingest(started('local_bash'));
    expect(router.onTurnBoundary()).toEqual([]);
  });

  it('local_bash: lanes(), getLaneByToolUseId and agentIds gain nothing', () => {
    const router = makeRouter();
    router.ingest(started('local_bash'));
    const lanes = router.lanes();
    expect(lanes).toHaveLength(1);
    expect(lanes[0]?.id).toBe(MATRIARCH);
    expect(router.getLaneByToolUseId(TOOL_USE)).toBeNull();
    expect([...router.agentIds().values()]).not.toContain(TASK);
  });

  it('local_bash: task_started, task_updated and task_notification each stay one Matriarch system event', () => {
    const router = makeRouter();
    const events = [
      ...router.ingest(started('local_bash')),
      ...router.ingest(updatedCompleted),
      ...router.ingest(notificationCompleted),
    ];
    expect(systemSubtypes(events)).toEqual([
      { laneId: MATRIARCH, subtype: 'task_started' },
      { laneId: MATRIARCH, subtype: 'task_updated' },
      { laneId: MATRIARCH, subtype: 'task_notification' },
    ]);
  });

  it('local_workflow: another non-agent task_type opens and closes no lane', () => {
    const router = makeRouter();
    const first = router.ingest(started('local_workflow'));
    const second = router.ingest(updatedCompleted);
    expect(laneLifecycle(first)).toEqual([]);
    expect(laneLifecycle(second)).toEqual([]);
  });

  it('local_agent: task_started then a terminal task_updated opens then closes one lane as done', () => {
    const router = makeRouter();
    const events = [...router.ingest(started('local_agent')), ...router.ingest(updatedCompleted)];
    const opened = openedLanes(events);
    expect(opened).toHaveLength(1);
    expect(closes(events)).toEqual([{ type: 'lane_closed', laneId: opened[0]?.id, status: 'done' }]);
    const lifecycle = laneLifecycle(events).map((event) => event.payload.type);
    expect(lifecycle).toEqual(['lane_opened', 'lane_closed']);
  });

  it('no task_type field (omitted on purpose, as older CLIs send it): opens then closes one lane as done', () => {
    const router = makeRouter();
    const events = [...router.ingest(started()), ...router.ingest(updatedCompleted)];
    const opened = openedLanes(events);
    expect(opened).toHaveLength(1);
    expect(closes(events)).toEqual([{ type: 'lane_closed', laneId: opened[0]?.id, status: 'done' }]);
    const lifecycle = laneLifecycle(events).map((event) => event.payload.type);
    expect(lifecycle).toEqual(['lane_opened', 'lane_closed']);
  });
});
