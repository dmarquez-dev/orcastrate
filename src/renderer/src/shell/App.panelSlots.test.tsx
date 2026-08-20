// @vitest-environment jsdom
/**
 * Criterion 2, and the only way to assert it.
 *
 * `panelBar` and `panel` are OPTIONAL in the frozen `WorkspaceLayoutProps`, and
 * the contract is explicit that this is a compile-time concession rather than a
 * design: "an `undefined` panelBar in shipped code is a test failure, not a
 * valid state." The difference between `null` and `undefined` is invisible in
 * the DOM, so no rendered assertion can catch it. This suite therefore replaces
 * `WorkspaceLayout` with a recorder and reads the props `App` actually passed.
 *
 * It is the one file in the shell that mocks a sibling component, and it mocks
 * exactly one, for exactly one fact.
 */
import { waitFor } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import type { WorkspaceLayoutProps } from '../contracts/renderer-view';

const recorded = vi.hoisted(() => [] as Record<string, unknown>[]);

vi.mock('./WorkspaceLayout', () => ({
  WorkspaceLayout: (props: WorkspaceLayoutProps) => {
    recorded.push(props as unknown as Record<string, unknown>);
    return <div data-testid="layout-stub" />;
  },
}));

import { App } from '../App';
import { WorkspaceProvider } from '../state';
import {
  makeStubPod,
  registerWorkspaceProvider,
  renderWithWorkspace,
  stubOrcastrateApi,
} from '../test-utils';

beforeAll(() => {
  registerWorkspaceProvider(WorkspaceProvider);
});

describe('App always fills both panel slots', () => {
  it('never passes undefined for panelBar or panel, in any state', async () => {
    recorded.length = 0;
    const api = stubOrcastrateApi({
      pods: { list: async () => ({ ok: true, value: [makeStubPod({ id: 'pod-1' })] }) },
    });
    renderWithWorkspace(<App />, { api });

    // Renders span the loading state, the empty state and the active-Pod state.
    await waitFor(() => {
      expect(recorded.length).toBeGreaterThan(1);
    });

    expect(recorded.every((props) => 'panelBar' in props)).toBe(true);
    expect(recorded.every((props) => 'panel' in props)).toBe(true);
    expect(recorded.filter((props) => props.panelBar === undefined)).toEqual([]);
    expect(recorded.filter((props) => props.panel === undefined)).toEqual([]);
    // Closed is `null`, which is a value the layout can act on — not an absence.
    expect(recorded.every((props) => props.panel === null)).toBe(true);
  });
});
