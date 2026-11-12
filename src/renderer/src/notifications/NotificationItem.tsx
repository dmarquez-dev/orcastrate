/**
 * One notification. Presentation only: it takes a kind, a message, an
 * optional action and the callbacks for its controls, and knows nothing about
 * the provider's queue or timers.
 *
 * ACCESSIBILITY FLOOR, "colour is never the only carrier of meaning": the kind
 * decides a hue AND a mono glyph, the `helm/Notice.tsx` idiom. The glyph is
 * `aria-hidden` because the message already says what happened.
 *
 * The message element holds nothing but `message`, rendered as given. For a
 * non-empty message its first child is the one Text node React renders; for an
 * empty message it has no child nodes and its `textContent` is `''`. The
 * dismiss control is its sibling, never inside it.
 *
 * ACTION CONTROL. When `action` is given, a native `<button type="button">`
 * whose text is `action.label` sits as a sibling of the message element,
 * between it and the dismiss control, never inside the message. Its label is
 * its whole accessible name, and its `aria-describedby` names the message
 * element, which gets an `id` only then, so several controls sharing a label
 * each say which notification they act on. Without `action` the item has
 * exactly the marker, the message element (no `id`) and the dismiss control.
 */

import { useId, type JSX, type Ref } from 'react';

import styles from './Notifications.module.css';
import { NOTIFICATION_TEST_IDS, type NotificationAction, type NotificationKind } from './types';

const MARKERS: Readonly<Record<NotificationKind, string>> = {
  error: '!',
  info: 'i',
  success: '✓',
};

const ROLES: Readonly<Record<NotificationKind, 'alert' | 'status'>> = {
  error: 'alert',
  info: 'status',
  success: 'status',
};

export interface NotificationItemProps {
  kind: NotificationKind;
  message: string;
  /** Absent: no action control and no `id` on the message element. */
  action?: NotificationAction;
  dismissRef: Ref<HTMLButtonElement>;
  onDismiss(): void;
  /** Called when the action control is activated; the provider calls `action.onAction`. */
  onAction(): void;
}

export function NotificationItem({
  kind,
  message,
  action,
  dismissRef,
  onDismiss,
  onAction,
}: NotificationItemProps): JSX.Element {
  const messageId = useId();
  return (
    <div
      className={[styles.item, styles[kind]].join(' ')}
      data-kind={kind}
      data-testid={NOTIFICATION_TEST_IDS.item}
    >
      <span aria-hidden="true" className={styles.marker}>
        {MARKERS[kind]}
      </span>
      <p
        className={styles.message}
        id={action === undefined ? undefined : messageId}
        role={ROLES[kind]}
      >
        {message}
      </p>
      {action === undefined ? null : (
        <button
          aria-describedby={messageId}
          className={styles.action}
          onClick={onAction}
          type="button"
        >
          {action.label}
        </button>
      )}
      <button
        aria-label="Dismiss notification"
        className={styles.dismiss}
        data-testid={NOTIFICATION_TEST_IDS.dismiss}
        onClick={onDismiss}
        ref={dismissRef}
        type="button"
      >
        <span aria-hidden="true">×</span>
      </button>
    </div>
  );
}
