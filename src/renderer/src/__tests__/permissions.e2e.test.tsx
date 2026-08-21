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

import type { NormalizedEvent, Seq } from '@shared/contracts/events';
import {
  PANE_TEST_IDS,
  TEST_IDS,
  TRANSCRIPT_FILTER_TEST_IDS,
} from '../contracts/renderer-view';
import { LANE_ROW_SELECT_TEST_ID } from '../lanes';
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

    /*
     * Switch to Bravo. Selection defaults to the Matriarch, so the Calf is put
     * into the follower pane by CLICKING ITS RAIL ROW — the gesture that
     * replaced the deleted pin button (`contracts/lane-pin-removal.ts`). The
     * row's select button is the whole affordance now; the pane's own
     * `transcript-unpin`, exercised at the end of this test, is the only way
     * back out.
     */
    await user.click(screen.getByTestId(testId(TEST_IDS.podTab, BRAVO_ID)));
    const calfRow = await screen.findByTestId(testId(TEST_IDS.laneRow, CALF_EARLY_ID));
    await user.click(
      within(calfRow).getByTestId(testId(LANE_ROW_SELECT_TEST_ID, CALF_EARLY_ID)),
    );

    const primary = await screen.findByTestId(TEST_IDS.transcriptPrimary);
    const split = await screen.findByTestId(TEST_IDS.transcriptSplit);
    expect(primary.getAttribute('aria-label')).toBe('Transcript: Matriarch');
    // The follower pane opened, and it opened on the Calf's OWN lane — read
    // from the pane naming its subject, not from words in its body.
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

    /*
     * AND THE PANE THIS FLOW OPENED STILL CLOSES. With the rail's pin deleted
     * the follower pane's own unpin is the only remaining way out of a split,
     * so every flow here that opens one closes it again rather than leaving
     * the last guard on that affordance to a single test in another file.
     */
    await user.click(within(split).getByTestId(PANE_TEST_IDS.transcriptUnpin));
    expect(screen.queryByTestId(TEST_IDS.transcriptSplit)).toBeNull();
    expect(screen.getByTestId(TEST_IDS.transcriptPrimary).getAttribute('aria-label')).toBe(
      'Transcript: Matriarch',
    );
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

// ---------------------------------------------------------------------------
// The permission ROW is hidden by default; the permission PROMPT is not
// ---------------------------------------------------------------------------

/**
 * `contracts/transcript-filter-amendment.ts` section 1 moved
 * `permission_request` and `permission_decision` out of
 * `CONVERSATION_EVENT_TYPES` and into `PLUMBING_EVENT_TYPES`, so the
 * transcript row is hidden in the default mode.
 *
 * THE USER'S REASON, AND THE THING MOST LIKELY TO GO WRONG WITH IT. A
 * permission already raises a real confirmation prompt — the card, in the
 * pane's own `permissionSlot` — which the user must answer before the turn
 * continues; the transcript row beside it is a second copy of something they
 * have already been made to look at. What that reasoning DEPENDS ON is that
 * only the row moved. A change that hid the row by hiding the whole
 * permission, or that stopped the arrival raising the lane's badge, would turn
 * "one copy instead of two" into "no copy at all" — and a user would then
 * clear a badge by toggling a filter.
 *
 * So all four halves are asserted in ONE test, deliberately: the absence, the
 * card that must remain operable beside it, the unread accounting that must
 * still see the arrival, and the reveal at the row's ORIGINAL seq position.
 * Split across four tests, the absence half would pass on its own against a
 * pane that rendered nothing at all.
 */
const ROW_REQUEST_ID = 'req-row-1';

function permissionRowEvent(seq: Seq, laneId: string): NormalizedEvent {
  return {
    id: seq,
    podId: BRAVO_ID,
    laneId,
    seq,
    type: 'permission_request',
    payload: {
      type: 'permission_request',
      requestId: ROW_REQUEST_ID,
      toolName: 'Bash',
      input: { command: 'git push --force' },
      toolUseId: null,
    },
    createdAt: '2026-01-01T00:01:00.000Z',
  };
}

function assistantRowEvent(seq: Seq, laneId: string, text: string): NormalizedEvent {
  return {
    id: seq,
    podId: BRAVO_ID,
    laneId,
    seq,
    type: 'assistant_text',
    payload: { type: 'assistant_text', text },
    createdAt: '2026-01-01T00:01:00.000Z',
  };
}

/** Bravo alone, so no tab switch stands between mounting and the assertions. */
function bravoOnlyApi(): StubOrcastrateApi {
  return stubOrcastrateApi({
    pods: { list: async () => ({ ok: true, value: [POD_BRAVO] }) },
    lanes: { list: async () => ({ ok: true, value: [MATRIARCH, CALF_EARLY, CALF_LATE] }) },
  });
}

const BEFORE_SAYS = 'before the permission';
const AFTER_SAYS = 'after the permission';

describe('a permission that has moved out of the default transcript', () => {
  it('hides its transcript row while keeping the card operable, still counts the arrival as unread, and reveals the row at its own seq when the filter is toggled', async () => {
    const user = userEvent.setup();
    const api = bravoOnlyApi();
    mountWorkspace(api);

    const calfRow = await screen.findByTestId(testId(TEST_IDS.laneRow, CALF_EARLY_ID));
    await flushPendingWork();

    /*
     * THE ARRIVAL, on a lane that is deliberately OFF SCREEN. A lane in either
     * pane accrues no unread count at all, so counting the hidden event while
     * it was displayed would assert nothing.
     *
     * The row is pushed as an EVENT and the card as a permission REQUEST,
     * because they are two different things in the app and the whole claim
     * here is that only one of them moved.
     */
    act(() => {
      api.emit.podEvent({
        podId: BRAVO_ID,
        events: [
          assistantRowEvent(1, CALF_EARLY_ID, BEFORE_SAYS),
          permissionRowEvent(2, CALF_EARLY_ID),
          assistantRowEvent(3, CALF_EARLY_ID, AFTER_SAYS),
        ],
      });
      api.emit.permissionRequested({
        podId: BRAVO_ID,
        laneId: CALF_EARLY_ID,
        requestId: ROW_REQUEST_ID,
        toolName: 'Bash',
        input: { command: 'git push --force' },
      });
    });

    // THE BADGE REPORTS WHAT ARRIVED, NOT WHAT IS RENDERED. All three events
    // count, including the one the default mode will not draw — otherwise a
    // user clears a badge by toggling a filter.
    expect(
      within(calfRow).getByTestId(TEST_IDS.laneRowUnread).getAttribute('data-unread-count'),
    ).toBe('3');
    // ...and the lane still says, in words, that it is waiting on the user.
    expect(within(calfRow).getByText('Awaiting permission')).toBeDefined();

    // Now put the lane on screen by clicking its row.
    await user.click(
      within(calfRow).getByTestId(testId(LANE_ROW_SELECT_TEST_ID, CALF_EARLY_ID)),
    );
    const split = await screen.findByTestId(TEST_IDS.transcriptSplit);
    expect(split.getAttribute('aria-label')).toBe('Pinned transcript: explorer');

    const renderedSeqs = (): string[] =>
      within(split)
        .queryAllByTestId(/^transcript-event:/)
        .map((li) => li.getAttribute('data-testid')?.slice('transcript-event:'.length) ?? '');

    // THE ROW IS ABSENT — asserted as the EXACT ordered seq list, so a pane
    // that rendered nothing cannot pass, and by event type, so a row that
    // rendered blank cannot either.
    expect(renderedSeqs()).toEqual(['1', '3']);
    expect(within(split).queryAllByText('Permission requested')).toEqual([]);
    expect(split.textContent).toContain(BEFORE_SAYS);
    expect(split.textContent).toContain(AFTER_SAYS);

    // THE CARD IS PRESENT AND OPERABLE IN THE SAME BREATH. Hiding the row must
    // not make the prompt one step harder to answer.
    const cardId2 = testId(TEST_IDS.permissionCard, ROW_REQUEST_ID);
    const card = within(split).getByTestId(cardId2);
    expect(within(card).getByText('Bash')).toBeDefined();

    // THE REVEAL, AT THE ORIGINAL SEQ POSITION — interleaved, not appended.
    const toggle = within(split).getByTestId(
      testId(TRANSCRIPT_FILTER_TEST_IDS.transcriptFilter, 'split'),
    );
    expect(toggle.getAttribute('aria-label')).toBe('Show 1 hidden system event');
    await user.click(toggle);

    expect(renderedSeqs()).toEqual(['1', '2', '3']);
    expect(within(split).getByTestId('transcript-event:2').getAttribute('data-event-type')).toBe(
      'permission_request',
    );
    expect(toggle.getAttribute('aria-label')).toBe('Hide 1 system event');

    // ...and hiding it again puts the transcript back exactly where it was.
    await user.click(toggle);
    expect(renderedSeqs()).toEqual(['1', '3']);

    // The card answers the prompt, from the default view, with one click.
    await user.click(within(card).getByTestId(TEST_IDS.permissionAllow));
    await flushPendingWork();
    expect(api.calls.permissionRespond).toEqual([
      [{ podId: BRAVO_ID, requestId: ROW_REQUEST_ID, decision: 'allow' }],
    ]);

    // The pane this flow opened still closes from its own control.
    await user.click(within(split).getByTestId(PANE_TEST_IDS.transcriptUnpin));
    expect(screen.queryByTestId(TEST_IDS.transcriptSplit)).toBeNull();
  });
});
