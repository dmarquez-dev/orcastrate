/**
 * Acceptance criterion 3 — depth-2 dispatch, asserted against the REAL capture
 * `02-nested-dispatch.ndjson`, not a synthetic fixture.
 *
 * `findings.json` `nesting`: `parent_agent_id` never appears on a streamed SDK
 * message (`parentAgentIdFieldPath: null`); it exists only on the disk-read
 * `SessionMessage`. Depth is recovered by CHAINING `parent_tool_use_id` — a
 * depth-2 Calf's messages point at an `Agent` tool_use block that itself sits in
 * a message whose own `parent_tool_use_id` is non-null.
 *
 * The parent/child relationship is therefore re-derived here straight from the
 * fixture's `parent_tool_use_id` chain and compared to the lane tree the router
 * claims. Every id is read from the capture; none is written down.
 */

import { describe, expect, it } from 'vitest';

import type { Lane } from '../../src/shared/contracts/events';
import { MATRIARCH_LANE_ID, calves, findingFor, fixtureMessages, replay } from './helpers';

const NESTED = '02-nested-dispatch.ndjson';

interface Dispatch {
  /** 1-based line of the assistant message carrying the dispatch block. */
  line: number;
  toolUseId: string;
  /** `parent_tool_use_id` of the message the block sits in; null at the top. */
  dispatchedBy: string | null;
}

/** Every `Agent`/`Task` tool_use in the capture, with the chain link above it. */
function dispatchChain(file: string): Dispatch[] {
  const dispatches: Dispatch[] = [];
  fixtureMessages(file).forEach((message, index) => {
    if (message === null || message['type'] !== 'assistant') return;
    const parent = message['parent_tool_use_id'];
    const inner = message['message'] as { content?: unknown } | undefined;
    const blocks = (Array.isArray(inner?.content) ? inner.content : []) as Record<string, unknown>[];
    for (const block of blocks) {
      if (block['type'] !== 'tool_use') continue;
      if (block['name'] !== 'Agent' && block['name'] !== 'Task') continue;
      dispatches.push({
        line: index + 1,
        toolUseId: block['id'] as string,
        dispatchedBy: typeof parent === 'string' ? parent : null,
      });
    }
  });
  return dispatches;
}

describe('nested dispatch, depth 2 (criterion 3)', () => {
  it('02 is the depth-2 capture findings.json says it is', () => {
    const finding = findingFor(NESTED);
    expect(finding.maxDepth).toBe(2);
    expect(finding.calvesOpened).toBe(2);
  });

  it('the capture contains a dispatch whose own message has a non-null parent_tool_use_id', () => {
    // This is what MAKES it depth 2 on the wire. If a re-probe flattened it,
    // every assertion below would be describing a depth-1 capture.
    const chain = dispatchChain(NESTED);
    expect(chain).toHaveLength(2);
    expect(chain.filter((dispatch) => dispatch.dispatchedBy === null)).toHaveLength(1);
    expect(chain.filter((dispatch) => dispatch.dispatchedBy !== null)).toHaveLength(1);

    const outer = chain.find((dispatch) => dispatch.dispatchedBy === null)!;
    const inner = chain.find((dispatch) => dispatch.dispatchedBy !== null)!;
    // The inner dispatch is dispatched BY the outer one — the chain link.
    expect(inner.dispatchedBy).toBe(outer.toolUseId);
  });

  it('the router builds the parent/child lane relationship the chain implies', () => {
    const chain = dispatchChain(NESTED);
    const outer = chain.find((dispatch) => dispatch.dispatchedBy === null)!;
    const inner = chain.find((dispatch) => dispatch.dispatchedBy !== null)!;

    const replayed = replay(NESTED);
    const parentLane = replayed.router.getLaneByToolUseId(outer.toolUseId);
    const childLane = replayed.router.getLaneByToolUseId(inner.toolUseId);

    expect(parentLane).not.toBeNull();
    expect(childLane).not.toBeNull();
    expect(parentLane!.id).not.toBe(childLane!.id);

    expect(parentLane!.depth).toBe(1);
    expect(parentLane!.parentLaneId).toBe(MATRIARCH_LANE_ID);

    expect(childLane!.depth).toBe(2);
    expect(childLane!.parentLaneId).toBe(parentLane!.id);
  });

  it('the announced lane_opened carries the same relationship, not just the final snapshot', () => {
    const replayed = replay(NESTED);
    const announced = replayed.events
      .filter((event) => event.type === 'lane_opened')
      .map((event) => (event.payload as { lane: Lane }).lane);

    expect(announced).toHaveLength(2);
    const [first, second] = announced as [Lane, Lane];

    // The depth-1 lane is announced first, so a consumer can attach the depth-2
    // lane to a parent it already knows.
    expect(first.depth).toBe(1);
    expect(first.parentLaneId).toBe(MATRIARCH_LANE_ID);
    expect(second.depth).toBe(2);
    expect(second.parentLaneId).toBe(first.id);
  });

  it('the depth-2 Calf owns its own transcript, separate from its parent Calf', () => {
    const chain = dispatchChain(NESTED);
    const inner = chain.find((dispatch) => dispatch.dispatchedBy !== null)!;
    const outer = chain.find((dispatch) => dispatch.dispatchedBy === null)!;

    const replayed = replay(NESTED);
    const childLane = replayed.router.getLaneByToolUseId(inner.toolUseId)!;
    const parentLane = replayed.router.getLaneByToolUseId(outer.toolUseId)!;

    const onChild = replayed.events.filter((event) => event.laneId === childLane.id);
    const onParent = replayed.events.filter((event) => event.laneId === parentLane.id);

    // Content assertions belong on 01/02/03: those captures forward subagent
    // messages. Counts and correlation only — never the model's prose.
    expect(onChild.length).toBeGreaterThan(1);
    expect(onParent.length).toBeGreaterThan(1);
    expect(onChild.some((event) => event.type === 'tool_use')).toBe(true);
    expect(onChild.some((event) => event.type === 'tool_result')).toBe(true);
  });

  it('each lane in the tree has a distinct agent id, correlated by task_started', () => {
    const replayed = replay(NESTED);
    const calfLanes = calves(replayed.lanes);
    const agentIds = calfLanes.map((lane) => lane.agentId);

    expect(agentIds.every((id) => typeof id === 'string' && id.length > 0)).toBe(true);
    expect(new Set(agentIds).size).toBe(calfLanes.length);
  });

  it('the whole tree closes, deepest first, as the capture orders it', () => {
    const replayed = replay(NESTED);
    const closes = replayed.events
      .filter((event) => event.type === 'lane_closed')
      .map((event) => (event.payload as { laneId: string }).laneId);

    const chain = dispatchChain(NESTED);
    const child = replayed.router.getLaneByToolUseId(
      chain.find((dispatch) => dispatch.dispatchedBy !== null)!.toolUseId,
    )!;
    const parent = replayed.router.getLaneByToolUseId(
      chain.find((dispatch) => dispatch.dispatchedBy === null)!.toolUseId,
    )!;

    expect(closes).toEqual([child.id, parent.id]);
    expect(replayed.boundary).toHaveLength(0);
  });

  it('a maxLaneDepth of 1 attaches the depth-2 dispatch to its nearest ancestor lane', () => {
    // The contract's cap: "Deeper dispatches attach to their nearest ancestor
    // lane at this depth." Same real capture, different configuration.
    const replayed = replay(NESTED, { maxLaneDepth: 1 });
    const calfLanes = calves(replayed.lanes);

    expect(calfLanes).toHaveLength(1);
    expect(calfLanes[0]!.depth).toBe(1);
    // The depth-2 Calf's messages still route somewhere real — nothing dropped.
    const chain = dispatchChain(NESTED);
    const inner = chain.find((dispatch) => dispatch.dispatchedBy !== null)!;
    expect(replayed.router.getLaneByToolUseId(inner.toolUseId)!.id).toBe(calfLanes[0]!.id);
  });
});
