/**
 * LaneRouter — implementation of `src/shared/contracts/lane-router.ts`.
 *
 * PURITY (contract header, T6's precondition): this file and its siblings
 * import nothing but the frozen contract types. No `better-sqlite3`, no
 * `node:fs`, no `electron`, no `@anthropic-ai/claude-agent-sdk`, no `Date.now`,
 * no `crypto.randomUUID`. Ids and timestamps arrive through `newLaneId` / `now`
 * so replaying a fixture twice yields byte-identical output.
 * `purity.test.ts` enforces this by reading the directory's import graph.
 *
 * ROUTING MODE. `tests/fixtures/protocol/findings.json` records
 * `"recommendedRoutingMode": "lanes"` with `parentToolUseId.correlates: true`.
 * The mode is nevertheless taken from `options.mode` — the caller reads it from
 * findings — and BOTH branches are implemented, because the contract requires
 * `inline` as spec 4.3's fallback.
 *
 * ---------------------------------------------------------------------------
 * The two-phase lane lifecycle, and why it exists
 * ---------------------------------------------------------------------------
 * `findings.json` fixtures[1] (02-nested-dispatch) records an ORDERING HAZARD:
 * `system/task_started` for the depth-2 lane arrives on line 7, BEFORE the
 * `assistant` `Agent` tool_use that opens it on line 8. A `task_started` alone
 * carries no parent information — only `task_id`, `tool_use_id`, `description`
 * and `subagent_type` — so a router that emits `lane_opened` there must guess
 * the parent, and would get depth 1 for a depth-2 Calf.
 *
 * So a lane has two phases:
 *
 *   1. REGISTERED — internal only, no event. Created by whichever of
 *      {`Agent` tool_use block, `system/task_started`} arrives first. A
 *      `task_started` registers the lane and banks its `agentId`, title and
 *      description; it never emits. Only an agent `task_started` does this:
 *      one whose `task_type` is `'local_agent'` or absent. A `task_started`
 *      with any other string `task_type` (a background Bash command's
 *      `'local_bash'`, for one) registers no lane, so that task's later
 *      `task_progress`, `task_updated` and `task_notification` stay Matriarch
 *      `system` events and never open or close a lane.
 *   2. MATERIALIZED — `lane_opened` emitted. Happens at the first moment the
 *      lane's identity is complete (the dispatching tool_use is seen, which is
 *      what supplies `parentLaneId` and `depth`) or, failing that, at the first
 *      moment any event would carry the lane's id.
 *
 * The invariant that makes acceptance criterion 7 hold by construction:
 * `emit()` materializes a lane before appending any event that references it,
 * and the dispatch path materializes before pushing the `tool_use` event. So no
 * consumer can ever see a laneId it has not been told about, in either order of
 * arrival. Nothing is deferred past the point where it becomes observable, and
 * `onTurnBoundary()` materializes anything still registered so a lane whose
 * tool_use never arrives is still reported rather than lost.
 *
 * ---------------------------------------------------------------------------
 * Close logic, and why a launch acknowledgement cannot close a lane
 * ---------------------------------------------------------------------------
 * A Calf closes as 'done' on the TERMINAL TASK SIGNAL — `system/task_updated`
 * whose `patch.status` is terminal (or a `system/task_notification` carrying a
 * terminal status), correlated to the lane by `task_id`.
 *
 * It explicitly does NOT close on the dispatching `Agent` tool_use's
 * `tool_result`. `findings.json` fixtures[3] (04-orphaned-calf,
 * `orphanCondition: "lane-open-at-result"`): in a background dispatch that
 * tool_result is only "Async agent launched successfully" and arrives on line 6
 * while the Calf is still running. Closing there would close the lane at line 6
 * and make an Orphaned test pass vacuously. Here that lane stays 'running'
 * through the `result` message and `onTurnBoundary()` closes it as 'orphaned',
 * which is the real orphan condition the fixture captures.
 */

import type {
  AgentId,
  EventPayload,
  EventType,
  Lane,
  LaneId,
  NewEvent,
  PodId,
  Timestamp,
  ToolUseId,
} from '../../shared/contracts/events';
import type {
  CreateLaneRouter,
  LaneRouter,
  LaneRouterOptions,
  RestoredLanes,
  RoutingMode,
} from '../../shared/contracts/lane-router';
import {
  errorMessage,
  isDispatchTool,
  isObject,
  isTerminalTaskStatus,
  obj,
  readContentBlocks,
  readParentToolUseId,
  safeStringify,
  str,
  type ContentBlock,
} from './messages';

const DEFAULT_MAX_LANE_DEPTH = 2;

interface LaneState {
  lane: Lane;
  /** True once `lane_opened` has been emitted (or the lane came from restore). */
  materialized: boolean;
}

class LaneRouterImpl implements LaneRouter {
  readonly mode: RoutingMode;

  private readonly podId: PodId;
  private readonly matriarchLaneId: LaneId;
  private readonly newLaneId: () => LaneId;
  private readonly now: () => Timestamp;
  private readonly maxLaneDepth: number;

  /** Insertion-ordered; the Matriarch is always the first entry. */
  private readonly states = new Map<LaneId, LaneState>();
  private readonly byToolUseId = new Map<ToolUseId, LaneId>();
  private readonly byAgentId = new Map<AgentId, LaneId>();

  /**
   * True once an `assistant_text` has been routed to the Matriarch lane since
   * the last `result` (or since construction). Set in `emit`, read and reset in
   * `routeResult`. See `routeResult` for why it exists.
   */
  private matriarchTextSinceResult = false;

  constructor(options: LaneRouterOptions) {
    this.podId = options.podId;
    this.matriarchLaneId = options.matriarchLaneId;
    this.mode = options.mode;
    this.newLaneId = options.newLaneId;
    this.now = options.now;
    this.maxLaneDepth =
      typeof options.maxLaneDepth === 'number' && options.maxLaneDepth >= 1
        ? options.maxLaneDepth
        : DEFAULT_MAX_LANE_DEPTH;

    this.states.set(this.matriarchLaneId, {
      // The Matriarch lane is caller-supplied (`matriarchLaneId`), so it already
      // exists as far as consumers are concerned and is never re-opened by the
      // router. That also keeps the store's UNIQUE `idx_lanes_matriarch` safe.
      materialized: true,
      lane: {
        id: this.matriarchLaneId,
        podId: this.podId,
        kind: 'matriarch',
        toolUseId: null,
        agentId: null,
        parentLaneId: null,
        depth: 0,
        subagentType: null,
        description: null,
        status: 'running',
        startedAt: this.now(),
        endedAt: null,
      },
    });
  }

  // -------------------------------------------------------------------------
  // Rehydration
  // -------------------------------------------------------------------------

  restore(state: RestoredLanes): void {
    const incoming = Array.isArray(state?.lanes) ? state.lanes : [];

    this.byToolUseId.clear();
    this.byAgentId.clear();
    const matriarchState = this.states.get(this.matriarchLaneId);
    this.states.clear();
    if (matriarchState) this.states.set(this.matriarchLaneId, matriarchState);

    for (const lane of incoming) {
      if (!isObject(lane) || typeof lane.id !== 'string') continue;
      const snapshot = cloneLane(lane);
      if (snapshot.kind === 'matriarch' || snapshot.id === this.matriarchLaneId) {
        // Keep the caller-supplied id authoritative; adopt the persisted body.
        this.states.set(this.matriarchLaneId, {
          materialized: true,
          lane: { ...snapshot, id: this.matriarchLaneId, kind: 'matriarch' },
        });
        continue;
      }
      // Restored lanes are already known to consumers: never re-emit
      // `lane_opened` for them (the store's UNIQUE idx_lanes_tool_use would
      // reject the re-creation with CONFLICT).
      this.states.set(snapshot.id, { materialized: true, lane: snapshot });
      if (snapshot.toolUseId !== null) this.byToolUseId.set(snapshot.toolUseId, snapshot.id);
      if (snapshot.agentId !== null) this.byAgentId.set(snapshot.agentId, snapshot.id);
    }
  }

  // -------------------------------------------------------------------------
  // Ingest
  // -------------------------------------------------------------------------

  ingest(message: unknown): NewEvent[] {
    const out: NewEvent[] = [];
    try {
      this.route(message, out);
    } catch (error) {
      // Belt and braces: the contract says `ingest` must not throw on ANY
      // input. Anything that escapes the readers is reported as malformed.
      out.push(this.malformed(safeStringify(message), `router error: ${errorMessage(error)}`));
    }
    return out;
  }

  private route(message: unknown, out: NewEvent[]): void {
    let parsed: unknown = message;

    if (typeof message === 'string') {
      const line = message.trim();
      if (line.length === 0) return;
      try {
        parsed = JSON.parse(line) as unknown;
      } catch (error) {
        out.push(this.malformed(message, errorMessage(error)));
        return;
      }
    }

    if (!isObject(parsed)) {
      out.push(this.malformed(safeStringify(message), 'message is not a JSON object'));
      return;
    }

    const type = parsed['type'];
    if (typeof type !== 'string') {
      out.push(this.malformed(safeStringify(parsed), 'message has no string "type"'));
      return;
    }

    switch (type) {
      case 'assistant':
      case 'user':
        this.routeTranscript(type, parsed, out);
        return;
      case 'system':
        this.routeSystem(parsed, out);
        return;
      case 'result':
        this.routeResult(parsed, out);
        return;
      case 'rate_limit_event':
        out.push(
          this.event(this.matriarchLaneId, 'system', {
            type: 'system',
            subtype: 'rate_limit_event',
            data: parsed['rate_limit_info'] ?? null,
          }, parsed),
        );
        return;
      default:
        out.push(
          this.malformed(safeStringify(parsed), `unrecognized message type ${safeStringify(type)}`),
        );
        return;
    }
  }

  // -------------------------------------------------------------------------
  // assistant / user
  // -------------------------------------------------------------------------

  private routeTranscript(kind: 'assistant' | 'user', message: unknown, out: NewEvent[]): void {
    const parentToolUseId = readParentToolUseId(message);
    // Criterion 8: a parent_tool_use_id matching no known lane falls back to the
    // Matriarch. The event is never dropped.
    const ownerLaneId = this.resolveLaneId(parentToolUseId);

    for (const block of readContentBlocks(message)) {
      this.routeBlock(kind, block, ownerLaneId, message, out);
    }
  }

  private routeBlock(
    kind: 'assistant' | 'user',
    block: ContentBlock,
    ownerLaneId: LaneId,
    raw: unknown,
    out: NewEvent[],
  ): void {
    switch (block.kind) {
      case 'text': {
        if (kind === 'user') {
          this.emit(out, ownerLaneId, 'user_message', { type: 'user_message', text: block.text }, raw);
        } else {
          this.emit(out, ownerLaneId, 'assistant_text', {
            type: 'assistant_text',
            text: block.text,
          }, raw);
        }
        return;
      }
      case 'thinking': {
        this.emit(out, ownerLaneId, 'thinking', { type: 'thinking', text: block.text }, raw);
        return;
      }
      case 'tool_use': {
        if (isDispatchTool(block.name)) {
          this.routeDispatch(block.id, block.name, block.input, ownerLaneId, raw, out);
          return;
        }
        this.emit(out, ownerLaneId, 'tool_use', {
          type: 'tool_use',
          toolUseId: block.id,
          name: block.name,
          input: block.input,
        }, raw);
        return;
      }
      case 'tool_result': {
        // Deliberately NOT a lane-close trigger. See the header: for a
        // background dispatch this is the launch acknowledgement, not the
        // Calf's result (findings.json fixtures[3]).
        this.emit(out, ownerLaneId, 'tool_result', {
          type: 'tool_result',
          toolUseId: block.toolUseId,
          isError: block.isError,
          content: block.content,
        }, raw);
        return;
      }
      case 'unreadable': {
        out.push(this.malformed(safeStringify(block.raw), block.reason));
        return;
      }
    }
  }

  /**
   * An `Agent`/`Task` tool_use block. Opens (or completes) the Calf lane and
   * emits `lane_opened` BEFORE the `tool_use` event that dispatched it.
   */
  private routeDispatch(
    toolUseId: ToolUseId,
    name: string,
    input: unknown,
    dispatcherLaneId: LaneId,
    raw: unknown,
    out: NewEvent[],
  ): void {
    const dispatcher = this.states.get(dispatcherLaneId);
    const childDepth = (dispatcher ? dispatcher.lane.depth : 0) + 1;

    const payload = {
      type: 'tool_use' as const,
      toolUseId,
      name,
      input,
    } as { type: 'tool_use'; toolUseId: ToolUseId; name: string; input: unknown; dispatchedLaneId?: LaneId };

    if (childDepth > this.maxLaneDepth) {
      // Contract: "Deeper dispatches attach to their nearest ancestor lane at
      // this depth." The dispatcher is already at or beyond the cap, so its own
      // lane (itself an alias target if it was capped) is that ancestor.
      const registeredId = this.byToolUseId.get(toolUseId);
      const registered = registeredId === undefined ? undefined : this.states.get(registeredId);

      if (registered && registered.materialized) {
        // Already announced (a terminal task signal forced it open before the
        // dispatch arrived): honour it rather than orphaning a known lane.
        payload.dispatchedLaneId = registered.lane.id;
        this.emit(out, dispatcherLaneId, 'tool_use', payload, raw);
        return;
      }
      if (registered) {
        // Registered by an early `task_started` and never announced — discard
        // it rather than leaving a phantom lane for onTurnBoundary to orphan.
        this.states.delete(registered.lane.id);
        if (registered.lane.agentId !== null) this.byAgentId.delete(registered.lane.agentId);
      }
      this.byToolUseId.set(toolUseId, dispatcherLaneId);
      this.emit(out, dispatcherLaneId, 'tool_use', payload, raw);
      return;
    }

    const state = this.openOrCompleteLane(toolUseId, {
      parentLaneId: dispatcherLaneId,
      depth: childDepth,
      subagentType: str(input, 'subagent_type'),
      description: str(input, 'description'),
    });

    // Criterion 7, first half: lane_opened precedes the dispatching tool_use.
    this.materialize(out, state);
    payload.dispatchedLaneId = state.lane.id;
    this.emit(out, dispatcherLaneId, 'tool_use', payload, raw);
  }

  // -------------------------------------------------------------------------
  // system
  // -------------------------------------------------------------------------

  /**
   * `system` messages are session control-plane traffic emitted by the host
   * process, so their transcript event lands on the Matriarch lane — with ONE
   * exception, `task_progress`.
   *
   * Routing a `system` message to a Calf forces that Calf to materialize. For
   * `task_started` that is exactly the ordering hazard the two-phase lifecycle
   * exists to avoid (02-nested-dispatch line 7 precedes the dispatch on line
   * 8), so `task_started` MUST NOT move; the same goes for `init`,
   * `task_updated`, `task_notification`, `background_tasks_changed` and any
   * unknown subtype, which are session- or state-scoped rather than the
   * narration of one Calf's work.
   *
   * `task_progress` is different in kind: it is a progress line ABOUT one
   * Calf's own work, correlated by `tool_use_id`, and putting it on the
   * Matriarch leaves a background Calf's lane empty while the Matriarch fills
   * with narration of a lane the user is reading somewhere else. It is routed
   * through `resolveLaneId`/`emit` — never pushed directly — so the lane
   * materializes first and `lane_opened` still precedes every event carrying
   * that lane's id. A `task_progress` with no `tool_use_id`, or one naming a
   * lane this router has not registered, falls back to the Matriarch and is
   * never dropped, exactly as an unknown `parent_tool_use_id` does.
   *
   * `local_command_output` is the output of a local slash command, declared by
   * the SDK as `SDKLocalCommandOutputMessage` and described there as
   * "Displayed as assistant-style text in the transcript". So when its
   * `content` is a non-empty string it becomes ONE Matriarch `assistant_text`
   * carrying that string, IN PLACE OF the `system` event. When `content` is
   * absent, empty or not a string there is nothing to display as text, and
   * the message keeps the ordinary Matriarch `system` event below. The
   * `assistant_text` goes through `emit`, so it also counts as Matriarch text
   * for the bypassed-turn test in `routeResult`: the command's result does not
   * repeat what its local output already showed.
   */
  private routeSystem(message: Record<string, unknown>, out: NewEvent[]): void {
    const subtype = str(message, 'subtype') ?? 'unknown';

    if (subtype === 'local_command_output') {
      const content = str(message, 'content');
      if (content !== null && content.length > 0) {
        this.emit(out, this.matriarchLaneId, 'assistant_text', {
          type: 'assistant_text',
          text: content,
        }, message);
        return;
      }
    }

    if (subtype === 'task_progress') {
      // `emit` materializes the resolved lane before appending, so criterion 7's
      // ordering guarantee holds here as it does on the transcript paths.
      this.emit(
        out,
        this.resolveLaneId(str(message, 'tool_use_id')),
        'system',
        { type: 'system', subtype, data: message },
        message,
      );
      return;
    }

    // The transcript event first, then the state transition it causes, so a
    // `lane_closed` always follows the `task_updated` that produced it.
    out.push(
      this.event(this.matriarchLaneId, 'system', { type: 'system', subtype, data: message }, message),
    );

    switch (subtype) {
      case 'task_started':
        this.onTaskStarted(message);
        return;
      case 'task_updated':
        this.onTaskUpdated(message, out);
        return;
      case 'task_notification':
        this.onTaskNotification(message, out);
        return;
      default:
        return;
    }
  }

  /**
   * Registers the lane without emitting. May arrive BEFORE the dispatching
   * tool_use (02-nested-dispatch line 7 precedes line 8) or after it
   * (01-parallel-dispatch line 4 follows line 3); both are handled.
   *
   * Only an AGENT task registers a lane: `task_type` `'local_agent'`, or no
   * string `task_type` at all (older CLIs send none). Any other string — a
   * background Bash command's `'local_bash'`, a `'local_workflow'` — registers
   * nothing and banks no `agentId`, because such a task is not a Calf. Its
   * later `task_progress`, `task_updated` and `task_notification` therefore
   * resolve to no lane and stay Matriarch `system` events: no `lane_opened`,
   * no `lane_closed`, and nothing for `onTurnBoundary()` to orphan.
   *
   * `findings.agentId.fieldPath`: "system/task_started.task_id (correlated to
   * the opening Agent tool_use by system/task_started.tool_use_id)".
   */
  private onTaskStarted(message: Record<string, unknown>): void {
    if (!isAgentTask(message)) return;
    const toolUseId = str(message, 'tool_use_id');
    if (toolUseId === null) return;

    const state = this.openOrCompleteLane(toolUseId, {
      subagentType: str(message, 'subagent_type'),
      description: str(message, 'description'),
    });

    const agentId = str(message, 'task_id');
    if (agentId !== null) {
      state.lane.agentId = agentId;
      this.byAgentId.set(agentId, state.lane.id);
    }
  }

  private onTaskUpdated(message: Record<string, unknown>, out: NewEvent[]): void {
    const patch = obj(message, 'patch');
    if (!patch || !isTerminalTaskStatus(patch['status'])) return;
    this.closeByAgentId(str(message, 'task_id'), out);
  }

  private onTaskNotification(message: Record<string, unknown>, out: NewEvent[]): void {
    // Secondary, idempotent close trigger: `task_updated` normally arrives
    // first (01 lines 23/24), but a stream that drops it still closes cleanly.
    if (!isTerminalTaskStatus(message['status'])) return;
    this.closeByAgentId(str(message, 'task_id'), out);
  }

  private closeByAgentId(agentId: string | null, out: NewEvent[]): void {
    if (agentId === null) return;
    const laneId = this.byAgentId.get(agentId);
    if (laneId === undefined) return;
    this.closeLane(laneId, 'done', out);
  }

  // -------------------------------------------------------------------------
  // result
  // -------------------------------------------------------------------------

  /**
   * The turn's `result` message. This produces a transcript event only — it
   * does NOT close lanes. Orphan closing belongs to `onTurnBoundary()`, which
   * the contract makes the caller's explicit call, and which is idempotent.
   *
   * A turn that BYPASSED the model loop (a local slash command such as an
   * unavailable `/theme`) produces no `assistant` message: its only text is the
   * `result` string. So that string is emitted as a Matriarch `assistant_text`
   * BEFORE the unchanged `system` `result:success` event, when ALL of these
   * hold: `subtype` is `'success'`, `is_error` is not `true`, the `result` is
   * a non-empty string, and both halves of the bypass discriminator agree —
   *
   *   1. `terminal_reason` is unset. The SDK's `TerminalReason` is documented
   *      "Unset when the loop was bypassed (local slash command)"; any value,
   *      `'completed'` included, means the loop ran and its text already
   *      arrived as `assistant` messages.
   *   2. No `assistant_text` was routed to the Matriarch lane since the
   *      previous `result`. This keeps a CLI that never sends
   *      `terminal_reason` from showing every reply twice: a turn that ran the
   *      loop has already emitted the Matriarch's text. Text routed to a Calf
   *      lane is not the Matriarch's reply and does not count.
   *
   * The Matriarch-text record is reset at EVERY `result`, error or not, so
   * each turn is judged on its own text. An `is_error` result yields only its
   * `error` event, as it always has.
   */
  private routeResult(message: Record<string, unknown>, out: NewEvent[]): void {
    const subtype = str(message, 'subtype') ?? 'unknown';
    const matriarchTextThisTurn = this.matriarchTextSinceResult;
    this.matriarchTextSinceResult = false;

    if (message['is_error'] === true) {
      out.push(
        this.event(this.matriarchLaneId, 'error', {
          type: 'error',
          message: str(message, 'result') ?? `result/${subtype}`,
          exitCode: null,
        }, message),
      );
      return;
    }

    const resultText = str(message, 'result');
    const loopBypassed = message['terminal_reason'] === undefined || message['terminal_reason'] === null;
    if (
      subtype === 'success' &&
      resultText !== null &&
      resultText.length > 0 &&
      loopBypassed &&
      !matriarchTextThisTurn
    ) {
      out.push(
        this.event(this.matriarchLaneId, 'assistant_text', {
          type: 'assistant_text',
          text: resultText,
        }, message),
      );
    }

    out.push(
      this.event(this.matriarchLaneId, 'system', {
        type: 'system',
        subtype: `result:${subtype}`,
        data: message,
      }, message),
    );
  }

  // -------------------------------------------------------------------------
  // Turn boundary
  // -------------------------------------------------------------------------

  onTurnBoundary(): NewEvent[] {
    const out: NewEvent[] = [];
    for (const state of this.states.values()) {
      if (state.lane.kind !== 'calf') continue;
      if (state.lane.status !== 'running') continue;
      this.closeLane(state.lane.id, 'orphaned', out);
    }
    return out;
  }

  // -------------------------------------------------------------------------
  // Lane bookkeeping
  // -------------------------------------------------------------------------

  /**
   * Creates the lane if this `tool_use_id` is new, otherwise fills in fields
   * that are still unknown. Never creates a second lane for a `tool_use_id`
   * already seen — the store's `idx_lanes_tool_use` is UNIQUE per Pod and would
   * reject the re-creation with CONFLICT.
   */
  private openOrCompleteLane(
    toolUseId: ToolUseId,
    fields: {
      parentLaneId?: LaneId;
      depth?: number;
      subagentType: string | null;
      description: string | null;
    },
  ): LaneState {
    const existingLaneId = this.byToolUseId.get(toolUseId);
    if (existingLaneId !== undefined) {
      const existing = this.states.get(existingLaneId);
      if (existing) {
        // Identity (parent/depth) is only ever learned once, from the
        // dispatching tool_use; a later task_started must not overwrite it.
        if (!existing.materialized && fields.parentLaneId !== undefined) {
          existing.lane.parentLaneId = fields.parentLaneId;
        }
        if (!existing.materialized && fields.depth !== undefined) {
          existing.lane.depth = fields.depth;
        }
        if (existing.lane.subagentType === null) existing.lane.subagentType = fields.subagentType;
        if (existing.lane.description === null) existing.lane.description = fields.description;
        return existing;
      }
    }

    const id = this.newLaneId();
    const state: LaneState = {
      materialized: false,
      lane: {
        id,
        podId: this.podId,
        kind: 'calf',
        toolUseId,
        agentId: null,
        // Unknown until the dispatching tool_use is seen. A lane materialized
        // before that (its tool_use never arrived) reads as a depth-1 Calf of
        // the Matriarch, the same fallback criterion 8 uses for orphan events.
        parentLaneId: fields.parentLaneId ?? this.matriarchLaneId,
        depth: fields.depth ?? 1,
        subagentType: fields.subagentType,
        description: fields.description,
        status: 'running',
        startedAt: this.now(),
        endedAt: null,
      },
    };
    this.states.set(id, state);
    this.byToolUseId.set(toolUseId, id);
    return state;
  }

  /** Phase 2: emit `lane_opened`. Idempotent. */
  private materialize(out: NewEvent[], state: LaneState): void {
    if (state.materialized) return;
    state.materialized = true;
    out.push(
      this.event(state.lane.id, 'lane_opened', {
        type: 'lane_opened',
        lane: cloneLane(state.lane),
      }),
    );
  }

  private closeLane(laneId: LaneId, status: 'done' | 'orphaned', out: NewEvent[]): void {
    const state = this.states.get(laneId);
    if (!state || state.lane.status !== 'running' || state.lane.kind !== 'calf') return;

    // A lane can still be un-materialized here (its `task_started` arrived but
    // its dispatching tool_use never did). Criterion 7 holds either way.
    this.materialize(out, state);

    state.lane.status = status;
    state.lane.endedAt = this.now();
    out.push(
      this.event(laneId, 'lane_closed', { type: 'lane_closed', laneId, status }),
    );
  }

  // -------------------------------------------------------------------------
  // Queries
  // -------------------------------------------------------------------------

  lanes(): Lane[] {
    const all: Lane[] = [];
    const matriarch = this.states.get(this.matriarchLaneId);
    if (matriarch) all.push(cloneLane(matriarch.lane));
    for (const state of this.states.values()) {
      if (state.lane.id === this.matriarchLaneId) continue;
      all.push(cloneLane(state.lane));
    }
    return all;
  }

  getLaneByToolUseId(toolUseId: ToolUseId): Lane | null {
    const laneId = this.byToolUseId.get(toolUseId);
    if (laneId === undefined) return null;
    const state = this.states.get(laneId);
    return state ? cloneLane(state.lane) : null;
  }

  agentIds(): ReadonlyMap<LaneId, AgentId> {
    const map = new Map<LaneId, AgentId>();
    for (const state of this.states.values()) {
      if (state.lane.agentId !== null) map.set(state.lane.id, state.lane.agentId);
    }
    return map;
  }

  // -------------------------------------------------------------------------
  // Emission primitives
  // -------------------------------------------------------------------------

  /**
   * Resolves a tool_use id — a transcript message's `parent_tool_use_id`, or a
   * `system/task_progress`'s `tool_use_id` — to the lane registered for it,
   * falling back to the Matriarch when it is absent or names no known lane.
   */
  private resolveLaneId(parentToolUseId: string | null): LaneId {
    if (parentToolUseId === null) return this.matriarchLaneId;
    const laneId = this.byToolUseId.get(parentToolUseId);
    if (laneId === undefined || !this.states.has(laneId)) return this.matriarchLaneId;
    return laneId;
  }

  /**
   * Appends an event, materializing its lane first so criterion 7's ordering
   * guarantee holds for every path, not just the dispatch path.
   *
   * It also records Matriarch `assistant_text` for `routeResult`'s bypassed-turn
   * test. The lane checked is the ROUTED one, before inline mode collapses it,
   * so a Calf's text never counts as the Matriarch's reply in either mode.
   */
  private emit(
    out: NewEvent[],
    laneId: LaneId,
    type: EventType,
    payload: EventPayload,
    raw?: unknown,
  ): void {
    if (type === 'assistant_text' && laneId === this.matriarchLaneId) {
      this.matriarchTextSinceResult = true;
    }
    const state = this.states.get(laneId);
    if (state) this.materialize(out, state);
    out.push(this.event(laneId, type, payload, raw));
  }

  private event(laneId: LaneId, type: EventType, payload: EventPayload, raw?: unknown): NewEvent {
    const event: NewEvent = {
      podId: this.podId,
      // 'inline' mode (spec 4.3 fallback): lanes are still created, still
      // opened, still closed and still carry their agentId, so the store, the
      // persistence model and the IPC surface are unchanged — only the event's
      // routing collapses onto the Matriarch.
      laneId: this.mode === 'inline' ? this.matriarchLaneId : laneId,
      type,
      payload,
      createdAt: this.now(),
    };
    if (raw !== undefined) event.raw = raw;
    return event;
  }

  private malformed(rawLine: string, parseError: string): NewEvent {
    return this.event(this.matriarchLaneId, 'malformed', {
      type: 'malformed',
      rawLine,
      parseError,
    });
  }
}

/**
 * True when a `system/task_started` describes an agent task, the only kind
 * that registers a lane: `task_type` is `'local_agent'`, or is not a string
 * (absent, as older CLIs send it). Any other string is a non-agent task.
 */
function isAgentTask(message: Record<string, unknown>): boolean {
  const taskType = str(message, 'task_type');
  return taskType === null || taskType === 'local_agent';
}

function cloneLane(lane: Lane): Lane {
  return {
    id: lane.id,
    podId: lane.podId,
    kind: lane.kind,
    toolUseId: lane.toolUseId ?? null,
    agentId: lane.agentId ?? null,
    parentLaneId: lane.parentLaneId ?? null,
    depth: typeof lane.depth === 'number' ? lane.depth : 0,
    subagentType: lane.subagentType ?? null,
    description: lane.description ?? null,
    status: lane.status,
    startedAt: lane.startedAt,
    endedAt: lane.endedAt ?? null,
  };
}

export const createLaneRouter: CreateLaneRouter = (options) => new LaneRouterImpl(options);
