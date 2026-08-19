/**
 * Event append semantics, per-Pod sequencing, batch atomicity, reads, and JSON
 * round-tripping. Acceptance criteria 4, 5, 9, 10, 11.
 */

import { afterEach, describe, expect, it } from 'vitest';

import type { NewEvent } from '../../../src/shared/contracts/events';
import { catchStoreError, cleanupStores, eventInput, laneInput, memoryStore, podInput, seededStore } from './helpers';

afterEach(cleanupStores);

describe('append (criterion 4)', () => {
  it('assigns seq starting at 1 and returns the stored event', () => {
    const { store, podId, laneId } = seededStore();

    const first = store.append(eventInput(podId, laneId));
    const second = store.append(eventInput(podId, laneId));

    expect(first.seq).toBe(1);
    expect(second.seq).toBe(2);
    expect(second.id).toBeGreaterThan(first.id);
    expect(store.latestSeq(podId)).toBe(2);
  });

  it('latestSeq is 0 for a Pod with no events and for an unknown Pod', () => {
    const { store, podId } = seededStore();
    expect(store.latestSeq(podId)).toBe(0);
    expect(store.latestSeq('no-such-pod')).toBe(0);
  });

  it('is not idempotent: the same NewEvent appended twice stores two rows', () => {
    const { store, podId, laneId } = seededStore();
    const input = eventInput(podId, laneId);
    store.append(input);
    store.append(input);
    expect(store.readEvents({ podId })).toHaveLength(2);
  });

  it('keeps two Pods gap-free and independent across 1000 interleaved appends', () => {
    const store = memoryStore();
    const a = store.createPod(podInput({ id: 'pod-a', tabOrder: 0 }));
    const b = store.createPod(podInput({ id: 'pod-b', tabOrder: 1 }));
    const laneA = store.createLane(laneInput(a.id, { id: 'lane-a' }));
    const laneB = store.createLane(laneInput(b.id, { id: 'lane-b' }));

    const returnedA: number[] = [];
    const returnedB: number[] = [];

    // 1000 appends total, alternating Pods but not evenly: every third goes to
    // B, so a shared counter would show up immediately as a gap.
    for (let i = 0; i < 1000; i += 1) {
      if (i % 3 === 0) {
        returnedB.push(store.append(eventInput(b.id, laneB.id, { payload: { type: 'thinking', text: `b${i}` } })).seq);
      } else {
        returnedA.push(store.append(eventInput(a.id, laneA.id, { payload: { type: 'thinking', text: `a${i}` } })).seq);
      }
    }

    const expected = (n: number): number[] => Array.from({ length: n }, (_, i) => i + 1);

    expect(returnedA).toEqual(expected(returnedA.length));
    expect(returnedB).toEqual(expected(returnedB.length));
    expect(returnedA.length + returnedB.length).toBe(1000);

    // ...and the same holds for what is actually on disk, read back in order.
    const storedA = store.readEvents({ podId: a.id, limit: 5000 }).map((e) => e.seq);
    const storedB = store.readEvents({ podId: b.id, limit: 5000 }).map((e) => e.seq);
    expect(storedA).toEqual(expected(returnedA.length));
    expect(storedB).toEqual(expected(returnedB.length));
    expect(store.latestSeq(a.id)).toBe(returnedA.length);
    expect(store.latestSeq(b.id)).toBe(returnedB.length);
  });

  it('continues the sequence without a gap after a reopen of the same Pod', () => {
    const { store, podId, laneId } = seededStore();
    store.append(eventInput(podId, laneId));
    store.append(eventInput(podId, laneId));
    expect(store.append(eventInput(podId, laneId)).seq).toBe(3);
  });

  it('throws CONFLICT for an unknown lane or Pod', () => {
    const { store, podId, laneId } = seededStore();
    expect(catchStoreError(() => store.append(eventInput(podId, 'no-such-lane'))).code).toBe('CONFLICT');
    expect(catchStoreError(() => store.append(eventInput('no-such-pod', laneId))).code).toBe('CONFLICT');
  });
});

describe('appendMany (criterion 5)', () => {
  it('preserves array order and assigns a contiguous block of seqs', () => {
    const { store, podId, laneId } = seededStore();
    const batch = ['one', 'two', 'three'].map((text) =>
      eventInput(podId, laneId, { payload: { type: 'assistant_text', text } }),
    );

    const stored = store.appendMany(batch);
    expect(stored.map((e) => e.seq)).toEqual([1, 2, 3]);
    expect(store.readEvents({ podId }).map((e) => (e.payload as { text: string }).text)).toEqual([
      'one',
      'two',
      'three',
    ]);
  });

  it('is all-or-nothing: a constraint violation at the Nth event persists zero rows', () => {
    const { store, podId, laneId } = seededStore();

    // Six events already committed by an earlier, successful call.
    store.appendMany([0, 1, 2, 3, 4, 5].map(() => eventInput(podId, laneId)));
    expect(store.readEvents({ podId })).toHaveLength(6);
    expect(store.latestSeq(podId)).toBe(6);

    // The 4th of the next batch names a lane that does not exist.
    const batch: NewEvent[] = [
      eventInput(podId, laneId, { payload: { type: 'assistant_text', text: 'ok 1' } }),
      eventInput(podId, laneId, { payload: { type: 'assistant_text', text: 'ok 2' } }),
      eventInput(podId, laneId, { payload: { type: 'assistant_text', text: 'ok 3' } }),
      eventInput(podId, 'lane-that-does-not-exist', { payload: { type: 'assistant_text', text: 'boom' } }),
      eventInput(podId, laneId, { payload: { type: 'assistant_text', text: 'ok 5' } }),
    ];

    expect(catchStoreError(() => store.appendMany(batch)).code).toBe('CONFLICT');

    // Zero rows from that batch survived, and the sequence did not advance.
    expect(store.readEvents({ podId })).toHaveLength(6);
    expect(store.latestSeq(podId)).toBe(6);
    expect(store.readEvents({ podId }).some((e) => JSON.stringify(e.payload).includes('ok 1'))).toBe(false);
  });

  it('rolls back a batch whose Nth event violates the type CHECK', () => {
    const { store, podId, laneId } = seededStore();
    const batch = [
      eventInput(podId, laneId),
      eventInput(podId, laneId, { type: 'not_a_real_type' as never }),
      eventInput(podId, laneId),
    ];
    expect(catchStoreError(() => store.appendMany(batch)).code).toBe('CONFLICT');
    expect(store.readEvents({ podId })).toEqual([]);
    expect(store.latestSeq(podId)).toBe(0);
  });

  it('accepts an empty batch', () => {
    const { store, podId } = seededStore();
    expect(store.appendMany([])).toEqual([]);
    expect(store.latestSeq(podId)).toBe(0);
  });
});

describe('readEvents (criterion 9)', () => {
  function storeWithLanes(): { store: ReturnType<typeof memoryStore>; podId: string; m: string; c: string } {
    const store = memoryStore();
    const pod = store.createPod(podInput({ id: 'pod-r' }));
    const m = store.createLane(laneInput(pod.id, { id: 'lane-m' }));
    const c = store.createLane(
      laneInput(pod.id, { id: 'lane-c', kind: 'calf', toolUseId: 'toolu_1', parentLaneId: m.id, depth: 1 }),
    );
    // Interleaved so lane filtering cannot be satisfied by a contiguous slice.
    store.appendMany([
      eventInput(pod.id, m.id),
      eventInput(pod.id, c.id),
      eventInput(pod.id, m.id),
      eventInput(pod.id, c.id),
      eventInput(pod.id, m.id),
    ]);
    return { store, podId: pod.id, m: m.id, c: c.id };
  }

  it('returns ascending by seq', () => {
    const { store, podId } = storeWithLanes();
    expect(store.readEvents({ podId }).map((e) => e.seq)).toEqual([1, 2, 3, 4, 5]);
  });

  it('honours laneId', () => {
    const { store, podId, c } = storeWithLanes();
    const events = store.readEvents({ podId, laneId: c });
    expect(events.map((e) => e.seq)).toEqual([2, 4]);
    expect(events.every((e) => e.laneId === c)).toBe(true);
  });

  it('honours afterSeq', () => {
    const { store, podId } = storeWithLanes();
    expect(store.readEvents({ podId, afterSeq: 3 }).map((e) => e.seq)).toEqual([4, 5]);
    expect(store.readEvents({ podId, afterSeq: 5 })).toEqual([]);
  });

  it('honours laneId and afterSeq together', () => {
    const { store, podId, m } = storeWithLanes();
    expect(store.readEvents({ podId, laneId: m, afterSeq: 1 }).map((e) => e.seq)).toEqual([3, 5]);
  });

  it('honours limit', () => {
    const { store, podId } = storeWithLanes();
    expect(store.readEvents({ podId, limit: 2 }).map((e) => e.seq)).toEqual([1, 2]);
    expect(store.readEvents({ podId, afterSeq: 1, limit: 2 }).map((e) => e.seq)).toEqual([2, 3]);
  });

  it('defaults to 500 rows and clamps a limit above 5000 down to 5000', () => {
    const store = memoryStore();
    const pod = store.createPod(podInput({ id: 'pod-big' }));
    const lane = store.createLane(laneInput(pod.id, { id: 'lane-big' }));
    store.appendMany(Array.from({ length: 5200 }, () => eventInput(pod.id, lane.id)));

    expect(store.readEvents({ podId: pod.id })).toHaveLength(500);
    expect(store.readEvents({ podId: pod.id, limit: 5000 })).toHaveLength(5000);
    expect(store.readEvents({ podId: pod.id, limit: 5001 })).toHaveLength(5000);
    expect(store.readEvents({ podId: pod.id, limit: 1_000_000 })).toHaveLength(5000);
  });

  it('returns [] for an unknown Pod rather than throwing', () => {
    const { store } = storeWithLanes();
    expect(store.readEvents({ podId: 'no-such-pod' })).toEqual([]);
    expect(store.readEvents({ podId: 'no-such-pod', laneId: 'x', afterSeq: 0, limit: 10 })).toEqual([]);
  });
});

describe('JSON round-tripping (criterion 10)', () => {
  it('a stored NormalizedEvent reads back deep-equal apart from id and seq', () => {
    const { store, podId, laneId } = seededStore();

    const input: NewEvent = {
      podId,
      laneId,
      type: 'tool_use',
      payload: {
        type: 'tool_use',
        toolUseId: 'toolu_01ABC',
        name: 'Task',
        input: {
          prompt: 'line one\nline two\ttabbed "quoted" \\ escaped ✓ 🐋',
          nested: { deep: [1, 2, { three: true, four: null }] },
          empty: {},
          emptyList: [],
        },
        dispatchedLaneId: laneId,
      },
      createdAt: '2026-08-18T18:00:00.000Z',
      raw: {
        type: 'assistant',
        message: { content: [{ type: 'tool_use', id: 'toolu_01ABC', input: { unicode: 'ø✓🐋' } }] },
        parent_tool_use_id: null,
      },
    };

    const appended = store.append(input);
    const [read] = store.readEvents({ podId });

    expect(read).toBeDefined();
    expect(read).toStrictEqual(appended);
    const { id, seq, ...withoutAssigned } = appended;
    expect(id).toBeTypeOf('number');
    expect(seq).toBe(1);
    expect(withoutAssigned).toStrictEqual(input);
  });

  it('distinguishes an absent raw from a raw that is null', () => {
    const { store, podId, laneId } = seededStore();

    const absent = eventInput(podId, laneId);
    const explicitNull: NewEvent = { ...eventInput(podId, laneId), raw: null };

    store.appendMany([absent, explicitNull]);
    const [readAbsent, readNull] = store.readEvents({ podId });

    expect(readAbsent).toBeDefined();
    expect(readNull).toBeDefined();
    expect('raw' in (readAbsent as object)).toBe(false);
    expect('raw' in (readNull as object)).toBe(true);
    expect(readNull?.raw).toBeNull();
  });

  it('round-trips every payload variant it is given', () => {
    const { store, podId, laneId } = seededStore();
    const payloads: NewEvent[] = [
      eventInput(podId, laneId, { type: 'user_message', payload: { type: 'user_message', text: 'hi' } }),
      eventInput(podId, laneId, { type: 'thinking', payload: { type: 'thinking', text: 'hmm' } }),
      eventInput(podId, laneId, {
        type: 'tool_result',
        payload: { type: 'tool_result', toolUseId: 'toolu_1', isError: true, content: ['a', { b: 2 }] },
      }),
      eventInput(podId, laneId, {
        type: 'lane_closed',
        payload: { type: 'lane_closed', laneId, status: 'orphaned' },
      }),
      eventInput(podId, laneId, {
        type: 'permission_decision',
        payload: { type: 'permission_decision', requestId: 'req-1', decision: 'deny', reason: 'no' },
      }),
      eventInput(podId, laneId, {
        type: 'error',
        payload: { type: 'error', message: 'process exited', exitCode: null },
      }),
      eventInput(podId, laneId, {
        type: 'malformed',
        payload: { type: 'malformed', rawLine: '{"broken":', parseError: 'Unexpected end of JSON input' },
      }),
    ];

    const stored = store.appendMany(payloads);
    const read = store.readEvents({ podId });
    expect(read).toStrictEqual(stored);
    expect(read.map((e) => e.payload)).toStrictEqual(payloads.map((e) => e.payload));
  });
});
