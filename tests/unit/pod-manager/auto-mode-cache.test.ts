/**
 * The app-level auto-mode cache behind `push:autoModeSupport`: when main reads
 * a session's model list, how it combines that with the session's latest
 * `system`/`init` model, and when the cached value is pushed.
 *
 * Driven through `PodManager` with the scripted runner double in `./helpers`,
 * so the `supportedModels()` answer and every stream message are chosen by the
 * test.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { PodId } from '../../../src/shared/contracts/events';
import { EVENT_CHANNELS, type AutoModeSupportPush } from '../../../src/shared/contracts/ipc';
import { AUTO_MODE_SUPPORT_READ_TIMEOUT_MS, createPushes } from '../../../src/main/pod-manager';
import { tick, waitFor } from '../pod/helpers';
import { makeManagerHarness, seedPod, type ManagerHarness } from './helpers';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function init(model: unknown): Record<string, unknown> {
  return {
    type: 'system',
    subtype: 'init',
    session_id: 'cc-session-1',
    uuid: 'init-uuid',
    model,
  };
}

/** A model list: `sonnet` supports auto mode, `haiku` does not, `opus` does not say. */
const MODELS = [
  { value: 'sonnet', resolvedModel: 'claude-sonnet-x', supportsAutoMode: true },
  { value: 'haiku', resolvedModel: 'claude-haiku-x', supportsAutoMode: false },
  { value: 'opus', resolvedModel: 'claude-opus-x' },
];

interface Pending<T> {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(err: unknown): void;
}

function pending<T>(): Pending<T> {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

const harnesses: ManagerHarness[] = [];

afterEach(async () => {
  vi.useRealTimers();
  while (harnesses.length > 0) await harnesses.pop()?.dispose();
});

function harness(): ManagerHarness {
  const h = makeManagerHarness();
  harnesses.push(h);
  return h;
}

/** Seeds a closed Pod, scripts its `supportedModels` answer (or none), and opens it. */
async function openWith(h: ManagerHarness, answer: (() => Promise<unknown>) | undefined): Promise<PodId> {
  const podId = seedPod(h, { status: 'closed' });
  h.script(podId, answer !== undefined ? { supportedModels: answer } : {});
  await h.manager.openPod(podId);
  return podId;
}

/**
 * Delivers one stream message to the Pod's runner handlers, as the runner
 * would, then flushes. `flush` defaults to a real-timer tick; a fake-timer
 * test passes its own.
 */
async function message(
  h: ManagerHarness,
  podId: PodId,
  value: unknown,
  flush: () => Promise<unknown> = tick,
): Promise<void> {
  const handlers = h.runner(podId).handlers;
  if (handlers === null) throw new Error(`pod ${podId} has no handlers`);
  handlers.onMessage(value);
  await flush();
}

/** The flush for a test running on fake timers. */
const fakeFlush = (): Promise<unknown> => vi.advanceTimersByTimeAsync(0);

/** Every `push:autoModeSupport` PodManager attempted, in order. */
function autoModePushes(h: ManagerHarness): AutoModeSupportPush[] {
  return h.attempted
    .filter((entry) => entry.channel === EVENT_CHANNELS.autoModeSupport)
    .map((entry) => entry.payload as AutoModeSupportPush);
}

function warnings(h: ManagerHarness): string[] {
  return h.logged.filter((entry) => entry.level === 'warn').map((entry) => String(entry.args[0]));
}

// ---------------------------------------------------------------------------
// The read
// ---------------------------------------------------------------------------

describe('the supportedModels read', () => {
  it('reads once after start, and openPod resolves while the read is still unsettled', async () => {
    const h = harness();
    const podId = await openWith(h, () => new Promise<unknown>(() => undefined));
    await tick();

    expect(h.store.getPod(podId)?.status).toBe('idle');
    expect(h.runner(podId).supportedModelsCalls).toBe(1);
    expect(autoModePushes(h)).toEqual([]);
  });

  it('logs exactly one warn naming the Pod when the read rejects, and leaves the cached value as it was', async () => {
    const h = harness();
    const first = await openWith(h, async () => MODELS);
    await message(h, first, init('sonnet'));
    expect(autoModePushes(h)).toEqual([{ supported: true }]);

    const failing = await openWith(h, async () => {
      throw new Error('control request failed');
    });
    await waitFor(() => warnings(h).length > 0, 'the read failure warn');
    await message(h, failing, init('sonnet'));

    const warned = warnings(h);
    expect(warned).toHaveLength(1);
    expect(warned[0]).toContain(failing);
    expect(warned[0]).toContain('supportedModels');

    // The cache still holds true: a third Pod answering true sends nothing.
    const third = await openWith(h, async () => MODELS);
    await message(h, third, init('sonnet'));
    expect(autoModePushes(h)).toEqual([{ supported: true }]);
  });

  it('logs exactly one warn naming the Pod when the read times out, and leaves the cached value as it was', async () => {
    vi.useFakeTimers();
    const h = harness();
    const first = await openWith(h, async () => MODELS);
    await fakeFlush();
    await message(h, first, init('haiku'), fakeFlush);
    expect(autoModePushes(h)).toEqual([{ supported: false }]);

    const late = pending<unknown>();
    const slow = await openWith(h, () => late.promise);
    expect(warnings(h)).toEqual([]);
    await vi.advanceTimersByTimeAsync(AUTO_MODE_SUPPORT_READ_TIMEOUT_MS);

    const warned = warnings(h);
    expect(warned).toHaveLength(1);
    expect(warned[0]).toContain(slow);
    expect(warned[0]).toContain('supportedModels');

    // An answer landing after the timeout is ignored, so this init derives nothing.
    late.resolve(MODELS);
    await fakeFlush();
    await message(h, slow, init('sonnet'), fakeFlush);
    expect(autoModePushes(h)).toEqual([{ supported: false }]);
  });

  it('drops an answer that settles after the Pod was closed: no push, nothing logged', async () => {
    const h = harness();
    const read = pending<unknown>();
    const podId = await openWith(h, () => read.promise);
    await message(h, podId, init('sonnet'));

    await h.manager.closePod(podId);
    read.resolve(MODELS);
    await tick();

    expect(autoModePushes(h)).toEqual([]);
    expect(h.logged).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The observed init model
// ---------------------------------------------------------------------------

describe('the latest system/init model', () => {
  it('pushes nothing for a models answer that arrives before the first init, until the init arrives', async () => {
    const h = harness();
    const podId = await openWith(h, async () => MODELS);
    await tick();
    expect(h.runner(podId).supportedModelsCalls).toBe(1);
    expect(autoModePushes(h)).toEqual([]);

    await message(h, podId, init('sonnet'));

    expect(autoModePushes(h)).toEqual([{ supported: true }]);
  });

  it('re-derives when a later init names a different model', async () => {
    const h = harness();
    const podId = await openWith(h, async () => MODELS);
    await message(h, podId, init('sonnet'));
    await message(h, podId, init('claude-haiku-x'));

    expect(autoModePushes(h)).toEqual([{ supported: true }, { supported: false }]);
  });
});

// ---------------------------------------------------------------------------
// The cache and the push
// ---------------------------------------------------------------------------

describe('the app-level cache', () => {
  it('sends exactly one push carrying the value when a defined answer differs from the cache', async () => {
    const h = harness();
    const podId = await openWith(h, async () => MODELS);
    await message(h, podId, init('haiku'));

    expect(h.attempted.filter((entry) => entry.channel === EVENT_CHANNELS.autoModeSupport)).toEqual([
      { channel: EVENT_CHANNELS.autoModeSupport, payload: { supported: false } },
    ]);
  });

  it('sends nothing for a defined answer equal to the cached value', async () => {
    const h = harness();
    const podId = await openWith(h, async () => MODELS);
    await message(h, podId, init('sonnet'));
    expect(autoModePushes(h)).toEqual([{ supported: true }]);

    await message(h, podId, init('claude-sonnet-x'));

    expect(autoModePushes(h)).toEqual([{ supported: true }]);
  });

  it('changes nothing for an undefined answer', async () => {
    const h = harness();
    const podId = await openWith(h, async () => MODELS);
    await message(h, podId, init('sonnet'));
    // `opus` has no supportsAutoMode, and `gpt` matches nothing: both undefined.
    await message(h, podId, init('opus'));
    await message(h, podId, init('gpt'));
    // Back to a true answer: the cache was still true, so nothing is sent.
    await message(h, podId, init('sonnet'));

    expect(autoModePushes(h)).toEqual([{ supported: true }]);
  });

  it('never pushes null: a runner whose model list is null sends nothing', async () => {
    const h = harness();
    const podId = await openWith(h, async () => null);
    await message(h, podId, init('sonnet'));

    expect(autoModePushes(h)).toEqual([]);
    expect(h.logged).toEqual([]);
  });

  it('keeps the cached value after closePod of the Pod that produced it', async () => {
    const h = harness();
    const first = await openWith(h, async () => MODELS);
    await message(h, first, init('sonnet'));
    await h.manager.closePod(first);

    const second = await openWith(h, async () => MODELS);
    await message(h, second, init('sonnet'));
    expect(autoModePushes(h)).toEqual([{ supported: true }]);

    await message(h, second, init('haiku'));
    expect(autoModePushes(h)).toEqual([{ supported: true }, { supported: false }]);
  });

  it('pushes exactly [false, true] for Pod A answering false then Pod B answering true', async () => {
    const h = harness();
    const a = await openWith(h, async () => MODELS);
    await message(h, a, init('haiku'));
    const b = await openWith(h, async () => MODELS);
    await message(h, b, init('sonnet'));

    expect(autoModePushes(h)).toEqual([{ supported: false }, { supported: true }]);
  });
});

// ---------------------------------------------------------------------------
// The push method
// ---------------------------------------------------------------------------

describe('Pushes.autoModeSupport', () => {
  it('sends its payload, unchanged, on push:autoModeSupport', () => {
    const sent: { channel: string; payload: unknown }[] = [];
    const pushes = createPushes((channel, payload) => {
      sent.push({ channel, payload });
    });

    pushes.autoModeSupport({ supported: true });

    expect(sent).toEqual([{ channel: 'push:autoModeSupport', payload: { supported: true } }]);
  });
});
