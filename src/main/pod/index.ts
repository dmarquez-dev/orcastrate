/**
 * Public surface of the pod module. Consumers (T7 IPC handlers, sub-session 2's
 * Pod lifecycle UI) import from here, never from the files beneath it.
 */

export { createPodRunner, createPodRunnerWith, UNROUTED_LANE_ID } from './pod-runner';
export { PodRunnerError, exitCodeFromError } from './errors';
export { defaultSdkBridge } from './sdk-bridge';
export type { SdkBridge, SdkSession } from './sdk-bridge';
export { parseStreamLine, asEnvelope } from './stream';
export type { PodStreamItem } from './stream';
export {
  ALLOWED_PERMISSION_MODES,
  DISPATCH_TOOL_NAMES,
  FOREGROUND_DISPATCH_DIRECTIVE,
  buildEnv,
  buildSdkOptions,
  forceForegroundDispatch,
  isAllowedPermissionMode,
} from './options';
export {
  toPermissionPrompt,
  toPermissionResult,
  InvalidPermissionAnswerError,
} from './permissions';
