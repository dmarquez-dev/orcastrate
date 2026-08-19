/**
 * The two ORDERING GUARANTEES the frozen contract makes, in one place.
 *
 * Both are pure and total: they never read the store, never mutate their
 * input, and are stable under a change to any field they do not sort on —
 * which is what makes "a lane that changes only its status does not move"
 * true by construction rather than by luck.
 */

import type { Lane, Pod } from '@shared/contracts/events';

/** `tabOrder` ascending, ties broken by `createdAt` ascending, then `id`. */
export function orderPods(pods: readonly Pod[]): Pod[] {
  return [...pods].sort((a, b) => {
    if (a.tabOrder !== b.tabOrder) return a.tabOrder - b.tabOrder;
    if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/**
 * Matriarch first — index 0, always, whatever order the push delivered.
 * Calves follow by `startedAt` ascending, ties broken by `id`.
 *
 * `status` is deliberately not a sort key: the rail must not reshuffle when a
 * lane finishes.
 */
export function orderLanes(lanes: readonly Lane[]): Lane[] {
  return [...lanes].sort((a, b) => {
    const am = a.kind === 'matriarch' ? 0 : 1;
    const bm = b.kind === 'matriarch' ? 0 : 1;
    if (am !== bm) return am - bm;
    if (a.startedAt !== b.startedAt) return a.startedAt < b.startedAt ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/** The lane the rail pins to the top, or null when the Pod has no lanes yet. */
export function matriarchOf(lanes: readonly Lane[]): Lane | null {
  const ordered = orderLanes(lanes);
  return ordered[0] ?? null;
}
