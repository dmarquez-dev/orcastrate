/**
 * CONTRACT — the payload-scoped filter exemption that lets a deliberate stop
 * through `'conversation'` mode. Frozen at Gate 2.
 *
 * Boundary between T2 (the only task that edits `transcript-filter.ts`) and T3
 * (the joined proof, which asserts the rendered words). T1 does not consume
 * this file.
 *
 * THE DEFECT'S SECOND HALF. Even once T1 pushes the event, `lane_closed` is a
 * member of `PLUMBING` in `src/renderer/src/transcript/transcript-filter.ts:51`
 * — alongside `thinking` — so `'conversation'` mode, which is
 * `DEFAULT_TRANSCRIPT_FILTER`, drops it before it can render. The user sees
 * nothing whether or not the push lands.
 *
 * A FALSE PREMISE THIS FILE EXISTS PARTLY TO KILL. The previous session's T7
 * acceptance criterion 3 asserted that `lane_closed` was a CONVERSATION event
 * type, and it recorded that criterion NOT MET because the premise was false.
 * The claim also appears, wrong, in
 * `sessions/2026-08-25-.../contracts/lane-stopped-status.ts` section 1, which
 * says the row "is visible in the default transcript with no filter change".
 * IT IS NOT. `lane_closed` has been in `PLUMBING` since 2026-08-20. No
 * criterion in this session may restate the false version.
 */

import type { NormalizedEvent } from '../../../../src/shared/contracts/events';

// ===========================================================================
// 1. THE HARD CONSTRAINT
// ===========================================================================

/**
 * `lane_closed` IS NOT UNHIDDEN WHOLESALE. The type stays wholly a member of
 * `PLUMBING`, and `PLUMBING_EVENT_TYPES` keeps all six members in the order it
 * has them.
 *
 * WHY, in the user's own terms: lane bookkeeping is the routine chatter the
 * filter exists to remove, and the rail already reports every lane's status
 * where the user is already looking. A `done` lane closing is a Calf finishing
 * its own work — dozens per session. An `orphaned` lane is a recovery state the
 * startup-reconciliation notice already explains in words. Only `'stopped'` is
 * a DELIBERATE USER ACTION, and the user's question — "I pressed Stop; what
 * happened?" — is the one the transcript is failing to answer.
 *
 * So: `'stopped'` becomes visible. `'done'` and `'orphaned'` stay hidden.
 *
 * THIS CONSTRAINT HAS A LIVE TRIPWIRE ALREADY IN THE REPOSITORY, which T2 must
 * NOT weaken or edit. Both existing suites build their `lane_closed` fixtures
 * with `status: 'done'`:
 *   - `transcript/transcript-filter.test.ts` `payloadFor('lane_closed')`
 *   - `transcript/test-fixtures.ts:103`, feeding
 *     `TranscriptPane.filter.test.tsx`'s `typeCount(pane, 'lane_closed') === 0`
 * A wholesale unhide breaks both. A correctly scoped exemption leaves both
 * green, untouched. That those two files stay byte-identical is therefore
 * EVIDENCE OF NARROWNESS, not merely an absence of collateral damage.
 */
export const LANE_CLOSED_STAYS_IN_PLUMBING = true;

// ===========================================================================
// 2. The shape — following `isStartupReconciliationNotice` exactly
// ===========================================================================

/**
 * `isStartupReconciliationNotice` (`transcript-filter.ts:229`) is the pattern,
 * and its surrounding comments are required reading before writing a line of
 * this. It is described in the file as "THE ONE PLACE FILTERING LOOKS AT
 * `payload` CONTENTS", and its docblock at `isHiddenInConversation` explains
 * the property that makes it safe — the property this exemption MUST share:
 *
 *     "the three sets still partition `EventType` and both `_AssertNever`
 *      guards above are untouched and still hold. The partition is over the
 *      TYPE. What the exemption changes is this PREDICATE ... No guard was
 *      loosened to make room for it, because none of them was ever about
 *      payload contents."
 *
 * NOTHING BELOW TOUCHES `CONVERSATION`, `DIAGNOSTIC`, `PLUMBING`,
 * `_UnpartitionedEventType`, `_EventTypesArePartitioned`,
 * `_EventTypeSetsAreDisjoint`, or the probe-record comment block at
 * `transcript-filter.ts:136-164`. Those tuples and those guards are frozen for
 * this session. If a change appears to require moving one, that is an
 * escalation, not an implementation decision.
 *
 * THE PREDICATE, named in parallel with the one it joins:
 *
 *     export function isDeliberateStopNotice(
 *       payload: NormalizedEvent['payload'],
 *     ): boolean {
 *       if (payload.type !== 'lane_closed') return false;
 *       return payload.status === 'stopped';
 *     }
 *
 * `payload.status` is `Extract<LaneStatus, 'done' | 'orphaned' | 'stopped'>`
 * after the previous session's widening, so this is a total, typed comparison
 * over a union this repository owns. It reads NO subtype and NO free-form
 * `data` bag: the no-subtype-special-casing rule at
 * `HIDDEN_IN_CONVERSATION`'s docblock is about the CLI's vocabulary, and
 * `LaneStatus` is not the CLI's vocabulary — it is a `CHECK`-constrained column
 * in this repository's own schema, and `'stopped'` has exactly one writer,
 * `PodManager.#stopRunningLanes`. That is a STRONGER guarantee than the
 * startup-reconciliation marker enjoys, not a weaker one.
 */
export declare function isDeliberateStopNotice(payload: NormalizedEvent['payload']): boolean;

/**
 * And the predicate it feeds, which is the ONLY other function that changes:
 *
 *     function isHiddenInConversation(event: NormalizedEvent): boolean {
 *       if (!HIDDEN_IN_CONVERSATION.has(event.payload.type)) return false;
 *       if (isStartupReconciliationNotice(event.payload)) return false;
 *       return !isDeliberateStopNotice(event.payload);
 *     }
 *
 * Two exemptions, checked independently, neither aware of the other. The
 * existing single-expression form (`return !isStartupReconciliationNotice(...)`)
 * is replaced by this three-line form rather than by an `||` chain, because a
 * third exemption should have exactly one obvious place to go.
 *
 * `filterTranscriptEvents` and `hiddenEventCount` ARE NOT EDITED. They are
 * already expressed in terms of this predicate, and their frozen properties —
 * pure, total, order-preserving, output a subsequence of the input — are
 * unchanged by widening what the predicate lets through.
 */
export declare const IS_HIDDEN_IN_CONVERSATION_IS_THE_ONLY_OTHER_EDIT: true;

// ===========================================================================
// 3. The prose that this change makes FALSE, and must therefore be fixed
// ===========================================================================

/**
 * THIS SECTION IS NOT OPTIONAL AND IS NOT COSMETIC. Prose that is no longer
 * true of the code is this project's most-recorded defect class, and this
 * particular file's comments are unusually load-bearing: a later reader
 * deciding whether a third exemption is permissible will decide it from these
 * paragraphs. Leaving them saying "the ONE exemption" while two exist teaches
 * that reader something false about the rule they are being asked to respect.
 *
 * Every site below is inside `transcript-filter.ts` and is T2's to correct, in
 * the same commit as the predicate:
 *
 *   a. `HIDDEN_IN_CONVERSATION`'s docblock (~line 186) ends "the ONE exemption
 *      below is not one of them". There are now two, and the sentence's real
 *      claim — that neither exemption reads a CLI-owned subtype — must survive
 *      the correction rather than be dropped with the count.
 *
 *   b. `isStartupReconciliationNotice`'s heading (~line 204) reads "THE ONE
 *      PLACE FILTERING LOOKS AT `payload` CONTENTS". It is now one of two, and
 *      the exemptions differ in kind: that one reads a marker written by
 *      Orcastrate's boot sweep, this one reads a schema-constrained enum. Say
 *      which is which.
 *
 *   c. `TranscriptFilterMode`'s docblock (~line 174) enumerates what
 *      `'conversation'` renders: "the conversation, the diagnostics, and the
 *      startup-reconciliation notice". The deliberate-stop notice joins that
 *      list. This is the enumeration a reader is most likely to trust without
 *      checking.
 *
 *   d. `PLUMBING_EVENT_TYPES`' docblock (~line 82) says "`lane_opened` /
 *      `lane_closed` are lane bookkeeping the rail already reports, with the
 *      lane's status, where the user is already looking." That justification is
 *      still true of `lane_opened`, of `done` and of `orphaned`, and is exactly
 *      what fails for a deliberate stop — the rail reports a STATUS, and the
 *      question "did my Stop do anything" is about an EVENT. Record the
 *      distinction here; it is the argument for the exemption.
 *
 * A criterion that greps for the absence of the string "ONE exemption" would be
 * satisfied by deleting the paragraph. Do not write that criterion and do not
 * satisfy it that way: the obligation is that the surviving prose describes
 * what the code now does.
 */
export declare const PROSE_SITES_TO_CORRECT: readonly [
  'HIDDEN_IN_CONVERSATION docblock',
  'isStartupReconciliationNotice heading',
  'TranscriptFilterMode docblock',
  'PLUMBING_EVENT_TYPES docblock',
];

// ===========================================================================
// 4. Rendering — ALREADY DONE, and NOT to be rebuilt
// ===========================================================================

/**
 * `TranscriptEventItem.tsx:113` already renders `lane_closed`:
 *
 *     <Labelled label="Lane closed">
 *       <span data-status={payload.status}>
 *         <span className={styles.dot} aria-hidden="true" />
 *         {LANE_STATUS_LABEL[payload.status]}
 *       </span>
 *     </Labelled>
 *
 * and `LANE_STATUS_LABEL.stopped === 'Stopped'` shipped in the previous
 * session. So the moment the event arrives and clears the filter the row reads
 *
 *     Lane closed
 *     ● Stopped
 *
 * with NO new rendering work, and none is assigned to any task. CONFIRM this by
 * reading the file; do not rebuild it, do not add a case, do not add a variant
 * label for the stopped status.
 *
 * ACCESSIBILITY IS ALREADY SATISFIED BY THAT MARKUP AND MUST NOT REGRESS: the
 * status dot carries `aria-hidden="true"` and the word "Stopped" is real text,
 * so colour is not the only carrier of meaning. That is the frontend
 * discipline's floor, and it is met by the code as it stands.
 */
export declare const RENDERED_TEXT: readonly ['Lane closed', 'Stopped'];
