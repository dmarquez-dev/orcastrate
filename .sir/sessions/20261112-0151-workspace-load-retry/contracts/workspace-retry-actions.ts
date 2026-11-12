// frozen: 20261112-0151-workspace-load-retry, Gate 2
/**
 * CONTRACT — retry entry points for the three workspace loads, as an
 * amendment to `WorkspaceActions` and `WorkspaceStore` in
 * `src/renderer/src/contracts/renderer-state.ts`.
 *
 * Boundary between:
 *   - T2 (PRODUCER) owns `src/renderer/src/contracts/renderer-state.ts` and
 *     `src/renderer/src/state/store.ts`. The two new members are declared ONCE,
 *     on `WorkspaceActions` in `renderer-state.ts`; consumers reach them as
 *     `useWorkspace().actions` or `useWorkspaceActions()` and never re-declare
 *     them.
 *   - T3 (CONSUMER) calls `retryLanes`, `retryRoutingMode` and the existing
 *     `loadMoreEvents` from the Retry actions of the E8, E10 and E9
 *     notifications in `src/renderer/src/shell/WorkspaceAlerts.tsx`.
 *
 * RENDERER ONLY. No IPC channel, no preload member, no main-process change:
 * both members re-issue a channel the store already calls (`lanes.list`,
 * `app.routingMode`). ERROR DISCIPLINE is the file's existing one: every
 * member resolves an `ActionResult` and NEVER rejects or throws; a failure
 * that crossed IPC is passed through as the SAME `IpcError` object; a
 * rejecting or malformed preload answer becomes `INTERNAL` (the store's
 * `safeInvoke`); no bridge (`api === null`) resolves the store's existing
 * no-bridge `INTERNAL` error without touching state.
 */

import type { PodId } from '@shared/contracts/events';
import type { IpcError } from '@shared/contracts/ipc';
import type { RoutingMode } from '@shared/contracts/lane-router';

/** UNCHANGED. Restated so this file compiles on its own. */
export type ActionResult<T = void> = { ok: true; value: T } | { ok: false; error: IpcError };

export interface WorkspaceActionsRetryAmendment {
  /**
   * ADDED. Re-reads `lanes.list(podId)` for that Pod, in any lane phase.
   *
   * - Synchronously, before the call is issued, the Pod's `lanesPhase` becomes
   *   `'loading'` and its `lanesError` becomes `null` — the same writes the
   *   activation load makes.
   * - `{ ok: false }`: `lanesPhase` `'error'`, `lanesError` that very
   *   `IpcError` object; resolves `{ ok: false, error }` with the same object.
   *   The Pod's existing `lanes` are left as they were.
   * - `{ ok: true }`: `lanes` become the answer, `lanesPhase` `'ready'`,
   *   `lanesError` `null`, and the lane selection is repaired exactly as the
   *   activation load repairs it; resolves `{ ok: true, value: undefined }`.
   * - COALESCES: a call while a `lanes.list` for the same Pod is in flight —
   *   the one `setActivePod` starts included — issues no second call and
   *   resolves that load's outcome.
   * - Does not activate the Pod, does not change `activePodId`, and does not
   *   read the backfill.
   */
  retryLanes(podId: PodId): Promise<ActionResult<void>>;

  /**
   * ADDED. Re-reads `app.routingMode()` when the mode is still unresolved.
   *
   * - `routingMode` already non-null: NO-OP. No IPC call, no state change;
   *   resolves `{ ok: true, value: undefined }`. The mode, once read, is
   *   constant for the app's lifetime.
   * - COALESCES with a routing-mode read already in flight (the startup read
   *   included): no second call; resolves that read's outcome.
   * - Otherwise, synchronously before the call is issued, `routingModeError`
   *   becomes `null`, so it is `null` for as long as the read is in flight.
   * - `{ ok: false }`: `routingModeError` becomes that very `IpcError` object
   *   — and because it passed through `null` while in flight, a subscriber
   *   sees it change even when the bridge answers the same object twice — and
   *   `routingMode`
   *   stays `null`; resolves `{ ok: false, error }` with the same object.
   * - `{ ok: true }`: `routingMode` becomes the answer and `routingModeError`
   *   is `null`; resolves `{ ok: true, value: undefined }`.
   */
  retryRoutingMode(): Promise<ActionResult<void>>;

  /**
   * UNCHANGED SIGNATURE AND BEHAVIOUR; its docblock is corrected. The no-op is
   * keyed on `backfill.phase === 'ready' && !backfill.hasMore` ONLY. After a
   * failed read the phase is `'error'` and `cursorSeq` is unchanged, so a call
   * re-reads the very page that failed: this IS E9's retry. While a page is in
   * flight a call coalesces into it. The phase becomes `'loading'` with
   * `error` `null` before the call; a failure sets `'error'` with that very
   * `IpcError`; a success sets `'ready'`.
   */
  loadMoreEvents(podId: PodId): Promise<ActionResult<void>>;
}

export interface WorkspaceStoreRoutingModeAmendment {
  /**
   * REWORDED. `null` while unresolved. Resolved by the startup read or, after
   * that failed, by a successful `retryRoutingMode()`; constant from then on.
   */
  routingMode: RoutingMode | null;
  /**
   * REWORDED. Non-null IF AND ONLY IF the most recent SETTLED routing-mode
   * read (startup or `retryRoutingMode`) resolved `{ ok: false }`, and no
   * retry is in flight; it is then that `IpcError` object, unmodified. `null`
   * before the startup read settles, while a retry is in flight, and after a
   * success. Writers: the startup read and `retryRoutingMode`, nothing else.
   * No bridge: stays `null`.
   */
  routingModeError: IpcError | null;
}
