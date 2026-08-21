/**
 * The resume fallback — its vocabulary and its one fixed sentence.
 *
 * Reproduced by hand against the built app on 2026-08-20: ask a question, close
 * the Pod, open it again, ask what the previous question was, and Claude Code
 * answers that this is the start of the conversation. `openPod` started every
 * Pod fresh while only `reconnectPod` passed the SDK's `resume` option, so the
 * routine close-then-reopen flow lost Claude Code's context every time. Design
 * section 4.2 defines `resume` as "the session id, set when reopening a
 * persisted Pod", and section 4.4 says a resume mismatch degrades to "CC
 * remembers more than the UI shows", never to data loss. The shipped behaviour
 * was the opposite mismatch.
 *
 * Open now resumes. That makes the stored `ccSessionId` load-bearing on the
 * common path, and Claude Code can legitimately refuse it — the conversation
 * may have been cleaned off disk, or written by a CLI that no longer recognises
 * it. Refusing to open the Pod for that reason would be worse than the defect,
 * so `PodManager` retries ONCE without `resume` and records this notice.
 *
 * This file holds only the vocabulary — the subtype, the reason sentence and
 * the payload shape — the way `startup-reconciliation.ts` does, so the
 * behaviour stays in `PodManager` where the store and the push surface live.
 *
 * Nothing here is a new `EventType` and nothing here is a migration.
 * `SystemPayload.subtype` is a free `string` by contract, so the durable record
 * rides the existing `system` event and anything that renders a `system` event
 * today renders this one.
 */

import type { PodId, Timestamp } from '../../shared/contracts/events';

/**
 * `SystemPayload.subtype` for the fallback notice. A free string by contract
 * (`events.ts`), so `EventType` and `EVENT_TYPES` are untouched.
 */
export const RESUME_FALLBACK_SUBTYPE = 'resume_fallback' as const;

/**
 * EXACT TEXT, rendered verbatim, and pinned by a test.
 *
 * Fixed rather than free so two Pods that fell back read identically and the
 * wording cannot drift. It states what happened and what it costs the user, it
 * blames nobody, and it is written to be true only of the case it is written
 * for: it is appended only AFTER a fresh session has actually come up. A retry
 * that also fails beaches the Pod and writes nothing.
 *
 * It names the asymmetry deliberately. Orcastrate's transcript is intact — that
 * is the half the user can see, and without this sentence its presence would
 * imply Claude Code still has the context it no longer has.
 */
export const RESUME_FALLBACK_REASON =
  'Claude Code could not resume the previous conversation for this Pod, so ' +
  'this Pod was started as a new conversation. The transcript above is the ' +
  'record Orcastrate keeps and is unchanged; Claude Code itself no longer ' +
  'has those earlier messages in context.';

/** `SystemPayload.data` for the fallback notice. */
export interface ResumeFallbackData {
  subtypeMarker: typeof RESUME_FALLBACK_SUBTYPE;
  /** Always `RESUME_FALLBACK_REASON`. */
  reason: string;
  podId: PodId;
  /**
   * The session id the CLI refused. Kept because it is the only record that
   * this Pod's history is split across two Claude Code sessions, and the Pod
   * row's own `ccSessionId` is overwritten by the fresh session moments later.
   */
  abandonedCcSessionId: string;
  /** The CLI's own rejection wording, for diagnosis. Not shown as the reason. */
  detail: string;
  at: Timestamp;
}
