import { useEffect, useId, useRef, useState, type JSX, type KeyboardEvent } from 'react';

import type { Pod } from '@shared/contracts/events';
import styles from './DeletePodDialog.module.css';

/**
 * Local `data-testid` bases, for the same reason `POD_TAB_OPEN_TEST_ID` is
 * local: none of these crosses a task boundary, and the frozen `TEST_IDS` says
 * a component's internal ids stay out of it as long as they do not collide.
 */
export const DELETE_POD_TEST_IDS = {
  dialog: 'delete-pod-dialog',
  session: 'delete-pod-session',
  confirm: 'delete-pod-confirm',
  cancel: 'delete-pod-cancel',
  error: 'delete-pod-error',
} as const;

/**
 * Every sentence the confirmation says, in one place.
 *
 * `historyWarning` is the one this feature exists to add: `pods.delete` has
 * always removed the Pod's transcript history and no dialog has ever said so.
 * `sessionLabel` describes the checkbox in terms of WHAT IS REMOVED and where
 * it goes — one conversation file, to the recycle bin, restorable — because
 * "delete the session directory" is not what happens and would name a
 * directory shared with every other Pod and every hand-run CLI session in the
 * same working directory.
 */
export const DELETE_POD_COPY = {
  heading: 'Delete Pod',
  historyWarning: "This Pod's transcript history is removed permanently.",
  sessionLabel:
    "Also move this Pod's Claude Code conversation file to the recycle bin. You can restore it from there.",
  cancel: 'Cancel',
  confirm: 'Delete',
  confirming: 'Deleting…',
  dismiss: 'Dismiss',
  /** Shown beside `sessionError` so the two facts are not confused. */
  podDeletedAnyway: 'The Pod itself was deleted.',
} as const;

export interface DeletePodDialogProps {
  /** Null when closed. The Pod being deleted, so the copy can name it. */
  pod: Pod | null;
  /** True while the `pods.delete` call is in flight. Both buttons disable. */
  submitting: boolean;
  /**
   * Rendered inside the dialog, which STAYS OPEN. Covers both a failed delete
   * and a successful delete whose session file could not be binned.
   */
  error: string | null;
  /**
   * True once the call came back with `podDeleted`. The row is already gone
   * from the bar, so there is nothing left to confirm and Delete would be a
   * second call answering `NOT_FOUND`; Dismiss is the only remaining button.
   *
   * An INTERNAL prop, not part of the frozen surface — it is the dialog's own
   * two-phase state, and the alternative (inferring "already deleted" from the
   * error text) would be a parse of a platform message.
   */
  podDeleted: boolean;
  onCancel(): void;
  onConfirm(deleteSession: boolean): void;
}

/**
 * THE ONLY ROUTE TO `deletePod`. The tab's delete control opens this; nothing
 * on a tab, in the bar, or in the panel reaches the action.
 */
export function DeletePodDialog({
  pod,
  submitting,
  error,
  podDeleted,
  onCancel,
  onConfirm,
}: DeletePodDialogProps): JSX.Element | null {
  const [deleteSession, setDeleteSession] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const headingId = useId();
  const historyId = useId();
  const podId = pod?.id ?? null;

  // Reset on each fresh open — the checkbox DEFAULTS OFF, every time, and a
  // decision made about one Pod must never carry into another. Focus moves to
  // the dialog so the user hears what is about to be destroyed before reaching
  // a button.
  useEffect(() => {
    if (podId === null) return;
    setDeleteSession(false);
    dialogRef.current?.focus();
  }, [podId]);

  if (pod === null) return null;

  /*
   * ABSENT, NOT DISABLED, when there is no session file. `ccSessionId` is null
   * for a Pod that never reached its first turn, so there is nothing on disk;
   * an unchecked box implying a file exists is a lie about state, and a
   * disabled one still reads as "there is a thing here you may not have".
   */
  const hasSession = pod.ccSessionId !== null;

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onCancel();
    }
  }

  return (
    <div className={styles.scrim}>
      <div
        aria-describedby={historyId}
        aria-labelledby={headingId}
        aria-modal="true"
        className={styles.dialog}
        data-testid={DELETE_POD_TEST_IDS.dialog}
        onKeyDown={handleKeyDown}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <h2 className={styles.heading} id={headingId}>
          {DELETE_POD_COPY.heading}
        </h2>

        {/* The title, so a mis-click on the wrong tab is visible. */}
        <p className={styles.subject}>{pod.title}</p>

        <p className={styles.warning} id={historyId}>
          {DELETE_POD_COPY.historyWarning}
        </p>

        {hasSession ? (
          <label className={styles.session}>
            <input
              checked={deleteSession}
              data-testid={DELETE_POD_TEST_IDS.session}
              disabled={submitting || podDeleted}
              onChange={(event) => {
                setDeleteSession(event.target.checked);
              }}
              type="checkbox"
            />
            {DELETE_POD_COPY.sessionLabel}
          </label>
        ) : null}

        {error === null ? null : (
          <p className={styles.error} data-testid={DELETE_POD_TEST_IDS.error} role="alert">
            {/* The platform's message VERBATIM, and — when the row is already
                gone — which of the two things actually happened. */}
            {podDeleted ? `${DELETE_POD_COPY.podDeletedAnyway} ${error}` : error}
          </p>
        )}

        <div className={styles.actions}>
          <button
            className={styles.button}
            data-testid={DELETE_POD_TEST_IDS.cancel}
            disabled={submitting}
            onClick={onCancel}
            type="button"
          >
            {podDeleted ? DELETE_POD_COPY.dismiss : DELETE_POD_COPY.cancel}
          </button>
          {podDeleted ? null : (
            <button
              className={`${styles.button} ${styles.buttonDanger}`}
              data-testid={DELETE_POD_TEST_IDS.confirm}
              disabled={submitting}
              onClick={() => {
                onConfirm(deleteSession);
              }}
              type="button"
            >
              {submitting ? DELETE_POD_COPY.confirming : DELETE_POD_COPY.confirm}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
