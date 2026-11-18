/**
 * Every banner Helm can show, arranged. Presentation only — it takes strings
 * and renders them, and reaches for no hook.
 *
 * THE MESSAGE MAIN WROTE IS THE MESSAGE ON SCREEN, with one exception. A
 * `loadError`, and any `actionError` other than a rejected save's, is printed
 * verbatim, `white-space: pre-wrap`, no rewriting: an `EACCES` a user can
 * paste into a search is worth more than a sentence Helm invented about it.
 * THE EXCEPTION is a rejected save. Its message from main is not rendered
 * anywhere: it says the file changed and nothing was written, which is what
 * the conflict banner's lead already says, with the file named.
 *
 * ONE CONFLICT, ONE STATEMENT. A rejected save sets BOTH `conflict` and
 * `actionError` to main's sentence. The conflict banner's statement is
 * `COPY.conflictLead` (with the file's display path) plus
 * `COPY.conflictAdvice`, and the Compare button; `conflict` decides only that
 * the banner is up. The generic error banner stays out of the way, and the
 * stale banner is not rendered while the conflict banner is, because it would
 * say a third time that the file changed. Any other `actionError` — a refused
 * save, an `EPERM`, a failed reload — still renders at `helmError`, which is
 * what keeps all three `helm:*` channels off the surfaceless allowlist.
 */

import type { JSX } from 'react';

import type { HelmValidationIssue } from '@shared/contracts/helm';
import { PANEL_TEST_IDS } from '../contracts/renderer-panels';

import { COPY } from './copy';
import { IssueList } from './IssueList';
import { Notice } from './Notice';
import { HELM_SAFETY_TEST_IDS } from './test-ids';
import styles from './Helm.module.css';

export interface HelmNoticesProps {
  /** `Loadable.error`, non-null iff the scope list itself failed. */
  loadError: string | null;
  actionError: string | null;
  /**
   * Main's sentence for a rejected save. Non-null puts the conflict banner up;
   * the sentence itself is not rendered.
   */
  conflict: string | null;
  /** The file the conflict was about. Display only. */
  conflictDisplayPath: string | null;
  stale: boolean;
  /** `document.parseError`. Non-null means the form is read-only. */
  parseError: string | null;
  /** Non-null once a save has landed for the scope on screen. */
  backupDisplayPath: string | null;
  /** Issues no control claimed. Whatever their `field`, they surface here. */
  unplaced: readonly HelmValidationIssue[];
  /**
   * True while a `compare()` is in flight. The button stays live — `compare()`
   * takes no in-flight lock beyond this flag and a second call is allowed —
   * and only says what it is doing.
   */
  comparing: boolean;
  /**
   * Reaches `actions.compare()`. It is offered HERE, on the conflict banner,
   * because a conflict is the case the amended `HELM_CONFLICT_CODE` docblock
   * describes: the draft survived, and the whole point of the feature is
   * seeing what it would have replaced. Following the banner's advice now
   * leads somewhere that does not destroy the draft.
   */
  onCompare(): void;
}

export function HelmNotices({
  loadError,
  actionError,
  conflict,
  conflictDisplayPath,
  stale,
  parseError,
  backupDisplayPath,
  unplaced,
  comparing,
  onCompare,
}: HelmNoticesProps): JSX.Element {
  // ONE FAILURE READS AS ONE FAILURE. The same shape as
  // `beachcomber/BeachcomberError.tsx`: build the list, drop a repeat, render
  // one paragraph per surviving message, and render no banner at all when
  // nothing survives. Two pairs collapse here, and they are different pairs.
  // A REJECTED SAVE sets `conflict` and `actionError` to the same sentence.
  // The conflict banner reports it in Helm's own words — `COPY.conflictLead`
  // and `COPY.conflictAdvice` — and does not render main's sentence, so it is
  // dropped from here entirely and printed nowhere. A FAILED `helm:scopes`
  // sets `Loadable.error` AND `actionError` to the same sentence, and printing
  // it twice reads as two separate failures.
  const messages: string[] = [];
  if (loadError !== null) messages.push(loadError);
  if (actionError !== null && actionError !== conflict && actionError !== loadError) {
    messages.push(actionError);
  }

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

      {messages.length === 0 ? null : (
        <Notice
          heading={COPY.errorHeading}
          live="alert"
          testId={PANEL_TEST_IDS.helmError}
          tone="danger"
        >
          {/* Verbatim, `white-space: pre-wrap` — the message main wrote. */}
          {messages.map((message) => (
            <p className={styles.noticeText} key={message}>
              {message}
            </p>
          ))}
        </Notice>
      )}

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
          <p className={styles.noticeText}>{COPY.conflictAdvice}</p>
          <button
            className={styles.button}
            data-testid={HELM_SAFETY_TEST_IDS.compare}
            onClick={onCompare}
            type="button"
          >
            {comparing ? COPY.comparing : COPY.compare}
          </button>
        </Notice>
      )}

      {/*
        The stale banner stands down while a conflict banner is up: the conflict
        banner already says the file changed, and says what to do about it.
      */}
      {stale && conflict === null ? (
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
          heading={COPY.savedHeading}
          live="status"
          testId={PANEL_TEST_IDS.helmBackupPath}
          tone="success"
        >
          <p className={styles.noticeText}>
            {COPY.backupLabel} <span className={styles.path}>{backupDisplayPath}</span>
          </p>
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
