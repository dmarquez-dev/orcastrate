/**
 * `register`'s duplicate guard, exercised directly (D5).
 *
 * At the shipped source the guard is unreachable from outside: `register` is an
 * inner function of `registerIpcHandlers`, and every registration names a
 * distinct `INVOKE_CHANNELS` member (`channels.test.ts` pins the property it
 * protects, not the guard). So the duplicate is produced HERE, by mocking the
 * shared IPC contract so that two `INVOKE_CHANNELS` keys share one wire name.
 *
 * This lives in its own file because `vi.mock` is hoisted and applies to the
 * whole module graph of the file that declares it. Any other suite in this
 * directory would otherwise see a contract with a collision in it.
 *
 * `podList` and `podCreate` are the first two registrations, so giving
 * `podCreate` the wire name `'pod:list'` makes the second `register` call the
 * duplicate.
 */

import { describe, expect, it, vi } from 'vitest';

import type { IpcHandlerDeps, IpcMainLike } from '../../../src/main/ipc/handlers';
import { registerIpcHandlers } from '../../../src/main/ipc/handlers';
import { INVOKE_CHANNELS } from '../../../src/shared/contracts/ipc';

vi.mock('../../../src/shared/contracts/ipc', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/shared/contracts/ipc')>();
  return {
    ...actual,
    INVOKE_CHANNELS: { ...actual.INVOKE_CHANNELS, podCreate: actual.INVOKE_CHANNELS.podList },
  };
});

const DUPLICATED = 'pod:list';

/**
 * Registration never calls a handler, so the services are never reached; they
 * are present only to satisfy the dependency shape.
 */
function depsRecording(handled: string[]): IpcHandlerDeps {
  const ipcMain: IpcMainLike = {
    handle(channel) {
      handled.push(channel);
    },
  };
  return {
    ipcMain,
    manager: {} as IpcHandlerDeps['manager'],
    pickDirectory: async () => null,
    beachcomber: {} as IpcHandlerDeps['beachcomber'],
    helm: {} as IpcHandlerDeps['helm'],
    deletePodSession: async () => ({ outcome: 'no-session', error: null }),
  };
}

describe('registerIpcHandlers refuses a second handler for one channel (D5)', () => {
  it('sees the collision this file mocks into the contract', () => {
    expect(INVOKE_CHANNELS.podList).toBe(DUPLICATED);
    expect(INVOKE_CHANNELS.podCreate).toBe(DUPLICATED);
  });

  it('throws an Error naming the duplicated channel', () => {
    expect(() => registerIpcHandlers(depsRecording([]))).toThrow(
      new Error(`ipc channel ${DUPLICATED} already has a handler`),
    );
  });

  it('hands ipcMain the duplicated channel once, so the first handler is never replaced', () => {
    const handled: string[] = [];
    try {
      registerIpcHandlers(depsRecording(handled));
    } catch {
      // The throw is the previous test's assertion; this one counts handles.
    }
    expect(handled.filter((channel) => channel === DUPLICATED)).toHaveLength(1);
  });
});
