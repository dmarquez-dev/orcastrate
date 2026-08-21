/**
 * `contracts/renderer-panes.ts` section 6, rule by rule.
 *
 * The partition is the whole of the collapse decision, so each of the four
 * stated rules gets an assertion that would fail if that rule alone were
 * dropped — a row that WOULD collapse but for the one field under test, paired
 * with a control row that does collapse.
 */
import { describe, expect, it } from 'vitest';

import {
  FINISHED_LANE_STATUSES,
  isCollapsibleFinishedLane,
  partitionFinishedLanes,
  type LaneRowLike,
} from './finished-lanes';
import { makeCalf, makeLane } from './test-fixtures';

function row(overrides: Partial<LaneRowLike> = {}): LaneRowLike {
  const lane = overrides.lane ?? makeCalf();
  return {
    lane,
    isMatriarch: lane.kind === 'matriarch',
    status: 'done',
    unreadEventCount: 0,
    awaitingPermission: false,
    inPrimaryPane: false,
    inFollowerPane: false,
    ...overrides,
  };
}

/** The baseline every rule below is a deviation from: it MUST collapse, or the
 *  rule assertions would all pass for the wrong reason. */
const COLLAPSIBLE = row({ lane: makeCalf({ id: 'lane-plain-done' }) });

describe('FINISHED_LANE_STATUSES', () => {
  it('is exactly done and orphaned', () => {
    expect([...FINISHED_LANE_STATUSES]).toEqual(['done', 'orphaned']);
  });
});

describe('isCollapsibleFinishedLane — the four never-collapse rules', () => {
  it('collapses an ordinary finished Calf (the control for every rule below)', () => {
    expect(isCollapsibleFinishedLane(COLLAPSIBLE)).toBe(true);
    expect(isCollapsibleFinishedLane(row({ status: 'orphaned' }))).toBe(true);
  });

  it('never collapses the Matriarch, whatever its status', () => {
    for (const status of FINISHED_LANE_STATUSES) {
      expect(
        isCollapsibleFinishedLane(row({ lane: makeLane(), isMatriarch: true, status })),
      ).toBe(false);
    }
    // The loop ran over something. (A previous session shipped a guard that
    // asserted over zero items and looked green.)
    expect(FINISHED_LANE_STATUSES.length).toBeGreaterThan(0);
  });

  it('never collapses a lane in the primary or a follower pane', () => {
    expect(isCollapsibleFinishedLane(row({ inPrimaryPane: true }))).toBe(false);
    expect(isCollapsibleFinishedLane(row({ inFollowerPane: true }))).toBe(false);
  });

  it('never collapses a lane awaiting permission or holding unread events', () => {
    expect(isCollapsibleFinishedLane(row({ awaitingPermission: true }))).toBe(false);
    expect(isCollapsibleFinishedLane(row({ unreadEventCount: 1 }))).toBe(false);
    // Zero unread is not "something unseen" — it is the control case.
    expect(isCollapsibleFinishedLane(row({ unreadEventCount: 0 }))).toBe(true);
  });

  it('never collapses a lane whose status is not finished', () => {
    expect(isCollapsibleFinishedLane(row({ status: 'running' }))).toBe(false);
  });
});

describe('partitionFinishedLanes', () => {
  it('is total: every input row lands in exactly one half', () => {
    const rows = [
      row({ lane: makeLane(), isMatriarch: true, status: 'orphaned' }),
      row({ lane: makeCalf({ id: 'lane-a' }), status: 'running' }),
      row({ lane: makeCalf({ id: 'lane-b' }) }),
      row({ lane: makeCalf({ id: 'lane-c' }), status: 'orphaned', unreadEventCount: 3 }),
      row({ lane: makeCalf({ id: 'lane-d' }), status: 'orphaned' }),
    ];

    const { active, finished } = partitionFinishedLanes(rows);

    expect(active.length + finished.length).toBe(rows.length);
    expect([...active, ...finished].map((r) => r.lane.id).sort()).toEqual(
      rows.map((r) => r.lane.id).sort(),
    );
    expect(active.map((r) => r.lane.id)).toEqual([
      'lane-matriarch',
      'lane-a',
      'lane-c',
    ]);
    expect(finished.map((r) => r.lane.id)).toEqual(['lane-b', 'lane-d']);
  });

  it('preserves the incoming order within each half', () => {
    const rows = [
      row({ lane: makeCalf({ id: 'f1' }) }),
      row({ lane: makeCalf({ id: 'a1' }), status: 'running' }),
      row({ lane: makeCalf({ id: 'f2' }) }),
      row({ lane: makeCalf({ id: 'a2' }), status: 'running' }),
      row({ lane: makeCalf({ id: 'f3' }) }),
    ];
    const { active, finished } = partitionFinishedLanes(rows);
    expect(active.map((r) => r.lane.id)).toEqual(['a1', 'a2']);
    expect(finished.map((r) => r.lane.id)).toEqual(['f1', 'f2', 'f3']);
  });

  it('is pure: it does not mutate or reorder its input', () => {
    const rows = [row({ lane: makeCalf({ id: 'x' }) }), row({ lane: makeCalf({ id: 'y' }), status: 'running' })];
    const snapshot = rows.map((r) => r.lane.id);
    const first = partitionFinishedLanes(rows);
    const second = partitionFinishedLanes(rows);
    expect(rows.map((r) => r.lane.id)).toEqual(snapshot);
    expect(first.finished.map((r) => r.lane.id)).toEqual(second.finished.map((r) => r.lane.id));
    // Fresh arrays each call — a caller may sort them without corrupting the rail.
    expect(first.active).not.toBe(second.active);
  });

  it('handles the empty rail', () => {
    expect(partitionFinishedLanes([])).toEqual({ active: [], finished: [] });
  });
});
