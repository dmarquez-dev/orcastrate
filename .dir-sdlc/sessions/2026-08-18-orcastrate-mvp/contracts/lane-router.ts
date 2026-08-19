/**
 * CONTRACT — LaneRouter. Frozen at Gate 2.
 *
 * Boundary between: T5 (implementer), T4 PodRunner (feeds it SDK messages),
 * T6 (fixture-replay tests), and sub-session 2 (consumes the emitted events).
 *
 * The router is PURE with respect to I/O: it takes SDK messages in and returns
 * normalized events out. It never touches SQLite and never touches IPC. That is
 * what makes T6's fixture replay possible without a database or a live CLI.
 */

import type {
  AgentId,
  Lane,
  LaneId,
  NewEvent,
  PodId,
  ToolUseId,
} from './events';

// ---------------------------------------------------------------------------
// Routing mode (spec 4.3 fallback)
// ---------------------------------------------------------------------------

/**
 * Chosen from the T2 probe findings, NOT from the spec's assumption.
 *
 * - 'lanes'  — `parent_tool_use_id` correlates; Calves become lanes.
 * - 'inline' — correlation absent or unreliable; every event routes to the
 *              Matriarch lane and Task blocks render as expandable inline
 *              regions. Spec 4.3 "Fallback if the assumption fails".
 *
 * In 'inline' mode the router STILL emits `lane_opened` / `lane_closed` events
 * and still records `agentId`, so the event store, persistence model, and IPC
 * surface are identical in both modes — only `NormalizedEvent.laneId` differs
 * (always the Matriarch's in 'inline' mode). This is what keeps the fallback a
 * UI degradation rather than a redesign.
 */
export type RoutingMode = 'lanes' | 'inline';

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

export interface LaneRouterOptions {
  podId: PodId;
  /** LaneId to use for the Matriarch. Caller-supplied so ids stay stable across resume. */
  matriarchLaneId: LaneId;
  mode: RoutingMode;
  /** Id generator for newly opened Calf lanes. Injectable so tests are deterministic. */
  newLaneId: () => LaneId;
  /** Clock, injectable so fixture replay produces stable timestamps. */
  now: () => string;
  /**
   * Maximum depth at which a Calf still opens its own lane. Deeper dispatches
   * attach to their nearest ancestor lane at this depth. Default 2.
   */
  maxLaneDepth?: number;
}

// ---------------------------------------------------------------------------
// Rehydration (resume)
// ---------------------------------------------------------------------------

/**
 * Lanes restored from EventStore when a Pod resumes, so routing continues
 * against the same lane identities. Passed to `restore()` before any `ingest()`.
 */
export interface RestoredLanes {
  lanes: Lane[];
}

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface LaneRouter {
  readonly mode: RoutingMode;

  /** Rebuilds internal lane maps from persisted lanes. Idempotent. */
  restore(state: RestoredLanes): void;

  /**
   * Routes ONE raw SDK message and returns the normalized events it produced,
   * in emission order. Returns [] when the message produces nothing visible.
   *
   * Guarantees consumers may rely on:
   *  - Ordering: the returned array is in causal order, and successive
   *    `ingest()` calls produce events that may be appended in call order.
   *  - `lane_opened` for a Calf is ALWAYS emitted before any event carrying
   *    that Calf's `laneId`, and before the `tool_use` event that dispatched
   *    it, so a consumer never sees an unknown laneId.
   *  - Every returned event has a non-null `laneId`. An event whose
   *    `parent_tool_use_id` matches no known lane routes to the Matriarch and
   *    is NOT dropped.
   *  - Purity: `ingest` must not throw on any input. A message it cannot parse
   *    becomes a `malformed` event (spec 8 — the stream is not torn down).
   *    Only a programming error (e.g. `ingest` before construction completes)
   *    may throw.
   */
  ingest(message: unknown): NewEvent[];

  /**
   * Called at a turn boundary (SDK `result` message). Any Calf still 'running'
   * with no `tool_result` is closed as 'orphaned' (spec 8), and the
   * corresponding `lane_closed` events are returned.
   */
  onTurnBoundary(): NewEvent[];

  /** Current lane set, Matriarch first. */
  lanes(): Lane[];

  getLaneByToolUseId(toolUseId: ToolUseId): Lane | null;

  /** Lanes whose `agentId` is known — the set Steer (spec 5.3) can address. */
  agentIds(): ReadonlyMap<LaneId, AgentId>;
}

export type CreateLaneRouter = (options: LaneRouterOptions) => LaneRouter;

// ---------------------------------------------------------------------------
// Fields the router reads off SDK messages
// ---------------------------------------------------------------------------

/**
 * Documented on `SDKUserMessage` / `SDKAssistantMessage`: "set for subagent
 * messages". Source: resolved-unknowns.md, rung 3.
 */
export const FIELD_PARENT_TOOL_USE_ID = 'parent_tool_use_id';

/**
 * Present for nested (depth > 1) subagents on Claude Code v2.1.202+.
 * The router prefers this over FIELD_PARENT_TOOL_USE_ID when both are present,
 * because only it can express an agent that spawned an agent.
 * The EXACT field name and nesting semantics are whatever the T2 probe's
 * depth-2 capture shows; if the capture disagrees with this constant, T5
 * escalates rather than editing this file.
 */
export const FIELD_PARENT_AGENT_ID = 'parent_agent_id';
