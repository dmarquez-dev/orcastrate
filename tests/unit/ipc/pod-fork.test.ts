/**
 * `pod:fork` over the real `registerIpcHandlers`, with a fake `ipcMain`, the
 * real `PodManager` and the real `:memory:` store. The fork port is a FAKE in
 * every test: `makeHarness`'s default refuses, and each test that needs the
 * port to answer supplies its own.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Pod, PodId } from '../../../src/shared/contracts/events';
import { INVOKE_CHANNELS, type IpcResult } from '../../../src/shared/contracts/ipc';
import type { ForkSession } from '../../../src/main/pod';

import { makeHarness, type Harness } from './helpers';

const harnesses: Harness[] = [];

function harness(forkSession?: ForkSession): Harness {
  const made = makeHarness(forkSession === undefined ? {} : { forkSession });
  harnesses.push(made);
  return made;
}

afterEach(async () => {
  while (harnesses.length > 0) await harnesses.pop()?.dispose();
});

/** A closed Pod created through the IPC surface, optionally given a ccSessionId. */
async function createClosedPod(h: Harness, ccSessionId: string | null): Promise<PodId> {
  const created = await h.invoke<Pod>(INVOKE_CHANNELS.podCreate, {
    title: 'Fork me',
    cwd: process.cwd(),
    permissionMode: 'default',
  });
  if (!created.ok) throw new Error(`pod:create failed: ${created.error.code}`);
  if (ccSessionId !== null) h.store.updatePod(created.value.id, { ccSessionId });
  return created.value.id;
}

function errorCode(result: IpcResult<unknown>): string | null {
  return result.ok ? null : result.error.code;
}

describe('pod:fork', () => {
  it.each([
    ['a number', 42],
    ['an empty string', ''],
    ['a blank string', '   '],
    ['an object', { podId: 'p1' }],
    ['nothing', undefined],
  ])('answers INVALID_ARGUMENT for %s and never reaches the manager', async (_label, arg) => {
    const h = harness();
    const forkPod = vi.spyOn(h.manager, 'forkPod');

    const result = await h.invoke(INVOKE_CHANNELS.podFork, arg);

    expect(result.ok).toBe(false);
    expect(errorCode(result)).toBe('INVALID_ARGUMENT');
    expect(forkPod).not.toHaveBeenCalled();
  });

  it('answers NOT_FOUND for a Pod that does not exist', async () => {
    const h = harness();

    const result = await h.invoke(INVOKE_CHANNELS.podFork, 'no-such-pod');

    expect(result.ok).toBe(false);
    expect(errorCode(result)).toBe('NOT_FOUND');
  });

  it('answers CONFLICT for a Pod that is not eligible to fork', async () => {
    const h = harness();
    const podId = await createClosedPod(h, null);

    const result = await h.invoke(INVOKE_CHANNELS.podFork, podId);

    expect(result.ok).toBe(false);
    expect(errorCode(result)).toBe('CONFLICT');
  });

  it('answers IO when the fork port rejects', async () => {
    const h = harness(() => Promise.reject(new Error('session file not found')));
    const podId = await createClosedPod(h, 'cc-parent');

    const result = await h.invoke(INVOKE_CHANNELS.podFork, podId);

    expect(result.ok).toBe(false);
    expect(errorCode(result)).toBe('IO');
  });

  it('answers { ok: true, value } carrying the forked Pod on success', async () => {
    const h = harness(() => Promise.resolve('cc-forked'));
    const podId = await createClosedPod(h, 'cc-parent');

    const result = await h.invoke<Pod>(INVOKE_CHANNELS.podFork, podId);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.id).not.toBe(podId);
    expect(result.value.forkedFromPodId).toBe(podId);
    expect(result.value.ccSessionId).toBe('cc-forked');
    expect(result.value).toEqual(h.store.getPod(result.value.id));
  });
});
