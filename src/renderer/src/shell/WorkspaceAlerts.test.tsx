// @vitest-environment jsdom
/**
 * The notification region as `App` mounts it, and the workspace-level load
 * failures `WorkspaceAlerts` raises into it (session
 * 20261111-0156-message-alerting, `contracts/action-messages.md` rows E8-E10).
 *
 * Every test mounts the whole app through `mountWorkspace`, which wraps it in
 * `StrictMode` exactly as `main.tsx` does — that is what makes the
 * one-item-per-failure test meaningful, since StrictMode runs every effect
 * twice on mount.
 */

import { act, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { Pod } from '@shared/contracts/events';
import type { IpcResult } from '@shared/contracts/ipc';
import { TEST_IDS } from '../contracts/renderer-view';
import { NOTIFICATION_TEST_IDS } from '../notifications';
import { PODS_CHROME_TEST_ID } from '../pods/PodsChrome';
import { ipcError, stubOrcastrateApi } from '../test-utils';
import {
  BRAVO_ID,
  MATRIARCH,
  POD_BRAVO,
  flushPendingWork,
  installUnhandledRejectionGuard,
  mountWorkspace,
} from '../__tests__/harness';

installUnhandledRejectionGuard();

const LANES_MESSAGE = 'the lane registry could not be read';

function listing(...pods: Pod[]): { list: () => Promise<IpcResult<Pod[]>> } {
  return { list: async () => ({ ok: true, value: pods }) };
}

/** The error items in the viewport whose `role="alert"` message reads `message`. */
function errorItems(message: string): HTMLElement[] {
  const viewport = screen.getByTestId(NOTIFICATION_TEST_IDS.viewport);
  return within(viewport)
    .queryAllByTestId(NOTIFICATION_TEST_IDS.item)
    .filter(
      (item) =>
        item.getAttribute('data-kind') === 'error' &&
        within(item)
          .queryAllByRole('alert')
          .some((alert) => alert.textContent === message),
    );
}

describe('App mounts the notification region', () => {
  it('renders exactly one viewport, outside the Pod header', async () => {
    mountWorkspace(stubOrcastrateApi({ pods: listing(POD_BRAVO) }));
    await screen.findByTestId(TEST_IDS.workspace);
    await flushPendingWork();

    const viewports = screen.queryAllByTestId(NOTIFICATION_TEST_IDS.viewport);
    expect(viewports).toHaveLength(1);
    const [viewport] = viewports;
    if (viewport === undefined) throw new Error('notification viewport missing');
    expect(screen.getByTestId(PODS_CHROME_TEST_ID).contains(viewport)).toBe(false);
  });
});

describe('WorkspaceAlerts reports the active Pod\'s lane load', () => {
  it('raises one error item, not two, for a single lanes-load failure under StrictMode', async () => {
    const api = stubOrcastrateApi({ pods: listing(POD_BRAVO) });
    api.failInvoke('laneList', ipcError('IO', LANES_MESSAGE));
    mountWorkspace(api);

    await waitFor(() => {
      expect(errorItems(LANES_MESSAGE).length).toBeGreaterThan(0);
    });
    await flushPendingWork();

    // The failure fired once: a second item could only come from raising it twice.
    expect(api.calls.laneList).toHaveLength(1);
    expect(errorItems(LANES_MESSAGE)).toHaveLength(1);
  });

  it('removes the E8 error item once the same Pod\'s lane load succeeds', async () => {
    const api = stubOrcastrateApi({ pods: listing(POD_BRAVO) });
    api.failInvoke('laneList', ipcError('IO', LANES_MESSAGE));
    mountWorkspace(api);

    await waitFor(() => {
      expect(errorItems(LANES_MESSAGE)).toHaveLength(1);
    });

    // A `laneChanged` snapshot is the store's lane load succeeding for Bravo:
    // it moves that Pod's lane phase from 'error' to 'ready'.
    act(() => {
      api.emit.laneChanged({ podId: BRAVO_ID, lanes: [MATRIARCH] });
    });

    await waitFor(() => {
      expect(errorItems(LANES_MESSAGE)).toEqual([]);
    });
    // The lane load really did land: the rail now lists the Matriarch.
    expect(screen.getByTestId(TEST_IDS.laneRail)).toBeDefined();
  });
});
