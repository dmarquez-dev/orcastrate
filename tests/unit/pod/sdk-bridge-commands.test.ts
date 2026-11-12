/**
 * The real SDK bridge's `supportedCommands`: one call to the query's own
 * `supportedCommands()`, answered unchanged.
 *
 * The SDK module is MOCKED for this whole file, so `query()` spawns nothing.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const sdk = vi.hoisted(() => ({
  supportedCommands: vi.fn<() => Promise<unknown>>(),
}));

vi.mock('@anthropic-ai/claude-agent-sdk', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  query: () => ({
    supportedCommands: sdk.supportedCommands,
    async *[Symbol.asyncIterator]() {
      // An empty stream: this file never consumes it.
    },
  }),
}));

import { defaultSdkBridge } from '../../../src/main/pod';
import { InputQueue, type QueuedUserMessage } from '../../../src/main/pod/input-queue';

beforeEach(() => {
  sdk.supportedCommands.mockReset();
});

describe('defaultSdkBridge supportedCommands', () => {
  it("resolves the query's supportedCommands answer unchanged, calling it exactly once", async () => {
    const sentinel = [{ name: 'sentinel', description: '', argumentHint: '' }];
    sdk.supportedCommands.mockResolvedValue(sentinel);

    const session = defaultSdkBridge({ prompt: new InputQueue<QueuedUserMessage>(), options: {} });

    await expect(session.supportedCommands?.()).resolves.toBe(sentinel);
    expect(sdk.supportedCommands).toHaveBeenCalledTimes(1);
  });
});
