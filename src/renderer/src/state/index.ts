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

/**
 * NOTE: `isPodOpen` is deliberately NOT re-exported here. This barrel exports
 * exactly the runtime surface the frozen contract declares — a test pins that
 * — and openness is not part of it: a view reads `PodTabVm.opened`, which IS
 * that function applied once. The function itself stays on
 * `./workspace-provider` for the tests that sweep every status through it.
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
  useSlashCommands,
  useAutoModeSupport,
  useWorkspaceActions,
} from './workspace-provider';

/**
 * The panel hooks the frozen `../contracts/renderer-panels.ts` declares. Same
 * rule: the types stay owned by the contract, the implementations stay
 * replaceable behind this barrel, and T6/T7 never see the bridge.
 */
export {
  useBeachcomber,
  useBeachcomberActions,
  useHelm,
  useHelmActions,
} from './panel-provider';

export { steerPrefill } from './steer';
