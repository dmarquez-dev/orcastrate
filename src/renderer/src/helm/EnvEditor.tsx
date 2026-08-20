/**
 * `env`, as name/value rows over a `Record<string, string>`.
 *
 * TWO THINGS A RECORD CANNOT DO, and how each is handled in the open rather
 * than silently:
 *
 *   - It cannot hold two rows with the same name. A rename onto an existing
 *     name is REFUSED and the refusal is rendered beside the row, because the
 *     alternative is destroying the other row's value with no trace.
 *   - It cannot hold two blank names, so Add is disabled while a blank one is
 *     on screen, with the reason spelled out next to the button rather than
 *     left for the user to deduce from a dead control.
 *
 * The rows are derived from the record on every render (`env-rows.ts`) and
 * never stored, so nothing here can disagree with the draft.
 */

import { useState, type JSX } from 'react';

import type { HelmValidationIssue } from '@shared/contracts/helm';
import { PANEL_TEST_IDS } from '../contracts/renderer-panels';

import { COPY } from './copy';
import { cx } from './cx';
import { addBlankRow, hasBlankKey, removeRow, renameKey, setValue, toRows } from './env-rows';
import { IssueList } from './IssueList';
import styles from './Helm.module.css';
import { useRowFocus } from './useRowFocus';

export interface EnvEditorProps {
  env: Readonly<Record<string, string>>;
  disabled: boolean;
  issues: readonly HelmValidationIssue[];
  onChange(next: Record<string, string>): void;
}

const ISSUES_ID = 'helm-env-issues';
const ADD_HINT_ID = 'helm-env-add-hint';

export function EnvEditor({ env, disabled, issues, onChange }: EnvEditorProps): JSX.Element {
  const focus = useRowFocus();
  // The one piece of state this component owns: which row's last rename was
  // refused. It is interaction state, it belongs to nothing else, and it is
  // cleared by the next accepted edit.
  const [duplicateAt, setDuplicateAt] = useState<number | null>(null);

  const rows = toRows(env);
  const blocked = hasBlankKey(env);

  return (
    <fieldset className={styles.section} disabled={disabled}>
      <legend className={styles.legend}>{COPY.envLegend}</legend>

      {rows.length === 0 ? <p className={styles.empty}>{COPY.envEmpty}</p> : null}

      <ul className={styles.rows} data-testid={PANEL_TEST_IDS.helmEnvList} ref={focus.listRef}>
        {rows.map((row, index) => {
          const position = String(index + 1);
          return (
            <li
              className={cx(styles.row, styles.envRow)}
              data-row-index={index}
              key={index}
            >
              <div className={styles.rowCell}>
                <input
                  aria-describedby={duplicateAt === index ? `${ISSUES_ID}-${position}` : undefined}
                  aria-invalid={duplicateAt === index}
                  aria-label={`${COPY.envNameLabel} ${position}`}
                  className={cx(styles.input, styles.rowInput, styles.mono)}
                  disabled={disabled}
                  onChange={(event) => {
                    const result = renameKey(env, index, event.target.value);
                    if (!result.ok) {
                      setDuplicateAt(index);
                      return;
                    }
                    setDuplicateAt(null);
                    onChange(result.env);
                  }}
                  type="text"
                  value={row.key}
                />
                {duplicateAt === index ? (
                  <span className={cx(styles.issue, styles.issueError)} id={`${ISSUES_ID}-${position}`}>
                    {COPY.envDuplicate}
                  </span>
                ) : null}
              </div>
              <div className={styles.rowCell}>
                <input
                  aria-label={`${COPY.envValueLabel} ${position}`}
                  className={cx(styles.input, styles.rowInput, styles.mono)}
                  disabled={disabled}
                  onChange={(event) => {
                    onChange(setValue(env, index, event.target.value));
                  }}
                  type="text"
                  value={row.value}
                />
              </div>
              <button
                aria-label={`${COPY.removeRow} ${COPY.envNameLabel} ${position}`}
                className={styles.button}
                disabled={disabled}
                onClick={() => {
                  setDuplicateAt(null);
                  focus.focusAfterRemove(index, rows.length - 1);
                  onChange(removeRow(env, index));
                }}
                type="button"
              >
                {COPY.removeRow}
              </button>
            </li>
          );
        })}
      </ul>

      <IssueList id={ISSUES_ID} issues={issues} />

      <div className={styles.field}>
        <div>
          <button
            aria-describedby={blocked ? ADD_HINT_ID : undefined}
            className={styles.button}
            data-testid={PANEL_TEST_IDS.helmEnvAdd}
            disabled={disabled || blocked}
            onClick={() => {
              focus.focusRow(rows.length);
              onChange(addBlankRow(env));
            }}
            ref={focus.fallbackRef}
            type="button"
          >
            {COPY.envAdd}
          </button>
        </div>
        {blocked ? (
          <span className={styles.hint} id={ADD_HINT_ID}>
            {COPY.envAddBlocked}
          </span>
        ) : null}
      </div>
    </fieldset>
  );
}
