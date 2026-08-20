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

/**
 * `SystemPayload.subtype` for the reconciliation notice. A free string by
 * contract (`events.ts`), so `EventType` and `EVENT_TYPES` are untouched and
 * anything that renders a `system` event today renders this one.
 */
export const STARTUP_RECONCILIATION_SUBTYPE = 'startup_reconciliation' as const;

/**
 * EXACT TEXT, rendered verbatim, and pinned by a test.
 *
 * It is a fixed sentence rather than a free string so that two Pods reconciled
 * by the same sweep read identically and so the wording cannot drift. It
 * already names `Open`, which is also the affordance `status: 'closed'`
 * selects. Do not reword it.
 */
export const STARTUP_RECONCILIATION_REASON =
  'Orcastrate restarted while this Pod was still open. No Claude Code process ' +
  'survives an application restart, so lanes left running were marked ' +
  'Orphaned. Press Open to start this Pod again.';

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
