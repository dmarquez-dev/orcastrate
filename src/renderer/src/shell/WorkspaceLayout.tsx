import type { JSX } from 'react';

import { PANEL_TEST_IDS } from '../contracts/renderer-panels';
import { TEST_IDS, type WorkspaceLayoutProps } from '../contracts/renderer-view';
import styles from './WorkspaceLayout.module.css';

/**
 * The frame of spec 5.1, and nothing else.
 *
 * Every region is a SLOT. This component never imports a component from T5,
 * T6 or T7 — it receives them, which is what lets the four renderer tasks land
 * in any order (frozen `renderer-view.ts`, composition rule).
 *
 * THE PANEL REGION (sub-session 3). `panelBar` is a strip rendered directly
 * beneath the Pod bar on EVERY render — it is chrome, not a state. `panel`,
 * when non-null, replaces the body: rail, transcript pane(s) and composer, and
 * the empty state too, because Beachcomber and Helm are exactly the two things
 * a user with no Pods plausibly wants. The Pod bar and the strip stay put, so
 * the user can see which Pod they are coming back to.
 *
 * WHEN `panel` IS NULL THE TREE BELOW IS WHAT IT ALWAYS WAS. The strip region
 * is a new SIBLING of the body, never a wrapper around it: no existing element
 * moved, and no existing `data-testid` changed depth or name.
 *
 * Both new props are optional in the frozen contract as a compile-time
 * concession, not a design — `App.tsx` passes both on every render, and its
 * suite asserts it. This component still has to survive `undefined`, so it
 * reads `panel` as "non-null" rather than as "present".
 */
export function WorkspaceLayout({
  podBar,
  laneRail,
  primary,
  split,
  composer,
  empty,
  panelBar,
  panel,
}: WorkspaceLayoutProps): JSX.Element {
  const isSplit = split !== null;
  const panelOpen = panel !== null && panel !== undefined;

  return (
    <div className={styles.workspace} data-testid={TEST_IDS.workspace}>
      <div className={styles.podBarRegion}>{podBar}</div>
      <div className={styles.panelBarRegion}>{panelBar}</div>

      {panelOpen ? (
        <div className={styles.panelRegion} data-testid={PANEL_TEST_IDS.panelRegion}>
          {panel}
        </div>
      ) : empty === undefined ? (
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
