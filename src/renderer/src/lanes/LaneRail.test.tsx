// @vitest-environment jsdom
import { Profiler, StrictMode } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { testId } from '../shell/contract-runtime';
import { LaneRail } from './LaneRail';
import { LANE_ROW_SELECT_TEST_ID } from './LaneRow';
import { formatElapsed } from './format-elapsed';
import { makeCalf, makeLane, makeRow } from './test-fixtures';

// `vitest.config.ts` sets `globals: false`, so RTL never installs its own
// auto-cleanup. Register it explicitly rather than importing the barrel for a
// side effect.
afterEach(cleanup);

const noop = () => undefined;

function renderRail(overrides: Partial<Parameters<typeof LaneRail>[0]> = {}) {
  const props = {
    rows: [],
    onSelect: noop,
    onPin: noop,
    onUnpin: noop,
    onSteer: noop,
    routingMode: 'lanes' as const,
    ...overrides,
  };
  return render(<LaneRail {...props} />);
}

describe('LaneRail — a list, not a second tab row (AC1)', () => {
  it('puts the Matriarch first even when the caller shuffles the array', () => {
    const matriarch = makeLane();
    const calfA = makeCalf({ id: 'lane-calf-a', subagentType: 'reviewer', description: 'A' });
    const calfB = makeCalf({ id: 'lane-calf-b', subagentType: 'tester', description: 'B' });

    // Deliberately shuffled: Matriarch last.
    renderRail({
      rows: [makeRow(calfA), makeRow(calfB), makeRow(matriarch)],
    });

    const rows = screen.getAllByTestId(/^lane-row:/);
    expect(rows.map((el) => el.getAttribute('data-testid'))).toEqual([
      'lane-row:lane-matriarch',
      'lane-row:lane-calf-a',
      'lane-row:lane-calf-b',
    ]);
  });

  it('is a list, and each row shows agent type, description, status, elapsed and unread', () => {
    renderRail({
      rows: [
        makeRow(makeLane()),
        makeRow(makeCalf(), { elapsedMs: 125_000, unreadEventCount: 3, status: 'running' }),
      ],
    });

    // A LIST: `<ul>`/`<li>`, no tablist anywhere.
    expect(screen.getByRole('list')).toBeTruthy();
    expect(screen.queryByRole('tablist')).toBeNull();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);

    const calf = screen.getByTestId('lane-row:lane-calf-1');
    expect(calf.textContent).toContain('code-reviewer');
    expect(calf.textContent).toContain('Review the diff');
    expect(calf.textContent).toContain('Running');
    expect(calf.textContent).toContain(formatElapsed(125_000));
    // The three action ids are BARE, per `TEST_IDS`; the enclosing row scopes them.
    expect(within(calf).getByTestId('lane-row-unread').textContent).toContain('3');
  });

  it('omits the unread indicator when there is nothing unread', () => {
    renderRail({ rows: [makeRow(makeLane(), { unreadEventCount: 0 })] });
    expect(screen.queryByTestId('lane-row-unread')).toBeNull();
  });
});

describe('LaneRail — elapsed time is display-only (AC2)', () => {
  it('never reads the clock and schedules no timer, so a done lane stops re-rendering', () => {
    vi.useFakeTimers();
    const dateNow = vi.spyOn(Date, 'now');

    try {
      const renders: number[] = [];
      const done = makeCalf({ id: 'lane-done', status: 'done', endedAt: '2026-01-01T00:05:00.000Z' });

      render(
        <Profiler id="rail" onRender={() => renders.push(1)}>
          <LaneRail
            rows={[makeRow(done, { status: 'done', elapsedMs: 300_000 })]}
            onSelect={noop}
            onPin={noop}
            onUnpin={noop}
            onSteer={noop}
            routingMode="lanes"
          />
        </Profiler>,
      );

      const rendersAfterMount = renders.length;
      expect(rendersAfterMount).toBeGreaterThan(0);

      // Nothing in the rail subtree scheduled anything.
      expect(vi.getTimerCount()).toBe(0);

      const before = screen.getByTestId('lane-row:lane-done').textContent;
      vi.advanceTimersByTime(60_000);

      // No re-render, and the frozen elapsed reading is unchanged.
      expect(renders.length).toBe(rendersAfterMount);
      expect(screen.getByTestId('lane-row:lane-done').textContent).toBe(before);
      expect(dateNow).not.toHaveBeenCalled();
      expect(before).toContain('5m 00s');
    } finally {
      dateNow.mockRestore();
      vi.useRealTimers();
    }
  });
});

describe('LaneRail — pin, unpin and steer (AC3)', () => {
  it('wires pin and unpin to the right callback for the row state', () => {
    const onPin = vi.fn();
    const onUnpin = vi.fn();
    const pinned = makeCalf({ id: 'lane-pinned' });

    renderRail({
      rows: [makeRow(makeLane()), makeRow(pinned, { pinned: true })],
      onPin,
      onUnpin,
    });

    const matriarchRow = screen.getByTestId('lane-row:lane-matriarch');
    const pinnedRow = screen.getByTestId('lane-row:lane-pinned');

    fireEvent.click(within(matriarchRow).getByTestId('lane-row-pin'));
    expect(onPin).toHaveBeenCalledWith('lane-matriarch');

    fireEvent.click(within(pinnedRow).getByTestId('lane-row-pin'));
    expect(onUnpin).toHaveBeenCalledWith('lane-pinned');
  });

  it('does NOT offer Steer for a lane with agentId: null', () => {
    renderRail({
      rows: [
        makeRow(makeCalf({ id: 'lane-no-agent', agentId: null })),
        makeRow(makeCalf({ id: 'lane-with-agent', agentId: 'agent_9' })),
      ],
    });

    const noAgentRow = screen.getByTestId('lane-row:lane-no-agent');
    const withAgentRow = screen.getByTestId('lane-row:lane-with-agent');
    expect(within(noAgentRow).queryByTestId('lane-row-steer')).toBeNull();
    expect(within(withAgentRow).getByTestId('lane-row-steer')).toBeTruthy();
  });

  it('calls onSteer with the lane id', () => {
    const onSteer = vi.fn();
    renderRail({ rows: [makeRow(makeCalf({ agentId: 'agent_1' }))], onSteer });
    fireEvent.click(
      within(screen.getByTestId('lane-row:lane-calf-1')).getByTestId('lane-row-steer'),
    );
    expect(onSteer).toHaveBeenCalledWith('lane-calf-1');
  });

  it('calls onSelect when the row is activated', () => {
    const onSelect = vi.fn();
    renderRail({ rows: [makeRow(makeLane())], onSelect });
    fireEvent.click(
      screen.getByTestId(testId(LANE_ROW_SELECT_TEST_ID, 'lane-matriarch')),
    );
    expect(onSelect).toHaveBeenCalledWith('lane-matriarch');
  });
});

describe('LaneRail — routing mode is a prop, never hardcoded (AC9)', () => {
  it("says outright that selection does not filter the transcript in 'inline' mode", () => {
    const { unmount } = renderRail({
      rows: [makeRow(makeLane()), makeRow(makeCalf())],
      routingMode: 'inline',
    });
    expect(screen.getByTestId('lane-rail').getAttribute('data-routing-mode')).toBe('inline');
    expect(screen.getByText(/does not filter the transcript/i)).toBeTruthy();
    // The rail still LISTS lanes for status in inline mode.
    expect(screen.getAllByTestId(/^lane-row:/)).toHaveLength(2);
    unmount();

    renderRail({ rows: [makeRow(makeLane()), makeRow(makeCalf())], routingMode: 'lanes' });
    expect(screen.getByTestId('lane-rail').getAttribute('data-routing-mode')).toBe('lanes');
    expect(screen.queryByText(/does not filter the transcript/i)).toBeNull();
    expect(screen.getAllByTestId(/^lane-row:/)).toHaveLength(2);
  });
});

describe('LaneRail — accessibility floor', () => {
  it('makes every affordance a real keyboard-operable button', () => {
    renderRail({ rows: [makeRow(makeCalf({ agentId: 'agent_1' }), { unreadEventCount: 2 })] });
    const row = screen.getByTestId('lane-row:lane-calf-1');
    for (const button of within(row).getAllByRole('button')) {
      expect(button.tagName).toBe('BUTTON');
      expect(button.hasAttribute('disabled')).toBe(false);
    }
  });

  it('never carries status or unread by color alone', () => {
    renderRail({
      rows: [makeRow(makeCalf({ status: 'orphaned' }), { status: 'orphaned', unreadEventCount: 4 })],
    });
    const row = screen.getByTestId('lane-row:lane-calf-1');
    expect(row.textContent).toContain('Orphaned');
    expect(row.textContent).toContain('4 unread events');
  });

  it('survives StrictMode double-invocation', () => {
    render(
      <StrictMode>
        <LaneRail
          rows={[makeRow(makeLane())]}
          onSelect={noop}
          onPin={noop}
          onUnpin={noop}
          onSteer={noop}
          routingMode="lanes"
        />
      </StrictMode>,
    );
    expect(screen.getAllByTestId(/^lane-row:/)).toHaveLength(1);
  });
});

describe('formatElapsed', () => {
  it('formats without reading a clock', () => {
    expect(formatElapsed(0)).toBe('0s');
    expect(formatElapsed(-5)).toBe('0s');
    expect(formatElapsed(999)).toBe('0s');
    expect(formatElapsed(47_000)).toBe('47s');
    expect(formatElapsed(125_000)).toBe('2m 05s');
    expect(formatElapsed(3_845_000)).toBe('1h 04m');
  });
});
