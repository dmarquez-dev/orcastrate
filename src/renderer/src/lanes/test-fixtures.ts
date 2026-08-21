import type { Lane } from '@shared/contracts/events';

import type { LaneRowVm } from '../contracts/renderer-state';

/**
 * Lane and row fixtures for T6's own suites.
 *
 * `makeStubLane` in `../test-utils` covers `Lane`; this adds the `LaneRowVm`
 * wrapper, which is a T5 view model with no factory of its own.
 */
export function makeLane(overrides: Partial<Lane> = {}): Lane {
  return {
    id: 'lane-matriarch',
    podId: 'pod-1',
    kind: 'matriarch',
    toolUseId: null,
    agentId: null,
    parentLaneId: null,
    depth: 0,
    subagentType: null,
    description: null,
    status: 'running',
    startedAt: '2026-01-01T00:00:00.000Z',
    endedAt: null,
    ...overrides,
  };
}

export function makeCalf(overrides: Partial<Lane> = {}): Lane {
  return makeLane({
    id: 'lane-calf-1',
    kind: 'calf',
    toolUseId: 'toolu_1',
    agentId: 'agent_1',
    parentLaneId: 'lane-matriarch',
    depth: 1,
    subagentType: 'code-reviewer',
    description: 'Review the diff',
    ...overrides,
  });
}

export function makeRow(lane: Lane, overrides: Partial<LaneRowVm> = {}): LaneRowVm {
  return {
    lane,
    isMatriarch: lane.kind === 'matriarch',
    // The three surviving pane fields (`contracts/lane-pin-removal.ts` section
    // 3); the pin-gating fourth went with the pin control it gated. The
    // defaults describe the ordinary rail: the Matriarch occupies the primary
    // pane, no follower is open.
    inPrimaryPane: lane.kind === 'matriarch',
    inFollowerPane: false,
    focusedFollower: false,
    agentType: lane.subagentType ?? 'matriarch',
    description: lane.description,
    status: lane.status,
    elapsedMs: 0,
    unreadEventCount: 0,
    awaitingPermission: false,
    ...overrides,
  };
}
