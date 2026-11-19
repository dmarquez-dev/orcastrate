/**
 * The real SDK bridge's `supportedModels`: one call to the query's own
 * `supportedModels()`, answered unchanged.
 *
 * The SDK module is MOCKED for this whole file, so `query()` spawns nothing.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const sdk = vi.hoisted(() => ({
  supportedModels: vi.fn<() => Promise<unknown>>(),
}));

vi.mock('@anthropic-ai/claude-agent-sdk', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  query: () => ({
    supportedModels: sdk.supportedModels,
    async *[Symbol.asyncIterator]() {
      // An empty stream: this file never consumes it.
    },
  }),
}));

import { defaultSdkBridge } from '../../../src/main/pod';
import { InputQueue, type QueuedUserMessage } from '../../../src/main/pod/input-queue';

beforeEach(() => {
  sdk.supportedModels.mockReset();
});

describe('defaultSdkBridge supportedModels', () => {
  it("resolves the query's supportedModels answer unchanged, calling it exactly once", async () => {
    const sentinel = [{ value: 'sentinel', displayName: '', description: '' }];
    sdk.supportedModels.mockResolvedValue(sentinel);

    const session = defaultSdkBridge({ prompt: new InputQueue<QueuedUserMessage>(), options: {} });

    await expect(session.supportedModels?.()).resolves.toBe(sentinel);
    expect(sdk.supportedModels).toHaveBeenCalledTimes(1);
  });
});
