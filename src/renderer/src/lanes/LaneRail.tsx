import { useMemo, useState } from 'react';

import type { LaneRowVm } from '../contracts/renderer-state';
import { PANE_TEST_IDS, TEST_IDS, type LaneRailProps } from '../contracts/renderer-view';
import styles from './LaneRail.module.css';
import { LaneRow } from './LaneRow';
import { partitionFinishedLanes } from './finished-lanes';

/**
 * Matriarch first, always — even when the caller hands the array shuffled.
 *
 * The state layer already guarantees this order (`renderer-state.ts`,
 * `LaneRowVm` ORDERING GUARANTEE), and the rail does not second-guess the rest
 * of it: this is a STABLE partition, so Calves keep exactly the relative order
 * they arrived in. The only thing enforced here is the one invariant spec 5.1
 * states in the UI's own terms.
 */
export function orderRailRows(rows: readonly LaneRowVm[]): LaneRowVm[] {
  const matriarchs: LaneRowVm[] = [];
  const calves: LaneRowVm[] = [];
  for (const row of rows) {
    if (row.isMatriarch) matriarchs.push(row);
    else calves.push(row);
  }
  return [...matriarchs, ...calves];
}

/** The list's DOM id, so the disclosure can point `aria-controls` at it. */
const FINISHED_GROUP_ID = 'lane-rail-lanes';

function finishedLabel(action: 'Show' | 'Hide', count: number): string {
  return `${action} ${count} finished ${count === 1 ? 'lane' : 'lanes'}`;
}

/**
 * The lane rail (spec 5.1). A LIST, not a second tab row: a `<ul>` of rows in
 * a `<nav>`, with the Matriarch at index 0 and Calves beneath.
 *
 * It renders `rows` and calls back. IT FETCHES NOTHING, HOLDS NO SERVER DATA,
 * AND RUNS NO TIMER. The one piece of state it does own is whether the
 * finished-lane disclosure is open, which is client interaction state and
 * belongs nowhere near the workspace store (`contracts/renderer-panes.ts`
 * section 6, and `panel-provider.tsx` from the other side).
 *
 * THE COLLAPSE IS A VIEW, NOT A FILTER. Nothing is removed from `rows`, from
 * the snapshot, or from the lane registry — a collapsed lane is still
 * selectable and still readable, it is simply not drawn until the disclosure is
 * opened. On expand the finished rows go back to their RAIL positions rather
 * than being appended, so a lane does not move when it finishes and move again
 * when it is revealed.
 */
export function LaneRail({
  rows,
  onSelect,
  onSteer,
  routingMode,
}: LaneRailProps) {
  const ordered = useMemo(() => orderRailRows(rows), [rows]);
  const { active, finished } = useMemo(() => partitionFinishedLanes(ordered), [ordered]);
  const [finishedExpanded, setFinishedExpanded] = useState(false);

  // Expanded, the list IS the finished group: it is the element that holds the
  // collapsed rows, and it carries the group id only while it holds them. A
  // separate container cannot serve — the finished rows go back INTERLEAVED
  // into rail order, so there is no contiguous run of DOM for one to wrap.
  const visible = finishedExpanded ? ordered : active;

  return (
    <nav className={styles.rail} data-testid={TEST_IDS.laneRail} aria-label="Lanes" data-routing-mode={routingMode}>
      <h2 className={styles.railHeading} id="lane-rail-heading">
        Lanes
      </h2>

      {routingMode === 'inline' ? (
        // Spec 4.3 fallback. Selecting a Calf does not filter the transcript in
        // this mode, so the rail says that outright instead of letting the
        // selection highlight imply a filter that is not happening.
        <p className={styles.inlineNote}>
          Inline mode: every event appears in the Matriarch transcript. Selecting a lane here shows
          its status; it does not filter the transcript.
        </p>
      ) : null}

      {ordered.length === 0 ? (
        <p className={styles.emptyState}>No lanes yet.</p>
      ) : (
        <ul
          className={styles.list}
          id={FINISHED_GROUP_ID}
          aria-labelledby="lane-rail-heading"
          data-testid={
            finishedExpanded && finished.length > 0
              ? PANE_TEST_IDS.laneRailFinishedGroup
              : undefined
          }
        >
          {visible.map((row) => (
            <LaneRow
              key={row.lane.id}
              row={row}
              onSelect={onSelect}
              onSteer={onSteer}
            />
          ))}
        </ul>
      )}

      {/*
        ALWAYS PRESENT WHILE IT HAS ANYTHING TO HIDE, and labelled with the
        count — an affordance that vanishes when it is doing the most work is
        how a user loses a lane.
      */}
      {finished.length > 0 ? (
        <button
          type="button"
          className={styles.finishedToggle}
          data-testid={PANE_TEST_IDS.laneRailFinishedToggle}
          aria-expanded={finishedExpanded}
          aria-controls={FINISHED_GROUP_ID}
          onClick={() => setFinishedExpanded((open) => !open)}
        >
          {finishedLabel(finishedExpanded ? 'Hide' : 'Show', finished.length)}
        </button>
      ) : null}
    </nav>
  );
}
