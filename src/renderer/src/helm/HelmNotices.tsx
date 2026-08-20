/**
 * Every banner Helm can show, arranged. Presentation only — it takes strings
 * and renders them, and reaches for no hook.
 *
 * THE MESSAGE MAIN WROTE IS THE MESSAGE ON SCREEN. `loadError` and
 * `actionError` are printed verbatim, `white-space: pre-wrap`, no rewriting:
 * an `EACCES` a user can paste into a search is worth more than a sentence
 * Helm invented about it.
 *
 * ONE MESSAGE, ONE PLACE. A rejected save sets BOTH `conflict` and
 * `actionError` to the same string, so when they are equal the conflict banner
 * is its surface and the generic error banner stays out of the way. Any other
 * `actionError` — a refused save, an `EPERM`, a failed reload — still renders
 * at `helmError`, which is what keeps all three `helm:*` channels off the
 * surfaceless allowlist.
 */

import type { JSX } from 'react';

import type { HelmValidationIssue } from '@shared/contracts/helm';
import { PANEL_TEST_IDS } from '../contracts/renderer-panels';

import { COPY } from './copy';
import { IssueList } from './IssueList';
import { Notice } from './Notice';
import styles from './Helm.module.css';

export interface HelmNoticesProps {
  /** `Loadable.error`, non-null iff the scope list itself failed. */
  loadError: string | null;
  actionError: string | null;
  conflict: string | null;
  /** The file the conflict was about. Display only. */
  conflictDisplayPath: string | null;
  stale: boolean;
  /** `document.parseError`. Non-null means the form is read-only. */
  parseError: string | null;
  /** Non-null once a save has landed for the scope on screen. */
  backupDisplayPath: string | null;
  warnings: readonly HelmValidationIssue[];
  /** Issues no control claimed. Whatever their `field`, they surface here. */
  unplaced: readonly HelmValidationIssue[];
}

export function HelmNotices({
  loadError,
  actionError,
  conflict,
  conflictDisplayPath,
  stale,
  parseError,
  backupDisplayPath,
  warnings,
  unplaced,
}: HelmNoticesProps): JSX.Element {
  const redundant = actionError !== null && actionError === conflict;
  const showError = loadError !== null || (actionError !== null && !redundant);

  return (
    <>
      {parseError === null ? null : (
        <Notice
          heading={COPY.readOnlyHeading}
          live="alert"
          testId={PANEL_TEST_IDS.helmReadOnly}
          tone="danger"
        >
          <p className={styles.noticeText}>{parseError}</p>
          <p className={styles.noticeText}>{COPY.readOnlyBody}</p>
        </Notice>
      )}

      {showError ? (
        <Notice
          heading={COPY.errorHeading}
          live="alert"
          testId={PANEL_TEST_IDS.helmError}
          tone="danger"
        >
          {loadError === null ? null : <p className={styles.noticeText}>{loadError}</p>}
          {actionError === null || redundant ? null : (
            <p className={styles.noticeText}>{actionError}</p>
          )}
        </Notice>
      ) : null}

      {conflict === null ? null : (
        <Notice
          heading={COPY.conflictHeading}
          live="alert"
          testId={PANEL_TEST_IDS.helmConflict}
          tone="danger"
        >
          {/*
            The fallback is a SENTENCE, not an empty string. A conflict always
            arrives with a scope selected, so `null` is unreachable today — but
            an empty string would render "…nothing was written to" and stop,
            which reads as a bug rather than as missing data. This way the
            banner is still a complete statement however it is reached.
          */}
          <p className={styles.noticeText}>
            {COPY.conflictLead} {conflictDisplayPath ?? COPY.conflictUnnamedFile}
          </p>
          <p className={styles.noticeText}>{conflict}</p>
          <p className={styles.noticeText}>{COPY.conflictAdvice}</p>
        </Notice>
      )}

      {stale ? (
        <Notice
          heading={COPY.staleHeading}
          live="status"
          testId={PANEL_TEST_IDS.helmStale}
          tone="warning"
        >
          <p className={styles.noticeText}>{COPY.staleBody}</p>
        </Notice>
      ) : null}

      {backupDisplayPath === null ? null : (
        <Notice
          heading={warnings.length === 0 ? COPY.savedHeading : COPY.warningsHeading}
          live="status"
          testId={PANEL_TEST_IDS.helmBackupPath}
          tone={warnings.length === 0 ? 'success' : 'warning'}
        >
          <p className={styles.noticeText}>
            {COPY.backupLabel} <span className={styles.path}>{backupDisplayPath}</span>
          </p>
          <IssueList id="helm-save-warnings" issues={warnings} />
        </Notice>
      )}

      {unplaced.length === 0 ? null : (
        <Notice heading={COPY.issuesHeading} live="alert" testId="helm-unplaced-issues" tone="danger">
          <IssueList id="helm-unplaced-issue-list" issues={unplaced} />
        </Notice>
      )}
    </>
  );
}
