import { useState, type JSX } from 'react';

import type { Pod, PodId } from '@shared/contracts/events';
import { usePods, useWorkspaceActions } from '../state';
import type { NewPodDraft } from '../contracts/renderer-view';
import { DeletePodDialog } from './DeletePodDialog';
import { NewPodDialog } from './NewPodDialog';
import { PodBarPanel } from './PodBarPanel';
import { runControlFor } from './run-control';
import styles from './PodsChrome.module.css';

export interface PodsChromeProps {
  /** Owned by `App`, because the first-run empty state opens it too. */
  dialogOpen: boolean;
  onRequestNewPod(): void;
  onDismissNewPod(): void;
}

/**
 * Connects the Pod bar and the two dialogs to the state layer.
 *
 * This is the only file in T4 that touches `renderer-state`'s hooks on the Pod
 * side; `PodBar`, `PodTab`, `NewPodDialog` and `DeletePodDialog` below it are
 * presentational and take data and callbacks. Nothing here reaches the preload
 * bridge — the state layer is its only caller (spec, definition-of-done 16).
 */
export function PodsChrome({
  dialogOpen,
  onRequestNewPod,
  onDismissNewPod,
}: PodsChromeProps): JSX.Element {
  const pods = usePods();
  const actions = useWorkspaceActions();
  const [createError, setCreateError] = useState<string | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  /*
   * The delete confirmation's state. `pendingDelete` holds the POD ITSELF, not
   * its id: on a `session: 'failed'` result the row is already gone from
   * `pods.value` — the state layer drops it whenever `podDeleted` is true —
   * and the dialog still has to name the Pod it just destroyed.
   */
  const [pendingDelete, setPendingDelete] = useState<Pod | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deletedAnyway, setDeletedAnyway] = useState(false);

  function handleSelect(podId: PodId): void {
    actions.setActivePod(podId);
  }

  function handleStop(podId: PodId): void {
    void actions.closePod(podId);
  }

  /**
   * The only caller of `openPod`/`reconnectPod` in the renderer. The verb is
   * `runControlFor`'s decision, so the control's NAME and the call it makes
   * cannot drift apart.
   *
   * WHY THE SPLIT EXISTS. The comment that used to stand here claimed a beached
   * Pod is REFUSED by `pods.open`. That was false, twice over. No guard
   * anywhere in `src/main/ipc/**` refuses `pods.open` for a beached Pod — the
   * routing is a renderer-side convention, not an enforced rule. And
   * `PodManager.onBeached` deletes the session before marking the Pod beached,
   * so `openPod` falls through its `#sessions.has` early return to the
   * identical `#start(pod, true)` that `reconnectPod` reaches once `#dispose`
   * no-ops on an absent session. The two calls would succeed identically.
   *
   * The split is kept for two reasons that ARE true:
   *   - `reconnectPod` disposes before starting; `openPod` returns an already
   *     live Pod untouched. Those differ for any Pod whose session entry
   *     outlives its process — the failed-`stop()` path — and routing beached
   *     to the verb that disposes first costs nothing when there is nothing to
   *     dispose.
   *   - Design section 8 requires a beached Pod to keep an affordance carrying
   *     its cause, which a single collapsed verb cannot do.
   *
   * Both actions resolve and never reject (frozen `renderer-state.ts`), so
   * this has no `catch` by design — the same shape as `handleCreate` below.
   */
  function handleRun(podId: PodId): void {
    setOpenError(null);
    const tab = pods.value.find((candidate) => candidate.pod.id === podId);
    if (tab === undefined) return;
    const started =
      runControlFor(tab.status, tab.pod.title).verb === 'reconnect'
        ? actions.reconnectPod(podId)
        : actions.openPod(podId);
    void started.then((result) => {
      // The row stays listed either way; only the message is new.
      if (!result.ok) setOpenError(result.error.message);
    });
  }

  /** Opens the confirmation. Nothing is deleted until it is confirmed. */
  function handleRequestDelete(podId: PodId): void {
    const tab = pods.value.find((candidate) => candidate.pod.id === podId);
    if (tab === undefined) return;
    setDeleteError(null);
    setDeletedAnyway(false);
    setPendingDelete(tab.pod);
  }

  function handleCancelDelete(): void {
    setDeleteError(null);
    setDeletedAnyway(false);
    setPendingDelete(null);
  }

  /**
   * `deletePod`'s only component caller.
   *
   * THREE OUTCOMES, and the middle one is the one that gets swallowed if it is
   * not handled explicitly:
   *   - the call failed: the Pod is still there, the dialog stays open with
   *     main's message, and Delete is still offered.
   *   - the Pod was deleted and its session file could not be binned: the
   *     dialog STAYS OPEN, says the Pod itself was deleted, and shows the
   *     platform's message verbatim. The row is already gone from the bar.
   *   - everything succeeded: the dialog closes.
   */
  function handleConfirmDelete(deleteSession: boolean): void {
    const pod = pendingDelete;
    if (pod === null) return;
    setDeleting(true);
    setDeleteError(null);
    void actions.deletePod({ podId: pod.id, deleteSession }).then((result) => {
      setDeleting(false);
      if (!result.ok) {
        setDeleteError(result.error.message);
        return;
      }
      const { session, sessionError } = result.value;
      if (session === 'failed') {
        setDeletedAnyway(true);
        setDeleteError(sessionError ?? '');
        return;
      }
      setPendingDelete(null);
    });
  }

  function handleNewPod(): void {
    setCreateError(null);
    onRequestNewPod();
  }

  function handleCancel(): void {
    setCreateError(null);
    onDismissNewPod();
  }

  /**
   * CREATE MAKES A ROW AND STOPS. There is no `pods.open` here and no "Create
   * and open" option: the tab that just appeared carries a working run control,
   * and the composer's not-opened sentence names the next step without a click.
   *
   * The error path is therefore create-failure ALONE. It used to fold in an
   * open failure too, which reported a spawn error as a failed create for a Pod
   * that had in fact been created.
   */
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
        onClose={handleStop}
        onDelete={handleRequestDelete}
        onNewPod={handleNewPod}
        onOpen={handleRun}
        onSelect={handleSelect}
        reorderPods={actions.reorderPods}
        tabs={pods.value}
      />

      {openError === null ? null : (
        <p className={styles.listError} role="alert">
          {openError}
        </p>
      )}

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

      <DeletePodDialog
        error={deleteError}
        onCancel={handleCancelDelete}
        onConfirm={handleConfirmDelete}
        pod={pendingDelete}
        podDeleted={deletedAnyway}
        submitting={deleting}
      />
    </div>
  );
}
