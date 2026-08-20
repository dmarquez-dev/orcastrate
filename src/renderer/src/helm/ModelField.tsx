/**
 * `model`. A plain text field, because the set of model names is Claude Code's
 * to know and not Orcastrate's — a select would go stale the week a model
 * ships.
 *
 * BLANK MEANS ABSENT. `HelmManagedFields.model` is `string | null`, where null
 * means the key is not in the file at all, and the state layer's own message
 * for a blank one says "Clear the field to use the default model." So an empty
 * input maps to `null` and the key round-trips out of the file rather than
 * being written as `""`.
 */

import type { JSX } from 'react';

import type { HelmValidationIssue } from '@shared/contracts/helm';
import { PANEL_TEST_IDS } from '../contracts/renderer-panels';

import { COPY } from './copy';
import { cx } from './cx';
import { IssueList } from './IssueList';
import styles from './Helm.module.css';

export interface ModelFieldProps {
  value: string | null;
  disabled: boolean;
  issues: readonly HelmValidationIssue[];
  onChange(next: string | null): void;
}

const INPUT_ID = 'helm-model-input';
const HINT_ID = 'helm-model-hint';
const ISSUES_ID = 'helm-model-issues';

export function ModelField({ value, disabled, issues, onChange }: ModelFieldProps): JSX.Element {
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={INPUT_ID}>
        {COPY.modelLabel}
      </label>
      <input
        aria-describedby={issues.length === 0 ? HINT_ID : `${HINT_ID} ${ISSUES_ID}`}
        aria-invalid={issues.some((issue) => issue.severity === 'error')}
        className={cx(styles.input, styles.mono)}
        data-testid={PANEL_TEST_IDS.helmModel}
        disabled={disabled}
        id={INPUT_ID}
        onChange={(event) => {
          const next = event.target.value;
          onChange(next === '' ? null : next);
        }}
        type="text"
        value={value ?? ''}
      />
      <span className={styles.hint} id={HINT_ID}>
        {COPY.modelHint}
      </span>
      <IssueList id={ISSUES_ID} issues={issues} />
    </div>
  );
}
