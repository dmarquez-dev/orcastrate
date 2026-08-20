/**
 * The editor behind `permissions.allow` and `permissions.deny`. One component,
 * two instances — the two lists differ only in their copy and their test ids,
 * and a second component would have been a second place for the focus rules to
 * drift.
 *
 * Presentation only: it takes `values`, a `disabled` flag and an `onChange`,
 * and has never heard of a draft, a hook or an IPC channel.
 *
 * EVERY control carries a label. The rows have no visible heading of their own
 * — a column of numbered labels would be noise — so each input and each Remove
 * button gets an `aria-label` that names the list AND the row, which is what
 * makes "Remove" unambiguous when six of them are on screen.
 */

import type { JSX } from 'react';

import type { HelmValidationIssue } from '@shared/contracts/helm';

import { COPY } from './copy';
import { cx } from './cx';
import { IssueList } from './IssueList';
import styles from './Helm.module.css';
import { useRowFocus } from './useRowFocus';

export interface StringListEditorProps {
  legend: string;
  /** Singular, e.g. "Allow rule". Row labels read "Allow rule 2". */
  itemLabel: string;
  addLabel: string;
  emptyLabel: string;
  values: readonly string[];
  disabled: boolean;
  issues: readonly HelmValidationIssue[];
  listTestId: string;
  addTestId: string;
  /** Stable per instance; namespaces the `aria-describedby` target. */
  domId: string;
  onChange(next: string[]): void;
}

export function StringListEditor({
  legend,
  itemLabel,
  addLabel,
  emptyLabel,
  values,
  disabled,
  issues,
  listTestId,
  addTestId,
  domId,
  onChange,
}: StringListEditorProps): JSX.Element {
  const focus = useRowFocus();
  const issuesId = `${domId}-issues`;

  return (
    <fieldset className={styles.section} disabled={disabled}>
      <legend className={styles.legend}>{legend}</legend>

      {values.length === 0 ? <p className={styles.empty}>{emptyLabel}</p> : null}

      <ul className={styles.rows} data-testid={listTestId} ref={focus.listRef}>
        {values.map((value, index) => {
          const rowLabel = `${itemLabel} ${String(index + 1)}`;
          return (
            // Keyed by position because a row HAS no identity beyond its
            // position: two identical rules are two rows, and the draft is the
            // only owner of the text.
            <li className={styles.row} data-row-index={index} key={index}>
              <div className={styles.rowCell}>
                <input
                  aria-describedby={issues.length === 0 ? undefined : issuesId}
                  aria-label={rowLabel}
                  className={cx(styles.input, styles.rowInput, styles.mono)}
                  // Also on the control, not only on the `<fieldset>`: the IDL
                  // `disabled` property reflects the attribute alone, so a
                  // caller asking "is this field off?" gets the truth.
                  disabled={disabled}
                  onChange={(event) => {
                    const next = [...values];
                    next[index] = event.target.value;
                    onChange(next);
                  }}
                  type="text"
                  value={value}
                />
              </div>
              <button
                aria-label={`${COPY.removeRow} ${rowLabel}`}
                className={styles.button}
                disabled={disabled}
                onClick={() => {
                  focus.focusAfterRemove(index, values.length - 1);
                  onChange(values.filter((_item, at) => at !== index));
                }}
                type="button"
              >
                {COPY.removeRow}
              </button>
            </li>
          );
        })}
      </ul>

      <IssueList id={issuesId} issues={issues} />

      <div>
        <button
          className={styles.button}
          data-testid={addTestId}
          disabled={disabled}
          onClick={() => {
            focus.focusRow(values.length);
            onChange([...values, '']);
          }}
          ref={focus.fallbackRef}
          type="button"
        >
          {addLabel}
        </button>
      </div>
    </fieldset>
  );
}
