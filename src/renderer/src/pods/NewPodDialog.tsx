import { useEffect, useRef, useState, type FormEvent, type JSX, type KeyboardEvent } from 'react';

import type { PermissionMode } from '@shared/contracts/events';
import type { ActionResult } from '../contracts/renderer-state';
import {
  BYPASS_PERMISSIONS_WARNING,
  PERMISSION_MODE_OPTIONS,
  TEST_IDS,
  type NewPodDialogProps,
} from '../contracts/renderer-view';
import { testId } from '../shell/contract-runtime';
import a11y from '../shell/a11y.module.css';
import styles from './NewPodDialog.module.css';

interface EnvRow {
  id: number;
  key: string;
  value: string;
}

/**
 * `NewPodDialogProps` plus one internal prop.
 *
 * `browse` is `WorkspaceActions.pickDirectory`, injected rather than pulled
 * from the hook, which is the only reason this component can be tested without
 * T5's provider. The frozen contract governs the crossing props; a component's
 * internal props are its own business (`renderer-view.ts` header).
 */
export interface NewPodDialogInternalProps extends NewPodDialogProps {
  browse(): Promise<ActionResult<{ path: string | null }>>;
}

const DEFAULT_MODE: PermissionMode = PERMISSION_MODE_OPTIONS[0]?.mode ?? 'default';

function nextEnvRow(id: number): EnvRow {
  return { id, key: '', value: '' };
}

/**
 * The New Pod dialog (spec 5.1, definition-of-done 3 and 4).
 *
 * The working directory is obtained ONLY from `pickDirectory()` behind Browse
 * and shown read-only. There is no text input bound to `cwd` anywhere in this
 * file, and adding one is a security regression (`NewPodDraft.cwd`).
 */
export function NewPodDialog({
  open,
  onCancel,
  onCreate,
  error,
  submitting,
  browse,
}: NewPodDialogInternalProps): JSX.Element | null {
  const [title, setTitle] = useState('');
  const [cwd, setCwd] = useState<string | null>(null);
  const [mode, setMode] = useState<PermissionMode>(DEFAULT_MODE);
  const [bypassConfirmed, setBypassConfirmed] = useState(false);
  const [envRows, setEnvRows] = useState<EnvRow[]>([nextEnvRow(0)]);
  const [browseError, setBrowseError] = useState<string | null>(null);
  const [browsing, setBrowsing] = useState(false);

  const titleRef = useRef<HTMLInputElement>(null);
  const nextEnvId = useRef(1);
  const wasOpen = useRef(false);

  // Reset on each fresh open, and focus the first field. Focus must move
  // predictably after an action that changes what is on screen.
  useEffect(() => {
    if (open && !wasOpen.current) {
      setTitle('');
      setCwd(null);
      setMode(DEFAULT_MODE);
      setBypassConfirmed(false);
      setEnvRows([nextEnvRow(0)]);
      setBrowseError(null);
      setBrowsing(false);
      nextEnvId.current = 1;
      titleRef.current?.focus();
    }
    wasOpen.current = open;
  }, [open]);

  if (!open) return null;

  const dangerSelected = PERMISSION_MODE_OPTIONS.some(
    (option) => option.mode === mode && option.danger,
  );
  const canSubmit =
    title.trim() !== '' && cwd !== null && (!dangerSelected || bypassConfirmed) && !submitting;

  function handleBrowse(): void {
    setBrowseError(null);
    setBrowsing(true);
    // `pickDirectory` resolves and never rejects, and CANCELLATION IS NOT AN
    // ERROR: it resolves `{ ok: true, value: { path: null } }`, which leaves
    // the dialog exactly as it was.
    void browse().then((result) => {
      setBrowsing(false);
      if (!result.ok) {
        setBrowseError(result.error.message);
        return;
      }
      if (result.value.path !== null) setCwd(result.value.path);
    });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!canSubmit || cwd === null) return;

    const envOverrides: Record<string, string> = {};
    for (const row of envRows) {
      const key = row.key.trim();
      if (key !== '') envOverrides[key] = row.value;
    }

    onCreate({ title: title.trim(), cwd, permissionMode: mode, envOverrides });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onCancel();
    }
  }

  return (
    <div className={styles.scrim}>
      <div
        aria-labelledby="new-pod-heading"
        aria-modal="true"
        className={styles.dialog}
        data-testid={TEST_IDS.newPodDialog}
        onKeyDown={handleKeyDown}
        role="dialog"
      >
        <h2 className={styles.heading} id="new-pod-heading">
          New Pod
        </h2>

        <form className={styles.form} noValidate onSubmit={handleSubmit}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="new-pod-title-input">
              Title
            </label>
            <input
              className={styles.input}
              data-testid={TEST_IDS.newPodTitleInput}
              id="new-pod-title-input"
              onChange={(event) => {
                setTitle(event.target.value);
              }}
              ref={titleRef}
              type="text"
              value={title}
            />
          </div>

          <div aria-labelledby="new-pod-cwd-label" className={styles.field} role="group">
            <span className={styles.label} id="new-pod-cwd-label">
              Working directory
            </span>
            <div className={styles.cwdRow}>
              <span
                aria-live="polite"
                className={cwd === null ? `${styles.cwdDisplay} ${styles.cwdEmpty}` : styles.cwdDisplay}
                data-testid={TEST_IDS.newPodCwdDisplay}
              >
                {cwd ?? 'No directory chosen'}
              </span>
              <button
                className={`${styles.button} ${styles.buttonSmall}`}
                data-testid={TEST_IDS.newPodBrowseButton}
                disabled={browsing}
                onClick={handleBrowse}
                type="button"
              >
                Browse…
              </button>
            </div>
            {browseError === null ? null : (
              <p className={styles.error} role="alert">
                {browseError}
              </p>
            )}
          </div>

          <fieldset className={styles.modes}>
            <legend className={styles.legend}>Permission mode</legend>
            {PERMISSION_MODE_OPTIONS.map((option) => (
              <label
                className={option.danger ? `${styles.mode} ${styles.modeDanger}` : styles.mode}
                key={option.mode}
              >
                <input
                  checked={mode === option.mode}
                  data-testid={testId(TEST_IDS.newPodModeOption, option.mode)}
                  name="new-pod-permission-mode"
                  onChange={() => {
                    setMode(option.mode);
                    setBypassConfirmed(false);
                  }}
                  type="radio"
                  value={option.mode}
                />
                <span className={styles.modeLabel}>{option.label}</span>
                <span className={styles.modeSummary}>{option.summary}</span>
              </label>
            ))}
          </fieldset>

          {dangerSelected ? (
            <div className={styles.bypass}>
              <p
                className={styles.bypassWarning}
                data-testid={TEST_IDS.newPodBypassWarning}
              >
                {BYPASS_PERMISSIONS_WARNING}
              </p>
              <label className={styles.confirm}>
                <input
                  checked={bypassConfirmed}
                  onChange={(event) => {
                    setBypassConfirmed(event.target.checked);
                  }}
                  type="checkbox"
                />
                I understand this Pod will never ask me about anything.
              </label>
            </div>
          ) : null}

          <div aria-labelledby="new-pod-env-label" className={styles.field} role="group">
            <span className={styles.label} id="new-pod-env-label">
              Environment overrides (optional)
            </span>
            {envRows.map((row, index) => (
              <div className={styles.envRow} key={row.id}>
                <label className={a11y.srOnly} htmlFor={`new-pod-env-key-${String(row.id)}`}>
                  {`Variable ${String(index + 1)} name`}
                </label>
                <input
                  className={styles.input}
                  id={`new-pod-env-key-${String(row.id)}`}
                  onChange={(event) => {
                    const next = event.target.value;
                    setEnvRows((rows) =>
                      rows.map((r) => (r.id === row.id ? { ...r, key: next } : r)),
                    );
                  }}
                  placeholder="NAME"
                  type="text"
                  value={row.key}
                />
                <label className={a11y.srOnly} htmlFor={`new-pod-env-value-${String(row.id)}`}>
                  {`Variable ${String(index + 1)} value`}
                </label>
                <input
                  className={styles.input}
                  id={`new-pod-env-value-${String(row.id)}`}
                  onChange={(event) => {
                    const next = event.target.value;
                    setEnvRows((rows) =>
                      rows.map((r) => (r.id === row.id ? { ...r, value: next } : r)),
                    );
                  }}
                  placeholder="value"
                  type="text"
                  value={row.value}
                />
                <button
                  aria-label={`Remove variable ${String(index + 1)}`}
                  className={`${styles.button} ${styles.buttonSmall}`}
                  onClick={() => {
                    setEnvRows((rows) => rows.filter((r) => r.id !== row.id));
                  }}
                  type="button"
                >
                  <span aria-hidden="true">&minus;</span>
                </button>
              </div>
            ))}
            <button
              className={`${styles.button} ${styles.buttonSmall}`}
              onClick={() => {
                setEnvRows((rows) => [...rows, nextEnvRow(nextEnvId.current++)]);
              }}
              type="button"
            >
              Add variable
            </button>
          </div>

          {error === null ? null : (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}

          <div className={styles.actions}>
            <button className={styles.button} onClick={onCancel} type="button">
              Cancel
            </button>
            <button
              className={styles.button}
              data-testid={TEST_IDS.newPodSubmit}
              disabled={!canSubmit}
              type="submit"
            >
              {submitting ? 'Creating…' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
