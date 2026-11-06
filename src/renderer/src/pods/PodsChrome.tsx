import { useEffect, useRef, useState, type JSX } from 'react';

import type { Pod, PodId } from '@shared/contracts/events';
import { usePods, useWorkspaceActions } from '../state';
import { TEST_IDS, type NewPodDraft } from '../contracts/renderer-view';
import { testId } from '../shell/contract-runtime';
import { DeletePodDialog } from './DeletePodDialog';
import { NewPodDialog } from './NewPodDialog';
import { PodBarPanel } from './PodBarPanel';
import { runControlFor } from './run-control';
import styles from './PodsChrome.module.css';

/**
 * Local, like `POD_TAB_OPEN_TEST_ID`: it crosses no task boundary. The tests
 * use it to name where focus lands when a dialog's opener is gone.
 */
export const PODS_CHROME_TEST_ID = 'pods-chrome';

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

  // The focus destination of last resort for both dialogs, the same role
  // `BeachcomberPanel`'s `panelRef` plays for its preview. Each dialog can
  // remove the control that opened it — a delete takes the tab, a create
  // unmounts the empty workspace — and focus must land somewhere visible.
  const chromeRef = useRef<HTMLDivElement>(null);

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

  /*
   * The fork's interaction state: which Pods have a fork in flight (their Fork
   * controls report busy), main's message when one fails, and the new Pod
   * whose tab should take focus once it renders.
   */
  const [forkingPodIds, setForkingPodIds] = useState<ReadonlySet<PodId>>(() => new Set());
  const [forkError, setForkError] = useState<string | null>(null);
  const [focusPodId, setFocusPodId] = useState<PodId | null>(null);

  /*
   * FOCUS FOLLOWS THE FORK. The new Pod's tab is selected, and focus moves to
   * it, so the user who pressed Fork is left on the thing their action made
   * rather than on a control belonging to a tab that is no longer active. The
   * tab may not have rendered yet when the action resolves, so this waits for
   * the list that carries it.
   */
  useEffect(() => {
    if (focusPodId === null) return;
    const target = chromeRef.current?.querySelector<HTMLElement>(
      `[data-testid="${testId(TEST_IDS.podTab, focusPodId)}"]`,
    );
    if (target === null || target === undefined) return;
    target.focus();
    setFocusPodId(null);
  }, [focusPodId, pods.value]);

  /**
   * `forkPod`'s only component caller. Resolves and never rejects (frozen
   * `renderer-state.ts`), so there is no `catch`. On failure the bar is
   * untouched — the state layer added nothing — and main's message is shown
   * verbatim.
   */
  function handleFork(podId: PodId): void {
    setForkError(null);
    setForkingPodIds((current) => new Set(current).add(podId));
    void actions.forkPod(podId).then((result) => {
      setForkingPodIds((current) => {
        const next = new Set(current);
        next.delete(podId);
        return next;
      });
      if (!result.ok) {
        setForkError(result.error.message);
        return;
      }
      setFocusPodId(result.value.id);
    });
  }

  /**
   * Closes the fork-error alert. `forkError` is the alert's only visibility
   * state, so dismissal is clearing it. The control that was pressed unmounts
   * with the alert, so focus moves to the chrome container, the destination of
   * last resort above.
   */
  function handleDismissForkError(): void {
    setForkError(null);
    chromeRef.current?.focus();
  }

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
    <div
      className={styles.chrome}
      data-testid={PODS_CHROME_TEST_ID}
      ref={chromeRef}
      tabIndex={-1}
    >
      <PodBarPanel
        onClose={handleStop}
        forkingPodIds={forkingPodIds}
        onDelete={handleRequestDelete}
        onFork={handleFork}
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

      {forkError === null ? null : (
        // The dismiss control is a SIBLING of the alert, never inside it, so
        // the alert's text stays exactly main's message.
        <div className={styles.dismissible}>
          <p className={styles.listError} role="alert">
            {forkError}
          </p>
          <button
            aria-label="Dismiss fork error"
            className={styles.dismiss}
            onClick={handleDismissForkError}
            type="button"
          >
            <span aria-hidden="true">{'×'}</span>
          </button>
        </div>
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
        fallbackFocusRef={chromeRef}
        onCancel={handleCancel}
        onCreate={handleCreate}
        open={dialogOpen}
        submitting={submitting}
      />

      <DeletePodDialog
        error={deleteError}
        fallbackFocusRef={chromeRef}
        onCancel={handleCancelDelete}
        onConfirm={handleConfirmDelete}
        pod={pendingDelete}
        podDeleted={deletedAnyway}
        submitting={deleting}
      />
    </div>
  );
}
