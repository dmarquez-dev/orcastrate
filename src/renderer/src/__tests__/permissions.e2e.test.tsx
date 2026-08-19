// @vitest-environment jsdom
/**
 * The permission path through the assembled workspace, end to end (acceptance
 * criteria 4 and 5).
 *
 * Every assertion here is about something a user can see or a call the main
 * process would receive. The card's own state is never inspected: whether a
 * card is "pending" is asked by looking for the card.
 */

import { act, fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { TEST_IDS } from '../contracts/renderer-view';
import { testId } from '../shell/contract-runtime';
import { stubOrcastrateApi, type StubOrcastrateApi } from '../test-utils';

import {
  ALPHA_ID,
  BRAVO_ID,
  CALF_EARLY,
  CALF_EARLY_ID,
  CALF_LATE,
  MATRIARCH,
  MATRIARCH_ID,
  POD_ALPHA,
  POD_BRAVO,
  flushPendingWork,
  installUnhandledRejectionGuard,
  mountWorkspace,
} from './harness';

installUnhandledRejectionGuard();

const REQUEST_ID = 'req-bash-1';

/**
 * Two Pods; Bravo owns the three lanes. `lanes.list` answers for Bravo so the
 * lane registry survives activation — a `laneChanged` push is what criterion 3
 * exercises, and re-driving it here would only add a race to this test.
 */
function permissionApi(): StubOrcastrateApi {
  return stubOrcastrateApi({
    pods: { list: async () => ({ ok: true, value: [POD_ALPHA, POD_BRAVO] }) },
    lanes: {
      list: async (podId) => ({
        ok: true,
        value: podId === BRAVO_ID ? [MATRIARCH, CALF_EARLY, CALF_LATE] : [],
      }),
    },
  });
}

function requestPermissionOn(api: StubOrcastrateApi, laneId: string): void {
  act(() => {
    api.emit.permissionRequested({
      podId: BRAVO_ID,
      laneId,
      requestId: REQUEST_ID,
      toolName: 'Bash',
      input: { command: 'git push --force' },
    });
  });
}

describe('a permission request raised by a Calf lane', () => {
  it('badges the asking Pod while another Pod is active, then answers with a trimmed reason and clears', async () => {
    const user = userEvent.setup();
    const api = permissionApi();
    mountWorkspace(api);

    // Alpha is the active Pod; Bravo is in the background.
    const alphaTab = await screen.findByTestId(testId(TEST_IDS.podTab, ALPHA_ID));
    expect(alphaTab.getAttribute('aria-current')).toBe('true');

    requestPermissionOn(api, CALF_EARLY_ID);

    // The badge exists so a BACKGROUNDED Pod waiting on the user is visible
    // without switching to it.
    expect(
      screen.getByTestId(testId(TEST_IDS.podTabPermissionBadge, BRAVO_ID)),
    ).toBeDefined();
    expect(
      screen.queryByTestId(testId(TEST_IDS.podTabPermissionBadge, ALPHA_ID)),
    ).toBeNull();
    expect(screen.getByTestId(testId(TEST_IDS.podTab, ALPHA_ID)).getAttribute('aria-current')).toBe(
      'true',
    );

    // Switch to Bravo. Selection defaults to the Matriarch, so pin the Calf
    // into the split pane and read both transcripts side by side.
    await user.click(screen.getByTestId(testId(TEST_IDS.podTab, BRAVO_ID)));
    const calfRow = await screen.findByTestId(testId(TEST_IDS.laneRow, CALF_EARLY_ID));
    await user.click(within(calfRow).getByTestId(TEST_IDS.laneRowPin));

    const primary = await screen.findByTestId(TEST_IDS.transcriptPrimary);
    const split = await screen.findByTestId(TEST_IDS.transcriptSplit);
    expect(primary.getAttribute('aria-label')).toBe('Transcript: Matriarch');
    expect(split.getAttribute('aria-label')).toBe('Pinned transcript: explorer');

    // The card is in the Calf's transcript and in no other.
    const cardId = testId(TEST_IDS.permissionCard, REQUEST_ID);
    expect(within(split).getByTestId(cardId)).toBeDefined();
    expect(within(primary).queryByTestId(cardId)).toBeNull();
    expect(screen.getAllByTestId(cardId)).toHaveLength(1);

    const card = within(split).getByTestId(cardId);
    expect(within(card).getByText('Bash')).toBeDefined();

    // Deny with no reason sends nothing. Main answers INVALID_ARGUMENT for a
    // missing reason, so the button that would produce it is not live.
    const deny = within(card).getByTestId(TEST_IDS.permissionDeny);
    expect((deny as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(deny);
    await flushPendingWork();
    expect(api.calls.permissionRespond).toEqual([]);

    // A reason with surrounding whitespace: what main receives is trimmed.
    await user.type(
      within(card).getByTestId(TEST_IDS.permissionDenyReason),
      '   force pushes are not allowed here   ',
    );
    expect((within(card).getByTestId(TEST_IDS.permissionDeny) as HTMLButtonElement).disabled).toBe(
      false,
    );
    await user.click(within(card).getByTestId(TEST_IDS.permissionDeny));
    await flushPendingWork();

    expect(api.calls.permissionRespond).toEqual([
      [
        {
          podId: BRAVO_ID,
          requestId: REQUEST_ID,
          decision: 'deny',
          reason: 'force pushes are not allowed here',
        },
      ],
    ]);

    // The card is still on screen: only the push removes it.
    expect(screen.getByTestId(cardId)).toBeDefined();

    act(() => {
      api.emit.permissionResolved({ podId: BRAVO_ID, requestId: REQUEST_ID, outcome: 'deny' });
    });

    expect(screen.queryByTestId(cardId)).toBeNull();
    expect(
      screen.queryByTestId(testId(TEST_IDS.podTabPermissionBadge, BRAVO_ID)),
    ).toBeNull();
  });

  it('clears itself silently when the turn is interrupted and the request is aborted', async () => {
    const user = userEvent.setup();
    const api = permissionApi();
    mountWorkspace(api);

    await screen.findByTestId(testId(TEST_IDS.podTab, BRAVO_ID));
    await user.click(screen.getByTestId(testId(TEST_IDS.podTab, BRAVO_ID)));
    await screen.findByTestId(testId(TEST_IDS.laneRow, MATRIARCH_ID));

    requestPermissionOn(api, MATRIARCH_ID);

    const cardId = testId(TEST_IDS.permissionCard, REQUEST_ID);
    const primary = screen.getByTestId(TEST_IDS.transcriptPrimary);
    expect(within(primary).getByTestId(cardId)).toBeDefined();

    // No user action at all — the turn was interrupted underneath them.
    act(() => {
      api.emit.permissionResolved({ podId: BRAVO_ID, requestId: REQUEST_ID, outcome: 'aborted' });
    });
    await flushPendingWork();

    expect(screen.queryByTestId(cardId)).toBeNull();
    expect(api.calls.permissionRespond).toEqual([]);
    // Silently: no error text anywhere on screen.
    expect(screen.queryAllByRole('alert')).toEqual([]);
    expect(screen.queryByTestId('permission-card-error')).toBeNull();
    expect(
      screen.queryByTestId(testId(TEST_IDS.podTabPermissionBadge, BRAVO_ID)),
    ).toBeNull();
  });
});
