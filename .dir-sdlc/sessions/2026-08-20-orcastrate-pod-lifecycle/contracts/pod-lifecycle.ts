/**
 * CONTRACT — Pod lifecycle across a process restart. AMENDED at Gate 2, then
 * frozen.
 *
 * ---------------------------------------------------------------------------
 * AMENDMENT NOTICE — READ THIS FIRST
 * ---------------------------------------------------------------------------
 * Escalation E1 was resolved at Gate 2 as OPTION 3, which is NOT the shape the
 * first draft of this file recommended. The decision:
 *
 *   `PodStatus` IS WIDENED WITH A FIFTH VALUE, `'closed'`, so that `status`
 *   ALONE is authoritative about whether main holds a live runner. There is no
 *   `PodView`. There is no parallel `opened` boolean anywhere on the IPC
 *   surface. `opened` is DERIVED from `status`, in exactly one place, by
 *   exactly one rule.
 *
 * The user was shown the three costs of this option before choosing it — the
 * `MIGRATION_1` rewrite hazard, the reach into `src/main/store/**`, and the
 * frozen `renderer-theme.ts` status tokens — and chose it on the grounds that
 * one authoritative field beats a parallel boolean. That is settled. Nothing
 * in this session relitigates it, and no task proposes reverting to `PodView`.
 *
 * Escalation E2 was resolved as OPTION A: session-id capture narrows to
 * `system`/`subtype: 'init'` and `result` messages, latest such id in a run
 * wins, and a warn-level log fires when a captured id differs from the stored
 * one. Section 8 is now binding rather than conditional.
 *
 * Boundary between: T0 (widens the union, pins migration 1, writes migration 3
 * and the store), T1 (the IPC surface and preload bridge), T2 (the boot sweep,
 * Matriarch revival, the manager-side reap, and the close-race), T3 (the
 * runner-side reap and the session-id capture rule), and T4/T5 (the renderer,
 * which derives openness from `status`).
 *
 * ---------------------------------------------------------------------------
 * WHY THIS FILE EXISTS
 * ---------------------------------------------------------------------------
 * Orcastrate persists Pods and lanes, and until this session NOTHING
 * reconciled those rows against the fact that a process restart destroys every
 * runner. Reproduced on 2026-08-20: with the app closed and no Claude Code
 * process alive, `%APPDATA%\orcastrate\orcastrate.db` held Matriarch lanes with
 * `status: 'running'` and `ended_at: null`. On relaunch the rail rendered them
 * Running with a duration ticking from the original `started_at`.
 *
 * Design spec section 8 has a row for a Calf "still open when the turn's
 * `result` arrives" and NO row for a lane still open at PROCESS START. Section
 * 4.4 enumerates `running | done | orphaned` and stops there. The gap is
 * documented, not typed, and this contract closes it.
 *
 * ---------------------------------------------------------------------------
 * THE THREE RULES THIS FILE IS BUILT ON (rule 1 is REWRITTEN by the amendment)
 * ---------------------------------------------------------------------------
 * 1. THREE ENUMS ARE FROZEN; ONE IS WIDENED DELIBERATELY, WITH ITS MIGRATION
 *    PINNED. `LANE_STATUSES`, `LANE_KINDS` and `EVENT_TYPES` stay byte-identical
 *    to their shipped values, so reconciliation still reuses `orphaned` and
 *    still reuses `system` with a free-form `subtype`. `POD_STATUSES` IS
 *    widened with `'closed'` — and because `MIGRATION_1` interpolates it LIVE
 *    into already-shipped DDL (`src/main/store/schema.ts:147`), that widening
 *    is inseparable from pinning migration 1 and adding migration 3. Section 6
 *    below is the whole of that obligation and it is load-bearing, not a
 *    footnote.
 *
 * 2. RECONCILIATION IS OBSERVABLE. A sweep that silently rewrites lane rows is
 *    worse than the bug. Every reconciled lane leaves a durable `lane_closed`
 *    event in the transcript, and every Pod WHOSE LANES WERE RECONCILED leaves
 *    one `system` event naming what changed and why. Those rows survive; they
 *    are not a push that a renderer which was not yet listening can miss.
 *
 * 3. RECONCILIATION IS REVERSIBLE. Opening the Pod puts its Matriarch lane
 *    back to `running` with `ended_at` cleared. Nothing about the sweep makes
 *    a Pod less usable than it was before the restart.
 */

import type {
  Lane,
  LaneId,
  Pod,
  PodId,
  PodStatus,
  Timestamp,
} from '../../../../src/shared/contracts/events';

// ---------------------------------------------------------------------------
// 1. The amended `orphaned` semantics  (UNCHANGED by the E1 amendment)
// ---------------------------------------------------------------------------

/**
 * AMENDMENT to `LaneClosedPayload.status` in `src/shared/contracts/events.ts`
 * and to design spec section 8. `LaneStatus` is UNCHANGED — the union is still
 * `'running' | 'done' | 'orphaned'` and no migration touches `lanes`. What
 * changes is the documented meaning of `orphaned`, which until now read:
 *
 *     "'done' on tool_result; 'orphaned' at a turn boundary with no result."
 *
 * `orphaned` now covers TWO boundaries, and the docblock must say both:
 *
 *   TURN BOUNDARY (unchanged, spec 8): a lane opened by `system`/`task_started`
 *   with no terminal `system`/`task_updated` when the turn's `result` arrives.
 *
 *   PROCESS BOUNDARY (new): a lane found `running` at application start, when
 *   by construction no runner exists to advance it. The process that owned the
 *   lane is gone, so the lane cannot reach `done`.
 *
 * WHY REUSE RATHER THAN ADD A LANE STATUS. Three independent reasons. Note that
 * the first two are the SAME reasons that made widening `PodStatus` expensive
 * in section 5 — the difference is that `PodStatus` had a defect only a new
 * value could fix, and `LaneStatus` does not:
 *   - Design spec section 2's lexicon rule: "New concepts introduced later
 *     should extend this scheme; new *steady* states should not be themed."
 *     A boot-orphaned lane is not a new steady state — it is the same resting
 *     state (open, will never close) reached by a second route.
 *   - Widening `LANE_STATUSES` triggers the migration hazard of section 6 for
 *     a second table, and buys nothing.
 *   - The renderer already renders `orphaned` end to end: `LANE_STATUS_LABEL`
 *     (`lane-status.ts:14`), `TOKENS.statusOrphaned` (`renderer-theme.ts:70`),
 *     and `contract-runtime.ts:35`.
 *
 * THE CONFLATION IS NAMED, NOT HIDDEN. Whoever reads a lane row can tell the
 * two apart: the process-boundary case ALWAYS carries the `system` event of
 * section 3 below on the Pod's Matriarch lane, immediately before its
 * `lane_closed` events. The turn-boundary case never does.
 */
export type OrphanReason = 'turn-boundary' | 'process-start';

// ---------------------------------------------------------------------------
// 2. The boot sweep  (STEPS b, c AND d REWRITTEN BY THE E1 AMENDMENT)
// ---------------------------------------------------------------------------

/**
 * `PodManager` gains exactly one new public method. It is SYNCHRONOUS — the
 * whole `EventStore` API is synchronous — and it is idempotent: a second call
 * with no intervening runner finds nothing to reconcile and returns an empty
 * `pods` array, writing no rows and appending no events.
 *
 * CALL SITE, and it is the only one: `src/main/index.ts`, inside
 * `app.whenReady()`, AFTER the `PodManager` is constructed (`index.ts:125`)
 * and BEFORE `createMainWindow()` (`index.ts:168`). After, because there is no
 * manager before it; before, because the renderer's first `pod:list` and
 * `lane:list` must not be able to observe an unreconciled row. `index.ts`'s own
 * docblock forbids logic in that file, so the call is one line and the
 * behaviour lives in `src/main/pod-manager/`.
 *
 * THE CALL SITE IS ALSO ORDERED AFTER `migrate()`, and the E1 amendment makes
 * that ordering load-bearing where it used to be incidental. Migration 3
 * (section 6) widens the `pods.status` CHECK constraint; the sweep WRITES
 * `'closed'`. A sweep that ran before the migration would fail every write with
 * `CHECK constraint failed`. `SqliteEventStore` migrates in its own
 * construction path, which already precedes the `PodManager` constructor, so
 * the existing order is correct — but a test now pins it rather than leaving it
 * to luck.
 *
 * PUSHES ARE NOT THE DELIVERY MECHANISM. `sendToRenderers` (`index.ts:84-91`)
 * tolerates zero windows by dropping the payload, and at this point in startup
 * there are none. Everything the renderer needs must be READABLE from the
 * store on its first `pods.list` / `lanes.list` / `events.read`. The sweep may
 * push, but nothing may depend on the push arriving.
 */
export interface StartupReconciler {
  reconcileStartup(): StartupReconciliation;
}

/** What the sweep changed. Returned for logging and for T6's assertions. */
export interface StartupReconciliation {
  /** ISO-8601. The single `now()` stamp used for every row the sweep writes. */
  at: Timestamp;
  /** One entry per Pod that needed any change. Pods needing none are omitted. */
  pods: readonly ReconciledPod[];
}

export interface ReconciledPod {
  podId: PodId;
  /** The Pod's persisted status before the sweep. */
  statusBefore: PodStatus;
  /**
   * The status after. `'closed'` for every `statusBefore` other than
   * `'beached'`; `'beached'` is left alone. See step (c).
   */
  statusAfter: PodStatus;
  /** Lanes flipped `running` -> `orphaned`, in `listLanes` order. */
  orphanedLaneIds: readonly LaneId[];
}

/**
 * THE SWEEP, stated so a reviewer can check it line by line.
 *
 * For each Pod from `store.listPods()`, in that order:
 *
 * a. LANES. For every lane from `store.listLanes(podId)` whose status is
 *    `'running'`, call `store.setLaneStatus(lane.id, 'orphaned', at)`. Both
 *    Matriarch and Calf lanes are swept — a Matriarch left open by a killed
 *    process is exactly the reproduced bug. `setLaneStatus` stamps `ended_at`
 *    for a terminal status, which the migration-1 CHECK at `schema.ts:166`
 *    (`(status = 'running') = (ended_at IS NULL)`) requires.
 *
 * b. EVENTS, only when step (a) changed at least one lane. ONE `appendMany`
 *    per Pod, in this order, so `seq` is contiguous and the batch is
 *    all-or-nothing:
 *      1. one `system` event on the Pod's MATRIARCH lane, payload per
 *         section 3;
 *      2. one `lane_closed` event per orphaned lane, each on ITS OWN lane id,
 *         with `payload.status === 'orphaned'`.
 *    Both are synthetic, so neither carries `raw` — matching the existing rule
 *    at `events.ts:296-301`.
 *
 *    WHY THE CONDITION IS "A LANE CHANGED" AND NOT "ANYTHING CHANGED", and this
 *    is a DELIBERATE NARROWING made necessary by the E1 amendment. Under Option
 *    3, step (c) below now rewrites EVERY non-beached Pod, including quiet ones
 *    that were merely `'idle'`. Emitting a transcript row for each of those
 *    would put a reconciliation notice into every Pod on every single relaunch,
 *    forever — noise that trains the user to ignore the one notice that
 *    matters. A pure `'idle'` -> `'closed'` correction is bookkeeping, and the
 *    composer sentence plus the visible `Open` control already tell the user
 *    everything a transcript row would. The Pod still appears in the returned
 *    `pods` array, so nothing is hidden from the log or from a test.
 *
 * c. POD STATUS — REWRITTEN BY THE E1 AMENDMENT. When `pod.status` is anything
 *    other than `'beached'`, call
 *    `store.updatePod(podId, { status: 'closed', lastActiveAt: pod.lastActiveAt })`.
 *
 *    THIS IS A STRICTLY WIDER RULE THAN THE FIRST DRAFT'S. The first draft
 *    rewrote only `'running'` and `'waiting'` to `'idle'`, and deliberately
 *    left `'idle'` alone as "already correct". Under Option 3 `'idle'` is NO
 *    LONGER CORRECT at boot: `'idle'` now means OPEN AND BETWEEN TURNS, and at
 *    application start no runner exists, so an `'idle'` row is a lie about a
 *    process that is not there. Every non-beached Pod is `'closed'` at boot by
 *    construction. This is the change that makes the relaunch defect impossible
 *    at the DATA level rather than merely papered over in the view.
 *
 *    THE EXPLICIT `lastActiveAt` IS LOAD-BEARING, NOT DEFENSIVE, AND THE
 *    AMENDMENT MAKES IT MORE SO. `EventStore.updatePod` "Also refreshes
 *    `lastActiveAt` to now unless `lastActiveAt` is supplied explicitly"
 *    (`event-store.ts:128-132`). Under the first draft the trap was reachable
 *    only for Pods that were mid-turn at the crash. Under Option 3 the sweep
 *    touches EVERY non-beached Pod on EVERY boot, so omitting `lastActiveAt`
 *    would reset every Pod's last-used stamp to boot time on every launch and
 *    destroy the field entirely within one session of use. It is now the single
 *    highest-consequence line in the sweep.
 *
 *    `'beached'` IS LEFT ALONE. It is already a truthful not-open resting state
 *    WITH a recorded cause, and rewriting it to `'closed'` would erase the
 *    reason the Pod stopped and send the user to `Open` instead of `Reconnect`.
 *    See section 5's transition table.
 *
 * d. A Pod with no `running` lane AND a status of `'closed'` or `'beached'`
 *    produces NO write and NO entry in `pods`. This is the clause that keeps
 *    the sweep idempotent: after one sweep every Pod is `'closed'` or
 *    `'beached'` with no running lanes, so a second call is a pure read.
 *
 * ORDERING. Lanes before the pod-status write, so a crash mid-sweep leaves
 * lanes reconciled and the Pod status stale rather than the reverse — a stale
 * status with reconciled lanes is recoverable by the next boot, and a Pod
 * already `'closed'` with `running` lanes is the bug this fixes.
 */
export type SweepShape = never;

// ---------------------------------------------------------------------------
// 3. The durable record: a `system` event, no new `EventType`
// ---------------------------------------------------------------------------

/**
 * `SystemPayload.subtype` is a free `string` (`events.ts:240-244`), so this
 * needs no change to `EventType` and no change to `EVENT_TYPES`. Anything that
 * renders a `system` event today renders this one, because spec 5.2 requires
 * every `EventType` to stay renderable.
 */
export const STARTUP_RECONCILIATION_SUBTYPE = 'startup_reconciliation' as const;

/**
 * `SystemPayload.data` for that event. It is the "what was reconciled and why"
 * the user must be able to see. Two audiences and both are served: the
 * transcript renders the subtype and the data as it renders any `system`
 * event, and `orphanedLaneIds` lets a later reader join it back to the rows.
 *
 * `reason` is a fixed sentence rather than a free string so that the wording
 * tests can pin it and so two Pods reconciled by the same sweep read
 * identically.
 */
export interface StartupReconciliationData {
  subtypeMarker: typeof STARTUP_RECONCILIATION_SUBTYPE;
  /**
   * EXACT TEXT, rendered verbatim:
   * "Orcastrate restarted while this Pod was still open. No Claude Code
   *  process survives an application restart, so lanes left running were
   *  marked Orphaned. Press Open to start this Pod again."
   *
   * UNCHANGED BY THE E1 AMENDMENT. The sentence already describes exactly what
   * Option 3 does, and it already names `Open` as the way out — which is now
   * also the affordance that `status: 'closed'` selects. Do not reword it.
   */
  reason: string;
  statusBefore: PodStatus;
  statusAfter: PodStatus;
  orphanedLaneIds: readonly LaneId[];
  at: Timestamp;
}

// ---------------------------------------------------------------------------
// 4. Reversibility: reviving the Matriarch on open  (UNCHANGED)
// ---------------------------------------------------------------------------

/**
 * WITHOUT THIS THE SWEEP IS A ONE-WAY DOOR, and that is the single easiest way
 * to make this session worse than the bug it fixes.
 *
 * `PodManager.#ensureMatriarchLane` returns an existing Matriarch lane
 * unchanged whatever its status (`pod-manager.ts:883-886`), and nothing in
 * `#start` ever sets a lane back to `running`. So after the sweep, every
 * subsequent Open would leave the rail showing the Matriarch as Orphaned
 * forever while the Pod ran normally underneath it.
 *
 * REQUIRED: in `#start`, after `#ensureMatriarchLane` and before
 * `router.restore`, if the Matriarch lane's status is not `'running'`, call
 * `store.setLaneStatus(matriarchLaneId, 'running')` with NO `endedAt` — which
 * clears `ended_at` (`sqlite-event-store.ts:309-311`) and satisfies the
 * `(status = 'running') = (ended_at IS NULL)` CHECK. Then push `laneChanged`
 * with the refreshed list.
 *
 * CALF LANES ARE NOT REVIVED. A Calf's worker process is genuinely gone and
 * cannot be resumed; `orphaned` is the truth for it. Only the Matriarch, which
 * is the lane the new runner will actually write into, comes back.
 *
 * This applies to `openPod` and `reconnectPod` alike, because both go through
 * `#start`.
 */
export type MatriarchRevival = never;

// ---------------------------------------------------------------------------
// 5. `'closed'`: the fifth PodStatus  (REPLACES THE FIRST DRAFT'S `PodView`)
// ---------------------------------------------------------------------------

/**
 * THE DEFECT, restated, because the fix changed shape but the defect did not.
 * `runtime.opened` is renderer-local, in-memory, and initialised `false`
 * (`store.ts:161`). It is set true only by a successful `pods.open`
 * (`store.ts:473,533,552`) and cleared only by a `beached` push
 * (`store.ts:357-360`). Any fresh renderer — reload, HMR, relaunch — believes
 * every Pod is unopened regardless of what main knows. After a relaunch that
 * happens to be RIGHT; after an HMR cycle it is WRONG, and the composer is
 * disabled on a Pod whose runner is alive and streaming.
 *
 * THE ROOT CAUSE, in one sentence: `'idle'` means two different things.
 * `src/main/index.ts:133` already says so, in a comment written during an
 * earlier session — "`status: 'idle'` covers both open-and-quiet and closed" —
 * which is the strongest available evidence that this conflation was a known
 * wart before it produced a user-visible defect.
 *
 * THE FIX (Gate 2, option 3): stop conflating them. `PodStatus` gains
 * `'closed'`, so every state of a Pod has exactly one name, and `status` alone
 * answers "does main hold a live runner for this Pod".
 */

/**
 * THE AMENDED UNION, in `src/shared/contracts/events.ts:60`:
 *
 *     export type PodStatus = 'closed' | 'idle' | 'running' | 'waiting' | 'beached';
 *
 * `'closed'` is FIRST in the union because it is the initial state of every
 * Pod. Order in a union is documentation, not semantics, but this file fixes it
 * so that two implementers do not produce two different orderings which a
 * byte-comparison test then argues about.
 *
 * THE MEANING OF EACH VALUE. Every one of the four existing meanings is
 * NARROWED rather than preserved, because `'idle'` gives up its second job:
 *
 *   'closed'   Main holds NO live `PodRunner` for this Pod, and that is the
 *              intended, non-error state of affairs. The Pod row exists; there
 *              is no process. Reached by creation, by `closePod`, and by the
 *              boot sweep. The affordance is `Open`.
 *
 *   'idle'     Main HOLDS a live runner and it is between turns. This is a
 *              NARROWING: before this session `'idle'` also covered the closed
 *              case, which is the defect.
 *
 *   'running'  Main holds a live runner and a turn is streaming.
 *
 *   'waiting'  Main holds a live runner and at least one permission request is
 *              unanswered.
 *
 *   'beached'  Main holds no live runner because the process DIED or a start
 *              FAILED. Not open, like `'closed'`, but distinguished from it by
 *              carrying a CAUSE: `PodStatusPush.exitCode` and `.detail` are
 *              populated for `'beached'` and for nothing else. The affordance
 *              is `Reconnect`, which resumes against `ccSessionId`.
 *
 * THE DERIVATION, and it is the ONLY definition of openness in the product:
 *
 *     opened  <=>  status === 'idle' || status === 'running' || status === 'waiting'
 *
 * equivalently `status !== 'closed' && status !== 'beached'`. WRITE IT IN THE
 * POSITIVE FORM. The negative form must be re-audited every time the union
 * grows; the positive form fails CLOSED, which is the direction that cannot
 * hurt a user — an unrecognised future status renders as not-open, showing a
 * run control that is at worst redundant, rather than enabling a composer over
 * a process that is not there.
 *
 * THERE IS EXACTLY ONE IMPLEMENTATION OF THAT RULE IN THE REPOSITORY, and it
 * lives in the renderer, in `derivePodList` (`workspace-provider.tsx:159`).
 * Main does NOT need it: main knows from `#sessions` and simply writes the
 * correct status. A shared helper was considered and REJECTED — putting it in
 * `events.ts` would break that file's documented "exports types only" property
 * which `schema.ts:23` relies on, and putting it in `ipc.ts` would add a
 * dependency edge from the renderer-state task to the IPC task for a
 * three-token expression. One rule, one place, no shared plumbing.
 */
export type PodStatusAmendment = never;

/**
 * THE TRANSITION TABLE. Every arrow below is a real code path, named. A
 * transition not in this table is a defect.
 *
 *   (create)          -> 'closed'    `sqlite-event-store.ts:171` — the INSERT
 *                                    literal changes from `'idle'` to
 *                                    `'closed'`. A Pod that has NEVER been
 *                                    opened is closed: there is no process, and
 *                                    the tab must show `Open`. Under the old
 *                                    union this row was `'idle'`, which is
 *                                    precisely the never-opened-but-claims-
 *                                    open-and-quiet lie.
 *
 *   'closed'  -> 'idle'              `#start` success, `pod-manager.ts:348`.
 *                                    Unchanged line; its meaning is now exact.
 *   'beached' -> 'idle'              `reconnectPod` -> `#start` success.
 *
 *   'idle'    -> 'running'           runner `onStatus`, first message of a turn.
 *   'running' -> 'waiting'           permission request raised.
 *   'waiting' -> 'running'           last permission resolved.
 *   'running' -> 'idle'              turn `result` arrives.
 *
 *   any       -> 'beached'           `#markBeached` — process exit or failed
 *                                    start. Latched: `pod-runner.ts:424` drops
 *                                    any non-beached transition once beached.
 *
 *   'idle' | 'running' | 'waiting'
 *             -> 'closed'            `closePod`, `pod-manager.ts:287`. The
 *                                    literal changes from `'idle'` to
 *                                    `'closed'`. THIS IS THE LINE THE WHOLE
 *                                    OPTION TURNS ON.
 *   'beached' -> 'beached'           `closePod` on a beached Pod leaves it
 *                                    beached. The existing guard at
 *                                    `pod-manager.ts:285`
 *                                    (`pod.status !== 'beached'`) already does
 *                                    this and MUST be preserved: closing a
 *                                    beached Pod must not erase why it died.
 *
 *   'closed' | 'idle' | 'running' | 'waiting'
 *             -> 'closed'            the boot sweep, step (c). `'beached'` is
 *                                    excluded; everything else converges.
 *
 * WHAT `'closed'` MEANS FOR A POD THAT HAS NEVER BEEN OPENED VERSUS ONE CLOSED
 * AFTER RUNNING: NOTHING DISTINGUISHES THEM, AND THAT IS INTENTIONAL. Both have
 * no process, both offer `Open`, both keep their transcript. The difference —
 * whether there is history to resume — is ALREADY carried by `ccSessionId`,
 * which is null before the first turn and set after it. Encoding "closed but
 * used before" as a sixth status would put a second name on one state, which is
 * the mistake this whole section exists to undo.
 *
 * HOW `'closed'` INTERACTS WITH `'beached'`, since both mean "no runner":
 * `'beached'` is a FAILURE with a cause; `'closed'` is a DELIBERATE resting
 * state without one. They are never both true, they never race (the sweep skips
 * beached, `closePod` skips beached, and `#setStatus`'s beached latch drops late
 * transitions), and every ladder in the product tests `'beached'` FIRST. The
 * composer's disabled-reason ladder — `beached`, then `not-opened`, then
 * `awaiting-permission` — is UNCHANGED in order and in wording, and the fact
 * that `'closed'` falls through to `not-opened` is correct: the sentence "This
 * Pod is not running. Open it before sending a message." is exactly true of a
 * closed Pod and already names the way out.
 *
 * `ComposerState['disabledReason']` DOES NOT GAIN A `'closed'` MEMBER. It stays
 * `'not-opened' | 'beached' | 'awaiting-permission' | null`. Adding one would
 * break the exhaustive `Record` at `Composer.tsx:31-35` and the `it.each` at
 * `Composer.test.tsx:153-157` for no user-visible gain, since the copy would be
 * identical.
 */
export type PodStatusTransitions = never;

/**
 * WHY ADDING A STEADY STATE IS LEGITIMATE HERE, when design §2 lines 53-55 warn
 * against it. The rule reads: "Routine statuses remain literal: `Running`,
 * `Waiting`, `Idle`, `Done`. New concepts introduced later should extend this
 * scheme; new *steady* states should not be themed."
 *
 * Three things make `'closed'` compliant rather than an exception to the rule:
 *
 *  1. IT IS NOT A NEW STATE. The state — Pod row exists, no process — has been
 *     reachable since the first commit, by creation and by `closePod`. What is
 *     new is its NAME. The number of reachable states is unchanged; the number
 *     of names goes from four to five so that no two distinct states share one.
 *     The rule warns against inventing states; this splits an overloaded one.
 *
 *  2. IT OBEYS THE RULE IT IS TESTED AGAINST. The prohibition in §2 is on
 *     THEMING — `Beached`, `Orphaned`, `Flotsam` are themed; `Idle`, `Running`,
 *     `Waiting`, `Done` are literal. `Closed` is literal, ordinary English, and
 *     reads correctly beside `Idle`. It extends the scheme exactly as that
 *     sentence asks.
 *
 *  3. THE ALTERNATIVE WAS TRIED AND REJECTED AT GATE 2. Carrying openness as a
 *     parallel `opened: boolean` beside `status` puts two fields in a position
 *     to disagree, which is the same class of defect as the renderer-local
 *     latch being fixed. One authoritative field is the decision.
 *
 * A PROJECTION-ONLY `'closed'` WAS ALSO CONSIDERED AND REJECTED: keeping the
 * database at four statuses and having `PodManager` synthesise `'closed'` at
 * the IPC boundary would need no migration at all. Rejected because it
 * reproduces the rejected shape in disguise — `Pod.status` would mean one thing
 * at rest and another on the wire — and because it leaves every relaunched
 * database still holding `'idle'` rows that are false, which is the exact
 * stale-truth this session exists to remove.
 */
export type ClosedIsLegitimate = never;

/**
 * MAIN'S SIDE OF IT, and it is SMALLER than the first draft's, because there is
 * no projection to build. `PodManager` returns a plain `Pod` from every method
 * that returns one today — `listPods`, `createPod`, `updatePod`, `openPod`,
 * `reconnectPod` — with NO wrapper type and NO added field. `PodStatusPush`
 * keeps its exact current shape. The `pods` IPC namespace is unchanged in
 * signature; only the set of values `status` can take has grown.
 *
 * THE ONE NEW HAZARD OPTION 3 INTRODUCES, and it must be TESTED rather than
 * reasoned about. `PodRunner.stop()` ends with
 * `if (!this.#beached) this.#setStatus('idle')` (`pod-runner.ts:392`), which
 * reaches `PodManager`'s `onStatus` handler (`pod-manager.ts:657-661`) and
 * writes `'idle'` to the store. `closePod` calls `#dispose` — which calls
 * `stop()` — and only THEN writes `'closed'` (`:284-288`). So the correct final
 * value depends on that statement ordering holding, and on no runner callback
 * arriving after `#dispose` returns. Before this session both writes were
 * `'idle'` and the race was invisible because it had no consequence.
 *
 * REQUIRED: after `closePod` resolves, the persisted status is `'closed'`, and
 * no subsequent `podStatus` push for that Pod carries `'idle'`. A test drives a
 * runner whose `stop()` emits `onStatus('idle')` and asserts both. If detaching
 * the handlers in `#dispose` is what it takes, that is a legitimate fix; what is
 * NOT legitimate is relying on the current statement order and leaving no test
 * to notice when someone reorders it.
 *
 * `PodRunner` NEVER PRODUCES `'closed'`. The runner's `#status` is the RUNNER's
 * status, and a runner only exists while the Pod is open, so `'closed'` is not
 * reachable from inside it. `pod-runner.ts:392` keeps emitting `'idle'`, and
 * `tests/unit/pod/lifecycle.test.ts:97,104` keep asserting `'idle'` after
 * `stop()`, unchanged. Making the runner emit `'closed'` was considered and
 * rejected: it would race with `#dispose`, and closedness is a fact about the
 * MANAGER's registry, not about a runner that is by then gone.
 *
 * INVARIANTS a test must pin:
 *   - a Pod with `status: 'beached'` is never reported as open, because
 *     `#markBeached`'s callers delete the session first
 *     (`pod-manager.ts:671-674`, `:339-340`);
 *   - `#sessions.has(podId)` agrees with the section-5 derivation applied to
 *     `pod.status` after EVERY public method returns. This is the assertion
 *     that catches a missed status write, and it is cheap: one test helper,
 *     asserted after each of `createPod`, `openPod`, `closePod`,
 *     `reconnectPod`, `deletePod` and a failed start.
 */
export interface PodOpenness {
  listPods(): Pod[];
  openPod(podId: PodId): Promise<Pod>;
  reconnectPod(podId: PodId): Promise<Pod>;
  closePod(podId: PodId): Promise<void>;
}

/**
 * THE BLAST RADIUS. Every consumer of `PodStatus` in the repository,
 * enumerated so that no implementer discovers one late and no reviewer has to
 * go looking. Verified by direct search across `src/`, `tests/`, `probe/` and
 * `docs/` before Gate 2. Grouped by HOW each one fails.
 *
 * A. STOPS COMPILING THE MOMENT THE UNION WIDENS — loud, and the fix is
 *    mandatory.
 *   1. `src/renderer/src/pods/PodTab.tsx:11-16` —
 *      `Readonly<Record<PodStatus, string>> STATUS_LABEL`. Needs a fifth entry.
 *      REQUIRED TEXT: `closed: 'Closed'` — literal, per design §2. The four
 *      existing labels are unchanged, including
 *      `beached: 'Beached, process stopped'`.
 *   2. Every call site of `statusToken(...)` that passes a `PodStatus` — the
 *      Pod tab dot in `PodTab.tsx`, and anything reached from `PodTabVm.status`.
 *      These fail at the CALL SITE, not inside the map, because the map's key
 *      union is hand-written. See B1.
 *
 * B. KEEPS COMPILING AND IS SILENTLY WRONG — the dangerous group, because a
 *    hand-duplicated union does not track `PodStatus`.
 *   1. `src/renderer/src/contracts/renderer-theme.ts:130-134` — the FROZEN
 *      `export declare function statusToken(status: 'idle' | 'running' |
 *      'waiting' | 'beached' | 'done' | 'orphaned'): string;`. A hand-written
 *      duplicate of both status unions. It must gain `'closed'`, and `TOKENS`
 *      must gain `statusClosed: '--oc-status-closed'` beside the existing six
 *      `status*` entries at `:61-70`. THIS IS A CHANGE TO A FROZEN CONTRACT
 *      FILE, licensed by the Gate 2 decision and by nothing else.
 *   2. `src/renderer/src/shell/contract-runtime.ts:27-36` — `AnyStatus`, the
 *      second hand-written duplicate, and
 *      `STATUS_TOKENS: Readonly<Record<AnyStatus, string>>`. Both gain
 *      `'closed'` / `closed: TOKENS.statusClosed`.
 *      `src/renderer/src/shell/**` was declared frozen in the first draft's
 *      spec; THIS ONE FILE plus `WorkspaceLayout.test.tsx` are now in scope and
 *      the rest of `shell/` is not.
 *   3. `src/renderer/src/styles/tokens.css:42-50` — the six `--oc-status-*`
 *      custom properties. A seventh, `--oc-status-closed`, is required.
 *      REUSING `--oc-status-idle` WAS CONSIDERED AND IS NOT AVAILABLE:
 *      `WorkspaceLayout.test.tsx:182-186` asserts every status maps to a
 *      DISTINCT token (`new Set(tokens).size === statuses.length`), so a shared
 *      token fails an existing test. `src/renderer/src/styles/**` was declared
 *      frozen; THIS ONE FILE is now in scope.
 *   4. `src/renderer/src/pods/PodBar.module.css:100,106,111` —
 *      `.statusDot[data-status='idle'|'waiting'|'beached']`.
 *      `data-status="closed"` matches none of them and falls through to the
 *      base rule. Needs its own selector.
 *   5. `src/renderer/src/state/store.ts:346-361` — `onPodStatus` writes
 *      `push.status` into the pod and then clears `runtime.opened` only for
 *      `'beached'`, which would leave a `'closed'` push with a stale
 *      `opened: true`. MOOT UNDER OPTION 3: `runtime.opened` is deleted
 *      outright, so there is nothing left to go stale. Named here so a reviewer
 *      knows it was considered and why it disappears rather than getting a fix.
 *   6. `src/renderer/src/state/workspace-provider.tsx:187` —
 *      `deriveComposer(podId, runtime, pod?.status ?? 'idle')`. The fallback
 *      must become `?? 'closed'` — a Pod the state layer cannot find is not
 *      open — and the parameter must be typed `PodStatus` rather than the
 *      current bare `string`, which today removes ALL compiler help from the
 *      one ladder that matters most.
 *   7. `src/renderer/src/pods/PodsChrome.tsx:55-57` — routes `'beached'` to
 *      `reconnectPod` and everything else to `openPod`. `'closed'` correctly
 *      routes to `openPod`; no change, but a test pins it.
 *   8. `src/main/index.ts:133` — the comment stating that `'idle'` covers both
 *      open-and-quiet and closed. The CODE (list every KNOWN Pod, regardless of
 *      status) stays correct; the SENTENCE becomes false and must be rewritten
 *      to say that the distinction now exists and that `PodDirectoryProvider`
 *      deliberately ignores it.
 *   9. `src/shared/contracts/ipc.ts:189-193` — `PodStatusPush`. Shape
 *      unchanged. The `/** Present when status === 'beached'. */` comment on
 *      `exitCode` stays true and stays put.
 *
 * C. GENERIC OVER THE UNION — nothing to do. Listed so nobody "fixes" them.
 *   `src/main/pod-manager/pod-manager.ts:853-856` (`#setStatus`),
 *   `src/main/pod-manager/pushes.ts:20,27`,
 *   `src/shared/contracts/pod-runner.ts:186,247`,
 *   `src/shared/contracts/event-store.ts:23`,
 *   `src/main/store/rows.ts:86` (`row.status as PodStatus` — an UNCHECKED cast
 *   whose only gate is the CHECK constraint, which is why section 6 matters),
 *   `src/main/store/sqlite-event-store.ts:61,203-227` (`updatePod`'s patch
 *   whitelist and its dynamic UPDATE),
 *   `tests/unit/pod/helpers.ts:192,202`,
 *   `src/renderer/src/pods/test-fixtures.ts:10,23`.
 *
 * D. TESTS THAT ENUMERATE THE STATUS SET — each must be extended, and
 *    extending them is the POINT rather than an accommodation.
 *   `tests/unit/store/schema.test.ts:106,113` (the test NAME and the
 *   accepted-value loop; the rejected literal `'sunk'` stays rejected),
 *   `tests/unit/store/pods.test.ts:20,69-72,112-115` (a new Pod's status),
 *   `tests/unit/store/migration-2.test.ts:116-117,288,413` (see section 6(i)),
 *   `src/renderer/src/shell/WorkspaceLayout.test.tsx:182-186` (the
 *   distinct-token sweep),
 *   `src/renderer/src/state/store.test.ts:1091`,
 *   `tests/unit/ipc/pipeline.test.ts:349-369`.
 *
 * E. NO RUNTIME VALIDATOR EXISTS ANYWHERE. There is no zod, no schema guard,
 *    and no status validation in `src/main/ipc/**` or in the preload bridge.
 *    SQLite's CHECK constraint is the ONLY enforcement of the status set in the
 *    entire product. That is a pre-existing property, it is NOT this session's
 *    to change, and it is stated here because it is precisely why section 6 is
 *    not optional: get the CHECK wrong and nothing else catches it.
 *
 * F. NO SWITCH STATEMENTS. There is not one `switch (status)` in the
 *    repository; every exhaustive site is a `Record` or a `satisfies`/`Exclude`
 *    guard, and every non-exhaustive site is a ternary chain. Stated so nobody
 *    goes hunting for a default branch that does not exist.
 */
export type PodStatusBlastRadius = never;

// ---------------------------------------------------------------------------
// 6. The migration obligation  (NEW — created by the E1 amendment)
// ---------------------------------------------------------------------------

/**
 * THIS SECTION IS THE PRICE OF OPTION 3 AND IT IS NOT NEGOTIABLE. Widening
 * `POD_STATUSES` without doing all four things below silently rewrites a
 * migration that users have already applied.
 *
 * THE HAZARD, precisely. `src/main/store/schema.ts:147` reads
 *
 *     status TEXT NOT NULL CHECK (status IN ${sqlIn(POD_STATUSES)})
 *
 * inside the `MIGRATION_1` template literal, where `POD_STATUSES` is the LIVE
 * array. Add `'closed'` to it and migration 1's TEXT changes — for every future
 * fresh database, but not for any database that already applied the old text.
 * Fresh installs and upgraded installs would then be running structurally
 * different v1 schemas that both claim `schema_version = 1`. The file's own
 * docblock (`schema.ts:4-6`) forbids exactly this: "Migrations are forward-only
 * and are NEVER edited once shipped."
 *
 * THE REPOSITORY HAS ALREADY SOLVED THIS ONCE, for permission modes, and the
 * fix is to COPY that solution rather than invent one. `schema.ts:89-102` pins
 * `MIGRATION_1_PERMISSION_MODES = ['default', 'plan', 'bypassPermissions']`
 * with a docblock saying NEVER EDIT THIS ARRAY. `POD_STATUSES` was left
 * interpolated because nobody expected to widen it. Now we are.
 *
 * FOUR REQUIRED CHANGES, all in `src/main/store/schema.ts`:
 *
 * 6.1 PIN MIGRATION 1's POD-STATUS LIST.
 *     Add, immediately beside `MIGRATION_1_PERMISSION_MODES` and with a
 *     docblock in the same terms:
 *
 *         const MIGRATION_1_POD_STATUSES = ['idle', 'running', 'waiting', 'beached'] as const;
 *
 *     and change line 147 to `${sqlIn(MIGRATION_1_POD_STATUSES)}`. The array
 *     must hold those four values in that exact order, because that is the
 *     order the shipped blob rendered and byte-identity is what is being
 *     preserved. It carries NO `satisfies readonly PodStatus[]` clause: the
 *     whole point is that it must NOT track the union.
 *     `MIGRATION_1_PERMISSION_MODES` at `:102` is likewise bare, and that is
 *     deliberate rather than an oversight to helpfully correct.
 *
 * 6.2 MIGRATION 2 IS ALREADY SAFE AND MUST NOT BE TOUCHED.
 *     `schema.ts:243` already writes the pods status CHECK as a LITERAL:
 *     `CHECK (status IN ('idle', 'running', 'waiting', 'beached'))`, and its
 *     docblock at `:232` says why ("The `status` CHECK is written out literally
 *     for the same reason"). A previous session got this right. Do not
 *     "improve" it into a constant, and do NOT add `'closed'` to it.
 *
 * 6.3 MIGRATION 3 IS MANDATORY.
 *     Because 6.2 baked the four statuses into the v2 `pods` table, the SCHEMA
 *     HEAD rejects `'closed'` with `CHECK constraint failed` on every existing
 *     database. Migration 3 rebuilds `pods` with the five-value CHECK, using
 *     the identical 12-step procedure migration 2 used and for the identical
 *     reason — SQLite cannot ALTER a CHECK constraint:
 *
 *       CREATE TABLE pods_new (... the same ten columns ...,
 *         permission_mode TEXT NOT NULL CHECK (permission_mode IN ${sqlIn(MIGRATION_3_PERMISSION_MODES)}),
 *         status          TEXT NOT NULL CHECK (status IN ${sqlIn(MIGRATION_3_POD_STATUSES)}),
 *         ...) STRICT;
 *       INSERT INTO pods_new (...) SELECT ... FROM pods;
 *       DROP TABLE pods;
 *       ALTER TABLE pods_new RENAME TO pods;
 *
 *     BOTH lists are pinned constants local to migration 3, frozen once
 *     shipped, exactly as migration 2 pinned its own.
 *     `MIGRATION_3_POD_STATUSES` is
 *     `['closed', 'idle', 'running', 'waiting', 'beached']` and DOES carry
 *     `satisfies readonly PodStatus[]`, because it is the schema head and must
 *     stay exhaustive. `MIGRATION_3_PERMISSION_MODES` repeats migration 2's
 *     four modes verbatim; it does NOT reuse `MIGRATION_2_PERMISSION_MODES`,
 *     because that constant is frozen to migration 2 and sharing it would
 *     recreate exactly the coupling this section exists to break.
 *
 *     `MIGRATIONS` becomes `[1, 2, 3]`. `CURRENT_SCHEMA_VERSION` becomes 3 on
 *     its own, since it is computed from the list.
 *
 *     THE FOREIGN-KEY TRAP APPLIES AGAIN AND IS THE ONE WAY TO LOSE DATA HERE.
 *     `lanes.pod_id` and `events.pod_id` are `REFERENCES pods(id) ON DELETE
 *     CASCADE`. With `PRAGMA foreign_keys = ON` — which `SqliteEventStore`'s
 *     constructor sets — `DROP TABLE pods` cascades every lane and every event
 *     out of the database and the migration reports SUCCESS on an emptied
 *     store. `SqliteEventStore.migrate()` already suspends FK enforcement for
 *     the migration transaction and runs `PRAGMA foreign_key_check` before
 *     committing (migration 2's docblock, `schema.ts:216-224`), so migration 3
 *     inherits the protection — but a test must PROVE it for migration 3 rather
 *     than assume it, because "the runner already handles it" is exactly the
 *     assumption that loses a user's transcripts.
 *
 *     MIGRATION 3 DOES NOT BACKFILL ANY ROW. It widens the constraint and does
 *     nothing else; every existing row keeps its existing status. The
 *     `'idle'` -> `'closed'` transition is the BOOT SWEEP's job (section 2, step
 *     c), which runs moments later in the same startup. This division is
 *     deliberate: the sweep also orphans the lanes and writes the durable
 *     `system` event, and doing half the state change in silent SQL would
 *     produce rows that changed with no transcript record — a direct violation
 *     of rule 2 at the top of this file.
 *
 * 6.4 ADD THE SCHEMA-HEAD EXHAUSTIVENESS GUARD.
 *     `schema.ts:120-127` already carries `_UncoveredAtSchemaHead` for
 *     permission modes: a type resolving to `never` while the newest
 *     migration's CHECK still covers the whole contract union, which breaks the
 *     build when it stops. Add the exact analogue for pod status against
 *     `MIGRATION_3_POD_STATUSES`, so that a SIXTH status breaks the build there
 *     and demands migration 4, instead of failing at runtime as a CHECK
 *     violation on a user's machine.
 *
 *     NOTE AN EXISTING GUARD THAT IS WEAKER THAN IT LOOKS, and do not rely on
 *     it: `schema.ts:65-78` declares
 *     `_UncoveredPodStatus = Exclude<PodStatus, (typeof POD_STATUSES)[number]>`
 *     and initialises a `_UncoveredPodStatus[]` to `[]`. An empty array literal
 *     is assignable to ANY array type, so this guard does NOT fail when the
 *     union gains a member the array lacks. It reads like a tripwire and is not
 *     one. Keep it — `satisfies` still catches a bogus member — but do not cite
 *     it as protection. 6.4's `Exclude` plus the tests below are the real guard.
 *
 * WHAT PROVES AN ALREADY-MIGRATED DATABASE IS NOT REWRITTEN. Four tests. The
 * first one ALREADY EXISTS and is the most important of the four:
 *
 *  (i) `tests/unit/store/migration-2.test.ts` renders migration 1 from the
 *      SHIPPED git blob `96f6e925f75c9b101903116a0522c98971e0f347` — reading
 *      `POD_STATUSES` out of that blob's own text and evaluating that blob's own
 *      template — and asserts `migration(1)` is byte-identical to the result.
 *      With 6.1 done, the current module interpolates
 *      `MIGRATION_1_POD_STATUSES`, which renders the same four values in the
 *      same order, and THE TEST PASSES UNCHANGED. Without 6.1 it renders five
 *      and THE TEST FAILS. That test is therefore the tripwire for this entire
 *      section; it was written by a previous session for exactly this hazard;
 *      and it must be seen PASSING with the union widened, which is the
 *      evidence that the pinning worked.
 *
 *      THAT FILE IS EDITED ONLY AT ITS SCHEMA-HEAD ASSERTIONS: `:116-117`
 *      (`MIGRATIONS.map(m => m.version)` equals `[1, 2]`, and
 *      `CURRENT_SCHEMA_VERSION` is 2), `:288` (`MAX(version)` is 2) and `:413`
 *      (`COUNT(*)` on `schema_version` is 2). Those become `[1, 2, 3]` and 3.
 *      NOTHING ELSE IN THAT FILE MAY CHANGE — not the byte-identity assertion,
 *      not the three-permission-modes assertion, not `SHIPPED_MIGRATION_1_BLOB`,
 *      not `ENUM_NAMES`, not `shippedMigration1()`. An edit anywhere else in it
 *      means an enum was widened without being pinned, and that is a BLOCKING
 *      finding rather than a test to adjust.
 *
 * (ii) NO REWRITE ON AN APPLIED DATABASE. Following the pattern at
 *      `migration-2.test.ts:45-67` and its v1 fixture at `:152-163`: build a
 *      database at `schema_version = 2` with real rows in `pods`, `lanes` and
 *      `events`, run `migrate()`, and assert that ONLY version 3 was appended to
 *      `schema_version` (the rows for 1 and 2 keep their original `applied_at`
 *      values, proving they were not re-run), that every pod, lane and event row
 *      survives with byte-identical column values, that the lane and event
 *      COUNTS are unchanged (the FK-cascade trap), and that
 *      `PRAGMA foreign_key_check` returns empty.
 *
 * (iii) THE CHECK ACTUALLY WIDENED. After migration 3, an
 *      `UPDATE pods SET status = 'closed'` succeeds, and `status = 'sunk'` still
 *      fails with `CHECK constraint failed`. The NEGATIVE half is what proves
 *      the constraint was rebuilt rather than quietly dropped.
 *
 * (iv) FRESH AND UPGRADED CONVERGE. A database created from scratch
 *      (1 -> 2 -> 3) and a database upgraded from v2 produce the same
 *      `sqlite_master` text for `pods`. This is the assertion that catches a
 *      MIS-pinned migration: a wrong `MIGRATION_1_POD_STATUSES` makes the two
 *      diverge, and nothing else in the suite would notice.
 */
export type MigrationObligation = never;

// ---------------------------------------------------------------------------
// 7. The orphaned child: a failed start() must reap its own runner (UNCHANGED)
// ---------------------------------------------------------------------------

/**
 * TWO INDEPENDENT HALVES, IN TWO DIFFERENT TASKS. Either half alone narrows the
 * leak; both together close it. Neither task may assume the other landed.
 * NOTHING IN THIS SECTION IS CHANGED BY THE E1 AMENDMENT except the one status
 * note below.
 *
 * HALF A — the manager (T2, `pod-manager.ts:336-347`). The `catch` around
 * `session.runner.start(...)` deletes the session from the registry, marks the
 * Pod beached and rethrows — but never calls `session.runner.stop()`, unlike
 * `#dispose` (`:353-360`) which does. Required: `await session.runner.stop()`
 * inside that catch, before `#markBeached`, wrapped so a throwing `stop()`
 * cannot mask the original start failure — the error the caller receives must
 * still be the start error, with its `CWD_MISSING` / `SPAWN_FAILED` /
 * `RESUME_FAILED` classification intact.
 *
 * THE STATUS INTERACTION, which is new: the failed-start path ends at
 * `'beached'`, NOT at `'closed'`. A start that FAILED is a failure with a cause
 * and its affordance is `Reconnect`. `stop()`'s trailing `#setStatus('idle')` is
 * suppressed on this path by the runner's own beached latch
 * (`pod-runner.ts:424`), so no `'idle'` escapes; a test asserts the Pod reads
 * `'beached'` after a failed start, and neither `'idle'` nor `'closed'`.
 *
 * HALF B — the runner (T3, `pod-runner.ts:189-191` and `:379-381`). `start()`
 * sets `#phase = 'stopped'` before throwing; `stop()` early-returns when the
 * phase is ALREADY `'stopped'`, so `#abort.abort()` at `:381` is unreachable on
 * that path and the child keeps streaming with no owner and no reaper.
 *
 * WHICH THROW SITE ACTUALLY LEAKS, so the fix is aimed and not scattered:
 *   - `:162` (buildSdkOptions threw) — no session, no child. No leak.
 *   - `:171` (`#bridge` threw) — the query never constructed. No leak.
 *   - `:190` (`#ready.promise` rejected) — `#bridge` ALREADY RETURNED, the
 *     stream is being consumed, and a Claude Code child may well be alive.
 *     THIS is the leak.
 *
 * The fix must make the failed-start path abort the controller and close the
 * queue, and must leave `stop()` a no-throw idempotent no-op afterwards
 * (`pod-runner.ts` contract). HOW is the implementer's choice — a distinct
 * terminal phase, an explicit teardown before each throw, or making `stop()`
 * reachable — provided all four of these hold:
 *   1. after a `start()` that rejects at `:190`, the abort controller has been
 *      aborted and the input queue closed;
 *   2. `stop()` called afterwards resolves, throws nothing, and is idempotent
 *      across two calls;
 *   3. the rejection the caller sees is unchanged in type, code and message;
 *   4. `send`/`interrupt`/`setPermissionMode` after a failed start still throw
 *      `NOT_RUNNING`, as `#assertRunning` (`:414-419`) guarantees today.
 */
export type ReapObligation = never;

// ---------------------------------------------------------------------------
// 8. Session-id capture — ESCALATION E2 RESOLVED AS OPTION A
// ---------------------------------------------------------------------------

/**
 * E2 WAS RESOLVED AT GATE 2 AS OPTION A. This section is now BINDING. T3
 * implements all of it and keeps its full size; there is no longer an option B
 * or C to fall back to, and no criterion here is conditional on anything.
 *
 * WHAT THE REPO ACTUALLY SAYS, because the backlog entry misdescribes it and a
 * fix aimed at the wrong behaviour would be worse than none:
 *
 *   - Capture is FIRST-message-wins per runner, not last. `pod-runner.ts:107`
 *     `#sessionIdReported = false`, latched at `:233-236`.
 *   - `#createRunner` builds a fresh runner on every `#start`, so the latch
 *     resets on every Open and Reconnect. The stored value is therefore the
 *     FIRST id of the MOST RECENT run — which is why `c794f73b` became
 *     `2c98e7f0` when Open was pressed.
 *   - `stream.ts:64-65` accepts `session_id` off ANY message with no type
 *     filter: `system/init`, `system/hook_started`, `assistant`, `result`, or an
 *     unrecognised type. Whichever arrives first wins.
 *
 * THE UNGUARDED PATH, stated as a mechanism rather than as an observation:
 * nothing requires the first `session_id`-bearing message in the stream to be
 * one that names THIS query's session. A hook-emitted message carrying a
 * foreign id and arriving before `system/init` becomes the Pod's permanent
 * resume id, and `pods.reconnect` then resumes someone else's conversation.
 *
 * THE APPROVED RULE. Narrow capture to the two message types the repo has
 * MEASURED as authoritative, and take the LATEST such id in a run:
 *   - `system` with `subtype: 'init'` — what `probe/run-probe.ts:740` reads back
 *     to prove a resume worked;
 *   - `result` — what `probe/run-probe.ts:638-641` fed to `options.resume` in
 *     the one verified resume run.
 * A `session_id` on any other message type is IGNORED for capture. Latest-wins
 * among those two is safe because both name the same session in every captured
 * corpus, and it keeps a mid-run rotation from being missed.
 *
 * DIAGNOSTIC, required: when a captured id differs from the one already stored,
 * log at warn with both ids and the Pod id. The repo holds NO captured artifact
 * of a run with more than one `session_id` — the three-ids observation from
 * 2026-08-20 exists only as prose in the backlog, and the code is first-wins
 * where the backlog says last-wins — so the next real run must produce the
 * evidence. The log line names what happened and the identifiers needed to find
 * it again, and logs no secret.
 */
export type SessionIdCaptureRule = never;

// ---------------------------------------------------------------------------
// 9. What this contract does NOT change
// ---------------------------------------------------------------------------

/**
 * Stated so a reviewer can reject a diff that reaches past the cluster. The
 * first bullet is the one the E1 amendment rewrote; the rest are unchanged.
 *
 *  - `LaneStatus`, `LaneKind`, `EventType` — UNCHANGED unions. `LANE_STATUSES`,
 *    `LANE_KINDS`, `EVENT_TYPES` — UNCHANGED arrays, byte for byte.
 *    `PERMISSION_MODES` — UNCHANGED. `PodStatus` and `POD_STATUSES` are the
 *    ONLY widened pair, and section 6 is the whole of what that costs.
 *    `MIGRATION_1` and `MIGRATION_2` are untouched IN EFFECT: migration 1's
 *    RENDERED SQL stays byte-identical (its source gains a pinned constant),
 *    and migration 2's source is not edited at all. `MIGRATIONS` becomes
 *    `[1, 2, 3]` and `CURRENT_SCHEMA_VERSION` becomes 3.
 *  - `EventStore` — NO new method. The sweep uses `listPods`, `listLanes`,
 *    `setLaneStatus`, `updatePod` and `appendMany`, all of which exist. N+1 over
 *    Pods is accepted: Pod counts are single digits and the alternative is a
 *    contract change to `event-store.ts` for no measured gain. `STORE_METHODS`
 *    in `schema.test.ts` is unchanged.
 *  - `INVOKE_CHANNELS` (21) and `EVENT_CHANNELS` (6) — unchanged names, values
 *    and counts. This session adds NO channel. The completeness sweeps in
 *    `failure-paths.e2e.test.tsx` and `store.test.ts` keep passing on count.
 *  - `PodStatusPush` — unchanged shape. No `opened` field, here or anywhere.
 *  - `OrcastrateApi['pods']` — unchanged signatures. Every method that returns
 *    `Pod` still returns `Pod`. There is NO `PodView`.
 *  - `ComposerState['disabledReason']` — unchanged union. No `'closed'` member.
 *  - `PodTabVm` — the `opened` FIELD survives as a derived boolean; what dies is
 *    the renderer's STORED `runtime.opened`. See `renderer-lifecycle.ts`.
 *  - `PodRunner`'s status behaviour — unchanged. It never emits `'closed'`.
 *  - `src/renderer/src/shell/**` except `contract-runtime.ts` and
 *    `WorkspaceLayout.test.tsx`; `src/renderer/src/styles/**` except
 *    `tokens.css`; `src/main/lane/**`; `src/main/{beachcomber,helm}/**`;
 *    `src/renderer/src/{beachcomber,helm,permissions}/**`; `App.tsx`;
 *    `src/renderer/src/state/panel-*` — all frozen and unowned.
 *  - Transcript filtering, Pod deletion affordances, pinning and the pane model
 *    — all sub-session B. Out of scope here.
 *  - `tests/unit/store/errors.test.ts` is known order-dependent and fails under
 *    `--sequence.shuffle`. Pre-existing; not this session's to fix and not a
 *    regression anyone here caused.
 */
export type NonGoals = never;

/** Re-exported so a consumer of this contract need not re-import them. */
export type { Lane, LaneId, Pod, PodId, PodStatus, Timestamp };
