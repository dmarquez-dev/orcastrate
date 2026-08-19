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

import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import type { PermissionMode, Pod } from '@shared/contracts/events';
import { BYPASS_PERMISSIONS_WARNING, PERMISSION_MODE_OPTIONS, TEST_IDS } from '../contracts/renderer-view';
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
