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
import { STARTUP_RECONCILIATION_SUBTYPE } from '@shared/startup-reconciliation-notice';

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
 * that `_UncoveredAtSchemaHead` in `src/main/store/schema.ts` used to be
 * (before it was routed through `_AssertNever`), arriving by a different
 * route.
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
 * THAT JUSTIFICATION HAS A LIMIT, AND `isDeliberateStopNotice` IS WHERE IT
 * ENDS. It holds for `lane_opened`, and for a `lane_closed` reading `done` or
 * `orphaned`: a Calf finishing its own work happens dozens of times a session,
 * and an orphaned lane is a recovery state the startup-reconciliation notice
 * already explains in words. It FAILS for a deliberate stop, because the rail
 * reports a STATUS and the user's question is about an EVENT — "I pressed
 * Stop; did anything happen?" A rail row that reads Stopped is the same shape
 * whether the stop landed a second ago or was already true when the window
 * opened, so it cannot answer that question, and the transcript is the only
 * place that can. So `lane_closed` STAYS in this set, wholly and in place, and
 * the one payload that answers a user's own action is exempted by the
 * predicate instead. See `isDeliberateStopNotice`.
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
 * which is how `_UncoveredAtSchemaHead` in `src/main/store/schema.ts` was
 * once spelled, until T0 of the previous session proved by experiment that
 * it did not fire (it has since been routed through `_AssertNever` there
 * too). Routing the `Exclude` through `T extends never`
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
 * The second line is the spelling `_UncoveredAtSchemaHead` in
 * `src/main/store/schema.ts` had at the time. It is why this file does not
 * use it.
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
 *                    the startup-reconciliation notice (see
 *                    `isStartupReconciliationNotice`) and the deliberate-stop
 *                    notice (see `isDeliberateStopNotice`). Those last two are
 *                    payload-scoped exemptions, not whole types: `system` and
 *                    `lane_closed` are otherwise hidden here.
 *   'everything'   — renders all twelve types. Identical to today's behaviour.
 */
export type TranscriptFilterMode = 'conversation' | 'everything';

export const DEFAULT_TRANSCRIPT_FILTER: TranscriptFilterMode = 'conversation';

/**
 * The hidden set, as a Set for O(1) membership. Keyed on the event TYPE.
 * Subtypes are the CLI's vocabulary and it changes them; a filter keyed on one
 * of those would rot silently. The blanket rule stands for every subtype the
 * CLI owns, and NEITHER of the two exemptions below reads one: the first reads
 * a marker Orcastrate's own boot sweep writes, the second reads
 * `LaneStatus`, a `CHECK`-constrained column in this repository's own schema.
 * The rule is not "look at no payload ever" — it is "never key on a vocabulary
 * someone else can change under us", and both exemptions honour it.
 */
const HIDDEN_IN_CONVERSATION: ReadonlySet<EventType> = new Set<EventType>(PLUMBING);

/**
 * `SystemPayload.subtype` and `StartupReconciliationData.subtypeMarker` for the
 * startup-reconciliation notice.
 *
 * RE-EXPORTED, NOT DECLARED. This used to be a deliberate copy of the
 * producer's const, justified by `tsconfig.web.json` including only
 * `src/renderer/src/**` and `src/shared/**`. The justification was sound and
 * the copy still had to go: no test in this program ever read the producer, so
 * a rename there left every renderer suite green while the notice went back to
 * being hidden by the default filter. The marker now has a single definition
 * under `src/shared/**`, which BOTH tsconfig programs include, so the filter
 * reads the very binding the boot sweep writes.
 *
 * Imported through the `@shared/*` path mapping, which `tsconfig.web.json`
 * declares — the main-process side of the same module takes the relative
 * specifier instead, because `tsconfig.node.json` declares no `paths`.
 */
export { STARTUP_RECONCILIATION_SUBTYPE };

/**
 * ONE OF THE TWO PLACES FILTERING LOOKS AT `payload` CONTENTS — the other is
 * `isDeliberateStopNotice`, added 2026-08-26. THE TWO DIFFER IN KIND, and the
 * difference is the whole of why each is permissible: THIS one reads a MARKER
 * WRITTEN BY ORCASTRATE'S OWN BOOT SWEEP, a string with one producer in this
 * repository; that one reads a SCHEMA-CONSTRAINED ENUM, a `CHECK`-constrained
 * `LaneStatus` column this repository defines. Neither reads a subtype the CLI
 * owns, which is the only thing the blanket rule forbids.
 *
 * AMENDED 2026-08-20 BY USER DECISION (escalation E5). A `system` event bearing
 * the `startup_reconciliation` marker is treated as DIAGNOSTIC and is visible
 * in BOTH modes, exactly as `error` and `malformed` are.
 *
 * WHY THIS ONE IS PERMISSIBLE. The no-subtype-special-casing rule exists because
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
 * THE SECOND PLACE FILTERING LOOKS AT `payload` CONTENTS, added 2026-08-26
 * (`contracts/stop-notice-visibility.ts`). A `lane_closed` whose status is
 * `'stopped'` is visible in `'conversation'` mode. `'done'` and `'orphaned'`
 * are not.
 *
 * WHY THIS ONE IS PERMISSIBLE. `payload.status` is not a CLI subtype. It is
 * `LaneStatus`, a `CHECK`-constrained column in this repository's own schema,
 * so it cannot change without a migration in this repository — a STRONGER
 * guarantee than the startup-reconciliation marker enjoys, not a weaker one.
 * And `'stopped'` has exactly one writer, `PodManager.#stopRunningLanes`,
 * which runs only because a user pressed Stop.
 *
 * WHY IT IS WORTH AN EXEMPTION. `lane_closed` is plumbing because lane
 * bookkeeping is routine — but a deliberate stop is not routine and is not
 * bookkeeping. It is the direct consequence of something the user just did,
 * and before this exemption the default transcript answered "I pressed Stop;
 * what happened?" with nothing at all. That was the defect.
 *
 * WHY IT IS NARROW ON PURPOSE. Un-hiding `lane_closed` wholesale would put a
 * row in the transcript every time a Calf finished — dozens a session — which
 * is precisely the chatter this filter exists to remove, and it would tell the
 * user nothing the rail is not already showing them.
 */
export function isDeliberateStopNotice(payload: NormalizedEvent['payload']): boolean {
  if (payload.type !== 'lane_closed') return false;
  return payload.status === 'stopped';
}

/**
 * Whether 'conversation' mode hides this event.
 *
 * NOTE WHAT DID *NOT* CHANGE, AND STILL HAS NOT. `system` and `lane_closed`
 * are both still wholly members of `PLUMBING_EVENT_TYPES`; the three sets
 * still partition `EventType` and both `_AssertNever` guards above are
 * untouched and still hold. The partition is over the TYPE. What the
 * exemptions change is this PREDICATE — "hidden" is now "the type is plumbing
 * AND the event is neither the reconciliation notice nor a deliberate stop"
 * rather than "the type is plumbing". No guard was loosened to make room for
 * either, because none of them was ever about payload contents.
 *
 * THE TWO EXEMPTIONS ARE CHECKED INDEPENDENTLY, neither aware of the other,
 * and this is spelled as three statements rather than an `||` chain so that a
 * third exemption has exactly one obvious place to go. Anyone adding one owes
 * the same argument the two above give: that the field it reads belongs to
 * this repository, and that the row it reveals answers a question the rest of
 * the UI cannot.
 */
function isHiddenInConversation(event: NormalizedEvent): boolean {
  if (!HIDDEN_IN_CONVERSATION.has(event.payload.type)) return false;
  if (isStartupReconciliationNotice(event.payload)) return false;
  return !isDeliberateStopNotice(event.payload);
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
