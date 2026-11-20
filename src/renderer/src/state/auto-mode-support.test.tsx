// @vitest-environment jsdom

/**
 * `useAutoModeSupport()` — main's cached auto-mode flag as the renderer last
 * received it over `push:autoModeSupport`.
 *
 * The rules under test, each stated where it is asserted:
 *   - `null` before any push;
 *   - the latest pushed `supported` value after each push;
 *   - rendering the hook issues no IPC call;
 *   - outside `<WorkspaceProvider>` it throws, like every workspace hook.
 */

import type { ReactNode } from 'react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';

import type { AutoModeSupport } from '../contracts/renderer-state';
import {
  registerWorkspaceProvider,
  renderWithWorkspace,
  resetWorkspaceProvider,
  stubOrcastrateApi,
  type StubOrcastrateApi,
} from '../test-utils';

import { WorkspaceProvider, useAutoModeSupport } from './index';

beforeAll(() => registerWorkspaceProvider(WorkspaceProvider));
afterAll(() => resetWorkspaceProvider());

interface Harness {
  api: StubOrcastrateApi;
  /** Every value the hook returned, one entry per render, oldest first. */
  seen: AutoModeSupport[];
  latest: () => AutoModeSupport;
}

async function mount(): Promise<Harness> {
  const api = stubOrcastrateApi();
  const seen: AutoModeSupport[] = [];

  function Probe(): ReactNode {
    seen.push(useAutoModeSupport());
    return null;
  }

  await act(async () => {
    renderWithWorkspace(<Probe />, { api });
  });

  return {
    api,
    seen,
    latest: () => {
      if (seen.length === 0) throw new Error('The probe never rendered, so no hook value was captured.');
      return seen[seen.length - 1] ?? null;
    },
  };
}

/** Calls per invoke channel, as a plain record that `toEqual` can compare. */
function callCounts(api: StubOrcastrateApi): Record<string, number> {
  return Object.fromEntries(Object.entries(api.calls).map(([key, calls]) => [key, calls.length]));
}

describe('useAutoModeSupport', () => {
  it('returns null before any push', async () => {
    const h = await mount();

    expect(h.seen.length).toBeGreaterThan(0);
    expect(h.seen.every((value) => value === null)).toBe(true);
  });

  it('returns false after a { supported: false } push, then true after a following { supported: true }', async () => {
    const h = await mount();

    await act(async () => {
      h.api.emit.autoModeSupport({ supported: false });
    });
    expect(h.latest()).toBe(false);

    await act(async () => {
      h.api.emit.autoModeSupport({ supported: true });
    });
    expect(h.latest()).toBe(true);
  });

  it('issues no IPC call: rendering the hook leaves api.calls as a provider without it leaves them', async () => {
    // The baseline: the same provider, with a probe that does not read the hook.
    const bare = stubOrcastrateApi();
    function Bare(): ReactNode {
      return null;
    }
    await act(async () => {
      renderWithWorkspace(<Bare />, { api: bare });
    });

    const h = await mount();
    expect(callCounts(h.api)).toEqual(callCounts(bare));

    // Re-rendering on a push reads the hook again and still calls nothing.
    const before = callCounts(h.api);
    await act(async () => {
      h.api.emit.autoModeSupport({ supported: true });
    });
    expect(h.latest()).toBe(true);
    expect(callCounts(h.api)).toEqual(before);
  });

  it('throws outside <WorkspaceProvider>, the same error useWorkspace throws', () => {
    function Outside(): ReactNode {
      useAutoModeSupport();
      return null;
    }
    // React reports the render error to console.error as well as throwing it.
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      expect(() => render(<Outside />)).toThrow(/must be rendered inside <WorkspaceProvider>/);
    } finally {
      quiet.mockRestore();
    }
  });
});
