/**
 * CONTRACT — Normalized event shape. Frozen at Gate 2; COMMENTS ONLY
 * corrected at Gate 3 (amendment E2): the dispatch tool is `Agent`, not
 * `Task`, and the claim that the SDK enum lacks `acceptEdits` was false. No
 * type, field or signature in this file changed, so nothing downstream moves.
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
 * The SDK `tool_use_id` of the dispatch block that opened a Calf lane.
 * `null` for the Matriarch lane. Correlates the stream (spec 4.3).
 *
 * THE DISPATCH TOOL IS NAMED `Agent` in CLI 2.1.235. `Task` is the older name
 * and is still accepted, so a name check must match BOTH — see
 * `DISPATCH_TOOL_NAMES` in `src/main/pod/options.ts`. A check written against
 * `'Task'` alone opens ZERO Calf lanes on 2.1.235 and fails silently, which is
 * why every mention in this file was corrected at Gate 3 (amendment E2).
 */
export type ToolUseId = string;

/**
 * The Claude Code agent id a dispatch (`Agent`, formerly `Task`) returns.
 * Distinct from `ToolUseId`.
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

/**
 * The FIVE states a Pod can be in. `'closed'` is FIRST because it is the
 * initial state of every Pod; order in a union is documentation, not
 * semantics, but it is fixed here so two implementers cannot produce two
 * orderings.
 *
 *   'closed'   Main holds NO live `PodRunner` for this Pod, and that is the
 *              intended, non-error state of affairs. The Pod row exists; there
 *              is no process. Reached by creation, by `closePod`, and by the
 *              boot sweep. The affordance is `Open`.
 *
 *   'idle'     Main HOLDS a live runner and it is between turns. This is a
 *              NARROWING: before `'closed'` existed, `'idle'` also covered the
 *              closed case, and that conflation was the defect.
 *
 *   'running'  Main holds a live runner and a turn is streaming.
 *
 *   'waiting'  Main holds a live runner and at least one permission request is
 *              unanswered.
 *
 *   'beached'  Main holds no live runner because the process DIED or a start
 *              FAILED. Not open, like `'closed'`, but distinguished from it by
 *              carrying a CAUSE: `PodStatusPush.exitCode` and `.detail` are
 *              populated for `'beached'` and for nothing else. The affordance
 *              is `Reconnect`, which resumes against `ccSessionId`.
 *
 * `'closed'` and `'beached'` therefore both mean "no runner"; the difference
 * is that `'beached'` records why.
 *
 * Openness is DERIVED from this field and from nothing else, in exactly one
 * place, written in the positive form so it fails closed:
 *
 *     opened  <=>  status === 'idle' || status === 'running' || status === 'waiting'
 *
 * Widening this union is not free: `src/main/store/schema.ts` mirrors it into
 * a CHECK constraint, and SQLite's CHECK is the only runtime enforcement of
 * the status set anywhere in the product. A sixth member needs a new
 * migration, which the schema-head guard in that file demands at build time.
 */
export type PodStatus = 'closed' | 'idle' | 'running' | 'waiting' | 'beached';

/**
 * The lifecycle of one lane.
 *
 *   'running'   the lane is open and carries no `endedAt`.
 *   'done'      the lane finished ITS OWN work and returned a `tool_result`.
 *   'orphaned'  the lane was FOUND open with no runner — at a turn boundary
 *               (`lane-router.ts`) or at process start (the boot sweep). It is
 *               a recovery state and owes the user an explanation.
 *   'stopped'   The Pod that owns this lane was stopped deliberately. Terminal,
 *               carries an `endedAt`, and — unlike `'orphaned'` — is not a
 *               recovery state and needs no explanation to the user.
 *
 * `'stopped'` is APPENDED. Order in a union is documentation, not semantics,
 * but it is fixed so that every existing citation of the union's text stays
 * readable.
 *
 * Widening this union is not free: `src/main/store/schema.ts` mirrors it into a
 * CHECK constraint, and SQLite's CHECK is the only runtime enforcement of the
 * status set anywhere in the product. A fifth member needs a new migration,
 * which the schema-head guard in that file demands at build time.
 */
export type LaneStatus = 'running' | 'done' | 'orphaned' | 'stopped';

export type LaneKind = 'matriarch' | 'calf';

/**
 * The FOUR permission modes Orcastrate exposes:
 * `default`, `acceptEdits`, `plan`, `bypassPermissions`.
 *
 * This is the product's full permission surface. Every one of the four is
 * selectable in the UI, accepted by the IPC validator, accepted by the
 * PodRunner guard, and permitted by the `pods.permission_mode` CHECK
 * constraint. Treat this union as the single source of truth for that surface.
 *
 * It is deliberately NARROWER than the platform. CLI 2.1.235 accepts seven
 * modes — `default, plan, acceptEdits, bypassPermissions, dontAsk, auto,
 * manual` (verbatim commander rejection quoted in `findings.json`
 * `optionsVerified`). `dontAsk`, `auto` and `manual` are a deliberate product
 * omission and must stay rejected at every layer; the negative tests in
 * `tests/unit/pod/options.test.ts`, `tests/unit/ipc/envelope.test.ts` and
 * `tests/unit/store/schema.test.ts` are named after them.
 *
 * History, so no future reader re-derives it wrongly: this union was three
 * values (`acceptEdits` excluded) up to and including the previous session.
 * The stated reason was "the SDK enum has no `acceptEdits`", which was read
 * from documentation and is FALSE — Gate 3 amendment E2 corrected the
 * justification, and this amendment widens the union itself. Widening was a
 * product decision, not a bug fix, and it required a new schema migration
 * (migration 2 in `src/main/store/schema.ts`) because migration 1's CHECK
 * constraint had already shipped with the three-value list.
 *
 * Adding a fifth mode means: this union, `ALLOWED_PERMISSION_MODES` in
 * `src/main/pod/options.ts`, `PERMISSION_MODES` in
 * `src/main/store/schema.ts`, the `requirePermissionMode` message in
 * `src/main/ipc/validate.ts`, and a NEW migration. Never edit a shipped one.
 */
export type PermissionMode = 'default' | 'acceptEdits' | 'plan' | 'bypassPermissions';

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
  /** From the dispatch tool_use input (`Agent`). null for the Matriarch. */
  subagentType: string | null;
  /** From the dispatch tool_use input (`Agent`). null for the Matriarch. */
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
  /**
   * Claude Code's own session id, used for `resume`. null before the Pod's
   * first turn, and null after the CLI rejected a resume of it, until the fresh
   * session's first id arrives.
   */
  ccSessionId: string | null;
  permissionMode: PermissionMode;
  /** Keys merged over `process.env` by PodRunner. See pod-runner.ts. */
  envOverrides: Record<string, string>;
  tabOrder: number;
  status: PodStatus;
  createdAt: Timestamp;
  lastActiveAt: Timestamp;
  /**
   * The Pod this one was forked from. null for a Pod that was never forked,
   * AND null after its parent was deleted (`ON DELETE SET NULL`). Immutable
   * after creation: not an `updatePod` patch key.
   */
  forkedFromPodId: PodId | null;
  /**
   * The Claude Code session id that was forked to make this Pod. null for a
   * Pod that was never forked. SURVIVES the parent's deletion, so a fork whose
   * parent is gone reads `{ forkedFromPodId: null, forkedFromCcSessionId: '<id>' }`.
   * Immutable after creation: not an `updatePod` patch key.
   */
  forkedFromCcSessionId: string | null;
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
   * Set when `name` is a dispatch tool: the LaneId this dispatch opened.
   * Lets the renderer render the inline dispatch card (spec 5.2) without a join.
   *
   * CORRECTED at Gate 3 (amendment E2): this said `name === 'Task'`. The
   * dispatch tool is named `Agent` in CLI 2.1.235; `Task` is the older name and
   * is still accepted. Match BOTH, via `DISPATCH_TOOL_NAMES` in
   * `src/main/pod/options.ts` — a producer that tests only for `'Task'` never
   * sets this field on 2.1.235, and every dispatch card silently disappears.
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
  /**
   * 'done' on tool_result; 'orphaned' at a turn boundary with no result;
   * 'stopped' when closePod stops the Pod.
   */
  status: Extract<LaneStatus, 'done' | 'orphaned' | 'stopped'>;
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
