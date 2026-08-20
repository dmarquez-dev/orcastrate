/**
 * Helm, arranged. This file chooses WHAT is on screen; every component it
 * renders decides how.
 *
 * IT RENDERS FROM `HelmPanelProps` AND NOTHING ELSE. It names no bridge, opens
 * no channel and fetches nothing — the two hooks live in `state/`, which is the
 * only place in the renderer allowed to see `window.orcastrate`, and
 * `state/isolation.test.ts` fails if that ever stops being true.
 *
 * ALL FOUR STATES ARE RENDERED, per the frontend discipline: loading (the
 * scope list, and the document), error (`helmError`), empty (no scope chosen,
 * no scopes at all, and the genuinely-empty machine where only the user scope
 * exists), and the ready form.
 */

import type { JSX } from 'react';

import type { HelmManagedFields } from '@shared/contracts/helm';
import type { HelmPanelProps } from '../contracts/renderer-panels';
import { PANEL_TEST_IDS } from '../contracts/renderer-panels';

import { COPY } from './copy';
import { HelmActionBar } from './HelmActionBar';
import { HelmNotices } from './HelmNotices';
import { HelmScopePicker } from './HelmScopePicker';
import { HelmSettingsForm } from './HelmSettingsForm';
import { unplacedIssues } from './issues';
import styles from './Helm.module.css';

export function HelmPanel({ view, actions }: HelmPanelProps): JSX.Element {
  const draft = view.draft;
  const parseError = view.document?.parseError ?? null;
  const readOnly = parseError !== null;
  const selectedScope =
    view.value.find((scope) => scope.id === view.selectedScopeId) ?? view.document?.scope ?? null;

  // A save result outlives a scope change in the store, so the backup path is
  // shown only while the file it belongs to is the one on screen.
  const lastSave = view.lastSave;
  const savedHere =
    lastSave !== null && lastSave.document.scope.id === view.selectedScopeId ? lastSave : null;

  const onManaged = (managed: HelmManagedFields): void => {
    actions.edit({ managed });
  };

  return (
    <section
      aria-label={COPY.panelLabel}
      className={styles.panel}
      data-testid={PANEL_TEST_IDS.helmPanel}
    >
      <HelmNotices
        actionError={view.actionError}
        backupDisplayPath={savedHere?.backupDisplayPath ?? null}
        conflict={view.conflict}
        conflictDisplayPath={selectedScope?.displayPath ?? null}
        loadError={view.error?.message ?? null}
        parseError={parseError}
        stale={view.stale}
        unplaced={unplacedIssues(view.issues, readOnly)}
        warnings={savedHere?.warnings ?? []}
      />

      {view.phase === 'loading' ? (
        <p className={styles.status} role="status">
          {COPY.loadingScopes}
        </p>
      ) : null}

      <HelmScopePicker
        disabled={view.loadingDocument || view.saving}
        onSelect={(scopeId) => {
          void actions.selectScope(scopeId);
        }}
        scopes={view.value}
        selectedScopeId={view.selectedScopeId}
      />

      {view.loadingDocument ? (
        <p className={styles.status} role="status">
          {COPY.loadingDocument}
        </p>
      ) : null}

      {draft === null ? (
        <p className={styles.empty}>{COPY.scopeUnchosen}</p>
      ) : (
        <HelmSettingsForm
          disabled={readOnly}
          draft={draft}
          issues={view.issues}
          onHooks={(hooksJson) => {
            actions.edit({ hooksJson });
          }}
          onManaged={onManaged}
        />
      )}

      <HelmActionBar
        blocked={view.blocked}
        canReload={view.selectedScopeId !== null}
        dirty={view.dirty}
        onDiscard={actions.discard}
        onReload={() => {
          void actions.reload();
        }}
        onSave={() => {
          void actions.save();
        }}
        saving={view.saving}
      />
    </section>
  );
}
