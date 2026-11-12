/**
 * PodRunner — one long-lived Agent SDK session per Pod.
 *
 * `query()` is called exactly ONCE, in streaming-input mode, with an async
 * generator as its `prompt`. Every `send()` pushes into that same generator, so
 * one Pod is one CLI process spanning many turns. Calling `query()` per message
 * would spawn a process per message and drop the conversation.
 *
 * The runner does NOT route (LaneRouter) and does NOT persist (EventStore).
 */

import { statSync } from 'node:fs';

import type { CanUseTool, Options as SdkOptions } from '@anthropic-ai/claude-agent-sdk';

import type { NewEvent, PermissionMode, PodStatus } from '../../shared/contracts/events';
import type {
  CreatePodRunner,
  PermissionHandler,
  PermissionPrompt,
  PodRunner,
  PodRunnerHandlers,
  PodRunnerOptions,
} from '../../shared/contracts/pod-runner';

import { classifyStartupFailure, errorMessage, exitCodeFromError, PodRunnerError } from './errors';
import { InputQueue, userMessage } from './input-queue';
import type { QueuedUserMessage } from './input-queue';
import { assertAllowedPermissionMode, buildSdkOptions, forceForegroundDispatch } from './options';
import {
  abortedDenial,
  handlerFailureDenial,
  raceAbort,
  toPermissionPrompt,
  toPermissionResult,
} from './permissions';
import type { CanUseToolOptions } from './permissions';
import { defaultSdkBridge } from './sdk-bridge';
import type { SdkBridge, SdkSession } from './sdk-bridge';
import { asEnvelope, isAuthoritativeSessionSource, isTurnEnd } from './stream';
import type { StreamMessageEnvelope } from './stream';

/**
 * Lane id stamped on the synthetic events the runner emits.
 *
 * PodRunner has no lane model — LaneRouter owns lanes and takes its
 * `matriarchLaneId` from ITS caller — but the frozen `NewEvent` requires a
 * non-null `laneId`. Rather than fabricate a uuid that matches no lane (which
 * `EventStore.append` would reject as CONFLICT), the runner emits this explicit
 * sentinel and the consumer (T7) restamps it with the Pod's Matriarch lane id
 * before persisting. Reported to the orchestrator as an advisory finding.
 */
export const UNROUTED_LANE_ID = '';

type Phase = 'new' | 'running' | 'stopped';

/**
 * The warn sink for the session-id diagnostic. Same shape and same default as
 * `PodManager`'s (`pod-manager.ts:100,185`), so main has one logging idiom
 * rather than two. It is injected at the module-level factory rather than
 * added to `PodRunnerOptions`, which is frozen and does not widen for this.
 */
export type PodRunnerLogger = Pick<Console, 'warn'>;

/** How long `stop()` waits for the stream to drain before giving up on it. */
const STOP_GRACE_MS = 2_000;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    // Never hold an Electron main process (or a test runner) open on this.
    timer.unref?.();
  });
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (err: unknown) => void;
  settled: boolean;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  const d: Deferred<T> = {
    promise,
    settled: false,
    resolve: (value) => {
      if (d.settled) return;
      d.settled = true;
      resolve(value);
    },
    reject: (err) => {
      if (d.settled) return;
      d.settled = true;
      reject(err);
    },
  };
  // A rejection that nobody has awaited yet must not crash the process.
  promise.catch(() => undefined);
  return d;
}

class PodRunnerImpl implements PodRunner {
  readonly #options: PodRunnerOptions;
  readonly #bridge: SdkBridge;
  readonly #log: PodRunnerLogger;

  #phase: Phase = 'new';
  #status: PodStatus = 'idle';
  #permissionMode: PermissionMode;
  /**
   * The latest AUTHORITATIVE session id seen in this run, or null before the
   * first one. Contract section 8: latest-wins among `system`/`init` and
   * `result`. This replaces the first-message-wins latch it grew out of, which
   * accepted an id off any message type at all.
   */
  #capturedSessionId: string | null = null;
  #pendingPermissions = 0;
  #beached = false;

  #handlers: PodRunnerHandlers | null = null;
  #session: SdkSession | null = null;
  #queue: InputQueue<QueuedUserMessage> | null = null;
  #abort: AbortController | null = null;
  #ready = deferred<void>();
  #consumed: Promise<void> = Promise.resolve();

  constructor(options: PodRunnerOptions, bridge: SdkBridge, logger: PodRunnerLogger) {
    this.#options = options;
    this.#bridge = bridge;
    this.#log = logger;
    // Validated eagerly so an unsupported mode is a construction-time
    // programming error rather than a spawn-time surprise.
    this.#permissionMode = assertAllowedPermissionMode(options.permissionMode);
  }

  get podId(): string {
    return this.#options.podId;
  }

  /**
   * The RUNNER's status, and it NEVER takes `'closed'`.
   *
   * `PodStatus` has five values since the E1 amendment, but a runner exists
   * only while the Pod is open, so `'closed'` is unreachable from inside this
   * class: the initial value is `'idle'` and `stop()` still ends at `'idle'`.
   * Making the runner emit `'closed'` was considered and REJECTED at Gate 2 —
   * it would race with `PodManager.#dispose`, and closedness is a fact about
   * the manager's session registry, not about a runner that is by then gone.
   * This docblock is the only place `'closed'` is named in `src/main/pod/**`.
   */
  get status(): PodStatus {
    return this.#status;
  }

  // -------------------------------------------------------------------------
  // start
  // -------------------------------------------------------------------------

  async start(handlers: PodRunnerHandlers, onPermission: PermissionHandler): Promise<void> {
    if (this.#phase !== 'new') {
      throw new PodRunnerError('ALREADY_STARTED', `Pod ${this.podId} has already been started`);
    }

    // Criterion 9: CWD_MISSING is raised BEFORE anything is spawned.
    this.#assertCwd();

    this.#handlers = handlers;
    this.#phase = 'running';

    const queue = new InputQueue<QueuedUserMessage>();
    const abort = new AbortController();
    this.#queue = queue;
    this.#abort = abort;

    let sdkOptions: SdkOptions;
    try {
      sdkOptions = buildSdkOptions(this.#options, {
        canUseTool: this.#makeCanUseTool(onPermission),
        preToolUseHook: async (input) => forceForegroundDispatch(input),
        abortController: abort,
      });
    } catch (err) {
      this.#phase = 'stopped';
      throw err;
    }

    let session: SdkSession;
    try {
      // EXACTLY ONE query() call for the life of this Pod.
      session = this.#bridge({ prompt: queue, options: sdkOptions });
    } catch (err) {
      this.#phase = 'stopped';
      throw classifyStartupFailure(err, this.#options.resume !== undefined);
    }
    this.#session = session;

    this.#consumed = this.#consume(session);

    if (session.initialized !== undefined) {
      session.initialized().then(
        () => this.#ready.resolve(),
        (err: unknown) => {
          this.#ready.reject(classifyStartupFailure(err, this.#options.resume !== undefined));
        },
      );
    }

    try {
      await this.#ready.promise;
    } catch (err) {
      // THE LEAK, and this is the only throw site that has one. `#bridge` has
      // already returned, the stream is being consumed, and a Claude Code child
      // may well be alive; the two earlier throws (`buildSdkOptions` and
      // `#bridge` itself) happen before any query exists, so there is nothing
      // to reap there. Reap here, then rethrow the ORIGINAL error unchanged —
      // its CWD_MISSING / SPAWN_FAILED / RESUME_FAILED classification is what
      // the caller acts on.
      await this.#teardown();
      throw err;
    }
  }

  #assertCwd(): void {
    const cwd = this.#options.cwd;
    let isDirectory = false;
    try {
      isDirectory = statSync(cwd).isDirectory();
    } catch (err) {
      throw new PodRunnerError('CWD_MISSING', `cwd is not accessible: ${cwd} (${errorMessage(err)})`, {
        cause: err,
      });
    }
    if (!isDirectory) {
      throw new PodRunnerError('CWD_MISSING', `cwd is not a directory: ${cwd}`);
    }
  }

  // -------------------------------------------------------------------------
  // stream consumption
  // -------------------------------------------------------------------------

  async #consume(session: SdkSession): Promise<void> {
    try {
      for await (const item of session.stream) {
        this.#ready.resolve();

        if (item.kind === 'malformed') {
          this.#reportMalformed(item.rawLine, item.parseError);
          // Criterion 8: skip and KEEP CONSUMING. No rethrow, no break.
          continue;
        }

        const envelope = asEnvelope(item.message);
        if (envelope === null) {
          this.#reportMalformed(safeStringify(item.message), 'not an SDK message envelope');
          continue;
        }

        this.#handlers?.onMessage(item.message);

        this.#captureSessionId(envelope);

        if (isTurnEnd(envelope)) {
          this.#handlers?.onTurnEnd();
          this.#setStatus(this.#pendingPermissions > 0 ? 'waiting' : 'idle');
        }
      }

      // The stream ended without an error. If we asked for that (stop()), fine.
      // Otherwise the CLI went away underneath us: Beached. The SDK throws for
      // any non-zero exit or signal kill, so a clean end means exit code 0.
      if (this.#phase === 'running') {
        this.#beach(0, 'the CLI stream ended while the Pod was still open');
      }
    } catch (err) {
      if (!this.#ready.settled) {
        // Failed before the session was ever up: a start() failure, not a beach.
        this.#ready.reject(classifyStartupFailure(err, this.#options.resume !== undefined));
        return;
      }
      if (this.#phase !== 'running') return; // torn down deliberately
      this.#beach(exitCodeFromError(err), errorMessage(err));
    }
  }

  /**
   * Contract `pod-lifecycle.ts` section 8 (E2, resolved as option A). Capture
   * narrows to the message types that authoritatively name the session, and the
   * LATEST such id in a run wins — both types name the same session in every
   * captured corpus, and latest-wins keeps a mid-run rotation from being missed.
   *
   * The warn is the required diagnostic: the repo holds NO captured artifact of
   * a run carrying more than one `session_id`, so the next real run has to
   * produce the evidence. The line states what happened and carries the
   * identifiers needed to find it again — the Pod, both ids, and the message
   * type that brought the new one. It logs no secret: a session id is an opaque
   * conversation handle, already persisted in the clear as `pods.cc_session_id`,
   * and it is the whole subject of the line.
   */
  #captureSessionId(envelope: StreamMessageEnvelope): void {
    const id = envelope.session_id;
    if (id === undefined) return;
    if (!isAuthoritativeSessionSource(envelope)) return;
    if (id === this.#capturedSessionId) return;

    if (this.#capturedSessionId !== null) {
      const source =
        envelope.subtype === undefined ? envelope.type : `${envelope.type}/${envelope.subtype}`;
      this.#log.warn(
        `[orcastrate] pod ${this.podId}: Claude Code session id changed mid-run from ` +
          `${this.#capturedSessionId} to ${id} (from a ${source} message); the latest id ` +
          `wins and is the one a reconnect will resume`,
      );
    }

    this.#capturedSessionId = id;
    this.#handlers?.onSessionId(id);
  }

  #reportMalformed(rawLine: string, parseError: string): void {
    this.#handlers?.onMalformed(rawLine, parseError);
    this.#emit({ type: 'malformed', rawLine, parseError });
  }

  /**
   * Criterion 7: the runner reports and stops. It does NOT throw out of the
   * consume loop and it does NOT restart itself — recovery is a user action on
   * a Beached Pod (spec 8).
   */
  #beach(exitCode: number | null, detail: string): void {
    if (this.#beached) return;
    this.#beached = true;
    this.#phase = 'stopped';
    this.#queue?.close();
    this.#setStatus('beached');
    this.#emit({ type: 'error', message: detail, exitCode });
    this.#handlers?.onBeached(exitCode, detail);
  }

  // -------------------------------------------------------------------------
  // permissions
  // -------------------------------------------------------------------------

  #makeCanUseTool(onPermission: PermissionHandler): CanUseTool {
    // Three positional arguments, per the measured SDK signature — which the
    // contract now records itself (amendment E2), so this is no longer a
    // divergence from it.
    return async (toolName, input, options) => {
      const opts = options as unknown as CanUseToolOptions;

      this.#pendingPermissions += 1;
      this.#setStatus('waiting');

      this.#emit({
        type: 'permission_request',
        requestId: opts.requestId,
        toolName,
        input,
        toolUseId: opts.toolUseID ?? null,
      });

      // E5: the ids the SDK hands us are carried across, not dropped, so a
      // prompt raised inside a Calf can be attributed to that Calf downstream.
      // `toPermissionPrompt` is the single adapter between the SDK's three
      // arguments and the contract's one-object abstraction.
      const prompt: PermissionPrompt = toPermissionPrompt(toolName, input, opts);

      try {
        const raced = await raceAbort(Promise.resolve(onPermission(prompt)), opts.signal);

        if (raced.aborted) {
          // Criterion 5: an aborting signal SETTLES the prompt, never hangs it.
          this.#emit({
            type: 'permission_decision',
            requestId: opts.requestId,
            decision: 'deny',
            reason: 'the turn was interrupted before the user answered',
          });
          return abortedDenial(opts);
        }

        const answer = raced.value;
        const result = toPermissionResult(answer, toolName, opts);
        this.#emit({
          type: 'permission_decision',
          requestId: opts.requestId,
          decision: answer.decision,
          ...(answer.decision === 'deny' ? { reason: answer.reason } : {}),
        });
        return result;
      } catch (err) {
        // Fail closed. Returning null or leaving this pending would block the
        // tool forever — permission prompts have no park deadline.
        const detail = errorMessage(err);
        this.#emit({ type: 'error', message: `permission handler failed: ${detail}` });
        this.#emit({
          type: 'permission_decision',
          requestId: opts.requestId,
          decision: 'deny',
          reason: detail,
        });
        return handlerFailureDenial(detail, opts);
      } finally {
        this.#pendingPermissions -= 1;
        if (this.#pendingPermissions <= 0 && this.#status === 'waiting') {
          this.#setStatus('running');
        }
      }
    };
  }

  // -------------------------------------------------------------------------
  // control surface
  // -------------------------------------------------------------------------

  async send(text: string): Promise<void> {
    this.#assertRunning('send');
    this.#queue?.push(userMessage(text));
    this.#setStatus('running');
    await Promise.resolve();
  }

  async interrupt(): Promise<void> {
    this.#assertRunning('interrupt');
    // Criterion 6: idle is a resolving no-op — there is no turn to interrupt,
    // and Query.interrupt() outside a turn is a wasted control request.
    if (this.#status === 'idle') return;
    await this.#session?.interrupt();
  }

  async setPermissionMode(mode: PermissionMode): Promise<void> {
    const validated = assertAllowedPermissionMode(mode);
    this.#assertRunning('setPermissionMode');
    await this.#session?.setPermissionMode(validated);
    this.#permissionMode = validated;
  }

  async stop(): Promise<void> {
    await this.#teardown();
    if (!this.#beached) this.#setStatus('idle');
  }

  /**
   * The reap, shared by `stop()` and by the failed-start path.
   *
   * Extracted rather than reached by calling `stop()` from `start()`, so that
   * the failed-start path reaps without also taking `stop()`'s trailing status
   * write, and so that `stop()` afterwards is still a no-throw idempotent
   * no-op: it re-enters here, finds the phase already terminal, and returns.
   * The `#setStatus('idle')` that follows is a no-op too, because a start that
   * failed at the ready gate never left `'idle'`.
   */
  async #teardown(): Promise<void> {
    if (this.#phase === 'stopped') return;
    this.#phase = 'stopped';
    try {
      this.#queue?.close();
      this.#abort?.abort();
      // Bounded: a CLI that ignores the abort must not wedge shutdown. The
      // contract says stop() is idempotent and never throws — it does not
      // promise to wait indefinitely for a process that will not leave.
      await Promise.race([this.#consumed, delay(STOP_GRACE_MS)]);
    } catch {
      // Idempotent and never throws (contract).
    }
  }

  /**
   * MVP: always `{ supported: false }`, and NOTHING is sent.
   *
   * ADVISORY, measured by T2 and recorded here so the decision reads as a
   * choice and not a limitation: all three steering tools — `SendMessage`,
   * `TaskStop`, `TaskOutput` — DO exist in CLI 2.1.235 and DO execute. They are
   * advertised in `system/init.tools` and returned argument errors, not
   * "No such tool available", when invoked. MVP still declines per design spec
   * 5.3; Steer (backlog item 6) is a swap of this method body.
   */
  async sendToAgent(): Promise<{ supported: boolean }> {
    return { supported: false };
  }

  /**
   * The SDK's answer, unvalidated: normalizing it is the manager's job. `null`
   * when the bridge has no command surface. NOT_RUNNING before `start()` and
   * after `stop()`, like `send`; the method is `async`, so that throw arrives
   * as a rejection.
   */
  async supportedCommands(): Promise<unknown> {
    this.#assertRunning('supportedCommands');
    const session = this.#session;
    if (session === null || session.supportedCommands === undefined) return null;
    return session.supportedCommands();
  }

  // -------------------------------------------------------------------------
  // internals
  // -------------------------------------------------------------------------

  #assertRunning(what: string): void {
    if (this.#phase !== 'running') {
      throw new PodRunnerError(
        'NOT_RUNNING',
        `${what} called on a Pod that is ${this.#phase === 'new' ? 'not started' : 'stopped or beached'}`,
      );
    }
  }

  #setStatus(next: PodStatus): void {
    if (this.#status === next) return;
    if (this.#beached && next !== 'beached') return;
    this.#status = next;
    this.#handlers?.onStatus(next);
  }

  #emit(payload: NewEvent['payload']): void {
    this.#handlers?.onEvent({
      podId: this.podId,
      laneId: UNROUTED_LANE_ID,
      type: payload.type,
      payload,
      createdAt: new Date().toISOString(),
    });
  }
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

/**
 * Builds a `CreatePodRunner` over an injected SDK boundary.
 *
 * This is the seam acceptance criterion 11 requires. It is a module-level
 * function, not a member of `PodRunner` or a field on `PodRunnerOptions` —
 * both are frozen.
 */
export function createPodRunnerWith(
  bridge: SdkBridge,
  logger: PodRunnerLogger = console,
): CreatePodRunner {
  return (options: PodRunnerOptions) => new PodRunnerImpl(options, bridge, logger);
}

/** The production factory. Exactly the frozen `CreatePodRunner` signature. */
export const createPodRunner: CreatePodRunner = createPodRunnerWith(defaultSdkBridge);
