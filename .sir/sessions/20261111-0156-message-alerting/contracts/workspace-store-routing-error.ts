// frozen: 20261111-0156-message-alerting, Gate 2
/**
 * CONTRACT — amendment to `WorkspaceStore` (`src/renderer/src/contracts/renderer-state.ts`).
 *
 * Boundary between:
 *   - T2 (PRODUCER) owns `src/renderer/src/contracts/renderer-state.ts`,
 *     `src/renderer/src/state/store.ts` and
 *     `src/renderer/src/state/workspace-provider.tsx`. The field below ships
 *     in `renderer-state.ts`'s `WorkspaceStore`; that file is its only
 *     declaration.
 *   - T4 (CONSUMER) reads it through `useWorkspace()` and raises the
 *     `routing-mode` error of `action-messages.md` row E10.
 *
 * WHY. At base a failed `app.routingMode()` returns without recording anything
 * (`src/renderer/src/state/store.ts:312`), so `routingMode` stays `null` and
 * the shell shows the loading workspace forever with no message — one of the
 * seven channels `failure-paths.e2e.test.tsx` lists as surfaceless.
 *
 * ONLY THIS FIELD IS ADDED. No other `WorkspaceStore` member, no
 * `WorkspaceActions` member, and no hook changes.
 */

import type { IpcError } from '@shared/contracts/ipc';
import type { RoutingMode } from '@shared/contracts/lane-router';

export interface WorkspaceStoreRoutingModeAmendment {
  /** Unchanged: `null` while unresolved, and still `null` after a failure. */
  routingMode: RoutingMode | null;
  /**
   * ADDED. Non-null IF AND ONLY IF `app.routingMode()` resolved
   * `{ ok: false }`; it is then that `IpcError` object, passed through
   * unmodified (same message, same code). `null` before the call settles and
   * after a successful one. One writer: the store's routing-mode load. No
   * retry is added, so once non-null it stays non-null for the app's lifetime,
   * like `routingMode` itself.
   *
   * No bridge (`api === null`): stays `null` — that case already surfaces
   * through `pods`' `INTERNAL` error.
   */
  routingModeError: IpcError | null;
}
