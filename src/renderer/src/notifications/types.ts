/**
 * The declarations of the frozen notifications contract
 * (`.sir/sessions/20261111-0156-message-alerting/contracts/notifications.ts`),
 * written once here and re-exported from `./index.ts`, the only file any
 * consumer imports. The contract's docblocks are the specification; they are
 * abridged here, not restated.
 */

import type { ReactNode } from 'react';

/**
 * `'error'` persists until dismissed and is never evicted by the transient
 * cap. `'info'` and `'success'` are transient.
 */
export type NotificationKind = 'error' | 'info' | 'success';

export interface NotificationRequest {
  kind: NotificationKind;
  /** Shown verbatim. */
  message: string;
  /** While a live notification carries this key, a second `notify` replaces it in place. */
  key?: string;
}

export interface Notifier {
  /** Adds or replaces a notification. Never moves focus. */
  notify(request: NotificationRequest): void;
  /** Removes the live notification carrying `key`; an unknown key is a no-op. */
  dismiss(key: string): void;
}

export interface NotificationProviderProps {
  children: ReactNode;
  /** Test seam. Lifetime of an `'info'` or `'success'` notification; 6000 ms when omitted. */
  autoDismissMs?: number;
}

export const NOTIFICATION_TEST_IDS = {
  viewport: 'notification-viewport',
  item: 'notification',
  dismiss: 'notification-dismiss',
} as const satisfies {
  readonly viewport: 'notification-viewport';
  readonly item: 'notification';
  readonly dismiss: 'notification-dismiss';
};
