/**
 * CONTRACT — PodRunner. Frozen at Gate 2; amended at Gate 3 (E1, E2, E5) with
 * the user's approval. The amendments are marked inline where they land:
 *   E1 — `PodRunnerError` is a real class, not an ambient declaration.
 *   E2 — the SDK's `canUseTool` signature and the foreground-dispatch
 *        requirement are recorded as measured against CLI 2.1.235.
 *   E5 — `PermissionPrompt` carries optional attribution ids.
 * Nothing else in this file changed, and it is frozen again.
 *
 * Boundary between: T4 (implementer) and T7 IPC handlers / sub-session 2's
 * Pod lifecycle UI.
 *
 * One PodRunner wraps exactly one long-lived Agent SDK `query()` call in
 * streaming input mode (spec 4.2). It owns the async generator that user
 * messages are pushed into, the `canUseTool` callback, and the child process
 * lifecycle. It does NOT route (that is LaneRouter) and does NOT persist
 * (that is EventStore).
 */

import type {
  AgentId,
  NewEvent,
  PermissionMode,
  PodId,
  PodStatus,
  ToolUseId,
} from './events';

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface PodRunnerOptions {
  podId: PodId;
  /** Absolute path. Immutable for the life of the Pod (spec 4.2). */
  cwd: string;
  permissionMode: PermissionMode;

  /**
   * Keys to apply on top of the inherited environment.
   *
   * CORRECTION vs spec 4.2: the SDK's `env` REPLACES the subprocess environment
   * rather than merging. PodRunner MUST pass `{ ...process.env, ...envOverrides }`.
   * Passing `envOverrides` alone strips PATH and breaks the CLI launch.
   * Source: resolved-unknowns.md correction #4.
   */
  envOverrides: Record<string, string>;

  /**
   * CORRECTION vs spec 4.2/4.4: the SDK option is `resume`, not
   * `resumeSessionId`. Set to Claude Code's session id when reopening a
   * persisted Pod. Source: resolved-unknowns.md correction #3.
   */
  resume?: string;

  /**
   * MUST be set true, or subagent text blocks are never forwarded and Calf
   * lanes receive nothing. Source: resolved-unknowns.md correction #1.
   * Present in the contract as a required-true flag so the omission cannot
   * recur silently.
   *
   * NOT SUFFICIENT ON ITS OWN — see FOREGROUND DISPATCH below. Forwarding is
   * necessary but useless if the dispatch went to the background, because a
   * background dispatch emits no sub-agent messages to forward.
   */
  forwardSubagentText: true;

  /** Absolute path to the `claude` binary. Defaults to PATH lookup when omitted. */
  pathToClaudeCodeExecutable?: string;
}

/**
 * ---------------------------------------------------------------------------
 * FOREGROUND DISPATCH — a binding implementation requirement (amendment E2)
 * ---------------------------------------------------------------------------
 * `AgentInput.run_in_background` defaults to TRUE in CLI 2.1.235 ("Agents run
 * in the background by default", `sdk-tools.d.ts`). A background dispatch
 * returns `{"isAsync":true,"status":"async_launched"}` at once and forwards
 * ZERO sub-agent messages, so every Calf lane in the product renders empty.
 *
 * PodRunner MUST therefore force `run_in_background: false` on every dispatch.
 * The implementation does it with a `PreToolUse` hook that rewrites the tool
 * input (`src/main/pod/options.ts`), backed by a system-prompt directive as a
 * second, weaker lever. Hooks fire for every tool call, including ones
 * auto-approved without a permission prompt, so unlike `canUseTool` the hook
 * does not depend on the permission path being taken.
 *
 * THE HOOK IS NOT DECORATIVE — DO NOT REMOVE IT. This was verified live
 * against CLI 2.1.235 by a 2x2 probe: the control run with no hook produced
 * ZERO sub-agent messages; the hook-only run produced six. An earlier note in
 * `options.ts` called the hook's live effect unverified; that note is
 * superseded by this measurement.
 *
 * The dispatch tool is named `Agent` in CLI 2.1.235. `Task` is the older name
 * and is still accepted, so a name check must match BOTH
 * (`DISPATCH_TOOL_NAMES` in `src/main/pod/options.ts`). The comments in
 * `./events` and `./lane-router` that used to say `name === 'Task'` were
 * corrected in the same amendment; a check written against `'Task'` alone
 * opens zero Calf lanes on 2.1.235 and fails silently.
 */

// ---------------------------------------------------------------------------
// Permission callback (spec 5.4)
// ---------------------------------------------------------------------------

/**
 * The SDK-side reality, recorded here so nobody re-derives it from this file's
 * abstraction (amendment E2, measured against CLI 2.1.235 and recorded in
 * `tests/fixtures/protocol/findings.json`, fixture `06-permission-prompt.ndjson`).
 *
 * The SDK's `canUseTool` takes THREE POSITIONAL ARGUMENTS —
 * `(toolName, input, options)` — not `(request, { signal })`, which is how an
 * earlier draft of this contract described it. `options` carries
 * `agentID, blockedPath, decisionReason, description, displayName, requestId,
 * signal, suggestions, title, toolUseID`.
 *
 * `PermissionPrompt` below is deliberately NOT that shape: it is the
 * Orcastrate-facing abstraction, one object in and one `PermissionAnswer` out.
 * PodRunner owns the adaptation, and the three-argument form must not leak
 * past it. What changed in this amendment is that the adaptation now carries
 * the attribution ids across instead of discarding them (E5).
 */

export interface PermissionPrompt {
  requestId: string;
  toolName: string;
  input: unknown;
  /** Aborts if the turn is interrupted while the card is open. */
  signal: AbortSignal;

  /**
   * AMENDMENT E5 — attribution. Both fields are OPTIONAL, so this change is
   * additive and every existing typed caller keeps compiling.
   *
   * Without them a prompt could not be traced to the Calf that raised it, and
   * `PodManager` had to push every `push:permissionRequested` with the
   * Matriarch's `laneId` — which makes design-spec 5.4's "inline card in the
   * lane that asked" unimplementable for any sub-agent. The information was
   * always present on the SDK's `options` argument and was being dropped.
   *
   * The sub-agent that raised the prompt, from `options.agentID`. Absent when
   * the Matriarch raised it, and absent when the CLI has not yet surfaced an
   * id. This is the PRIMARY attribution key: it names the agent directly.
   */
  agentId?: AgentId;

  /**
   * The `tool_use_id` of the call being permitted, from `options.toolUseID`.
   *
   * SECONDARY, and weaker than `agentId`: it identifies the tool call, not the
   * lane. It resolves to a lane only when the call being permitted is itself
   * the dispatch that opened one, so a consumer must try `agentId` first and
   * must tolerate a miss. Also useful as a correlation key against the
   * `permission_request` event this prompt produces.
   */
  toolUseId?: ToolUseId;
}

export type PermissionAnswer =
  | { decision: 'allow' }
  /** Also writes a rule into the project's `.claude/settings.json` (spec 5.4). */
  | { decision: 'allow_always' }
  | { decision: 'deny'; reason: string };

/**
 * Raised for a tool call the CLI actually prompts on. It is NOT raised for
 * every tool call: calls auto-approved by `allowedTools` or allow rules, and
 * all calls under `bypassPermissions`, skip it entirely. Consumers must observe
 * tool activity from the event stream, never from this callback.
 * Source: resolved-unknowns.md, "canUseTool is not invoked for every tool call".
 *
 * SECURITY: this callback is the ONLY path by which a permission decision may
 * be made, and it must reach a human. No agent message — `SendMessage`
 * included — ever satisfies it (spec 5.3).
 */
export type PermissionHandler = (prompt: PermissionPrompt) => Promise<PermissionAnswer>;

// ---------------------------------------------------------------------------
// Events emitted by the runner
// ---------------------------------------------------------------------------

export interface PodRunnerHandlers {
  /** One raw SDK message, unmodified. The caller feeds it to LaneRouter. */
  onMessage(message: unknown): void;
  /** Status transitions (spec 4.4 enum). */
  onStatus(status: PodStatus): void;
  /**
   * Claude Code's session id, from the messages that AUTHORITATIVELY name the
   * session — `system` with `subtype: 'init'`, and `result`. A `session_id` on
   * any other message type is IGNORED for capture.
   *
   * MAY BE CALLED MORE THAN ONCE IN A RUN, and the LATEST call wins: an
   * authoritative id that differs from the one already captured replaces it,
   * and the runner logs the change at warn with both ids and the Pod id. A
   * repeat of the same id is not re-reported. A consumer must therefore treat
   * this as last-write-wins rather than as a one-shot latch.
   *
   * WHY THE NARROWING. Nothing requires the first `session_id`-bearing message
   * in the stream to name THIS query's session. A hook-emitted message
   * carrying a foreign id and arriving before `system/init` would otherwise
   * become the Pod's permanent resume id, and a later reconnect would resume
   * someone else's conversation. Source: `pod-lifecycle.ts` section 8,
   * escalation E2 resolved as option A at Gate 2.
   */
  onSessionId(ccSessionId: string): void;
  /** A turn completed (SDK `result` message). Drives orphan detection. */
  onTurnEnd(): void;
  /**
   * Process exited unexpectedly -> Pod is Beached (spec 8). `exitCode` is null
   * when the process was killed by a signal.
   */
  onBeached(exitCode: number | null, detail: string): void;
  /** A stream line that could not be parsed. Logged and skipped, never fatal. */
  onMalformed(rawLine: string, parseError: string): void;
  /** Synthetic events the runner itself produces (errors, permission records). */
  onEvent(event: NewEvent): void;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/**
 * Base class for every error PodRunner throws. Consumers may catch this and
 * narrow with `instanceof`.
 *
 * AMENDED at Gate 3 (E1). This was `export declare class` — an *ambient*
 * declaration that TypeScript emits no runtime value for, so
 * `e instanceof PodRunnerError` against an import of THIS module failed with
 * `undefined is not a constructor`. It is now a real exported class and this
 * file is its single definition; `src/main/pod/errors.ts` re-exports it
 * instead of declaring a parallel class pinned by an assignability check.
 */
export class PodRunnerError extends Error {
  readonly code: PodRunnerErrorCode;

  constructor(code: PodRunnerErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'PodRunnerError';
    this.code = code;
    // Keeps `instanceof` correct under an ES5-style transpile.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export type PodRunnerErrorCode =
  /** `cwd` does not exist or is not a directory. Spec 8: Pod opens Beached. */
  | 'CWD_MISSING'
  /** The `claude` binary could not be spawned. */
  | 'SPAWN_FAILED'
  /** `send`/`interrupt` called before `start()` or after `stop()`. */
  | 'NOT_RUNNING'
  /** `start()` called on an already-started runner. */
  | 'ALREADY_STARTED'
  /** The `resume` session id was rejected by the CLI. */
  | 'RESUME_FAILED';

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface PodRunner {
  readonly podId: PodId;
  /**
   * The RUNNER's status. It NEVER takes `'closed'`.
   *
   * `PodStatus` has five values, but a runner exists only while the Pod is
   * open, so `'closed'` is unreachable from inside one: it starts at `'idle'`
   * and `stop()` ends at `'idle'`. `'closed'` is a fact about the MANAGER's
   * session registry, and having the runner emit it was considered and
   * rejected at Gate 2 because it would race `PodManager.#dispose`.
   */
  readonly status: PodStatus;

  /**
   * Spawns the CLI and begins consuming the stream. Resolves once the process
   * is up, not once the first turn completes. Throws CWD_MISSING,
   * SPAWN_FAILED, RESUME_FAILED, ALREADY_STARTED.
   *
   * THE FAILURE PATH REAPS WHAT IT SPAWNED. A `start()` that rejects AFTER the
   * query exists has left a Claude Code child streaming with no owner, so
   * before it rethrows it MUST abort the controller it passed to the SDK and
   * close the streaming-input generator. A failure raised before the query
   * exists — CWD_MISSING, and a throw out of the query construction itself —
   * has nothing to reap and does none of this.
   *
   * Three things the reap must NOT change, and each is pinned by a test:
   *   - the rejection the caller sees is identical in type, code and message,
   *     CWD_MISSING / SPAWN_FAILED / RESUME_FAILED classification included;
   *   - `stop()` afterwards resolves, throws nothing, and two successive calls
   *     are indistinguishable from one;
   *   - `send`, `interrupt` and `setPermissionMode` afterwards still throw
   *     NOT_RUNNING.
   *
   * Source: `pod-lifecycle.ts` section 7, half B. Half A — the manager calling
   * `stop()` in its own catch — is a separate obligation on `PodManager`, and
   * neither half may assume the other landed.
   */
  start(handlers: PodRunnerHandlers, onPermission: PermissionHandler): Promise<void>;

  /**
   * Pushes one user message into the streaming-input generator. Resolves when
   * the message has been enqueued, NOT when the turn completes. Throws
   * NOT_RUNNING. Ordering: messages are delivered in call order.
   */
  send(text: string): Promise<void>;

  /**
   * Interrupts the current turn (spec 5.4 `Esc`). Backed by `Query.interrupt()`;
   * no separate mechanism. Safe to call when idle — resolves as a no-op.
   */
  interrupt(): Promise<void>;

  /** Changes permission mode mid-session. Backed by `Query.setPermissionMode()`. */
  setPermissionMode(mode: PermissionMode): Promise<void>;

  /** Graceful shutdown. Idempotent; never throws. */
  stop(): Promise<void>;

  /**
   * MVP: always returns `{ supported: false }` — the SDK gap in spec 5.3.
   * Present so Steer (backlog item 6) is a swap of this implementation and not
   * an interface change. `agentId` is persisted from day one for the same reason.
   */
  sendToAgent(agentId: AgentId, text: string): Promise<{ supported: boolean }>;
}

export type CreatePodRunner = (options: PodRunnerOptions) => PodRunner;
