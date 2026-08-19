/**
 * CONTRACT — PodRunner. Frozen at Gate 2.
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
   */
  forwardSubagentText: true;

  /** Absolute path to the `claude` binary. Defaults to PATH lookup when omitted. */
  pathToClaudeCodeExecutable?: string;
}

// ---------------------------------------------------------------------------
// Permission callback (spec 5.4)
// ---------------------------------------------------------------------------

export interface PermissionPrompt {
  requestId: string;
  toolName: string;
  input: unknown;
  /** Aborts if the turn is interrupted while the card is open. */
  signal: AbortSignal;
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
  /** Claude Code's session id, as soon as the stream reveals it. */
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

export declare class PodRunnerError extends Error {
  readonly code: PodRunnerErrorCode;
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
  readonly status: PodStatus;

  /**
   * Spawns the CLI and begins consuming the stream. Resolves once the process
   * is up, not once the first turn completes. Throws CWD_MISSING,
   * SPAWN_FAILED, RESUME_FAILED, ALREADY_STARTED.
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
