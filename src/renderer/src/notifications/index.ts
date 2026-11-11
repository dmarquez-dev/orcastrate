/**
 * The in-app notification region's public surface (frozen contract
 * `contracts/notifications.ts`). Consumers import from this file and from
 * nowhere else under `notifications/`.
 */

export type {
  NotificationKind,
  NotificationProviderProps,
  NotificationRequest,
  Notifier,
} from './types';
export { NOTIFICATION_TEST_IDS } from './types';
export { NotificationProvider, useNotify } from './NotificationProvider';
