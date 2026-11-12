/**
 * The in-app notification region's public surface. Consumers import from
 * this file and from nowhere else under `notifications/`.
 *
 * It exports the types `NotificationAction`, `NotificationKind`,
 * `NotificationProviderProps`, `NotificationRequest` and `Notifier`; the
 * value `NOTIFICATION_TEST_IDS`; and `NotificationProvider` and `useNotify`.
 */

export type {
  NotificationAction,
  NotificationKind,
  NotificationProviderProps,
  NotificationRequest,
  Notifier,
} from './types';
export { NOTIFICATION_TEST_IDS } from './types';
export { NotificationProvider, useNotify } from './NotificationProvider';
