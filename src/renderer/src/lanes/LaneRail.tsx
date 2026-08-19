import { useMemo } from 'react';

import type { LaneRowVm } from '../contracts/renderer-state';
import { TEST_IDS, type LaneRailProps } from '../contracts/renderer-view';
import styles from './LaneRail.module.css';
import { LaneRow } from './LaneRow';

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

/**
 * The lane rail (spec 5.1). A LIST, not a second tab row: a `<ul>` of rows in
 * a `<nav>`, with the Matriarch at index 0 and Calves beneath.
 *
 * It renders `rows` and calls back. It fetches nothing, holds no state, and
 * runs no timer.
 */
export function LaneRail({ rows, onSelect, onPin, onUnpin, onSteer, routingMode }: LaneRailProps) {
  const ordered = useMemo(() => orderRailRows(rows), [rows]);

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
        <ul className={styles.list} aria-labelledby="lane-rail-heading">
          {ordered.map((row) => (
            <LaneRow
              key={row.lane.id}
              row={row}
              onSelect={onSelect}
              onPin={onPin}
              onUnpin={onUnpin}
              onSteer={onSteer}
            />
          ))}
        </ul>
      )}
    </nav>
  );
}
