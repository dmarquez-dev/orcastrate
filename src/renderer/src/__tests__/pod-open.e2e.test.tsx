// @vitest-environment jsdom
/**
 * THE RESTART PATH (T9).
 *
 * `pods.list` restores Pod ROWS; it does not restore PROCESSES. A Pod that no
 * runner is behind comes back `status: 'closed'`, `opened` is DERIVED from that
 * status, and its composer is disabled reading "This Pod is not running. Open
 * it before sending a message." The frozen contract has declared
 * `openPod`/`reconnectPod` since Gate 2 and the state layer implements both —
 * but until this task no component called either, so that sentence named an
 * affordance the app did not have.
 *
 * SINCE THE `PodStatus` WIDENING THERE ARE TWO NOT-OPEN STATES, and telling
 * them apart is this file's second subject. `'closed'` means no process and no
 * recorded cause, so the way back in is `Open`; `'beached'` means a process
 * that stopped for a reason worth keeping, so the way back in is `Reconnect`
 * against the stored session id. Sending a beached Pod to `Open` would discard
 * the resume; sending a closed Pod to `Reconnect` would ask main to resume a
 * session that was never lost. The pair is therefore driven from ONE fixture
 * below, so neither verb can be produced by a renderer answering a constant.
 *
 * Every test here mounts the assembled app through the shared harness and
 * drives it as a user would: by the run control's `data-testid`, by role, and
 * by visible text. The assertions are on `api.calls.podOpen` /
 * `api.calls.podReconnect` — the IPC the actions issue — rather than on a spy
 * threaded into a component, so nothing here passes on a control wired to the
 * wrong action.
 */

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import type { Pod } from '@shared/contracts/events';
import { TEST_IDS } from '../contracts/renderer-view';
import { POD_TAB_OPEN_TEST_ID, POD_TAB_STOP_TEST_ID } from '../pods/PodTab';
import { BEACHED_CAUSE } from '../pods/run-control';
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

/**
 * The OTHER not-open state, listed beside the beached one so the two are
 * distinguished within a single reply rather than across two fixtures.
 */
const CLOSED: Pod = makeStubPod({
  id: 'pod-closed',
  title: 'Closed',
  tabOrder: 1,
  status: 'closed',
});

/**
 * One `pods.list` carrying both not-open states. Neither Pod is open, so a
 * renderer that decided openness alone would answer identically for both; only
 * a renderer reading `status` can offer `Reconnect` for one and `Open` for the
 * other.
 */
function afterBeaching(): StubOrcastrateApi {
  return stubOrcastrateApi({
    pods: { list: async () => ({ ok: true, value: [BEACHED, CLOSED] }) },
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
    // THE VERB MOVED OFF THE FACE OF THE CONTROL. Both run verbs now draw the
    // same PLAY glyph — the icon says "this will run" — so which verb it is,
    // and why, is carried by the accessible name and by `data-verb`. Asserting
    // the glyph here instead would pin the decoration and drop the meaning.
    expect(control.getAttribute('data-verb')).toBe('open');
    expect(within(control).getByText('▶').getAttribute('data-icon')).toBe('play');

    // Operated by keyboard alone, not by pointer.
    control.focus();
    expect(document.activeElement).toBe(control);
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(api.calls.podOpen).toEqual([[ALPHA_ID]]);
    });
    expect(api.calls.podReconnect).toEqual([]);
  });

  it('calls reconnectPod for the beached Pod and openPod for the closed one, from the same list reply', async () => {
    const user = userEvent.setup();
    const api = afterBeaching();
    mountWorkspace(api);

    // Both not-open states offer a control, and the two controls say DIFFERENT
    // words — which is the only way a user learns that one Pod is resumable and
    // the other simply is not running.
    const beachedControl = await screen.findByTestId(testId(POD_TAB_OPEN_TEST_ID, BEACHED.id));
    const closedControl = await screen.findByTestId(testId(POD_TAB_OPEN_TEST_ID, CLOSED.id));
    expect(beachedControl.getAttribute('data-verb')).toBe('reconnect');
    expect(closedControl.getAttribute('data-verb')).toBe('open');
    // The beached control's name carries the CAUSE, which is the one place a
    // keyboard user hears it — the tab's status line is read separately.
    // Joined from the exported clause rather than retyped, so the assertion
    // compares the app against its producer and not against itself.
    expect(beachedControl.getAttribute('aria-label')).toBe(
      `Reconnect ${BEACHED.title}${BEACHED_CAUSE}`,
    );
    expect(closedControl.getAttribute('aria-label')).toBe(`Open ${CLOSED.title}`);
    // Same glyph on both, which is exactly why the names have to differ.
    expect(within(beachedControl).getByText('▶')).toBeDefined();
    expect(within(closedControl).getByText('▶')).toBeDefined();

    await user.click(beachedControl);
    await waitFor(() => {
      expect(api.calls.podReconnect).toEqual([[BEACHED.id]]);
    });
    // `reconnectPod` disposes before starting; `openPod` returns an already
    // live Pod untouched. Routing beached to the verb that disposes first is
    // the reason the split survives, so calling `pods.open` here would be the
    // wrong verb even though main would have accepted it.
    expect(api.calls.podOpen).toEqual([]);

    // ...and the closed Pod takes the other branch, in the same mount, so the
    // routing cannot have come from a single constant.
    await user.click(closedControl);
    await waitFor(() => {
      expect(api.calls.podOpen).toEqual([[CLOSED.id]]);
    });
    expect(api.calls.podReconnect).toEqual([[BEACHED.id]]);
  });

  it('shows the beached composer reason for the beached Pod and the not-opened one for the closed Pod', async () => {
    const user = userEvent.setup();
    const api = afterBeaching();
    mountWorkspace(api);

    // The beached Pod is leftmost and therefore active first. It is ALSO not
    // open, so a ladder that checked openness before beaching would say
    // "not running. Open it" here and send the user to the wrong affordance.
    await screen.findByTestId(testId(TEST_IDS.podTab, BEACHED.id));
    const beachedNote = screen.getByTestId('composer-disabled-note').textContent ?? '';
    expect(beachedNote).not.toContain(NOT_OPENED_NOTE);

    await user.click(screen.getByTestId(testId(TEST_IDS.podTab, CLOSED.id)));
    await waitFor(() => {
      expect(screen.getByTestId('composer-disabled-note').textContent).toContain(NOT_OPENED_NOTE);
    });
    // Two not-open Pods, two different sentences, one reply.
    expect(screen.getByTestId('composer-disabled-note').textContent).not.toBe(beachedNote);
  });

  it('replaces the run control with the stop control once the Pod is open, and drops the delete control', async () => {
    const user = userEvent.setup();
    const api = afterRestart();
    mountWorkspace(api);

    await user.click(await screen.findByTestId(testId(POD_TAB_OPEN_TEST_ID, ALPHA_ID)));

    await waitFor(() => {
      expect(runControl(ALPHA_ID)).toBeNull();
    });
    // Not merely hidden: there is no second call to reach.
    expect(api.calls.podOpen).toEqual([[ALPHA_ID]]);
    // ONE ELEMENT, TWO MODES. The run control did not vanish — it became the
    // stop control, which is what keeps a keyboard user's focus in place when
    // the Pod starts under them.
    const stop = screen.getByTestId(testId(POD_TAB_STOP_TEST_ID, ALPHA_ID));
    expect(stop.getAttribute('data-verb')).toBe('stop');
    expect(within(stop).getByText('❚❚').getAttribute('data-icon')).toBe('pause');
    // The NAME is asserted only as far as this fixture can carry it: the
    // default stub's `pods.open` answers with a freshly defaulted row, so the
    // title on screen after opening is the stub's and not Alpha's. The
    // verbatim accessible names are pinned in `wording.e2e.test.tsx`, against
    // a reply that keeps the Pod it was given.
    expect(stop.getAttribute('aria-label')?.startsWith('Stop ')).toBe(true);
    // ...and an opened Pod is never one click from deletion.
    expect(screen.queryByTestId(testId('pod-tab-delete', ALPHA_ID))).toBeNull();
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
