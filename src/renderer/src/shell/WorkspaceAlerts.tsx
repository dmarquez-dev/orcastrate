/**
 * The workspace-level load failures, reported into the notification region.
 *
 * Renders nothing. It reads three load outcomes the state layer already
 * records and raises one error row for each, keyed and worded as follows:
 *
 *   E8   the active Pod's `lanes.list` failed     key `lanes-load:{podId}`
 *   E9   the active Pod's backfill failed          key `events-load:{podId}`
 *   E10  `app.routingMode()` failed                key `routing-mode`
 *
 * Each message is `IpcError.message` verbatim. E8 and E9 are dismissed when
 * that Pod's phase leaves `'error'`; E10 is dismissed whenever
 * `routingModeError` is `null`.
 *
 * EACH ROW CARRIES A `Retry` ACTION, which names the store action that re-runs
 * the failed load: E8 calls `retryLanes(podId)`, E9 calls
 * `loadMoreEvents(podId)` (which re-reads the very page that failed), and E10
 * calls `retryRoutingMode()`. The retry logic is the store's; this component
 * only says which action to call. Activating `Retry` removes the item at once.
 * A failed retry raises it again under the same key: the retried load passes
 * through `'loading'` (E8, E9) or through a `null` `routingModeError` (E10)
 * while in flight, so the failure that follows is a change the effect sees
 * even when the bridge answers the same error object again.
 *
 * WHY EVERY ROW IS KEYED. The notification is raised from an effect, and
 * StrictMode runs every effect twice on mount. A keyed `notify` replaces the
 * live item in place, so the double run still leaves exactly one item; the
 * same holds for any later re-run of an effect whose inputs did not change.
 */

import { useCallback, useEffect } from 'react';

import type { PodId } from '@shared/contracts/events';
import type { IpcError } from '@shared/contracts/ipc';
import type { LoadPhase } from '../contracts/renderer-state';
import { useNotify, type NotificationAction, type Notifier } from '../notifications';
import { useLaneRail, useWorkspace } from '../state';

/**
 * Raises `key` while `phase` is `'error'` and dismisses it otherwise. The
 * raised row carries a `Retry` action that calls `retry` with the Pod's id.
 * `podId === null` means no Pod is active, and nothing is raised or dismissed
 * for a Pod that cannot be named.
 */
function usePodLoadAlert(
  notifier: Notifier,
  keyPrefix: string,
  podId: PodId | null,
  phase: LoadPhase,
  error: IpcError | null,
  retry: (podId: PodId) => void,
): void {
  useEffect(() => {
    if (podId === null) return;
    const key = `${keyPrefix}:${podId}`;
    if (phase === 'error' && error !== null) {
      const action: NotificationAction = {
        label: 'Retry',
        onAction: () => {
          retry(podId);
        },
      };
      notifier.notify({ kind: 'error', message: error.message, key, action });
    } else {
      notifier.dismiss(key);
    }
  }, [notifier, keyPrefix, podId, phase, error, retry]);
}

export function WorkspaceAlerts(): null {
  const notifier = useNotify();
  const { session, routingModeError, actions } = useWorkspace();
  const rail = useLaneRail();

  // `useLaneRail()` and `session` both describe the ACTIVE Pod, so the id the
  // keys carry is the session's.
  const activePodId = session?.podId ?? null;

  // `actions` is stable for the provider's lifetime, so these are too, and the
  // effects below re-run only when a load outcome changes. Store actions
  // resolve and never reject, so the promise is discarded and nothing is caught.
  const retryLanes = useCallback(
    (podId: PodId) => {
      void actions.retryLanes(podId);
    },
    [actions],
  );
  const retryEvents = useCallback(
    (podId: PodId) => {
      void actions.loadMoreEvents(podId);
    },
    [actions],
  );

  usePodLoadAlert(notifier, 'lanes-load', activePodId, rail.phase, rail.error, retryLanes);
  usePodLoadAlert(
    notifier,
    'events-load',
    activePodId,
    session?.backfill.phase ?? 'idle',
    session?.backfill.error ?? null,
    retryEvents,
  );

  useEffect(() => {
    if (routingModeError === null) {
      notifier.dismiss('routing-mode');
      return;
    }
    const action: NotificationAction = {
      label: 'Retry',
      onAction: () => {
        void actions.retryRoutingMode();
      },
    };
    notifier.notify({
      kind: 'error',
      message: routingModeError.message,
      key: 'routing-mode',
      action,
    });
  }, [notifier, routingModeError, actions]);

  return null;
}
