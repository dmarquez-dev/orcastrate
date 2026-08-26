/**
 * CONTRACT — the `podEvent` push that `#stopRunningLanes` does not make.
 * Frozen at Gate 2.
 *
 * Boundary between T1 (the only task that edits `#stopRunningLanes`) and T3
 * (the joined proof, which reads the pushed event off the rendered transcript).
 * T2 does not consume this file; it consumes `stop-notice-visibility.ts`.
 *
 * THE DEFECT, confirmed by hand in a real Electron window on 2026-08-26 —
 * stop pressed, transcript empty — and traced twice by reading source before
 * that. It is half of one user-visible outcome; the other half is the filter,
 * and neither half alone puts a word on the screen.
 *
 *   `PodManager.#stopRunningLanes` (`src/main/pod-manager/pod-manager.ts`)
 *   appends one `lane_closed` per swept lane through
 *   `this.#store.appendMany(...)`, DISCARDS the return value, and then pushes
 *   `laneChanged` and nothing else. No `podEvent` is ever emitted for those
 *   events. The renderer's backfill short-circuits on `hasMore === false`, so
 *   the events are durable in SQLite and invisible on screen for the life of
 *   the session — they surface only when the transcript is next re-read.
 *
 * This was found at the previous session's Gate 3, recorded there as escalation
 * E3, and carried to the backlog by user decision. It closes here.
 */

import type { NormalizedEvent, PodId } from '../../../../src/shared/contracts/events';

// ===========================================================================
// 1. The precedent, which is exact and is in the same file
// ===========================================================================

/**
 * `#appendResumeFallbackNotice` (`pod-manager.ts`, ~line 723) is the shape to
 * follow, verbatim in structure:
 *
 *     const stored = this.#store.appendMany([ ... ]);
 *     this.#push.podEvent({ podId, events: stored });
 *
 * and its docblock states the reason this contract exists:
 *
 *     "Unlike the boot sweep this DOES push: a window exists by now, the Pod
 *      the user is looking at just came up, and without the push the
 *      explanation would not appear until the transcript was next re-read."
 *
 * Every clause of that sentence is true of a deliberate stop. The user is
 * looking at the Pod they just pressed Stop on.
 *
 * ALREADY VERIFIED — DO NOT RE-DERIVE, but DO confirm before relying on it:
 *
 *   - `EventStore.appendMany` returns `NormalizedEvent[]`
 *     (`src/shared/contracts/event-store.ts:201`, implemented at
 *     `src/main/store/sqlite-event-store.ts:366`). Capturing the return value
 *     is the entire mechanical content of the fix; the current code throws it
 *     away.
 *   - The renderer already has a live `podEvent` handler that merges
 *     head-of-stream events (`src/renderer/src/state/store.ts:287` ->
 *     `onPodEvent`, `src/renderer/src/state/merge.ts`). NO RENDERER WORK IS
 *     NEEDED FOR THE ARRIVAL HALF, and none is assigned.
 */
export interface StopEventPush {
  podId: PodId;
  /**
   * EXACTLY what `appendMany` returned, in that order, unmodified. Not a
   * re-read of the store, not a hand-built array: the stored rows carry the
   * `seq` and `id` the store assigned, and the renderer's merge dedupes on
   * them. One `lane_closed` per swept lane, each on its own lane's id, all
   * carrying the sweep's single `createdAt`.
   */
  events: readonly NormalizedEvent[];
}

// ===========================================================================
// 2. WHERE the push goes — decided here so two tasks cannot disagree
// ===========================================================================

/**
 * THE OPEN QUESTION, DECIDED. The push order inside `#stopRunningLanes` is
 * FIXED BY THIS CONTRACT, because T3 asserts against the resulting sequence and
 * an implementer's free choice would make that assertion arbitrary.
 *
 *     const stored = this.#store.appendMany([ ... ]);
 *     this.#push.podEvent({ podId, events: stored });        // <- NEW, HERE
 *     this.#push.laneChanged({ podId, lanes: this.#store.listLanes(podId) });
 *
 * `podEvent` goes IMMEDIATELY AFTER the `appendMany` and BEFORE the existing
 * `laneChanged`. THE REASON, and it must be written as a comment at the call
 * site rather than left in this file:
 *
 *   The push is bound to the write it publishes. Adjacent to the `appendMany`
 *   whose return value it carries, "append and forget to push" is not a state
 *   the code can be left in — which is exactly the state it was left in, and
 *   the whole defect. Put three statements away, at the bottom of the method,
 *   it becomes separable again by the next edit.
 *
 * WHAT THIS ORDERING DOES NOT DISTURB, and the reason it is safe to insert
 * here at all: the existing guarantee is about `#stopRunningLanes` as a WHOLE
 * finishing before `closePod` pushes `podStatus` — `closePod`'s comment says a
 * renderer that saw the Pod closed while the rail still said Running would show
 * the disagreement the sweep exists to remove. Both pushes are inside the
 * sweep, so both still precede `podStatus`. That property is preserved, and
 * `tests/unit/pod-manager/close-pod-lane-sweep.test.ts`'s existing
 * "criterion 3" ordering test must keep passing WITHOUT being weakened to
 * accommodate a third channel: it indexes `laneChanged` and `podStatus` within
 * the recorded order, and an interleaved `podEvent` does not move either.
 */
export const POD_EVENT_PUSH_PRECEDES_LANE_CHANGED = true;

// ===========================================================================
// 3. Idempotence — the guarantee the fix must not break
// ===========================================================================

/**
 * A SECOND `closePod` SWEEPS NOTHING, SO IT MUST PUSH NOTHING — including
 * nothing on `podEvent`.
 *
 * The early `return` when `stoppedLaneIds.length === 0` is what delivers this
 * today, and the `podEvent` push MUST be placed AFTER that return, alongside
 * the `appendMany` it publishes. A push hoisted above the guard would emit an
 * empty `events: []` on every redundant close, and the renderer's merge would
 * be handed nothing to merge on a channel that is supposed to mean "something
 * arrived".
 *
 * The method's docblock already states the guarantee in the terms a test must
 * check it in: no `ended_at` restamped, no second `lane_closed` appended, no
 * throw, and now — no second `podEvent`. `close-pod-lane-sweep.test.ts`'s
 * existing idempotence test already counts `laneChanged` pushes across the
 * second close; the `podEvent` count belongs in the same assertion.
 *
 * THE BEACHED GUARD IS UNTOUCHED AND IS NOT WIDENED. A beached Pod's lanes are
 * not swept, so nothing is appended and nothing is pushed. That is the existing
 * behaviour and this contract asks for no change to it.
 */
export interface StopPushIdempotence {
  noSecondPodEventPush: true;
  noEmptyPodEventPush: true;
}

// ===========================================================================
// 4. What is NOT in scope for T1
// ===========================================================================

/**
 * `#appendReconciliationEvents` (the boot sweep) DELIBERATELY DOES NOT PUSH,
 * and this session does not change that. Its reason is recorded in its own
 * docblock: at boot there is no window to push to. Adding a push there would be
 * an opportunistic change to a second code path inside one diff, and would make
 * a failure impossible to attribute.
 *
 * `LaneRouter.closeLane` and `#closeLaneRow` are not touched either. They write
 * `'done' | 'orphaned'`, they are not the stop path, and their events are not
 * what this session makes visible.
 */
export declare const OUT_OF_SCOPE_FOR_T1: readonly [
  '#appendReconciliationEvents',
  'LaneRouter.closeLane',
  '#closeLaneRow',
];
