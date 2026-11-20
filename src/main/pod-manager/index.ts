/**
 * Public surface of the pod-manager module. Consumers (the IPC handlers and
 * the app bootstrap) import from here, never from the files beneath it.
 */

export { PodManager } from './pod-manager';
export type { PodManagerApi, PodManagerDeps } from './pod-manager';
export {
  armPendingEcho,
  suppressEchoedUserPrompts,
  PENDING_ECHO_CAP,
  PENDING_ECHO_TTL_MS,
} from './pending-echo';
export type { PendingEcho } from './pending-echo';
export { AUTO_MODE_SUPPORT_READ_TIMEOUT_MS, autoModeSupportOf } from './auto-mode-support';
export { createPushes } from './pushes';
export type { Pushes, SendToRenderer } from './pushes';
export { ROUTING_MODE } from './routing-mode';
export {
  normalizeSlashCommands,
  SLASH_COMMANDS_READ_TIMEOUT_MS,
  SlashCommandState,
} from './slash-commands';
export {
  STARTUP_RECONCILIATION_REASON,
  STARTUP_RECONCILIATION_SUBTYPE,
} from './startup-reconciliation';
export { RESUME_FALLBACK_REASON, RESUME_FALLBACK_SUBTYPE } from './resume-fallback';
export type { ResumeFallbackData } from './resume-fallback';
export type {
  ReconciledPod,
  StartupReconciler,
  StartupReconciliation,
  StartupReconciliationData,
} from './startup-reconciliation';
