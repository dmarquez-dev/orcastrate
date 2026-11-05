/**
 * A `PodManager` built WITHOUT a fork port uses the default adapter from
 * `src/main/pod/`, which is what lets `src/main/index.ts` stay unchanged.
 *
 * The SDK module is mocked for this whole file, so the default adapter's call
 * lands on a recording fake: nothing here reaches the real `forkSession`.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sdk = vi.hoisted(() => ({
  forkSession: vi.fn<(sessionId: string, options?: { dir?: string }) => Promise<{ sessionId: string }>>(),
}));

vi.mock('@anthropic-ai/claude-agent-sdk', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  forkSession: sdk.forkSession,
}));

import type { EventStore } from '../../../src/shared/contracts/event-store';
import { createPushes, PodManager, ROUTING_MODE } from '../../../src/main/pod-manager';
import { openEventStore } from '../../../src/main/store';

let store: EventStore;

beforeEach(() => {
  sdk.forkSession.mockReset();
  store = openEventStore(':memory:');
  store.migrate();
});

afterEach(() => {
  store.close();
});

describe('PodManager without an injected fork port', () => {
  it("forks through the default adapter, which reaches the SDK's forkSession", async () => {
    sdk.forkSession.mockResolvedValue({ sessionId: 'cc-from-default-port' });
    const manager = new PodManager({
      store,
      createRunner: () => {
        throw new Error('forkPod must not start a runner');
      },
      push: createPushes(() => {}),
      routingMode: ROUTING_MODE,
    });
    store.createPod({
      id: 'parent',
      title: 'Parent',
      cwd: process.cwd(),
      permissionMode: 'default',
      envOverrides: {},
      tabOrder: 0,
    });
    store.updatePod('parent', { ccSessionId: 'cc-parent' });

    const forked = await manager.forkPod('parent');

    expect(sdk.forkSession.mock.calls).toEqual([['cc-parent', { dir: process.cwd() }]]);
    expect(forked.ccSessionId).toBe('cc-from-default-port');
  });
});
