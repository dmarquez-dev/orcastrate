// @vitest-environment jsdom
/**
 * SLASH-COMMAND SUGGESTIONS, END TO END: push, then list, then accept, then send.
 *
 * The rule under test: the commands the composer suggests are exactly the
 * active Pod's latest `podCommands` push, in push order. The renderer names
 * no command of its own, so every row on screen here was put there by a push
 * this file emitted. A push for a Pod that is not active changes nothing on
 * screen. Accepting a row writes `'/' + name + ' '` into the draft and sends
 * nothing; the next Enter sends the draft as it stands.
 *
 * Mounted through the shared harness, so the store, the provider, `App` and
 * the Composer are all the real ones and only the preload bridge is a stub.
 * The pushes go through the stub's `emit.podCommands`, the same fan-out the
 * bridge's `on.podCommands` subscribers receive. The send is asserted on
 * `api.calls.podSend`, the IPC the action issues.
 */

import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import type { Pod } from '@shared/contracts/events';
import type { SlashCommandInfo } from '@shared/contracts/ipc';
import { TEST_IDS } from '../contracts/renderer-view';
import { testId } from '../shell/contract-runtime';
import { makeStubPod, stubOrcastrateApi, type StubOrcastrateApi } from '../test-utils';

import { installUnhandledRejectionGuard, mountWorkspace } from './harness';

installUnhandledRejectionGuard();

/** Open (main holds a runner between turns), and leftmost, so active first. */
const ACTIVE_POD: Pod = makeStubPod({ id: 'pod-active', title: 'Active', tabOrder: 0, status: 'idle' });

/** Listed beside the active Pod, and never selected in this file. */
const OTHER_POD: Pod = makeStubPod({ id: 'pod-other', title: 'Other', tabOrder: 1, status: 'idle' });

function command(name: string, description: string): SlashCommandInfo {
  return { name, description, argumentHint: '', aliases: [] };
}

/** Pushed for the active Pod, in this order. */
const FIRST = command('alpha-check', 'First command the active Pod reported');
const SECOND = command('beta-check', 'Second command the active Pod reported');

/** Pushed for the OTHER Pod. Its name shares the active list's leading `/`. */
const FOREIGN = command('gamma-check', 'A command only the other Pod reported');

function workspaceApi(): StubOrcastrateApi {
  return stubOrcastrateApi({
    pods: { list: async () => ({ ok: true, value: [ACTIVE_POD, OTHER_POD] }) },
  });
}

/** The composer's textarea, once the active Pod's composer accepts input. */
async function enabledInput(): Promise<HTMLTextAreaElement> {
  await screen.findByTestId(testId(TEST_IDS.podTab, ACTIVE_POD.id));
  const element = await screen.findByTestId(TEST_IDS.composerInput);
  if (!(element instanceof HTMLTextAreaElement)) throw new Error('composer input is not a textarea');
  await waitFor(() => {
    expect(element.disabled).toBe(false);
  });
  return element;
}

/** The text of each option in the suggestion listbox, in render order. */
function optionTexts(): string[] {
  return within(screen.getByRole('listbox')).getAllByRole('option').map((option) => option.textContent ?? '');
}

describe('slash-command suggestions for the active Pod', () => {
  it('lists the pushed commands in push order, ignores another Pod, accepts without sending, then sends the accepted text', async () => {
    const user = userEvent.setup();
    const api = workspaceApi();
    mountWorkspace(api);
    const input = await enabledInput();

    act(() => {
      api.emit.podCommands({ podId: ACTIVE_POD.id, commands: [FIRST, SECOND] });
    });
    await user.type(input, '/');

    // Exactly two options, in push order, each naming its own command.
    const listbox = await screen.findByRole('listbox');
    expect(within(listbox).getAllByRole('option')).toHaveLength(2);
    const pushed = optionTexts();
    expect(pushed[0]).toContain(`/${FIRST.name}`);
    expect(pushed[1]).toContain(`/${SECOND.name}`);

    // A push for a Pod that is not active leaves the active list as it was.
    act(() => {
      api.emit.podCommands({ podId: OTHER_POD.id, commands: [FOREIGN] });
    });
    expect(optionTexts()).toEqual(pushed);
    expect(screen.queryByText(`/${FOREIGN.name}`)).toBeNull();

    // Enter accepts the selected row (row 0) and sends nothing.
    await user.keyboard('{Enter}');
    await waitFor(() => {
      expect(input.value).toBe(`/${FIRST.name} `);
    });
    expect(api.calls.podSend).toEqual([]);

    // The list closed because the draft now holds a space, so Enter sends.
    const atPress = input.value;
    await user.keyboard('{Enter}');
    await waitFor(() => {
      expect(api.calls.podSend).toHaveLength(1);
    });
    expect(api.calls.podSend[0]).toEqual([ACTIVE_POD.id, atPress]);
  });

  it('renders no listbox for an empty push, and Enter sends the bare slash', async () => {
    const user = userEvent.setup();
    const api = workspaceApi();
    mountWorkspace(api);
    const input = await enabledInput();

    act(() => {
      api.emit.podCommands({ podId: ACTIVE_POD.id, commands: [] });
    });
    await user.type(input, '/');
    expect(input.value).toBe('/');
    expect(screen.queryByRole('listbox')).toBeNull();

    await user.keyboard('{Enter}');
    await waitFor(() => {
      expect(api.calls.podSend).toHaveLength(1);
    });
    expect(api.calls.podSend[0]).toEqual([ACTIVE_POD.id, '/']);
  });
});
