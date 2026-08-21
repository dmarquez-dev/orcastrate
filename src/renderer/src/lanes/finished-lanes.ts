import type { Lane, LaneStatus } from '@shared/contracts/events';

/**
 * `contracts/renderer-panes.ts` section 6, implemented.
 *
 * THE FORK, DECIDED UPSTREAM: nothing is ever removed from the snapshot. A
 * finished lane stays in `PodSessionView.lanes`, stays in the registry every
 * dispatch card's per-agent rows are built from, and stays selectable and
 * readable. The rail COLLAPSES it behind a disclosure and does nothing else.
 *
 * This module holds no state and touches no store: which rows are collapsible
 * is a pure function of the rows the rail was handed, and whether the
 * disclosure is open is component-local view state in `LaneRail`.
 */
export const FINISHED_LANE_STATUSES: readonly LaneStatus[] = ['done', 'orphaned'];

/** The slice of `LaneRowVm` the partition reads. Not a new view model. */
export interface LaneRowLike {
  lane: Lane;
  isMatriarch: boolean;
  status: LaneStatus;
  unreadEventCount: number;
  awaitingPermission: boolean;
  inPrimaryPane: boolean;
  inFollowerPane: boolean;
}

/**
 * The four NEVER-COLLAPSE rules, in one predicate so no caller can apply three
 * of them.
 *
 *  1. The Matriarch is never finished for this purpose, whatever its status. It
 *     is index 0 of the rail forever (frozen ORDERING GUARANTEE) and collapsing
 *     it would hide the lane the composer talks to.
 *  2. A lane in the primary or a follower pane is never collapsed. Collapsing
 *     the row for a transcript that is on screen puts the rail and the panes in
 *     visible disagreement.
 *  3. A lane with `awaitingPermission` or a non-zero `unreadEventCount` is never
 *     collapsed. Both mean the lane has something the user has not seen.
 *  4. Everything else whose `status` is in `FINISHED_LANE_STATUSES` collapses.
 */
export function isCollapsibleFinishedLane(row: LaneRowLike): boolean {
  if (row.isMatriarch) return false;
  if (row.inPrimaryPane || row.inFollowerPane) return false;
  if (row.awaitingPermission || row.unreadEventCount > 0) return false;
  return FINISHED_LANE_STATUSES.includes(row.status);
}

/**
 * Partitions rail rows for the collapse. PURE, TOTAL, and ORDER-PRESERVING
 * within each half — `active` and `finished` each keep the relative order they
 * arrived in, which is what lets the rail interleave the finished rows back
 * into rail position on expand rather than appending them.
 *
 * Generic over the row type so a `LaneRowVm[]` in yields a `LaneRowVm[]` out;
 * the contract's declared signature (`LaneRowLike[]`) is the instantiation at
 * `T = LaneRowLike`.
 */
export function partitionFinishedLanes<T extends LaneRowLike>(
  rows: readonly T[],
): { active: T[]; finished: T[] } {
  const active: T[] = [];
  const finished: T[] = [];
  for (const row of rows) {
    if (isCollapsibleFinishedLane(row)) finished.push(row);
    else active.push(row);
  }
  return { active, finished };
}
