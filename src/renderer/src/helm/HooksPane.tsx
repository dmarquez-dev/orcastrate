/**
 * HOOKS ARE A VALIDATED RAW-JSON PANE, NOT A BUILDER (design section 7).
 *
 * There is no matcher dropdown here, no "add a hook" row, and no event-name
 * select, and that is the design's decision rather than an unfinished one: a
 * partial builder would misrepresent what hooks can express, and a user whose
 * hooks block does something the builder cannot draw would find the builder had
 * quietly flattened it.
 *
 * So the pane is a textarea over the pretty-printed `hooks` value, and the
 * validation the state layer already runs — `JSON.parse`, then "must be an
 * object" — renders its message at `helmHooksError`. `blocked` is what turns
 * Save off; this component never reasons about the button.
 */

import type { JSX } from 'react';

import type { HelmValidationIssue } from '@shared/contracts/helm';
import { PANEL_TEST_IDS } from '../contracts/renderer-panels';

import { COPY } from './copy';
import { cx } from './cx';
import { IssueList } from './IssueList';
import styles from './Helm.module.css';

export interface HooksPaneProps {
  value: string;
  disabled: boolean;
  issues: readonly HelmValidationIssue[];
  onChange(next: string): void;
}

const TEXTAREA_ID = 'helm-hooks-textarea';
const HINT_ID = 'helm-hooks-hint';

export function HooksPane({ value, disabled, issues, onChange }: HooksPaneProps): JSX.Element {
  const invalid = issues.some((issue) => issue.severity === 'error');

  return (
    <fieldset className={styles.section} disabled={disabled}>
      <legend className={styles.legend}>{COPY.hooksLegend}</legend>

      <div className={styles.field}>
        <label className={styles.label} htmlFor={TEXTAREA_ID}>
          {COPY.hooksLabel}
        </label>
        <textarea
          aria-describedby={
            issues.length === 0 ? HINT_ID : `${HINT_ID} ${PANEL_TEST_IDS.helmHooksError}`
          }
          aria-invalid={invalid}
          className={cx(styles.textarea, styles.mono)}
          data-testid={PANEL_TEST_IDS.helmHooksJson}
          disabled={disabled}
          id={TEXTAREA_ID}
          onChange={(event) => {
            onChange(event.target.value);
          }}
          rows={10}
          spellCheck={false}
          value={value}
        />
        <span className={styles.hint} id={HINT_ID}>
          {COPY.hooksHint}
        </span>
        <IssueList
          id={PANEL_TEST_IDS.helmHooksError}
          issues={issues}
          testId={PANEL_TEST_IDS.helmHooksError}
        />
      </div>
    </fieldset>
  );
}
