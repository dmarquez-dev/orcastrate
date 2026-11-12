// @vitest-environment jsdom

/**
 * `useSlashCommands()` — the active Pod's latest pushed command list.
 *
 * The rules under test, each stated where it is asserted:
 *   - the list is the active Pod's, exactly as its last `podCommands` push
 *     delivered it, in the same order;
 *   - a push for another Pod changes nothing while that Pod is backgrounded,
 *     and activating it reads its list with no IPC call;
 *   - an empty push empties the list; no push, or no active Pod, reads empty;
 *   - between renders with no push for the active Pod and no change of active
 *     Pod, the hook returns the same array object.
 *
 * Every Pod here is activated explicitly with `setActivePod`. The stub's
 * default `pods.list` answers no Pods, so the store auto-activates nothing.
 */

import type { ReactNode } from 'react';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { act } from '@testing-library/react';

import type { SlashCommandInfo } from '@shared/contracts/ipc';

import type { ComposerState, WorkspaceActions } from '../contracts/renderer-state';
import {
  registerWorkspaceProvider,
  renderWithWorkspace,
  resetWorkspaceProvider,
  stubOrcastrateApi,
  type StubOrcastrateApi,
} from '../test-utils';

import { WorkspaceProvider, useComposer, useSlashCommands, useWorkspaceActions } from './index';

beforeAll(() => registerWorkspaceProvider(WorkspaceProvider));
afterAll(() => resetWorkspaceProvider());

const POD_A = 'pod-a';
const POD_B = 'pod-b';

function command(name: string, description: string): SlashCommandInfo {
  return { name, description, argumentHint: '', aliases: [] };
}

const X = command('compact', 'Compact the conversation');
const Y = command('review', 'Review the current diff');
const Z = command('init', 'Write a CLAUDE.md');

interface Harness {
  api: StubOrcastrateApi;
  /** Every value the hook returned, one entry per render, oldest first. */
  seen: (readonly SlashCommandInfo[])[];
  composer: () => ComposerState | undefined;
  actions: () => WorkspaceActions;
  latest: () => readonly SlashCommandInfo[];
}

async function mount(): Promise<Harness> {
  const api = stubOrcastrateApi();
  const seen: (readonly SlashCommandInfo[])[] = [];
  let actions: WorkspaceActions | null = null;
  let composer: ComposerState | undefined;

  function Probe(): ReactNode {
    seen.push(useSlashCommands());
    composer = useComposer();
    actions = useWorkspaceActions();
    return null;
  }

  await act(async () => {
    renderWithWorkspace(<Probe />, { api });
  });

  return {
    api,
    seen,
    composer: () => composer,
    actions: () => {
      if (actions === null) throw new Error('The probe never rendered, so no actions were captured.');
      return actions;
    },
    latest: () => {
      const last = seen[seen.length - 1];
      if (last === undefined) throw new Error('The probe never rendered, so no hook value was captured.');
      return last;
    },
  };
}

async function activate(harness: Harness, podId: string | null): Promise<void> {
  await act(async () => {
    harness.actions().setActivePod(podId);
  });
}

/** Pod A active, then A's push of `[X, Y]`. The starting point of C62-C64. */
async function mountWithAPushed(): Promise<{ harness: Harness; pushed: SlashCommandInfo[] }> {
  const harness = await mount();
  await activate(harness, POD_A);
  const pushed = [X, Y];
  act(() => {
    harness.api.emit.podCommands({ podId: POD_A, commands: pushed });
  });
  return { harness, pushed };
}

describe('useSlashCommands', () => {
  it('returns the active Pod pushed list in the order it was pushed', async () => {
    const { harness } = await mountWithAPushed();

    expect(harness.latest()).toEqual([X, Y]);
  });

  it('returns the same array object after a push for a backgrounded Pod', async () => {
    const { harness } = await mountWithAPushed();
    const before = harness.latest();
    const rendersBefore = harness.seen.length;

    act(() => {
      harness.api.emit.podCommands({ podId: POD_B, commands: [Z] });
    });

    // The push did reach the provider and re-render the probe; what it must
    // not do is change Pod A's list.
    expect(harness.seen.length).toBeGreaterThan(rendersBefore);
    expect(harness.latest()).toBe(before);
  });

  it("returns a backgrounded Pod's pushed list on activation, with no IPC call reading it", async () => {
    const { harness } = await mountWithAPushed();
    const pushedForB = [Z];
    act(() => {
      harness.api.emit.podCommands({ podId: POD_B, commands: pushedForB });
    });

    await activate(harness, POD_B);
    expect(harness.latest()).toEqual([Z]);
    expect(harness.latest()).toBe(pushedForB);

    // CONTROL: the same activations on a store that never received a
    // `podCommands` push. Identical IPC traffic means no call read commands.
    const control = await mount();
    await activate(control, POD_A);
    await activate(control, POD_B);

    expect(harness.api.calls).toEqual(control.api.calls);
    expect(control.latest()).toEqual([]);
  });

  it('returns an empty array after an empty push for the active Pod', async () => {
    const { harness } = await mountWithAPushed();
    expect(harness.latest()).toHaveLength(2);

    act(() => {
      harness.api.emit.podCommands({ podId: POD_A, commands: [] });
    });

    expect(harness.latest()).toEqual([]);
  });

  it('returns an empty array for an active Pod that has received no push', async () => {
    const harness = await mount();
    await activate(harness, POD_A);

    expect(harness.latest()).toEqual([]);
  });

  it('returns an empty array when no Pod is active', async () => {
    const harness = await mount();
    act(() => {
      harness.api.emit.podCommands({ podId: POD_A, commands: [X] });
    });

    expect(harness.latest()).toEqual([]);
  });

  it('returns the same array object across a composer edit with no new push', async () => {
    const { harness } = await mountWithAPushed();
    const before = harness.latest();
    const rendersBefore = harness.seen.length;

    act(() => {
      harness.actions().setComposerText(POD_A, '/co');
    });

    expect(harness.composer()?.text).toBe('/co');
    expect(harness.seen.length).toBeGreaterThan(rendersBefore);
    expect(harness.latest()).toBe(before);
  });
});
