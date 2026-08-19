// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { TEST_IDS } from '../contracts/renderer-view';
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
          makeRow(makeRailLane()),
          makeRow(makeRailCalf({ agentId: 'agent_1' }), { unreadEventCount: 2, pinned: true }),
        ]}
        onSelect={noop}
        onPin={noop}
        onUnpin={noop}
        onSteer={noop}
        routingMode="lanes"
      />,
    );

    expect(screen.getByTestId(TEST_IDS.laneRail)).toBeTruthy();

    // `laneRow` is the only rail id `TEST_IDS` documents with a suffix, and it
    // is on the ROW CONTAINER. The three action ids are documented bare and are
    // rendered bare — a suite scopes them with `within(row)`, exactly as below.
    const matriarchRow = screen.getByTestId(testId(TEST_IDS.laneRow, 'lane-matriarch'));
    const calfRow = screen.getByTestId(testId(TEST_IDS.laneRow, 'lane-calf-1'));

    expect(within(calfRow).getByTestId(TEST_IDS.laneRowUnread)).toBeTruthy();
    expect(within(matriarchRow).getByTestId(TEST_IDS.laneRowPin)).toBeTruthy();
    expect(within(calfRow).getByTestId(TEST_IDS.laneRowSteer)).toBeTruthy();

    // And the bare ids are literally the contract's strings, not suffixed
    // variants of them — the regression that sent T8's lookups to zero hits.
    for (const el of [
      within(calfRow).getByTestId(TEST_IDS.laneRowUnread),
      within(matriarchRow).getByTestId(TEST_IDS.laneRowPin),
      within(calfRow).getByTestId(TEST_IDS.laneRowSteer),
    ]) {
      expect(el.getAttribute('data-testid')).not.toContain(':');
    }
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
  });

  it('the split transcript renders the split id', () => {
    render(
      <TranscriptPane
        lane={makeCalf('lane-calf-1')}
        view={makeView([makeEvent(1, { type: 'assistant_text', text: 'pinned' })])}
        lanes={[makeLane(), makeCalf('lane-calf-1')]}
        routingMode="lanes"
        isSplit
        hasMore={false}
        onLoadMore={noop}
        onJumpToLane={noop}
        permissionSlot={null}
      />,
    );
    expect(screen.getByTestId(TEST_IDS.transcriptSplit)).toBeTruthy();
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
