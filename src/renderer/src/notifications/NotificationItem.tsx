/**
 * One notification. Presentation only: it takes a kind, a message and a
 * dismiss callback, and knows nothing about the provider's queue or timers.
 *
 * ACCESSIBILITY FLOOR, "colour is never the only carrier of meaning": the kind
 * decides a hue AND a mono glyph, the `helm/Notice.tsx` idiom. The glyph is
 * `aria-hidden` because the message already says what happened.
 *
 * The message element holds nothing but `message`, rendered as given. For a
 * non-empty message its first child is the one Text node React renders; for an
 * empty message it has no child nodes and its `textContent` is `''`. The
 * dismiss control is its sibling, never inside it.
 */

import type { JSX, Ref } from 'react';

import styles from './Notifications.module.css';
import { NOTIFICATION_TEST_IDS, type NotificationKind } from './types';

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
  dismissRef: Ref<HTMLButtonElement>;
  onDismiss(): void;
}

export function NotificationItem({
  kind,
  message,
  dismissRef,
  onDismiss,
}: NotificationItemProps): JSX.Element {
  return (
    <div
      className={[styles.item, styles[kind]].join(' ')}
      data-kind={kind}
      data-testid={NOTIFICATION_TEST_IDS.item}
    >
      <span aria-hidden="true" className={styles.marker}>
        {MARKERS[kind]}
      </span>
      <p className={styles.message} role={ROLES[kind]}>
        {message}
      </p>
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
