import type { Lane, LaneId } from '@shared/contracts/events';

/**
 * Index the Pod's lane registry by LaneId.
 *
 * THE INDEX IS BUILT FROM THE REGISTRY, NOT FROM `view.events`. An earlier
 * version of this module walked the pane's own `lane_opened` / `lane_closed`
 * events, which is unreachable in production: `store.ts` buckets events by
 * `event.laneId`, and `lane-router.ts` `materialize()` stamps a Calf's
 * `lane_opened` with the new Calf's OWN laneId. The Matriarch's stream holds
 * the dispatching `tool_use` and never the `lane_opened`, so the index was
 * always empty and every dispatch card silently degraded to count-only.
 *
 * `TranscriptPaneProps.lanes` carries the registry for exactly this reason —
 * see the amendment comment there. It also carries each lane's CURRENT status,
 * refreshed on every `laneChanged` push, which a replayed `lane_closed` in one
 * pane's stream could never provide for a lane that is not that pane's lane.
 */
export function buildLaneIndex(lanes: readonly Lane[]): Map<LaneId, Lane> {
  const index = new Map<LaneId, Lane>();
  for (const lane of lanes) index.set(lane.id, lane);
  return index;
}

/**
 * The lanes one dispatch is responsible for: the lane it opened, plus every
 * lane descended from it through `parentLaneId`.
 *
 * DECISION THE CONTRACT DID NOT SETTLE. `ToolUsePayload.dispatchedLaneId` is
 * singular, but `DispatchCardProps.lanes` is an array described as "lanes this
 * dispatch opened, in rail order", and spec 5.2 asks the card to read
 * "dispatched N agents". Those reconcile if N counts the dispatch's subtree —
 * a Calf that dispatches its own Calf did, transitively, come from this
 * dispatch.
 *
 * NOTE FOR GATE 3. With the registry as the source, this transitive walk is now
 * genuinely reachable, where before it could only ever see one pane's stream. A
 * grandchild lane therefore appears under BOTH its parent's card and the
 * Matriarch's card. Whether the count should be direct children only is an open
 * advisory finding, deliberately not decided in this round.
 *
 * Order follows `lanes` insertion order, which is the rail's order: the state
 * layer sorts `LaneRowVm[]` before the pane ever sees it.
 */
export function collectDispatchedLanes(index: Map<LaneId, Lane>, rootLaneId: LaneId): Lane[] {
  const root = index.get(rootLaneId);
  if (root === undefined) return [];

  const collected: Lane[] = [root];
  const seen = new Set<LaneId>([rootLaneId]);

  let grew = true;
  while (grew) {
    grew = false;
    for (const lane of index.values()) {
      if (seen.has(lane.id)) continue;
      if (lane.parentLaneId === null) continue;
      if (!seen.has(lane.parentLaneId)) continue;
      seen.add(lane.id);
      collected.push(lane);
      grew = true;
    }
  }

  return collected;
}
