// @vitest-environment jsdom
/**
 * Two things the closed state depends on, both driven through the real state
 * layer rather than through a hand-built view model.
 *
 * 1. THE RUN CONTROL ROUTES BY STATUS, NOT BY BUTTON. `PodsChrome` is the only
 *    caller of `openPod`/`reconnectPod` in the renderer, and which verb applies
 *    is the STATUS's decision: `'beached'` needs `pods.reconnect` and answers
 *    `pods.open` with an error, while `'closed'` needs `pods.open`. A closed
 *    Pod must never trigger a resume.
 *
 * 2. CLOSING A POD WITH NO LIVE RUNNER IS BENIGN. Symptom 3 of the session —
 *    "the tab's x refuses with a not-running error" — is NOT reproducible from
 *    the code: `PodsChrome` calls `actions.closePod`, which invokes `pod:close`,
 *    which reaches `PodManager.closePod`, and that method throws only
 *    `NOT_FOUND`. No fix is invented here. What is added is the guard that
 *    proves the benign behaviour, so a future regression that introduces the
 *    refusal fails loudly instead of arriving as a bug report.
 */

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it } from 'vitest';

import { App } from '../App';
import { TEST_IDS } from '../contracts/renderer-view';
import { WorkspaceProvider } from '../state';
import { testId } from '../shell/contract-runtime';
import {
  makeStubPod,
  registerWorkspaceProvider,
  renderWithWorkspace,
  stubOrcastrateApi,
} from '../test-utils';
import { POD_TAB_OPEN_TEST_ID } from './PodTab';

beforeAll(() => {
  registerWorkspaceProvider(WorkspaceProvider);
});

const CLOSED = makeStubPod({ id: 'pod-closed', title: 'Closed Pod', tabOrder: 0, status: 'closed' });
const BEACHED = makeStubPod({
  id: 'pod-beached',
  title: 'Beached Pod',
  tabOrder: 1,
  status: 'beached',
});

/**
 * Both statuses in ONE fixture, deliberately. With a single Pod an assertion
 * about routing can pass by guessing whichever verb the renderer happens to
 * call about everything; two Pods on opposite sides of the branch cannot both
 * be satisfied by a constant.
 */
function bothSides() {
  return stubOrcastrateApi({
    pods: { list: async () => ({ ok: true, value: [CLOSED, BEACHED] }) },
  });
}

describe('the run control routes by status', () => {
  it('sends a closed Pod to pods.open and never to pods.reconnect', async () => {
    const user = userEvent.setup();
    const api = bothSides();
    renderWithWorkspace(<App />, { api });

    await user.click(await screen.findByTestId(testId(POD_TAB_OPEN_TEST_ID, CLOSED.id)));

    await waitFor(() => {
      expect(api.calls.podOpen).toEqual([[CLOSED.id]]);
    });
    // The whole point: a closed Pod is not a stopped one, and resuming it is
    // the wrong affordance.
    expect(api.calls.podReconnect).toEqual([]);
  });

  it('sends a beached Pod to pods.reconnect and never to pods.open', async () => {
    const user = userEvent.setup();
    const api = bothSides();
    renderWithWorkspace(<App />, { api });

    await user.click(await screen.findByTestId(testId(POD_TAB_OPEN_TEST_ID, BEACHED.id)));

    await waitFor(() => {
      expect(api.calls.podReconnect).toEqual([[BEACHED.id]]);
    });
    expect(api.calls.podOpen).toEqual([]);
  });

  it('offers both controls at once, each with its own verb', async () => {
    const api = bothSides();
    renderWithWorkspace(<App />, { api });

    const closedControl = await screen.findByTestId(testId(POD_TAB_OPEN_TEST_ID, CLOSED.id));
    const beachedControl = screen.getByTestId(testId(POD_TAB_OPEN_TEST_ID, BEACHED.id));
    expect(closedControl.textContent).toBe('Open');
    expect(beachedControl.textContent).toBe('Reconnect');
    // Neither was reached by opening anything: the labels come from the listed
    // rows alone.
    expect(api.calls.podOpen).toEqual([]);
    expect(api.calls.podReconnect).toEqual([]);
  });
});

describe('closing a Pod that has no live runner', () => {
  it('resolves, keeps the row and the transcript, stays closed, and says nothing', async () => {
    const user = userEvent.setup();
    const api = stubOrcastrateApi({
      pods: { list: async () => ({ ok: true, value: [CLOSED] }) },
    });
    renderWithWorkspace(<App />, { api });

    const tab = await screen.findByTestId(testId(TEST_IDS.podTab, CLOSED.id));
    // The transcript is on screen before the close, so "still there" afterwards
    // is a comparison rather than an assumption.
    const transcriptBefore = await screen.findByTestId(TEST_IDS.transcriptPrimary);
    expect(transcriptBefore).toBeDefined();

    await user.click(screen.getByLabelText(`Close ${CLOSED.title}`));

    await waitFor(() => {
      expect(api.calls.podClose).toEqual([[CLOSED.id]]);
    });

    // The row survives. `pod:close` stops a process; it does not delete a Pod.
    expect(screen.getByTestId(testId(TEST_IDS.podTab, CLOSED.id))).toBeDefined();
    expect(screen.getByTestId(TEST_IDS.transcriptPrimary)).toBeDefined();

    // Still `'closed'`, not `'idle'`. Under the widened union `'idle'` means
    // OPEN AND BETWEEN TURNS, so reading idle here would be a lie about a
    // process that is not there.
    expect(tab.textContent).toContain('Closed.');
    expect(tab.textContent).not.toContain('Idle');
    expect(tab.querySelector('[data-status]')?.getAttribute('data-status')).toBe('closed');

    // Nothing was surfaced to the user: no error text anywhere, and the
    // composer still says exactly what it said before — the not-opened
    // sentence, which is true of a closed Pod and already names the way out.
    expect(screen.queryByRole('alert')).toBeNull();
    expect(document.body.textContent).not.toContain('NOT_RUNNING');
    expect(screen.getByTestId('composer-disabled-note').textContent).toContain(
      'This Pod is not running. Open it before sending a message.',
    );

    // And the way out is still on screen.
    expect(screen.getByTestId(testId(POD_TAB_OPEN_TEST_ID, CLOSED.id)).textContent).toBe('Open');
  });
});
