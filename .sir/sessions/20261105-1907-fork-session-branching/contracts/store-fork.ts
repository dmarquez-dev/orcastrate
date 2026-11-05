// frozen: 20261105-1907-fork-session-branching, Gate 2
/**
 * CONTRACT — Pod ancestry and the store's fork operation.
 *
 * Boundary between: T2 (implements, in the source tree) and T3 (calls
 * `EventStore.forkPod`, reads the ancestry fields), T4 (reads the ancestry
 * fields off `Pod` in the renderer).
 *
 * WHERE THE DECLARATIONS LIVE. This file is the agreement, not an importable
 * module. T2 writes the shipped declarations into the source tree, and every
 * consumer imports them from there:
 *
 *   - the two ancestry fields      -> `Pod` in `src/shared/contracts/events.ts`
 *   - `ForkPodInput`, `forkPod`    -> `src/shared/contracts/event-store.ts`
 *
 * No consumer re-declares any of them.
 */

import type {
  LaneId,
  Pod,
  PodId,
  Seq,
  Timestamp,
} from '../../../../src/shared/contracts/events';

// ---------------------------------------------------------------------------
// 1. Ancestry on `Pod`
// ---------------------------------------------------------------------------

/**
 * `Pod` in `src/shared/contracts/events.ts` gains EXACTLY these two members,
 * both REQUIRED (never optional), both nullable. Nothing else on `Pod` changes.
 *
 *   forkedFromPodId        The Pod this one was forked from. null for a Pod
 *                          that was never forked, AND null after its parent was
 *                          deleted (`ON DELETE SET NULL`).
 *   forkedFromCcSessionId  The Claude Code session id that was forked to make
 *                          this Pod. null for a Pod that was never forked.
 *                          SURVIVES the parent's deletion — it is the only
 *                          ancestry left once the parent row is gone.
 *
 * So a fork whose parent was deleted reads
 * `{ forkedFromPodId: null, forkedFromCcSessionId: '<id>' }`, and a Pod that
 * was never forked reads both null. Those two states are distinguishable, and
 * consumers may rely on that.
 *
 * Both are IMMUTABLE after creation: `EventStore.updatePod`'s patch type does
 * NOT gain either key.
 *
 * Persisted as `pods.forked_from_pod_id TEXT` (nullable,
 * `REFERENCES pods(id) ON DELETE SET NULL`) and
 * `pods.forked_from_cc_session_id TEXT` (nullable), added by migration 5.
 * `createPod` writes both NULL.
 */
export interface PodAncestry {
  forkedFromPodId: PodId | null;
  forkedFromCcSessionId: string | null;
}

/** Compile-time statement of the post-change shape. */
export type PodAfterThisSession = Pod & PodAncestry;

// ---------------------------------------------------------------------------
// 2. `EventStore.forkPod`
// ---------------------------------------------------------------------------

export interface ForkPodInput {
  /** The new Pod's id. CONFLICT if a Pod with this id exists. */
  id: PodId;
  /** The Pod being forked. NOT_FOUND if absent. */
  parentId: PodId;
  /**
   * The new Pod's own Claude Code session id — the id the SDK's
   * `forkSession` returned. Written to the new row's `ccSessionId`.
   */
  ccSessionId: string;
  /**
   * The Claude Code session id that was forked. Written to the new row's
   * `forkedFromCcSessionId`. Supplied by the caller, NOT re-read from the
   * parent row inside the transaction: it records what was actually forked.
   */
  sourceCcSessionId: string;
  /** The new Pod's title, verbatim. */
  title: string;
  /**
   * Copy the parent's events with `seq <= throughSeq`, and no others. The
   * caller captures it BEFORE the SDK call, so an event the parent appends
   * while the fork is in flight is not copied. `0` copies no events.
   */
  throughSeq: Seq;
  /**
   * Mints one fresh LaneId per copied lane. Called once per parent lane, inside
   * the transaction. A minted id that collides with an existing lane is a
   * CONFLICT and rolls the whole fork back.
   */
  newLaneId: () => LaneId;
  /**
   * The fork instant: the new row's `createdAt` and `lastActiveAt`, and the
   * `endedAt` stamped on any lane copied out of `'running'` (see below).
   */
  now: Timestamp;
}

export interface EventStoreForkMember {
  /**
   * Creates the fork in ONE TRANSACTION and returns the new Pod as `getPod`
   * would read it back. All-or-nothing: on ANY throw no pod, lane or event row
   * from this call remains.
   *
   * THE NEW POD ROW
   *   id, title, ccSessionId           from the input
   *   cwd, permissionMode, envOverrides copied from the parent row
   *   status                            'closed'
   *   tabOrder                          (max tabOrder over ALL pods) + 1,
   *                                     computed inside the transaction, so the
   *                                     fork sorts last in `listPods()`
   *   forkedFromPodId                   input.parentId
   *   forkedFromCcSessionId             input.sourceCcSessionId
   *   createdAt, lastActiveAt           input.now
   *
   * LANES. Every lane the parent has is copied once, with a fresh id from
   * `newLaneId`, `podId` = the new Pod, and `parentLaneId` remapped through the
   * same old->new map (null stays null). Every other column is copied
   * verbatim, EXCEPT: a lane whose status is `'running'` in the parent is
   * written `'stopped'` with `endedAt = input.now` in the fork, because the
   * fork is born `'closed'` and holds no runner.
   *
   * EVENTS. Every parent event with `seq <= throughSeq` is copied once, in seq
   * order, with the SAME `seq`, `type`, `createdAt` and `raw`, `podId` = the
   * new Pod, `laneId` remapped. Inside `payload`, exactly these lane
   * references are remapped through the same map, and nothing else in the
   * payload changes:
   *   lane_opened  payload.lane.id, payload.lane.podId (-> new Pod),
   *                payload.lane.parentLaneId
   *   lane_closed  payload.laneId
   *   tool_use     payload.dispatchedLaneId, when present
   * After the fork, the new Pod's next `append` is assigned
   * `latestSeq(newPod) + 1`, exactly as for any Pod.
   *
   * THE PARENT is not written: its row, lanes and events read back identical.
   *
   * ERRORS (all `EventStoreError` from `src/shared/contracts/event-store.ts`):
   *   NOT_FOUND  no Pod with id `parentId`
   *   CONFLICT   a Pod with id `id` exists, or a minted LaneId collides
   *   IO         the underlying SQLite call failed
   */
  forkPod(input: ForkPodInput): PodAfterThisSession;
}
