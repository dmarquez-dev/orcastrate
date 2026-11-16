/**
 * `pod:commands`: the pull of one Pod's visible slash-command list, through
 * the real handler over the assembled pipeline.
 *
 * The answer is compared against the last `push:podCommands` main emitted for
 * the Pod, because a pull never differs from the last push for the live
 * session. Every outcome resolves an envelope; nothing here rejects.
 */

import { afterEach, describe, expect, it } from 'vitest';

import type { PodId } from '../../../src/shared/contracts/events';
import {
  EVENT_CHANNELS,
  INVOKE_CHANNELS,
  type IpcResult,
  type PodCommandsPush,
  type SlashCommandInfo,
} from '../../../src/shared/contracts/ipc';
import { waitFor } from '../pod/helpers';
import { makeHarness, openPod, tick, type Harness } from './helpers';

const harnesses: Harness[] = [];

afterEach(async () => {
  while (harnesses.length > 0) await harnesses.pop()?.dispose();
});

const LIST = [
  { name: 'review', description: 'Review a diff', argumentHint: '<file>', aliases: ['r'] },
  { name: 'usage', description: 'Show usage', argumentHint: '', aliases: [] },
];

function harness(): Harness {
  const h = makeHarness({ supportedCommands: () => async () => LIST });
  harnesses.push(h);
  return h;
}

function lastPush(h: Harness, podId: PodId): PodCommandsPush | undefined {
  return h
    .pushesOn<PodCommandsPush>(EVENT_CHANNELS.podCommands)
    .filter((push) => push.podId === podId)
    .at(-1);
}

async function openWithList(h: Harness): Promise<PodId> {
  const podId = await openPod(h);
  await waitFor(() => lastPush(h, podId) !== undefined, 'a podCommands push');
  await tick(3);
  return podId;
}

function pull(h: Harness, ...args: unknown[]): Promise<IpcResult<SlashCommandInfo[]>> {
  return h.invoke<SlashCommandInfo[]>(INVOKE_CHANNELS.podCommands, ...args);
}

function errorCode(result: IpcResult<unknown>): string | undefined {
  return result.ok ? undefined : result.error.code;
}

describe('pod:commands', () => {
  it('answers ok with the last pushed list for an open Pod whose read answered', async () => {
    const h = harness();
    const podId = await openWithList(h);

    const result = await pull(h, podId);

    const pushed = lastPush(h, podId)?.commands;
    expect(pushed).toHaveLength(2);
    expect(result.ok).toBe(true);
    expect(result.ok ? result.value : null).toEqual(pushed);
  });

  it('answers ok with [] for a closed Pod', async () => {
    const h = harness();
    const podId = await openWithList(h);
    const closed = await h.invoke(INVOKE_CHANNELS.podClose, podId);
    expect(closed.ok).toBe(true);

    expect(await pull(h, podId)).toEqual({ ok: true, value: [] });
  });

  it("answers INVALID_ARGUMENT for ''", async () => {
    const h = harness();

    const result = await pull(h, '');

    expect(result.ok).toBe(false);
    expect(errorCode(result)).toBe('INVALID_ARGUMENT');
  });

  it('answers INVALID_ARGUMENT for a number', async () => {
    const h = harness();

    const result = await pull(h, 42);

    expect(result.ok).toBe(false);
    expect(errorCode(result)).toBe('INVALID_ARGUMENT');
  });

  it('answers NOT_FOUND for an id no Pod has', async () => {
    const h = harness();

    const result = await pull(h, 'no-such-pod');

    expect(result.ok).toBe(false);
    expect(errorCode(result)).toBe('NOT_FOUND');
  });
});
