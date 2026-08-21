/**
 * CONTRACT — Permissions move to the plumbing set, and the counted label gets
 * its plural right. Frozen at Gate 2.
 *
 * Item 4, first half.
 *
 * This is an AMENDMENT to the frozen `contracts/transcript-filter.ts` of
 * session 2026-08-20-orcastrate-workspace-refinement. It restates ONLY what
 * changes. EVERYTHING ELSE IN THAT FILE SURVIVES CHARACTER FOR CHARACTER,
 * including its two inline amendments — the `startup_reconciliation` exemption
 * and the both-carriers rule — and including every guarantee on
 * `filterTranscriptEvents`: pure, total, order-preserving, subsequence, never
 * mutates `view.events`, never touches `highWaterSeq` or `unreadEventCount`.
 *
 * Boundary between:
 *   - T2 (PRODUCER) `src/renderer/src/transcript/**`.
 *   - T4 (CONSUMER) `src/renderer/src/__tests__/**`.
 */

import type { EventType } from '@shared/contracts/events';

// ---------------------------------------------------------------------------
// 1. The move
// ---------------------------------------------------------------------------

/**
 * `'permission_request'` and `'permission_decision'` LEAVE
 * `CONVERSATION_EVENT_TYPES` and JOIN `PLUMBING_EVENT_TYPES`. The conversation
 * set goes from six members to four; the plumbing set goes from four to six.
 * `DIAGNOSTIC_EVENT_TYPES` is untouched.
 *
 * After the move:
 *   CONVERSATION = user_message, assistant_text, tool_use, tool_result
 *   DIAGNOSTIC   = error, malformed
 *   PLUMBING     = thinking, system, lane_opened, lane_closed,
 *                  permission_request, permission_decision
 *
 * THE USER'S REASON: a permission raises a real confirmation prompt — the
 * permission card, rendered in the pane's own `permissionSlot`, which the user
 * must answer before the turn continues. The transcript row beside it is a
 * second copy of something they have already been made to look at.
 *
 * THEY MOVE, THEY ARE NOT DROPPED. Spec 5.2 requires every member of the
 * frozen `EventType` union to stay RENDERABLE, and moving them keeps that
 * true: both types still render through `TranscriptEventItem`'s existing
 * `permission_request` / `permission_decision` cases, and the toggle still
 * reveals them at their original `seq` position, interleaved. NOTHING IS
 * DELETED FROM `TranscriptEventItem`.
 *
 * THE PERMISSION CARD IS UNAFFECTED. `TranscriptPaneProps.permissionSlot`,
 * `PermissionCardVm`, `pendingPermissions` and `permission:respond` are all
 * untouched. Hiding the transcript ROW does not hide the PROMPT, and a task
 * that makes a pending permission harder to answer has broken this.
 */

// ---------------------------------------------------------------------------
// 2. The spelling. DO NOT REGRESS IT.
// ---------------------------------------------------------------------------

/**
 * THIS IS THE PART LAST SESSION PAID FOR AND THIS SESSION MUST NOT REFUND.
 *
 * The 2026-08-20 contract annotated each set `readonly EventType[]` at the
 * literal. That annotation WIDENS `(typeof X)[number]` to `EventType`, the
 * `Exclude` collapses to `never`, and the exhaustiveness guard becomes
 * vacuous. T3's reviewer proved it with two compiler probes: the contract's
 * spelling with a thirteenth uncovered union member exits `tsc --noEmit
 * --strict` at 0 WITH NO ERROR AT ALL; the shipped spelling raises
 * `TS2344: Type '"thirteenth_event_type"' does not satisfy the constraint
 * 'never'`.
 *
 * THE SHIPPED FORM IS THE CONTRACTED FORM. `src/renderer/src/transcript/
 * transcript-filter.ts` binds each literal tuple to a module-private const
 * with `as const satisfies readonly EventType[]` and exports a name carrying
 * the declared type. That structure — private tuple, `as const satisfies`,
 * exported alias, `_AssertNever<T extends never>` over `Exclude`, plus the
 * disjointness guard over `Extract` — is FROZEN. Moving two literals from one
 * tuple to another is the ONLY edit permitted in that region.
 *
 * NOT PERMITTED, and each is a way this has already gone wrong once:
 *   - re-annotating a private tuple as `readonly EventType[]`;
 *   - replacing `_AssertNever<T extends never>` with `const x: T[] = []`, the
 *     spelling at `src/main/store/schema.ts:209-210` that was proved by
 *     experiment not to fire;
 *   - deriving the plumbing set from the conversation set, or from
 *     `EventType`, by subtraction — a derived set makes the partition guard
 *     true by construction and it stops being a check;
 *   - loosening the disjointness guard. Probe C last session put `tool_use` in
 *     two sets while leaving the union fully covered: the cover guard stayed
 *     SILENT and only the disjointness guard fired. Cover alone is not a
 *     partition.
 *
 * BECAUSE THE TUPLE CONTENTS CHANGE, THE GUARD MUST BE RE-PROVED, not assumed
 * to have survived. The proof is a throwaway probe in the implementer's own
 * scratch directory — a copy of the guard region over a local
 * `EventType | 'thirteenth_event_type'` — run through `tsc --noEmit --strict`,
 * with the exact diagnostic quoted in the task report. A guard nobody watched
 * fire is the defect class this session inherited three times.
 */
export type _PartitionSpellingIsFrozen = EventType;

// ---------------------------------------------------------------------------
// 3. The counted label, and the plural defect
// ---------------------------------------------------------------------------

/**
 * `filterToggleLabel` today (`TranscriptFilterToggle.tsx:19-24`):
 *
 *     'everything'   -> 'Hide system events' | `Hide ${n} system events`
 *     'conversation' -> 'Show system events' | `Show ${n} hidden system events`
 *
 * At `n === 1` that renders "Show 1 hidden system events" and
 * "Hide 1 system events". `LaneRail.tsx:31-33` is the local precedent that
 * gets the same construction right:
 *
 *     `${action} ${count} finished ${count === 1 ? 'lane' : 'lanes'}`
 *
 * REQUIRED AFTER THE FIX — these six strings, character for character:
 *
 *     mode            n     label
 *     conversation    0     Show system events
 *     conversation    1     Show 1 hidden system event
 *     conversation    n>1   Show <n> hidden system events
 *     everything      0     Hide system events
 *     everything      1     Hide 1 system event
 *     everything      n>1   Hide <n> system events
 *
 * THE SAME DEFECT EXISTS A SECOND TIME and is fixed in the same pass:
 * `TranscriptPane.tsx:238`'s filtered-empty copy embeds the identical counted
 * phrase — "Show ${hiddenCount} hidden system events to read them." — and must
 * become singular at one. A fix applied to one of the two and not the other is
 * the drift this note exists to prevent.
 *
 * THE NOUN STAYS "system events". It is now slightly wider than the `system`
 * EventType — the hidden set holds thinking, lane bookkeeping and now
 * permissions — but it is the user-facing name for the whole plumbing
 * category and every other string on the page already uses it. Renaming the
 * category is a copy decision with no evidence behind it and is not in scope.
 *
 * `wording.e2e.test.tsx:344-347` pins these strings verbatim
 * (`FILTER_SHOW_TWO`, `FILTER_HIDE_TWO`, `FILTER_SHOW_NONE`) and T4 updates
 * them. It must ALSO gain the n === 1 cases, which are the ones that are
 * wrong today and which no test currently covers in that file — its existing
 * constants are all n === 2 or n === 0 and would pass unchanged through the
 * defect.
 */
export declare function filterToggleLabel(
  mode: 'conversation' | 'everything',
  hiddenCount: number,
): string;

// ---------------------------------------------------------------------------
// 4. What the move breaks, named so nobody is surprised
// ---------------------------------------------------------------------------

/**
 * THESE TESTS ENCODE THE SUPERSEDED DECISION AND ARE REWRITTEN, NOT EXTENDED.
 * An assertion that permissions are conversation events is not a regression
 * when it fails — it is the previous decision, and it goes.
 *
 *   - `src/renderer/src/transcript/transcript-filter.test.ts` — the membership
 *     assertions, and the 6/2/4 arity assertions, become 4/2/6.
 *   - `src/renderer/src/transcript/TranscriptPane.filter.test.tsx` — any
 *     fixture whose expected rendered-seq list includes a permission event in
 *     'conversation' mode.
 *   - `src/renderer/src/transcript/test-fixtures.ts` — the 53-`system`
 *     first-run fixture's asserted proportions, if a permission event is in
 *     it.
 *   - `src/renderer/src/__tests__/permissions.e2e.test.tsx` — anything
 *     asserting a permission ROW in the default view. The permission CARD is
 *     unaffected and its assertions must stay, and must stay green.
 *
 * THE HIDDEN EVENT STILL COUNTS AS UNREAD. `unreadEventCount` and
 * `highWaterSeq` report what ARRIVED, not what is on screen. A permission that
 * is now hidden by default still raises the lane's badge and still raises
 * `awaitingPermission`, or a user would clear a badge by toggling a filter.
 * This is unchanged and must be asserted to be unchanged.
 */
