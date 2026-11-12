// @vitest-environment jsdom
/**
 * The notification region as `App` mounts it, and the workspace-level load
 * failures `WorkspaceAlerts` raises into it: E8 (`lanes.list`, key
 * `lanes-load:{podId}`), E9 (`events.read`, key `events-load:{podId}`) and E10
 * (`app.routingMode`, key `routing-mode`), each reading `IpcError.message`.
 *
 * Every test mounts the whole app through `mountWorkspace`, which wraps it in
 * `StrictMode` exactly as `main.tsx` does — that is what makes the
 * one-item-per-failure test meaningful, since StrictMode runs every effect
 * twice on mount. The one exception is the E10 dismissal test, which mounts a
 * real `NotificationProvider` and `WorkspaceAlerts` beside a probe that calls
 * `retryRoutingMode` directly, so the item can only leave through the dismiss.
 *
 * THE RETRY TESTS. Each of E8, E9 and E10 carries a `Retry` action. The tests
 * below click it with the load answering (the item goes and the load lands),
 * click it with the load still failing (exactly one item comes back, again
 * with `Retry`), and hold the retried load open to show the item is removed
 * at once rather than when the load settles.
 */

import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';
import { describe, expect, it } from 'vitest';

import type { Lane, Pod } from '@shared/contracts/events';
import type { IpcResult } from '@shared/contracts/ipc';
import type { WorkspaceActions } from '../contracts/renderer-state';
import { TEST_IDS } from '../contracts/renderer-view';
import { NOTIFICATION_TEST_IDS, NotificationProvider } from '../notifications';
import { PODS_CHROME_TEST_ID } from '../pods/PodsChrome';
import { useWorkspaceActions } from '../state';
import { ipcError, renderWithWorkspace, stubOrcastrateApi } from '../test-utils';
import {
  AppRoot,
  BRAVO_ID,
  CALF_EARLY,
  CALF_EARLY_ID,
  MATRIARCH,
  MATRIARCH_ID,
  POD_BRAVO,
  flushPendingWork,
  installUnhandledRejectionGuard,
  mountWorkspace,
} from '../__tests__/harness';
import { testId } from './contract-runtime';
import { WorkspaceAlerts } from './WorkspaceAlerts';

installUnhandledRejectionGuard();

const LANES_MESSAGE = 'the lane registry could not be read';
const EVENTS_MESSAGE = 'the transcript could not be read';
const ROUTING_MESSAGE = 'the routing mode could not be read';

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

/** The one error item reading `message`, once it is the only one. */
async function soleErrorItem(message: string): Promise<HTMLElement> {
  let found: HTMLElement | undefined;
  await waitFor(() => {
    const items = errorItems(message);
    expect(items).toHaveLength(1);
    found = items[0];
  });
  if (found === undefined) throw new Error(`no error item reading "${message}"`);
  return found;
}

/** The item's `Retry` control; throws unless there is exactly one. */
function retryButtonOf(item: HTMLElement): HTMLElement {
  return within(item).getByRole('button', { name: 'Retry' });
}

/** A promise the test settles by hand, to hold a load in flight. */
function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve: ((value: T) => void) | undefined;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  if (resolve === undefined) throw new Error('deferred promise executor did not run');
  return { promise, resolve };
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

describe('E8 carries a Retry action that re-reads the active Pod\'s lanes', () => {
  it('re-reads lanes.list once on Retry, removes the E8 item and lists every lane the retry answered', async () => {
    // The stub's overrides beat `failInvoke`, so the fail-then-succeed answer
    // lives in one override, and it counts its own calls.
    const answered: Lane[] = [MATRIARCH, CALF_EARLY];
    let laneListCalls = 0;
    const api = stubOrcastrateApi({
      pods: listing(POD_BRAVO),
      lanes: {
        list: async () => {
          laneListCalls += 1;
          return laneListCalls === 1
            ? { ok: false, error: ipcError('IO', LANES_MESSAGE) }
            : { ok: true, value: answered };
        },
      },
    });
    mountWorkspace(api);
    const user = userEvent.setup();

    const item = await soleErrorItem(LANES_MESSAGE);
    // Exactly two controls: one `Retry` and the dismiss control.
    expect(within(item).getAllByRole('button', { name: 'Retry' })).toHaveLength(1);
    expect(within(item).getAllByRole('button', { name: 'Dismiss notification' })).toHaveLength(1);
    expect(within(item).getAllByRole('button')).toHaveLength(2);

    await user.click(retryButtonOf(item));

    await waitFor(() => {
      expect(screen.getByTestId(TEST_IDS.laneRail)).toBeDefined();
    });
    await flushPendingWork();
    expect(laneListCalls).toBe(2);
    expect(errorItems(LANES_MESSAGE)).toEqual([]);
    const rail = screen.getByTestId(TEST_IDS.laneRail);
    expect(within(rail).getByTestId(testId(TEST_IDS.laneRow, MATRIARCH_ID))).toBeDefined();
    expect(within(rail).getByTestId(testId(TEST_IDS.laneRow, CALF_EARLY_ID))).toBeDefined();
  });

  it('raises exactly one E8 item again, still with Retry, when the retried lanes.list fails', async () => {
    const api = stubOrcastrateApi({ pods: listing(POD_BRAVO) });
    api.failInvoke('laneList', ipcError('IO', LANES_MESSAGE));
    mountWorkspace(api);
    const user = userEvent.setup();

    await user.click(retryButtonOf(await soleErrorItem(LANES_MESSAGE)));

    await waitFor(() => {
      expect(api.calls.laneList).toHaveLength(2);
    });
    const again = await soleErrorItem(LANES_MESSAGE);
    await flushPendingWork();
    expect(api.calls.laneList).toHaveLength(2);
    expect(errorItems(LANES_MESSAGE)).toHaveLength(1);
    expect(retryButtonOf(again)).toBeDefined();
  });

  it('removes the E8 item as soon as Retry is clicked, before the retried lanes.list settles', async () => {
    const held = deferred<IpcResult<Lane[]>>();
    let laneListCalls = 0;
    const api = stubOrcastrateApi({
      pods: listing(POD_BRAVO),
      lanes: {
        list: async () => {
          laneListCalls += 1;
          return laneListCalls === 1
            ? { ok: false, error: ipcError('IO', LANES_MESSAGE) }
            : held.promise;
        },
      },
    });
    mountWorkspace(api);
    const user = userEvent.setup();

    await user.click(retryButtonOf(await soleErrorItem(LANES_MESSAGE)));
    await flushPendingWork();

    // The retry is in flight and has not answered.
    expect(laneListCalls).toBe(2);
    expect(errorItems(LANES_MESSAGE)).toEqual([]);

    // Let it land so nothing is left pending after the test.
    await act(async () => {
      held.resolve({ ok: true, value: [MATRIARCH] });
      await flushPendingWork();
    });
  });
});

describe('E9 carries a Retry action that re-reads the failed backfill page', () => {
  it('re-reads the same events.read page once on Retry and removes the E9 item', async () => {
    const api = stubOrcastrateApi({
      pods: listing(POD_BRAVO),
      lanes: { list: async () => ({ ok: true, value: [MATRIARCH] }) },
    });
    api.failInvoke('eventsRead', ipcError('IO', EVENTS_MESSAGE));
    mountWorkspace(api);
    const user = userEvent.setup();

    const item = await soleErrorItem(EVENTS_MESSAGE);
    await flushPendingWork();
    expect(api.calls.eventsRead).toHaveLength(1);

    api.clearInvokeFailure('eventsRead');
    await user.click(retryButtonOf(item));

    await waitFor(() => {
      expect(api.calls.eventsRead).toHaveLength(2);
    });
    await flushPendingWork();
    expect(api.calls.eventsRead).toHaveLength(2);
    expect(api.calls.eventsRead[1]).toEqual(api.calls.eventsRead[0]);
    expect(errorItems(EVENTS_MESSAGE)).toEqual([]);
  });

  it('raises exactly one E9 item again, still with Retry, when the retried events.read fails', async () => {
    const api = stubOrcastrateApi({
      pods: listing(POD_BRAVO),
      lanes: { list: async () => ({ ok: true, value: [MATRIARCH] }) },
    });
    api.failInvoke('eventsRead', ipcError('IO', EVENTS_MESSAGE));
    mountWorkspace(api);
    const user = userEvent.setup();

    await user.click(retryButtonOf(await soleErrorItem(EVENTS_MESSAGE)));

    await waitFor(() => {
      expect(api.calls.eventsRead).toHaveLength(2);
    });
    const again = await soleErrorItem(EVENTS_MESSAGE);
    await flushPendingWork();
    expect(api.calls.eventsRead).toHaveLength(2);
    expect(errorItems(EVENTS_MESSAGE)).toHaveLength(1);
    expect(retryButtonOf(again)).toBeDefined();
  });
});

describe('E10 carries a Retry action that re-reads the routing mode', () => {
  it('re-reads app.routingMode once on Retry, removes the E10 item and shows the lane rail', async () => {
    const api = stubOrcastrateApi({
      pods: listing(POD_BRAVO),
      lanes: { list: async () => ({ ok: true, value: [MATRIARCH] }) },
    });
    api.failInvoke('appRoutingMode', ipcError('INTERNAL', ROUTING_MESSAGE));
    mountWorkspace(api);
    const user = userEvent.setup();

    const item = await soleErrorItem(ROUTING_MESSAGE);
    await flushPendingWork();
    // The mode is still `null`, so the shell shows the loading workspace.
    expect(screen.queryByTestId(TEST_IDS.laneRail)).toBeNull();

    api.clearInvokeFailure('appRoutingMode');
    await user.click(retryButtonOf(item));

    await waitFor(() => {
      expect(screen.getByTestId(TEST_IDS.laneRail)).toBeDefined();
    });
    await flushPendingWork();
    expect(api.calls.appRoutingMode).toHaveLength(2);
    expect(errorItems(ROUTING_MESSAGE)).toEqual([]);
    expect(screen.getByTestId(TEST_IDS.laneRail)).toBeDefined();
  });

  it('raises exactly one E10 item again, still with Retry, when the retried app.routingMode answers the same error', async () => {
    const api = stubOrcastrateApi({ pods: listing(POD_BRAVO) });
    // `failInvoke` hands back this one object on every call, so the retry's
    // failure is the very `IpcError` the startup read failed with.
    api.failInvoke('appRoutingMode', ipcError('INTERNAL', ROUTING_MESSAGE));
    mountWorkspace(api);
    const user = userEvent.setup();

    await user.click(retryButtonOf(await soleErrorItem(ROUTING_MESSAGE)));

    await waitFor(() => {
      expect(api.calls.appRoutingMode).toHaveLength(2);
    });
    const again = await soleErrorItem(ROUTING_MESSAGE);
    await flushPendingWork();
    expect(api.calls.appRoutingMode).toHaveLength(2);
    expect(errorItems(ROUTING_MESSAGE)).toHaveLength(1);
    expect(retryButtonOf(again)).toBeDefined();
  });

  it('dismisses the E10 item when a retryRoutingMode made without the Retry button succeeds', async () => {
    // The probe sits inside the same providers as the real `WorkspaceAlerts`
    // and hands out the store's actions, so the retry runs without the button.
    const probe: { actions: WorkspaceActions | null } = { actions: null };
    function ActionsProbe(): null {
      const workspaceActions = useWorkspaceActions();
      useEffect(() => {
        probe.actions = workspaceActions;
      }, [workspaceActions]);
      return null;
    }

    const api = stubOrcastrateApi({ pods: listing(POD_BRAVO) });
    api.failInvoke('appRoutingMode', ipcError('INTERNAL', ROUTING_MESSAGE));
    renderWithWorkspace(
      <NotificationProvider>
        <WorkspaceAlerts />
        <ActionsProbe />
      </NotificationProvider>,
      { api, provider: AppRoot },
    );

    await soleErrorItem(ROUTING_MESSAGE);
    api.clearInvokeFailure('appRoutingMode');

    const actions = probe.actions;
    if (actions === null) throw new Error('the probe never received the workspace actions');
    await act(async () => {
      const result = await actions.retryRoutingMode();
      expect(result.ok).toBe(true);
    });
    await flushPendingWork();

    expect(api.calls.appRoutingMode).toHaveLength(2);
    expect(errorItems(ROUTING_MESSAGE)).toEqual([]);
  });
});
