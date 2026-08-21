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
] as const satisfies readonly EventType[];

const DIAGNOSTIC = ['error', 'malformed'] as const satisfies readonly EventType[];

const PLUMBING = [
  'thinking',
  'system',
  'lane_opened',
  'lane_closed',
  'permission_request',
  'permission_decision',
] as const satisfies readonly EventType[];

/**
 * The conversation. Visible in both filter states.
 *
 * `tool_use` is here rather than in the plumbing set because it is where the
 * inline dispatch card renders (spec 5.2) — filtering it would strip the
 * causality the card exists to preserve.
 *
 * AMENDED 2026-08-21 (`contracts/transcript-filter-amendment.ts`):
 * `permission_request` and `permission_decision` LEFT this set for the plumbing
 * set, taking it from six members to four. THE USER'S REASON: a permission
 * raises a real confirmation prompt — the permission card, in the pane's own
 * `permissionSlot`, which they must answer before the turn continues. The
 * transcript row beside it is a second copy of something they have already been
 * made to look at.
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
 *
 * `permission_request` / `permission_decision` JOINED THIS SET on 2026-08-21.
 * THEY MOVE, THEY ARE NOT DROPPED: spec 5.2 requires every member of the frozen
 * `EventType` union to stay RENDERABLE, and both still render through
 * `TranscriptEventItem`'s existing cases, revealed by the toggle at their
 * original `seq` position, interleaved. NOTHING WAS DELETED FROM
 * `TranscriptEventItem`, and THE PERMISSION CARD IS UNAFFECTED — hiding the
 * transcript ROW does not hide the PROMPT.
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
 *
 * RE-PROVED 2026-08-21, BECAUSE THE TUPLE CONTENTS CHANGED. A guard that held
 * over a 6/2/4 partition is not thereby known to hold over a 4/2/6 one, and a
 * guard nobody watched fire is the defect class this project has now shipped
 * three times. Three throwaway probes, `tsc --noEmit --strict --ignoreConfig`,
 * over copies of this exact region with the CURRENT tuples:
 *
 *   A. 13-member local union       -> TS2344: Type '"thirteenth_event_type"'
 *                                    does not satisfy the constraint 'never'.
 *                                    (raised by `_EventTypesArePartitioned`)
 *   B. `tool_use` in TWO sets,
 *      union fully covered         -> TS2344: Type '"tool_use"' does not
 *                                    satisfy the constraint 'never', raised by
 *                                    `_EventTypeSetsAreDisjoint` ALONE. The
 *                                    cover guard stayed silent. COVER IS NOT A
 *                                    PARTITION.
 *   C. `const x: _Unpartitioned[] = []`
 *      over probe A's union        -> exit 0, NO ERROR AT ALL.
 */

// ---------------------------------------------------------------------------
// 2. The filter
// ---------------------------------------------------------------------------

/**
 * Which events a pane is currently rendering.
 *
 *   'conversation' — the default. Renders the conversation, the diagnostics,
 *                    and the startup-reconciliation notice (see
 *                    `isStartupReconciliationNotice`).
 *   'everything'   — renders all twelve types. Identical to today's behaviour.
 */
export type TranscriptFilterMode = 'conversation' | 'everything';

export const DEFAULT_TRANSCRIPT_FILTER: TranscriptFilterMode = 'conversation';

/**
 * The hidden set, as a Set for O(1) membership. Keyed on the event TYPE.
 * Subtypes are the CLI's vocabulary and it changes them; a filter keyed on one
 * of those would rot silently. The blanket rule stands for every subtype the
 * CLI owns — the ONE exemption below is not one of them.
 */
const HIDDEN_IN_CONVERSATION: ReadonlySet<EventType> = new Set<EventType>(PLUMBING);

/**
 * `SystemPayload.subtype` and `StartupReconciliationData.subtypeMarker` for the
 * startup-reconciliation notice.
 *
 * DUPLICATED FROM `src/main/pod-manager/startup-reconciliation.ts` ON PURPOSE.
 * `tsconfig.web.json` includes only `src/renderer/src/**` and `src/shared/**`,
 * so importing the producer's const would pull main-process code into the
 * renderer program to buy one string. `transcript/startup-reconciliation.test.tsx`
 * already carries the same literal for the same reason; the tests below pin
 * this copy against the producer's exact payload shape.
 */
export const STARTUP_RECONCILIATION_SUBTYPE = 'startup_reconciliation';

/**
 * THE ONE PLACE FILTERING LOOKS AT `payload` CONTENTS.
 *
 * AMENDED 2026-08-20 BY USER DECISION (escalation E5). A `system` event bearing
 * the `startup_reconciliation` marker is treated as DIAGNOSTIC and is visible
 * in BOTH modes, exactly as `error` and `malformed` are.
 *
 * WHY THIS ONE AND NO OTHER. The no-subtype-special-casing rule exists because
 * subtypes are the CLI's vocabulary and the CLI changes them under us. That
 * rationale does not reach this marker: it is written by ORCASTRATE'S OWN
 * startup sweep (`pod-manager.ts` `#appendReconciliationEvents`), so it cannot
 * change without this repository changing it.
 *
 * WHY IT IS WORTH AN EXCEPTION. The notice is the only explanation a user ever
 * gets for why their lanes read Orphaned after a relaunch, and the previous
 * session deliberately made it a durable transcript row rather than a
 * dismissible banner for exactly that reason. Hidden by default it sits behind
 * a toggle at the one moment it matters most: the first render after a
 * relaunch.
 *
 * BOTH CARRIERS ARE ACCEPTED, and that is the SAFE DIRECTION, not laxity. The
 * producer stamps the marker twice — once as `payload.subtype` and once as
 * `data.subtypeMarker` — so requiring both would let a one-sided producer
 * change silently HIDE the notice, which is the failure this exemption exists
 * to prevent. Accepting either can only over-show.
 */
export function isStartupReconciliationNotice(payload: NormalizedEvent['payload']): boolean {
  if (payload.type !== 'system') return false;
  if (payload.subtype === STARTUP_RECONCILIATION_SUBTYPE) return true;
  const data: unknown = payload.data;
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as { subtypeMarker?: unknown }).subtypeMarker === STARTUP_RECONCILIATION_SUBTYPE
  );
}

/**
 * Whether 'conversation' mode hides this event.
 *
 * NOTE WHAT DID *NOT* CHANGE. `system` is still wholly a member of
 * `PLUMBING_EVENT_TYPES`; the three sets still partition `EventType` and both
 * `_AssertNever` guards above are untouched and still hold. The partition is
 * over the TYPE. What the exemption changes is this PREDICATE — "hidden" is
 * now "the type is plumbing AND the event is not the reconciliation notice"
 * rather than "the type is plumbing". No guard was loosened to make room for
 * it, because none of them was ever about payload contents.
 */
function isHiddenInConversation(event: NormalizedEvent): boolean {
  if (!HIDDEN_IN_CONVERSATION.has(event.payload.type)) return false;
  return !isStartupReconciliationNotice(event.payload);
}

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
  return events.filter((event) => !isHiddenInConversation(event));
}

/** How many of `events` `mode` would hide. `events.length - filtered.length`. */
export function hiddenEventCount(
  events: readonly NormalizedEvent[],
  mode: TranscriptFilterMode,
): number {
  return events.length - filterTranscriptEvents(events, mode).length;
}
