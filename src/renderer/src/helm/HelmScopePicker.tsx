/**
 * THE RENDERER STILL CANNOT NAME A FILE.
 *
 * This is the only component in Helm that ever sees a path, and everything it
 * does with one is READ IT OUT. There is no text input here — no input element
 * of any kind — so there is nothing a traversal string could be typed into.
 * The user picks a `label` out of a list main built, and what travels inward is
 * the opaque `HelmScopeId` that came with it. Main resolves that id through a
 * table it already holds, so a forged id is a table miss rather than a path.
 *
 * `no-paths.test.ts` asserts all of that over this directory's source, so the
 * property survives an edit that forgets this comment.
 *
 * AN EMPTY LIST IS A FINDING ONLY ONCE THE LISTING HAS COME BACK. `scopes` can
 * be empty before any listing has succeeded, whether one is still loading or
 * has failed; once one has succeeded, a later refresh or failure keeps the
 * list it returned. So "No settings files" is said only when `listingPhase` is
 * `'ready'` and `scopes` is empty; in every other phase the panel's loading
 * status or failure banner is what explains an empty list.
 */

import type { JSX } from 'react';

import type { HelmScope, HelmScopeId } from '@shared/contracts/helm';
import { PANEL_TEST_IDS } from '../contracts/renderer-panels';
import type { LoadPhase } from '../contracts/renderer-state';
import { testId } from '../shell/contract-runtime';

import { COPY, scopeOptionText } from './copy';
import styles from './Helm.module.css';

export interface HelmScopePickerProps {
  scopes: readonly HelmScope[];
  /** The phase of the most recent scope listing, not necessarily the one `scopes` came from. */
  listingPhase: LoadPhase;
  selectedScopeId: HelmScopeId | null;
  disabled: boolean;
  onSelect(scopeId: HelmScopeId): void;
}

const SELECT_ID = 'helm-scope-select-control';
const PATH_ID = 'helm-scope-path-value';
/** The sentinel for "nothing chosen yet". Never sent inward. */
const UNCHOSEN = '';

export function HelmScopePicker({
  scopes,
  listingPhase,
  selectedScopeId,
  disabled,
  onSelect,
}: HelmScopePickerProps): JSX.Element {
  const selected = scopes.find((scope) => scope.id === selectedScopeId) ?? null;
  const onlyUserScope = scopes.length === 1 && scopes[0]?.kind === 'user';

  return (
    <fieldset className={styles.section}>
      <legend className={styles.legend}>{COPY.scopeLegend}</legend>

      <div className={styles.field}>
        <label className={styles.label} htmlFor={SELECT_ID}>
          {COPY.scopeSelectLabel}
        </label>
        <select
          aria-describedby={PATH_ID}
          className={styles.select}
          data-testid={PANEL_TEST_IDS.helmScopeSelect}
          disabled={disabled || scopes.length === 0}
          id={SELECT_ID}
          onChange={(event) => {
            const scopeId = event.target.value;
            if (scopeId === UNCHOSEN) return;
            onSelect(scopeId);
          }}
          value={selected?.id ?? UNCHOSEN}
        >
          <option value={UNCHOSEN}>{COPY.scopePlaceholder}</option>
          {scopes.map((scope) => (
            <option
              data-testid={testId(PANEL_TEST_IDS.helmScopeOption, scope.id)}
              key={scope.id}
              value={scope.id}
            >
              {scopeOptionText(scope.label, scope.kind)}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.field}>
        <span className={styles.hint} id={`${PATH_ID}-label`}>
          {COPY.scopePathLabel}
        </span>
        {/*
          Read-only by construction: a `<p>`, not a disabled input. A disabled
          input would still be an input, and the source scan would have to
          reason about whether its value could ever travel inward.
        */}
        <p
          aria-labelledby={`${PATH_ID}-label`}
          className={styles.path}
          data-testid={PANEL_TEST_IDS.helmScopePath}
          id={PATH_ID}
        >
          {selected === null ? COPY.scopePathUnchosen : selected.displayPath}
        </p>
        {selected !== null && !selected.exists ? (
          <span className={styles.hint}>{COPY.scopeAbsent}</span>
        ) : null}
      </div>

      {listingPhase === 'ready' && scopes.length === 0 ? <p className={styles.empty}>{COPY.scopeNone}</p> : null}
      {onlyUserScope ? <p className={styles.empty}>{COPY.scopeOnlyUser}</p> : null}
    </fieldset>
  );
}
