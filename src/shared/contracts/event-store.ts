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

  /** Deletes the Pod and CASCADEs to its lanes and events. Throws NOT_FOUND. */
  deletePod(id: PodId): void;

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
