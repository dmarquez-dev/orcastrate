// @vitest-environment jsdom
/**
 * The Pod lifecycle as a user reaches it — run, stop, create, delete — driven
 * through the real state layer rather than through a hand-built view model.
 *
 * 1. THE RUN CONTROL ROUTES BY STATUS, NOT BY BUTTON. `PodsChrome` is the only
 *    caller of `openPod`/`reconnectPod` in the renderer, and `runControlFor` is
 *    the only thing that decides which. The reason the split exists is NOT that
 *    a beached Pod is refused — nothing in `src/main/ipc/**` refuses it, and
 *    `onBeached` has already removed the session, so the two calls would be
 *    identical. It exists because `reconnectPod` disposes a stale session where
 *    `openPod` would return it untouched, and because a beached Pod must keep
 *    an affordance carrying its CAUSE (design section 8).
 *
 * 2. STOPPING A POD WITH NO LIVE RUNNER IS BENIGN. Symptom 3 of the session —
 *    "the tab's x refuses with a not-running error" — is NOT reproducible from
 *    the code: `PodsChrome` calls `actions.closePod`, which invokes `pod:close`,
 *    which reaches `PodManager.closePod`, and that method throws only
 *    `NOT_FOUND`. No fix is invented here. What is added is the guard that
 *    proves the benign behaviour, so a future regression that introduces the
 *    refusal fails loudly instead of arriving as a bug report. A stopped Pod no
 *    longer offers the stop control at all, so the dead end is unreachable by
 *    construction as well.
 *
 * 3. CREATE MAKES A ROW AND STOPS. Asserted against a recording stub, end to
 *    end through the dialog.
 *
 * 4. DELETE GOES THROUGH A CONFIRMATION. `deletePod` has no other component
 *    caller anywhere in the renderer.
 */

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it } from 'vitest';

import type { DeletePodRequest, PodDeletionResult } from '@shared/contracts/ipc';
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
import { DELETE_POD_TEST_IDS } from './DeletePodDialog';
import { POD_TAB_DELETE_TEST_ID, POD_TAB_OPEN_TEST_ID, POD_TAB_STOP_TEST_ID } from './PodTab';
import { PODS_CHROME_TEST_ID } from './PodsChrome';

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

    const control = await screen.findByTestId(testId(POD_TAB_OPEN_TEST_ID, CLOSED.id));
    expect(control.getAttribute('aria-label')).toBe('Open Closed Pod');
    await user.click(control);

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

    const control = await screen.findByTestId(testId(POD_TAB_OPEN_TEST_ID, BEACHED.id));
    // The CAUSE rides in the name, which is all a keyboard user hears.
    expect(control.getAttribute('aria-label')).toBe('Reconnect Beached Pod, stopped with an error');
    await user.click(control);

    await waitFor(() => {
      expect(api.calls.podReconnect).toEqual([[BEACHED.id]]);
    });
    expect(api.calls.podOpen).toEqual([]);
  });

  it('offers both controls at once, each with its own verb and the same icon', async () => {
    const api = bothSides();
    renderWithWorkspace(<App />, { api });

    const closedControl = await screen.findByTestId(testId(POD_TAB_OPEN_TEST_ID, CLOSED.id));
    const beachedControl = screen.getByTestId(testId(POD_TAB_OPEN_TEST_ID, BEACHED.id));

    expect(closedControl.getAttribute('data-verb')).toBe('open');
    expect(beachedControl.getAttribute('data-verb')).toBe('reconnect');
    // The ICON is shared — it says "this will run" — so the distinction has to
    // live in the name, and does.
    expect(closedControl.querySelector('[data-icon]')?.getAttribute('data-icon')).toBe('play');
    expect(beachedControl.querySelector('[data-icon]')?.getAttribute('data-icon')).toBe('play');
    expect(closedControl.getAttribute('aria-label')).not.toBe(
      beachedControl.getAttribute('aria-label'),
    );

    // Neither was reached by opening anything: the labels come from the listed
    // rows alone.
    expect(api.calls.podOpen).toEqual([]);
    expect(api.calls.podReconnect).toEqual([]);
  });
});

describe('stopping a Pod', () => {
  it('is not offered at all for a Pod that has no live runner', async () => {
    const api = stubOrcastrateApi({
      pods: { list: async () => ({ ok: true, value: [CLOSED] }) },
    });
    renderWithWorkspace(<App />, { api });

    // Present first: the run control IS there, so the absence below is about
    // the stop control and not about an unrendered bar.
    expect(await screen.findByTestId(testId(POD_TAB_OPEN_TEST_ID, CLOSED.id))).toBeDefined();
    expect(screen.queryByTestId(testId(POD_TAB_STOP_TEST_ID, CLOSED.id))).toBeNull();
    expect(screen.queryByLabelText(`Stop ${CLOSED.title}`)).toBeNull();
    expect(api.calls.podClose).toEqual([]);
  });

  it('resolves, keeps the row and the transcript, and says nothing', async () => {
    const user = userEvent.setup();
    const RUNNING = makeStubPod({ id: 'pod-run', title: 'Running Pod', status: 'running' });
    const api = stubOrcastrateApi({
      pods: { list: async () => ({ ok: true, value: [RUNNING] }) },
    });
    renderWithWorkspace(<App />, { api });

    const tab = await screen.findByTestId(testId(TEST_IDS.podTab, RUNNING.id));
    // The transcript is on screen before the stop, so "still there" afterwards
    // is a comparison rather than an assumption.
    expect(await screen.findByTestId(TEST_IDS.transcriptPrimary)).toBeDefined();

    await user.click(screen.getByLabelText(`Stop ${RUNNING.title}`));

    await waitFor(() => {
      expect(api.calls.podClose).toEqual([[RUNNING.id]]);
    });

    // The row survives. `pod:close` stops a process; it does not delete a Pod.
    expect(tab).toBeDefined();
    expect(screen.getByTestId(testId(TEST_IDS.podTab, RUNNING.id))).toBeDefined();
    expect(screen.getByTestId(TEST_IDS.transcriptPrimary)).toBeDefined();

    // Nothing was surfaced to the user, and nothing was deleted.
    expect(screen.queryByRole('alert')).toBeNull();
    expect(document.body.textContent).not.toContain('NOT_RUNNING');
    expect(api.calls.podDelete).toEqual([]);
  });

  it('leaves a closed Pod reading Closed, with the composer naming the way out', async () => {
    const api = stubOrcastrateApi({
      pods: { list: async () => ({ ok: true, value: [CLOSED] }) },
    });
    renderWithWorkspace(<App />, { api });

    const tab = await screen.findByTestId(testId(TEST_IDS.podTab, CLOSED.id));
    // Still `'closed'`, not `'idle'`. Under the widened union `'idle'` means
    // OPEN AND BETWEEN TURNS, so reading idle here would be a lie about a
    // process that is not there.
    expect(tab.textContent).toContain('Closed.');
    expect(tab.textContent).not.toContain('Idle');
    expect(tab.querySelector('[data-status]')?.getAttribute('data-status')).toBe('closed');

    expect(screen.getByTestId('composer-disabled-note').textContent).toContain(
      'This Pod is not running. Open it before sending a message.',
    );
  });
});

/** Fills the New Pod dialog with a valid draft and submits it. */
async function createPod(user: ReturnType<typeof userEvent.setup>, title: string): Promise<void> {
  await user.click(await screen.findByTestId(TEST_IDS.newPodButton));
  await user.type(screen.getByTestId(TEST_IDS.newPodTitleInput), title);
  await user.click(screen.getByTestId(TEST_IDS.newPodBrowseButton));
  await waitFor(() => {
    expect(screen.getByTestId(TEST_IDS.newPodCwdDisplay).textContent).toBe('/stub/workspace');
  });
  await user.click(screen.getByTestId(TEST_IDS.newPodSubmit));
}

describe('creating a Pod does not start a process', () => {
  it('invokes pods.create exactly once and pods.open never', async () => {
    const user = userEvent.setup();
    const api = stubOrcastrateApi({
      pods: { list: async () => ({ ok: true, value: [CLOSED] }) },
    });
    renderWithWorkspace(<App />, { api });

    await createPod(user, 'Fresh Pod');

    await waitFor(() => {
      expect(screen.queryByTestId(TEST_IDS.newPodDialog)).toBeNull();
    });
    expect(api.calls.podCreate.length).toBe(1);
    expect(api.calls.podCreate[0]).toEqual([
      { title: 'Fresh Pod', cwd: '/stub/workspace', permissionMode: 'default', envOverrides: {} },
    ]);
    // THE WHOLE CHANGE, and it is observable: no process was started.
    expect(api.calls.podOpen).toEqual([]);
    expect(api.calls.podReconnect).toEqual([]);
  });

  it('leaves the new Pod active, closed, and one click from running', async () => {
    const user = userEvent.setup();
    const api = stubOrcastrateApi({
      pods: { list: async () => ({ ok: true, value: [CLOSED] }) },
    });
    renderWithWorkspace(<App />, { api });

    await createPod(user, 'Fresh Pod');

    // `pods.create` answers with the default stub id.
    const created = 'pod-1';
    const tab = await screen.findByTestId(testId(TEST_IDS.podTab, created));
    expect(tab.getAttribute('aria-current')).toBe('true');
    expect(tab.querySelector('[data-status]')?.getAttribute('data-status')).toBe('closed');

    const run = screen.getByTestId(testId(POD_TAB_OPEN_TEST_ID, created));
    expect(run.getAttribute('aria-label')).toBe('Open Fresh Pod');
    expect(run.querySelector('[data-icon]')?.getAttribute('data-icon')).toBe('play');
  });

  it('explains itself without a click: the composer says the Pod is not running', async () => {
    const user = userEvent.setup();
    const api = stubOrcastrateApi({
      pods: { list: async () => ({ ok: true, value: [CLOSED] }) },
    });
    renderWithWorkspace(<App />, { api });

    await createPod(user, 'Fresh Pod');

    // Asserted by rendering the workspace AFTER the create, not by unit-testing
    // the composer in isolation: this sentence is now the primary onboarding
    // line for a freshly created Pod, so it has to be on screen already.
    await waitFor(() => {
      expect(screen.getByTestId('composer-disabled-note').textContent).toContain(
        'This Pod is not running. Open it before sending a message.',
      );
    });
    // `readOnly`, not `disabled` — a disabled textarea leaves the keyboard with
    // nowhere to land, so the composer marks itself read-only instead.
    const input = screen.getByTestId(TEST_IDS.composerInput) as HTMLTextAreaElement;
    expect(input.readOnly).toBe(true);
    expect(input.getAttribute('aria-readonly')).toBe('true');
  });

  it('narrows its error path to create-failure, and offers no "Create and open"', async () => {
    const user = userEvent.setup();
    const api = stubOrcastrateApi({
      pods: { list: async () => ({ ok: true, value: [CLOSED] }) },
    });
    api.failInvoke('podCreate', { code: 'CWD_MISSING', message: 'ENOENT: no such directory' });
    renderWithWorkspace(<App />, { api });

    await createPod(user, 'Fresh Pod');

    const dialog = await screen.findByTestId(TEST_IDS.newPodDialog);
    // Open, with the user's input, and main's message verbatim.
    expect(within(dialog).getByRole('alert').textContent).toBe('ENOENT: no such directory');
    expect((screen.getByTestId(TEST_IDS.newPodTitleInput) as HTMLInputElement).value).toBe(
      'Fresh Pod',
    );
    // There is no second branch to report an open failure, because there is no
    // open. And no checkbox that would reintroduce one.
    expect(api.calls.podOpen).toEqual([]);
    expect(within(dialog).queryByLabelText(/Create and open/i)).toBeNull();
  });
});

const DELETABLE = makeStubPod({
  id: 'pod-del',
  title: 'Doomed Pod',
  tabOrder: 0,
  status: 'closed',
  ccSessionId: 'sess-doomed',
});

async function openConfirmation(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(await screen.findByTestId(testId(POD_TAB_DELETE_TEST_ID, DELETABLE.id)));
  await screen.findByTestId(DELETE_POD_TEST_IDS.dialog);
}

describe('deleting a Pod goes through a confirmation', () => {
  it('opens the confirmation and deletes NOTHING until it is confirmed', async () => {
    const user = userEvent.setup();
    const api = stubOrcastrateApi({
      pods: { list: async () => ({ ok: true, value: [DELETABLE] }) },
    });
    renderWithWorkspace(<App />, { api });

    await openConfirmation(user);
    expect(api.calls.podDelete).toEqual([]);
    // It names the Pod and says what goes.
    const dialog = screen.getByTestId(DELETE_POD_TEST_IDS.dialog);
    expect(within(dialog).getByText('Doomed Pod')).toBeDefined();
    expect(
      within(dialog).getByText("This Pod's transcript history is removed permanently."),
    ).toBeDefined();

    await user.click(screen.getByTestId(DELETE_POD_TEST_IDS.cancel));
    expect(api.calls.podDelete).toEqual([]);
    expect(screen.getByTestId(testId(TEST_IDS.podTab, DELETABLE.id))).toBeDefined();
  });

  it('sends deleteSession false when the box is left alone', async () => {
    const user = userEvent.setup();
    const api = stubOrcastrateApi({
      pods: { list: async () => ({ ok: true, value: [DELETABLE] }) },
    });
    renderWithWorkspace(<App />, { api });

    await openConfirmation(user);
    expect((screen.getByTestId(DELETE_POD_TEST_IDS.session) as HTMLInputElement).checked).toBe(
      false,
    );
    await user.click(screen.getByTestId(DELETE_POD_TEST_IDS.confirm));

    await waitFor(() => {
      expect(api.calls.podDelete).toEqual([[{ podId: DELETABLE.id, deleteSession: false }]]);
    });
    // Success closes the dialog and takes the row with it.
    await waitFor(() => {
      expect(screen.queryByTestId(DELETE_POD_TEST_IDS.dialog)).toBeNull();
    });
    expect(screen.queryByTestId(testId(TEST_IDS.podTab, DELETABLE.id))).toBeNull();
  });

  it('sends deleteSession true when the box is checked', async () => {
    const user = userEvent.setup();
    const api = stubOrcastrateApi({
      pods: { list: async () => ({ ok: true, value: [DELETABLE] }) },
    });
    renderWithWorkspace(<App />, { api });

    await openConfirmation(user);
    await user.click(screen.getByTestId(DELETE_POD_TEST_IDS.session));
    await user.click(screen.getByTestId(DELETE_POD_TEST_IDS.confirm));

    await waitFor(() => {
      expect(api.calls.podDelete).toEqual([[{ podId: DELETABLE.id, deleteSession: true }]]);
    });
  });

  it('omits the checkbox entirely for a Pod that never reached its first turn', async () => {
    const user = userEvent.setup();
    const NO_SESSION = makeStubPod({
      id: DELETABLE.id,
      title: DELETABLE.title,
      status: 'closed',
      ccSessionId: null,
    });
    const api = stubOrcastrateApi({
      pods: { list: async () => ({ ok: true, value: [NO_SESSION] }) },
    });
    renderWithWorkspace(<App />, { api });

    await openConfirmation(user);
    const dialog = screen.getByTestId(DELETE_POD_TEST_IDS.dialog);

    // Present first, so the absence is about the checkbox.
    expect(within(dialog).getByText('Doomed Pod')).toBeDefined();
    expect(within(dialog).getByTestId(DELETE_POD_TEST_IDS.confirm)).toBeDefined();
    expect(within(dialog).queryByRole('checkbox')).toBeNull();

    await user.click(screen.getByTestId(DELETE_POD_TEST_IDS.confirm));
    await waitFor(() => {
      expect(api.calls.podDelete).toEqual([[{ podId: NO_SESSION.id, deleteSession: false }]]);
    });
  });

  it('surfaces a failed session removal while showing the Pod itself is gone', async () => {
    const user = userEvent.setup();
    const requests: DeletePodRequest[] = [];
    const api = stubOrcastrateApi({
      pods: {
        list: async () => ({ ok: true, value: [DELETABLE] }),
        delete: async (req: DeletePodRequest) => {
          requests.push(req);
          const value: PodDeletionResult = {
            podId: req.podId,
            podDeleted: true,
            session: 'failed',
            sessionError: 'EBUSY: resource busy or locked',
          };
          return { ok: true, value };
        },
      },
    });
    renderWithWorkspace(<App />, { api });

    await openConfirmation(user);
    await user.click(screen.getByTestId(DELETE_POD_TEST_IDS.session));
    await user.click(screen.getByTestId(DELETE_POD_TEST_IDS.confirm));

    await waitFor(() => {
      expect(requests).toEqual([{ podId: DELETABLE.id, deleteSession: true }]);
    });

    // THE DIALOG STAYS OPEN. A delete that silently does nothing is the worst
    // failure this feature has, so this path is surfaced, never suppressed.
    const dialog = await screen.findByTestId(DELETE_POD_TEST_IDS.dialog);
    const alert = await within(dialog).findByRole('alert');
    expect(alert.textContent).toContain('EBUSY: resource busy or locked');
    expect(alert.textContent).toContain('The Pod itself was deleted.');

    // AT THE SAME MOMENT: the tab is gone from the bar. The Pod really was
    // deleted; only the file survived.
    expect(screen.queryByTestId(testId(TEST_IDS.podTab, DELETABLE.id))).toBeNull();
    // And there is nothing left to confirm.
    expect(within(dialog).queryByTestId(DELETE_POD_TEST_IDS.confirm)).toBeNull();

    await user.click(within(dialog).getByTestId(DELETE_POD_TEST_IDS.cancel));
    expect(screen.queryByTestId(DELETE_POD_TEST_IDS.dialog)).toBeNull();
  });

  it('keeps the Pod and offers Delete again when the call itself fails', async () => {
    const user = userEvent.setup();
    const api = stubOrcastrateApi({
      pods: { list: async () => ({ ok: true, value: [DELETABLE] }) },
    });
    api.failInvoke('podDelete', { code: 'NOT_FOUND', message: 'no Pod with that id' });
    renderWithWorkspace(<App />, { api });

    await openConfirmation(user);
    await user.click(screen.getByTestId(DELETE_POD_TEST_IDS.confirm));

    const dialog = await screen.findByTestId(DELETE_POD_TEST_IDS.dialog);
    const alert = await within(dialog).findByRole('alert');
    expect(alert.textContent).toBe('no Pod with that id');
    // Nothing was deleted, so the action is still offered.
    expect(within(dialog).getByTestId(DELETE_POD_TEST_IDS.confirm)).toBeDefined();
    expect(screen.getByTestId(testId(TEST_IDS.podTab, DELETABLE.id))).toBeDefined();
  });

  it('is the ONLY route to deletePod: no other control reaches it', async () => {
    const user = userEvent.setup();
    const api = stubOrcastrateApi({
      pods: { list: async () => ({ ok: true, value: [DELETABLE] }) },
    });
    renderWithWorkspace(<App />, { api });

    const tab = await screen.findByTestId(testId(TEST_IDS.podTab, DELETABLE.id));
    await user.click(tab);
    await user.click(screen.getByTestId(testId(POD_TAB_OPEN_TEST_ID, DELETABLE.id)));

    // Selecting and running the Pod touched the delete channel not at all.
    expect(api.calls.podDelete).toEqual([]);
    expect(screen.queryByTestId(DELETE_POD_TEST_IDS.dialog)).toBeNull();
  });
});

/**
 * WHERE FOCUS LANDS WHEN THE CONTROL THAT OPENED A DIALOG IS GONE. Both Pod
 * dialogs can remove their own opener: a delete takes the tab, and its delete
 * control, with it; a create makes a Pod active, which unmounts the empty
 * workspace whose control opened New Pod. Focus must not fall to `<body>`.
 */
describe('focus after a dialog removes its own opener', () => {
  it('lands on the Pod chrome after a delete that succeeds', async () => {
    const user = userEvent.setup();
    const api = stubOrcastrateApi({
      pods: { list: async () => ({ ok: true, value: [DELETABLE] }) },
    });
    renderWithWorkspace(<App />, { api });

    await openConfirmation(user);
    await user.click(screen.getByTestId(DELETE_POD_TEST_IDS.confirm));

    await waitFor(() => {
      expect(screen.queryByTestId(DELETE_POD_TEST_IDS.dialog)).toBeNull();
    });
    expect(screen.queryByTestId(testId(TEST_IDS.podTab, DELETABLE.id))).toBeNull();
    expect(document.activeElement).toBe(screen.getByTestId(PODS_CHROME_TEST_ID));
    // Vacuity guard for the line above.
    expect(document.activeElement).not.toBe(document.body);
  });

  it('lands on the Pod chrome after a create opened from the empty workspace', async () => {
    const user = userEvent.setup();
    const api = stubOrcastrateApi();
    renderWithWorkspace(<App />, { api });

    const empty = (await screen.findByText('No Pod open')).closest('section');
    expect(empty).not.toBeNull();
    await user.click(within(empty as HTMLElement).getByRole('button', { name: 'New Pod' }));

    await user.type(screen.getByTestId(TEST_IDS.newPodTitleInput), 'Fresh Pod');
    await user.click(screen.getByTestId(TEST_IDS.newPodBrowseButton));
    await waitFor(() => {
      expect(screen.getByTestId(TEST_IDS.newPodCwdDisplay).textContent).toBe('/stub/workspace');
    });
    await user.click(screen.getByTestId(TEST_IDS.newPodSubmit));

    await waitFor(() => {
      expect(screen.queryByTestId(TEST_IDS.newPodDialog)).toBeNull();
    });
    // The opener is gone: the workspace is no longer empty.
    await waitFor(() => {
      expect(screen.queryByText('No Pod open')).toBeNull();
    });
    expect(document.activeElement).toBe(screen.getByTestId(PODS_CHROME_TEST_ID));
    // Vacuity guard for the line above.
    expect(document.activeElement).not.toBe(document.body);
  });
});
