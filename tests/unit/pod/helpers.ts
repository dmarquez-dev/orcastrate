/**
 * Test doubles for the SDK boundary.
 *
 * Acceptance criterion 11: NOTHING here spawns `claude` and nothing needs an
 * API key. The only thing that ever reaches the runner is a fixture line from
 * `tests/fixtures/protocol/` or a value a test pushed by hand.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Options as SdkOptions } from '@anthropic-ai/claude-agent-sdk';

import type { NewEvent, PodStatus } from '../../../src/shared/contracts/events';
import type {
  PodRunnerHandlers,
  PodRunnerOptions,
} from '../../../src/shared/contracts/pod-runner';
import type { PodStreamItem, SdkSession } from '../../../src/main/pod';
import { parseStreamLine } from '../../../src/main/pod';
import { InputQueue } from '../../../src/main/pod/input-queue';

export const FIXTURE_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'fixtures',
  'protocol',
);

export function fixtureLines(name: string): string[] {
  return readFileSync(join(FIXTURE_DIR, name), 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.length > 0);
}

/**
 * Replays a captured NDJSON file through the production line parser, so a
 * corrupt line becomes a `malformed` item exactly as `stream.ts` defines it.
 */
export function fixtureItems(name: string): PodStreamItem[] {
  return fixtureLines(name).map(parseStreamLine);
}

export interface FakeSdk {
  /** Every `query()` invocation the runner made. Length MUST be 1 per Pod. */
  readonly calls: { prompt: AsyncIterable<unknown>; options: SdkOptions }[];
  /** User messages the runner pushed into the streaming-input generator. */
  readonly sent: unknown[];
  readonly interrupts: number;
  readonly permissionModes: string[];
  /** Push one item onto the output stream. */
  emit(item: PodStreamItem): void;
  emitMessage(message: unknown): void;
  /** End the output stream cleanly (a CLI that exited 0). */
  endStream(): void;
  /** Fail the output stream (a CLI that died / never spawned). */
  failStream(err: unknown): void;
  /** Resolve/reject the "process is up" signal. */
  markInitialized(): void;
  failInitialization(err: unknown): void;
  /** Invoke the runner's `canUseTool` exactly as the SDK would. */
  callCanUseTool(
    toolName: string,
    input: Record<string, unknown>,
    options: Partial<CanUseToolCallOptions>,
  ): Promise<unknown>;
  /** Invoke the registered PreToolUse hook the way the CLI would. */
  callPreToolUseHook(input: unknown): Promise<unknown>;
  bridge: (params: { prompt: AsyncIterable<unknown>; options: SdkOptions }) => SdkSession;
}

export interface CanUseToolCallOptions {
  signal: AbortSignal;
  requestId: string;
  toolUseID: string;
  agentID: string;
  suggestions: unknown[];
}

/**
 * A bridge that records what it was handed and lets the test drive both
 * directions. `initialized()` is deliberately NOT auto-resolved unless
 * `autoInitialize` is set, so startup failures can be provoked.
 */
export function makeFakeSdk(opts: { autoInitialize?: boolean } = {}): FakeSdk {
  const calls: { prompt: AsyncIterable<unknown>; options: SdkOptions }[] = [];
  const sent: unknown[] = [];
  const out = new InputQueue<PodStreamItem>();
  let streamError: unknown = null;

  let resolveInit!: () => void;
  let rejectInit!: (err: unknown) => void;
  const initPromise = new Promise<void>((res, rej) => {
    resolveInit = res;
    rejectInit = rej;
  });
  initPromise.catch(() => undefined);

  const state = { interrupts: 0 };
  const permissionModes: string[] = [];

  const fake: FakeSdk = {
    calls,
    sent,
    get interrupts() {
      return state.interrupts;
    },
    permissionModes,
    emit(item) {
      out.push(item);
    },
    emitMessage(message) {
      out.push({ kind: 'message', message });
    },
    endStream() {
      out.close();
    },
    failStream(err) {
      streamError = err;
      out.close();
    },
    markInitialized() {
      resolveInit();
    },
    failInitialization(err) {
      rejectInit(err);
    },
    async callCanUseTool(toolName, input, options) {
      const call = calls[0];
      if (!call) throw new Error('query() was never called');
      const canUseTool = call.options.canUseTool;
      if (!canUseTool) throw new Error('no canUseTool was passed to query()');
      const merged = {
        signal: options.signal ?? new AbortController().signal,
        requestId: options.requestId ?? 'req-1',
        toolUseID: options.toolUseID ?? 'toolu_test',
        ...(options.agentID !== undefined ? { agentID: options.agentID } : {}),
        ...(options.suggestions !== undefined ? { suggestions: options.suggestions } : {}),
      };
      return canUseTool(toolName, input, merged as never);
    },
    async callPreToolUseHook(input) {
      const call = calls[0];
      if (!call) throw new Error('query() was never called');
      const matcher = call.options.hooks?.PreToolUse?.[0];
      if (!matcher) throw new Error('no PreToolUse hook was registered');
      const hook = matcher.hooks[0];
      if (!hook) throw new Error('PreToolUse matcher had no callbacks');
      return hook(input as never, 'toolu_test', { signal: new AbortController().signal });
    },
    bridge({ prompt, options }) {
      calls.push({ prompt, options });

      // The real SDK tears the stream down when the abortController fires, and
      // `stop()` relies on that to finish. Model it.
      options.abortController?.signal.addEventListener('abort', () => out.close(), { once: true });

      // Drain the streaming-input generator the way the CLI's stdin would.
      void (async () => {
        for await (const message of prompt) sent.push(message);
      })();

      if (opts.autoInitialize) resolveInit();

      return {
        stream: {
          async *[Symbol.asyncIterator](): AsyncGenerator<PodStreamItem, void> {
            for await (const item of out) yield item;
            if (streamError !== null) throw streamError;
          },
        },
        async interrupt() {
          state.interrupts += 1;
        },
        async setPermissionMode(mode: string) {
          permissionModes.push(mode);
        },
        async initialized() {
          await initPromise;
        },
      };
    },
  };

  return fake;
}

export interface RecordedHandlers extends PodRunnerHandlers {
  messages: unknown[];
  statuses: PodStatus[];
  sessionIds: string[];
  turnEnds: number;
  beached: { exitCode: number | null; detail: string }[];
  malformed: { rawLine: string; parseError: string }[];
  events: NewEvent[];
}

export function recordHandlers(): RecordedHandlers {
  const messages: unknown[] = [];
  const statuses: PodStatus[] = [];
  const sessionIds: string[] = [];
  const beached: { exitCode: number | null; detail: string }[] = [];
  const malformed: { rawLine: string; parseError: string }[] = [];
  const events: NewEvent[] = [];
  const counters = { turnEnds: 0 };

  return {
    messages,
    statuses,
    sessionIds,
    beached,
    malformed,
    events,
    get turnEnds() {
      return counters.turnEnds;
    },
    onMessage(message) {
      messages.push(message);
    },
    onStatus(status) {
      statuses.push(status);
    },
    onSessionId(id) {
      sessionIds.push(id);
    },
    onTurnEnd() {
      counters.turnEnds += 1;
    },
    onBeached(exitCode, detail) {
      beached.push({ exitCode, detail });
    },
    onMalformed(rawLine, parseError) {
      malformed.push({ rawLine, parseError });
    },
    onEvent(event) {
      events.push(event);
    },
  } as RecordedHandlers;
}

/** A valid options object pointing at a directory that certainly exists. */
export function podOptions(overrides: Partial<PodRunnerOptions> = {}): PodRunnerOptions {
  return {
    podId: 'pod-1',
    cwd: process.cwd(),
    permissionMode: 'default',
    envOverrides: {},
    forwardSubagentText: true,
    ...overrides,
  };
}

/** Waits for pending microtasks and timers to flush. */
export function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
