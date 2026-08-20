/**
 * `crossSessionInbound` — the policy for messages arriving from another Claude
 * Code session.
 *
 * ALL THREE VALUES ARE OFFERED, and `hold` carries `CROSS_SESSION_HOLD_CAVEAT`
 * verbatim. Only `accept` and `refuse` were observed in CLI 2.1.235's binary;
 * `hold` is named by the design and was not confirmed. Dropping it would make
 * Helm less capable than a text editor for a file the user can already
 * hand-edit, so it is offered WITH the caveat instead — the user gets the
 * choice and the uncertainty, rather than neither.
 *
 * HELM NEVER PRESELECTS `hold`, and an absent key selects nothing: `checked`
 * is a comparison against `value`, which is `null` when the key is absent, so
 * no radio is checked. "Leave unset" puts it back to absent — a fourth radio
 * would have made the group offer four values, and the criterion says three.
 */

import type { JSX } from 'react';

import type { CrossSessionInbound, HelmValidationIssue } from '@shared/contracts/helm';
import { CROSS_SESSION_INBOUND_VALUES } from '@shared/contracts/helm';
import { CROSS_SESSION_HOLD_CAVEAT, PANEL_TEST_IDS } from '../contracts/renderer-panels';
import { testId } from '../shell/contract-runtime';

import { COPY, CROSS_SESSION_HINTS, CROSS_SESSION_LABELS } from './copy';
import { IssueList } from './IssueList';
import styles from './Helm.module.css';

export interface CrossSessionInboundFieldProps {
  value: CrossSessionInbound | null;
  disabled: boolean;
  issues: readonly HelmValidationIssue[];
  onChange(next: CrossSessionInbound | null): void;
}

const GROUP_NAME = 'helm-cross-session-inbound';
const ISSUES_ID = 'helm-cross-session-issues';
const CAVEAT_ID = 'helm-cross-session-caveat-text';

export function CrossSessionInboundField({
  value,
  disabled,
  issues,
  onChange,
}: CrossSessionInboundFieldProps): JSX.Element {
  // The caveat is on screen permanently, next to `hold`. An issue repeating it
  // word for word would put the same sentence in two places, so it is dropped
  // here and nowhere else — an issue carrying any OTHER message still renders.
  const extra = issues.filter((issue) => issue.message !== CROSS_SESSION_HOLD_CAVEAT);

  return (
    <fieldset className={styles.section} disabled={disabled}>
      <legend className={styles.legend}>{COPY.crossSessionLegend}</legend>

      <div className={styles.choices}>
        {CROSS_SESSION_INBOUND_VALUES.map((choice) => {
          const inputId = `${GROUP_NAME}-${choice}`;
          const hintId = `${inputId}-hint`;
          const isHold = choice === 'hold';
          return (
            <div className={styles.choice} key={choice}>
              <input
                aria-describedby={isHold ? `${hintId} ${CAVEAT_ID}` : hintId}
                checked={value === choice}
                data-testid={testId(PANEL_TEST_IDS.helmCrossSession, choice)}
                disabled={disabled}
                id={inputId}
                name={GROUP_NAME}
                onChange={() => {
                  onChange(choice);
                }}
                type="radio"
                value={choice}
              />
              <div className={styles.choiceBody}>
                <label className={styles.label} htmlFor={inputId}>
                  {CROSS_SESSION_LABELS[choice]}
                </label>
                <span className={styles.hint} id={hintId}>
                  {CROSS_SESSION_HINTS[choice]}
                </span>
                {isHold ? (
                  <span
                    className={styles.caveat}
                    data-testid={PANEL_TEST_IDS.helmCrossSessionCaveat}
                    id={CAVEAT_ID}
                  >
                    {CROSS_SESSION_HOLD_CAVEAT}
                  </span>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      <IssueList id={ISSUES_ID} issues={extra} />

      <div className={styles.field}>
        <div>
          <button
            className={styles.button}
            disabled={disabled || value === null}
            onClick={() => {
              onChange(null);
            }}
            type="button"
          >
            {COPY.crossSessionUnset}
          </button>
        </div>
        <span className={styles.hint}>{COPY.crossSessionUnsetHint}</span>
      </div>
    </fieldset>
  );
}
