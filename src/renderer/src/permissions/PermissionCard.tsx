/**
 * One unanswered permission request, rendered INLINE in the transcript of the
 * lane that asked (spec 5.4). Not a dialog, not an overlay, not focus-trapping:
 * Orcastrate is a multi-Pod window and a modal would block work that has
 * nothing to do with this request.
 *
 * THIS COMPONENT NEVER REMOVES A CARD. Removal belongs to the state layer and
 * happens only on a `permissionResolved` push (frozen `renderer-state.ts`),
 * including outcome `'aborted'`. A failed `respond` leaves the request
 * genuinely unanswered, so the card stays on screen with its buttons live.
 *
 * Internal props — deliberately not in `renderer-view.ts`, which carries only
 * what crosses a task boundary.
 */

import { useId, useRef, useState, type JSX } from 'react';

import type { PermissionCardVm } from '../contracts/renderer-state';
import type { PermissionRespondArgs } from '../contracts/renderer-view';
import { TEST_IDS } from '../contracts/renderer-view';

import styles from './PermissionCards.module.css';

export interface PermissionCardProps {
  card: PermissionCardVm;
  onRespond(req: PermissionRespondArgs): void;
}

/**
 * The tool input, verbatim and uninterpreted. Anything JSON-shaped is pretty
 * printed; anything else (a bare string, a value with a cycle) is shown as
 * text rather than throwing inside a render.
 */
export function formatInput(input: unknown): string {
  if (input === undefined) return '(no input)';
  if (typeof input === 'string') return input;
  try {
    const json = JSON.stringify(input, null, 2);
    return json === undefined ? String(input) : json;
  } catch {
    return String(input);
  }
}

/** `2026-08-19T10:04:31.000Z` -> `10:04:31`. Anything else passes through. */
export function clockTime(timestamp: string): string {
  const match = /T(\d{2}:\d{2}:\d{2})/.exec(timestamp);
  return match?.[1] ?? timestamp;
}

export function PermissionCard({ card, onRespond }: PermissionCardProps): JSX.Element {
  const [reason, setReason] = useState('');
  const headingId = useId();
  const reasonId = useId();
  const denyHintId = useId();
  const cardRef = useRef<HTMLLIElement | null>(null);

  const trimmedReason = reason.trim();
  // Deny stays disabled until there is a real reason. Main answers
  // `INVALID_ARGUMENT` for a missing one, and a button that only exists to
  // produce an error has wasted the interaction.
  const denyReady = trimmedReason.length > 0;
  const busy = card.submitting;

  function respond(decision: PermissionRespondArgs['decision']): void {
    if (busy) return;
    if (decision === 'deny') {
      if (!denyReady) return;
      onRespond({
        podId: card.podId,
        requestId: card.requestId,
        decision: 'deny',
        reason: trimmedReason,
      });
    } else {
      onRespond({ podId: card.podId, requestId: card.requestId, decision });
    }
    // The buttons are about to disable themselves; park focus on the card so
    // it does not fall to the document body, and so the status line that
    // replaces them is what the user lands on.
    cardRef.current?.focus();
  }

  return (
    <li
      ref={cardRef}
      tabIndex={-1}
      className={styles.card}
      data-testid={`${TEST_IDS.permissionCard}:${card.requestId}`}
      data-lane-id={card.laneId}
      aria-labelledby={headingId}
    >
      <div className={styles.header}>
        <span className={styles.kicker}>
          <span className={styles.marker} aria-hidden="true">
            {'[?]'}
          </span>{' '}
          Permission request
        </span>
        <h3 className={styles.tool} id={headingId}>
          {card.toolName}
        </h3>
        <time className={styles.asked} dateTime={card.receivedAt}>
          {clockTime(card.receivedAt)}
        </time>
      </div>

      <pre className={styles.input} data-testid="permission-card-input">
        {formatInput(card.input)}
      </pre>

      <div className={styles.reasonRow}>
        <label className={styles.reasonLabel} htmlFor={reasonId}>
          Reason (required to deny)
        </label>
        <input
          id={reasonId}
          type="text"
          className={styles.reason}
          data-testid={TEST_IDS.permissionDenyReason}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          disabled={busy}
          placeholder="Why this tool must not run"
          aria-describedby={denyHintId}
        />
        <span className={styles.reasonLabel} id={denyHintId}>
          {denyReady ? 'Deny is available.' : 'Deny stays unavailable until you give a reason.'}
        </span>
      </div>

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.action}
          data-testid={TEST_IDS.permissionAllow}
          onClick={() => respond('allow')}
          disabled={busy}
        >
          Allow
        </button>
        <button
          type="button"
          className={styles.action}
          data-testid={TEST_IDS.permissionAllowAlways}
          onClick={() => respond('allow_always')}
          disabled={busy}
        >
          Allow always
        </button>
        <button
          type="button"
          className={`${styles.action} ${styles.deny}`}
          data-testid={TEST_IDS.permissionDeny}
          onClick={() => respond('deny')}
          disabled={busy || !denyReady}
          aria-describedby={denyHintId}
        >
          Deny
        </button>
      </div>

      {busy && (
        <p className={styles.status} data-testid="permission-card-submitting">
          <span className={styles.marker} aria-hidden="true">
            {'[…]'}
          </span>
          Sending your decision…
        </p>
      )}

      {card.error !== null && (
        <p className={styles.error} role="alert" data-testid="permission-card-error">
          <span className={styles.marker} aria-hidden="true">
            {'[x]'}
          </span>
          {card.error.message}
        </p>
      )}
    </li>
  );
}
