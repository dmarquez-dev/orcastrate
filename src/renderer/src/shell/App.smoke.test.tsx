// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import { beforeAll, describe, expect, it } from 'vitest';

import { App } from '../App';
import { TEST_IDS } from '../contracts/renderer-view';
import { WorkspaceProvider } from '../state';
import { makeStubPod, registerWorkspaceProvider, renderWithWorkspace, stubOrcastrateApi } from '../test-utils';

/**
 * Smoke test for T4's ASSEMBLY, not for the panes inside it. Each pane has its
 * own suite in its own task's directory, and T8 drives the whole workspace end
 * to end — what is asserted here is only that `App` composes the real provider
 * with the real slot components and produces the frame of spec 5.1.
 */
beforeAll(() => {
  registerWorkspaceProvider(WorkspaceProvider);
});

describe('App', () => {
  it('renders the first-run empty state when there is no Pod', async () => {
    renderWithWorkspace(<App />);

    await waitFor(() => {
      expect(screen.getByTestId(TEST_IDS.workspace)).toBeDefined();
    });
    expect(screen.getByTestId(TEST_IDS.podBar)).toBeDefined();
    expect(screen.getByTestId(TEST_IDS.newPodButton)).toBeDefined();
    expect(screen.getByRole('heading', { name: 'No Pod open' })).toBeDefined();
    // The empty state replaces the rail, transcript and composer.
    expect(screen.queryByTestId(TEST_IDS.laneRail)).toBeNull();
    expect(screen.queryByTestId(TEST_IDS.composerInput)).toBeNull();
  });

  it('fills the rail, transcript and composer slots once a Pod is active', async () => {
    const pods = [
      makeStubPod({ id: 'pod-1', title: 'Alpha', tabOrder: 0 }),
      makeStubPod({ id: 'pod-2', title: 'Bravo', tabOrder: 1 }),
    ];
    const api = stubOrcastrateApi({ pods: { list: async () => ({ ok: true, value: pods }) } });

    renderWithWorkspace(<App />, { api });

    await waitFor(() => {
      expect(screen.getByTestId(`${TEST_IDS.podTab}:pod-1`)).toBeDefined();
    });
    expect(screen.getByTestId(`${TEST_IDS.podTab}:pod-2`)).toBeDefined();

    await waitFor(() => {
      expect(screen.getByTestId(TEST_IDS.laneRail)).toBeDefined();
    });
    expect(screen.getByTestId(TEST_IDS.transcriptPrimary)).toBeDefined();
    expect(screen.getByTestId(TEST_IDS.composer)).toBeDefined();
    // Unsplit until a lane is pinned.
    expect(screen.queryByTestId(TEST_IDS.transcriptSplit)).toBeNull();
  });
});
