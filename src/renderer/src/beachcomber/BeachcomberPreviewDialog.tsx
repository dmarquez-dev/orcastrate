import { useId, type JSX, type KeyboardEvent, type RefObject } from 'react';

import type { BeachcomberPreview } from '@shared/contracts/beachcomber';
import { PANEL_TEST_IDS } from '../contracts/renderer-panels';
import { BeachcomberPreviewItem } from './BeachcomberPreviewItem';
import { BeachcomberRefusals } from './BeachcomberRefusals';
import { BEACHCOMBER_LOCAL_TEST_IDS, COPY } from './copy';
import { formatBytes, formatCount } from './format';
import { useDialogFocus } from './use-dialog-focus';
import styles from './BeachcomberPreviewDialog.module.css';

export interface BeachcomberPreviewDialogProps {
  preview: BeachcomberPreview;
  trashing: boolean;
  onConfirm(): void;
  onCancel(): void;
  /** Where focus goes if the control that opened this is gone or disabled by
   * the time it closes — which is exactly what confirming does to it. */
  fallbackFocusRef: RefObject<HTMLElement | null>;
}

/**
 * THE ONLY PLACE IN THIS DIRECTORY FROM WHICH ANYTHING CAN BE TRASHED.
 *
 * The confirm button is the single element wired to `trashPreviewed`. Nothing
 * on a row, in the toolbar, or in the result reaches it. Design section 6 asks
 * for "a preview of exactly what will be removed before any action", so the
 * preview is not a confirmation step bolted onto a delete — it is the only
 * route to one.
 *
 * Focus: opens onto the dialog, is trapped inside it, returns on close, and
 * Escape cancels. See `use-dialog-focus.ts` for why the return target is
 * conditional.
 */
export function BeachcomberPreviewDialog({
  preview,
  trashing,
  onConfirm,
  onCancel,
  fallbackFocusRef,
}: BeachcomberPreviewDialogProps): JSX.Element {
  const headingId = useId();
  const leadId = useId();
  const refusedHeadingId = useId();
  const { dialogRef, onKeyDown } = useDialogFocus(fallbackFocusRef);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onCancel();
      return;
    }
    onKeyDown(event);
  }

  const nothingToMove = preview.items.length === 0;

  return (
    <div className={styles.scrim}>
      <div
        aria-describedby={leadId}
        aria-labelledby={headingId}
        aria-modal="true"
        className={styles.dialog}
        data-testid={PANEL_TEST_IDS.beachcomberPreviewDialog}
        onKeyDown={handleKeyDown}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <h3 className={styles.heading} id={headingId}>
          {COPY.previewHeading}
        </h3>
        <p className={styles.lead} id={leadId}>
          {COPY.previewLead}
        </p>

        <p className={styles.totals} data-testid={BEACHCOMBER_LOCAL_TEST_IDS.previewTotals}>
          {`${formatCount(preview.items.length, 'item', 'items')} · ${formatBytes(
            preview.totalBytes,
          )} · ${formatCount(preview.totalFiles, 'file', 'files')}`}
        </p>

        {nothingToMove ? (
          <p className={styles.lead}>{COPY.previewEmpty}</p>
        ) : (
          <ul className={styles.items}>
            {preview.items.map((item) => (
              <BeachcomberPreviewItem item={item} key={item.id} />
            ))}
          </ul>
        )}

        <BeachcomberRefusals
          heading={COPY.previewRefusedHeading}
          headingId={refusedHeadingId}
          listTestId={PANEL_TEST_IDS.beachcomberPreviewRefused}
          refused={preview.refused}
        />

        <div className={styles.actions}>
          <button
            className={styles.button}
            data-testid={PANEL_TEST_IDS.beachcomberPreviewCancel}
            disabled={trashing}
            onClick={onCancel}
            type="button"
          >
            {COPY.previewCancel}
          </button>
          <button
            className={`${styles.button} ${styles.buttonDanger}`}
            data-testid={PANEL_TEST_IDS.beachcomberPreviewConfirm}
            disabled={trashing || nothingToMove}
            onClick={onConfirm}
            type="button"
          >
            {trashing ? COPY.previewConfirming : COPY.previewConfirm}
          </button>
        </div>
      </div>
    </div>
  );
}
