// @vitest-environment jsdom
/**
 * THE PANE MODEL, THE FINISHED-LANE COLLAPSE, AND THE TRANSCRIPT FILTER,
 * driven end to end (`contracts/renderer-panes.ts`, `contracts/transcript-filter.ts`).
 *
 * Everything here mounts `main.tsx`'s tree through the shared harness and
 * drives the REAL `WorkspaceStateStore` against the stub bridge. Nothing calls
 * an action directly, nothing threads a spy into a component, and nothing
 * reads a component's internal state: every claim is made by clicking a
 * rendered affordance and reading a `data-testid` back out.
 *
 * WHY THAT MATTERS HERE MORE THAN USUAL. The three subjects below are all
 * "which lane is where" questions, and every one of them has a shape that
 * passes against a component wired to the wrong callback — a pin that opens
 * the primary, a rail click that appends a third pane, a filter that drops an
 * event from the store rather than from the render. Driving the store is what
 * distinguishes those.
 *
 * WHERE `partitionFinishedLanes` LIVES. `src/renderer/src/lanes/finished-lanes.ts`,
 * re-exported from `../lanes`. It is NOT in `src/renderer/src/contracts/` —
 * `contracts/renderer-panes.ts` is a Gate-2 SPEC file that never landed as a
 * module, and the runtime `contracts/` directory holds only `renderer-panels`,
 * `renderer-state`, `renderer-theme` and `renderer-view`.
 */

import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import type { Lane, LaneId, NormalizedEvent, Seq } from '@shared/contracts/events';
import {
  PANE_TEST_IDS,
  TEST_IDS,
  TRANSCRIPT_FILTER_TEST_IDS,
} from '../contracts/renderer-view';
import { LANE_ROW_SELECT_TEST_ID } from '../lanes';
import { testId } from '../shell/contract-runtime';
import { makeStubLane, stubOrcastrateApi, type StubOrcastrateApi } from '../test-utils';

import {
  BRAVO_ID,
  CALF_EARLY,
  CALF_EARLY_ID,
  CALF_LATE,
  CALF_LATE_ID,
  MATRIARCH,
  MATRIARCH_ID,
  POD_BRAVO,
  assistantEvent,
  flushPendingWork,
  installUnhandledRejectionGuard,
  mountWorkspace,
} from './harness';

installUnhandledRejectionGuard();

// ---------------------------------------------------------------------------
// Reading the screen
// ---------------------------------------------------------------------------

/** The `data-split` flag `WorkspaceLayout` puts on the pane container. */
function splitFlag(): string | null {
  return document.querySelector('[data-split]')?.getAttribute('data-split') ?? null;
}

function laneRow(laneId: LaneId): HTMLElement {
  return screen.getByTestId(testId(TEST_IDS.laneRow, laneId));
}

/** Every rail row currently drawn, in DOM order. Anchored on the colon. */
function railOrder(): string[] {
  return screen
    .getAllByTestId(/^lane-row:/)
    .map((row) => row.getAttribute('data-testid')?.slice('lane-row:'.length) ?? '');
}

/** The lanes the rail currently marks as living in a follower pane. */
function followerRows(): string[] {
  return screen
    .getAllByTestId(/^lane-row:/)
    .filter((row) => row.getAttribute('data-in-follower-pane') === 'true')
    .map((row) => row.getAttribute('data-testid')?.slice('lane-row:'.length) ?? '');
}

function primaryText(): string {
  return screen.getByTestId(TEST_IDS.transcriptPrimary).textContent ?? '';
}

function splitPane(): HTMLElement | null {
  return screen.queryByTestId(TEST_IDS.transcriptSplit);
}

/** Event seqs rendered in one pane, in DOM order. */
function seqsIn(pane: HTMLElement): string[] {
  return within(pane)
    .queryAllByTestId(/^transcript-event:/)
    .map((item) => item.getAttribute('data-testid')?.slice('transcript-event:'.length) ?? '');
}

/**
 * Every BUTTON a rail row draws, by test id, in DOM order.
 *
 * WHY A FULL ORDERED LIST RATHER THAN A `queryBy(...)` FOR THE THING THAT IS
 * GONE. `contracts/lane-pin-removal.ts` deleted the pin button, and the
 * obvious assertion — "the pin is not there" — passes just as well against a
 * rail that drew no row at all, or a row that lost Steer with it. Listing
 * every control the row DOES draw says the same thing and cannot be satisfied
 * by an empty page: the select button has to be present, in the right place,
 * for the list to match. It is also why this file no longer needs to name the
 * deleted id, which acceptance criterion 1 forbids it from doing.
 */
function rowControls(laneId: LaneId): string[] {
  return within(laneRow(laneId))
    .getAllByRole('button')
    .map((button) => button.getAttribute('data-testid') ?? '<no test id>');
}

type User = ReturnType<typeof userEvent.setup>;

/**
 * THE GESTURE THAT SHOWS A LANE, now that the pin is gone: the rail row's own
 * select button. `LaneRailProps.onSelect` is wired to `showLane`, which opens
 * or focuses the follower pane — one control, where there used to be two.
 */
async function clickLaneRow(user: User, laneId: LaneId): Promise<void> {
  await user.click(within(laneRow(laneId)).getByTestId(testId(LANE_ROW_SELECT_TEST_ID, laneId)));
}

/**
 * The follower pane is open AND it is showing `title`'s lane.
 *
 * The title is read from the pane's accessible name rather than from its body
 * text, because the body would also contain the right words if the pane had
 * opened on the wrong lane and merely happened to render an event mentioning
 * it. `Pinned transcript: <title>` is the pane naming its own subject.
 */
function expectFollowerShowing(title: string): HTMLElement {
  const pane = splitPane();
  expect(pane).not.toBeNull();
  expect((pane as HTMLElement).getAttribute('aria-label')).toBe(`Pinned transcript: ${title}`);
  expect(splitFlag()).toBe('true');
  return pane as HTMLElement;
}

/**
 * Close the follower pane through the pane's OWN unpin control, and assert it
 * closed.
 *
 * This is the affordance the pin's removal leans on: with the rail's pin gone
 * this is the ONLY remaining way to close a pane, so every flow in this file
 * that opens one closes it again here rather than leaving the last guard on it
 * to a single test.
 */
async function closeFollowerFromItsOwnControl(user: User, pane: HTMLElement): Promise<void> {
  await user.click(within(pane).getByTestId(PANE_TEST_IDS.transcriptUnpin));
  expect(splitPane()).toBeNull();
  expect(splitFlag()).toBe('false');
  expect(followerRows()).toEqual([]);
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** What each lane says, so a pane's contents name their own lane. */
const MATRIARCH_SAYS = 'the matriarch speaking';
const EARLY_SAYS = 'the early calf speaking';
const LATE_SAYS = 'the late calf speaking';

const SEEDED_EVENTS: NormalizedEvent[] = [
  assistantEvent(1, MATRIARCH_ID, MATRIARCH_SAYS),
  assistantEvent(2, CALF_EARLY_ID, EARLY_SAYS),
  assistantEvent(3, CALF_LATE_ID, LATE_SAYS),
];

/**
 * One Pod, three lanes, and every lane's history SEEDED THROUGH `events.read`
 * rather than through a live push.
 *
 * That is deliberate and load-bearing for the finished-lane test below: a live
 * push raises `unreadEventCount` for an off-screen lane, and a lane with
 * unread events is one of the four NEVER-COLLAPSE cases. Backfill is not
 * unread, so this fixture gives a Calf a transcript without also giving it a
 * reason to stay expanded.
 */
function paneApi(lanes: Lane[], events: NormalizedEvent[] = SEEDED_EVENTS): StubOrcastrateApi {
  return stubOrcastrateApi({
    pods: { list: async () => ({ ok: true, value: [POD_BRAVO] }) },
    lanes: { list: async () => ({ ok: true, value: lanes }) },
    events: { read: async () => ({ ok: true, value: { events, hasMore: false } }) },
  });
}

const THREE_LANES: Lane[] = [MATRIARCH, CALF_EARLY, CALF_LATE];

/** Mount, and wait until the rail has drawn the Matriarch. */
async function mountPod(api: StubOrcastrateApi): Promise<void> {
  mountWorkspace(api);
  await screen.findByTestId(testId(TEST_IDS.laneRow, MATRIARCH_ID));
  await flushPendingWork();
}

// ---------------------------------------------------------------------------
// The pane model, driven through the rail
// ---------------------------------------------------------------------------

describe('the follower pane, steered from the rail', () => {
  it('opens the second pane for the first Calf clicked and REPLACES its contents for the second, never opening a third', async () => {
    const user = userEvent.setup();
    await mountPod(paneApi(THREE_LANES));

    // Unsplit to begin with: one pane, and the layout says so.
    expect(splitPane()).toBeNull();
    expect(splitFlag()).toBe('false');
    expect(followerRows()).toEqual([]);

    await user.click(within(laneRow(CALF_EARLY_ID)).getByTestId(testId(LANE_ROW_SELECT_TEST_ID, CALF_EARLY_ID)));

    const first = splitPane();
    expect(first).not.toBeNull();
    expect(splitFlag()).toBe('true');
    expect(first?.textContent).toContain(EARLY_SAYS);
    expect(followerRows()).toEqual([CALF_EARLY_ID]);

    await user.click(within(laneRow(CALF_LATE_ID)).getByTestId(testId(LANE_ROW_SELECT_TEST_ID, CALF_LATE_ID)));

    // REPLACED, not appended. The pane now holds the late Calf and nothing of
    // the early one, and the rail marks exactly ONE follower — which is the
    // uniqueness invariant read back out of the DOM. A build that pushed a
    // second follower would list two here even though `WorkspaceLayout` only
    // ever renders `followerLaneIds[0]`, so this is what actually catches it.
    const second = splitPane();
    expect(second).not.toBeNull();
    expect(second?.textContent).toContain(LATE_SAYS);
    expect(second?.textContent).not.toContain(EARLY_SAYS);
    expect(followerRows()).toEqual([CALF_LATE_ID]);
    expect(screen.queryAllByTestId(TEST_IDS.transcriptSplit)).toHaveLength(1);

    // And through all of it the Matriarch never left the primary pane.
    expect(primaryText()).toContain(MATRIARCH_SAYS);
    expect(primaryText()).not.toContain(EARLY_SAYS);
    expect(primaryText()).not.toContain(LATE_SAYS);
  });

  it('leaves the Matriarch in the primary pane through the exact sequence that used to swap the panes', async () => {
    const user = userEvent.setup();
    await mountPod(paneApi(THREE_LANES));

    /*
     * THE OLD SWAP, REPLAYED AS FAR AS IT CAN BE REPLAYED.
     *
     * Under the deleted shape this was: `selectLane(matriarch)`,
     * `pinLane(calf)`, `selectLane(calf)` — and the third step EXCHANGED the
     * two panes, putting the Calf in front of the composer and the Matriarch
     * in the pin.
     *
     * AN HONEST LIMITATION, STATED RATHER THAN GLOSSED. This sequence cannot
     * be run against pre-session code to watch the swap happen: `selectLane`,
     * `pinLane` and `unpinLane` no longer exist, so the historical call would
     * die on `showLane is not a function` long before it swapped anything.
     * What is asserted here is therefore the regression FORWARD — the same
     * three USER GESTURES, in the same order, ending with the Matriarch still
     * in `transcript-primary` — not a before/after comparison nobody can make.
     */
    await user.click(within(laneRow(MATRIARCH_ID)).getByTestId(testId(LANE_ROW_SELECT_TEST_ID, MATRIARCH_ID)));
    expect(primaryText()).toContain(MATRIARCH_SAYS);
    // Selecting the lane already in the primary pane never opens a follower.
    expect(splitPane()).toBeNull();

    /*
     * THE SECOND GESTURE, REWRITTEN. Under the deleted shape this step was a
     * click on the rail's pin button. There is no pin button now, and the
     * gesture that replaced it is the rail row itself — so the sequence is
     * still three clicks in the same order, and the second and third are now
     * the SAME control clicked twice, which is exactly the collapse the
     * removal was for.
     */
    await clickLaneRow(user, CALF_EARLY_ID);
    const pane = expectFollowerShowing('explorer');
    expect(pane.textContent).toContain(EARLY_SAYS);

    await clickLaneRow(user, CALF_EARLY_ID);

    // The step that used to swap. It focuses the pane the Calf is already in
    // and does nothing else.
    expect(primaryText()).toContain(MATRIARCH_SAYS);
    expect(primaryText()).not.toContain(EARLY_SAYS);
    expect(expectFollowerShowing('explorer').textContent).toContain(EARLY_SAYS);
    expect(followerRows()).toEqual([CALF_EARLY_ID]);
    expect(laneRow(MATRIARCH_ID).getAttribute('data-in-primary-pane')).toBe('true');

    /*
     * NO ROW OFFERS A PIN, IN ANY STATE — asserted as the FULL ordered list of
     * each row's controls, with the follower pane open, which is the state the
     * pin used to be at its most visible in.
     *
     * The Matriarch draws only its select button: `agentId` is null on the
     * harness fixture so Steer is not offered, and the pin is gone. The early
     * Calf carries an `agentId` and so still draws Steer beside its select
     * button, in that order. A rail that rendered nothing, or a row that lost
     * Steer along with the pin, fails here — which a bare "the pin is absent"
     * assertion would not.
     */
    expect(rowControls(MATRIARCH_ID)).toEqual([testId(LANE_ROW_SELECT_TEST_ID, MATRIARCH_ID)]);
    expect(rowControls(CALF_EARLY_ID)).toEqual([
      testId(LANE_ROW_SELECT_TEST_ID, CALF_EARLY_ID),
      TEST_IDS.laneRowSteer,
    ]);
    expect(rowControls(CALF_LATE_ID)).toEqual([testId(LANE_ROW_SELECT_TEST_ID, CALF_LATE_ID)]);

    // ...and the pane the rail can no longer close still closes from its own
    // control, which is the affordance the removal relies on.
    await closeFollowerFromItsOwnControl(user, expectFollowerShowing('explorer'));
  });

  it('closes the follower pane from the pane’s own unpin control, not from the rail', async () => {
    const user = userEvent.setup();
    await mountPod(paneApi(THREE_LANES));

    await clickLaneRow(user, CALF_EARLY_ID);
    const pane = expectFollowerShowing('explorer');
    expect(pane.textContent).toContain(EARLY_SAYS);

    /*
     * THE ONLY REMAINING WAY TO CLOSE A PANE. The rail's pin used to offer a
     * second one and is gone (`contracts/lane-pin-removal.ts` section 3), so
     * this control is now load-bearing on its own.
     *
     * Reached by its ACCESSIBLE NAME as well as by the id the contract names:
     * the id proves the contract's element is the one rendered, and the name
     * proves a keyboard user can find it and can tell WHICH pane it closes.
     * A callback spy would pass for a control the pane never rendered at all.
     */
    expect(within(pane).getByRole('button', { name: 'Unpin explorer' })).toBe(
      within(pane).getByTestId(PANE_TEST_IDS.transcriptUnpin),
    );

    await closeFollowerFromItsOwnControl(user, pane);

    // The primary pane never carries one, before or after.
    expect(
      within(screen.getByTestId(TEST_IDS.transcriptPrimary)).queryByTestId(
        PANE_TEST_IDS.transcriptUnpin,
      ),
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Finished lanes: collapsed in the rail, never dropped from the snapshot
// ---------------------------------------------------------------------------

const DONE_EARLY: Lane = { ...CALF_EARLY, status: 'done', endedAt: '2026-01-01T00:00:30.000Z' };
const DONE_LATE: Lane = { ...CALF_LATE, status: 'done', endedAt: '2026-01-01T00:00:40.000Z' };

/**
 * A THIRD CALF, STILL RUNNING, AND STARTED BETWEEN THE TWO FINISHED ONES.
 *
 * This is load-bearing, not scenery, and the first draft of this file did not
 * have it — which made the "interleaved back into rail position" assertion
 * below UNFALSIFIABLE. With only the Matriarch active, `[...active,
 * ...finished]` and the interleaved order are the SAME ARRAY, so a build that
 * appended the finished rows in a block at the end passed. Proved by
 * experiment: mutating `LaneRail`'s expanded view to append left the whole
 * suite green.
 *
 * With `:05 < :07 < :09` the active Calf sits BETWEEN the two finished ones, so
 * appending and interleaving produce different rail orders and the assertion
 * distinguishes them.
 */
const MID_ID: LaneId = 'lane-calf-mid';
const CALF_MID: Lane = makeStubLane({
  id: MID_ID,
  podId: BRAVO_ID,
  kind: 'calf',
  toolUseId: 'toolu-mid',
  agentId: 'agent-mid',
  parentLaneId: MATRIARCH_ID,
  depth: 1,
  subagentType: 'builder',
  description: 'Still working',
  status: 'running',
  startedAt: '2026-01-01T00:00:07.000Z',
});

const DONE_LANES: Lane[] = [MATRIARCH, DONE_EARLY, CALF_MID, DONE_LATE];

describe('a Pod whose Calves have finished', () => {
  it('collapses both finished rows behind the counted disclosure, keeps every lane in the registry, and still opens one in the follower pane', async () => {
    const user = userEvent.setup();
    await mountPod(paneApi(DONE_LANES));

    // COLLAPSED. The Matriarch and the Calf that is still working are drawn;
    // the two finished ones are not. The disclosure names the count — an
    // affordance that vanished when it was doing the most work is how a user
    // loses a lane.
    expect(railOrder()).toEqual([MATRIARCH_ID, MID_ID]);
    expect(screen.queryByTestId(PANE_TEST_IDS.laneRailFinishedGroup)).toBeNull();
    const toggle = screen.getByTestId(PANE_TEST_IDS.laneRailFinishedToggle);
    expect(toggle.textContent).toBe('Show 2 finished lanes');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');

    await user.click(toggle);

    /*
     * NOTHING WAS OMITTED FROM `PodSessionView.lanes`, WHICH IS THE WHOLE
     * POINT OF THE DECISION — the collapse is a view, and the snapshot the
     * dispatch cards' per-agent rows are built from is untouched.
     *
     * The registry is read here through the rail because the rail IS the
     * registry rendered: `useLaneRail` maps `orderLanes(runtime.lanes)` one
     * row per lane, and `App.tsx` builds `TranscriptPaneProps.lanes` from
     * exactly those rows. Four lanes in the snapshot, four rows on expand.
     */
    // INTERLEAVED BACK INTO RAIL POSITION, not appended in a block at the end:
    // the still-running Calf sits BETWEEN the two that finished, exactly where
    // `startedAt` puts it, so a lane does not move when it finishes and move
    // again when it is revealed. Appending would read
    // `[matriarch, mid, early, late]` here.
    expect(railOrder()).toEqual([MATRIARCH_ID, CALF_EARLY_ID, MID_ID, CALF_LATE_ID]);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(toggle.textContent).toBe('Hide 2 finished lanes');

    /*
     * The group id sits on the SHARED `<ul>`, because §6 requires finished
     * rows to return INTERLEAVED into rail order — there is no contiguous run
     * of DOM that holds exactly the finished ones. So expanded it holds every
     * row, and asserting "the collapsed rows" through it would be reading all
     * three. What it does say, truthfully, is that the disclosure points at a
     * container that is now present and was absent while collapsed.
     */
    const group = screen.getByTestId(PANE_TEST_IDS.laneRailFinishedGroup);
    expect(toggle.getAttribute('aria-controls')).toBe(group.getAttribute('id'));

    // STILL REACHABLE. A collapsed lane is not a lost lane: clicking it opens
    // its transcript in the follower pane and its events render.
    await user.click(within(laneRow(CALF_LATE_ID)).getByTestId(testId(LANE_ROW_SELECT_TEST_ID, CALF_LATE_ID)));

    const pane = splitPane();
    expect(pane).not.toBeNull();
    expect(pane?.textContent).toContain(LATE_SAYS);
    expect(primaryText()).toContain(MATRIARCH_SAYS);

    // ...and the lane now on screen stops being collapsible at all, so the
    // disclosure's count drops to one rather than the row vanishing under the
    // pane that is showing it.
    expect(screen.getByTestId(PANE_TEST_IDS.laneRailFinishedToggle).textContent).toBe(
      'Hide 1 finished lane',
    );
  });

  it('offers no disclosure at all while every lane is still running', async () => {
    // The falsifying half: the toggle is a claim about finished lanes, not
    // furniture the rail always draws.
    await mountPod(paneApi(THREE_LANES));
    expect(screen.queryByTestId(PANE_TEST_IDS.laneRailFinishedToggle)).toBeNull();
    expect(railOrder()).toEqual([MATRIARCH_ID, CALF_EARLY_ID, CALF_LATE_ID]);
  });
});

// ---------------------------------------------------------------------------
// The filter, against a live push
// ---------------------------------------------------------------------------

function systemEvent(seq: Seq, laneId: LaneId, subtype: string): NormalizedEvent {
  return {
    id: seq,
    podId: BRAVO_ID,
    laneId,
    seq,
    type: 'system',
    payload: { type: 'system', subtype, data: { note: `system ${subtype} ${String(seq)}` } },
    createdAt: '2026-01-01T00:01:00.000Z',
  };
}

/** A lone Calf, so the Matriarch is the primary and the Calf can be steered. */
const LONE_CALF: Lane = makeStubLane({
  id: CALF_EARLY_ID,
  podId: BRAVO_ID,
  kind: 'calf',
  toolUseId: 'toolu-early',
  agentId: 'agent-early',
  parentLaneId: MATRIARCH_ID,
  depth: 1,
  subagentType: 'explorer',
  description: 'Read the lane router',
  startedAt: '2026-01-01T00:00:05.000Z',
});

describe('the transcript filter against a live push', () => {
  it('counts a hidden system event as unread, renders only the conversation by default, and reveals the system event at its seq position when toggled', async () => {
    const user = userEvent.setup();
    const api = paneApi([MATRIARCH, LONE_CALF], []);
    await mountPod(api);

    const unreadOf = (laneId: LaneId): string =>
      within(laneRow(laneId)).queryByTestId(TEST_IDS.laneRowUnread)?.getAttribute(
        'data-unread-count',
      ) ?? '0';

    expect(unreadOf(CALF_EARLY_ID)).toBe('0');

    /*
     * THE BADGE REPORTS WHAT ARRIVED, NOT WHAT IS RENDERED, and the two
     * pushes are separated so the HIDDEN one is seen to count on its own.
     * The Calf is deliberately off screen for this half: a lane in either
     * pane accrues no unread count at all (`deriveLaneRail`), so counting it
     * while it was displayed would assert nothing.
     */
    act(() => {
      api.emit.podEvent({ podId: BRAVO_ID, events: [systemEvent(1, CALF_EARLY_ID, 'hook_started')] });
    });
    expect(unreadOf(CALF_EARLY_ID)).toBe('1');

    act(() => {
      api.emit.podEvent({ podId: BRAVO_ID, events: [assistantEvent(2, CALF_EARLY_ID, EARLY_SAYS)] });
    });
    expect(unreadOf(CALF_EARLY_ID)).toBe('2');

    // Now put the lane on screen — by clicking the row, the gesture that
    // replaced the pin — and read what the DEFAULT mode renders.
    await clickLaneRow(user, CALF_EARLY_ID);
    const pane = expectFollowerShowing('explorer');

    expect(seqsIn(pane)).toEqual(['2']);
    expect(pane.textContent).toContain(EARLY_SAYS);
    expect(pane.textContent).not.toContain('hook_started');

    /*
     * `transcript-filter-count` is NOT pane-suffixed — unlike the toggle
     * itself, which is `transcript-filter:primary` / `transcript-filter:split`
     * — so it is scoped with `within` rather than reached from `screen`, which
     * would throw a multiple-match the moment both panes hide something.
     */
    const toggle = within(pane).getByTestId(
      testId(TRANSCRIPT_FILTER_TEST_IDS.transcriptFilter, 'split'),
    );
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    // SINGULAR AT ONE (`contracts/transcript-filter-amendment.ts` section 3).
    // This assertion said "events" until this session and was MASKED, not
    // passing: the test aborted on the deleted pin id several lines above it.
    expect(toggle.getAttribute('aria-label')).toBe('Show 1 hidden system event');
    expect(
      within(pane).getByTestId(TRANSCRIPT_FILTER_TEST_IDS.transcriptFilterCount).textContent,
    ).toBe('1');

    await user.click(toggle);

    // INTERLEAVED AT ITS SEQ POSITION, not appended in a block at the end.
    expect(seqsIn(pane)).toEqual(['1', '2']);
    expect(pane.textContent).toContain('hook_started');
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    expect(toggle.getAttribute('aria-label')).toBe('Hide 1 system event');

    // The pane this flow opened still closes from its own control.
    await closeFollowerFromItsOwnControl(user, pane);
  });

  it('holds a mode per pane, so revealing plumbing in one pane leaves the other filtered', async () => {
    const user = userEvent.setup();
    const api = paneApi([MATRIARCH, LONE_CALF], []);
    await mountPod(api);

    act(() => {
      api.emit.podEvent({
        podId: BRAVO_ID,
        events: [
          systemEvent(1, MATRIARCH_ID, 'init'),
          assistantEvent(2, MATRIARCH_ID, MATRIARCH_SAYS),
          systemEvent(3, CALF_EARLY_ID, 'hook_started'),
          assistantEvent(4, CALF_EARLY_ID, EARLY_SAYS),
        ],
      });
    });

    await clickLaneRow(user, CALF_EARLY_ID);
    const primary = screen.getByTestId(TEST_IDS.transcriptPrimary);
    const pane = expectFollowerShowing('explorer');

    // Both panes hide one event, so a bare `getByTestId` for the count would
    // be ambiguous here. That ambiguity is the point of the scoping.
    expect(screen.getAllByTestId(TRANSCRIPT_FILTER_TEST_IDS.transcriptFilterCount)).toHaveLength(2);
    expect(seqsIn(primary)).toEqual(['2']);
    expect(seqsIn(pane)).toEqual(['4']);

    await user.click(
      within(pane).getByTestId(testId(TRANSCRIPT_FILTER_TEST_IDS.transcriptFilter, 'split')),
    );

    expect(seqsIn(pane)).toEqual(['3', '4']);
    // The other pane did not move.
    expect(seqsIn(primary)).toEqual(['2']);
    expect(
      within(primary)
        .getByTestId(testId(TRANSCRIPT_FILTER_TEST_IDS.transcriptFilter, 'primary'))
        .getAttribute('aria-pressed'),
    ).toBe('false');

    // The pane this flow opened still closes from its own control, and the
    // primary pane's mode survives the close.
    await closeFollowerFromItsOwnControl(user, pane);
    expect(seqsIn(screen.getByTestId(TEST_IDS.transcriptPrimary))).toEqual(['2']);
  });
});

// ---------------------------------------------------------------------------
// 'inline' routing mode: a rail click shows the lane and opens NOTHING
// ---------------------------------------------------------------------------

/**
 * THE RULE THE DELETED `canPin` USED TO CARRY, now a property of `showLane`
 * itself (`contracts/lane-pin-removal.ts` section 2, branch 0) and driven here
 * through the whole app rather than through the action.
 *
 * In inline mode every event carries the Matriarch's laneId, so a follower
 * pane opened on a Calf would show BYTE-IDENTICAL contents to the primary.
 * `canPin` was false for every row there and the rail simply drew no pin.
 * Deleting the field without moving the rule would make a rail click open that
 * duplicate pane — a regression introduced by a removal, which is the hardest
 * kind to notice, and the reason it is asserted at this level as well as at
 * the store's.
 */
describe("a Pod in 'inline' routing mode", () => {
  function inlineApi(): StubOrcastrateApi {
    return stubOrcastrateApi({
      pods: { list: async () => ({ ok: true, value: [POD_BRAVO] }) },
      lanes: { list: async () => ({ ok: true, value: THREE_LANES }) },
      events: { read: async () => ({ ok: true, value: { events: SEEDED_EVENTS, hasMore: false } }) },
      app: { routingMode: async () => ({ ok: true, value: 'inline' as const }) },
    });
  }

  it('shows a clicked Calf without opening a second pane, and still opens one in lanes mode', async () => {
    const user = userEvent.setup();
    const api = inlineApi();
    await mountPod(api);

    // The mode reached the pane, so the negative below is about the ROUTING
    // RULE and not about a stub that failed to answer.
    const primary = screen.getByTestId(TEST_IDS.transcriptPrimary);
    expect(primary.getAttribute('data-routing-mode')).toBe('inline');
    expect(railOrder()).toEqual([MATRIARCH_ID, CALF_EARLY_ID, CALF_LATE_ID]);

    await clickLaneRow(user, CALF_EARLY_ID);

    /*
     * NO SECOND PANE — and the POSITIVE half in the same assertion, which is
     * what stops a workspace that failed to mount at all from passing: the
     * primary pane is still there, still the Matriarch's, and still showing
     * her events.
     */
    expect(screen.queryByTestId(TEST_IDS.transcriptSplit)).toBeNull();
    expect(splitFlag()).toBe('false');
    expect(followerRows()).toEqual([]);
    expect(screen.getByTestId(TEST_IDS.transcriptPrimary).getAttribute('aria-label')).toBe(
      'Transcript: Matriarch',
    );
    expect(primaryText()).toContain(MATRIARCH_SAYS);

    // Clicking the Matriarch's own row is likewise inert.
    await clickLaneRow(user, MATRIARCH_ID);
    expect(screen.queryByTestId(TEST_IDS.transcriptSplit)).toBeNull();
    expect(primaryText()).toContain(MATRIARCH_SAYS);
  });

  it("still opens the follower pane for the same click in 'lanes' mode", async () => {
    // The falsifying half of the test above: the same gesture, the same
    // fixture, one different routing mode. Without this, a `showLane` that had
    // stopped opening a follower in EVERY mode would pass the inline test.
    const user = userEvent.setup();
    await mountPod(paneApi(THREE_LANES));

    expect(screen.getByTestId(TEST_IDS.transcriptPrimary).getAttribute('data-routing-mode')).toBe(
      'lanes',
    );
    await clickLaneRow(user, CALF_EARLY_ID);

    const pane = expectFollowerShowing('explorer');
    expect(pane.textContent).toContain(EARLY_SAYS);
    await closeFollowerFromItsOwnControl(user, pane);
  });
});
