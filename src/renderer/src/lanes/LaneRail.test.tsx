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
    onShowInFollower: noop,
    onHideFollower: noop,
    onSteer: noop,
    routingMode: 'lanes' as const,
    ...overrides,
  };
  return render(<LaneRail {...props} />);
}

/** DOM order of every rendered row, by lane id. Used instead of a length so an
 *  ordering assertion cannot pass on a rail that rendered the wrong lanes. */
function renderedLaneIds(): string[] {
  return screen
    .getAllByTestId(/^lane-row:/)
    .map((el) => el.getAttribute('data-testid')?.replace('lane-row:', '') ?? '');
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

    expect(renderedLaneIds()).toEqual(['lane-matriarch', 'lane-calf-a', 'lane-calf-b']);
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
            // A finished lane collapses ONLY when nothing is unseen and it is
            // in no pane. This one is a follower, so it stays on the rail and
            // the frozen-elapsed claim is made about a row that is rendered.
            rows={[makeRow(done, { status: 'done', elapsedMs: 300_000, inFollowerPane: true })]}
            onSelect={noop}
            onShowInFollower={noop}
            onHideFollower={noop}
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

/**
 * REWRITTEN, not extended. The old suite here asserted pin/unpin against
 * `LaneRowVm.pinned` and the deleted `onPin`/`onUnpin` props, and it asserted a
 * pin control on the MATRIARCH row. Both behaviours are gone
 * (`contracts/renderer-panes.ts` sections 3, 4 and 7): the pin is now a stateful
 * icon offered only where `canPin` is true, and the Matriarch never has one.
 */
describe('LaneRail — the pin icon reflects pane state (AC3)', () => {
  it('gives the Matriarch NO pin control at all — absent, not disabled', () => {
    renderRail({
      rows: [makeRow(makeLane()), makeRow(makeCalf({ id: 'lane-calf-1' }))],
    });

    // VACUITY GUARD. "No pin on the Matriarch" is satisfied by a rail that
    // rendered nothing, so assert both rows ARE present and that the Calf DOES
    // carry the control the Matriarch lacks.
    expect(renderedLaneIds()).toEqual(['lane-matriarch', 'lane-calf-1']);
    const matriarchRow = screen.getByTestId('lane-row:lane-matriarch');
    const calfRow = screen.getByTestId('lane-row:lane-calf-1');

    expect(within(matriarchRow).queryByTestId('lane-row-pin')).toBeNull();
    expect(within(calfRow).getByTestId('lane-row-pin')).toBeTruthy();
  });

  it('carries aria-pressed equal to inFollowerPane, and flips it when the row does', () => {
    const calf = makeCalf({ id: 'lane-calf-1' });
    const { rerender } = render(
      <LaneRail
        rows={[makeRow(makeLane()), makeRow(calf, { inFollowerPane: false })]}
        onSelect={noop}
        onShowInFollower={noop}
        onHideFollower={noop}
        onSteer={noop}
        routingMode="lanes"
      />,
    );

    const pin = () =>
      within(screen.getByTestId('lane-row:lane-calf-1')).getByTestId('lane-row-pin');
    expect(pin().getAttribute('aria-pressed')).toBe('false');

    rerender(
      <LaneRail
        rows={[makeRow(makeLane()), makeRow(calf, { inFollowerPane: true })]}
        onSelect={noop}
        onShowInFollower={noop}
        onHideFollower={noop}
        onSteer={noop}
        routingMode="lanes"
      />,
    );
    expect(pin().getAttribute('aria-pressed')).toBe('true');
  });

  it('names the action it will perform, and the name DIFFERS between the two states', () => {
    const calf = makeCalf({ id: 'lane-calf-1', subagentType: 'reviewer' });

    const { unmount } = renderRail({ rows: [makeRow(calf, { inFollowerPane: false })] });
    const unshownName =
      within(screen.getByTestId('lane-row:lane-calf-1')).getByTestId('lane-row-pin').textContent ??
      '';
    unmount();

    renderRail({ rows: [makeRow(calf, { inFollowerPane: true })] });
    const shownName =
      within(screen.getByTestId('lane-row:lane-calf-1')).getByTestId('lane-row-pin').textContent ??
      '';

    expect(unshownName).toContain('Show reviewer in the second pane');
    expect(shownName).toContain('Close the second pane');
    // The point of the assertion: not a constant label with a changing colour.
    expect(shownName).not.toBe(unshownName);
  });

  it('routes the click to onShowInFollower or onHideFollower by current state', () => {
    const onShowInFollower = vi.fn();
    const onHideFollower = vi.fn();

    renderRail({
      rows: [
        makeRow(makeLane()),
        makeRow(makeCalf({ id: 'lane-unshown' }), { inFollowerPane: false }),
        makeRow(makeCalf({ id: 'lane-shown' }), { inFollowerPane: true }),
      ],
      onShowInFollower,
      onHideFollower,
    });

    fireEvent.click(
      within(screen.getByTestId('lane-row:lane-unshown')).getByTestId('lane-row-pin'),
    );
    expect(onShowInFollower).toHaveBeenCalledWith('lane-unshown');
    expect(onHideFollower).not.toHaveBeenCalled();

    fireEvent.click(within(screen.getByTestId('lane-row:lane-shown')).getByTestId('lane-row-pin'));
    expect(onHideFollower).toHaveBeenCalledWith('lane-shown');
    expect(onShowInFollower).toHaveBeenCalledTimes(1);
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

  it("offers NO pin control on ANY row in 'inline' mode, because canPin is false there", () => {
    // `canPin` is FALSE for every row in inline mode (frozen `LaneRowVm`), so
    // the fixtures say so explicitly rather than letting the rail re-derive it.
    renderRail({
      routingMode: 'inline',
      rows: [
        makeRow(makeLane(), { canPin: false }),
        makeRow(makeCalf({ id: 'lane-calf-a' }), { canPin: false }),
        makeRow(makeCalf({ id: 'lane-calf-b' }), { canPin: false }),
      ],
    });

    // VACUITY GUARD: the rows are all there; it is the control that is not.
    expect(renderedLaneIds()).toEqual(['lane-matriarch', 'lane-calf-a', 'lane-calf-b']);
    expect(screen.queryAllByTestId('lane-row-pin')).toHaveLength(0);
    // The inline note is unchanged and still present.
    expect(screen.getByText(/does not filter the transcript/i)).toBeTruthy();
  });
});

/**
 * `contracts/renderer-panes.ts` section 6, at the rail level. The partition's
 * own four rules are unit-tested in `finished-lanes.test.ts`; this suite is
 * about the disclosure the rail wraps around it.
 */
describe('LaneRail — finished lanes collapse into a disclosure (section 6)', () => {
  const matriarch = makeRow(makeLane());
  const running = makeRow(makeCalf({ id: 'lane-running', status: 'running' }), {
    status: 'running',
  });
  const doneA = makeRow(makeCalf({ id: 'lane-done-a', status: 'done' }), { status: 'done' });
  const doneB = makeRow(makeCalf({ id: 'lane-done-b', status: 'done' }), { status: 'done' });

  it('hides finished rows behind a toggle whose name states the count', () => {
    renderRail({ rows: [matriarch, running, doneA, doneB] });

    const toggle = screen.getByTestId('lane-rail-finished-toggle');
    expect(toggle.textContent).toContain('Show 2 finished lanes');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');

    // Collapsed: the group is ABSENT and the rows are unreachable...
    expect(screen.queryByTestId('lane-rail-finished-group')).toBeNull();
    expect(screen.queryByTestId('lane-row:lane-done-a')).toBeNull();
    expect(screen.queryByTestId('lane-row:lane-done-b')).toBeNull();
    // ...while the rail is demonstrably rendering the rows it kept, which is
    // what stops the two assertions above passing on an empty rail.
    expect(renderedLaneIds()).toEqual(['lane-matriarch', 'lane-running']);
  });

  it('renders NO toggle when nothing is collapsible', () => {
    renderRail({ rows: [matriarch, running] });
    expect(renderedLaneIds()).toEqual(['lane-matriarch', 'lane-running']);
    expect(screen.queryByTestId('lane-rail-finished-toggle')).toBeNull();
    expect(screen.queryByTestId('lane-rail-finished-group')).toBeNull();
  });

  it('says "1 finished lane" in the singular', () => {
    renderRail({ rows: [matriarch, running, doneA] });
    expect(screen.getByTestId('lane-rail-finished-toggle').textContent).toContain(
      'Show 1 finished lane',
    );
  });

  it('restores every collapsed row on expand, and hides them again on a second click', () => {
    renderRail({ rows: [matriarch, running, doneA, doneB] });

    fireEvent.click(screen.getByTestId('lane-rail-finished-toggle'));

    const toggle = screen.getByTestId('lane-rail-finished-toggle');
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(toggle.textContent).toContain('Hide 2 finished lanes');
    expect(screen.getByTestId('lane-rail-finished-group')).toBeTruthy();
    expect(renderedLaneIds()).toEqual([
      'lane-matriarch',
      'lane-running',
      'lane-done-a',
      'lane-done-b',
    ]);

    fireEvent.click(screen.getByTestId('lane-rail-finished-toggle'));
    expect(renderedLaneIds()).toEqual(['lane-matriarch', 'lane-running']);
    expect(screen.queryByTestId('lane-rail-finished-group')).toBeNull();
  });

  it('expands back into RAIL ORDER, not append order', () => {
    // Matriarch, A (running), B (done), C (running). B must come back between
    // A and C — a lane must not move when it finishes and move again when it
    // is revealed.
    const a = makeRow(makeCalf({ id: 'lane-a', status: 'running' }), { status: 'running' });
    const b = makeRow(makeCalf({ id: 'lane-b', status: 'done' }), { status: 'done' });
    const c = makeRow(makeCalf({ id: 'lane-c', status: 'running' }), { status: 'running' });

    renderRail({ rows: [matriarch, a, b, c] });
    expect(renderedLaneIds()).toEqual(['lane-matriarch', 'lane-a', 'lane-c']);

    fireEvent.click(screen.getByTestId('lane-rail-finished-toggle'));
    expect(renderedLaneIds()).toEqual(['lane-matriarch', 'lane-a', 'lane-b', 'lane-c']);
  });

  it('keeps a finished lane on the rail when it is on screen or has something unseen', () => {
    const onScreen = makeRow(makeCalf({ id: 'lane-follower', status: 'done' }), {
      status: 'done',
      inFollowerPane: true,
    });
    const unread = makeRow(makeCalf({ id: 'lane-unread', status: 'done' }), {
      status: 'done',
      unreadEventCount: 2,
    });
    const asking = makeRow(makeCalf({ id: 'lane-asking', status: 'orphaned' }), {
      status: 'orphaned',
      awaitingPermission: true,
    });

    renderRail({ rows: [matriarch, onScreen, unread, asking, doneA] });

    expect(renderedLaneIds()).toEqual([
      'lane-matriarch',
      'lane-follower',
      'lane-unread',
      'lane-asking',
    ]);
    expect(screen.getByTestId('lane-rail-finished-toggle').textContent).toContain(
      'Show 1 finished lane',
    );
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

  it('gives the disclosure a real button with aria-expanded and aria-controls', () => {
    renderRail({
      rows: [makeRow(makeLane()), makeRow(makeCalf({ id: 'lane-done', status: 'done' }), { status: 'done' })],
    });
    const toggle = screen.getByTestId('lane-rail-finished-toggle');
    expect(toggle.tagName).toBe('BUTTON');
    expect(toggle.getAttribute('type')).toBe('button');
    const controls = toggle.getAttribute('aria-controls');
    expect(controls).toBeTruthy();
    expect(document.getElementById(controls ?? '')).toBeTruthy();
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
          onShowInFollower={noop}
          onHideFollower={noop}
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
