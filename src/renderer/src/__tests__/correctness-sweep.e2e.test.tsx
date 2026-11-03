// @vitest-environment jsdom
/**
 * The renderer half of session 2026-09-04-orcastrate-correctness-sweep, proved
 * end to end (T6).
 *
 * FOUR CORRECTIONS, FOUR QUESTIONS, ONE ASSEMBLED APP. Sections 4, 5, 6 and 7
 * of `contracts/correctness-sweep.ts` each changed WHERE something appears or
 * WHETHER it appears, never a type and never a capability. A defect about
 * placement can only be proved on the assembled screen, so everything below is
 * driven through the real `PanelStore`, the real `WorkspaceProvider`, the real
 * `App` shell and the real connected panels, with only the preload bridge
 * stubbed. Nothing here renders a component in isolation, stubs the store, or
 * asserts on the text of a constant instead of on what a user would meet.
 *
 * THE FOUR, and the contract property each one pins:
 *
 *   1. A FAILED COMPARE FOLLOWED BY A FAILED SAVE (section 4, Q1+Q3). The
 *      panel used to hold a one-way `compareRequested` flag. Once a comparison
 *      had failed, `incoming` stayed null and the flag stayed true, so every
 *      LATER unrelated failure was routed into the comparison surface. The
 *      user was told their comparison failed when what failed was their save.
 *   2. A FAILED `helm:scopes` (section 6, U1). That one failure sets BOTH
 *      `Loadable.error` and `actionError` to the same sentence, and the banner
 *      printed it twice, which reads as two separate failures.
 *   3. THE COMPARISON'S EMPTY STATE (section 5, S1). It instructed the reader
 *      to press "Compare with the file on disk" — a control that exists only
 *      on the conflict banner, while the comparison surface appears whenever
 *      there is a draft. With a draft and no conflict it pointed at nothing.
 *   4. A BEACHCOMBER ROW WHOSE PATH IS A GUESS (section 7, V1). The path was
 *      rendered above the notice saying the path was a guess, so a reader —
 *      and a screen reader — met the guess as a fact and learned it was a
 *      guess only afterwards, next to a delete button.
 *
 * WHY THE ASSERTIONS ARE ON THE SCREEN AND NOT ON `COPY`. Test 3 in particular
 * could have been written as `expect(COPY.comparisonEmpty).not.toContain(...)`,
 * and that would have proved nothing: the defect was never that the constant
 * held a particular string, it was that the sentence on screen named an
 * affordance that was not on screen beside it. So the test reads the rendered
 * empty state and the rendered controls, and compares those two.
 *
 * ISOLATION: every test builds its own stub api and mounts its own tree.
 * Nothing is shared but frozen constants and pure helpers, so the tests pass
 * in any order and each leaves nothing behind. No sleep, no wall clock, no
 * time zone, no port: every wait is on a condition.
 */

import { screen, waitFor, within } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import type { HelmScopeId } from '@shared/contracts/helm';
import { PANEL_TEST_IDS, type PanelKey } from '../contracts/renderer-panels';
import { TEST_IDS } from '../contracts/renderer-view';
import { testId } from '../shell/contract-runtime';
import { COPY } from '../helm/copy';
import { HELM_SAFETY_TEST_IDS } from '../helm/test-ids';
import { ipcError, stubOrcastrateApi, type StubOrcastrateApi } from '../test-utils';

import { flushPendingWork, installUnhandledRejectionGuard, mountWorkspace } from './harness';

installUnhandledRejectionGuard();

// ---------------------------------------------------------------------------
// Fixtures and helpers
// ---------------------------------------------------------------------------

/** The scope every Helm test opens. One scope, so "same scope" is unambiguous. */
const SCOPE: HelmScopeId = 'user';

/** What the user types, to make a draft exist. Unlike the fixture's model. */
const TYPED_MODEL = 'claude-opus-4-9';

/**
 * Three distinct sentences, so an assertion can never be satisfied by the
 * wrong one. Each is what main would have written, printed verbatim.
 */
const CONFLICT_MESSAGE =
  'The file changed on disk since Helm read it, so nothing was written.';
const COMPARE_FAILURE = 'EACCES: permission denied, reading the file for the comparison';
const SAVE_FAILURE = 'ENOSPC: no space left on device, writing the settings file';
const SCOPES_FAILURE = 'EPERM: operation not permitted, listing the settings files';

/**
 * The entry in the default stub scan whose `pathSource` is `'decoded-name'` —
 * the only kind of row section 7 is about — and the path it displays.
 */
const DECODED_ENTRY_ID = 'entry-projects-decoded';
const DECODED_DISPLAY_PATH = 'C:\\stub\\repos\\dir-ect';

/** `delay: null` because a keystroke delay is a sleep, and sleeps are banned. */
function fastUser(): UserEvent {
  return userEvent.setup({ delay: null });
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

function helmPanel(): HTMLElement {
  return screen.getByTestId(PANEL_TEST_IDS.helmPanel);
}

/**
 * Open Helm on `SCOPE` with `TYPED_MODEL` typed in, so there is a draft — and
 * therefore a comparison surface, which rides with the draft.
 */
async function openHelmWithDraft(user: UserEvent, api: StubOrcastrateApi): Promise<void> {
  await mountWithPanel(user, api, 'helm');
  await chooseScope(user, SCOPE);
  const field = screen.getByTestId(PANEL_TEST_IDS.helmModel) as HTMLInputElement;
  await user.clear(field);
  await user.type(field, TYPED_MODEL);
  await flushPendingWork();
  // The comparison surface exists only while a draft does. If this ever
  // stopped holding, every assertion below about WHERE a message landed would
  // be about a surface that was not on the screen at all.
  expect(within(helmPanel()).getByTestId(HELM_SAFETY_TEST_IDS.comparison)).toBeDefined();
}

/**
 * How many elements on `root` print `sentence` as their own text. Counting
 * rather than asserting presence is the whole point for sections 4 and 6: the
 * defect in both was a sentence appearing in TWO places, and a `getByText`
 * that found the first one would have been green throughout.
 */
function timesPrinted(root: HTMLElement, sentence: string): number {
  return within(root).queryAllByText(sentence).length;
}

/** True when `first` precedes `second` in document order. */
function precedes(first: Node, second: Node): boolean {
  return (first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
}

// ---------------------------------------------------------------------------
// 1. A failure lands on exactly one surface, and it is the right one
//    (contract section 4: Q1, Q2, Q3)
// ---------------------------------------------------------------------------

describe('a failure after a failed comparison is attributed to the action that failed', () => {
  it('shows a failed save in the error banner and not in the comparison surface when a comparison failed first', async () => {
    const user = fastUser();
    const api = stubOrcastrateApi();

    await openHelmWithDraft(user, api);

    // A conflict first, because the Compare control lives on the conflict
    // banner and nowhere else. This save is not the one under test.
    api.failInvoke('helmSave', ipcError('CONFLICT', CONFLICT_MESSAGE));
    await user.click(screen.getByTestId(PANEL_TEST_IDS.helmSave));
    await flushPendingWork();
    const conflictBanner = await screen.findByTestId(PANEL_TEST_IDS.helmConflict);

    // Q2: a comparison is asked for, and it fails. Its message belongs to the
    // comparison surface, and this half must survive the fix.
    api.failInvoke('helmLoad', ipcError('IO', COMPARE_FAILURE));
    await user.click(within(conflictBanner).getByTestId(HELM_SAFETY_TEST_IDS.compare));
    await flushPendingWork();

    const comparison = within(helmPanel()).getByTestId(HELM_SAFETY_TEST_IDS.comparison);
    expect(within(comparison).getByText(COMPARE_FAILURE)).toBeDefined();
    expect(timesPrinted(helmPanel(), COMPARE_FAILURE)).toBe(1);

    // Q3, THE DEFECT. A later, unrelated failure: the save the user asks for
    // next is refused for a reason that has nothing to do with the comparison.
    api.failInvoke('helmSave', ipcError('IO', SAVE_FAILURE));
    await user.click(screen.getByTestId(PANEL_TEST_IDS.helmSave));
    await flushPendingWork();

    const banner = await screen.findByTestId(PANEL_TEST_IDS.helmError);
    expect(within(banner).getByText(SAVE_FAILURE)).toBeDefined();

    // NOT in the comparison surface — which is the whole item — and Q1:
    // exactly once anywhere on the panel, so it is on one surface and not two.
    const comparisonAfter = within(helmPanel()).getByTestId(HELM_SAFETY_TEST_IDS.comparison);
    expect(within(comparisonAfter).queryByText(SAVE_FAILURE)).toBeNull();
    expect(timesPrinted(helmPanel(), SAVE_FAILURE)).toBe(1);

    // And the comparison surface has let go of the message it used to hold:
    // it is back to its empty state rather than still showing a stale failure.
    expect(
      within(comparisonAfter).getByTestId(HELM_SAFETY_TEST_IDS.comparisonEmpty),
    ).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// 2. One failure reads as one failure  (contract section 6: U1)
// ---------------------------------------------------------------------------

describe('a failed scope listing prints its sentence once', () => {
  it('prints the helm scope-listing failure exactly once on the panel when it sets both the load error and the action error', async () => {
    const user = fastUser();
    const api = stubOrcastrateApi();

    // Armed BEFORE the panel opens, because the scope list is fetched by
    // opening the panel — this is the panel's own first read failing.
    api.failInvoke('helmScopes', ipcError('IO', SCOPES_FAILURE));
    await mountWithPanel(user, api, 'helm');

    const banner = await screen.findByTestId(PANEL_TEST_IDS.helmError);
    expect(within(banner).getByText(SCOPES_FAILURE)).toBeDefined();

    // ONE failure, ONE sentence. It used to print twice — `Loadable.error` and
    // `actionError` both carry it — which reads as two separate failures.
    expect(timesPrinted(helmPanel(), SCOPES_FAILURE)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 3. The empty state names nothing the user cannot reach
//    (contract section 5: S1)
// ---------------------------------------------------------------------------

describe('the comparison empty state names no control that is not on screen', () => {
  it('names none of the absent Helm controls in its empty state when a draft is on screen with no conflict', async () => {
    const user = fastUser();
    const api = stubOrcastrateApi();

    await openHelmWithDraft(user, api);

    const panel = helmPanel();
    // The precondition the item turns on: a draft, and therefore a comparison
    // surface, with no conflict — so the conflict banner, the only place the
    // Compare control is rendered, is not on the screen.
    expect(within(panel).queryByTestId(PANEL_TEST_IDS.helmConflict)).toBeNull();
    expect(within(panel).queryByTestId(HELM_SAFETY_TEST_IDS.compare)).toBeNull();

    const emptyState = within(panel).getByTestId(HELM_SAFETY_TEST_IDS.comparisonEmpty);
    const emptyText = emptyState.textContent ?? '';

    // WHAT IS ACTUALLY ON SCREEN, read off the screen rather than assumed.
    const renderedControlText = within(panel)
      .queryAllByRole('button')
      .map((control) => control.textContent ?? '');

    // Every label Helm can put on a control. A label absent from the list
    // above is a label the user cannot press right now, and the empty state
    // may not tell them to press it.
    const absentControlLabels = [COPY.compare, COPY.save, COPY.discard, COPY.reload].filter(
      (label) => !renderedControlText.some((text) => text.includes(label)),
    );

    // Not vacuous, and not broadened: with a draft and no conflict, Compare —
    // which only the conflict banner renders — is the ONE absent control. Were
    // Save, Discard or Reload to vanish, that label would join this list and
    // the loop below would quietly assert over more than the scenario is
    // about; so the list is pinned exactly, and a missing control is named
    // here rather than absorbed.
    expect(
      absentControlLabels,
      'the Helm controls absent with a draft and no conflict are exactly the Compare control',
    ).toEqual([COPY.compare]);
    for (const label of absentControlLabels) {
      expect(emptyText, `the empty state names the unreachable control "${label}"`).not.toContain(
        label,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// 4. The caveat is read before the thing it qualifies  (contract section 7: V1)
// ---------------------------------------------------------------------------

describe('a Beachcomber row whose path could not be verified says so before showing the path', () => {
  it('places the path-not-verified notice before the displayed path in document order for a decoded-name row', async () => {
    const user = fastUser();
    const api = stubOrcastrateApi();

    await mountWithPanel(user, api, 'beachcomber');

    const row = await screen.findByTestId(
      testId(PANEL_TEST_IDS.beachcomberRow, DECODED_ENTRY_ID),
    );
    await waitFor(() => {
      expect(within(row).getByTestId(PANEL_TEST_IDS.beachcomberRowUnverified)).toBeDefined();
    });

    const notice = within(row).getByTestId(PANEL_TEST_IDS.beachcomberRowUnverified);
    // Located by the path the user reads, not by a class name: the ordering
    // that matters is the one between the caveat and the guess it qualifies.
    const path = within(row).getByText(DECODED_DISPLAY_PATH);

    expect(
      precedes(notice, path),
      'the path is announced before the notice that says it is a guess',
    ).toBe(true);
  });
});
