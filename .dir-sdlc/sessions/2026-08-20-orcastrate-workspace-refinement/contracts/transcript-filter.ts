/**
 * CONTRACT — The transcript noise filter. Frozen at Gate 2.
 *
 * Item 2 of the session scope.
 *
 * Boundary between:
 *   - T3 (PRODUCER) `src/renderer/src/transcript/**`.
 *   - T1 declares the added `TEST_IDS` in `renderer-view.ts`, in one edit, so
 *     no two tasks race for that object.
 *   - T5 (CONSUMER) `src/renderer/src/__tests__/**`.
 *
 * NOTHING ELSE IS INVOLVED. No main change, no IPC change, no state-layer
 * change, no `TranscriptPaneProps` change. The filter is a RENDER FILTER and
 * component-local view state, held in `TranscriptPane`, for the reason
 * `panel-provider.tsx` gives from the other side: which rows a user has chosen
 * to see is client interaction state, not server data.
 *
 * ===========================================================================
 * WHAT THIS IS NOT, AND THE RULES THAT FOLLOW
 * ===========================================================================
 *
 * NOT ROUTING. `lane-router.ts` is untouched; every event still reaches the
 * lane it reaches today.
 *
 * NOT STORAGE. `sqlite-event-store.ts` is untouched; every event is still
 * persisted, still backfilled, and still counted by `highWaterSeq` and by
 * `unreadEventCount`. A hidden event STILL COUNTS AS UNREAD — the badge
 * reports what arrived, not what is currently rendered, or a user would clear a
 * badge by toggling a filter.
 *
 * NOT A DROP. Spec 5.2 requires every member of the frozen `EventType` union to
 * remain renderable, `malformed` included. Hiding must be reversible in the UI
 * and must never be silent. Concretely, and all four are asserted:
 *   - The toggle is ALWAYS PRESENT, in both panes, whether or not anything is
 *     currently hidden. An affordance that appears only when it has work to do
 *     is one a user never learns exists.
 *   - The toggle NAMES THE COUNT of events it is hiding right now. "Hidden" as
 *     a bare label leaves the user unable to tell an empty lane from a filtered
 *     one.
 *   - Expanding restores every hidden event AT ITS ORIGINAL POSITION in `seq`
 *     order, interleaved, never appended in a block at the end.
 *   - `view.events` is never mutated, sliced, or re-sorted. The filter decides
 *     what is rendered from it and nothing else, which is what keeps the frozen
 *     ORDERING AND DEDUPE GUARANTEE (`renderer-state.ts`) intact.
 *
 * ===========================================================================
 * THE EVIDENCE THIS IS SIZED AGAINST
 * ===========================================================================
 *
 * The 2026-08-20 first run stored 109 events in one Pod. 53 were `system` —
 * `hook_started` 10, `hook_progress` 8, `task_progress` 8, `hook_response` 6,
 * `thinking_tokens` 5, `init` 4, `result` 4, `rate_limit_event` 2 — against 11
 * `assistant_text`. A first-run Pod fills its Matriarch lane with hook plumbing
 * before the model says anything.
 */

import type { EventType, NormalizedEvent } from './events';

// ---------------------------------------------------------------------------
// 1. The three sets. Exhaustive over `EventType` by construction.
// ---------------------------------------------------------------------------

/**
 * The conversation. Visible in both filter states.
 *
 * This is the backlog's list: "assistant text, user messages, tool use and
 * results, permissions". `tool_use` is here rather than in the plumbing set
 * because it is where the inline dispatch card renders (spec 5.2) — filtering
 * it would strip the causality the card exists to preserve.
 */
export const CONVERSATION_EVENT_TYPES: readonly EventType[] = [
  'user_message',
  'assistant_text',
  'tool_use',
  'tool_result',
  'permission_request',
  'permission_decision',
];

/**
 * DIAGNOSTICS. Visible in both filter states, and NOT MEMBERS OF THE PLUMBING
 * SET — this is the one place this contract departs from the backlog's phrasing
 * and it is deliberate.
 *
 * The backlog says default to the conversation and put "the rest" behind the
 * toggle. Taken literally that hides `error` and `malformed` by default. A
 * diagnostic the user cannot see without first knowing to go looking for it is
 * a silent drop in every way that matters to the person using the app, whatever
 * the code does. Spec 5.2's requirement that `malformed` stay renderable is
 * about exactly this. There are two of these types and the measured noise
 * problem is `system`; excluding them costs nothing and removes the only way
 * this feature could hide a real failure.
 */
export const DIAGNOSTIC_EVENT_TYPES: readonly EventType[] = ['error', 'malformed'];

/**
 * PLUMBING. Hidden by default, revealed by the toggle.
 *
 * `system` is the measured problem — 53 of 109 events. `thinking` is model
 * internals rather than what the model said. `lane_opened` and `lane_closed`
 * are lane bookkeeping the rail already reports, with the lane's status, in a
 * place the user is already looking; a Calf's `lane_opened` is stamped with the
 * Calf's own laneId (`renderer-view.ts`, the `lanes` amendment) so hiding it
 * removes nothing from the Matriarch's narrative.
 *
 * EXHAUSTIVENESS IS A COMPILE-TIME PROPERTY, NOT A COUNT. The three arrays
 * above partition `EventType`: every member appears in exactly one. T3 asserts
 * this with a generic-constraint never-guard — `_AssertNever<T extends never>`,
 * the spelling `src/main/store/schema.ts` PROVED BY EXPERIMENT does fire — and
 * NOT with the empty-array-literal form, which an empty array literal satisfies
 * for any array type and which therefore never fires. A thirteenth `EventType`
 * must break `typecheck:web` here.
 */
export const PLUMBING_EVENT_TYPES: readonly EventType[] = [
  'thinking',
  'system',
  'lane_opened',
  'lane_closed',
];

// ---------------------------------------------------------------------------
// 2. The filter
// ---------------------------------------------------------------------------

/**
 * Which events a pane is currently rendering.
 *
 *   'conversation' — the default. Renders `CONVERSATION_EVENT_TYPES` and
 *                    `DIAGNOSTIC_EVENT_TYPES`.
 *   'everything'   — renders all twelve types. Identical to today's behaviour,
 *                    so the toggle's "on" state is a provable no-op against the
 *                    current code, which is what makes a test of it meaningful.
 */
export type TranscriptFilterMode = 'conversation' | 'everything';

export const DEFAULT_TRANSCRIPT_FILTER: TranscriptFilterMode = 'conversation';

/**
 * PURE, TOTAL, ORDER-PRESERVING. Returns a new array; never mutates `events`.
 *
 * GUARANTEES a consumer may rely on:
 *   - Output is a SUBSEQUENCE of the input. Same relative order, same `seq`
 *     ascending, no duplicates introduced, nothing re-sorted.
 *   - `mode === 'everything'` returns every event, in input order.
 *   - An event whose `payload.type` is not in any of the three sets is
 *     RENDERED, not hidden. Unreachable while the union is partitioned, and it
 *     is the safe direction if it ever is not: an unrecognised event shows up
 *     rather than vanishing.
 *   - Filtering depends on `payload` contents in EXACTLY ONE case, named below.
 *     Otherwise it depends only on the type.
 *
 * AMENDED 2026-08-20 BY USER DECISION (escalation E5), superseding the original
 * blanket rule that "no `system` subtype is special-cased":
 *
 *   A `system` event bearing the `startup_reconciliation` subtype marker is
 *   treated as DIAGNOSTIC and is therefore visible in BOTH modes, exactly as
 *   `error` and `malformed` are.
 *
 *   WHY THE EXCEPTION IS SAFE, AND WHY IT IS THE ONLY ONE. The original rule's
 *   rationale was rot: subtypes are the CLI's vocabulary and the CLI changes
 *   them, so a filter keyed on one decays silently. That rationale does not
 *   reach this marker — `startup_reconciliation` is written by ORCASTRATE'S OWN
 *   startup sweep (`src/main/store/schema.ts`, `subtypeMarker`), not by the
 *   CLI, so it cannot change under us. Any subtype the CLI owns remains
 *   un-special-cased, and the blanket rule stands for all of them.
 *
 *   WHY IT IS WORTH AN EXCEPTION AT ALL. The reconciliation notice is the only
 *   explanation a user ever gets for why their lanes read Orphaned after a
 *   relaunch, and the previous session deliberately made it a durable
 *   transcript row rather than a dismissible banner for that reason. Filtered
 *   by default, it is behind a toggle at precisely the moment it matters most:
 *   the first render after a relaunch. That is the same argument that already
 *   exempts `error` and `malformed` — a diagnostic the user must know to go
 *   looking for is a silent drop in every way that matters to them.
 */
export declare function filterTranscriptEvents(
  events: readonly NormalizedEvent[],
  mode: TranscriptFilterMode,
): NormalizedEvent[];

/** How many of `events` `mode` would hide. `events.length - filtered.length`. */
export declare function hiddenEventCount(
  events: readonly NormalizedEvent[],
  mode: TranscriptFilterMode,
): number;

// ---------------------------------------------------------------------------
// 3. The affordance
// ---------------------------------------------------------------------------

/**
 * ADDED to `TEST_IDS` in `src/renderer/src/contracts/renderer-view.ts`, by T1.
 *
 * The toggle lives in the pane's own `<header>`, beside the lane title, in both
 * the primary and the follower pane. Each pane holds its OWN mode: the two
 * panes show different lanes for different reasons and a shared mode would make
 * revealing plumbing in one pane change the other.
 *
 * It is a `<button>` with `aria-pressed` reflecting `mode === 'everything'`,
 * and an accessible name that states the count in words — "Show 42 hidden
 * system events" / "Hide 42 system events" — so the count is available to a
 * screen reader and not only to the eye.
 *
 * WHEN NOTHING IS HIDDEN the button still renders, still says which mode it is
 * in, and reads "Show system events" with no count. It is never disabled: a
 * disabled control in an empty lane teaches the user the feature does not
 * exist.
 */
export const TRANSCRIPT_FILTER_TEST_IDS = {
  /** The toggle button. Suffix with the pane: `transcript-filter:primary`
   *  and `transcript-filter:split`, using the frozen `testId` helper, because
   *  both panes render one and a bare id would be ambiguous. */
  transcriptFilter: 'transcript-filter',
  /** The element carrying the hidden count. Absent when the count is 0. */
  transcriptFilterCount: 'transcript-filter-count',
} as const;
