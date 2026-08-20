/**
 * The validation issues for one control, rendered beneath it.
 *
 * Severity is spelled out in words ("Error", "Warning") as well as coloured,
 * because colour is never the only carrier of meaning. The list carries an
 * `id` so the control above it can point at it with `aria-describedby`, which
 * is what makes the message reachable from the field by a screen reader rather
 * than only findable by hunting.
 */

import type { JSX } from 'react';

import type { HelmValidationIssue } from '@shared/contracts/helm';

import { COPY } from './copy';
import { cx } from './cx';
import styles from './Helm.module.css';

export interface IssueListProps {
  id: string;
  issues: readonly HelmValidationIssue[];
  /** Set when the whole list is one control's error surface, e.g. hooks. */
  testId?: string;
}

export function IssueList({ id, issues, testId }: IssueListProps): JSX.Element | null {
  if (issues.length === 0) return null;

  return (
    <ul className={styles.issues} data-testid={testId} id={id}>
      {issues.map((issue, index) => (
        <li
          className={cx(
            styles.issue,
            issue.severity === 'error' ? styles.issueError : styles.issueWarning,
          )}
          // Field plus index: the same field can carry two issues, and nothing
          // in the contract makes a message unique.
          key={`${issue.field}-${String(index)}`}
        >
          <span className={styles.issueSeverity}>
            {issue.severity === 'error' ? COPY.severityError : COPY.severityWarning}
          </span>{' '}
          {issue.message}
        </li>
      ))}
    </ul>
  );
}
