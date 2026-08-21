/**
 * Public surface of the pod-manager module. Consumers (the IPC handlers and
 * the app bootstrap) import from here, never from the files beneath it.
 */

export { PodManager } from './pod-manager';
export type { PodManagerApi, PodManagerDeps } from './pod-manager';
export { createPushes } from './pushes';
export type { Pushes, SendToRenderer } from './pushes';
export { ROUTING_MODE } from './routing-mode';
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
