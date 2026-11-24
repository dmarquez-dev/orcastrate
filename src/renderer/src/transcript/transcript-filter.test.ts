import { describe, expect, it } from 'vitest';

import type { EventType, NormalizedEvent } from '@shared/contracts/events';

import {
  CONVERSATION_EVENT_TYPES,
  DEFAULT_TRANSCRIPT_FILTER,
  DIAGNOSTIC_EVENT_TYPES,
  PLUMBING_EVENT_TYPES,
  STARTUP_RECONCILIATION_SUBTYPE,
  filterTranscriptEvents,
  hiddenEventCount,
  isDeliberateStopNotice,
  isStartupReconciliationNotice,
} from './transcript-filter';
import {
  makeCalf,
  makeEvent,
  makeFirstRunEvents,
  makeReconciliationEvent,
} from './test-fixtures';

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
  /**
   * REWRITTEN 2026-08-21, NOT REGRESSED. The previous membership and 6/2/4
   * arity assertions encoded the SUPERSEDED decision that a permission is a
   * conversation event; `contracts/transcript-filter-amendment.ts` moved both
   * permission types to the plumbing set and the sets are 4/2/6 now. An
   * assertion that fails because the decision changed is the previous
   * decision, and it goes.
   */
  it('lands the contract lists verbatim, in the contract order', () => {
    expect(CONVERSATION_EVENT_TYPES).toEqual([
      'user_message',
      'assistant_text',
      'tool_use',
      'tool_result',
    ]);
    expect(DIAGNOSTIC_EVENT_TYPES).toEqual(['error', 'malformed']);
    expect(PLUMBING_EVENT_TYPES).toEqual([
      'thinking',
      'system',
      'lane_opened',
      'lane_closed',
      'permission_request',
      'permission_decision',
    ]);
  });

  it('is 4 / 2 / 6, and the permissions are in PLUMBING', () => {
    expect(CONVERSATION_EVENT_TYPES).toHaveLength(4);
    expect(DIAGNOSTIC_EVENT_TYPES).toHaveLength(2);
    expect(PLUMBING_EVENT_TYPES).toHaveLength(6);
    for (const type of ['permission_request', 'permission_decision'] as const) {
      expect(PLUMBING_EVENT_TYPES).toContain(type);
      expect(CONVERSATION_EVENT_TYPES).not.toContain(type);
      expect(DIAGNOSTIC_EVENT_TYPES).not.toContain(type);
    }
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

  it('ignores payload contents for every subtype the CLI owns', () => {
    // The blanket rule, undisturbed by either payload-scoped exemption below:
    // these are the CLI's own vocabulary and it changes them, so none of them
    // is looked at.
    const systems = [
      makeEvent(1, { type: 'system', subtype: 'init', data: null }),
      makeEvent(2, { type: 'system', subtype: 'hook_started', data: { a: 1 } }),
      makeEvent(3, { type: 'system', subtype: 'a_subtype_invented_next_week', data: null }),
      makeEvent(4, { type: 'system', subtype: 'result', data: { ok: true } }),
    ];
    expect(filterTranscriptEvents(systems, 'conversation')).toEqual([]);
    expect(filterTranscriptEvents(systems, 'everything')).toHaveLength(4);
  });

  it('is total on an empty stream', () => {
    expect(filterTranscriptEvents([], 'conversation')).toEqual([]);
    expect(hiddenEventCount([], 'conversation')).toBe(0);
    expect(hiddenEventCount([], 'everything')).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// The FIRST payload-content exemption (contract amendment, escalation E5)
// ---------------------------------------------------------------------------

describe('the startup-reconciliation notice is diagnostic, not plumbing', () => {
  it('pins the marker string the producer writes', () => {
    expect(STARTUP_RECONCILIATION_SUBTYPE).toBe('startup_reconciliation');
    // And the fixture really is shaped like the producer's payload — both
    // carriers, not one. A one-sided fixture would let the exemption pass here
    // while the real notice stayed hidden in the app.
    const payload = makeReconciliationEvent(1).payload;
    expect(payload.type).toBe('system');
    if (payload.type !== 'system') throw new Error('unreachable');
    expect(payload.subtype).toBe(STARTUP_RECONCILIATION_SUBTYPE);
    expect((payload.data as { subtypeMarker: string }).subtypeMarker).toBe(
      STARTUP_RECONCILIATION_SUBTYPE,
    );
  });

  it('survives the default filter, in place, among plumbing that does not', () => {
    const events = [
      makeEvent(1, { type: 'system', subtype: 'hook_started', data: null }),
      makeReconciliationEvent(2),
      makeEvent(3, { type: 'system', subtype: 'hook_response', data: null }),
      makeEvent(4, { type: 'assistant_text', text: 'after' }),
    ];
    expect(filterTranscriptEvents(events, 'conversation').map((e) => e.seq)).toEqual([2, 4]);
    expect(filterTranscriptEvents(events, 'everything').map((e) => e.seq)).toEqual([1, 2, 3, 4]);
  });

  it('is recognised by EITHER carrier, because over-showing is the safe way to be wrong', () => {
    // The two POSITIVE carriers read the marker's single definition. They used
    // to be literals, which made this test agree with the filter even when the
    // filter had drifted away from what the boot sweep writes. The NEAR-MISS
    // literals further down stay literals, because a near miss has to be
    // spelled out to be a near miss.
    const subtypeOnly = makeEvent(1, {
      type: 'system',
      subtype: STARTUP_RECONCILIATION_SUBTYPE,
      data: null,
    });
    const dataOnly = makeEvent(2, {
      type: 'system',
      subtype: 'something_else',
      data: { subtypeMarker: STARTUP_RECONCILIATION_SUBTYPE },
    });
    expect(isStartupReconciliationNotice(subtypeOnly.payload)).toBe(true);
    expect(isStartupReconciliationNotice(dataOnly.payload)).toBe(true);
    expect(filterTranscriptEvents([subtypeOnly, dataOnly], 'conversation')).toHaveLength(2);
  });

  it('DOES NOT un-hide `system` wholesale — an unmarked system event is still hidden', () => {
    // The negative that makes the exemption an exemption rather than a
    // capitulation. Every one of these is a `system` event and every one of
    // them stays behind the toggle.
    const unmarked = [
      makeEvent(1, { type: 'system', subtype: 'init', data: null }),
      makeEvent(2, { type: 'system', subtype: 'hook_started', data: { reason: 'x' } }),
      // Near misses, on both carriers.
      makeEvent(3, { type: 'system', subtype: 'startup_reconciliation_v2', data: null }),
      makeEvent(4, { type: 'system', subtype: 'x', data: { subtypeMarker: 'resume_fallback' } }),
      makeEvent(5, { type: 'system', subtype: 'x', data: { subtypeMarker: null } }),
      makeEvent(6, { type: 'system', subtype: 'x', data: 'startup_reconciliation' }),
    ];
    for (const event of unmarked) {
      expect(isStartupReconciliationNotice(event.payload), `seq ${event.seq}`).toBe(false);
    }
    expect(filterTranscriptEvents(unmarked, 'conversation')).toEqual([]);
    expect(hiddenEventCount(unmarked, 'conversation')).toBe(6);
  });

  it('exempts nothing but `system` — the marker on another plumbing type is inert', () => {
    // `thinking` carries no subtype at all, but a future payload might; the
    // predicate is anchored on the TYPE first, so it cannot leak.
    const thinking = makeEvent(1, { type: 'thinking', text: 'startup_reconciliation' });
    expect(isStartupReconciliationNotice(thinking.payload)).toBe(false);
    expect(filterTranscriptEvents([thinking], 'conversation')).toEqual([]);
  });

  it('leaves the subsequence and no-mutation guarantees intact', () => {
    const events = [
      makeEvent(1, { type: 'system', subtype: 'init', data: null }),
      makeReconciliationEvent(2),
      makeEvent(3, { type: 'assistant_text', text: 'a' }),
    ];
    const before = structuredClone(events) as NormalizedEvent[];
    const filtered = filterTranscriptEvents(events, 'conversation');

    expect(filtered).not.toBe(events);
    expect(events).toEqual(before);
    let cursor = 0;
    for (const kept of filtered) {
      const found = events.indexOf(kept, cursor);
      expect(found).toBeGreaterThanOrEqual(cursor);
      cursor = found + 1;
    }
  });
});

// ---------------------------------------------------------------------------
// The SECOND payload-content exemption (contracts/stop-notice-visibility.ts)
// ---------------------------------------------------------------------------

describe('a deliberate stop is visible; the rest of lane_closed is not', () => {
  /**
   * ONE STREAM, ONE ASSERTION, so the narrowness is the test rather than a
   * corollary of three separate ones. All three are `lane_closed`; only the
   * status differs, which is the whole of what the exemption reads.
   *
   * `'done'` and `'orphaned'` staying hidden is the DELIBERATE half of this.
   * A `done` lane closing is a Calf finishing its own work — dozens a session,
   * and the routine bookkeeping the filter exists to remove. `'stopped'` has
   * exactly one writer, `PodManager.#stopRunningLanes`, and it runs only
   * because a user pressed Stop.
   */
  const stream = () => [
    makeEvent(1, { type: 'lane_closed', laneId: 'lane-calf-1', status: 'done' }),
    makeEvent(2, { type: 'lane_closed', laneId: 'lane-calf-2', status: 'stopped' }),
    makeEvent(3, { type: 'lane_closed', laneId: 'lane-calf-3', status: 'orphaned' }),
  ];

  it("keeps the 'stopped' one and only it, in place, and hides 'done' and 'orphaned'", () => {
    const events = stream();

    const kept = filterTranscriptEvents(events, 'conversation');
    expect(kept).toEqual([events[1]]);
    expect(kept.map((e) => e.seq)).toEqual([2]);

    expect(filterTranscriptEvents(events, 'everything').map((e) => e.seq)).toEqual([1, 2, 3]);
    expect(hiddenEventCount(events, 'conversation')).toBe(2);
  });

  it('is anchored on the TYPE first, so no other plumbing payload can leak through', () => {
    // The predicate reads `status` only after `lane_closed` is established.
    // Nothing else in the union carries a `status` the exemption could latch
    // onto, and this pins that it cannot start.
    const notLaneClosed = [
      makeEvent(1, { type: 'system', subtype: 'stopped', data: { status: 'stopped' } }),
      makeEvent(2, { type: 'thinking', text: 'stopped' }),
      makeEvent(3, { type: 'lane_opened', lane: makeCalf('lane-calf-9') }),
    ];
    for (const event of notLaneClosed) {
      expect(isDeliberateStopNotice(event.payload), `seq ${event.seq}`).toBe(false);
    }
    expect(filterTranscriptEvents(notLaneClosed, 'conversation')).toEqual([]);
  });

  it('reads the status directly, with no near-miss tolerance', () => {
    const done = makeEvent(1, { type: 'lane_closed', laneId: 'lane-calf-1', status: 'done' });
    const stopped = makeEvent(2, { type: 'lane_closed', laneId: 'lane-calf-2', status: 'stopped' });
    expect(isDeliberateStopNotice(done.payload)).toBe(false);
    expect(isDeliberateStopNotice(stopped.payload)).toBe(true);
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
          resumedAt: null,
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
