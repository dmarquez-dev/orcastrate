// @vitest-environment jsdom
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';

import type {
  LaneRailProps,
  TranscriptPaneProps,
  WorkspaceLayoutProps,
} from '../contracts/renderer-view';

/**
 * Smoke test for the ASSEMBLY, not for the panes inside it. Each pane has its
 * own suite in its own task's directory, and T5 drives the whole workspace end
 * to end — what is asserted here is only that `App` composes the real provider
 * with the real slot components and produces the frame of spec 5.1.
 *
 * WHY `WorkspaceLayout` IS WRAPPED RATHER THAN REPLACED. Two of this file's
 * facts are about props that are OPTIONAL in the frozen contract — the rail's
 * `onShowInFollower` / `onHideFollower` and the follower pane's `onHide` — and
 * an absent optional callback is invisible in the DOM, exactly as
 * `App.panelSlots.test.tsx` says of `panelBar`. So the layout is wrapped in a
 * recorder that then renders the REAL layout: every existing rendered
 * assertion still runs against the real tree, and the callbacks are read from
 * the props `App` actually passed instead of being inferred from what a
 * component happened to draw.
 *
 * That also decouples this suite from T2 and T3, which rewrite the rail and
 * the transcript pane CONCURRENTLY with the task that owns this file: the
 * follower pane is opened here by calling the prop, not by clicking a control
 * whose markup does not exist yet.
 */
const recorded = vi.hoisted(() => [] as WorkspaceLayoutProps[]);

vi.mock('./WorkspaceLayout', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./WorkspaceLayout')>();
  const Actual = actual.WorkspaceLayout;
  return {
    WorkspaceLayout: (props: WorkspaceLayoutProps) => {
      recorded.push(props);
      return <Actual {...props} />;
    },
  };
});

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

beforeAll(() => {
  registerWorkspaceProvider(WorkspaceProvider);
});

beforeEach(() => {
  recorded.length = 0;
});

/** The props of the most recent render. */
function lastProps(): WorkspaceLayoutProps {
  const props = recorded.at(-1);
  if (props === undefined) throw new Error('WorkspaceLayout has not rendered yet');
  return props;
}

function railPropsOf(props: WorkspaceLayoutProps): LaneRailProps {
  return (props.laneRail as ReactElement<LaneRailProps>).props;
}

function splitPropsOf(props: WorkspaceLayoutProps): TranscriptPaneProps {
  return (props.split as ReactElement<TranscriptPaneProps>).props;
}

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
    // Unsplit until a lane is opened in the follower pane.
    expect(screen.queryByTestId(TEST_IDS.transcriptSplit)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// The pane model reaches the slots (contracts/renderer-panes.ts sections 1, 4, 5)
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

/** Opens `laneId` in the follower pane through the prop `App` passed. */
async function showInFollower(laneId: string): Promise<void> {
  const onShowInFollower = railPropsOf(lastProps()).onShowInFollower;
  if (onShowInFollower === undefined) throw new Error('App did not pass onShowInFollower');
  await act(async () => {
    onShowInFollower(laneId);
  });
}

describe('App pane wiring', () => {
  it('passes both rail follower callbacks on EVERY render that has a rail', async () => {
    renderWithWorkspace(<App />, { api: apiWithOnePod() });

    await waitFor(() => {
      expect(screen.getByTestId(TEST_IDS.laneRail)).toBeDefined();
    });

    const withRail = recorded.filter((props) => props.laneRail !== null);
    // Not vacuous: there is at least one render carrying a rail.
    expect(withRail.length).toBeGreaterThan(0);
    for (const props of withRail) {
      const rail = railPropsOf(props);
      // `in` and not just truthiness: the contract's concession is that these
      // are optional, and `undefined` is the value that must never appear.
      expect('onShowInFollower' in rail).toBe(true);
      expect('onHideFollower' in rail).toBe(true);
      expect(typeof rail.onShowInFollower).toBe('function');
      expect(typeof rail.onHideFollower).toBe('function');
    }
  });

  it('feeds primary from primaryLaneId and split from followerLaneIds[0], with the pane onHide', async () => {
    renderWithWorkspace(<App />, { api: apiWithOnePod() });

    await waitFor(() => {
      expect(screen.getByTestId(TEST_IDS.laneRail)).toBeDefined();
    });
    // Unsplit to begin with: no follower, so no second pane.
    expect(lastProps().split).toBeNull();

    await showInFollower('lane-calf');

    await waitFor(() => {
      expect(screen.getByTestId(TEST_IDS.transcriptSplit)).toBeDefined();
    });

    // The Matriarch keeps the primary pane; the Calf feeds the split slot.
    const primary = (lastProps().primary as ReactElement<TranscriptPaneProps>).props;
    expect(primary.lane?.id).toBe('lane-matriarch');
    expect(primary.isSplit).toBe(false);
    // The PRIMARY never carries a dismiss control: the Matriarch cannot close.
    expect(primary.onHide).toBeUndefined();

    const split = splitPropsOf(lastProps());
    expect(split.lane?.id).toBe('lane-calf');
    expect(split.isSplit).toBe(true);
    expect(typeof split.onHide).toBe('function');
  });

  it('closes the follower pane through the pane onHide it was given', async () => {
    renderWithWorkspace(<App />, { api: apiWithOnePod() });

    await waitFor(() => {
      expect(screen.getByTestId(TEST_IDS.laneRail)).toBeDefined();
    });
    await showInFollower('lane-calf');
    await waitFor(() => {
      expect(screen.getByTestId(TEST_IDS.transcriptSplit)).toBeDefined();
    });

    const onHide = splitPropsOf(lastProps()).onHide;
    if (onHide === undefined) throw new Error('App did not pass the follower pane onHide');
    await act(async () => {
      onHide();
    });

    await waitFor(() => {
      expect(screen.queryByTestId(TEST_IDS.transcriptSplit)).toBeNull();
    });
    expect(lastProps().split).toBeNull();
    // The primary is untouched — closing a follower is not closing the Pod.
    expect(screen.getByTestId(TEST_IDS.transcriptPrimary)).toBeDefined();
  });

  it('closes the follower pane through the rail onHideFollower it was given', async () => {
    renderWithWorkspace(<App />, { api: apiWithOnePod() });

    await waitFor(() => {
      expect(screen.getByTestId(TEST_IDS.laneRail)).toBeDefined();
    });
    await showInFollower('lane-calf');
    await waitFor(() => {
      expect(screen.getByTestId(TEST_IDS.transcriptSplit)).toBeDefined();
    });

    const onHideFollower = railPropsOf(lastProps()).onHideFollower;
    if (onHideFollower === undefined) throw new Error('App did not pass onHideFollower');
    await act(async () => {
      onHideFollower('lane-calf');
    });

    await waitFor(() => {
      expect(screen.queryByTestId(TEST_IDS.transcriptSplit)).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// The panel region (sub-session 3)
// ---------------------------------------------------------------------------

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

  it('hides the body while open and restores BOTH panes on close', async () => {
    const user = userEvent.setup();
    renderWithWorkspace(<App />, { api: apiWithOnePod() });

    await waitFor(() => {
      expect(screen.getByTestId(TEST_IDS.laneRail)).toBeDefined();
    });
    await showInFollower('lane-calf');

    await waitFor(() => {
      expect(screen.getByTestId(TEST_IDS.transcriptSplit)).toBeDefined();
    });

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
    // The pane model survived: the Matriarch is still primary and the Calf is
    // still the follower. The panel hid the body; it did not reset it.
    expect(screen.getByTestId(TEST_IDS.transcriptSplit)).toBeDefined();
    expect(splitPropsOf(lastProps()).lane?.id).toBe('lane-calf');
    expect(
      (lastProps().primary as ReactElement<TranscriptPaneProps>).props.lane?.id,
    ).toBe('lane-matriarch');
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
