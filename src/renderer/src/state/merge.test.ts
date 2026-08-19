/**
 * The transcript merge is the guarantee this whole state layer lives or dies
 * on, so it is tested as a pure function here and again end-to-end through the
 * store in `store.test.ts`.
 *
 * Node environment on purpose: no DOM is involved, and importing the
 * `test-utils` barrel would drag React Testing Library in with it.
 */

import { describe, expect, it } from 'vitest';

import type { NormalizedEvent } from '@shared/contracts/events';

import { highWaterSeq, mergeEvents } from './merge';

function ev(seq: number, laneId = 'lane-matriarch'): NormalizedEvent {
  return {
    id: seq,
    podId: 'pod-1',
    laneId,
    seq,
    type: 'assistant_text',
    payload: { type: 'assistant_text', text: `#${seq}` },
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

function seqs(events: readonly NormalizedEvent[]): number[] {
  return events.map((event) => event.seq);
}

function range(from: number, to: number): NormalizedEvent[] {
  const out: NormalizedEvent[] = [];
  for (let seq = from; seq <= to; seq += 1) out.push(ev(seq));
  return out;
}

describe('mergeEvents', () => {
  it('appends to an empty transcript', () => {
    expect(seqs(mergeEvents([], range(1, 3)))).toEqual([1, 2, 3]);
  });

  it('keeps events strictly ascending when a page lands out of order', () => {
    const merged = mergeEvents([], [ev(5), ev(1), ev(3)]);
    expect(seqs(merged)).toEqual([1, 3, 5]);
  });

  it('drops duplicate seq and keeps the object already present', () => {
    const live = ev(7);
    const backfilled = ev(7);
    const merged = mergeEvents([live], [backfilled]);
    expect(seqs(merged)).toEqual([7]);
    expect(merged[0]).toBe(live);
  });

  it('returns the very same array when the merge changes nothing', () => {
    const existing = range(1, 3);
    expect(mergeEvents(existing, [ev(2)])).toBe(existing);
    expect(mergeEvents(existing, [])).toBe(existing);
  });

  /**
   * ACCEPTANCE CRITERION 6, as a pure function: a live push carrying 40-45
   * arrives first, then the backfill page that eventually covers 1-100. Every
   * seq must appear exactly once, in order, with nothing dropped.
   */
  it('interleaves a live push with a later backfill page covering it', () => {
    const live = range(40, 45);
    const backfill = range(1, 100);

    const merged = mergeEvents(live, backfill);

    expect(merged).toHaveLength(100);
    expect(seqs(merged)).toEqual(seqs(range(1, 100)));
    for (let seq = 1; seq <= 100; seq += 1) {
      expect(merged.filter((event) => event.seq === seq)).toHaveLength(1);
    }
    // The live objects survive the merge — identity is stable even though the
    // index cannot be, once 39 older events are known to precede them.
    expect(merged[39]).toBe(live[0]);
    expect(merged[44]).toBe(live[5]);
  });

  it('merges page by page without gaps or repeats', () => {
    let events: NormalizedEvent[] = [];
    events = mergeEvents(events, range(40, 45));
    events = mergeEvents(events, range(1, 20));
    events = mergeEvents(events, range(21, 60));
    events = mergeEvents(events, range(61, 100));
    expect(seqs(events)).toEqual(seqs(range(1, 100)));
  });

  it('de-duplicates repeats inside a single incoming batch', () => {
    expect(seqs(mergeEvents([], [ev(2), ev(2), ev(3), ev(3)]))).toEqual([2, 3]);
  });

  it('does not mutate its inputs', () => {
    const existing = range(1, 2);
    const incoming = range(3, 4);
    mergeEvents(existing, incoming);
    expect(seqs(existing)).toEqual([1, 2]);
    expect(seqs(incoming)).toEqual([3, 4]);
  });
});

describe('highWaterSeq', () => {
  it('is 0 when empty and the last seq otherwise', () => {
    expect(highWaterSeq([])).toBe(0);
    expect(highWaterSeq(range(1, 9))).toBe(9);
  });
});
