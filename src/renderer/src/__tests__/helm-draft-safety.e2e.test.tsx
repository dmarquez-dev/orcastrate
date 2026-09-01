// @vitest-environment jsdom
/**
 * Draft safety, end to end (session 2026-08-31-orcastrate-helm-draft-safety).
 *
 * ONE QUESTION, ASKED FOUR WAYS: can the user lose what they typed into Helm
 * without being asked? Every way the app could throw a draft away is driven
 * here through the assembled app — the real `PanelStore`, the real
 * `WorkspaceProvider`, the real `App` shell and the real `ConnectedHelmPanel`,
 * with only the preload bridge stubbed. Nothing below renders a component in
 * isolation, stubs the store, or reads state that is not on screen: the whole
 * point of this suite is that the four pieces AGREE, and a suite that mocked
 * any of them would assert only that the mock was configured.
 *
 * THE FOUR WAYS, and where each is proved:
 *
 *   1. A RELOAD THAT FAILS. `panel-store.ts` used to clear `document` and
 *      `draft` on every failed load. It now clears only when the load was
 *      CHANGING SCOPE; a failed read of the scope already open wrote nothing,
 *      so there is nothing for the draft to be stale against and both are
 *      kept.
 *   2. A SAVE REJECTED WITH `CONFLICT`. The draft survives — and `compare()`,
 *      offered on the conflict banner, fetches the file's current contents
 *      WITHOUT replacing the draft, which is the side-by-side `helm.ts` has
 *      promised since it froze.
 *   3. CLOSING THE PANEL. The shell cannot ask whether the draft is dirty, so
 *      the panel registers an objection and owns the dialog that raises it.
 *      A clean draft is never asked about.
 *   4. SWITCHING PANELS. A switch is a close plus an open, and the draft has
 *      to survive the close half. Declining leaves Helm open AND leaves
 *      Beachcomber unopened — the shell must not close the old panel and then
 *      decline to open the new one.
 *
 * WHY THE ASSERTIONS ARE ALWAYS ON A TYPED VALUE. Every draft-survival check
 * below reads back a model string the test itself typed, never the fixture's
 * seeded value. An assertion against the seeded value would pass whether the
 * store retained the draft or re-seeded it from a fresh load, and would
 * therefore test nothing at all.
 *
 * ISOLATION: every test builds its own stub api and mounts its own tree.
 * Nothing is shared but frozen constants and pure helpers, so the tests pass
 * in any order and each leaves nothing behind.
 */

import { screen, waitFor, within } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import type { HelmDocument, HelmScopeId } from '@shared/contracts/helm';
import { PANEL_TEST_IDS, type PanelKey } from '../contracts/renderer-panels';
import { TEST_IDS } from '../contracts/renderer-view';
import { testId } from '../shell/contract-runtime';
import { HELM_SAFETY_TEST_IDS, comparisonCellId } from '../helm/test-ids';
import {
  ipcError,
  makeStubHelmDocument,
  stubOrcastrateApi,
  type StubOrcastrateApi,
} from '../test-utils';

import { flushPendingWork, installUnhandledRejectionGuard, mountWorkspace } from './harness';

installUnhandledRejectionGuard();

// ---------------------------------------------------------------------------
// Fixtures and helpers
// ---------------------------------------------------------------------------

/** The scope every test opens. One scope, so "same scope" is unambiguous. */
const SCOPE: HelmScopeId = 'user';

/** What the user types. Deliberately unlike the fixture's seeded model. */
const TYPED_MODEL = 'claude-opus-4-9';

/** What someone else wrote to the file while the user was typing. */
const DISK_MODEL = 'claude-haiku-4-5';

const CONFLICT_MESSAGE =
  'The file changed on disk since Helm read it, so nothing was written.';

/** `delay: null` because a keystroke delay is a sleep, and sleeps are banned. */
function fastUser(): UserEvent {
  return userEvent.setup({ delay: null });
}

/**
 * A stub whose `helm.load` answers with the seeded document the FIRST time and
 * with a document someone else has since edited every time after.
 *
 * That split is what gives `compare()` something to show: the first load seeds
 * the draft, and the read `compare()` makes is the second. Written as an
 * override rather than as `failInvoke`, because the file changing underneath
 * is a SUCCESS, not a failure.
 */
function apiWithChangedDisk(): StubOrcastrateApi {
  let loads = 0;
  return stubOrcastrateApi({
    helm: {
      load: async (scopeId: HelmScopeId) => {
        loads += 1;
        const seeded = makeStubHelmDocument(scopeId);
        const value: HelmDocument =
          loads === 1
            ? seeded
            : makeStubHelmDocument(scopeId, {
                managed: { ...seeded.managed, model: DISK_MODEL },
              });
        return { ok: true as const, value };
      },
    },
  });
}

/** Mount the assembled app and open `key` from the panel bar. */
async function mountWithPanel(
  user: UserEvent,
  api: StubOrcastrateApi,
  key: PanelKey,
): Promise<void> {
  mountWorkspace(api);
  await screen.findByTestId(TEST_IDS.workspace);
  await user.click(await screen.findByTestId(testId(PANEL_TEST_IDS.panelBarOpen, key)));
  await flushPendingWork();
}

/** Choose a Helm scope. It is a `<select>` change, which no click reaches. */
async function chooseScope(user: UserEvent, scopeId: HelmScopeId): Promise<void> {
  await user.selectOptions(
    screen.getByTestId(PANEL_TEST_IDS.helmScopeSelect),
    screen.getByTestId(testId(PANEL_TEST_IDS.helmScopeOption, scopeId)),
  );
  await flushPendingWork();
}

function modelField(): HTMLInputElement {
  return screen.getByTestId(PANEL_TEST_IDS.helmModel) as HTMLInputElement;
}

/** Replace the model with `value`, which is what makes the draft dirty. */
async function typeModel(user: UserEvent, value: string): Promise<void> {
  const field = modelField();
  await user.clear(field);
  await user.type(field, value);
  await flushPendingWork();
}

/**
 * Open Helm on `SCOPE` with `TYPED_MODEL` typed in. The starting position for
 * every test that needs something to lose.
 */
async function openHelmWithDirtyDraft(user: UserEvent, api: StubOrcastrateApi): Promise<void> {
  await mountWithPanel(user, api, 'helm');
  await chooseScope(user, SCOPE);
  await typeModel(user, TYPED_MODEL);
  // Dirty is what arms the guard, and Discard is enabled by exactly that. If
  // this ever passed while the draft were clean, every "the confirmation was
  // raised" assertion below would be about a dialog that could not appear.
  expect((screen.getByTestId(PANEL_TEST_IDS.helmDiscard) as HTMLButtonElement).disabled).toBe(
    false,
  );
}

// ---------------------------------------------------------------------------
// 1. A failed read must not cost the user their edit
// ---------------------------------------------------------------------------

describe('a failed reload of the open scope leaves the typed draft on screen', () => {
  it('keeps the typed model and shows the read failure when a same-scope reload fails', async () => {
    const user = fastUser();
    const api = stubOrcastrateApi();

    await openHelmWithDirtyDraft(user, api);

    api.failInvoke('helmLoad', ipcError('IO', 'EACCES: permission denied, open'));
    await user.click(screen.getByTestId(PANEL_TEST_IDS.helmReload));
    await flushPendingWork();

    // The failure is reported...
    const error = await screen.findByTestId(PANEL_TEST_IDS.helmError);
    expect(within(error).getByText('EACCES: permission denied, open')).toBeDefined();

    // ...and the edit the read never touched is still on screen, still dirty,
    // and still savable. Reading the field back is the user's own view of it.
    expect(modelField().value).toBe(TYPED_MODEL);
    expect((screen.getByTestId(PANEL_TEST_IDS.helmSave) as HTMLButtonElement).disabled).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 2. A rejected save, and the comparison it makes possible
// ---------------------------------------------------------------------------

describe('a save rejected with CONFLICT keeps the draft and can be compared against disk', () => {
  it('keeps the typed model on screen when the save is rejected with CONFLICT', async () => {
    const user = fastUser();
    const api = apiWithChangedDisk();

    await openHelmWithDirtyDraft(user, api);

    api.failInvoke('helmSave', ipcError('CONFLICT', CONFLICT_MESSAGE));
    await user.click(screen.getByTestId(PANEL_TEST_IDS.helmSave));
    await flushPendingWork();

    const banner = await screen.findByTestId(PANEL_TEST_IDS.helmConflict);
    expect(within(banner).getByText(CONFLICT_MESSAGE)).toBeDefined();
    // Nothing was written, so nothing typed is gone.
    expect(modelField().value).toBe(TYPED_MODEL);
  });

  it('shows the on-disk model beside the typed model when Compare is pressed on the conflict banner', async () => {
    const user = fastUser();
    const api = apiWithChangedDisk();

    await openHelmWithDirtyDraft(user, api);

    api.failInvoke('helmSave', ipcError('CONFLICT', CONFLICT_MESSAGE));
    await user.click(screen.getByTestId(PANEL_TEST_IDS.helmSave));
    await flushPendingWork();

    const banner = await screen.findByTestId(PANEL_TEST_IDS.helmConflict);
    await user.click(within(banner).getByTestId(HELM_SAFETY_TEST_IDS.compare));
    await flushPendingWork();

    const table = await screen.findByTestId(HELM_SAFETY_TEST_IDS.comparisonTable);
    // BOTH HALVES, IN ONE PLACE. The disk column carries what the second read
    // returned; the draft column still carries what the user typed. Asserting
    // only one of them would not distinguish a comparison from a reload.
    expect(
      within(table).getByTestId(comparisonCellId(HELM_SAFETY_TEST_IDS.comparisonDisk, 'model'))
        .textContent,
    ).toBe(DISK_MODEL);
    expect(
      within(table).getByTestId(comparisonCellId(HELM_SAFETY_TEST_IDS.comparisonDraft, 'model'))
        .textContent,
    ).toBe(TYPED_MODEL);

    // AND THE FORM ITSELF IS UNTOUCHED. `compare()` is the read that does not
    // replace the working copy; if it had, the field would now say DISK_MODEL.
    expect(modelField().value).toBe(TYPED_MODEL);
  });
});

// ---------------------------------------------------------------------------
// 3. Closing the panel
// ---------------------------------------------------------------------------

describe('closing the Helm panel asks before discarding a dirty draft', () => {
  it('raises the Helm confirmation and keeps the panel open with the typed model when Keep editing is chosen', async () => {
    const user = fastUser();
    const api = stubOrcastrateApi();

    await openHelmWithDirtyDraft(user, api);

    await user.click(screen.getByTestId(PANEL_TEST_IDS.panelBarClose));
    const confirm = await screen.findByTestId(HELM_SAFETY_TEST_IDS.closeConfirm);

    await user.click(within(confirm).getByTestId(HELM_SAFETY_TEST_IDS.closeConfirmKeep));
    await flushPendingWork();

    // The dialog is gone, the panel is not, and the edit is exactly as typed.
    await waitFor(() => {
      expect(screen.queryByTestId(HELM_SAFETY_TEST_IDS.closeConfirm)).toBeNull();
    });
    expect(screen.getByTestId(PANEL_TEST_IDS.helmPanel)).toBeDefined();
    expect(modelField().value).toBe(TYPED_MODEL);
  });

  it('closes the Helm panel when the confirmation is answered Discard changes and close', async () => {
    const user = fastUser();
    const api = stubOrcastrateApi();

    await openHelmWithDirtyDraft(user, api);

    await user.click(screen.getByTestId(PANEL_TEST_IDS.panelBarClose));
    const confirm = await screen.findByTestId(HELM_SAFETY_TEST_IDS.closeConfirm);

    await user.click(within(confirm).getByTestId(HELM_SAFETY_TEST_IDS.closeConfirmDiscard));
    await flushPendingWork();

    await waitFor(() => {
      expect(screen.queryByTestId(PANEL_TEST_IDS.helmPanel)).toBeNull();
    });
    expect(screen.queryByTestId(HELM_SAFETY_TEST_IDS.closeConfirm)).toBeNull();
    // The panel region goes with it: nothing is left half-closed.
    expect(screen.queryByTestId(PANEL_TEST_IDS.panelRegion)).toBeNull();
  });

  it('closes the Helm panel with no confirmation shown when the draft is clean', async () => {
    const user = fastUser();
    const api = stubOrcastrateApi();

    await mountWithPanel(user, api, 'helm');
    await chooseScope(user, SCOPE);
    // The common case: a scope opened and read, nothing typed. Discard being
    // off is the clean draft stated in the app's own terms.
    expect((screen.getByTestId(PANEL_TEST_IDS.helmDiscard) as HTMLButtonElement).disabled).toBe(
      true,
    );

    await user.click(screen.getByTestId(PANEL_TEST_IDS.panelBarClose));

    // Asserted BEFORE the wait, so a dialog that appeared and was then
    // dismissed could not slip through between the two.
    expect(screen.queryByTestId(HELM_SAFETY_TEST_IDS.closeConfirm)).toBeNull();
    await waitFor(() => {
      expect(screen.queryByTestId(PANEL_TEST_IDS.helmPanel)).toBeNull();
    });
    expect(screen.queryByTestId(HELM_SAFETY_TEST_IDS.closeConfirm)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 4. Switching panels
// ---------------------------------------------------------------------------

describe('switching away from a dirty Helm draft asks before discarding it', () => {
  it('raises the Helm confirmation and leaves Helm open with Beachcomber unopened when Keep editing is chosen', async () => {
    const user = fastUser();
    const api = stubOrcastrateApi();

    await openHelmWithDirtyDraft(user, api);

    await user.click(screen.getByTestId(testId(PANEL_TEST_IDS.panelBarOpen, 'beachcomber')));
    const confirm = await screen.findByTestId(HELM_SAFETY_TEST_IDS.closeConfirm);

    await user.click(within(confirm).getByTestId(HELM_SAFETY_TEST_IDS.closeConfirmKeep));
    await flushPendingWork();

    await waitFor(() => {
      expect(screen.queryByTestId(HELM_SAFETY_TEST_IDS.closeConfirm)).toBeNull();
    });
    // BOTH HALVES OF "THE SWITCH DID NOT HAPPEN". Helm is still open with the
    // edit intact, AND the destination was never opened — the shell must not
    // close the old panel and then decline to open the new one.
    expect(screen.getByTestId(PANEL_TEST_IDS.helmPanel)).toBeDefined();
    expect(modelField().value).toBe(TYPED_MODEL);
    expect(screen.queryByTestId(PANEL_TEST_IDS.beachcomberPanel)).toBeNull();
  });

  it('opens Beachcomber and leaves Helm behind when the switch is answered Discard changes and close', async () => {
    const user = fastUser();
    const api = stubOrcastrateApi();

    await openHelmWithDirtyDraft(user, api);

    await user.click(screen.getByTestId(testId(PANEL_TEST_IDS.panelBarOpen, 'beachcomber')));
    const confirm = await screen.findByTestId(HELM_SAFETY_TEST_IDS.closeConfirm);

    await user.click(within(confirm).getByTestId(HELM_SAFETY_TEST_IDS.closeConfirmDiscard));
    await flushPendingWork();

    expect(await screen.findByTestId(PANEL_TEST_IDS.beachcomberPanel)).toBeDefined();
    expect(screen.queryByTestId(PANEL_TEST_IDS.helmPanel)).toBeNull();
    expect(screen.queryByTestId(HELM_SAFETY_TEST_IDS.closeConfirm)).toBeNull();
  });
});
