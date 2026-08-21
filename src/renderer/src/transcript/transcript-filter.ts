/**
 * The transcript noise filter (`contracts/transcript-filter.ts`).
 *
 * A RENDER FILTER and nothing else. Routing, storage, `highWaterSeq` and
 * `unreadEventCount` are all untouched: a hidden event still arrived, still
 * persisted, and still counts as unread, or a user would clear a badge by
 * toggling a filter.
 *
 * The evidence this is sized against: the 2026-08-20 first run stored 109
 * events in one Pod, 53 of them `system`, against 11 `assistant_text`.
 */

import type { EventType, NormalizedEvent } from '@shared/contracts/events';

// ---------------------------------------------------------------------------
// 1. The three sets. Exhaustive over `EventType`, PROVED BELOW.
// ---------------------------------------------------------------------------

/*
 * WHY EACH SET IS DECLARED TWICE.
 *
 * The frozen contract annotates every one of the three as `readonly
 * EventType[]`, and that annotation WIDENS the element type: with it,
 * `(typeof CONVERSATION_EVENT_TYPES)[number]` is `EventType`, so the
 * `Exclude` below collapses to `never` no matter what the arrays actually
 * contain and the guard proves nothing. That is the same class of inert guard
 * as `_UncoveredAtSchemaHead` in `src/main/store/schema.ts`, arriving by a
 * different route.
 *
 * So the literal tuple is bound to a module-private const first — the
 * `as const satisfies readonly EventType[]` spelling `schema.ts` already uses
 * for its pinned migration lists — and the EXPORTED name carries the
 * contract's declared type verbatim. Consumers see exactly the contract's
 * type (so `CONVERSATION_EVENT_TYPES.includes(someEventType)` still
 * type-checks); the guard sees the literals.
 */

const CONVERSATION = [
  'user_message',
  'assistant_text',
  'tool_use',
  'tool_result',
  'permission_request',
  'permission_decision',
] as const satisfies readonly EventType[];

const DIAGNOSTIC = ['error', 'malformed'] as const satisfies readonly EventType[];

const PLUMBING = [
  'thinking',
  'system',
  'lane_opened',
  'lane_closed',
] as const satisfies readonly EventType[];

/**
 * The conversation. Visible in both filter states.
 *
 * `tool_use` is here rather than in the plumbing set because it is where the
 * inline dispatch card renders (spec 5.2) — filtering it would strip the
 * causality the card exists to preserve.
 */
export const CONVERSATION_EVENT_TYPES: readonly EventType[] = CONVERSATION;

/**
 * DIAGNOSTICS. Visible in both filter states, and NOT members of the plumbing
 * set. A diagnostic the user cannot see without first knowing to go looking
 * for it is a silent drop in every way that matters to the person using the
 * app, whatever the code does.
 */
export const DIAGNOSTIC_EVENT_TYPES: readonly EventType[] = DIAGNOSTIC;

/**
 * PLUMBING. Hidden by default, revealed by the toggle.
 *
 * `system` is the measured problem. `thinking` is model internals rather than
 * what the model said. `lane_opened` / `lane_closed` are lane bookkeeping the
 * rail already reports, with the lane's status, where the user is already
 * looking.
 */
export const PLUMBING_EVENT_TYPES: readonly EventType[] = PLUMBING;

/**
 * Every `EventType` not claimed by exactly one of the three sets.
 *
 * EXHAUSTIVENESS IS A COMPILE-TIME PROPERTY, NOT A COUNT.
 */
type _UnpartitionedEventType = Exclude<
  EventType,
  (typeof CONVERSATION)[number] | (typeof DIAGNOSTIC)[number] | (typeof PLUMBING)[number]
>;

/**
 * The guard that actually fires.
 *
 * SPELLED AS A GENERIC CONSTRAINT ON PURPOSE, and NOT as
 * `const x: _Unpartitioned[] = []`. An empty array literal is assignable to
 * ANY array type, so the array form is satisfied vacuously and never fails —
 * exactly the inert `_UncoveredAtSchemaHead` spelling in
 * `src/main/store/schema.ts:210-212`, which T0 of the previous session proved
 * by experiment does not fire. Routing the `Exclude` through `T extends never`
 * leaves no value to be vacuously empty: a non-`never` argument is rejected at
 * the type level.
 *
 * A thirteenth `EventType` must break `typecheck:web` HERE.
 */
type _AssertNever<T extends never> = T;
export type _EventTypesArePartitioned = _AssertNever<_UnpartitionedEventType>;

/**
 * And the other direction: no type may appear in TWO sets. `Extract` of any
 * pair must be `never`, or an event would be both conversation and plumbing
 * and the "partition" would only be a cover.
 */
export type _EventTypeSetsAreDisjoint = _AssertNever<
  | Extract<(typeof CONVERSATION)[number], (typeof DIAGNOSTIC)[number] | (typeof PLUMBING)[number]>
  | Extract<(typeof DIAGNOSTIC)[number], (typeof PLUMBING)[number]>
>;

/*
 * THIS GUARD WAS SEEN TO FIRE, not assumed to. Probe run 2026-08-20, in this
 * file, against a local `EventType | 'thirteenth_event_type'`:
 *
 *   _AssertNever<Exclude<_Local, ...>>   ->  TS2344: Type
 *     '"thirteenth_event_type"' does not satisfy the constraint 'never'.
 *   const x: Exclude<_Local, ...>[] = [] ->  NO ERROR AT ALL.
 *
 * The second line is the spelling in `src/main/store/schema.ts:210-212`. It is
 * why this file does not use it.
 */

// ---------------------------------------------------------------------------
// 2. The filter
// ---------------------------------------------------------------------------

/**
 * Which events a pane is currently rendering.
 *
 *   'conversation' — the default. Renders the conversation and the diagnostics.
 *   'everything'   — renders all twelve types. Identical to today's behaviour.
 */
export type TranscriptFilterMode = 'conversation' | 'everything';

export const DEFAULT_TRANSCRIPT_FILTER: TranscriptFilterMode = 'conversation';

/**
 * The hidden set, as a Set for O(1) membership. Keyed on the event TYPE only —
 * never on `payload` contents, so no `system` subtype is special-cased.
 * Subtypes are the CLI's vocabulary and it changes them; a filter keyed on
 * them would rot silently.
 */
const HIDDEN_IN_CONVERSATION: ReadonlySet<EventType> = new Set<EventType>(PLUMBING);

/**
 * PURE, TOTAL, ORDER-PRESERVING. Returns a NEW array; never mutates `events`.
 *
 * The output is a SUBSEQUENCE of the input — same relative order, `seq` still
 * ascending, nothing re-sorted, no duplicates introduced — which is what keeps
 * the frozen ORDERING AND DEDUPE GUARANTEE (`renderer-state.ts`) intact.
 *
 * An event whose `payload.type` is in none of the three sets is RENDERED, not
 * hidden: unreachable while the union is partitioned, and the safe direction
 * if it ever is not.
 */
export function filterTranscriptEvents(
  events: readonly NormalizedEvent[],
  mode: TranscriptFilterMode,
): NormalizedEvent[] {
  if (mode === 'everything') return events.slice();
  return events.filter((event) => !HIDDEN_IN_CONVERSATION.has(event.payload.type));
}

/** How many of `events` `mode` would hide. `events.length - filtered.length`. */
export function hiddenEventCount(
  events: readonly NormalizedEvent[],
  mode: TranscriptFilterMode,
): number {
  return events.length - filterTranscriptEvents(events, mode).length;
}
