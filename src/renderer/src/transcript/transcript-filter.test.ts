import { describe, expect, it } from 'vitest';

import type { EventType, NormalizedEvent } from '@shared/contracts/events';

import {
  CONVERSATION_EVENT_TYPES,
  DEFAULT_TRANSCRIPT_FILTER,
  DIAGNOSTIC_EVENT_TYPES,
  PLUMBING_EVENT_TYPES,
  filterTranscriptEvents,
  hiddenEventCount,
} from './transcript-filter';
import { makeEvent, makeFirstRunEvents } from './test-fixtures';

/**
 * Every member of the frozen union, written out. This object is a SECOND,
 * independent guard on the same partition: `Record<EventType, ...>` stops
 * type-checking the moment the union grows, and the runtime assertions below
 * then check the new member landed in exactly one of the three sets.
 */
const ALL_EVENT_TYPES: Record<EventType, true> = {
  user_message: true,
  assistant_text: true,
  thinking: true,
  tool_use: true,
  tool_result: true,
  lane_opened: true,
  lane_closed: true,
  permission_request: true,
  permission_decision: true,
  system: true,
  error: true,
  malformed: true,
};

const EVERY_EVENT_TYPE = Object.keys(ALL_EVENT_TYPES) as EventType[];

describe('the three sets partition EventType (AC1)', () => {
  it('lands the contract lists verbatim', () => {
    expect(CONVERSATION_EVENT_TYPES).toEqual([
      'user_message',
      'assistant_text',
      'tool_use',
      'tool_result',
      'permission_request',
      'permission_decision',
    ]);
    expect(DIAGNOSTIC_EVENT_TYPES).toEqual(['error', 'malformed']);
    expect(PLUMBING_EVENT_TYPES).toEqual(['thinking', 'system', 'lane_opened', 'lane_closed']);
  });

  it('assigns every EventType to exactly one set', () => {
    for (const type of EVERY_EVENT_TYPE) {
      const memberships = [
        CONVERSATION_EVENT_TYPES.includes(type),
        DIAGNOSTIC_EVENT_TYPES.includes(type),
        PLUMBING_EVENT_TYPES.includes(type),
      ].filter(Boolean);
      expect(memberships, `${type} belongs to ${memberships.length} sets`).toHaveLength(1);
    }
  });

  it('covers the union with no leftovers in either direction', () => {
    const union = [
      ...CONVERSATION_EVENT_TYPES,
      ...DIAGNOSTIC_EVENT_TYPES,
      ...PLUMBING_EVENT_TYPES,
    ];
    expect(union).toHaveLength(EVERY_EVENT_TYPE.length);
    expect([...union].sort()).toEqual([...EVERY_EVENT_TYPE].sort());
  });

  it('defaults to the conversation', () => {
    expect(DEFAULT_TRANSCRIPT_FILTER).toBe('conversation');
  });
});

describe('filterTranscriptEvents (AC6)', () => {
  const events = makeFirstRunEvents();

  it('returns a NEW array and leaves the input identical by deep comparison', () => {
    const before = structuredClone(events) as NormalizedEvent[];

    const filtered = filterTranscriptEvents(events, 'conversation');
    expect(filtered).not.toBe(events);
    expect(events).toEqual(before);
    // The element objects themselves were not touched either.
    expect(events.map((e) => e.seq)).toEqual(before.map((e) => e.seq));

    // Mutating the OUTPUT cannot reach the input.
    filtered.length = 0;
    expect(events).toEqual(before);
  });

  it("returns a new array in 'everything' mode too, holding every event in input order", () => {
    const filtered = filterTranscriptEvents(events, 'everything');
    expect(filtered).not.toBe(events);
    expect(filtered).toEqual([...events]);
    expect(filtered.map((e) => e.seq)).toEqual(events.map((e) => e.seq));
  });

  it('returns a SUBSEQUENCE: same relative order, seq still ascending, no duplicates', () => {
    const filtered = filterTranscriptEvents(events, 'conversation');
    expect(filtered.length).toBeGreaterThan(0);
    expect(filtered.length).toBeLessThan(events.length);

    // Subsequence: walk the input once and match every output element in order.
    let cursor = 0;
    for (const kept of filtered) {
      const found = events.indexOf(kept, cursor);
      expect(found).toBeGreaterThanOrEqual(cursor);
      cursor = found + 1;
    }

    const seqs = filtered.map((e) => e.seq);
    expect([...seqs].sort((a, b) => a - b)).toEqual(seqs);
    expect(new Set(seqs).size).toBe(seqs.length);
  });

  it('hides exactly the plumbing types and keeps conversation and diagnostics', () => {
    const one = EVERY_EVENT_TYPE.map((type, i) =>
      makeEvent(i + 1, payloadFor(type)),
    );
    const kept = filterTranscriptEvents(one, 'conversation').map((e) => e.payload.type);

    expect([...kept].sort()).toEqual(
      [...CONVERSATION_EVENT_TYPES, ...DIAGNOSTIC_EVENT_TYPES].sort(),
    );
    for (const type of PLUMBING_EVENT_TYPES) expect(kept).not.toContain(type);
  });

  it('ignores payload contents — no `system` subtype is special-cased', () => {
    const systems = [
      makeEvent(1, { type: 'system', subtype: 'init', data: null }),
      makeEvent(2, { type: 'system', subtype: 'startup_reconciliation', data: { a: 1 } }),
      makeEvent(3, { type: 'system', subtype: 'a_subtype_invented_next_week', data: null }),
    ];
    expect(filterTranscriptEvents(systems, 'conversation')).toEqual([]);
    expect(filterTranscriptEvents(systems, 'everything')).toHaveLength(3);
  });

  it('is total on an empty stream', () => {
    expect(filterTranscriptEvents([], 'conversation')).toEqual([]);
    expect(hiddenEventCount([], 'conversation')).toBe(0);
    expect(hiddenEventCount([], 'everything')).toBe(0);
  });
});

describe('hiddenEventCount', () => {
  it('is events.length - filtered.length, and 0 in everything mode', () => {
    const events = makeFirstRunEvents();
    const hidden = hiddenEventCount(events, 'conversation');
    expect(hidden).toBe(events.length - filterTranscriptEvents(events, 'conversation').length);
    // 53 `system` + one each of `thinking`, `lane_opened` and `lane_closed`.
    expect(hidden).toBe(56);
    expect(hiddenEventCount(events, 'everything')).toBe(0);
  });
});

/** One payload per `EventType`, so the switch below is the union's own shape. */
function payloadFor(type: EventType) {
  switch (type) {
    case 'user_message':
      return { type, text: 'u' } as const;
    case 'assistant_text':
      return { type, text: 'a' } as const;
    case 'thinking':
      return { type, text: 't' } as const;
    case 'tool_use':
      return { type, toolUseId: 'toolu_1', name: 'Read', input: {} } as const;
    case 'tool_result':
      return { type, toolUseId: 'toolu_1', isError: false, content: 'ok' } as const;
    case 'lane_opened':
      return {
        type,
        lane: {
          id: 'lane-calf-1',
          podId: 'pod-1',
          kind: 'calf',
          toolUseId: 'toolu_1',
          agentId: 'agent_1',
          parentLaneId: 'lane-matriarch',
          depth: 1,
          subagentType: 'reviewer',
          description: null,
          status: 'running',
          startedAt: '2026-01-01T00:00:00.000Z',
          endedAt: null,
        },
      } as const;
    case 'lane_closed':
      return { type, laneId: 'lane-calf-1', status: 'done' } as const;
    case 'permission_request':
      return { type, requestId: 'r', toolName: 'Bash', input: {}, toolUseId: 'toolu_1' } as const;
    case 'permission_decision':
      return { type, requestId: 'r', decision: 'allow' } as const;
    case 'system':
      return { type, subtype: 'init', data: null } as const;
    case 'error':
      return { type, message: 'boom', exitCode: null } as const;
    case 'malformed':
      return { type, rawLine: 'x', parseError: 'y' } as const;
    default: {
      const exhaustive: never = type;
      throw new Error(`unhandled ${String(exhaustive)}`);
    }
  }
}
