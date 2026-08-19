/**
 * CONTRACT — Normalized event shape. Frozen at Gate 2.
 *
 * Boundary between: LaneRouter (producer), EventStore (persistence),
 * the IPC surface (transport), and sub-sessions 2/3 (renderer consumers).
 *
 * This is Orcastrate's OWN normalized transcript format (spec 4.4). It is
 * deliberately NOT the SDK message shape and NOT Claude Code's internal
 * `~/.claude/projects/*.jsonl` format. Raw SDK messages are carried only
 * inside `raw` on the events that need them.
 *
 * Everything here is JSON-serializable: it crosses the Electron IPC boundary
 * via structured clone. No Date objects, no Maps, no class instances.
 */

// ---------------------------------------------------------------------------
// Identifiers
// ---------------------------------------------------------------------------

/** Orcastrate-assigned Pod id (uuid v4). Never sent to Claude Code. */
export type PodId = string;

/** Orcastrate-assigned lane id (uuid v4). Distinct from tool_use_id/agent_id. */
export type LaneId = string;

/**
 * The SDK `tool_use_id` of the `Task` block that opened a Calf lane.
 * `null` for the Matriarch lane. Correlates the stream (spec 4.3).
 */
export type ToolUseId = string;

/**
 * The Claude Code agent id a Task returns. Distinct from `ToolUseId`.
 * This is the identifier `SendMessage` / `TaskStop` address (spec 5.3).
 * MVP persists it and does not act on it. May be null if the CLI does not
 * surface one for a given lane — the probe (T2) determines when that happens.
 */
export type AgentId = string;

/** Monotonic, gap-free, per-Pod sequence number. Starts at 1. */
export type Seq = number;

/** ISO-8601 UTC string with milliseconds, e.g. "2026-08-18T18:00:00.000Z". */
export type Timestamp = string;

// ---------------------------------------------------------------------------
// Enumerated states (spec 4.4)
// ---------------------------------------------------------------------------

export type PodStatus = 'idle' | 'running' | 'waiting' | 'beached';

export type LaneStatus = 'running' | 'done' | 'orphaned';

export type LaneKind = 'matriarch' | 'calf';

/**
 * CORRECTION vs spec 4.2 / 5.1: the SDK enum has no `acceptEdits`.
 * Source: resolved-unknowns.md correction #2.
 */
export type PermissionMode = 'default' | 'plan' | 'bypassPermissions';

// ---------------------------------------------------------------------------
// Lane
// ---------------------------------------------------------------------------

export interface Lane {
  id: LaneId;
  podId: PodId;
  kind: LaneKind;
  /** null for the Matriarch. */
  toolUseId: ToolUseId | null;
  /** null when the CLI did not surface an agent id for this lane. */
  agentId: AgentId | null;
  /**
   * Parent lane in the dispatch tree, for nested (depth > 1) subagents.
   * null for the Matriarch. For a depth-1 Calf this is the Matriarch's LaneId.
   * Derived from `parent_agent_id` when present, else from `parent_tool_use_id`.
   * Source: resolved-unknowns.md, "Lane routing may need a tree, not a flat map".
   */
  parentLaneId: LaneId | null;
  /** 0 for the Matriarch, 1 for a Calf it dispatched, 2 for a nested Calf. */
  depth: number;
  /** From the Task tool_use input. null for the Matriarch. */
  subagentType: string | null;
  /** From the Task tool_use input. null for the Matriarch. */
  description: string | null;
  status: LaneStatus;
  startedAt: Timestamp;
  endedAt: Timestamp | null;
}

// ---------------------------------------------------------------------------
// Pod
// ---------------------------------------------------------------------------

export interface Pod {
  id: PodId;
  /** User-supplied. Orcastrate's alone; never sent to Claude Code (spec 5.1). */
  title: string;
  /** Absolute path. Immutable after creation (spec 4.2). */
  cwd: string;
  /** Claude Code's own session id, used for `resume`. null before first turn. */
  ccSessionId: string | null;
  permissionMode: PermissionMode;
  /** Keys merged over `process.env` by PodRunner. See pod-runner.ts. */
  envOverrides: Record<string, string>;
  tabOrder: number;
  status: PodStatus;
  createdAt: Timestamp;
  lastActiveAt: Timestamp;
}

// ---------------------------------------------------------------------------
// Event payloads
// ---------------------------------------------------------------------------

export type EventType =
  | 'user_message'
  | 'assistant_text'
  | 'thinking'
  | 'tool_use'
  | 'tool_result'
  | 'lane_opened'
  | 'lane_closed'
  | 'permission_request'
  | 'permission_decision'
  | 'system'
  | 'error'
  | 'malformed';

export interface UserMessagePayload {
  type: 'user_message';
  text: string;
}

export interface AssistantTextPayload {
  type: 'assistant_text';
  text: string;
}

export interface ThinkingPayload {
  type: 'thinking';
  text: string;
}

export interface ToolUsePayload {
  type: 'tool_use';
  toolUseId: ToolUseId;
  name: string;
  /** Tool input verbatim from the SDK message. */
  input: unknown;
  /**
   * Set when `name === 'Task'`: the LaneId this dispatch opened.
   * Lets the renderer render the inline dispatch card (spec 5.2) without a join.
   */
  dispatchedLaneId?: LaneId;
}

export interface ToolResultPayload {
  type: 'tool_result';
  toolUseId: ToolUseId;
  isError: boolean;
  /** Result content verbatim from the SDK message. */
  content: unknown;
}

export interface LaneOpenedPayload {
  type: 'lane_opened';
  lane: Lane;
}

export interface LaneClosedPayload {
  type: 'lane_closed';
  laneId: LaneId;
  /** 'done' on tool_result; 'orphaned' at a turn boundary with no result. */
  status: Extract<LaneStatus, 'done' | 'orphaned'>;
}

export interface PermissionRequestPayload {
  type: 'permission_request';
  /** Orcastrate-assigned; the id the decision must echo back. */
  requestId: string;
  toolName: string;
  input: unknown;
  /** Present when the SDK request carries the originating tool_use_id. */
  toolUseId: ToolUseId | null;
}

export interface PermissionDecisionPayload {
  type: 'permission_decision';
  requestId: string;
  decision: 'allow' | 'allow_always' | 'deny';
  /** Required when decision === 'deny'. */
  reason?: string;
}

export interface SystemPayload {
  type: 'system';
  subtype: string;
  data: unknown;
}

export interface ErrorPayload {
  type: 'error';
  message: string;
  /** Process exit code when the error is a Beached process (spec 8). */
  exitCode?: number | null;
}

/**
 * A stream line that could not be parsed. Spec 8: logged with the raw line and
 * skipped; the stream is NOT torn down. It is recorded as an event so the
 * failure is visible in the transcript rather than only in a log file.
 */
export interface MalformedPayload {
  type: 'malformed';
  rawLine: string;
  parseError: string;
}

export type EventPayload =
  | UserMessagePayload
  | AssistantTextPayload
  | ThinkingPayload
  | ToolUsePayload
  | ToolResultPayload
  | LaneOpenedPayload
  | LaneClosedPayload
  | PermissionRequestPayload
  | PermissionDecisionPayload
  | SystemPayload
  | ErrorPayload
  | MalformedPayload;

// ---------------------------------------------------------------------------
// The event
// ---------------------------------------------------------------------------

export interface NormalizedEvent {
  /** Assigned by EventStore on append. Absent on the input side. */
  id: number;
  podId: PodId;
  /**
   * The lane this event belongs to. Never null: unroutable events land on the
   * Matriarch lane rather than being dropped.
   */
  laneId: LaneId;
  seq: Seq;
  type: EventType;
  payload: EventPayload;
  createdAt: Timestamp;
  /**
   * The raw SDK message this event was derived from, when one exists.
   * Present on stream-derived events; absent on synthetic events
   * (`lane_opened`, `lane_closed`, `permission_decision`).
   */
  raw?: unknown;
}

/** The shape handed to EventStore.append — no `id`, no `seq`; the store assigns both. */
export type NewEvent = Omit<NormalizedEvent, 'id' | 'seq'>;
