/**
 * CONTRACT — The pane model, the pin affordance, and the finished-lane
 * collapse. Frozen at Gate 2.
 *
 * This is an AMENDMENT to the frozen `renderer-state.ts` (session
 * 2026-08-19-orcastrate-workspace-ui) and to the frozen `renderer-view.ts` from
 * the same session. It restates ONLY what changes. Every member of those two
 * files not named here survives character for character, including
 * `WorkspaceLayoutProps`' `primary` / `split` slots, which are UNCHANGED — what
 * changes is which lane feeds `split`.
 *
 * Boundary between:
 *   - T1 (PRODUCER) `src/renderer/src/state/**`, both `src/renderer/src/
 *     contracts/*.ts` files, `src/renderer/src/App.tsx`, `src/renderer/src/
 *     shell/**`. T1 lands the state shape, the actions, the view models, the
 *     new props and ids, and the shell wiring that feeds them.
 *   - T2 (CONSUMER) `src/renderer/src/lanes/**` — the rail's pin icon and the
 *     finished-lane collapse.
 *   - T3 (CONSUMER) `src/renderer/src/transcript/**` — the follower pane's own
 *     unpin affordance.
 *   - T5 (CONSUMER) `src/renderer/src/__tests__/**` — asserts the guarantees
 *     stated here.
 *
 * ===========================================================================
 * WHY THE SHAPE IS A LIST AND NOT A BOOLEAN
 * ===========================================================================
 *
 * The behaviour adopted at Gate 1 is Matriarch-always-primary with one
 * follower pane steered from the rail. The obvious encoding of that behaviour
 * is `pinnedLaneId: LaneId | null` collapsing to `boolean`, and it is the one
 * move to avoid: a boolean cannot represent two Calves, so growing to N later
 * costs a SECOND contract amendment and a SECOND round of test rewrites.
 * See `resolved-unknowns.md` U1 for the survey. The list shape makes today's
 * policy two assertions rather than a different shape, and makes N a cap
 * change.
 */

import type { Lane, LaneId, LaneStatus, PodId } from '@shared/contracts/events';

// ---------------------------------------------------------------------------
// 1. `PodSessionView` — the two lane-selection fields, REPLACED
// ---------------------------------------------------------------------------

/**
 * REPLACES `PodSessionView.selectedLaneId` and `PodSessionView.pinnedLaneId`.
 * Both of those fields are DELETED. A consumer still reading either one is
 * reading a field that no longer exists, which is a compile error and is the
 * intended way to find every call site.
 *
 * `PodSessionView` otherwise keeps every other member unchanged: `podId`,
 * `lanes`, `transcripts`, `backfill`, `pendingPermissions`, `composer`.
 */
export interface PaneSelection {
  /**
   * The lane in the primary pane. NON-NULL once `lanes.value` is non-empty.
   *
   * TODAY'S POLICY, asserted rather than encoded: this is ALWAYS the Matriarch.
   * `primaryLaneId === matriarchOf(lanes).id` holds after every action and
   * after every `laneChanged` snapshot. Nothing in `WorkspaceActions` can move
   * another lane into it — there is no action that writes this field.
   *
   * `null` ONLY while the lane list is empty (before `lanes.list` answers, or
   * for a Pod that has never opened). A consumer renders "No lane selected" for
   * null exactly as it does today.
   */
  primaryLaneId: LaneId | null;

  /**
   * Lanes in follower panes, in DISPLAY ORDER, left to right after the primary.
   *
   * TODAY'S POLICY, asserted rather than encoded: `followerLaneIds.length <= 1`.
   * `WorkspaceLayoutProps.split` is fed `followerLaneIds[0] ?? null`, so an
   * empty array is the unsplit view and a one-element array is today's split.
   *
   * INVARIANT — UNIQUENESS. This is what replaces the deleted
   * `pinnedLaneId !== selectedLaneId` invariant, and it is one rule at any N:
   * no lane appears twice across the primary and the followers. Concretely:
   *   - `primaryLaneId` is never a member of `followerLaneIds`;
   *   - `followerLaneIds` contains no duplicates;
   *   - every member names a lane in `lanes.value`.
   * The state layer restores all three after every `laneChanged` snapshot, the
   * same place `repairSelection` restores them today.
   *
   * DELETED WITH THE OLD SHAPE: swap-on-pin. Selecting a lane that is already
   * in a follower pane no longer exchanges the two panes. See `showLane` below.
   */
  followerLaneIds: readonly LaneId[];

  /**
   * Index into `followerLaneIds` naming the pane a rail selection replaces.
   * `null` when `followerLaneIds` is empty.
   *
   * At today's cap of one follower this is always `0` when a follower exists,
   * and the focus rule degenerates to "clicking a Calf updates the Calf pane,
   * always" — which is the whole user-visible point of the change. It is
   * present now, rather than added later, because focus-based replacement is
   * the rule every surveyed tool ships (Claude Desktop, JetBrains) and adding
   * the field later would be a third amendment.
   */
  focusedFollowerIndex: number | null;
}

// ---------------------------------------------------------------------------
// 2. `WorkspaceActions` — the three lane actions, REPLACED
// ---------------------------------------------------------------------------

/**
 * REPLACES `selectLane`, `pinLane` and `unpinLane`. All three are DELETED.
 * `jumpToLane` survives with its signature unchanged and is REDEFINED to
 * delegate to `showLane` (see below).
 */
export interface PaneActions {
  /**
   * THE SINGLE LANE-SELECTION VERB. Puts `laneId` on screen and zeroes its
   * `unreadEventCount`.
   *
   * RESOLUTION ORDER, and a consumer may rely on all four branches:
   *
   *  1. `laneId` names no lane in `lanes.value` -> NO-OP. Legitimate in
   *     'inline' routing mode and for a dispatch whose lane was dropped by a
   *     snapshot. Same tolerance `selectLane` had.
   *  2. `laneId === primaryLaneId` -> the primary pane is already showing it.
   *     Clears its unread count and nothing else. Never opens a follower.
   *  3. `laneId` is already in `followerLaneIds` -> FOCUS, do not duplicate.
   *     `focusedFollowerIndex` moves to that lane's index; the array is
   *     unchanged. This is the uniqueness invariant doing its job, and it is
   *     the branch a naive implementation gets wrong by pushing a second copy.
   *  4. Otherwise -> REPLACE the focused follower. When `followerLaneIds` is
   *     empty, one is opened and `focusedFollowerIndex` becomes 0. When a
   *     follower exists, the lane at `focusedFollowerIndex` is REPLACED in
   *     place — the array's length does not change and no lane is appended,
   *     because the cap is one.
   *
   * WHAT THIS DELIBERATELY CANNOT DO: move a lane into the primary pane. There
   * is no action that writes `primaryLaneId`, which is what makes
   * "the Matriarch is never displaced" a property of the action surface rather
   * than a rule someone has to remember.
   */
  showLane(podId: PodId, laneId: LaneId): void;

  /**
   * Closes ONE follower pane and removes its lane from `followerLaneIds`.
   *
   * `laneId` names which pane. A `laneId` that is not currently a follower is a
   * NO-OP, not an error — a double-click on an unpin control must not throw and
   * must not close a different pane. After the removal `focusedFollowerIndex`
   * becomes `null` when the array is empty, and otherwise clamps into range.
   *
   * This replaces `unpinLane(podId)`, which took no lane and could only ever
   * mean "close the one pin". Taking the lane makes the affordance on the pane
   * itself (item 4) unambiguous at any N.
   */
  hideLane(podId: PodId, laneId: LaneId): void;

  /**
   * UNCHANGED SIGNATURE, REDEFINED BEHAVIOUR. The inline dispatch card's jump
   * target now delegates to `showLane` — so a jump opens or steers the follower
   * pane rather than replacing the Matriarch's transcript, which under the old
   * model is what `selectLane` did and is the behaviour the pane model exists
   * to remove. Still a no-op for an unknown lane.
   */
  jumpToLane(podId: PodId, laneId: LaneId): void;
}

// ---------------------------------------------------------------------------
// 3. `LaneRowVm` — `selected` and `pinned`, REPLACED
// ---------------------------------------------------------------------------

/**
 * REPLACES `LaneRowVm.selected` and `LaneRowVm.pinned`. Both are DELETED, for
 * the same find-every-call-site reason as the fields above. Every other member
 * of `LaneRowVm` is unchanged: `lane`, `isMatriarch`, `agentType`,
 * `description`, `status`, `elapsedMs`, `unreadEventCount`,
 * `awaitingPermission`. The ORDERING GUARANTEE is unchanged.
 */
export interface LaneRowPaneVm {
  /** `lane.id === primaryLaneId`. True for exactly one row, and today that row
   *  is always the Matriarch. */
  inPrimaryPane: boolean;

  /** `followerLaneIds.includes(lane.id)`. */
  inFollowerPane: boolean;

  /**
   * True when this row's lane is the one a rail click would REPLACE — i.e.
   * `followerLaneIds[focusedFollowerIndex] === lane.id`. False for every row at
   * today's cap unless this lane is the single follower. Present so the rail
   * can mark the pane it is about to overwrite; a consumer that ignores it is
   * still correct at length 1.
   */
  focusedFollower: boolean;

  /**
   * THE MATRIARCH HAS NO PIN CONTROL AT ALL, and this is the field that says so
   * rather than the rail re-deriving it from `isMatriarch`. False for the
   * Matriarch, because it is structurally undisplaceable and can never be a
   * follower; true for every Calf.
   *
   * In 'inline' routing mode this is FALSE for every row: selecting a Calf does
   * not filter the transcript there (frozen `LaneRailProps.routingMode` note),
   * so offering a pin would promise a pane that shows the same events.
   */
  canPin: boolean;
}

// ---------------------------------------------------------------------------
// 4. `LaneRailProps` — ADDITIONS (item 4, item 5)
// ---------------------------------------------------------------------------

/**
 * AMENDS the frozen `LaneRailProps`. `onPin` and `onUnpin` are DELETED and
 * replaced by the two below; `rows`, `onSelect`, `onSteer` and `routingMode`
 * survive unchanged, with `onSelect` now wired to `showLane`.
 *
 * BOTH NEW MEMBERS ARE OPTIONAL, AND THAT IS A COMPILE-TIME CONCESSION, NOT A
 * DESIGN — the identical concession `renderer-view.ts` made for `panelBar` and
 * `panel`, for the identical reason. T1 lands `App.tsx` and T2 lands
 * `LaneRail.tsx` CONCURRENTLY; a required prop would leave whichever landed
 * first red until the other landed, which makes a task unreviewable. What makes
 * an absent value a TEST FAILURE rather than a valid state is T2's acceptance
 * criteria, which require the rail to render both affordances, and T5's suite,
 * which drives them end to end.
 */
export interface LaneRailPaneProps {
  /**
   * Opens `laneId` in the follower pane, or focuses it if it is already there.
   * Wired to `showLane`. Offered ONLY on rows where `canPin` is true.
   */
  onShowInFollower?: (laneId: LaneId) => void;

  /** Closes `laneId`'s follower pane. Wired to `hideLane`. */
  onHideFollower?: (laneId: LaneId) => void;
}

// ---------------------------------------------------------------------------
// 5. `TranscriptPaneProps` — ADDITIONS (item 4)
// ---------------------------------------------------------------------------

/**
 * AMENDS the frozen `TranscriptPaneProps`. Every existing member survives
 * unchanged, `isSplit` included — it still means "this is a follower pane, it
 * renders without the composer".
 *
 * OPTIONAL FOR THE SAME CONCESSION AS ABOVE. T3 owns `transcript/**` and T1
 * owns `App.tsx`; they land concurrently. T3's acceptance criteria are what
 * make an absent control a failure.
 */
export interface TranscriptPaneUnpinProps {
  /**
   * Closes THIS pane. Wired to `hideLane(podId, lane.id)`.
   *
   * MUST BE RENDERED WHEN, AND ONLY WHEN, `isSplit` is true and this is
   * non-null. The primary pane never carries it: the Matriarch cannot be
   * closed, and a control that closes nothing is worse than no control.
   *
   * THIS IS THE AFFORDANCE ITEM 4 IS ABOUT. The rail may also carry an unpin
   * control — keeping it in both places is fine — but the pane is the one that
   * must not be missing it, because the pane is where a user looks to dismiss
   * what is in front of them.
   */
  onHide?: () => void;
}

// ---------------------------------------------------------------------------
// 6. Finished lanes: COLLAPSE IN THE RENDERER, never omit from the snapshot
// ---------------------------------------------------------------------------

/**
 * THE FORK, DECIDED. `LaneChangedPush` replaces the rail wholesale, so omitting
 * finished lanes from the snapshot would remove them EVERYWHERE — including
 * from history the user may still want to read, and including from
 * `TranscriptPaneProps.lanes`, which is the registry every dispatch card's
 * per-agent rows are built from. A dispatch card whose Calves had finished
 * would silently degrade to its count-only form.
 *
 * SO: nothing changes in main, nothing changes in `LaneChangedPush`, and
 * nothing changes in `PodSessionView.lanes`. The rail collapses finished lanes
 * into a disclosure it owns, and every collapsed lane stays selectable,
 * readable, and present in the registry.
 *
 * This is renderer-LOCAL view state, held in `LaneRail`. It does NOT go in the
 * workspace store, for the reason `panel-provider.tsx` states from the other
 * side: which rows a user has collapsed is client interaction state, not server
 * data.
 */
export const FINISHED_LANE_STATUSES: readonly LaneStatus[] = ['done', 'orphaned'];

/**
 * Partitions rail rows for the collapse. Pure, total, and order-preserving
 * within each half.
 *
 * RULES a consumer may rely on:
 *   - The Matriarch is NEVER finished for this purpose, whatever its status.
 *     It is index 0 of the rail forever (frozen ORDERING GUARANTEE) and
 *     collapsing it would hide the lane the composer talks to.
 *   - A lane currently in the primary or a follower pane is NEVER collapsed,
 *     whatever its status. Collapsing the row for a transcript that is on
 *     screen puts the rail and the panes in visible disagreement.
 *   - A lane with `awaitingPermission` or a non-zero `unreadEventCount` is
 *     NEVER collapsed. Both mean the lane has something the user has not seen.
 *   - Everything else whose `status` is in `FINISHED_LANE_STATUSES` collapses.
 *
 * The disclosure is LABELLED WITH THE COUNT and is always present when
 * `finished` is non-empty — an affordance that vanishes when it is doing the
 * most work is how a user loses a lane. Expanding it restores every row in
 * rail order, interleaved back into position rather than appended, so a lane
 * does not move when it finishes.
 */
export declare function partitionFinishedLanes(rows: readonly LaneRowLike[]): {
  active: LaneRowLike[];
  finished: LaneRowLike[];
};

/** The slice of `LaneRowVm` the partition reads. Not a new view model. */
export interface LaneRowLike {
  lane: Lane;
  isMatriarch: boolean;
  status: LaneStatus;
  unreadEventCount: number;
  awaitingPermission: boolean;
  inPrimaryPane: boolean;
  inFollowerPane: boolean;
}

// ---------------------------------------------------------------------------
// 7. Test ids — ADDITIONS to the frozen `TEST_IDS`
// ---------------------------------------------------------------------------

/**
 * ADDED to `TEST_IDS` in `src/renderer/src/contracts/renderer-view.ts`, by T1,
 * in one edit, so T2, T3, T4 and T5 never race for the same object.
 *
 * `TEST_IDS.laneRowPin` is KEPT and REDEFINED: it is now the pin/unpin ICON on
 * a Calf row, whose `aria-pressed` reflects `inFollowerPane` and whose
 * accessible name says which action it will perform. It is ABSENT on the
 * Matriarch row, where `canPin` is false — and "absent", not "disabled",
 * because there is no state in which the Matriarch becomes pinnable.
 */
export const PANE_TEST_IDS = {
  /** The follower pane's own unpin control. Rendered only when `isSplit`. */
  transcriptUnpin: 'transcript-unpin',
  /** The finished-lane disclosure in the rail. Carries the count. */
  laneRailFinishedToggle: 'lane-rail-finished-toggle',
  /** The container holding the collapsed rows. Absent while collapsed. */
  laneRailFinishedGroup: 'lane-rail-finished-group',
} as const;
