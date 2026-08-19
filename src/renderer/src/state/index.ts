/**
 * The workspace state layer — the renderer's ONLY caller of
 * `window.orcastrate`.
 *
 * This barrel exports exactly the runtime surface the frozen contract
 * `../contracts/renderer-state.ts` declares, and nothing else. Types come from
 * the contract, not from here: a consumer writes
 *
 *   import { useLaneRail } from '../state';
 *   import type { LaneRowVm } from '../contracts/renderer-state';
 *
 * so the types stay owned by the frozen file and the implementation stays
 * replaceable behind it.
 */

export {
  WorkspaceProvider,
  useWorkspace,
  usePods,
  usePodSession,
  useLaneRail,
  useTranscript,
  useComposer,
  usePermissionCards,
  useWorkspaceActions,
} from './workspace-provider';

export { steerPrefill } from './steer';
