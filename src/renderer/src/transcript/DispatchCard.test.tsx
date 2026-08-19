// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DispatchCard, dispatchedLaneIdOf, isDispatchEvent } from './DispatchCard';
import { buildLaneIndex, collectDispatchedLanes } from './lane-index';
import { makeCalf, makeDispatchEvent, makeEvent } from './test-fixtures';

afterEach(cleanup);

describe('dispatch detection (AC8)', () => {
  // The dispatch tool is `Agent` on CLI 2.1.235 and `Task` on older ones. A
  // check written against either NAME alone opens zero cards on the other CLI,
  // silently. Detection is `payload.dispatchedLaneId !== undefined`, full stop.
  it.each(['Agent', 'Task', 'SomeFutureRename', ''])(
    'detects a dispatch regardless of the tool name %j',
    (name) => {
      const event = makeDispatchEvent(1, name, 'lane-calf-1');
      expect(dispatchedLaneIdOf(event)).toBe('lane-calf-1');
      expect(isDispatchEvent(event)).toBe(true);
    },
  );

  it("does NOT treat a tool_use named 'Agent' with no dispatchedLaneId as a dispatch", () => {
    const event = makeEvent(1, { type: 'tool_use', toolUseId: 't', name: 'Agent', input: {} });
    expect(dispatchedLaneIdOf(event)).toBeUndefined();
    expect(isDispatchEvent(event)).toBe(false);
  });

  it("does NOT treat a tool_use named 'Task' with no dispatchedLaneId as a dispatch", () => {
    const event = makeEvent(1, { type: 'tool_use', toolUseId: 't', name: 'Task', input: {} });
    expect(isDispatchEvent(event)).toBe(false);
  });

  it('ignores every non-tool_use event', () => {
    expect(isDispatchEvent(makeEvent(1, { type: 'assistant_text', text: 'Agent' }))).toBe(false);
    expect(isDispatchEvent(makeEvent(2, { type: 'system', subtype: 'Task', data: null }))).toBe(false);
  });
});

describe('DispatchCard (AC7)', () => {
  const event = makeDispatchEvent(7, 'Agent', 'lane-calf-1');

  it('reads "dispatched 3 agents" for a three-agent dispatch, one row per lane', () => {
    const lanes = [
      makeCalf('lane-calf-1', { subagentType: 'reviewer', status: 'running' }),
      makeCalf('lane-calf-2', { subagentType: 'tester', status: 'done' }),
      makeCalf('lane-calf-3', { subagentType: 'writer', status: 'orphaned' }),
    ];
    render(<DispatchCard event={event} lanes={lanes} onJumpToLane={() => undefined} />);

    expect(screen.getByTestId('dispatch-card').textContent).toContain('dispatched 3 agents');

    const rows = screen.getAllByTestId('dispatch-card-agent');
    expect(rows).toHaveLength(3);
    expect(rows.map((el) => el.getAttribute('data-lane-id'))).toEqual([
      'lane-calf-1',
      'lane-calf-2',
      'lane-calf-3',
    ]);
  });

  it('carries each lane status as a word, not only a hue', () => {
    const lanes = [
      makeCalf('lane-calf-1', { status: 'running' }),
      makeCalf('lane-calf-2', { status: 'done' }),
      makeCalf('lane-calf-3', { status: 'orphaned' }),
    ];
    render(<DispatchCard event={event} lanes={lanes} onJumpToLane={() => undefined} />);
    const rows = screen.getAllByTestId('dispatch-card-agent');
    expect(rows[0]!.textContent).toContain('Running');
    expect(rows[1]!.textContent).toContain('Done');
    expect(rows[2]!.textContent).toContain('Orphaned');
  });

  it('calls onJumpToLane with the clicked row lane id, from a keyboard-operable button', () => {
    const onJumpToLane = vi.fn();
    const lanes = [makeCalf('lane-calf-1'), makeCalf('lane-calf-2')];
    render(<DispatchCard event={event} lanes={lanes} onJumpToLane={onJumpToLane} />);

    const rows = screen.getAllByTestId('dispatch-card-agent');
    for (const row of rows) expect(row.tagName).toBe('BUTTON');

    fireEvent.click(rows[1]!);
    expect(onJumpToLane).toHaveBeenCalledTimes(1);
    expect(onJumpToLane).toHaveBeenCalledWith('lane-calf-2');
  });

  it('renders its count with no rows rather than disappearing when lanes is empty (AC9)', () => {
    render(<DispatchCard event={event} lanes={[]} onJumpToLane={() => undefined} />);
    const card = screen.getByTestId('dispatch-card');
    expect(card).toBeTruthy();
    expect(card.textContent).toContain('dispatched 1 agents');
    expect(within(card).queryByTestId('dispatch-card-agent')).toBeNull();
  });
});

describe('lane index resolution', () => {
  /**
   * THE INDEX COMES FROM THE POD'S LANE REGISTRY, NOT FROM ONE PANE'S EVENTS.
   * `lane-router.ts` stamps a Calf's `lane_opened` with the Calf's own laneId
   * and `store.ts` buckets by that id, so a Matriarch pane never sees it. The
   * fixtures below reflect that: they hand over lanes, never events.
   */
  it('indexes the registry by lane id, carrying each lane current status', () => {
    const index = buildLaneIndex([
      makeCalf('lane-calf-1', { status: 'done' }),
      makeCalf('lane-calf-2', { status: 'running' }),
    ]);
    expect(index.get('lane-calf-1')?.status).toBe('done');
    expect(index.get('lane-calf-2')?.status).toBe('running');
    expect(index.has('lane-unknown')).toBe(false);
  });

  it('collects a dispatch subtree in registry (rail) order', () => {
    const index = buildLaneIndex([
      makeCalf('lane-a'),
      makeCalf('lane-b', { parentLaneId: 'lane-a', depth: 2 }),
      makeCalf('lane-c', { parentLaneId: 'lane-b', depth: 3 }),
      // Unrelated sibling under the Matriarch.
      makeCalf('lane-z'),
    ]);
    expect(collectDispatchedLanes(index, 'lane-a').map((l) => l.id)).toEqual([
      'lane-a',
      'lane-b',
      'lane-c',
    ]);
    expect(collectDispatchedLanes(index, 'lane-missing')).toEqual([]);
  });

  it('resolves nothing for a lane the registry has not caught up with yet', () => {
    expect(collectDispatchedLanes(buildLaneIndex([]), 'lane-calf-1')).toEqual([]);
  });
});
