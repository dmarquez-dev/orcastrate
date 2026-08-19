import type { JSX } from 'react';

import { TEST_IDS, type WorkspaceLayoutProps } from '../contracts/renderer-view';
import styles from './WorkspaceLayout.module.css';

/**
 * The frame of spec 5.1, and nothing else.
 *
 * Every region is a SLOT. This component never imports a component from T5,
 * T6 or T7 — it receives them, which is what lets the four renderer tasks land
 * in any order (frozen `renderer-view.ts`, composition rule).
 */
export function WorkspaceLayout({
  podBar,
  laneRail,
  primary,
  split,
  composer,
  empty,
}: WorkspaceLayoutProps): JSX.Element {
  const isSplit = split !== null;

  return (
    <div className={styles.workspace} data-testid={TEST_IDS.workspace}>
      <div className={styles.podBarRegion}>{podBar}</div>

      {empty === undefined ? (
        <div className={styles.body}>
          <div className={styles.laneRailRegion}>{laneRail}</div>
          <div className={styles.centerColumn}>
            <div
              className={isSplit ? `${styles.panes} ${styles.panesSplit}` : styles.panes}
              data-split={isSplit ? 'true' : 'false'}
            >
              <div className={styles.pane}>{primary}</div>
              {isSplit ? <div className={`${styles.pane} ${styles.splitPane}`}>{split}</div> : null}
            </div>
            <div className={styles.composerRegion}>{composer}</div>
          </div>
        </div>
      ) : (
        <div className={styles.emptyRegion}>{empty}</div>
      )}
    </div>
  );
}
