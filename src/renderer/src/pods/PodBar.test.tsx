// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { BYPASS_PERMISSIONS_WARNING, TEST_IDS } from '../contracts/renderer-view';
import { statusToken } from '../shell/contract-runtime';
import { PodBar } from './PodBar';
import { renderedPodIds, tabVm } from './test-fixtures';

// Imported for its `afterEach(cleanup)` side effect (`vitest.config.ts` sets
// `globals: false`, so RTL never installs its own).
import '../test-utils';

function renderBar(
  tabs: ReturnType<typeof tabVm>[],
  overrides: Partial<Parameters<typeof PodBar>[0]> = {},
) {
  const onReorder = vi.fn();
  const onSelect = vi.fn();
  const onClose = vi.fn();
  const onNewPod = vi.fn();
  const onOpen = vi.fn();
  const result = render(
    <PodBar
      onClose={onClose}
      onNewPod={onNewPod}
      onOpen={onOpen}
      onReorder={onReorder}
      onSelect={onSelect}
      tabs={tabs}
      {...overrides}
    />,
  );
  return { ...result, onReorder, onSelect, onClose, onNewPod, onOpen };
}

const THREE = [
  tabVm({ id: 'a', title: 'Alpha', active: true, status: 'running' }),
  tabVm({ id: 'b', title: 'Bravo', status: 'idle' }),
  tabVm({ id: 'c', title: 'Charlie', status: 'waiting' }),
];

describe('PodBar', () => {
  it('renders one tab per PodTabVm in the array order and sorts nothing', () => {
    // Deliberately not in title order: the state layer owns ordering.
    const { container } = renderBar([THREE[2]!, THREE[0]!, THREE[1]!]);
    expect(renderedPodIds(container)).toEqual(['c', 'a', 'b']);
    expect(screen.getByText('Alpha')).toBeDefined();
  });

  it('colours each status indicator from statusToken(status)', () => {
    const { container } = renderBar(THREE);
    const dots = container.querySelectorAll<HTMLElement>('[data-status]');
    expect(Array.from(dots).map((d) => d.getAttribute('data-status'))).toEqual([
      'running',
      'idle',
      'waiting',
    ]);
    expect(dots[0]?.style.getPropertyValue('--pod-status-color')).toBe(
      `var(${statusToken('running')})`,
    );
    expect(dots[2]?.style.getPropertyValue('--pod-status-color')).toBe(
      `var(${statusToken('waiting')})`,
    );
  });

  it('states the status in words as well as in colour', () => {
    renderBar([tabVm({ id: 'a', title: 'Alpha', status: 'beached' })]);
    expect(screen.getByText(/Beached, process stopped/)).toBeDefined();
  });

  it('drags the third tab to first and commits the FULL list in its new order', () => {
    const { container, onReorder } = renderBar(THREE);
    const first = screen.getByTestId(`${TEST_IDS.podTab}:a`);
    const third = screen.getByTestId(`${TEST_IDS.podTab}:c`);

    fireEvent.dragStart(third);
    fireEvent.dragEnter(first);
    fireEvent.dragOver(first);
    fireEvent.drop(first);

    expect(onReorder).toHaveBeenCalledTimes(1);
    expect(onReorder).toHaveBeenCalledWith(['c', 'a', 'b']);
    // The bar itself is presentational: it still renders what it was handed.
    expect(renderedPodIds(container)).toEqual(['a', 'b', 'c']);
  });

  it('offers a keyboard path to reorder', () => {
    const { onReorder } = renderBar(THREE);
    fireEvent.keyDown(screen.getByTestId(`${TEST_IDS.podTab}:c`), {
      key: 'ArrowLeft',
      ctrlKey: true,
    });
    expect(onReorder).toHaveBeenCalledWith(['a', 'c', 'b']);
  });

  it('moves focus between tabs with the unmodified arrow keys', () => {
    renderBar(THREE);
    const first = screen.getByTestId(`${TEST_IDS.podTab}:a`);
    first.focus();
    fireEvent.keyDown(first, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(screen.getByTestId(`${TEST_IDS.podTab}:b`));
  });

  it('shows the permission badge on a NON-ACTIVE Pod tab', () => {
    renderBar([
      tabVm({ id: 'a', title: 'Alpha', active: true }),
      tabVm({ id: 'b', title: 'Bravo', active: false, status: 'waiting', awaitingPermission: true }),
    ]);

    const badge = screen.getByTestId(`${TEST_IDS.podTabPermissionBadge}:b`);
    expect(badge).toBeDefined();
    // The point of spec 5.4: the backgrounded Pod is the one that is waiting.
    expect(screen.queryByTestId(`${TEST_IDS.podTabPermissionBadge}:a`)).toBeNull();
  });

  it('shows a persistent bypass badge whose accessible text is the warning verbatim', () => {
    renderBar([tabVm({ id: 'a', title: 'Alpha', permissionMode: 'bypassPermissions' })]);
    const badge = screen.getByTestId(`${TEST_IDS.podTabBypassBadge}:a`);

    expect(badge.textContent).toBe(BYPASS_PERMISSIONS_WARNING);
    expect(badge.getAttribute('aria-label')).toBe(BYPASS_PERMISSIONS_WARNING);
    expect(BYPASS_PERMISSIONS_WARNING).toBe('This Pod will never ask you about anything.');
  });

  it('shows no bypass badge for the other three modes', () => {
    renderBar([
      tabVm({ id: 'a', permissionMode: 'default' }),
      tabVm({ id: 'b', permissionMode: 'acceptEdits' }),
      tabVm({ id: 'c', permissionMode: 'plan' }),
    ]);
    for (const id of ['a', 'b', 'c']) {
      expect(screen.queryByTestId(`${TEST_IDS.podTabBypassBadge}:${id}`)).toBeNull();
    }
  });

  it('carries every Pod-bar test id from the contract', () => {
    renderBar([tabVm({ id: 'a', awaitingPermission: true, permissionMode: 'bypassPermissions' })]);
    expect(screen.getByTestId(TEST_IDS.podBar)).toBeDefined();
    expect(screen.getByTestId(`${TEST_IDS.podTab}:a`)).toBeDefined();
    expect(screen.getByTestId(`${TEST_IDS.podTabPermissionBadge}:a`)).toBeDefined();
    expect(screen.getByTestId(`${TEST_IDS.podTabBypassBadge}:a`)).toBeDefined();
    expect(screen.getByTestId(TEST_IDS.newPodButton)).toBeDefined();
  });

  it('wires select, close and new Pod', () => {
    const { onSelect, onClose, onNewPod } = renderBar(THREE);
    fireEvent.click(screen.getByTestId(`${TEST_IDS.podTab}:b`));
    fireEvent.click(screen.getByRole('button', { name: 'Close Charlie' }));
    fireEvent.click(screen.getByTestId(TEST_IDS.newPodButton));
    expect(onSelect).toHaveBeenCalledWith('b');
    expect(onClose).toHaveBeenCalledWith('c');
    expect(onNewPod).toHaveBeenCalledTimes(1);
  });
});
