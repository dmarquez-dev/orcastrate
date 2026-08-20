import type { JSX } from 'react';

import { PANEL_TEST_IDS } from '../contracts/renderer-panels';
import { BEACHCOMBER_LOCAL_TEST_IDS, COPY } from './copy';
import { formatBytes, formatCount } from './format';
import styles from './Beachcomber.module.css';

export interface BeachcomberToolbarProps {
  selectedCount: number;
  selectedBytes: number;
  scanning: boolean;
  previewing: boolean;
  trashing: boolean;
  onRescan(): void;
  onClearSelection(): void;
  onRequestPreview(): void;
}

/**
 * The panel's controls, and the ONLY route to a preview.
 *
 * THERE IS NO TRASH AFFORDANCE HERE, and there is none on a row either. The
 * single element that can invoke `trashPreviewed` is the confirm button inside
 * the rendered preview — design section 6 requires "a preview of exactly what
 * will be removed before any action", and a one-click delete is that
 * requirement's opposite.
 */
export function BeachcomberToolbar({
  selectedCount,
  selectedBytes,
  scanning,
  previewing,
  trashing,
  onRescan,
  onClearSelection,
  onRequestPreview,
}: BeachcomberToolbarProps): JSX.Element {
  const hasSelection = selectedCount > 0;

  return (
    <div className={styles.toolbar}>
      <button
        className={styles.button}
        data-testid={PANEL_TEST_IDS.beachcomberRescan}
        disabled={scanning || trashing}
        onClick={onRescan}
        type="button"
      >
        {scanning ? COPY.rescanning : COPY.rescan}
      </button>

      <p
        className={styles.selectionSummary}
        data-testid={BEACHCOMBER_LOCAL_TEST_IDS.selectionSummary}
      >
        {hasSelection
          ? `${formatCount(selectedCount, 'item', 'items')} selected · ${formatBytes(selectedBytes)}`
          : COPY.nothingSelected}
      </p>

      <button
        className={styles.button}
        data-testid={BEACHCOMBER_LOCAL_TEST_IDS.clearSelection}
        disabled={!hasSelection || trashing}
        onClick={onClearSelection}
        type="button"
      >
        {COPY.clearSelection}
      </button>

      <button
        className={`${styles.button} ${styles.buttonPrimary}`}
        data-testid={PANEL_TEST_IDS.beachcomberPreviewButton}
        disabled={!hasSelection || previewing || trashing}
        onClick={onRequestPreview}
        type="button"
      >
        {previewing ? COPY.previewPending : COPY.previewButton}
      </button>
    </div>
  );
}
