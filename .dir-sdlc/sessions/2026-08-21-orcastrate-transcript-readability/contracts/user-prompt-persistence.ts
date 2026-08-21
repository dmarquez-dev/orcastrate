/**
 * CONTRACT — The user's typed prompt becomes a durable event, and the SDK's
 * echo of it does not double the turn. Frozen at Gate 2.
 *
 * Item 1 of the session scope, and the item most likely to be got wrong.
 *
 * Boundary between:
 *   - T1 (PRODUCER) `src/main/pod-manager/**`, `tests/unit/pod-manager/**`,
 *     `tests/unit/ipc/**`.
 *   - Nobody else. NO renderer task consumes a new symbol from here: the
 *     renderer already renders `user_message` (`TranscriptEventItem.tsx:39`,
 *     label "You") and `user_message` is already a member of
 *     `CONVERSATION_EVENT_TYPES`. THERE IS SIMPLY NOTHING TO RENDER TODAY, and
 *     that is the whole defect.
 *
 * ===========================================================================
 * THE DEFECT, VERIFIED BEFORE THIS SESSION OPENED
 * ===========================================================================
 *
 * `PodManager.send()` (`src/main/pod-manager/pod-manager.ts:700-701`) is two
 * lines:
 *
 *     async send(podId: PodId, text: string): Promise<void> {
 *       await this.#requireSession(podId).runner.send(text);
 *     }
 *
 * It pushes `text` into the runner's input queue and appends NOTHING to the
 * store. Every `user_message` event that exists in any Pod today was produced
 * by `lane-router.ts:276`, which fires when the SDK emits a `user` message
 * carrying a text block.
 *
 * IT SURVIVED 1731 UNIT AND JSDOM TESTS AND WAS FOUND THE FIRST TIME A HUMAN
 * TYPED INTO THE APP. That is a fact about the shape of the acceptance
 * criteria below: they are stated at the STORE, over the REAL pipeline, and
 * never at a hand-written double that could be configured to append.
 *
 * ===========================================================================
 * WHAT THE RECORDED CORPUS ACTUALLY SHOWS — READ THIS BEFORE WRITING THE RULE
 * ===========================================================================
 *
 * `tests/fixtures/protocol/*.ndjson` is six real recorded CLI streams. Every
 * `user` message in all six was inspected. The result is not what the naive
 * reading of "the SDK echoes the user message back" predicts:
 *
 *   - There are SEVEN `user` messages with `parent_tool_use_id: null` — i.e.
 *     on the Matriarch lane. ALL SEVEN are tool_result carriers. NOT ONE is a
 *     text block. The CLI does NOT echo the human's typed Matriarch prompt
 *     back on the output stream in this corpus.
 *
 *   - There are SEVEN `user` messages carrying a TEXT block, and every one of
 *     them has a NON-NULL `parent_tool_use_id`. They are CALF PROMPTS — the
 *     task prompt a dispatched subagent was launched with, replayed into that
 *     Calf's lane. `01-parallel-dispatch.ndjson` lines 5 and 8 are two of
 *     them, both reading "Report the current directory name and stop.", each
 *     under a different `parent_tool_use_id`.
 *
 * TWO CONSEQUENCES, AND BOTH ARE BINDING.
 *
 * ONE. The de-duplication rule is a guard against a behaviour this repository
 * has NOT observed. It is required anyway — the CLI is not ours, `send()` is
 * reachable mid-turn, and doubling a turn is exactly the failure a naive fix
 * ships. But it must be written as a guard, not as a filter tuned to a
 * measured stream.
 *
 * TWO, AND THIS IS THE TRAP. The only `user` text blocks that DO exist are
 * legitimate content that must NEVER be suppressed. A dedupe rule written as
 * "drop a `user_message` whose text matches something we sent" deletes a
 * Calf's opening prompt — the first row of that Calf's transcript, the one
 * that says what it was asked to do. In 'inline' routing mode those events
 * carry the MATRIARCH's laneId, so a lane check alone does not save it.
 *
 * ===========================================================================
 * THE DIRECTION THIS MUST FAIL IN
 * ===========================================================================
 *
 * OVER-SHOW. Every bound below — the queue cap, the expiry, the one-shot
 * consumption, the lane check — fails toward RENDERING the event.
 *
 * WHY, stated so it is not re-litigated: a missed suppression shows the user
 * their own sentence twice. It is ugly, it is immediately visible, and the
 * user can read past it. An over-eager suppression DELETES CONTENT FROM A
 * DURABLE STORE. It is invisible — there is no gap where the row was, no
 * badge, no diagnostic — and it is unrecoverable, because the store is the
 * only copy. This is the same argument that already exempts `error` and
 * `malformed` from the noise filter, applied one layer down.
 */

import type {
  LaneId,
  NewEvent,
  NormalizedEvent,
  PodId,
  Timestamp,
} from '@shared/contracts/events';

// ---------------------------------------------------------------------------
// 1. The append
// ---------------------------------------------------------------------------

/**
 * `PodManager.send(podId, text)` gains ONE append. Its signature does not
 * change; `PodManagerApi` does not change; `src/shared/contracts/ipc.ts` does
 * not change; the preload bridge does not change; the composer does not
 * change. The renderer learns about the event the way it learns about every
 * other event — through the existing `podEvent` push.
 *
 * THE EXACT EVENT:
 *
 *   {
 *     podId,
 *     laneId:   <the Pod's Matriarch laneId>,
 *     type:     'user_message',
 *     payload:  { type: 'user_message', text },
 *     createdAt: <PodManager's injected clock, `this.#now()`>,
 *   }
 *
 * `text` IS STORED VERBATIM — not trimmed, not normalised, not truncated, not
 * escaped. What the user typed is what the transcript shows. (`send` may still
 * reject an empty string upstream; that is the composer's business and is
 * unchanged here.)
 *
 * THE LANE IS THE MATRIARCH, resolved with `this.#store.getMatriarchLane(podId)`
 * — the same accessor `#appendResumeFallbackNotice` uses. There is one composer
 * per Pod and it addresses the Matriarch; Calf lanes are not addressable
 * (spec 5.3). This holds in 'inline' routing mode too, where every event
 * already carries the Matriarch's laneId anyway.
 *
 * IF THERE IS NO MATRIARCH LANE the append is skipped and the fact is logged
 * through `this.#log.warn`, and `runner.send` STILL RUNS. Precedent:
 * `#appendResumeFallbackNotice` (`pod-manager.ts:642-649`) does exactly this
 * for exactly this reason. Losing the durable record silently is worse than
 * losing it loudly; refusing to send the user's message because bookkeeping
 * failed is worse than both.
 *
 * ORDER — APPEND FIRST, THEN `await runner.send(text)`. Not the other way
 * round.
 *
 *   - `#requireSession(podId)` runs FIRST and still throws for an unknown or
 *     unopened Pod. No append happens for a Pod that cannot be sent to.
 *   - The prompt must never appear AFTER the model's reply to it. `PodRunner.
 *     send` pushes into the input queue and resolves on a microtask
 *     (`pod-runner.ts:423-427`); the SDK drains that queue asynchronously, so
 *     awaiting it first opens a real window in which an ingested event takes a
 *     lower `seq` than the prompt that caused it. `seq` is the transcript's
 *     only ordering, so that window is a user-visible reordering.
 *   - The cost is a phantom row if `runner.send` then throws. That is the safe
 *     direction under the rule above: the user sees what they typed plus the
 *     error the IPC envelope already surfaces, rather than a send that
 *     vanished.
 *
 * THE APPEND GOES THROUGH `#persist(session, [event])` — the single append
 * path (`pod-manager.ts:1041`), which does the lane row, the one `appendMany`,
 * the `assertAscendingSeq` and the `push.podEvent` in the established order.
 * A second, parallel append path is how the two halves of this feature drift.
 */
export declare function sendAppendsUserPrompt(podId: PodId, text: string): Promise<void>;

// ---------------------------------------------------------------------------
// 2. The de-duplication rule
// ---------------------------------------------------------------------------

/**
 * ONE PENDING-ECHO RECORD PER `send`, held on the `PodSession` — per Pod, never
 * module-global, never static. Two Pods sending the same sentence must not
 * interfere, and the record must die with the session.
 */
export interface PendingEcho {
  /** The text as it was appended, byte for byte. */
  text: string;
  /** `seq` of the event this `send` appended. Diagnostics and expiry. */
  appendedSeq: number;
  /** `this.#now()` at append time. */
  at: Timestamp;
}

/**
 * How many unconsumed records a session keeps. When an eleventh `send` happens
 * with ten still outstanding, the OLDEST is dropped.
 *
 * Dropping the oldest means its echo, if one ever arrives, is RENDERED — the
 * safe direction. A cap exists at all because an unbounded list on a
 * long-running session is a leak whose only symptom is a suppression happening
 * an hour after the send that armed it.
 */
export const PENDING_ECHO_CAP = 10;

/**
 * A record older than this is dropped without being consumed.
 *
 * Chosen, not measured: no echo has been observed at all, so there is no
 * latency to size against. Any bound is better than none, and every miss it
 * causes over-shows. If an echo is ever observed arriving later than this, the
 * fix is to raise the number, not to remove the bound.
 */
export const PENDING_ECHO_TTL_MS = 60_000;

/**
 * THE PREDICATE. Applied to the ROUTER'S OUTPUT BATCH — the `NewEvent[]`
 * returned by `session.router.ingest(message)` at `pod-manager.ts:989` —
 * BEFORE that batch reaches `#persist`. It is NOT applied inside `#persist`,
 * because `#persist` is also the path the append in section 1 takes and it
 * must not filter its own event.
 *
 * `LaneRouter` IS NOT TOUCHED. It stays pure, its `tests/router/**` corpus and
 * `src/main/lane/purity.test.ts` stay green, and `routeBlock`
 * (`lane-router.ts:255-290`) keeps emitting `user_message` for every `user`
 * text block exactly as it does today. The suppression is a PodManager
 * concern because only PodManager knows what PodManager sent.
 *
 * AN EVENT IS SUPPRESSED IF, AND ONLY IF, ALL FIVE HOLD:
 *
 *   1. `event.payload.type === 'user_message'`.
 *   2. `event.laneId === <the Pod's Matriarch laneId>`, read from the event AS
 *      THE ROUTER PRODUCED IT, before `#routeLane`'s unknown-lane restamping.
 *      Restamping moves an unknown Calf's events onto the Matriarch; checking
 *      after it would put a Calf's prompt inside the candidate set for no
 *      reason.
 *   3. There is a pending record whose `text` is EXACTLY EQUAL to
 *      `event.payload.text` — `===` on the raw string. No trim, no case fold,
 *      no whitespace collapse, no prefix or substring match, no similarity
 *      threshold. Every one of those widens the rule toward deleting a Calf
 *      prompt that merely resembles something the user typed.
 *   4. That record has not expired (`PENDING_ECHO_TTL_MS`).
 *   5. That record has not already been consumed.
 *
 * ON A MATCH the record is CONSUMED — removed — and the event is dropped from
 * the batch. ONE RECORD SUPPRESSES ONE EVENT. Sending the same sentence twice
 * arms two records and suppresses at most two echoes; a stream that echoes
 * once leaves the second record to expire, and a stream that echoes three
 * times renders the third. First-armed record matches first (FIFO).
 *
 * WHAT IS NEVER SUPPRESSED, and each is a named negative the tests must pin:
 *   - a `user_message` on ANY Calf lane, whatever its text;
 *   - a `user_message` whose text differs from every pending record by so much
 *     as one character;
 *   - a `tool_result`, `assistant_text`, or anything else — the type check is
 *     first and the rule reaches nothing else;
 *   - anything at all when no `send` has happened.
 *
 * THE RESIDUAL, STATED RATHER THAN HIDDEN. In 'inline' routing mode every
 * event carries the Matriarch's laneId, so a Calf prompt echo passes check 2.
 * It is still protected by check 3 and by one-shot consumption: it would have
 * to be character-identical to something the user typed within the last minute
 * and not yet consumed. That is a coincidence, not a mechanism, and it costs
 * one row when it happens. The alternative — no lane check — costs a Calf
 * prompt in 'lanes' mode, which is the normal mode.
 */
export declare function suppressEchoedUserPrompts(
  batch: readonly NewEvent[],
  matriarchLaneId: LaneId | undefined,
  pending: PendingEcho[],
  nowMs: number,
): NewEvent[];

/**
 * PURE, TOTAL, ORDER-PRESERVING, and its output is a SUBSEQUENCE of `batch` —
 * the same three properties `filterTranscriptEvents` carries, for the same
 * reason. `pending` is the one thing it mutates, and it mutates it only by
 * removing consumed and expired records.
 *
 * `matriarchLaneId === undefined` suppresses NOTHING. Safe direction.
 */

// ---------------------------------------------------------------------------
// 3. What must NOT change
// ---------------------------------------------------------------------------

/**
 * NOT THE ROUTER. `src/main/lane/**` is byte-unchanged. `tests/router/**`
 * passes unmodified.
 *
 * NOT THE STORE. `src/main/store/**` is byte-unchanged. No new column, no new
 * index, no migration. `user_message` is already a valid `EventType` and the
 * schema already accepts it.
 *
 * NOT THE IPC SURFACE. `src/shared/contracts/**`, `src/preload/**` and
 * `src/main/ipc/**` are byte-unchanged. `pods.send` keeps its signature and
 * its channel name.
 *
 * NOT THE RENDERER. `src/renderer/**` is byte-unchanged BY THIS TASK. The
 * event arrives through the existing push and renders through the existing
 * `user_message` case.
 *
 * NOT `highWaterSeq` OR `unreadEventCount`. The appended event is an event
 * like any other: it takes a `seq`, it is pushed, and the state layer counts
 * it the way it counts everything. Nothing here special-cases it, and nothing
 * here may.
 */
export type UnchangedByThisTask = NormalizedEvent;
