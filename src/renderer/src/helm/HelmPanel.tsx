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

import { useState, type JSX } from 'react';

import type { HelmManagedFields } from '@shared/contracts/helm';
import type { HelmPanelProps } from '../contracts/renderer-panels';
import { PANEL_TEST_IDS } from '../contracts/renderer-panels';

import { COPY } from './copy';
import { HelmActionBar } from './HelmActionBar';
import { HelmComparison } from './HelmComparison';
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

  // CLIENT INTERACTION STATE, and the only state this file holds: has the user
  // asked for a comparison at all? `actionError` has one writer and many
  // causes — a refused save sets it too — so without this the comparison
  // surface would report an unrelated `EROFS` as a failed comparison. It is
  // set from the click, never from a render.
  const [compareRequested, setCompareRequested] = useState(false);
  const onCompare = (): void => {
    setCompareRequested(true);
    void actions.compare();
  };

  // ONE MESSAGE, ONE PLACE, the same rule the conflict banner already follows:
  // when the comparison surface is the one showing this message, the generic
  // error banner stays out of the way.
  const compareError =
    compareRequested && !view.comparing && view.incoming === null ? view.actionError : null;

  return (
    <section
      aria-label={COPY.panelLabel}
      className={styles.panel}
      data-testid={PANEL_TEST_IDS.helmPanel}
    >
      <HelmNotices
        actionError={compareError === null ? view.actionError : null}
        backupDisplayPath={savedHere?.backupDisplayPath ?? null}
        conflict={view.conflict}
        conflictDisplayPath={selectedScope?.displayPath ?? null}
        loadError={view.error?.message ?? null}
        parseError={parseError}
        stale={view.stale}
        comparing={view.comparing}
        onCompare={onCompare}
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

      {/*
        The comparison rides with the draft: it is about a file that is open,
        and before a scope is chosen there is neither a pending edit to put
        beside the file nor a file to fetch. With a draft on screen it is
        always present, and it declares its own loading, error and empty
        states rather than appearing only once it has something to show.
      */}
      {draft === null ? null : (
        <HelmComparison
          comparing={view.comparing}
          draft={draft}
          error={compareError}
          incoming={view.incoming}
        />
      )}

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
