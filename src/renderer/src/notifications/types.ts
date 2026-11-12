/**
 * The notification region's declarations. This file is their single
 * declaration site: every type and constant the region exposes is written
 * here once, and `./index.ts` re-exports them as the only import surface, so
 * no consumer imports this file directly and none re-declares what it holds.
 * The docblocks below state the region's rules in place.
 */

import type { ReactNode } from 'react';

/**
 * `'error'` persists until dismissed and is never evicted by the transient
 * cap. `'info'` and `'success'` are transient.
 */
export type NotificationKind = 'error' | 'info' | 'success';

/**
 * One control on one notification that does something other than dismiss it.
 * It is rendered as a native button beside the message, and activating it
 * removes its item and moves focus exactly as the dismiss control does. It
 * changes nothing about the item's lifetime.
 */
export interface NotificationAction {
  /**
   * The control's visible text and its whole accessible name: the control
   * carries no `aria-label` and no `aria-labelledby`. Rendered verbatim; an
   * empty string is a caller defect, rendered as given without throwing.
   */
  label: string;
  /**
   * Called exactly once per activation of the control, synchronously, after
   * the item's removal has been requested. Its return value is ignored. It
   * must not throw; the provider does not catch, so a caller handing over a
   * store action wraps it as `() => { void actions.x(...); }`.
   */
  onAction: () => void;
}

export interface NotificationRequest {
  kind: NotificationKind;
  /** Shown verbatim. */
  message: string;
  /** While a live notification carries this key, a second `notify` replaces it in place. */
  key?: string;
  /**
   * Optional. When present, the item gets an action control labelled
   * `action.label` (see `NotificationAction`). A keyed replacement replaces
   * the action with the new request's, or removes it when the new request has
   * none. Without `action` the item is unchanged: no action control and no
   * extra attribute on any element.
   */
  action?: NotificationAction;
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
