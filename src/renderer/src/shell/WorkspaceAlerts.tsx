/**
 * The workspace-level load failures, reported into the notification region.
 *
 * Renders nothing. It reads three load outcomes the state layer already
 * records and raises the matching error rows of the frozen
 * `contracts/action-messages.md` (session 20261111-0156-message-alerting):
 *
 *   E8   the active Pod's `lanes.list` failed     key `lanes-load:{podId}`
 *   E9   the active Pod's backfill failed          key `events-load:{podId}`
 *   E10  `app.routingMode()` failed                key `routing-mode`
 *
 * Each message is `IpcError.message` verbatim. E8 and E9 are dismissed when
 * that Pod's phase leaves `'error'`; E10 is never dismissed, because there is
 * no retry.
 *
 * WHY EVERY ROW IS KEYED. The notification is raised from an effect, and
 * StrictMode runs every effect twice on mount. A keyed `notify` replaces the
 * live item in place, so the double run still leaves exactly one item; the
 * same holds for any later re-run of an effect whose inputs did not change.
 */

import { useEffect } from 'react';

import type { PodId } from '@shared/contracts/events';
import type { IpcError } from '@shared/contracts/ipc';
import type { LoadPhase } from '../contracts/renderer-state';
import { useNotify, type Notifier } from '../notifications';
import { useLaneRail, useWorkspace } from '../state';

/**
 * Raises `key` while `phase` is `'error'` and dismisses it otherwise.
 * `podId === null` means no Pod is active, and nothing is raised or dismissed
 * for a Pod that cannot be named.
 */
function usePodLoadAlert(
  notifier: Notifier,
  keyPrefix: string,
  podId: PodId | null,
  phase: LoadPhase,
  error: IpcError | null,
): void {
  useEffect(() => {
    if (podId === null) return;
    const key = `${keyPrefix}:${podId}`;
    if (phase === 'error' && error !== null) {
      notifier.notify({ kind: 'error', message: error.message, key });
    } else {
      notifier.dismiss(key);
    }
  }, [notifier, keyPrefix, podId, phase, error]);
}

export function WorkspaceAlerts(): null {
  const notifier = useNotify();
  const { session, routingModeError } = useWorkspace();
  const rail = useLaneRail();

  // `useLaneRail()` and `session` both describe the ACTIVE Pod, so the id the
  // keys carry is the session's.
  const podId = session?.podId ?? null;

  usePodLoadAlert(notifier, 'lanes-load', podId, rail.phase, rail.error);
  usePodLoadAlert(
    notifier,
    'events-load',
    podId,
    session?.backfill.phase ?? 'idle',
    session?.backfill.error ?? null,
  );

  useEffect(() => {
    if (routingModeError === null) return;
    notifier.notify({ kind: 'error', message: routingModeError.message, key: 'routing-mode' });
  }, [notifier, routingModeError]);

  return null;
}
