// @vitest-environment jsdom
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it } from 'vitest';

import { App } from '../App';
import { PANEL_LABELS, PANEL_TEST_IDS } from '../contracts/renderer-panels';
import { TEST_IDS } from '../contracts/renderer-view';
import { WorkspaceProvider } from '../state';
import {
  makeStubLane,
  makeStubPod,
  registerWorkspaceProvider,
  renderWithWorkspace,
  stubOrcastrateApi,
} from '../test-utils';
import { testId } from './contract-runtime';

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

// ---------------------------------------------------------------------------
// The panel region (sub-session 3)
// ---------------------------------------------------------------------------

const LANES = [
  makeStubLane({ id: 'lane-matriarch', podId: 'pod-1' }),
  makeStubLane({
    id: 'lane-calf',
    podId: 'pod-1',
    kind: 'calf',
    depth: 1,
    parentLaneId: 'lane-matriarch',
    toolUseId: 'tool-1',
    subagentType: 'explorer',
    description: 'Read the router',
  }),
];

function apiWithOnePod(): ReturnType<typeof stubOrcastrateApi> {
  return stubOrcastrateApi({
    pods: { list: async () => ({ ok: true, value: [makeStubPod({ id: 'pod-1' })] }) },
    lanes: { list: async () => ({ ok: true, value: LANES }) },
  });
}

describe('App panel region', () => {
  it('renders the strip on every render, Pod or no Pod', async () => {
    renderWithWorkspace(<App />);

    await waitFor(() => {
      expect(screen.getByTestId(PANEL_TEST_IDS.panelBar)).toBeDefined();
    });
    // The empty state and the strip coexist: the strip is chrome, not a state.
    expect(screen.getByRole('heading', { name: 'No Pod open' })).toBeDefined();
    for (const key of ['beachcomber', 'helm'] as const) {
      expect(screen.getByTestId(testId(PANEL_TEST_IDS.panelBarOpen, key))).toBeDefined();
    }
    expect(screen.queryByTestId(PANEL_TEST_IDS.panelBarClose)).toBeNull();
  });

  it('opens both panels with ZERO Pods — cleanup and settings need no Pod', async () => {
    const user = userEvent.setup();
    renderWithWorkspace(<App />);

    await waitFor(() => {
      expect(screen.getByTestId(PANEL_TEST_IDS.panelBar)).toBeDefined();
    });

    for (const key of ['beachcomber', 'helm'] as const) {
      await user.click(screen.getByTestId(testId(PANEL_TEST_IDS.panelBarOpen, key)));

      await waitFor(() => {
        expect(screen.getByTestId(testId(PANEL_TEST_IDS.panelRegion, key))).toBeDefined();
      });
      // The panel really rendered, not just its region.
      expect(
        screen.getByTestId(
          key === 'beachcomber'
            ? PANEL_TEST_IDS.beachcomberPanel
            : PANEL_TEST_IDS.helmPanel,
        ),
      ).toBeDefined();
      // It replaced the empty state; the Pod bar and the strip stayed.
      expect(screen.queryByRole('heading', { name: 'No Pod open' })).toBeNull();
      expect(screen.getByTestId(TEST_IDS.podBar)).toBeDefined();
      expect(screen.getByTestId(PANEL_TEST_IDS.panelBar)).toBeDefined();

      await user.click(screen.getByTestId(PANEL_TEST_IDS.panelBarClose));
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'No Pod open' })).toBeDefined();
      });
    }
  });

  it('hides the body while open and restores the selected AND pinned lanes on close', async () => {
    const user = userEvent.setup();
    renderWithWorkspace(<App />, { api: apiWithOnePod() });

    await waitFor(() => {
      expect(screen.getByTestId(TEST_IDS.laneRail)).toBeDefined();
    });

    const calfRow = screen.getByTestId(testId(TEST_IDS.laneRow, 'lane-calf'));
    await user.click(within(calfRow).getAllByRole('button')[0] as HTMLElement);
    const matriarchRow = screen.getByTestId(testId(TEST_IDS.laneRow, 'lane-matriarch'));
    await user.click(within(matriarchRow).getByTestId(TEST_IDS.laneRowPin));

    await waitFor(() => {
      expect(screen.getByTestId(TEST_IDS.transcriptSplit)).toBeDefined();
    });
    const selectedBefore = within(
      screen.getByTestId(testId(TEST_IDS.laneRow, 'lane-calf')),
    ).getAllByRole('button')[0];
    expect(selectedBefore?.getAttribute('aria-current')).toBe('true');

    await user.click(screen.getByTestId(testId(PANEL_TEST_IDS.panelBarOpen, 'helm')));

    await waitFor(() => {
      expect(screen.getByTestId(testId(PANEL_TEST_IDS.panelRegion, 'helm'))).toBeDefined();
    });
    expect(screen.queryByTestId(TEST_IDS.laneRail)).toBeNull();
    expect(screen.queryByTestId(TEST_IDS.transcriptPrimary)).toBeNull();
    expect(screen.queryByTestId(TEST_IDS.transcriptSplit)).toBeNull();
    expect(screen.queryByTestId(TEST_IDS.composer)).toBeNull();

    await user.click(screen.getByTestId(PANEL_TEST_IDS.panelBarClose));

    await waitFor(() => {
      expect(screen.getByTestId(TEST_IDS.laneRail)).toBeDefined();
    });
    // Both facts survived: the selection AND the pin.
    expect(
      within(screen.getByTestId(testId(TEST_IDS.laneRow, 'lane-calf')))
        .getAllByRole('button')[0]
        ?.getAttribute('aria-current'),
    ).toBe('true');
    expect(
      within(screen.getByTestId(testId(TEST_IDS.laneRow, 'lane-matriarch')))
        .getByTestId(TEST_IDS.laneRowPin)
        .getAttribute('aria-pressed'),
    ).toBe('true');
    expect(screen.getByTestId(TEST_IDS.transcriptSplit)).toBeDefined();
    expect(screen.getByTestId(TEST_IDS.composer)).toBeDefined();
  });

  it('moves focus into the panel on open and back to its button on close', async () => {
    const user = userEvent.setup();
    renderWithWorkspace(<App />);

    await waitFor(() => {
      expect(screen.getByTestId(PANEL_TEST_IDS.panelBar)).toBeDefined();
    });
    const trigger = screen.getByTestId(testId(PANEL_TEST_IDS.panelBarOpen, 'beachcomber'));
    await user.click(trigger);

    const region = await screen.findByTestId(
      testId(PANEL_TEST_IDS.panelRegion, 'beachcomber'),
    );
    expect(region.getAttribute('aria-label')).toBe(PANEL_LABELS.beachcomber);
    expect(region.contains(document.activeElement)).toBe(true);

    await user.click(screen.getByTestId(PANEL_TEST_IDS.panelBarClose));
    await waitFor(() => {
      expect(document.activeElement).toBe(
        screen.getByTestId(testId(PANEL_TEST_IDS.panelBarOpen, 'beachcomber')),
      );
    });
  });

  it('closes on Escape WITHOUT interrupting the Pod', async () => {
    const user = userEvent.setup();
    const api = apiWithOnePod();
    renderWithWorkspace(<App />, { api });

    await waitFor(() => {
      expect(screen.getByTestId(TEST_IDS.composer)).toBeDefined();
    });

    await user.click(screen.getByTestId(testId(PANEL_TEST_IDS.panelBarOpen, 'helm')));
    await screen.findByTestId(testId(PANEL_TEST_IDS.panelRegion, 'helm'));

    await user.keyboard('{Escape}');

    await waitFor(() => {
      expect(screen.getByTestId(TEST_IDS.composer)).toBeDefined();
    });
    expect(screen.queryByTestId(testId(PANEL_TEST_IDS.panelRegion, 'helm'))).toBeNull();
    // The composer's own Escape binding must not fire through an open panel.
    expect(api.calls.podInterrupt).toEqual([]);
  });
});
