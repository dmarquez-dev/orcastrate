// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

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

describe('contract-runtime', () => {
  it('implements testId as the contract documents it', () => {
    expect(testId(TEST_IDS.podTab, 'abc')).toBe('pod-tab:abc');
    expect(testId(TEST_IDS.podBar)).toBe('pod-bar');
  });

  it('maps every status in both status unions to its own token', () => {
    const statuses = ['idle', 'running', 'waiting', 'beached', 'done', 'orphaned'] as const;
    const tokens = statuses.map((status) => statusToken(status));
    expect(new Set(tokens).size).toBe(statuses.length);
    expect(statusToken('waiting')).toBe('--oc-status-waiting');
  });
});
