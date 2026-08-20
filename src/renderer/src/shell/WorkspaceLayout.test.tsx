// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { PANEL_TEST_IDS } from '../contracts/renderer-panels';
import { TEST_IDS } from '../contracts/renderer-view';
import { EmptyWorkspace } from './EmptyWorkspace';
import { WorkspaceLayout } from './WorkspaceLayout';
import { statusToken, testId } from './contract-runtime';

// Imported for its `afterEach(cleanup)` side effect.
import '../test-utils';

const SLOTS = {
  podBar: <div data-testid="slot-pod-bar">bar</div>,
  laneRail: <div data-testid="slot-lane-rail">rail</div>,
  primary: <div data-testid="slot-primary">primary</div>,
  composer: <div data-testid="slot-composer">composer</div>,
};

describe('WorkspaceLayout', () => {
  it('renders one centre pane when split is null', () => {
    const { container } = render(<WorkspaceLayout {...SLOTS} split={null} />);
    expect(screen.getByTestId(TEST_IDS.workspace)).toBeDefined();
    expect(screen.getByTestId('slot-pod-bar')).toBeDefined();
    expect(screen.getByTestId('slot-lane-rail')).toBeDefined();
    expect(screen.getByTestId('slot-composer')).toBeDefined();
    expect(container.querySelector('[data-split]')?.getAttribute('data-split')).toBe('false');
  });

  it('renders two panes with primary on the left when split is non-null', () => {
    const { container } = render(
      <WorkspaceLayout {...SLOTS} split={<div data-testid="slot-split">split</div>} />,
    );
    const panes = container.querySelector('[data-split="true"]');
    expect(panes).not.toBeNull();
    const order = Array.from(panes?.children ?? []).map(
      (child) => child.firstElementChild?.getAttribute('data-testid'),
    );
    expect(order).toEqual(['slot-primary', 'slot-split']);
  });

  it('replaces rail, transcript and composer with the empty state', () => {
    render(
      <WorkspaceLayout {...SLOTS} empty={<EmptyWorkspace onNewPod={vi.fn()} />} split={null} />,
    );
    expect(screen.getByTestId('slot-pod-bar')).toBeDefined();
    expect(screen.queryByTestId('slot-lane-rail')).toBeNull();
    expect(screen.queryByTestId('slot-primary')).toBeNull();
    expect(screen.queryByTestId('slot-composer')).toBeNull();
    expect(screen.getByRole('button', { name: 'New Pod' })).toBeDefined();
  });
});

/**
 * The panel region (sub-session 3). The strip is chrome and is always there;
 * the panel replaces the body when it is non-null, and replaces the EMPTY
 * state too — panels do not require a Pod.
 */
const PANEL_SLOTS = {
  ...SLOTS,
  panelBar: <div data-testid="slot-panel-bar">strip</div>,
};

describe('WorkspaceLayout panel region', () => {
  it('renders the strip beneath the Pod bar on every render', () => {
    const { container, rerender } = render(
      <WorkspaceLayout {...PANEL_SLOTS} panel={null} split={null} />,
    );
    const order = Array.from(container.firstElementChild?.children ?? []).map(
      (child) => child.firstElementChild?.getAttribute('data-testid'),
    );
    expect(order.slice(0, 2)).toEqual(['slot-pod-bar', 'slot-panel-bar']);

    rerender(
      <WorkspaceLayout
        {...PANEL_SLOTS}
        panel={<div data-testid="slot-panel">panel</div>}
        split={null}
      />,
    );
    expect(screen.getByTestId('slot-panel-bar')).toBeDefined();

    rerender(
      <WorkspaceLayout
        {...PANEL_SLOTS}
        empty={<EmptyWorkspace onNewPod={vi.fn()} />}
        panel={null}
        split={null}
      />,
    );
    expect(screen.getByTestId('slot-panel-bar')).toBeDefined();
  });

  it('renders the panel inside the panel region INSTEAD of the body', () => {
    render(
      <WorkspaceLayout
        {...PANEL_SLOTS}
        panel={<div data-testid="slot-panel">panel</div>}
        split={<div data-testid="slot-split">split</div>}
      />,
    );

    const region = screen.getByTestId(PANEL_TEST_IDS.panelRegion);
    expect(region.contains(screen.getByTestId('slot-panel'))).toBe(true);
    // Pod bar and strip stay: the user can see which Pod they come back to.
    expect(screen.getByTestId('slot-pod-bar')).toBeDefined();
    expect(screen.getByTestId('slot-panel-bar')).toBeDefined();
    // Rail, transcript pane(s) and composer are gone.
    expect(screen.queryByTestId('slot-lane-rail')).toBeNull();
    expect(screen.queryByTestId('slot-primary')).toBeNull();
    expect(screen.queryByTestId('slot-split')).toBeNull();
    expect(screen.queryByTestId('slot-composer')).toBeNull();
  });

  it('replaces the empty state too — a panel does not require a Pod', () => {
    render(
      <WorkspaceLayout
        {...PANEL_SLOTS}
        empty={<EmptyWorkspace onNewPod={vi.fn()} />}
        panel={<div data-testid="slot-panel">panel</div>}
        split={null}
      />,
    );
    expect(screen.getByTestId('slot-panel')).toBeDefined();
    expect(screen.queryByRole('heading', { name: 'No Pod open' })).toBeNull();
  });

  /**
   * The strip's region renders on EVERY render — with no `panelBar` supplied it
   * is simply empty. Deleting it from both trees is what isolates the question
   * this task has to answer: is everything ELSE the DOM it was before?
   */
  const withoutStrip = (container: HTMLElement): string => {
    const workspace = container.firstElementChild;
    workspace?.children[1]?.remove();
    return container.innerHTML;
  };

  it('leaves the tree byte-identical when no panel is open', () => {
    // The tree as it was BEFORE this task: neither new slot supplied.
    const before = render(<WorkspaceLayout {...SLOTS} split={null} />);
    const beforeHtml = withoutStrip(before.container);
    cleanup();

    const after = render(<WorkspaceLayout {...PANEL_SLOTS} panel={null} split={null} />);
    // Guard against a vacuous pass: the strip really was in the second tree.
    expect(screen.getByTestId('slot-panel-bar').parentElement).toBe(
      after.container.firstElementChild?.children[1],
    );
    expect(withoutStrip(after.container)).toBe(beforeHtml);
    expect(beforeHtml).toContain('data-testid="slot-composer"');
  });

  it('leaves the empty state byte-identical when no panel is open', () => {
    const before = render(
      <WorkspaceLayout {...SLOTS} empty={<EmptyWorkspace onNewPod={vi.fn()} />} split={null} />,
    );
    const beforeHtml = withoutStrip(before.container);
    cleanup();

    const after = render(
      <WorkspaceLayout
        {...PANEL_SLOTS}
        empty={<EmptyWorkspace onNewPod={vi.fn()} />}
        panel={null}
        split={null}
      />,
    );
    expect(withoutStrip(after.container)).toBe(beforeHtml);
    expect(beforeHtml).toContain('No Pod open');
  });
});

describe('contract-runtime', () => {
  it('implements testId as the contract documents it', () => {
    expect(testId(TEST_IDS.podTab, 'abc')).toBe('pod-tab:abc');
    expect(testId(TEST_IDS.podBar)).toBe('pod-bar');
  });

  it('maps every status in both status unions to its own token', () => {
    // `closed` is the fifth PodStatus. The DISTINCTNESS assertion below is
    // unchanged and is why `--oc-status-closed` cannot alias `--oc-status-idle`.
    const statuses = [
      'idle',
      'running',
      'waiting',
      'beached',
      'closed',
      'done',
      'orphaned',
    ] as const;
    const tokens = statuses.map((status) => statusToken(status));
    expect(new Set(tokens).size).toBe(statuses.length);
    expect(statusToken('waiting')).toBe('--oc-status-waiting');
    expect(statusToken('closed')).toBe('--oc-status-closed');
  });
});
