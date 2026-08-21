/**
 * CONTRACT — The lane-rail pin control is removed, and the rule it carried
 * moves into `showLane`. Frozen at Gate 2.
 *
 * Item 4, second half.
 *
 * This is an AMENDMENT to the frozen `contracts/renderer-panes.ts` of session
 * 2026-08-20-orcastrate-workspace-refinement, which is one day old. It
 * restates ONLY what changes. `PaneSelection` is UNCHANGED — `primaryLaneId`,
 * `followerLaneIds`, `focusedFollowerIndex` and the UNIQUENESS INVARIANT all
 * survive exactly as written. `hideLane` is UNCHANGED. `jumpToLane` is
 * UNCHANGED. `TranscriptPaneUnpinProps.onHide` is UNCHANGED and the follower
 * pane keeps its own `transcript-unpin` control — closing a pane is NOT
 * affected by any of this.
 *
 * Boundary between:
 *   - T3 (PRODUCER) `src/renderer/src/lanes/**`, `src/renderer/src/state/**`,
 *     `src/renderer/src/contracts/renderer-view.ts`,
 *     `src/renderer/src/contracts/renderer-state.ts`,
 *     `src/renderer/src/shell/**`, `src/renderer/src/App.tsx`.
 *   - T2 (AFFECTED) `src/renderer/src/transcript/**` — only because
 *     `test-ids.test.tsx` names `TEST_IDS.laneRowPin` today.
 *   - T4 (CONSUMER) `src/renderer/src/__tests__/**`.
 *
 * ===========================================================================
 * WHY
 * ===========================================================================
 *
 * The user's reason: under the pane model, clicking a rail row ALREADY shows
 * that lane in the follower pane. `LaneRailProps.onSelect` is wired to
 * `showLane`, whose branch 4 opens or replaces the follower. The pin button
 * calls `showLane` too. Two controls, one gesture apart, doing the same thing
 * — and the pin's second job, closing the pane, is already offered by the
 * pane's own `transcript-unpin`, in the place a user actually looks to dismiss
 * what is in front of them.
 */

import type { LaneId, PodId } from '@shared/contracts/events';

// ---------------------------------------------------------------------------
// 1. What is DELETED
// ---------------------------------------------------------------------------

/**
 * DELETED, all four. Deletion rather than deprecation, for the reason the
 * previous amendment gave when it deleted `selected` and `pinned`: a consumer
 * still reading a field that no longer exists is a COMPILE ERROR, and that is
 * the intended way to find every call site. An unused symbol kept "just in
 * case" is a stale rationale, and a stale rationale is what a later reader
 * treats as the current decision.
 *
 * 1. THE PIN BUTTON. `LaneRow.tsx:147-165` — the whole `row.canPin ? <button
 *    …> : null` block, its `PinGlyph`, and the `pinAction` class in
 *    `LaneRail.module.css`.
 *
 * 2. `TEST_IDS.laneRowPin`, from `src/renderer/src/contracts/renderer-view.ts`,
 *    together with its docblock. Known referrers, all of which go:
 *      - `src/renderer/src/lanes/LaneRow.tsx:152`
 *      - `src/renderer/src/lanes/LaneRail.test.tsx` (the pin suite)
 *      - `src/renderer/src/transcript/test-ids.test.tsx:55-66`  [T2's file]
 *      - `src/renderer/src/__tests__/panes.e2e.test.tsx:209,223,230,424,473`
 *      - `src/renderer/src/__tests__/permissions.e2e.test.tsx:95`
 *    After the deletion, a repo-wide grep for `laneRowPin` and for
 *    `'lane-row-pin'` returns nothing outside this contract file.
 *
 * 3. `LaneRowVm.canPin` (`contracts/renderer-state.ts:312`) and its derivation
 *    in `state/workspace-provider.tsx:265`. SEE SECTION 2 FIRST — the FACT it
 *    encoded does not go, only the field.
 *
 * 4. `LaneRailProps.onShowInFollower` and `LaneRailProps.onHideFollower`
 *    (`contracts/renderer-view.ts:214-233`), and the two lambdas that feed
 *    them in `App.tsx:134-145`. The pin button was their only caller. Both
 *    were declared OPTIONAL as a landing concession, so removing them cannot
 *    leave a required prop unfilled. `onSelect` and `onSteer` are UNCHANGED.
 *    `src/renderer/src/shell/App.smoke.test.tsx:149-174,231-245` asserts both
 *    are passed and is rewritten to assert the opposite: the rail is given
 *    NEITHER.
 */

// ---------------------------------------------------------------------------
// 2. THE RULE `canPin` CARRIED, AND WHERE IT GOES
// ---------------------------------------------------------------------------

/**
 * READ THIS BEFORE DELETING `canPin`. Deleting the field without moving the
 * rule is a silent behaviour regression, and it is the one this item is most
 * likely to ship.
 *
 * `canPin` was false in two cases and each was load-bearing:
 *
 *   (a) THE MATRIARCH. Structurally undisplaceable, can never be a follower.
 *       ALREADY SAFE WITHOUT THE FIELD: `showLane` branch 2 says
 *       `laneId === primaryLaneId` clears the unread count and does nothing
 *       else, and never opens a follower. The rule is already a property of
 *       the action surface. Nothing to move.
 *
 *   (b) 'inline' ROUTING MODE. `canPin` was FALSE FOR EVERY ROW there, because
 *       in inline mode every event carries the Matriarch's laneId, so a
 *       follower pane opened on a Calf would show BYTE-IDENTICAL contents to
 *       the primary. The pin was suppressed so the rail would not promise a
 *       pane that shows the same events.
 *
 *       NOTHING ELSE ENFORCES (b). Delete `canPin` and leave `showLane` alone,
 *       and a rail click in inline mode now opens a duplicate pane where
 *       yesterday nothing happened. That is a regression introduced by a
 *       removal, which is the hardest kind to notice.
 *
 * SO THE RULE MOVES INTO THE ACTION, and this is the ONE behavioural change in
 * this contract.
 */

/**
 * `showLane` — AMENDED. Its signature is unchanged. Its resolution order gains
 * a step 0 and is otherwise verbatim from `renderer-panes.ts` section 2.
 *
 *  0. `WorkspaceStore.routingMode === 'inline'` -> CLEAR `laneId`'s unread
 *     count, and NOTHING ELSE. Never opens a follower, never focuses one,
 *     never mutates `followerLaneIds` or `focusedFollowerIndex`. Selecting a
 *     Calf in inline mode does not filter the transcript, so a second pane
 *     would show the same events twice under two different lane titles.
 *  1. `laneId` names no lane in `lanes.value` -> NO-OP.
 *  2. `laneId === primaryLaneId` -> clear its unread count, nothing else.
 *  3. `laneId` is already in `followerLaneIds` -> FOCUS, do not duplicate.
 *  4. Otherwise -> REPLACE the focused follower, opening one if there is none.
 *
 * `routingMode` is ALREADY on the store — `App.tsx:43` destructures it from
 * `useWorkspace()` and passes it to the rail and both panes. It is NEVER
 * hardcoded and never re-derived.
 *
 * `routingMode === null` (unresolved, before `app.routingMode()` answers)
 * takes NO special branch: the shell does not render the rail at all until it
 * resolves (`EmptyWorkspace.tsx:32-34`), so there is no click to handle.
 *
 * WHY IN THE ACTION AND NOT IN A REPLACEMENT PROP. Putting it back on the view
 * model as `canOpenInFollower` would leave it a rule the rail must REMEMBER to
 * consult, checkable only by inspecting the rail. In `showLane` it is a
 * property of the action surface — the same argument `renderer-panes.ts`
 * already makes for why nothing can write `primaryLaneId`. It is also the only
 * placement that holds for `jumpToLane`, which delegates to `showLane` and
 * would otherwise still open a duplicate pane from a dispatch card in inline
 * mode.
 */
export interface ShowLaneAmended {
  showLane(podId: PodId, laneId: LaneId): void;
}

// ---------------------------------------------------------------------------
// 3. What SURVIVES
// ---------------------------------------------------------------------------

/**
 * `LaneRowPaneVm.inPrimaryPane`, `inFollowerPane` and `focusedFollower` all
 * SURVIVE. They are how the rail marks which lanes are on screen and which
 * pane a click would overwrite, and none of them was the pin.
 *
 * The rail row must STILL show that a lane is in the follower pane, and must
 * still show it through a channel a screen reader reaches. `aria-pressed` on
 * the deleted button was one such channel and it goes with the button, so the
 * row's own marking is what remains. It must not degrade to a `data-`
 * attribute alone — advisory A4 of last session's T2 review already flagged
 * `focusedFollower` as reaching assistive technology through no channel at
 * all, and deleting the pin makes that the only marking left.
 *
 * `partitionFinishedLanes`, `FINISHED_LANE_STATUSES`, the finished-lane
 * disclosure, `laneRailFinishedToggle` and `laneRailFinishedGroup` are all
 * UNTOUCHED. `TEST_IDS.laneRowSteer` and `onSteer` are UNTOUCHED.
 * `PANE_TEST_IDS.transcriptUnpin` is UNTOUCHED and the follower pane keeps its
 * own close control — that is the affordance the user's reasoning relies on,
 * so a task that removes the pin AND weakens the pane's unpin has removed the
 * only way to close a follower pane.
 */
