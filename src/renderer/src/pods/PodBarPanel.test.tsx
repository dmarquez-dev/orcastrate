// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { PodId } from '@shared/contracts/events';
import type { ActionResult } from '../contracts/renderer-state';
import { TEST_IDS } from '../contracts/renderer-view';
import { ipcError } from '../test-utils';
import { PodBarPanel } from './PodBarPanel';
import { renderedPodIds, tabVm } from './test-fixtures';

const TABS = [
  tabVm({ id: 'a', title: 'Alpha', active: true }),
  tabVm({ id: 'b', title: 'Bravo' }),
  tabVm({ id: 'c', title: 'Charlie' }),
];

function renderPanel(reorderPods: (ids: PodId[]) => Promise<ActionResult<void>>) {
  return render(
    <PodBarPanel
      onClose={vi.fn()}
      onDelete={vi.fn()}
      onNewPod={vi.fn()}
      onOpen={vi.fn()}
      onSelect={vi.fn()}
      reorderPods={reorderPods}
      tabs={TABS}
    />,
  );
}

function dragThirdToFirst(): void {
  fireEvent.dragStart(screen.getByTestId(`${TEST_IDS.podTab}:c`));
  fireEvent.dragEnter(screen.getByTestId(`${TEST_IDS.podTab}:a`));
  fireEvent.dragOver(screen.getByTestId(`${TEST_IDS.podTab}:a`));
  fireEvent.drop(screen.getByTestId(`${TEST_IDS.podTab}:a`));
}

describe('PodBarPanel', () => {
  it('commits one reorderPods call carrying the FULL list in its new order', async () => {
    const reorderPods = vi.fn(async (): Promise<ActionResult<void>> => ({
      ok: true,
      value: undefined,
    }));
    renderPanel(reorderPods);

    dragThirdToFirst();

    expect(reorderPods).toHaveBeenCalledTimes(1);
    expect(reorderPods).toHaveBeenCalledWith(['c', 'a', 'b']);
    await waitFor(() => {
      expect(screen.queryByRole('alert')).toBeNull();
    });
  });

  it('shows the dragged order optimistically, then REVERTS to server order when the call fails', async () => {
    const error = ipcError('CONFLICT', 'tabOrder was rejected');
    const reorderPods = vi.fn(async (): Promise<ActionResult<void>> => ({ ok: false, error }));
    const { container } = renderPanel(reorderPods);

    dragThirdToFirst();
    // Optimistic: the drag is on screen while the call is in flight.
    expect(renderedPodIds(container)).toEqual(['c', 'a', 'b']);

    // `tabs` is unchanged — the server order. The bar must not keep the drag.
    await waitFor(() => {
      expect(renderedPodIds(container)).toEqual(['a', 'b', 'c']);
    });
    expect(screen.getByRole('alert').textContent).toBe('tabOrder was rejected');
  });
});
