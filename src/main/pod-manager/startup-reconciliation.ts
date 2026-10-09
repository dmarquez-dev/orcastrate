/**
 * Startup reconciliation — the shapes and the one fixed sentence.
 *
 * A process restart destroys every `PodRunner`, but nothing in the store knows
 * that. Reproduced on 2026-08-20: with the app closed and no Claude Code
 * process alive, `orcastrate.db` still held Matriarch lanes at
 * `status: 'running'` with `ended_at: null`, and on relaunch the rail rendered
 * them Running with a duration ticking from the original `started_at`.
 *
 * `PodManager.reconcileStartup()` is the sweep that closes that gap. This file
 * holds only its vocabulary — the result shape, the `system` event's `data`
 * payload, and the reason sentence — so the behaviour stays in `PodManager`
 * where the store and the push surface already live.
 *
 * Nothing here is a new `EventType` and nothing here is a new store method.
 * `SystemPayload.subtype` is a free `string`, so the durable record rides the
 * existing `system` event; the sweep itself uses `listPods`, `listLanes`,
 * `setLaneStatus`, `updatePod` and `appendMany`, all of which already exist.
 */

import type { LaneId, PodId, PodStatus, Timestamp } from '../../shared/contracts/events';
import {
  STARTUP_RECONCILIATION_REASON,
  STARTUP_RECONCILIATION_SUBTYPE,
} from '../../shared/startup-reconciliation-notice';

/**
 * The marker and the reason sentence, RE-EXPORTED rather than declared.
 *
 * Both used to be declared here and copied into the renderer's transcript
 * filter, because `tsconfig.web.json` cannot see `src/main/**`. They now have
 * ONE definition, in `src/shared/startup-reconciliation-notice.ts`, which both
 * tsconfig programs include — so the filter reads the same binding this
 * producer writes and a rename here can no longer leave the notice silently
 * hidden.
 *
 * THE SPECIFIER IS RELATIVE ON PURPOSE, not `@shared/...`. `tsconfig.node.json`
 * declares no `paths` at all; only `tsconfig.web.json` maps `@shared/*`.
 * Verified 2026-10-09: `@shared` appears nowhere under `src/main/`,
 * `src/preload/`, `src/shared/`, `tests/` or `probe/`, and a file whose only
 * import is `@shared/contracts/events` fails under this program's options with
 * `TS2307: Cannot find module '@shared/contracts/events'`. Vitest's own alias
 * would have resolved it at runtime, which is exactly how such an import gets
 * committed green and breaks `tsc` instead.
 *
 * `./index.ts` re-exports both names onward, so every existing
 * `import { STARTUP_RECONCILIATION_REASON } from '.../src/main/pod-manager'`
 * still resolves to the same value.
 */
export { STARTUP_RECONCILIATION_REASON, STARTUP_RECONCILIATION_SUBTYPE };

/** `SystemPayload.data` for the reconciliation notice. */
export interface StartupReconciliationData {
  subtypeMarker: typeof STARTUP_RECONCILIATION_SUBTYPE;
  /** Always `STARTUP_RECONCILIATION_REASON`. */
  reason: string;
  statusBefore: PodStatus;
  statusAfter: PodStatus;
  orphanedLaneIds: readonly LaneId[];
  at: Timestamp;
}

/** One Pod the sweep changed. Pods needing no change are omitted entirely. */
export interface ReconciledPod {
  podId: PodId;
  /** The Pod's persisted status before the sweep. */
  statusBefore: PodStatus;
  /**
   * The status after. `'closed'` for every `statusBefore` other than
   * `'beached'`; `'beached'` is left alone, because it is already a truthful
   * not-open resting state WITH a recorded cause.
   */
  statusAfter: PodStatus;
  /** Lanes flipped `running` -> `orphaned`, in `listLanes` order. */
  orphanedLaneIds: readonly LaneId[];
}

/** What the sweep changed. Returned for logging and for assertions. */
export interface StartupReconciliation {
  /** ISO-8601. The single `now()` stamp used for every row the sweep writes. */
  at: Timestamp;
  /** One entry per Pod that needed any change. */
  pods: readonly ReconciledPod[];
}

/** The one new public method on `PodManager`. Synchronous, and idempotent. */
export interface StartupReconciler {
  reconcileStartup(): StartupReconciliation;
}
