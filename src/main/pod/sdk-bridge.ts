/**
 * The injectable SDK boundary.
 *
 * Acceptance criterion 11: no test may spawn the real `claude` binary or need
 * an API key. Everything the runner does with the CLI goes through this one
 * narrow seam, so a test can drive it from `tests/fixtures/protocol/`.
 *
 * The seam is a module-level injection point, NOT a member of `PodRunner` and
 * NOT a field on `PodRunnerOptions` — both are frozen, and criterion 1 forbids
 * adding members to either.
 */

import { query as sdkQuery } from '@anthropic-ai/claude-agent-sdk';
import type { Options as SdkOptions, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';

import type { QueuedUserMessage } from './input-queue';
import type { PodStreamItem } from './stream';

/**
 * What the runner needs back from one `query()` call.
 *
 * `interrupt` and `setPermissionMode` are the SDK `Query` control requests,
 * available only in streaming-input mode — which is the mode this runner always
 * uses.
 */
export interface SdkSession {
  /** The output stream, one item per CLI stdout message. */
  stream: AsyncIterable<PodStreamItem>;
  /** Backs `PodRunner.interrupt()`. */
  interrupt(): Promise<void>;
  /** Backs `PodRunner.setPermissionMode()`. */
  setPermissionMode(mode: string): Promise<void>;
  /**
   * Resolves once the CLI has initialized — i.e. once the process is up, which
   * is precisely what the contract says `start()` waits for ("Resolves once the
   * process is up, not once the first turn completes"). Optional: a bridge that
   * cannot answer it makes `start()` fall back to racing the first stream item
   * against a startup failure.
   */
  initialized?(): Promise<void>;
}

export type SdkBridge = (params: {
  prompt: AsyncIterable<QueuedUserMessage>;
  options: SdkOptions;
}) => SdkSession;

/**
 * The real bridge. Called exactly ONCE per Pod.
 *
 * Note the mapping: the SDK yields already-parsed `SDKMessage` values, so every
 * item is `kind: 'message'`. The SDK swallows unparseable stdout lines itself
 * (`sdk.mjs`: `on(\`Non-JSON stdout: ...\`); continue`), which is why the real
 * bridge can never emit `kind: 'malformed'` — see the note in `stream.ts`.
 */
export const defaultSdkBridge: SdkBridge = ({ prompt, options }) => {
  const q = sdkQuery({
    // The queue yields Orcastrate's minimal user-message envelope, which is a
    // structural subset of SDKUserMessage (type/message/parent_tool_use_id).
    prompt: prompt as AsyncIterable<SDKUserMessage>,
    options,
  });

  return {
    stream: {
      async *[Symbol.asyncIterator](): AsyncGenerator<PodStreamItem, void> {
        for await (const message of q) {
          yield { kind: 'message', message };
        }
      },
    },
    async interrupt() {
      await q.interrupt();
    },
    async setPermissionMode(mode) {
      await q.setPermissionMode(mode as Parameters<typeof q.setPermissionMode>[0]);
    },
    async initialized() {
      await q.initializationResult();
    },
  };
};
