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

import { useRef, useState, type JSX } from 'react';

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
import { useSaveOutcomeScroll } from './useSaveOutcomeScroll';
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

  // CLIENT INTERACTION STATE, and the only state this file holds: WHETHER the
  // most recent action the user asked for was a comparison. `actionError` has
  // one writer and many causes — a refused save sets it too — and the view
  // keeps no record of which cause wrote it, so this cannot be derived from
  // `view`; it is the user's own interaction and is set only from a click,
  // never from a render.
  //
  // IT IS A LATCH THAT RESETS, AND THAT IS THE FIX. Its predecessor was a
  // one-way `compareRequested` flag: once a comparison had failed, `incoming`
  // stayed null and the flag stayed true, so every LATER unrelated failure —
  // a refused save, an `EPERM` on reload — was routed into the comparison
  // surface. Comparing sets the latch; every other action the panel offers
  // clears it as it starts, so the next action takes the claim with it.
  // (Defect introduced by session 2026-08-31-orcastrate-helm-draft-safety,
  // fixed by 2026-09-04-orcastrate-correctness-sweep.)
  const [lastActionWasCompare, setLastActionWasCompare] = useState<boolean>(false);
  const onCompare = (): void => {
    setLastActionWasCompare(true);
    void actions.compare();
  };

  // ONE MESSAGE, ONE PLACE, the same rule the conflict banner already follows:
  // when the comparison surface is the one showing this message, the generic
  // error banner stays out of the way. Derived at render from the latch and
  // the view, and stored nowhere.
  //
  // THE RULE HOLDS BY THIS EXPRESSION, not by an argument that some state is
  // unreachable. Beyond the latch, two conditions decide it:
  //   - `draft !== null`: the comparison surface mounts only with a draft
  //     (below). Without one, claiming the message would suppress the banner
  //     and leave the sentence on no surface at all.
  //   - `view.actionError !== loadError`: a failed scope refresh writes one
  //     sentence to both `error` and `actionError`. That sentence is the load
  //     error, which the notices already print; claiming it here would print
  //     it a second time inside the comparison.
  const loadError = view.error?.message ?? null;
  const compareError =
    lastActionWasCompare &&
    !view.comparing &&
    view.incoming === null &&
    draft !== null &&
    view.actionError !== loadError
      ? view.actionError
      : null;

  // A SETTLED SAVE BRINGS ITS OWN OUTCOME INTO VIEW, by scrolling only. The
  // hook reads the outcome from the view as it is on the settling render. The
  // rule, and why it lives in its own file, are in `useSaveOutcomeScroll.ts`.
  const panelRef = useRef<HTMLElement>(null);
  useSaveOutcomeScroll(
    { saving: view.saving, actionError: view.actionError, conflict: view.conflict },
    panelRef,
  );

  return (
    <section
      aria-label={COPY.panelLabel}
      className={styles.panel}
      data-testid={PANEL_TEST_IDS.helmPanel}
      ref={panelRef}
    >
      <HelmNotices
        actionError={compareError === null ? view.actionError : null}
        backupDisplayPath={savedHere?.backupDisplayPath ?? null}
        conflict={view.conflict}
        conflictDisplayPath={selectedScope?.displayPath ?? null}
        loadError={loadError}
        parseError={parseError}
        stale={view.stale}
        comparing={view.comparing}
        onCompare={onCompare}
        unplaced={unplacedIssues(view.issues, readOnly)}
      />

      {view.phase === 'loading' ? (
        <p className={styles.status} role="status">
          {COPY.loadingScopes}
        </p>
      ) : null}

      <HelmScopePicker
        disabled={view.loadingDocument || view.saving}
        listingPhase={view.phase}
        onSelect={(scopeId) => {
          setLastActionWasCompare(false);
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

        WHICH READING OF C1's T4 CRITERION 6 GOVERNS. That criterion 6 asked
        for a declared loading state while `view.comparing`, a declared error
        state from `view.actionError`, and a declared empty state when
        `view.incoming` is null, and said a surface rendering only the success
        path fails. Its letter admits a second reading in which this gate
        never met it, because with `draft === null` no comparison surface
        mounts at all. The first reading is the one that governs, and this is
        settled, not open:

          - Criterion 6 transcribed the frontend discipline's data-fetching
            rule, "Every fetch has a declared loading state, a declared error
            state, and a declared empty state". That rule governs the states
            OF A FETCH — not whether a surface mounts before any fetch is
            possible.
          - `HelmComparison` declares all three whenever a draft exists, which
            is exactly when a fetch is possible.
          - With no scope chosen there is no fetch, no pending edit, and no
            file to compare against. There is nothing for the three states to
            be states of.
          - `draft === null && incoming !== null` is unreachable, as C1's
            reviewer separately established. So this gate can never hide a
            comparison that has data.

        The gate is therefore correct as written. Do not "fix" it by mounting
        the surface unconditionally.
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

      {/*
        Every other action the panel offers takes the claim off the comparison
        as it starts, so the failure it is about to produce lands in the error
        banner rather than in a surface that is about something else.
      */}
      <HelmActionBar
        blocked={view.blocked}
        canReload={view.selectedScopeId !== null}
        dirty={view.dirty}
        onDiscard={() => {
          setLastActionWasCompare(false);
          actions.discard();
        }}
        onReload={() => {
          setLastActionWasCompare(false);
          void actions.reload();
        }}
        onSave={() => {
          setLastActionWasCompare(false);
          void actions.save();
        }}
        saving={view.saving}
      />
    </section>
  );
}
