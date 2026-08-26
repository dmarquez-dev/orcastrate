/**
 * CONTRACT — the fourth `LaneStatus`, `'stopped'`. Frozen at Gate 2.
 *
 * Boundary between T1 (widens the union, pins migration 1's lane-status list,
 * ships migration 4 and the schema-head guard), T2 (the only writer of the new
 * value), and T6 (the only renderer of it). Three tasks in three trees turning
 * on one enum member is the reason this file exists.
 *
 * THE DEFECT THIS CLOSES, verified by inspection 2026-08-21 and restated here
 * so no implementer re-derives it:
 *
 *   `PodManager.closePod` writes `status: 'closed'` to the POD and pushes
 *   `podStatus`, and NEVER ends the Matriarch LANE. `lane.endedAt` stays null,
 *   `elapsedMsOf` (`state/workspace-provider.tsx`) falls back to `nowMs` for any
 *   lane with a null `endedAt`, and the rail row keeps reading Running with a
 *   duration ticking up on a Pod that has no process.
 *
 * WHY A NEW MEMBER RATHER THAN REUSING ONE. Both existing terminal members
 * assert something untrue of a deliberately stopped lane:
 *   - `'done'`     the lane finished ITS OWN work and returned a `tool_result`.
 *   - `'orphaned'` the lane was found open with no runner — at a turn boundary
 *                  (`lane-router.ts`) or at process start (the boot sweep).
 * A lane whose Pod the user stopped on purpose did neither. This is the gap the
 * user named as "there is no idle status to replace it with".
 */

import type { LaneId, LaneStatus, PodId } from '../../../../src/shared/contracts/events';

// ===========================================================================
// 1. The union
// ===========================================================================

/**
 * REPLACES `src/shared/contracts/events.ts:101`:
 *
 *     export type LaneStatus = 'running' | 'done' | 'orphaned' | 'stopped';
 *
 * `'stopped'` is APPENDED. Order in a union is documentation, not semantics,
 * but it is fixed here so two implementers cannot produce two orderings, and
 * appending keeps every existing citation of the union's text readable.
 *
 * THE NAME IS CONSTRAINED, not chosen freely. `__tests__/hygiene.test.ts`
 * parses both halves of the `statusToken` declare/implement pair with
 * `/'([a-z]+)'/g` — lowercase ASCII letters only, no hyphen, no camelCase, no
 * underscore. `'stopped'` satisfies it; `'pod-stopped'` and `'podStopped'`
 * would silently drop out of that comparison and defeat the guard.
 *
 * MEANING, in one sentence, to be pasted into the union's docblock:
 *   'stopped'  The Pod that owns this lane was stopped deliberately. Terminal,
 *              carries an `endedAt`, and — unlike `'orphaned'` — is not a
 *              recovery state and needs no explanation to the user.
 */
export type WidenedLaneStatus = 'running' | 'done' | 'orphaned' | 'stopped';

/**
 * TERMINALITY IS LOAD-BEARING AT THE DATABASE. Migration 1's `lanes` table
 * carries
 *
 *     CHECK ((status = 'running') = (ended_at IS NULL))
 *
 * so `'stopped'` MUST arrive with a non-null `ended_at` or the write fails as a
 * CHECK violation on a user's machine. `SqliteEventStore.setLaneStatus`
 * (`sqlite-event-store.ts:310-318`) already stamps `endedAt ?? now()` for any
 * status other than `'running'`, so it needs no change — but the rule is
 * written down here because migration 4 must carry this CHECK forward verbatim.
 */
export const STOPPED_IS_TERMINAL = true;

/**
 * WIDENS `LaneClosedPayload.status` at `events.ts:257-258`:
 *
 *     /** 'done' on tool_result; 'orphaned' at a turn boundary with no result;
 *      *  'stopped' when closePod stops the Pod. *\/
 *     status: Extract<LaneStatus, 'done' | 'orphaned' | 'stopped'>;
 *
 * `lane_closed` is a CONVERSATION event type (`transcript-filter.ts:51`), so
 * this row is visible in the default transcript with no filter change, and
 * `TranscriptEventItem.tsx:119` renders it through `LANE_STATUS_LABEL` with no
 * change either. That is deliberate: the transcript should say, in words, that
 * the Pod was stopped.
 *
 * `src/shared/contracts/event-store.ts:172` says "for a terminal status
 * ('done' | 'orphaned')". Update that prose in the same task; a stale
 * enumeration in a frozen contract is the fourth-most-common defect this
 * project has recorded.
 */
export type WidenedLaneClosedStatus = Extract<WidenedLaneStatus, 'done' | 'orphaned' | 'stopped'>;

// ===========================================================================
// 2. The schema obligations — T1, and NOT optional
// ===========================================================================

/**
 * `src/main/store/schema.ts:47` today reads
 *
 *     export const LANE_STATUSES = ['running','done','orphaned'] as const
 *       satisfies readonly LaneStatus[];
 *
 * and line 268 INTERPOLATES THAT LIVE CONSTANT into migration 1's `lanes`
 * CHECK constraint. This is the exact anti-pattern `MIGRATION_1_POD_STATUSES`
 * and `MIGRATION_1_PERMISSION_MODES` were pinned to fix, and its docblocks at
 * `schema.ts:106-151` state the consequence: widening the live array rewrites
 * migration 1's rendered DDL for every future FRESH database while every
 * already-migrated database keeps the old text — two structurally different v1
 * schemas both claiming `schema_version = 1`.
 *
 * Therefore, in one task and in this order:
 *
 *   a. PIN `MIGRATION_1_LANE_STATUSES = ['running','done','orphaned'] as const`,
 *      BARE — deliberately WITHOUT `satisfies readonly LaneStatus[]`, for the
 *      reason `MIGRATION_1_POD_STATUSES`' docblock gives: the whole point is
 *      that it must NOT track the contract union. Interpolate it at
 *      `schema.ts:268` in place of `LANE_STATUSES`.
 *   b. WIDEN the live `LANE_STATUSES` to four members.
 *   c. ADD `MIGRATION_4_LANE_STATUSES`, four members, WITH
 *      `satisfies readonly LaneStatus[]` — it is the schema head and must stay
 *      exhaustive.
 *   d. ADD migration 4 (section 3 below) and append it to `MIGRATIONS`.
 *   e. ADD the schema-head guard (section 4 below).
 *
 * `LANE_KINDS` and `EVENT_TYPES` are ALSO still interpolated into migration 1
 * and carry the identical latent bug. Pinning them is NOT in scope for this
 * session and must NOT be done opportunistically — it would rewrite migration
 * 1's rendered text for a second reason inside one diff and make the
 * byte-identity failure impossible to attribute. Report it; the backlog
 * already carries it.
 */
export const MIGRATION_1_LANE_STATUSES_PINNED = ['running', 'done', 'orphaned'] as const;

/** The schema head after migration 4. */
export const MIGRATION_4_LANE_STATUSES_PINNED = [
  'running',
  'done',
  'orphaned',
  'stopped',
] as const;

// ===========================================================================
// 3. Migration 4 — rebuilding `lanes`, which is HARDER than migrations 2 and 3
// ===========================================================================

/**
 * Migrations 2 and 3 rebuilt `pods`, and both docblocks say plainly that steps
 * 7 and 8 of SQLite's 12-step rebuild "reduce to nothing", because `pods`
 * carries no index and no trigger of its own. THAT IS NOT TRUE OF `lanes`, and
 * copying migration 3 without reading this section will silently drop four
 * indexes, one of them a correctness-bearing UNIQUE.
 *
 * WHAT `lanes` CARRIES THAT `pods` DID NOT:
 *
 *   1. FOUR INDEXES, all of which vanish with `DROP TABLE lanes` and must be
 *      recreated on the renamed table with IDENTICAL names and definitions:
 *        idx_lanes_pod        (pod_id, started_at)
 *        idx_lanes_tool_use   UNIQUE (pod_id, tool_use_id) WHERE tool_use_id IS NOT NULL
 *        idx_lanes_matriarch  UNIQUE (pod_id) WHERE kind = 'matriarch'
 *        idx_lanes_parent     (parent_lane_id) WHERE parent_lane_id IS NOT NULL
 *      `idx_lanes_tool_use` is not a performance index: migration 1's own
 *      comment says a second lane claiming one `tool_use_id` is a router bug
 *      that must surface as CONFLICT rather than as an ambiguous lookup.
 *      Losing it turns a loud failure into a silent one.
 *
 *   2. A SELF-REFERENCE. `parent_lane_id TEXT REFERENCES lanes(id) ON DELETE
 *      CASCADE`. Write the new table's clause as `REFERENCES lanes(id)` — the
 *      name the table will have AFTER the rename — not `lanes_new`. With
 *      `PRAGMA foreign_keys` OFF, which is the state `SqliteEventStore.migrate()`
 *      establishes, `ALTER TABLE ... RENAME TO` does NOT rewrite REFERENCES
 *      clauses; that is precisely the property migrations 2 and 3 rely on to
 *      keep `lanes.pod_id` and `events.pod_id` pointing at the rebuilt `pods`.
 *      The same property is what makes `REFERENCES lanes(id)` correct here and
 *      `REFERENCES lanes_new(id)` a permanently dangling reference.
 *
 *   3. AN INBOUND REFERENCE. `events.lane_id REFERENCES lanes(id) ON DELETE
 *      CASCADE`. With foreign keys ON, `DROP TABLE lanes` would cascade EVERY
 *      EVENT out of the database and the migration would report success on an
 *      emptied store. `SqliteEventStore.migrate()` already suspends FK
 *      enforcement for the migration transaction and runs
 *      `PRAGMA foreign_key_check` before committing, so migration 4 inherits
 *      that protection — but `tests/unit/store/migration-3.test.ts` PROVES it
 *      for migration 3 with row counts rather than inheriting the assumption,
 *      and migration 4 must do the same. "The runner already handles it" is
 *      exactly the assumption that loses a user's transcripts.
 *
 *   4. THE TERMINALITY CHECK. `CHECK ((status = 'running') = (ended_at IS NULL))`
 *      must be reproduced verbatim on the rebuilt table.
 *
 * IT BACKFILLS NOTHING. Migration 4 widens the constraint and changes no row's
 * status, exactly as migration 3 did. Every existing lane keeps the value it
 * had; the boot sweep still orphans what it orphans.
 *
 * NOT REVERSIBLE, consistent with the file docblock: there is no `down` path,
 * and a row already carrying `'stopped'` could not satisfy migration 1's
 * constraint anyway.
 */
export const MIGRATION_4_VERSION = 4;

/** Recreate all four, by these exact names, after the rename. */
export const MIGRATION_4_INDEXES_TO_RECREATE = [
  'idx_lanes_pod',
  'idx_lanes_tool_use',
  'idx_lanes_matriarch',
  'idx_lanes_parent',
] as const;

// ===========================================================================
// 4. The schema-head guard — the SPELLING IS THE CONTRACT
// ===========================================================================

/**
 * Use the `_AssertNever<T extends never>` spelling that `schema.ts:219-232`
 * already validates for `PodStatus`:
 *
 *     type _LaneStatusCoveredAtSchemaHead = _AssertNever<
 *       Exclude<LaneStatus, (typeof MIGRATION_4_LANE_STATUSES)[number]>
 *     >;
 *     const _laneStatusSchemaHead: _LaneStatusCoveredAtSchemaHead[] = [];
 *     void _laneStatusSchemaHead;
 *
 * DO NOT use the `_UncoveredAtSchemaHead` empty-array-literal spelling one enum
 * over. That form was PROVED BY EXPERIMENT never to fire: an empty array
 * literal is assignable to any array type, so the guard is vacuous and a fifth
 * `LaneStatus` would fail as a runtime `CHECK constraint failed` on a user's
 * machine instead of at build time. `schema.ts:221-232` documents this at
 * length and marks the difference "SPELLED DIFFERENTLY … ON PURPOSE".
 *
 * SQLite's CHECK is the only runtime enforcement of the lane-status set
 * anywhere in the product — `rows.ts:103` casts `row.status as LaneStatus`
 * unchecked — so this guard is the last line of defence before shipping.
 *
 * The pre-existing `_UncoveredLaneStatus` in the `_exhaustive` block
 * (`schema.ts:92-101`) is the same inert form. Leave it; it is not this
 * session's item, and the block's own CAUTION already says it must not be
 * cited as protection.
 */
export declare const LANE_STATUS_SCHEMA_HEAD_GUARD_SPELLING: '_AssertNever<T extends never>';

// ===========================================================================
// 5. `closePod` — the only writer of `'stopped'`
// ===========================================================================

/**
 * The amended verb. Current body (`pod-manager.ts:478-488`):
 *
 *     await this.#dispose(podId);
 *     const pod = this.#store.getPod(podId);
 *     if (pod !== null && pod.status !== 'beached') {
 *       this.#store.updatePod(podId, { status: 'closed' });
 *       this.#push.podStatus({ podId, status: 'closed' });
 *     }
 *
 * WHAT IS ADDED, inside the SAME `pod.status !== 'beached'` branch and AFTER
 * `#dispose` has returned:
 *
 *   1. Sweep `this.#store.listLanes(podId)` and, for every lane whose status is
 *      `'running'`, call `setLaneStatus(lane.id, 'stopped', at)` with ONE `at`
 *      stamp taken from a single `this.#now()` for the whole sweep — the same
 *      discipline `reconcileStartup` uses, so two lanes stopped by one gesture
 *      read as one gesture.
 *   2. Append ONE `lane_closed` event per swept lane, on that lane's own id,
 *      with `status: 'stopped'` and `createdAt: at`, in a single `appendMany`
 *      so the batch is all-or-nothing and the per-Pod `seq` run is contiguous.
 *      Synthetic, so no `raw`.
 *   3. Push `laneChanged` for the Pod after the sweep, so the rail reflects the
 *      new statuses without a refetch. `LaneChangedPush` replaces the rail
 *      wholesale, so ONE push after the whole sweep, never one per lane.
 *
 * ORDER RELATIVE TO `podStatus`. The lane sweep and its `laneChanged` push come
 * BEFORE the `podStatus` push. `podStatus` is what flips the tab out of its
 * running affordance; a renderer that saw the Pod closed while the rail still
 * said Running would show, for one frame, exactly the disagreement this item
 * exists to remove.
 *
 * THE BEACHED GUARD IS PRESERVED AND IS NOT WIDENED. A beached Pod's lanes are
 * NOT swept: `'beached'` records a CAUSE, the affordance is Reconnect rather
 * than Open, and rewriting its lanes as deliberately stopped would assert the
 * opposite of what happened. Those lanes are the boot sweep's to orphan. State
 * this in a comment at the guard rather than leaving a reader to infer it.
 *
 * `'stopped'` IS NEVER WRITTEN ANYWHERE ELSE. Not by `LaneRouter.closeLane`,
 * whose signature stays `'done' | 'orphaned'`; not by
 * `PodManager.#closeLaneRow`, whose signature stays `'done' | 'orphaned'`; not
 * by `reconcileStartup`, which keeps writing `'orphaned'` and whose fixed
 * `STARTUP_RECONCILIATION_REASON` sentence is NOT reworded by this session.
 * One writer is what makes the status mean one thing.
 */
export interface ClosePodLaneSweep {
  podId: PodId;
  /** ISO-8601. ONE stamp for the whole sweep. */
  at: string;
  /** Lanes flipped `running` -> `stopped`, in `listLanes` order. */
  stoppedLaneIds: readonly LaneId[];
}

/**
 * IDEMPOTENCE, which is the half the coverage gap is about.
 *
 * `PodManager.closePod` against an ALREADY-CLOSED Pod is exercised nowhere in
 * the repository. `relaunch.e2e.test.tsx` test 1 was the only site and was
 * correctly reshaped away when the stopped-Pod affordance changed; no
 * `src/main` test names `closePod`. That gap was promoted at
 * `2026-08-20-orcastrate-pod-lifecycle`'s Gate 3 and sits on this same verb, so
 * it closes here.
 *
 * The guarantee a second `closePod` must satisfy, and the sweep's filter on
 * `lane.status === 'running'` is what delivers it:
 *
 *   - No lane's `ended_at` is restamped. A duration that jumped forward when a
 *     user clicked Stop on an already-stopped Pod would be a lie about when the
 *     work ended.
 *   - No second `lane_closed` event is appended, for any lane.
 *   - The call does not throw, and the Pod's status is `'closed'` afterwards.
 *
 * Assert these against a REAL `PodManager` over a real `SqliteEventStore`, by
 * lane row state and event count, never by spying on a mock — a mock
 * configured to be called once proves only that it was configured.
 */
export interface ClosePodIdempotence {
  endedAtIsNotRestamped: true;
  noSecondLaneClosedEvent: true;
  doesNotThrow: true;
}

// ===========================================================================
// 6. Renderer obligations
// ===========================================================================

/**
 * `LANE_STATUS_LABEL` (`renderer/src/lanes/lane-status.ts`) is
 * `Readonly<Record<LaneStatus, string>>`, so widening the union BREAKS
 * `typecheck:web` at that file until the entry lands. That is the intended
 * tripwire and the reason T6 depends on T1.
 *
 *     stopped: 'Stopped',
 *
 * ONE WORD, and it is the whole accessibility story: colour is never the only
 * carrier of meaning, and this label is what a screen reader, a greyscale
 * display and a colour-blind user actually get.
 *
 * `FINISHED_LANE_STATUSES` (`lanes/finished-lanes.ts:15`) GAINS `'stopped'`.
 * A stopped lane is finished for the purpose of the rail's disclosure, and the
 * four never-collapse rules in `isCollapsibleFinishedLane` already protect the
 * Matriarch, the on-screen panes, and anything unread — so a stopped Matriarch
 * still shows, which is the case that matters.
 */
export const LANE_STATUS_LABEL_ADDITION = { stopped: 'Stopped' } as const;

/** Widened set for `lanes/finished-lanes.ts`. */
export const FINISHED_LANE_STATUSES_WIDENED: readonly LaneStatus[] = [
  'done',
  'orphaned',
  'stopped',
] as unknown as readonly LaneStatus[];
