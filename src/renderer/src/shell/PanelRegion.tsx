import { useEffect, useRef, type JSX, type KeyboardEvent, type ReactNode } from 'react';

import {
  PANEL_LABELS,
  PANEL_TEST_IDS,
  type PanelKey,
} from '../contracts/renderer-panels';
import styles from './PanelRegion.module.css';
import { testId } from './contract-runtime';

export interface PanelRegionProps {
  /** Which panel is inside. Names the region and stamps its test id. */
  panelKey: PanelKey;
  onClose(): void;
  children: ReactNode;
}

/**
 * The identified, focusable container the open panel renders into —
 * `panel-region:beachcomber` / `panel-region:helm`.
 *
 * WHY IT IS NOT `WorkspaceLayout`'S JOB. The layout is a frame of slots and
 * deliberately knows nothing about what fills one; it cannot name a region
 * after a panel it has never heard of. So the layout owns the grid cell (and
 * carries the unsuffixed `panel-region` id on it) and this component owns the
 * panel's identity, its label, its measure and its focus.
 *
 * FOCUS MOVES IN ON OPEN. `tabIndex={-1}` makes the region focusable by script
 * only; the mount effect focuses it so the next Tab lands inside the panel
 * rather than back at the top of the window. `PanelBar` owns the return trip.
 *
 * ESCAPE CLOSES. It cannot reach the composer's interrupt binding, because
 * that binding is a keydown handler on the composer's own textarea and the
 * composer is not mounted while a panel is open — an open panel replaces it.
 * A panel's own dialog stops the key before it arrives here (Beachcomber's
 * preview dialog does exactly that), so Escape unwinds one layer at a time.
 */
export function PanelRegion({ panelKey, onClose, children }: PanelRegionProps): JSX.Element {
  const region = useRef<HTMLElement | null>(null);

  useEffect(() => {
    region.current?.focus();
  }, [panelKey]);

  function handleKeyDown(event: KeyboardEvent<HTMLElement>): void {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    onClose();
  }

  return (
    <section
      aria-label={PANEL_LABELS[panelKey]}
      className={styles.region}
      data-testid={testId(PANEL_TEST_IDS.panelRegion, panelKey)}
      onKeyDown={handleKeyDown}
      ref={region}
      tabIndex={-1}
    >
      <div className={styles.content}>{children}</div>
    </section>
  );
}
