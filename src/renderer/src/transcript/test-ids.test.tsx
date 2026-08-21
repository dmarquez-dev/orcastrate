// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { PANE_TEST_IDS, TEST_IDS, TRANSCRIPT_FILTER_TEST_IDS } from '../contracts/renderer-view';
import { LaneRail } from '../lanes/LaneRail';
import { makeCalf as makeRailCalf, makeLane as makeRailLane, makeRow } from '../lanes/test-fixtures';
import { testId } from '../shell/contract-runtime';
import { TranscriptPane } from './TranscriptPane';
import { makeCalf, makeDispatchEvent, makeEvent, makeLane, makeView } from './test-fixtures';

afterEach(cleanup);

const noop = () => undefined;

/**
 * AC12. Every id in the lane-rail, transcript and dispatch-card entries of the
 * frozen `TEST_IDS` is present on a real element, in a single render that puts
 * each of them on screen at once. Listing them literally is the point: a
 * renamed or dropped `data-testid` fails here rather than in T8's suite, where
 * it would look like T8's bug.
 */
describe('TEST_IDS coverage for T6 (AC12)', () => {
  it('the lane rail renders every rail id', () => {
    render(
      <LaneRail
        rows={[
          makeRow(makeRailLane(), { inPrimaryPane: true }),
          makeRow(makeRailCalf({ agentId: 'agent_1' }), {
            unreadEventCount: 2,
            inFollowerPane: true,
            focusedFollower: true,
          }),
        ]}
        onSelect={noop}
        onSteer={noop}
        routingMode="lanes"
      />,
    );

    expect(screen.getByTestId(TEST_IDS.laneRail)).toBeTruthy();

    // `laneRow` is the only rail id `TEST_IDS` documents with a suffix, and it
    // is on the ROW CONTAINER. The action ids are documented bare and are
    // rendered bare — a suite scopes them with `within(row)`, exactly as below.
    const matriarchRow = screen.getByTestId(testId(TEST_IDS.laneRow, 'lane-matriarch'));
    const calfRow = screen.getByTestId(testId(TEST_IDS.laneRow, 'lane-calf-1'));
    expect(matriarchRow).toBeTruthy();

    expect(within(calfRow).getByTestId(TEST_IDS.laneRowUnread)).toBeTruthy();
    expect(within(calfRow).getByTestId(TEST_IDS.laneRowSteer)).toBeTruthy();

    /*
     * REWRITTEN 2026-08-21, NOT EXTENDED. This block asserted the deleted pin id
     * on a Calf row and its absence on the Matriarch.
     * `contracts/lane-pin-removal.ts` DELETED the pin control, its entry in
     * `TEST_IDS`, `LaneRowVm.canPin` and the two follower callbacks, so the
     * assertion has no subject left: an "is it present here / absent there" pair
     * about a control that exists in NO state is not a weaker check, it is a
     * check about nothing.
     *
     * What replaces it is the property the original was protecting — that the
     * rail's action ids are the contract's BARE strings and not suffixed
     * variants, which is the regression that once sent T8's lookups to zero
     * hits — asserted over the ids that still exist.
     *
     * THE DELETED IDENTIFIER IS NOT NAMED ANYWHERE IN THIS FILE, prose included.
     * The re-introduction guard below is spelled as an EXACT key list rather
     * than as `not.toContain('<the old name>')` for that reason, and it is the
     * stronger of the two spellings anyway: a `not.toContain` closes exactly one
     * name, while the equality closes every re-addition, under any name.
     */
    for (const el of [
      within(calfRow).getByTestId(TEST_IDS.laneRowUnread),
      within(calfRow).getByTestId(TEST_IDS.laneRowSteer),
    ]) {
      expect(el.getAttribute('data-testid')).not.toContain(':');
    }

    // THE FROZEN OBJECT'S KEY SET, EXACTLY — the file's existing convention, and
    // what makes the deletion durable. Restoring the pin key fails this equality;
    // so does any other silent addition or removal.
    expect(Object.keys(TEST_IDS)).toEqual([
      'workspace',
      'podBar',
      'podTab',
      'podTabPermissionBadge',
      'podTabBypassBadge',
      'newPodButton',
      'newPodDialog',
      'newPodTitleInput',
      'newPodBrowseButton',
      'newPodCwdDisplay',
      'newPodModeOption',
      'newPodBypassWarning',
      'newPodSubmit',
      'laneRail',
      'laneRow',
      'laneRowUnread',
      'laneRowSteer',
      'transcriptPrimary',
      'transcriptSplit',
      'transcriptEvent',
      'transcriptLoadMore',
      'dispatchCard',
      'dispatchCardAgent',
      'composer',
      'composerInput',
      'composerSend',
      'permissionCard',
      'permissionAllow',
      'permissionAllowAlways',
      'permissionDeny',
      'permissionDenyReason',
    ]);
  });

  it('the primary transcript renders every transcript and dispatch-card id', () => {
    const events = [
      makeEvent(1, { type: 'assistant_text', text: 'hello' }),
      makeDispatchEvent(2, 'Agent', 'lane-calf-1'),
      makeEvent(3, { type: 'assistant_text', text: 'dispatched' }),
    ];

    render(
      <TranscriptPane
        lane={makeLane()}
        view={makeView(events)}
        lanes={[makeLane(), makeCalf('lane-calf-1')]}
        routingMode="lanes"
        isSplit={false}
        hasMore
        onLoadMore={noop}
        onJumpToLane={noop}
        permissionSlot={null}
      />,
    );

    expect(screen.getByTestId(TEST_IDS.transcriptPrimary)).toBeTruthy();
    expect(screen.getByTestId(testId(TEST_IDS.transcriptEvent, '1'))).toBeTruthy();
    expect(screen.getByTestId(testId(TEST_IDS.transcriptEvent, '2'))).toBeTruthy();
    expect(screen.getByTestId(testId(TEST_IDS.transcriptEvent, '3'))).toBeTruthy();
    expect(screen.getByTestId(TEST_IDS.transcriptLoadMore)).toBeTruthy();
    expect(screen.getByTestId(TEST_IDS.dispatchCard)).toBeTruthy();
    expect(screen.getByTestId(TEST_IDS.dispatchCardAgent)).toBeTruthy();

    // The filter toggle is SUFFIXED with the pane, because both panes render
    // one and a bare id would be ambiguous.
    expect(
      screen.getByTestId(testId(TRANSCRIPT_FILTER_TEST_IDS.transcriptFilter, 'primary')),
    ).toBeTruthy();
    // Nothing is hidden in this stream, so the count element is absent — and
    // the toggle is still here, which is the whole point of it.
    expect(screen.queryByTestId(TRANSCRIPT_FILTER_TEST_IDS.transcriptFilterCount)).toBeNull();
    // The unpin control belongs to the follower pane alone.
    expect(screen.queryByTestId(PANE_TEST_IDS.transcriptUnpin)).toBeNull();
  });

  it('the count id renders on a stream that has something to hide', () => {
    render(
      <TranscriptPane
        lane={makeLane()}
        view={makeView([
          makeEvent(1, { type: 'assistant_text', text: 'hello' }),
          makeEvent(2, { type: 'system', subtype: 'hook_started', data: null }),
        ])}
        lanes={[makeLane()]}
        routingMode="lanes"
        isSplit={false}
        hasMore={false}
        onLoadMore={noop}
        onJumpToLane={noop}
        permissionSlot={null}
      />,
    );
    expect(
      screen.getByTestId(TRANSCRIPT_FILTER_TEST_IDS.transcriptFilterCount).textContent,
    ).toBe('1');
  });

  it('the split transcript renders the split id', () => {
    render(
      <TranscriptPane
        lane={makeCalf('lane-calf-1')}
        view={makeView([makeEvent(1, { type: 'assistant_text', text: 'pinned' })])}
        lanes={[makeLane(), makeCalf('lane-calf-1')]}
        routingMode="lanes"
        isSplit
        onHide={noop}
        hasMore={false}
        onLoadMore={noop}
        onJumpToLane={noop}
        permissionSlot={null}
      />,
    );
    expect(screen.getByTestId(TEST_IDS.transcriptSplit)).toBeTruthy();
    expect(
      screen.getByTestId(testId(TRANSCRIPT_FILTER_TEST_IDS.transcriptFilter, 'split')),
    ).toBeTruthy();
    expect(screen.getByTestId(PANE_TEST_IDS.transcriptUnpin)).toBeTruthy();
  });
});

describe('testId', () => {
  it('formats exactly as the frozen contract documents', () => {
    expect(testId(TEST_IDS.podTab, 'abc')).toBe('pod-tab:abc');
    expect(testId(TEST_IDS.laneRow, 'lane-1')).toBe('lane-row:lane-1');
    expect(testId(TEST_IDS.transcriptEvent, '42')).toBe('transcript-event:42');
    expect(testId(TEST_IDS.laneRail)).toBe('lane-rail');
  });
});
