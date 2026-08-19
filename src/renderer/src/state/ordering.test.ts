import { describe, expect, it } from 'vitest';

import type { Lane, Pod } from '@shared/contracts/events';

// Imported directly rather than through the `test-utils` barrel: this suite
// runs in the node environment, and the barrel pulls in React Testing Library.
import { makeStubLane, makeStubPod } from '../test-utils/stub-api';

import { matriarchOf, orderLanes, orderPods } from './ordering';

function ids(rows: readonly { id: string }[]): string[] {
  return rows.map((row) => row.id);
}

describe('orderPods', () => {
  it('sorts by tabOrder, then createdAt, then id', () => {
    const pods: Pod[] = [
      makeStubPod({ id: 'c', tabOrder: 1, createdAt: '2026-01-01T00:00:00.000Z' }),
      makeStubPod({ id: 'b', tabOrder: 0, createdAt: '2026-01-02T00:00:00.000Z' }),
      makeStubPod({ id: 'a', tabOrder: 0, createdAt: '2026-01-01T00:00:00.000Z' }),
      makeStubPod({ id: 'd', tabOrder: 0, createdAt: '2026-01-01T00:00:00.000Z' }),
    ];
    expect(ids(orderPods(pods))).toEqual(['a', 'd', 'b', 'c']);
  });

  it('does not mutate its input', () => {
    const pods = [makeStubPod({ id: 'z', tabOrder: 9 }), makeStubPod({ id: 'y', tabOrder: 1 })];
    orderPods(pods);
    expect(ids(pods)).toEqual(['z', 'y']);
  });
});

describe('orderLanes', () => {
  const matriarch = makeStubLane({ id: 'm', startedAt: '2026-01-01T10:00:00.000Z' });
  const calfEarly = makeStubLane({
    id: 'calf-early',
    kind: 'calf',
    startedAt: '2026-01-01T09:00:00.000Z',
  });
  const calfLate = makeStubLane({
    id: 'calf-late',
    kind: 'calf',
    startedAt: '2026-01-01T11:00:00.000Z',
  });
  const calfTieA = makeStubLane({
    id: 'aaa',
    kind: 'calf',
    startedAt: '2026-01-01T11:00:00.000Z',
  });

  it('puts the Matriarch at index 0 even when the push delivered it last', () => {
    expect(ids(orderLanes([calfLate, calfEarly, matriarch]))[0]).toBe('m');
  });

  it('orders Calves by startedAt, ties broken by id', () => {
    expect(ids(orderLanes([matriarch, calfTieA, calfLate, calfEarly]))).toEqual([
      'm',
      'calf-early',
      'aaa',
      'calf-late',
    ]);
  });

  /** The rail must not reshuffle when a lane merely finishes. */
  it('does not move a lane that changes only its status', () => {
    const before = orderLanes([matriarch, calfEarly, calfLate]);
    const finished: Lane = { ...calfEarly, status: 'done', endedAt: '2026-01-01T12:00:00.000Z' };
    const after = orderLanes([matriarch, finished, calfLate]);
    expect(ids(after)).toEqual(ids(before));
  });
});

describe('matriarchOf', () => {
  it('is null for an empty lane list', () => {
    expect(matriarchOf([])).toBeNull();
  });

  it('is the Matriarch when one is present', () => {
    const matriarch = makeStubLane({ id: 'm' });
    const calf = makeStubLane({ id: 'c', kind: 'calf' });
    expect(matriarchOf([calf, matriarch])?.id).toBe('m');
  });
});
