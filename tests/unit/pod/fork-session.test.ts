/**
 * The default fork port: the one place main reaches the SDK's `forkSession`.
 *
 * The SDK module is MOCKED for this whole file, so nothing here touches a
 * session file or spawns anything. What is pinned is the adapter's own
 * behaviour: the exact arguments it hands the SDK, and that it resolves the
 * SDK's `sessionId` unchanged (and rejects when the SDK rejects).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const sdk = vi.hoisted(() => ({
  forkSession: vi.fn<(sessionId: string, options?: { dir?: string }) => Promise<{ sessionId: string }>>(),
}));

vi.mock('@anthropic-ai/claude-agent-sdk', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  forkSession: sdk.forkSession,
}));

import { defaultForkSession } from '../../../src/main/pod';

beforeEach(() => {
  sdk.forkSession.mockReset();
});

describe('defaultForkSession', () => {
  it('calls the SDK forkSession with the source id and { dir }, and nothing else', async () => {
    sdk.forkSession.mockResolvedValue({ sessionId: 'cc-forked' });

    await defaultForkSession('cc-source', { dir: 'C:\\work\\repo' });

    expect(sdk.forkSession).toHaveBeenCalledTimes(1);
    expect(sdk.forkSession.mock.calls[0]).toEqual(['cc-source', { dir: 'C:\\work\\repo' }]);
  });

  it('resolves the sessionId the SDK returned, unchanged', async () => {
    sdk.forkSession.mockResolvedValue({ sessionId: 'cc-forked-7f3a' });

    await expect(defaultForkSession('cc-source', { dir: '/repo' })).resolves.toBe('cc-forked-7f3a');
  });

  it('rejects with the SDK rejection when forkSession rejects', async () => {
    const failure = new Error('session file not found');
    sdk.forkSession.mockRejectedValue(failure);

    await expect(defaultForkSession('cc-source', { dir: '/repo' })).rejects.toBe(failure);
  });
});
