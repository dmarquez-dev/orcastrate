/**
 * The echo guard: one pending record per `send`, and the predicate that lets an
 * SDK echo of the user's own prompt be dropped without ever deleting a Calf's
 * opening prompt.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS FIVE CONDITIONS AND NOT ONE
 * ---------------------------------------------------------------------------
 * Every `user` message in `tests/fixtures/protocol/*.ndjson` was inspected
 * before this file was written. The seven that sit on the Matriarch lane
 * (`parent_tool_use_id: null`) are ALL tool_result carriers — not one is a text
 * block. The seven that carry a TEXT block ALL have a non-null
 * `parent_tool_use_id`: they are CALF OPENING PROMPTS, the first row of a
 * dispatched subagent's transcript, and `01-parallel-dispatch.ndjson` lines 5
 * and 8 carry text identical to each other.
 *
 * So the rule this module implements guards against a behaviour this repository
 * has never observed, and the only `user` text blocks that DO exist are content
 * that must never be suppressed. "Drop a `user_message` matching something we
 * sent" would delete a Calf's opening prompt from the only copy that exists.
 *
 * ---------------------------------------------------------------------------
 * EVERY BOUND FAILS TOWARD OVER-SHOWING
 * ---------------------------------------------------------------------------
 * A missed suppression shows the user their own sentence twice: ugly,
 * immediately visible, readable past. An over-eager suppression deletes a row
 * from a durable store: invisible, undiagnosable, unrecoverable. The cap drops
 * the OLDEST record, an unreadable timestamp counts as EXPIRED, an undefined
 * Matriarch lane suppresses NOTHING, and consumption is one-shot.
 */

import type { LaneId, NewEvent, Timestamp } from '../../shared/contracts/events';

/**
 * One record per `send`, held on the `PodSession` — per Pod, never
 * module-global, never static. Two Pods sending the same sentence must not
 * interfere, and the record must die with the session.
 */
export interface PendingEcho {
  /** The text as it was appended, byte for byte. */
  text: string;
  /** `seq` of the event this `send` appended. Diagnostics and expiry. */
  appendedSeq: number;
  /** The manager's injected clock at append time. */
  at: Timestamp;
}

/**
 * How many unconsumed records a session keeps. An eleventh `send` with ten
 * still outstanding drops the OLDEST — whose echo, if one ever arrives, is
 * then RENDERED.
 *
 * A cap exists at all because an unbounded list on a long-running session is a
 * leak whose only symptom is a suppression firing an hour after the send that
 * armed it.
 */
export const PENDING_ECHO_CAP = 10;

/**
 * A record this old is dropped without being consumed.
 *
 * Chosen, not measured: no echo has been observed at all, so there is no
 * latency to size against. Any bound is better than none, and every miss it
 * causes over-shows. If an echo is ever seen arriving later than this, raise
 * the number — do not remove the bound.
 */
export const PENDING_ECHO_TTL_MS = 60_000;

/**
 * Arms a record, evicting the oldest once the cap is reached.
 *
 * `shift`, not `pop`: the oldest record is the one whose echo is least likely
 * still to be in flight, and dropping it costs at most one duplicated row.
 */
export function armPendingEcho(pending: PendingEcho[], record: PendingEcho): void {
  pending.push(record);
  while (pending.length > PENDING_ECHO_CAP) pending.shift();
}

/**
 * AT OR PAST the TTL counts as expired, and so does a record whose timestamp —
 * or the current clock — will not parse. Both readings drop the record, which
 * over-shows. The alternative (`NaN > TTL` is `false`) would keep an
 * unreadable record alive forever and let it suppress, which is the direction
 * that loses content.
 */
function isExpired(record: PendingEcho, nowMs: number): boolean {
  const at = Date.parse(record.at);
  if (!Number.isFinite(at) || !Number.isFinite(nowMs)) return true;
  return nowMs - at >= PENDING_ECHO_TTL_MS;
}

/**
 * THE PREDICATE, applied to the ROUTER'S OUTPUT BATCH before it reaches the
 * manager's single append path — never inside that path, which is also the
 * route the appended prompt itself takes and which must not filter its own
 * event.
 *
 * `event.laneId` is read AS THE ROUTER PRODUCED IT, before the manager's
 * unknown-lane restamping. Restamping moves an unknown Calf's events onto the
 * Matriarch; checking after it would put a Calf's prompt into the candidate set
 * for no reason.
 *
 * AN EVENT IS SUPPRESSED IF, AND ONLY IF, ALL FIVE HOLD:
 *   1. `event.payload.type === 'user_message'`;
 *   2. `event.laneId` is the Pod's Matriarch lane;
 *   3. a pending record's `text` is EXACTLY equal (`===`, raw string — no trim,
 *      no case fold, no whitespace collapse, no prefix, no similarity);
 *   4. that record has not expired;
 *   5. that record has not already been consumed.
 *
 * ON A MATCH the record is consumed and the event is dropped. ONE RECORD
 * SUPPRESSES ONE EVENT, first-armed first (FIFO). Sending the same sentence
 * twice arms two records; a stream that echoes three times renders the third.
 *
 * PURE, TOTAL, ORDER-PRESERVING, and its output is a SUBSEQUENCE of `batch`.
 * `pending` is the one thing it mutates, and only by removing consumed and
 * expired records.
 *
 * `matriarchLaneId === undefined` suppresses NOTHING.
 */
export function suppressEchoedUserPrompts(
  batch: readonly NewEvent[],
  matriarchLaneId: LaneId | undefined,
  pending: PendingEcho[],
  nowMs: number,
): NewEvent[] {
  if (pending.length === 0) return [...batch];

  // Expiry is housekeeping and runs whatever the batch holds, so a record armed
  // by a send that was never echoed cannot sit there waiting to suppress an
  // unrelated event much later.
  for (let index = pending.length - 1; index >= 0; index -= 1) {
    const record = pending[index];
    if (record !== undefined && isExpired(record, nowMs)) pending.splice(index, 1);
  }

  if (matriarchLaneId === undefined || pending.length === 0) return [...batch];

  const kept: NewEvent[] = [];
  for (const event of batch) {
    if (event.payload.type !== 'user_message' || event.laneId !== matriarchLaneId) {
      kept.push(event);
      continue;
    }
    const text = event.payload.text;
    // FIFO: `pending` is append-ordered, so the first index matching is the
    // first record armed.
    const match = pending.findIndex((record) => record.text === text);
    if (match === -1) {
      kept.push(event);
      continue;
    }
    pending.splice(match, 1);
  }
  return kept;
}
