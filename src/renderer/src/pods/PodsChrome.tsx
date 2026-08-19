import { useState, type JSX } from 'react';

import type { PodId } from '@shared/contracts/events';
import { usePods, useWorkspaceActions } from '../state';
import type { NewPodDraft } from '../contracts/renderer-view';
import { NewPodDialog } from './NewPodDialog';
import { PodBarPanel } from './PodBarPanel';
import styles from './PodsChrome.module.css';

export interface PodsChromeProps {
  /** Owned by `App`, because the first-run empty state opens it too. */
  dialogOpen: boolean;
  onRequestNewPod(): void;
  onDismissNewPod(): void;
}

/**
 * Connects the Pod bar and the New Pod dialog to the state layer.
 *
 * This is the only file in T4 that touches `renderer-state`'s hooks on the Pod
 * side; `PodBar`, `PodTab` and `NewPodDialog` below it are presentational and
 * take data and callbacks. Nothing here reaches the preload bridge — the
 * state layer is its only caller (spec, definition-of-done 16).
 */
export function PodsChrome({
  dialogOpen,
  onRequestNewPod,
  onDismissNewPod,
}: PodsChromeProps): JSX.Element {
  const pods = usePods();
  const actions = useWorkspaceActions();
  const [createError, setCreateError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function handleSelect(podId: PodId): void {
    actions.setActivePod(podId);
  }

  function handleClose(podId: PodId): void {
    void actions.closePod(podId);
  }

  function handleNewPod(): void {
    setCreateError(null);
    onRequestNewPod();
  }

  function handleCancel(): void {
    setCreateError(null);
    onDismissNewPod();
  }

  function handleCreate(draft: NewPodDraft): void {
    setCreateError(null);
    setSubmitting(true);
    // Actions resolve and never reject (frozen `renderer-state.ts`), so this
    // deliberately has no `catch`.
    void actions
      .createPod({
        title: draft.title,
        cwd: draft.cwd,
        permissionMode: draft.permissionMode,
        envOverrides: draft.envOverrides,
      })
      .then((result) => {
        setSubmitting(false);
        if (!result.ok) {
          // The dialog stays open and keeps the user's input; the message is
          // whatever main wrote, verbatim (spec 7).
          setCreateError(result.error.message);
          return;
        }
        actions.setActivePod(result.value.id);
        onDismissNewPod();
      });
  }

  return (
    <div className={styles.chrome}>
      <PodBarPanel
        onClose={handleClose}
        onNewPod={handleNewPod}
        onSelect={handleSelect}
        reorderPods={actions.reorderPods}
        tabs={pods.value}
      />

      {pods.phase === 'error' && pods.error !== null ? (
        <p className={styles.listError} role="alert">
          {pods.error.message}
        </p>
      ) : null}

      {pods.phase === 'loading' ? (
        <p className={styles.listStatus} role="status">
          Loading Pods…
        </p>
      ) : null}

      <NewPodDialog
        browse={actions.pickDirectory}
        error={createError}
        onCancel={handleCancel}
        onCreate={handleCreate}
        open={dialogOpen}
        submitting={submitting}
      />
    </div>
  );
}
