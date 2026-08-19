// @vitest-environment jsdom
/**
 * THE RESTART PATH (T9).
 *
 * `pods.list` restores Pod ROWS; it does not restore PROCESSES. `opened` is
 * set only by create, open and reconnect, so after a restart every listed Pod
 * has `opened: false` and its composer is disabled reading "This Pod is not
 * running. Open it before sending a message." The frozen contract has declared
 * `openPod`/`reconnectPod` since Gate 2 and the state layer implements both —
 * but until this task no component called either, so that sentence named an
 * affordance the app did not have.
 *
 * Every test here mounts the assembled app through the shared harness and
 * drives it as a user would: by the run control's `data-testid`, by role, and
 * by visible text. The assertions are on `api.calls.podOpen` /
 * `api.calls.podReconnect` — the IPC the actions issue — rather than on a spy
 * threaded into a component, so nothing here passes on a control wired to the
 * wrong action.
 */

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import type { Pod } from '@shared/contracts/events';
import { TEST_IDS } from '../contracts/renderer-view';
import { POD_TAB_OPEN_TEST_ID } from '../pods/PodTab';
import { testId } from '../shell/contract-runtime';
import { ipcError, makeStubPod, stubOrcastrateApi, type StubOrcastrateApi } from '../test-utils';

import { ALPHA_ID, POD_ALPHA, POD_BRAVO, installUnhandledRejectionGuard, mountWorkspace } from './harness';

installUnhandledRejectionGuard();

/** The composer's copy for `disabledReason: 'not-opened'`, verbatim. */
const NOT_OPENED_NOTE = 'This Pod is not running. Open it before sending a message.';

/**
 * A restart: two rows come back from `pods.list`, and NOTHING has opened a
 * process for either. This is the state the session's definition of done never
 * exercised.
 */
function afterRestart(): StubOrcastrateApi {
  return stubOrcastrateApi({
    pods: { list: async () => ({ ok: true, value: [POD_ALPHA, POD_BRAVO] }) },
  });
}

const BEACHED: Pod = makeStubPod({
  id: 'pod-beached',
  title: 'Beached',
  tabOrder: 0,
  status: 'beached',
});

function afterBeaching(): StubOrcastrateApi {
  return stubOrcastrateApi({
    pods: { list: async () => ({ ok: true, value: [BEACHED] }) },
  });
}

/** The run control for one Pod, or null when the app offers none. */
function runControl(podId: string): HTMLElement | null {
  return screen.queryByTestId(testId(POD_TAB_OPEN_TEST_ID, podId));
}

describe('starting a listed Pod that has no process', () => {
  it('offers a keyboard-operable button that calls openPod exactly once, with that Pod id', async () => {
    const user = userEvent.setup();
    const api = afterRestart();
    mountWorkspace(api);

    const control = await screen.findByTestId(testId(POD_TAB_OPEN_TEST_ID, ALPHA_ID));
    // A semantic button, labelled in words — the accessibility floor. Colour
    // carries none of this.
    expect(control.tagName).toBe('BUTTON');
    expect(control.getAttribute('aria-label')).toBe(`Open ${POD_ALPHA.title}`);
    expect(control.textContent).toBe('Open');

    // Operated by keyboard alone, not by pointer.
    control.focus();
    expect(document.activeElement).toBe(control);
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(api.calls.podOpen).toEqual([[ALPHA_ID]]);
    });
    expect(api.calls.podReconnect).toEqual([]);
  });

  it('calls reconnectPod, not openPod, for a beached Pod', async () => {
    const user = userEvent.setup();
    const api = afterBeaching();
    mountWorkspace(api);

    const control = await screen.findByTestId(testId(POD_TAB_OPEN_TEST_ID, BEACHED.id));
    expect(control.textContent).toBe('Reconnect');
    await user.click(control);

    await waitFor(() => {
      expect(api.calls.podReconnect).toEqual([[BEACHED.id]]);
    });
    // The whole point of the branch: `pods.open` answers a beached Pod with an
    // error, so calling it here would be the wrong verb.
    expect(api.calls.podOpen).toEqual([]);
  });

  it('offers no run control at all once the Pod is open', async () => {
    const user = userEvent.setup();
    const api = afterRestart();
    mountWorkspace(api);

    await user.click(await screen.findByTestId(testId(POD_TAB_OPEN_TEST_ID, ALPHA_ID)));

    await waitFor(() => {
      expect(runControl(ALPHA_ID)).toBeNull();
    });
    // Not merely hidden: there is no second call to reach.
    expect(api.calls.podOpen).toEqual([[ALPHA_ID]]);
    // The Pod is still listed, and its tab still selects it.
    expect(screen.getByTestId(testId(TEST_IDS.podTab, ALPHA_ID))).toBeDefined();
  });

  it('keeps the Pod listed and shows the failure verbatim when the open fails', async () => {
    const user = userEvent.setup();
    const api = afterRestart();
    api.failInvoke('podOpen', ipcError('SPAWN_FAILED', 'the CLI could not be started'));
    mountWorkspace(api);

    await user.click(await screen.findByTestId(testId(POD_TAB_OPEN_TEST_ID, ALPHA_ID)));

    // Whatever main wrote, word for word — no wrapper sentence around it.
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('the CLI could not be started');

    // The row survives, the control survives, and the app is still driveable:
    // a second attempt reaches IPC.
    expect(screen.getByTestId(testId(TEST_IDS.podTab, ALPHA_ID))).toBeDefined();
    const control = runControl(ALPHA_ID);
    expect(control).not.toBeNull();
    expect(screen.getByTestId('composer-disabled-note').textContent).toContain(NOT_OPENED_NOTE);

    api.clearInvokeFailure('podOpen');
    await user.click(control as HTMLElement);
    await waitFor(() => {
      expect(api.calls.podOpen).toEqual([[ALPHA_ID], [ALPHA_ID]]);
    });
    // The unhandled-rejection guard installed above asserts the rest.
  });

  it('drives a restarted workspace from an unopened Pod to a sendable composer', async () => {
    const user = userEvent.setup();
    const api = afterRestart();
    mountWorkspace(api);

    // The restart state itself: a listed Pod, no process, composer disabled
    // with the sentence that sends the user looking for a control.
    await screen.findByTestId(testId(TEST_IDS.podTab, ALPHA_ID));
    expect(screen.getByTestId('composer-disabled-note').textContent).toContain(NOT_OPENED_NOTE);
    expect(screen.getByTestId(TEST_IDS.composerSend).hasAttribute('disabled')).toBe(true);
    expect(api.calls.podOpen).toEqual([]);

    await user.click(await screen.findByTestId(testId(POD_TAB_OPEN_TEST_ID, ALPHA_ID)));

    // `disabledReason: 'not-opened'` is gone, and with it the note.
    await waitFor(() => {
      expect(screen.queryByTestId('composer-disabled-note')).toBeNull();
    });
    expect(screen.queryByText(NOT_OPENED_NOTE)).toBeNull();

    // End to end: the composer now accepts input and the message reaches IPC.
    await user.type(screen.getByTestId(TEST_IDS.composerInput), 'hello');
    await user.click(screen.getByTestId(TEST_IDS.composerSend));

    await waitFor(() => {
      expect(api.calls.podSend).toEqual([[ALPHA_ID, 'hello']]);
    });
  });
});
