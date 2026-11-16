// @vitest-environment jsdom
/**
 * THE RELOAD SCENARIO, END TO END: a fresh renderer whose Pod already reported
 * its slash commands before this renderer subscribed.
 *
 * Main pushes a Pod's list when the list changes, so a renderer that mounts
 * after that push (reload, HMR, relaunch) never sees it. The store's `start()`
 * therefore pulls each listed Pod's current list once, through
 * `pods.commands`. In this file no `podCommands` push is ever emitted and no
 * turn is sent, so every suggestion on screen came from that pull.
 *
 * A failed pull is silent: the list stays empty, nothing is suggested, and the
 * failure's message reaches no pixel.
 *
 * Mounted through the shared harness, so the store, the provider, `App` and
 * the Composer are all the real ones and only the preload bridge is a stub.
 */

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import type { Pod } from '@shared/contracts/events';
import type { SlashCommandInfo } from '@shared/contracts/ipc';
import { TEST_IDS } from '../contracts/renderer-view';
import { testId } from '../shell/contract-runtime';
import { ipcError, makeStubPod, stubOrcastrateApi, type StubOrcastrateApi } from '../test-utils';

import { flushPendingWork, installUnhandledRejectionGuard, mountWorkspace } from './harness';

installUnhandledRejectionGuard();

/** Open (main holds a runner between turns), so its composer accepts input. */
const POD: Pod = makeStubPod({ id: 'pod-reloaded', title: 'Reloaded', tabOrder: 0, status: 'idle' });

function command(name: string, description: string): SlashCommandInfo {
  return { name, description, argumentHint: '', aliases: [] };
}

/** What main already holds for the Pod, in this order. */
const FIRST = command('alpha-pulled', 'First command main already held');
const SECOND = command('beta-pulled', 'Second command main already held');

/** One open Pod, whose pull answers `[FIRST, SECOND]`. */
function reloadedApi(): StubOrcastrateApi {
  const api = stubOrcastrateApi({
    pods: { list: async () => ({ ok: true, value: [POD] }) },
  });
  // Keeps the stub's call recording and `failInvoke`, but answers a real list.
  const recorded = api.pods.commands;
  api.pods.commands = async (podId) => {
    const result = await recorded(podId);
    return result.ok ? { ok: true, value: [FIRST, SECOND] } : result;
  };
  return api;
}

/** The composer's textarea, once the Pod's composer accepts input. */
async function enabledInput(): Promise<HTMLTextAreaElement> {
  await screen.findByTestId(testId(TEST_IDS.podTab, POD.id));
  const element = await screen.findByTestId(TEST_IDS.composerInput);
  if (!(element instanceof HTMLTextAreaElement)) throw new Error('composer input is not a textarea');
  await waitFor(() => {
    expect(element.disabled).toBe(false);
  });
  return element;
}

describe('the startup pull fills a fresh renderer', () => {
  it("suggests the pulled commands in the answer's order with no push and no turn", async () => {
    const user = userEvent.setup();
    const api = reloadedApi();
    mountWorkspace(api);
    const input = await enabledInput();
    await flushPendingWork();
    expect(api.calls.podCommands).toEqual([[POD.id]]);

    // `type` clicks the textarea first, which focuses it: the list only opens
    // for a focused composer.
    await user.type(input, '/');

    const listbox = await screen.findByRole('listbox');
    const options = within(listbox).getAllByRole('option');
    expect(options).toHaveLength(2);
    expect(options[0]?.textContent ?? '').toContain(`/${FIRST.name}`);
    expect(options[1]?.textContent ?? '').toContain(`/${SECOND.name}`);
    expect(api.calls.podSend).toEqual([]);
  });

  it('suggests nothing and shows nothing when the pull fails', async () => {
    const user = userEvent.setup();
    const sentinel = 'orcastrate-sentinel-pod-commands-pull-failed';
    const api = reloadedApi();
    api.failInvoke('podCommands', ipcError('IO', sentinel));
    mountWorkspace(api);
    const input = await enabledInput();
    await flushPendingWork();
    expect(api.calls.podCommands).toEqual([[POD.id]]);

    await user.type(input, '/');
    await flushPendingWork();

    expect(input.value).toBe('/');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(document.body.textContent ?? '').not.toContain(sentinel);
  });
});
