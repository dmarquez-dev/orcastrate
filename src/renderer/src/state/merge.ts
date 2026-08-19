/**
 * Transcript merge. The single guarantee every consumer leans on:
 * `TranscriptView.events` is strictly ascending by `seq`, holds no duplicate
 * `seq`, and never drops an event.
 *
 * WHY A MERGE AND NOT AN APPEND: backfill pages walk forward from seq 1 while
 * live `podEvent` pushes arrive at the head of the stream. A live event with
 * seq 42 can land minutes before the backfill page that also contains seq 42.
 * Appending would produce a duplicate; replacing would drop the live tail.
 *
 * ON APPEND-STABILITY: the frozen contract asks for both strict `seq` order
 * and index stability. When a backfill page delivers seqs BELOW what is
 * already present, the two cannot both hold — an event cannot stay at index 0
 * once thirty-nine older events are known to precede it. Strict ordering wins,
 * because it is the guarantee the contract states first and the one the
 * transcript is unreadable without. Object identity IS preserved: on a
 * duplicate `seq` the already-present object is kept, so React keys and memo
 * identities survive the merge, and a merge that changes nothing returns the
 * very same array.
 */

import type { NormalizedEvent } from '@shared/contracts/events';

/** Appends unless `event` repeats the `seq` already at the tail. */
function pushUnique(out: NormalizedEvent[], event: NormalizedEvent): void {
  const last = out[out.length - 1];
  if (last !== undefined && last.seq === event.seq) return;
  out.push(event);
}

/**
 * Merges `incoming` into `existing` by `seq`.
 *
 * `existing` is assumed sorted (this function is its only producer);
 * `incoming` is sorted defensively, because a push batch is only documented
 * to be in `seq` order and a backfill page only sorted by the store.
 *
 * Returns `existing` itself when the merge is a no-op, so a redundant page
 * does not re-render the pane.
 */
export function mergeEvents(
  existing: readonly NormalizedEvent[],
  incoming: readonly NormalizedEvent[],
): NormalizedEvent[] {
  if (incoming.length === 0) return existing as NormalizedEvent[];

  const sorted = [...incoming].sort((a, b) => a.seq - b.seq);
  const out: NormalizedEvent[] = [];

  let i = 0;
  let j = 0;
  while (i < existing.length || j < sorted.length) {
    const a = existing[i];
    const b = sorted[j];

    if (a === undefined) {
      if (b === undefined) break;
      pushUnique(out, b);
      j += 1;
      continue;
    }
    if (b === undefined) {
      pushUnique(out, a);
      i += 1;
      continue;
    }
    if (a.seq <= b.seq) {
      // On a tie the already-present object wins and the incoming copy is
      // consumed, so identity is stable and the duplicate never lands.
      pushUnique(out, a);
      i += 1;
      if (b.seq === a.seq) j += 1;
      continue;
    }
    pushUnique(out, b);
    j += 1;
  }

  if (out.length === existing.length && out.every((e, k) => e === existing[k])) {
    return existing as NormalizedEvent[];
  }
  return out;
}

/** Highest `seq` present, or 0 when empty. Derived, never stored. */
export function highWaterSeq(events: readonly NormalizedEvent[]): number {
  const last = events[events.length - 1];
  return last === undefined ? 0 : last.seq;
}
