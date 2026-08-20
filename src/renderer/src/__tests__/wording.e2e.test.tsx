// @vitest-environment jsdom
/**
 * Wording the product depends on, and the permission-mode surface (acceptance
 * criteria 7 and 8).
 *
 * The two strings asserted here are contract constants, not copy this suite
 * invented: `BYPASS_PERMISSIONS_WARNING` and whatever `steerPrefill` produces.
 * Both are compared with `toBe` against the imported value — never by
 * substring, and never against a literal retyped in this file, which would
 * pass while the app and the contract drifted apart together.
 */

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import type { PermissionMode, Pod, PodStatus } from '@shared/contracts/events';
import type { ComposerState } from '../contracts/renderer-state';
import { BYPASS_PERMISSIONS_WARNING, PERMISSION_MODE_OPTIONS, TEST_IDS } from '../contracts/renderer-view';
import { disabledMessage } from '../composer/Composer';
import { steerPrefill } from '../state';
import { testId } from '../shell/contract-runtime';
import { makeStubPod, stubOrcastrateApi, type StubOrcastrateApi } from '../test-utils';

import {
  BRAVO_ID,
  CALF_EARLY,
  CALF_EARLY_ID,
  CALF_LATE,
  CALF_LATE_ID,
  MATRIARCH,
  POD_ALPHA,
  POD_BRAVO,
  flushPendingWork,
  installUnhandledRejectionGuard,
  mountWorkspace,
} from './harness';

installUnhandledRejectionGuard();

// ---------------------------------------------------------------------------
// Criterion 8: exhaustive over the widened PermissionMode union
// ---------------------------------------------------------------------------

/**
 * THE TYPE-LEVEL CHECK. An object literal annotated `Record<PermissionMode, T>`
 * must name every member of the union and may name nothing else, so this line
 * stops compiling the moment a fifth mode is added to `events.ts` or one of the
 * four is removed. That is what makes the runtime assertions below exhaustive
 * rather than a count of four written down twice.
 */
const EVERY_PERMISSION_MODE: Record<PermissionMode, true> = {
  default: true,
  acceptEdits: true,
  plan: true,
  bypassPermissions: true,
};

const ALL_MODES = Object.keys(EVERY_PERMISSION_MODE) as PermissionMode[];

/**
 * A second, weaker type-level statement, recorded for the reader: the array's
 * element type and the union are the same type. It is currently trivial —
 * `PERMISSION_MODE_OPTIONS` is declared `readonly PermissionModeOption[]`, so
 * its `mode` is the union by construction — and it exists to fail if the frozen
 * contract is ever narrowed to a literal tuple that drops a member.
 */
type OptionMode = (typeof PERMISSION_MODE_OPTIONS)[number]['mode'];
type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const OPTIONS_COVER_THE_UNION: Exact<OptionMode, PermissionMode> = true;

describe('PERMISSION_MODE_OPTIONS', () => {
  it('holds exactly the members of the PermissionMode union, once each', () => {
    expect(OPTIONS_COVER_THE_UNION).toBe(true);
    const modes = PERMISSION_MODE_OPTIONS.map((option) => option.mode);
    expect([...modes].sort()).toEqual([...ALL_MODES].sort());
    expect(new Set(modes).size).toBe(modes.length);
  });

  it('renders one option in the New Pod dialog per union member', async () => {
    const user = userEvent.setup();
    mountWorkspace(stubOrcastrateApi());

    await user.click(await screen.findByTestId(TEST_IDS.newPodButton));
    const dialog = await screen.findByTestId(TEST_IDS.newPodDialog);

    for (const mode of ALL_MODES) {
      const option = within(dialog).getByTestId(testId(TEST_IDS.newPodModeOption, mode));
      expect(option.getAttribute('type'), `option for ${mode}`).toBe('radio');
    }
    // No extras, and the count comes from the union rather than from a literal.
    expect(within(dialog).getAllByTestId(/^new-pod-mode:/)).toHaveLength(ALL_MODES.length);
  });
});

// ---------------------------------------------------------------------------
// Criterion 7: BYPASS_PERMISSIONS_WARNING, verbatim, in both places
// ---------------------------------------------------------------------------

/**
 * A main process that answers `open` with the Pod it actually persisted. The
 * default stub's `open` returns a freshly defaulted Pod, which would silently
 * reset `permissionMode` — see T8's report.
 */
function creatingApi(): StubOrcastrateApi {
  let created: Pod | null = null;
  return stubOrcastrateApi({
    pods: {
      list: async () => ({ ok: true, value: created === null ? [] : [created] }),
      create: async (req) => {
        created = makeStubPod({
          id: 'pod-created',
          title: req.title,
          cwd: req.cwd,
          permissionMode: req.permissionMode,
          envOverrides: req.envOverrides ?? {},
        });
        return { ok: true, value: created };
      },
      open: async (podId) => ({
        ok: true,
        value:
          created !== null && created.id === podId
            ? { ...created, status: 'running' }
            : makeStubPod({ id: podId, status: 'running' }),
      }),
    },
  });
}

describe('BYPASS_PERMISSIONS_WARNING', () => {
  it('is the dialog option summary and the created Pod tab badge, word for word', async () => {
    const user = userEvent.setup();
    mountWorkspace(creatingApi());

    await user.click(await screen.findByTestId(TEST_IDS.newPodButton));
    const dialog = await screen.findByTestId(TEST_IDS.newPodDialog);

    // In the option itself, before anything is selected. `getByText` with a
    // string matches the WHOLE normalized text of an element, so this is the
    // verbatim sentence and not a substring of a longer one.
    const summary = within(dialog).getByText(BYPASS_PERMISSIONS_WARNING);
    expect(summary.textContent).toBe(BYPASS_PERMISSIONS_WARNING);

    await user.click(within(dialog).getByTestId(testId(TEST_IDS.newPodModeOption, 'bypassPermissions')));
    expect(screen.getByTestId(TEST_IDS.newPodBypassWarning).textContent).toBe(
      BYPASS_PERMISSIONS_WARNING,
    );

    await user.type(within(dialog).getByTestId(TEST_IDS.newPodTitleInput), 'Danger');
    await user.click(within(dialog).getByTestId(TEST_IDS.newPodBrowseButton));
    await user.click(within(dialog).getByRole('checkbox'));
    await user.click(within(dialog).getByTestId(TEST_IDS.newPodSubmit));

    const badge = await screen.findByTestId(
      testId(TEST_IDS.podTabBypassBadge, 'pod-created'),
    );
    expect(badge.getAttribute('aria-label')).toBe(BYPASS_PERMISSIONS_WARNING);
    expect(badge.textContent).toBe(BYPASS_PERMISSIONS_WARNING);
  });
});

// ---------------------------------------------------------------------------
// Criterion 7: Steer prefills, and sends nothing
// ---------------------------------------------------------------------------

describe('Steer on a Calf lane', () => {
  it('writes steerPrefill output into the composer and sends nothing', async () => {
    const user = userEvent.setup();
    const api = stubOrcastrateApi({
      pods: { list: async () => ({ ok: true, value: [POD_ALPHA, POD_BRAVO] }) },
      lanes: {
        list: async (podId) => ({
          ok: true,
          value: podId === BRAVO_ID ? [MATRIARCH, CALF_EARLY, CALF_LATE] : [],
        }),
      },
    });

    mountWorkspace(api);

    await user.click(await screen.findByTestId(testId(TEST_IDS.podTab, BRAVO_ID)));
    const earlyRow = await screen.findByTestId(testId(TEST_IDS.laneRow, CALF_EARLY_ID));

    // The Calf with no `agentId` has nothing to address, so the affordance is
    // not offered at all.
    const lateRow = screen.getByTestId(testId(TEST_IDS.laneRow, CALF_LATE_ID));
    expect(within(lateRow).queryByTestId(TEST_IDS.laneRowSteer)).toBeNull();

    await user.click(within(earlyRow).getByTestId(TEST_IDS.laneRowSteer));
    await flushPendingWork();

    const expected = steerPrefill(CALF_EARLY);
    expect(expected).not.toBeNull();
    expect((screen.getByTestId(TEST_IDS.composerInput) as HTMLTextAreaElement).value).toBe(expected);
    // Prefill and nothing else: no send, no new protocol.
    expect(api.calls.podSend).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Symptom 2: the composer sentence for a closed Pod, pinned verbatim
// ---------------------------------------------------------------------------

/**
 * THE COPY IS NOT REWRITTEN BY THIS SESSION, AND THAT IS THE POINT.
 *
 * "This Pod is not running. Open it before sending a message." is exactly true
 * of a Pod whose `status` is `'closed'`, and it already names the way out — the
 * `Open` control that `status: 'closed'` puts on the tab. What changed under
 * the widened union is where the answer COMES FROM: `not-opened` is computed
 * from main's `status` instead of from a renderer-local default, so an HMR
 * reload of a LIVE Pod no longer shows the sentence at all.
 *
 * Both halves are asserted, and the sentence is compared two ways: against the
 * literal, so the WORDS are pinned, and against `disabledMessage`, so the copy
 * the app renders and the copy the composer declares cannot drift apart while
 * agreeing with each other.
 */
const NOT_OPENED_SENTENCE = 'This Pod is not running. Open it before sending a message.';

/** The composer's own copy for the rung a closed Pod lands on. */
function notOpenedCopy(): string | null {
  const state: ComposerState = {
    podId: 'pod-1',
    text: '',
    disabled: true,
    disabledReason: 'not-opened',
    sending: false,
    error: null,
  };
  return disabledMessage(state);
}

function apiWithStatus(status: PodStatus): StubOrcastrateApi {
  return stubOrcastrateApi({
    pods: {
      list: async () => ({
        ok: true,
        value: [makeStubPod({ id: 'pod-1', title: 'Alpha', status })],
      }),
    },
  });
}

describe('the composer sentence for a Pod that is not running', () => {
  it('is the contract copy, word for word, and the composer agrees with it', () => {
    expect(notOpenedCopy()).toBe(NOT_OPENED_SENTENCE);
  });

  it('is shown, verbatim, for a Pod main reported as closed', async () => {
    const api = apiWithStatus('closed');
    mountWorkspace(api);

    const note = await screen.findByTestId('composer-disabled-note');
    // The note carries an aria-hidden `[!]` marker beside the sentence, so the
    // sentence is matched as its own text node rather than as the whole row.
    // `getByText` with a string matches an element's OWN text nodes in full,
    // so this is the verbatim sentence and not a substring of a longer one —
    // the aria-hidden `[!]` marker beside it is an element and is not counted.
    expect(within(note).getByText(NOT_OPENED_SENTENCE)).toBe(note);
    expect(note.textContent).toContain(notOpenedCopy());

    // Disabled, and the reason is stated in TEXT rather than by appearance.
    const input = screen.getByTestId(TEST_IDS.composerInput) as HTMLTextAreaElement;
    expect(input.readOnly).toBe(true);
    expect(input.getAttribute('aria-describedby')).toContain(note.id);
    expect(screen.getByTestId(TEST_IDS.composerSend).hasAttribute('disabled')).toBe(true);

    // Nothing was opened to learn this: the status came from the reply.
    expect(api.calls.podOpen).toEqual([]);
  });

  for (const status of ['idle', 'running', 'waiting'] as const) {
    it(`is absent, with an enabled composer, for a Pod main reported as ${status}`, async () => {
      const api = apiWithStatus(status);
      mountWorkspace(api);

      await screen.findByTestId(testId(TEST_IDS.podTab, 'pod-1'));
      await waitFor(() => {
        expect(screen.queryByTestId('composer-disabled-note')).toBeNull();
      });
      expect(screen.queryByText(NOT_OPENED_SENTENCE)).toBeNull();

      const input = screen.getByTestId(TEST_IDS.composerInput) as HTMLTextAreaElement;
      expect(input.readOnly).toBe(false);

      // The HMR case: a live Pod is never opened again to find out it is live.
      expect(api.calls.podOpen).toEqual([]);
    });
  }
});
