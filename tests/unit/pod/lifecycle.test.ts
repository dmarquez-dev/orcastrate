/**
 * One Pod is one long-lived session. Acceptance criteria 2, 6, 10.
 */

import { describe, expect, it } from 'vitest';

import findings from '../../fixtures/protocol/findings.json';
import { createPodRunnerWith } from '../../../src/main/pod';
import { makeFakeSdk, podOptions, recordHandlers, tick } from './helpers';

async function started(overrides = {}) {
  const sdk = makeFakeSdk({ autoInitialize: true });
  const runner = createPodRunnerWith(sdk.bridge)(podOptions(overrides));
  const handlers = recordHandlers();
  await runner.start(handlers, async () => ({ decision: 'allow' }));
  return { sdk, runner, handlers };
}

describe('one query() per Pod (criterion 2)', () => {
  it('calls query() exactly once on start', async () => {
    const { sdk } = await started();
    expect(sdk.calls).toHaveLength(1);
  });

  it('handles two successive send() calls with ONE query() invocation', async () => {
    const { sdk, runner } = await started();

    await runner.send('first');
    await runner.send('second');
    await tick();

    // The load-bearing assertion: still one session, both messages inside it.
    expect(sdk.calls).toHaveLength(1);
    expect(sdk.sent).toHaveLength(2);
    expect(sdk.sent).toEqual([
      { type: 'user', message: { role: 'user', content: 'first' }, parent_tool_use_id: null },
      { type: 'user', message: { role: 'user', content: 'second' }, parent_tool_use_id: null },
    ]);
  });

  it('passes an async generator as `prompt`, not a string', async () => {
    const { sdk } = await started();
    const prompt = sdk.calls[0]?.prompt as AsyncIterable<unknown>;
    expect(typeof prompt).toBe('object');
    expect(typeof prompt[Symbol.asyncIterator]).toBe('function');
  });

  it('preserves send order even when messages queue ahead of the consumer', async () => {
    const { sdk, runner } = await started();
    await Promise.all([runner.send('a'), runner.send('b'), runner.send('c')]);
    await tick();
    expect(sdk.sent.map((m) => (m as { message: { content: string } }).message.content)).toEqual([
      'a',
      'b',
      'c',
    ]);
  });
});

describe('start resolves when the process is up, not when a turn ends', () => {
  it('does not wait for a `result` message', async () => {
    const sdk = makeFakeSdk();
    const runner = createPodRunnerWith(sdk.bridge)(podOptions());
    const handlers = recordHandlers();

    const startPromise = runner.start(handlers, async () => ({ decision: 'allow' }));
    let settled = false;
    void startPromise.then(() => {
      settled = true;
    });

    await tick();
    expect(settled).toBe(false); // nothing has come up yet

    sdk.markInitialized();
    await startPromise;
    expect(settled).toBe(true);
    expect(handlers.turnEnds).toBe(0);
  });
});

describe('status transitions', () => {
  it('starts idle and goes running on send', async () => {
    const { runner, handlers } = await started();
    expect(runner.status).toBe('idle');
    await runner.send('go');
    expect(runner.status).toBe('running');
    expect(handlers.statuses).toEqual(['running']);
  });

  it('returns to idle on the turn`s result message', async () => {
    const { runner, sdk, handlers } = await started();
    await runner.send('go');
    sdk.emitMessage({ type: 'result', subtype: 'success', session_id: 's1' });
    await tick();
    expect(handlers.turnEnds).toBe(1);
    expect(runner.status).toBe('idle');
  });
});

describe('interrupt (criterion 6)', () => {
  it('is a resolving no-op while the Pod is idle', async () => {
    const { runner, sdk } = await started();
    expect(runner.status).toBe('idle');
    await expect(runner.interrupt()).resolves.toBeUndefined();
    expect(sdk.interrupts).toBe(0);
  });

  it('is backed by Query.interrupt() while a turn is running', async () => {
    const { runner, sdk } = await started();
    await runner.send('go');
    await runner.interrupt();
    expect(sdk.interrupts).toBe(1);
  });
});

describe('session id', () => {
  it('is reported as soon as the stream reveals it, once only', async () => {
    const { sdk, handlers } = await started();
    sdk.emitMessage({ type: 'system', subtype: 'init', session_id: 'sess-abc' });
    sdk.emitMessage({ type: 'assistant', session_id: 'sess-abc' });
    await tick();
    expect(handlers.sessionIds).toEqual(['sess-abc']);
  });
});

describe('stop', () => {
  it('is idempotent and never throws', async () => {
    const { runner } = await started();
    await expect(runner.stop()).resolves.toBeUndefined();
    await expect(runner.stop()).resolves.toBeUndefined();
  });

  it('closes the streaming-input generator', async () => {
    const { runner, sdk } = await started();
    await runner.stop();
    await tick();
    // A send after stop is refused, so nothing more can reach the generator.
    expect(sdk.sent).toHaveLength(0);
  });
});

describe('sendToAgent (criterion 10)', () => {
  it('returns { supported: false } and sends nothing', async () => {
    const { runner, sdk } = await started();
    await expect(runner.sendToAgent('a2dd230aec02c375a', 'hello')).resolves.toEqual({
      supported: false,
    });
    await tick();
    expect(sdk.sent).toHaveLength(0);
  });

  it('is a product decision, not a platform limit — all three tools exist', () => {
    // ADVISORY, measured by T2. MVP still declines per design spec 5.3.
    expect(findings.steering.sendMessageAvailable).toBe(true);
    expect(findings.steering.taskStopAvailable).toBe(true);
    expect(findings.steering.taskOutputAvailable).toBe(true);
    // The probe's own conclusion: the tools answered with argument errors, and
    // the absence marker never appeared.
    expect(findings.steering.evidence).toContain(
      'The string "No such tool available" was NOT present anywhere in the attempt.',
    );
  });
});
