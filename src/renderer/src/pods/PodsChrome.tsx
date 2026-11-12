import { useEffect, useRef, useState, type JSX } from 'react';

import type { Pod, PodId } from '@shared/contracts/events';
import type { ActionResult } from '../contracts/renderer-state';
import { useNotify } from '../notifications';
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
 *
 * OUTCOMES GO TO THE NOTIFICATION REGION. Every Pod-header row of the frozen
 * `contracts/action-messages.md` (session 20261111-0156-message-alerting,
 * S1-S7 and E1-E6) is raised here through `useNotify()`, with that file's
 * wording and key. The region owns those messages; nothing here keeps a copy,
 * and the header renders no alert element of its own. Create and delete
 * FAILURES are the exception the contract names: they stay inline in their
 * dialogs, where the user acted.
 */
export function PodsChrome({
  dialogOpen,
  onRequestNewPod,
  onDismissNewPod,
}: PodsChromeProps): JSX.Element {
  const pods = usePods();
  const actions = useWorkspaceActions();
  const notifier = useNotify();
  const [createError, setCreateError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  /*
   * E1: the Pod list failed. Raised while `pods.phase` is `'error'`, dismissed
   * as soon as it leaves it. Keyed, so StrictMode's double effect run and any
   * re-run with the same inputs still leave exactly one item.
   */
  const listError = pods.phase === 'error' ? pods.error : null;
  useEffect(() => {
    if (listError !== null) {
      notifier.notify({ kind: 'error', message: listError.message, key: 'pods-load' });
    } else {
      notifier.dismiss('pods-load');
    }
  }, [notifier, listError]);

  /*
   * Only the LATEST reorder reports. `PodBarPanel` ignores a superseded
   * reorder's result for its optimistic order; this does the same for the
   * notification, so a slow earlier call cannot replace a later outcome.
   */
  const reorderGeneration = useRef(0);

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
   * controls report busy), and the new Pod whose tab should take focus once it
   * renders. A failure's message is the notification region's (E4).
   */
  const [forkingPodIds, setForkingPodIds] = useState<ReadonlySet<PodId>>(() => new Set());
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
   * untouched — the state layer added nothing — and main's message is raised
   * verbatim (E4). A standing fork outcome is dismissed as the next Fork
   * activation STARTS, before anything settles.
   */
  function handleFork(podId: PodId): void {
    notifier.dismiss('pod-fork');
    setForkingPodIds((current) => new Set(current).add(podId));
    void actions.forkPod(podId).then((result) => {
      setForkingPodIds((current) => {
        const next = new Set(current);
        next.delete(podId);
        return next;
      });
      if (!result.ok) {
        notifier.notify({ kind: 'error', message: result.error.message, key: 'pod-fork' });
        return;
      }
      notifier.notify({
        kind: 'success',
        message: `Pod forked: ${result.value.title}`,
        key: 'pod-fork',
      });
      setFocusPodId(result.value.id);
    });
  }

  function handleSelect(podId: PodId): void {
    actions.setActivePod(podId);
  }

  /**
   * `closePod` resolves `void`, so the title is read from the row as the stop
   * starts (S6). A failure is raised verbatim (E6) — it used to be discarded.
   *
   * A Pod that `pods.value` does not hold is still stopped: `closePod` is
   * called for it, and a successful stop raises the untitled info
   * `Pod stopped`, with the same key `pod-close`, because there is no title to
   * name. The rendered Pod bar never delivers such an id — it renders only
   * rows of `pods.value` — so this branch is defensive, not a user path.
   */
  function handleStop(podId: PodId): void {
    notifier.dismiss('pod-close');
    const title = pods.value.find((candidate) => candidate.pod.id === podId)?.pod.title;
    void actions.closePod(podId).then((result) => {
      if (!result.ok) {
        notifier.notify({ kind: 'error', message: result.error.message, key: 'pod-close' });
        return;
      }
      // An unlisted Pod has no title to name, but the stop happened: raise the
      // untitled info `Pod stopped`, keyed `pod-close` like the titled one.
      if (title === undefined) {
        notifier.notify({ kind: 'info', message: 'Pod stopped', key: 'pod-close' });
        return;
      }
      notifier.notify({ kind: 'info', message: `Pod stopped: ${title}`, key: 'pod-close' });
    });
  }

  /**
   * Handed to `PodBarPanel`, which keeps the optimistic order and drops it when
   * this settles. The outcome is reported here (S7, E5), not in the panel.
   */
  function handleReorder(orderedPodIds: PodId[]): Promise<ActionResult<void>> {
    const ticket = ++reorderGeneration.current;
    notifier.dismiss('pod-reorder');
    const reordered = actions.reorderPods(orderedPodIds);
    void reordered.then((result) => {
      if (ticket !== reorderGeneration.current) return;
      if (!result.ok) {
        notifier.notify({ kind: 'error', message: result.error.message, key: 'pod-reorder' });
        return;
      }
      notifier.notify({ kind: 'success', message: 'Pod order saved', key: 'pod-reorder' });
    });
    return reordered;
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
    // E2/E3: a standing open outcome goes as the next activation STARTS.
    notifier.dismiss('pod-open');
    const tab = pods.value.find((candidate) => candidate.pod.id === podId);
    if (tab === undefined) return;
    const reconnecting = runControlFor(tab.status, tab.pod.title).verb === 'reconnect';
    const started = reconnecting ? actions.reconnectPod(podId) : actions.openPod(podId);
    void started.then((result) => {
      // The row stays listed either way; only the notification is new.
      if (!result.ok) {
        notifier.notify({ kind: 'error', message: result.error.message, key: 'pod-open' });
        return;
      }
      const title = result.value.title;
      notifier.notify({
        kind: 'info',
        message: reconnecting ? `Pod reconnected: ${title}` : `Pod started: ${title}`,
        key: 'pod-open',
      });
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
      notifier.notify({ kind: 'success', message: `Pod deleted: ${pod.title}`, key: 'pod-delete' });
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
        notifier.notify({
          kind: 'success',
          message: `Pod created: ${result.value.title}`,
          key: 'pod-create',
        });
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
        reorderPods={handleReorder}
        tabs={pods.value}
      />

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
