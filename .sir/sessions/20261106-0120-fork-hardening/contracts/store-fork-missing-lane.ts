// frozen: 20261106-0120-fork-hardening, Gate 2
/**
 * CONTRACT — `EventStore.forkPod` refuses a lane reference it cannot remap.
 *
 * Boundary between: T1 (implements, in `src/main/store/sqlite-event-store.ts`,
 * and states it in the shipped `forkPod` doc comment in
 * `src/shared/contracts/event-store.ts`) and T2 (`PodManager.forkPod`, the
 * store's only production caller, which translates the failure for IPC).
 *
 * WHERE THE DECLARATIONS LIVE. No new runtime declaration is introduced:
 * `EventStoreError` and `EventStoreErrorCode` already ship in
 * `src/shared/contracts/event-store.ts`, and every consumer imports them from
 * there. This file is the agreement about one new error case, not an
 * importable module. No consumer re-declares anything below.
 */

import type { EventStoreErrorCode } from '../../../../src/shared/contracts/event-store';
import type { LaneId, PodId } from '../../../../src/shared/contracts/events';

// ---------------------------------------------------------------------------
// 1. Which references are remapped, and therefore which can be missing
// ---------------------------------------------------------------------------

/**
 * Every lane reference `forkPod` rewrites through its old->new lane map. The
 * map holds exactly the parent Pod's own lanes (`lanes WHERE pod_id = parent`).
 *
 * A copied lane's OWN id is not listed: it is read from the map's keys and
 * can never be missing.
 */
export type RemappedLaneReference =
  | 'events.lane_id'
  | 'lanes.parent_lane_id'
  | 'lane_opened payload.lane.id'
  | 'lane_opened payload.lane.parentLaneId'
  | 'lane_closed payload.laneId'
  | 'tool_use payload.dispatchedLaneId';

// ---------------------------------------------------------------------------
// 2. The failure
// ---------------------------------------------------------------------------

/**
 * When ANY `RemappedLaneReference` names a LaneId that is not one of the
 * parent Pod's lanes, `forkPod` throws an `EventStoreError` with this code.
 *
 * NO FALLBACK. The reference is never written unchanged (the parent's id, or
 * any other id) into the fork. There is no remapped value other than the
 * map's.
 *
 * WHY `IO`. `EventStoreErrorCode` documents `IO` as "the underlying SQLite
 * call failed (disk, corruption, locked)": a dangling lane reference in the
 * parent's stored rows is corruption of stored data, and `forkPod` already
 * reports its other stored-data faults as `IO` (a `parent_lane_id` cycle, and
 * a payload that is not JSON). `NOT_FOUND` is not used: `forkPod` documents it
 * as "no Pod with id `parentId`", and `PodManager.forkPod` passes a store
 * `NOT_FOUND` through as "unknown Pod", which would misreport this case.
 */
export type ForkPodMissingLaneCode = Extract<EventStoreErrorCode, 'IO'>;

/**
 * The thrown value's observable shape.
 *
 * `message` begins `forkPod:` and contains, verbatim, the missing LaneId and
 * the parent PodId. It may also name the `RemappedLaneReference`; consumers
 * must not parse it.
 */
export interface ForkPodMissingLaneFailure {
  readonly name: 'EventStoreError';
  readonly code: ForkPodMissingLaneCode;
  readonly message: `forkPod: ${string}`;
}

/** The two values the message must contain, named for the criteria. */
export interface ForkPodMissingLaneMessageParts {
  missingLaneId: LaneId;
  parentId: PodId;
}

// ---------------------------------------------------------------------------
// 3. What is written
// ---------------------------------------------------------------------------

/**
 * NOTHING. The failure is raised inside `forkPod`'s single IMMEDIATE
 * transaction, so the whole transaction rolls back: no pod, lane or event row
 * from the call survives, including the pod row and any lanes or events
 * already inserted before the missing reference was reached. The parent is
 * not written, as on every `forkPod` path.
 */
export type ForkPodMissingLaneWrites = 'none';

// ---------------------------------------------------------------------------
// 4. What the IPC caller sees (T2's existing translation, unchanged)
// ---------------------------------------------------------------------------

/**
 * `PodManager.forkPod` (`src/main/pod-manager/pod-manager.ts`, the catch
 * around `this.#store.forkPod`) already:
 *   - logs, through its injected logger's `warn`, that the SDK forked session
 *     `<sourceCcSessionId>` into `<the fork port's id>` and that session file
 *     is left orphaned;
 *   - rethrows an `EventStoreError` whose code is `IO` as
 *     `IpcFailure('IO', 'forkPod failed for pod <podId>: <store message>')`.
 *
 * So `pod:fork` resolves `{ ok: false, error: { code: 'IO', message } }` whose
 * `message` begins `forkPod failed for pod <podId>: forkPod:` and contains the
 * missing LaneId. No renderer change is needed: the existing fork-error alert
 * shows `message` verbatim.
 */
export interface ForkPodMissingLaneAtIpc {
  readonly ok: false;
  readonly error: {
    readonly code: 'IO';
    readonly message: `forkPod failed for pod ${string}: forkPod: ${string}`;
  };
}

// ---------------------------------------------------------------------------
// 5. Payload equality, restated (item 35)
// ---------------------------------------------------------------------------

/**
 * For the three remapped event types (`lane_opened`, `lane_closed`,
 * `tool_use`) a copied payload is "equivalent JSON, lane ids remapped; not
 * byte-identical": it is re-serialized, so key order and whitespace may
 * differ from the stored text while every value other than the remapped lane
 * references (and `lane_opened` `payload.lane.podId`) is equal. Every other
 * event type's payload text is copied byte-for-byte. Unchanged behaviour;
 * T1 states it in the shipped doc comments.
 */
export type ForkPayloadEquality = 'equivalent JSON, lane ids remapped; not byte-identical';
