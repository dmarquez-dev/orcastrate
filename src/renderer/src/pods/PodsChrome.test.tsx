// @vitest-environment jsdom
/**
 * `PodsChrome`'s stop handler, `handleStop`, for a Pod that `pods.value` does
 * not hold — and, through the same seam, for one it does.
 *
 * WHY `./PodBarPanel` IS MOCKED, AND NOTHING ELSE. No rendered control reaches
 * an unlisted stop. `PodBarPanel` renders only rows of its `tabs` prop: its
 * optimistic order resolves through the current `tabs` and falls back to them.
 * `PodBar` renders one `PodTab` per row, and each tab's stop control calls
 * `onClose` with that row's own id. `PodsChrome` passes `tabs={pods.value}` and
 * `onClose={handleStop}` from the same render, and `handleStop` reads the title
 * from that same `pods.value`. So every id a click can deliver is listed, and
 * the unlisted branch is reachable only by calling the `onClose` prop directly.
 * The mock records the props `PodsChrome` passes so the test can do exactly
 * that. A mock stands in for a boundary the test cannot cross: here, the
 * rendered bar's guarantee that it never names an unlisted Pod.
 *
 * Everything else is real: `PodsChrome` itself, the real `NotificationProvider`
 * and its viewport, and the real `WorkspaceProvider` over `stubOrcastrateApi`,
 * which lists one Pod.
 *
 * THE WORDINGS ARE LOCAL LITERALS, so a wording change in the product fails
 * here rather than being agreed with.
 */
import { act, screen, waitFor, within } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import type { PodBarPanelProps } from './PodBarPanel';

const recorded = vi.hoisted((): PodBarPanelProps[] => []);

vi.mock('./PodBarPanel', () => ({
  PodBarPanel: (props: PodBarPanelProps) => {
    recorded.push(props);
    return <div data-testid="pod-bar-panel-stub" />;
  },
}));

import { NOTIFICATION_TEST_IDS, NotificationProvider } from '../notifications';
import { WorkspaceProvider } from '../state';
import {
  ipcError,
  makeStubPod,
  registerWorkspaceProvider,
  renderWithWorkspace,
  stubOrcastrateApi,
  type StubOrcastrateApi,
} from '../test-utils';
import { PodsChrome } from './PodsChrome';

const LISTED_ID = 'pod-listed';
const LISTED_TITLE = 'Alpha';
const UNLISTED_ID = 'pod-not-in-the-list';

beforeAll(() => {
  registerWorkspaceProvider(WorkspaceProvider);
});

/** The props of the most recent `PodBarPanel` render. */
function latestPanelProps(): PodBarPanelProps {
  const last = recorded.at(-1);
  if (last === undefined) throw new Error('PodsChrome never rendered PodBarPanel');
  return last;
}

/**
 * Mounts the real chrome over a stub listing exactly one Pod, and waits until
 * the props `PodsChrome` hands the panel carry that Pod — so `pods.value` is
 * loaded, and `UNLISTED_ID` is absent from a list that is not empty.
 */
async function mountChrome(): Promise<StubOrcastrateApi> {
  recorded.length = 0;
  const api = stubOrcastrateApi({
    pods: {
      list: async () => ({
        ok: true,
        value: [makeStubPod({ id: LISTED_ID, title: LISTED_TITLE })],
      }),
    },
  });
  renderWithWorkspace(
    <NotificationProvider>
      <PodsChrome dialogOpen={false} onDismissNewPod={() => {}} onRequestNewPod={() => {}} />
    </NotificationProvider>,
    { api },
  );
  await waitFor(() => {
    expect(latestPanelProps().tabs.map((tab) => tab.pod.id)).toEqual([LISTED_ID]);
  });
  return api;
}

/** Calls the `onClose` that `PodsChrome` passed on its latest render. */
async function stopThroughPanel(podId: string): Promise<void> {
  await act(async () => {
    latestPanelProps().onClose(podId);
  });
}

function viewportItems(): HTMLElement[] {
  const viewport = screen.getByTestId(NOTIFICATION_TEST_IDS.viewport);
  return within(viewport).queryAllByTestId(NOTIFICATION_TEST_IDS.item);
}

/** `kind: message` per live item, for a legible failure. */
function describeItems(): string {
  const items = viewportItems();
  if (items.length === 0) return 'no items';
  return items
    .map((item) => `${item.getAttribute('data-kind') ?? '?'}: ${JSON.stringify(item.textContent)}`)
    .join('; ');
}

/** The `textContent` of an item's message element, found by the role its kind carries. */
function messageOf(item: HTMLElement, role: 'alert' | 'status'): string | null {
  return within(item).getByRole(role).textContent;
}

describe('PodsChrome stop handler', () => {
  it('raises exactly one info notification reading "Pod stopped" when a stop of an unlisted Pod succeeds', async () => {
    const api = await mountChrome();

    await stopThroughPanel(UNLISTED_ID);

    await waitFor(() => {
      expect(viewportItems(), describeItems()).toHaveLength(1);
    });
    const [item] = viewportItems();
    if (item === undefined) throw new Error('the viewport lost its only item');
    expect(item.getAttribute('data-kind')).toBe('info');
    expect(messageOf(item, 'status')).toBe('Pod stopped');
    // The stop still reaches main for a Pod the renderer does not list.
    expect(api.calls.podClose).toEqual([[UNLISTED_ID]]);
  });

  it('leaves one "Pod stopped" item, not two, after two successive successful unlisted stops', async () => {
    await mountChrome();

    await stopThroughPanel(UNLISTED_ID);
    await waitFor(() => {
      expect(viewportItems(), describeItems()).toHaveLength(1);
    });
    const first = viewportItems()[0];
    if (first === undefined) throw new Error('the first stop raised no item');

    await stopThroughPanel(UNLISTED_ID);
    // SETTLED once an item the first stop did not raise is in the viewport:
    // the leading dismiss removes the first one and the second notify adds a
    // new node. An unkeyed notify would keep the first node beside it.
    await waitFor(() => {
      expect(
        viewportItems().some((item) => item !== first),
        describeItems(),
      ).toBe(true);
    });

    const items = viewportItems();
    expect(items, describeItems()).toHaveLength(1);
    const [only] = items;
    if (only === undefined) throw new Error('the viewport lost its only item');
    expect(only.getAttribute('data-kind')).toBe('info');
    expect(messageOf(only, 'status')).toBe('Pod stopped');
  });

  it('raises exactly one info notification naming the Pod when a stop of the listed Pod succeeds', async () => {
    await mountChrome();

    await stopThroughPanel(LISTED_ID);

    await waitFor(() => {
      expect(viewportItems(), describeItems()).toHaveLength(1);
    });
    const [item] = viewportItems();
    if (item === undefined) throw new Error('the viewport lost its only item');
    expect(item.getAttribute('data-kind')).toBe('info');
    expect(messageOf(item, 'status')).toBe(`Pod stopped: ${LISTED_TITLE}`);
  });

  it('raises exactly one error notification carrying main\'s message verbatim, and no "Pod stopped", when a stop of an unlisted Pod fails', async () => {
    const api = await mountChrome();
    const message = 'pods.close refused the unlisted Pod in PodsChrome.test';
    api.failInvoke('podClose', ipcError('INTERNAL', message));

    await stopThroughPanel(UNLISTED_ID);

    await waitFor(() => {
      expect(viewportItems(), describeItems()).toHaveLength(1);
    });
    const [item] = viewportItems();
    if (item === undefined) throw new Error('the viewport lost its only item');
    expect(item.getAttribute('data-kind')).toBe('error');
    expect(messageOf(item, 'alert')).toBe(message);
    expect(
      viewportItems().filter((candidate) => (candidate.textContent ?? '').includes('Pod stopped')),
      describeItems(),
    ).toEqual([]);
  });
});
