/**
 * CONTRACT — EventStore. Frozen at Gate 2; amended at Gate 3 (E1 only) with the
 * user's approval: `EventStoreError` is a real class rather than an ambient
 * declaration. Nothing else in this file changed, and it is frozen again.
 *
 * Boundary between: T3 (implementer, SQLite) and T4 PodRunner / T5 LaneRouter /
 * T7 IPC handlers (consumers), plus sub-session 2's transcript hydration.
 *
 * Backed by better-sqlite3 in Electron `userData`. All methods are SYNCHRONOUS
 * because better-sqlite3 is synchronous; callers must not await them.
 */

import type {
  AgentId,
  Lane,
  LaneId,
  LaneStatus,
  NewEvent,
  NormalizedEvent,
  PermissionMode,
  Pod,
  PodId,
  PodStatus,
  Seq,
  Timestamp,
  ToolUseId,
} from './events';

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/**
 * Base class for every error this module throws. Consumers may catch this and
 * narrow with `instanceof`.
 *
 * AMENDED at Gate 3 (E1). This was `export declare class`, which is an
 * *ambient* declaration: TypeScript emits no runtime value for it, so a
 * consumer writing `catch (e) { if (e instanceof EventStoreError) ... }`
 * against an import of THIS module got `undefined is not a constructor`. It is
 * now a real exported class, and this file is its single definition — the
 * implementation in `src/main/store/errors.ts` re-exports it rather than
 * declaring a parallel one, so the two cannot drift and no compile-time
 * assignability pin is needed.
 *
 * A contract file carrying a runtime value is not new here: `SCHEMA_TABLES`
 * below and `EVENT_CHANNELS` in `./ipc` are both emitted values.
 */
export class EventStoreError extends Error {
  readonly code: EventStoreErrorCode;

  constructor(code: EventStoreErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'EventStoreError';
    this.code = code;
    // Keeps `instanceof` correct when a consumer's bundler transpiles this
    // down to an ES5-style constructor function.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export type EventStoreErrorCode =
  /** No row with the given PodId / LaneId. */
  | 'NOT_FOUND'
  /** A uniqueness constraint was violated (duplicate pod id, duplicate seq). */
  | 'CONFLICT'
  /** The underlying SQLite call failed (disk, corruption, locked). */
  | 'IO'
  /** Schema version on disk is newer than this build understands. */
  | 'SCHEMA_MISMATCH';

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

export interface CreatePodInput {
  id: PodId;
  title: string;
  cwd: string;
  permissionMode: PermissionMode;
  envOverrides: Record<string, string>;
  tabOrder: number;
}

export interface CreateLaneInput {
  id: LaneId;
  podId: PodId;
  kind: Lane['kind'];
  toolUseId: ToolUseId | null;
  agentId: AgentId | null;
  parentLaneId: LaneId | null;
  depth: number;
  subagentType: string | null;
  description: string | null;
}

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
   * `endedAt` stamped on any lane copied out of `'running'` (see `forkPod`).
   */
  now: Timestamp;
}

export interface ReadEventsQuery {
  podId: PodId;
  /** Restrict to one lane. Omit for the whole Pod. */
  laneId?: LaneId;
  /** Return events with `seq > afterSeq`. Omit to start from the beginning. */
  afterSeq?: Seq;
  /** Max rows. Default 500, max 5000. Values above the max are clamped. */
  limit?: number;
}

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface EventStore {
  /**
   * Applies pending migrations. Idempotent. Must be called before any other
   * method. Throws SCHEMA_MISMATCH if the on-disk schema is from a newer build.
   */
  migrate(): void;

  // -- pods ----------------------------------------------------------------

  /** Throws CONFLICT if the id already exists. */
  createPod(input: CreatePodInput): Pod;

  /** Returns null rather than throwing when the Pod does not exist. */
  getPod(id: PodId): Pod | null;

  /** Ordered by `tabOrder` ascending, then `createdAt` ascending. */
  listPods(): Pod[];

  /**
   * Partial update. Only the supplied keys change. Also refreshes
   * `lastActiveAt` to now unless `lastActiveAt` is supplied explicitly.
   * Throws NOT_FOUND.
   */
  updatePod(
    id: PodId,
    patch: Partial<
      Pick<
        Pod,
        | 'title'
        | 'ccSessionId'
        | 'permissionMode'
        | 'envOverrides'
        | 'tabOrder'
        | 'status'
        | 'lastActiveAt'
      >
    >,
  ): Pod;

  /**
   * Deletes the Pod and CASCADEs to its lanes and events. Throws NOT_FOUND.
   * A Pod forked from it keeps its row, lanes and events; its
   * `forkedFromPodId` becomes null (`ON DELETE SET NULL`) and its
   * `forkedFromCcSessionId` is kept.
   */
  deletePod(id: PodId): void;

  /**
   * Creates the fork in ONE TRANSACTION and returns the new Pod as `getPod`
   * would read it back. All-or-nothing: on ANY throw no pod, lane or event row
   * from this call remains.
   *
   * THE NEW POD ROW
   *   id, title, ccSessionId            from the input
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
   * references are remapped through the same map:
   *   lane_opened  payload.lane.id, payload.lane.podId (-> new Pod),
   *                payload.lane.parentLaneId
   *   lane_closed  payload.laneId
   *   tool_use     payload.dispatchedLaneId, when present
   * For these three types the copied payload is
   * "equivalent JSON, lane ids remapped; not byte-identical": it is
   * re-serialized, so key order and whitespace may differ from the stored
   * text while every other value is equal. Every other event type's payload
   * text is copied byte-for-byte.
   * After the fork, the new Pod's next `append` is assigned
   * `latestSeq(newPod) + 1`, exactly as for any Pod.
   *
   * THE PARENT is not written: its row, lanes and events read back identical.
   *
   * ERRORS:
   *   NOT_FOUND  no Pod with id `parentId`
   *   CONFLICT   a Pod with id `id` exists, or a minted LaneId collides
   *   IO         the underlying SQLite call failed
   *   IO         a lane reference the fork remaps (an event's laneId, a lane's
   *              parentLaneId, or a payload reference listed under EVENTS)
   *              names no lane of the parent, with no fallback: the reference
   *              is never written unchanged. The message begins `forkPod:` and
   *              names the missing LaneId and the parent PodId. Nothing is
   *              written.
   */
  forkPod(input: ForkPodInput): Pod;

  // -- lanes ---------------------------------------------------------------

  /** Throws CONFLICT on duplicate id, NOT_FOUND if the Pod does not exist. */
  createLane(input: CreateLaneInput): Lane;

  getLane(id: LaneId): Lane | null;

  /**
   * Lane lookup by the correlating `tool_use_id` within one Pod — the hot path
   * for spec 4.3 routing. Returns null when no Calf owns that id.
   */
  getLaneByToolUseId(podId: PodId, toolUseId: ToolUseId): Lane | null;

  /** The Matriarch lane for a Pod. Returns null before the Pod's first lane exists. */
  getMatriarchLane(podId: PodId): Lane | null;

  /** Ordered: Matriarch first, then Calves by `startedAt` ascending. */
  listLanes(podId: PodId): Lane[];

  /**
   * Sets status and, for a terminal status ('done' | 'orphaned' | 'stopped'), stamps
   * `endedAt`. Setting a lane back to 'running' clears `endedAt`.
   * Throws NOT_FOUND.
   */
  setLaneStatus(id: LaneId, status: LaneStatus, endedAt?: string): Lane;

  /** Backfills `agentId` once the CLI surfaces it. Throws NOT_FOUND. */
  setLaneAgentId(id: LaneId, agentId: AgentId): Lane;

  // -- events --------------------------------------------------------------

  /**
   * Appends one event, assigning the next per-Pod `seq` (previous max + 1,
   * starting at 1) and the row `id`. Returns the stored event.
   *
   * ORDERING GUARANTEE consumers may rely on: within a single Pod, `seq` is
   * strictly increasing, gap-free, and assigned in call order. Assignment and
   * insert happen in one transaction, so a concurrent append cannot interleave
   * a duplicate seq. `seq` is NOT unique across Pods.
   *
   * NOT idempotent — calling twice with the same NewEvent stores two rows.
   * Deduplication, if any, belongs to the caller.
   */
  append(event: NewEvent): NormalizedEvent;

  /**
   * Appends many events in ONE transaction, preserving array order.
   * All-or-nothing: any failure rolls back the whole batch.
   */
  appendMany(events: NewEvent[]): NormalizedEvent[];

  /** Ascending by `seq`. Returns [] for an unknown Pod rather than throwing. */
  readEvents(query: ReadEventsQuery): NormalizedEvent[];

  /** Highest `seq` for the Pod, or 0 when the Pod has no events. */
  latestSeq(podId: PodId): Seq;

  // -- lifecycle -----------------------------------------------------------

  close(): void;
}

/**
 * Factory. `filename` is an absolute path, or ':memory:' for tests.
 * Does NOT call migrate() — the caller does, so migration failures are
 * attributable.
 */
export type OpenEventStore = (filename: string) => EventStore;

/** Table/column names the SQLite schema must use, so tests can assert on them. */
export const SCHEMA_TABLES = ['pods', 'lanes', 'events', 'schema_version'] as const;
