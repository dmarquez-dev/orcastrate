// @vitest-environment jsdom
import { Profiler, StrictMode } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { testId } from '../shell/contract-runtime';
import { LaneRail } from './LaneRail';
import { LANE_ROW_SELECT_TEST_ID } from './LaneRow';
import { formatElapsed } from './format-elapsed';
import { LANE_STATUS_LABEL } from './lane-status';
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
 * REWRITTEN AGAIN, and this time the control is GONE rather than redefined
 * (`contracts/lane-pin-removal.ts` section 1). Under the pane model a rail
 * click already shows the lane in the follower pane, so a second control one
 * gesture away did the same thing; closing is offered by the pane's own
 * `transcript-unpin`. The rule the pin's view-model gate silently carried —
 * no follower in 'inline' mode — moved into `showLane`, and is asserted in
 * `state/store.test.ts`, not here.
 */
describe('LaneRail — row controls after the pin removal (AC1)', () => {
  const MATRIARCH_AND_THREE_CALVES = [
    'lane-matriarch',
    'lane-calf-a',
    'lane-calf-b',
    'lane-calf-c',
  ];

  // Every combination of the three surviving pane fields, on every Calf, in
  // both routing modes. ALL SIXTEEN ITERATIONS FAILED AGAINST `b2c3caf`,
  // inline ones included: the pin rendered under the row's pin-gating field,
  // and `makeRow`'s default for it there was `kind !== 'matriarch'`, which
  // never consulted `routingMode`. The inline suppression was the PROVIDER's
  // to derive, so the rail rendered three pins in inline mode too whenever a
  // fixture said it could. Both halves are kept because the rail must now be
  // pinless whoever computes the rows.
  const BOOLS = [false, true] as const;
  for (const routingMode of ['lanes', 'inline'] as const) {
    for (const inPrimaryPane of BOOLS) {
      for (const inFollowerPane of BOOLS) {
        for (const focusedFollower of BOOLS) {
          const label =
            `${routingMode}/primary=${String(inPrimaryPane)}` +
            `/follower=${String(inFollowerPane)}/focused=${String(focusedFollower)}`;

          it(`renders every row and no pin control — ${label}`, () => {
            const paneState = { inPrimaryPane, inFollowerPane, focusedFollower };
            renderRail({
              routingMode,
              rows: [
                makeRow(makeLane(), paneState),
                makeRow(makeCalf({ id: 'lane-calf-a' }), paneState),
                makeRow(makeCalf({ id: 'lane-calf-b' }), paneState),
                makeRow(makeCalf({ id: 'lane-calf-c' }), paneState),
              ],
            });

            // (a) VACUITY GUARD. "No pin anywhere" passes perfectly against a
            //     rail that drew nothing, so the rows are named in full and in
            //     order first. Steer is asserted too: it proves the row's
            //     ACTION region still renders, so the pin's absence is the
            //     pin's absence and not a dropped subtree.
            expect(renderedLaneIds()).toEqual(MATRIARCH_AND_THREE_CALVES);
            expect(screen.getAllByTestId('lane-row-steer')).toHaveLength(3);

            // (b) The control itself.
            expect(screen.queryAllByTestId('lane-row-pin')).toHaveLength(0);
          });
        }
      }
    }
  }

  it('marks a follower lane on the row itself, through a channel a screen reader reaches', () => {
    renderRail({
      rows: [
        makeRow(makeLane()),
        makeRow(makeCalf({ id: 'lane-calf-a', subagentType: 'reviewer' }), {
          inFollowerPane: true,
          focusedFollower: true,
        }),
        makeRow(makeCalf({ id: 'lane-calf-b', subagentType: 'tester' }), {
          inFollowerPane: false,
        }),
      ],
    });

    // `aria-pressed` went with the button, so the ROW's own accessible name is
    // the remaining channel — and it must be a name, not a `data-` attribute
    // (advisory A4 of the 2026-08-20 T2 review).
    const shown = screen.getByRole('button', { name: /reviewer.*second pane/i });
    expect(shown.getAttribute('data-testid')).toBe('lane-row-select:lane-calf-a');
    expect(shown.getAttribute('aria-current')).toBe('true');

    // The negative half, in the same test: a Calf that is in NO pane says
    // nothing of the kind, so the marking distinguishes rather than decorates.
    const notShown = screen.getByTestId('lane-row-select:lane-calf-b');
    expect(notShown.textContent).not.toMatch(/second pane/i);
    expect(notShown.getAttribute('aria-current')).toBeNull();
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

  it("still lists and still SELECTS every row in 'inline' mode", () => {
    // The inline suppression is no longer a rail concern — it moved into
    // `showLane` (`contracts/lane-pin-removal.ts` section 2), asserted in
    // `state/store.test.ts`. What the rail owes inline mode is unchanged: list
    // the lanes, say outright that selection does not filter, and keep the row
    // selectable so its unread count can still be cleared.
    const onSelect = vi.fn();
    renderRail({
      routingMode: 'inline',
      onSelect,
      rows: [
        makeRow(makeLane()),
        makeRow(makeCalf({ id: 'lane-calf-a' })),
        makeRow(makeCalf({ id: 'lane-calf-b' })),
      ],
    });

    expect(renderedLaneIds()).toEqual(['lane-matriarch', 'lane-calf-a', 'lane-calf-b']);
    expect(screen.getByText(/does not filter the transcript/i)).toBeTruthy();

    fireEvent.click(screen.getByTestId(testId(LANE_ROW_SELECT_TEST_ID, 'lane-calf-a')));
    expect(onSelect).toHaveBeenCalledWith('lane-calf-a');
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

/**
 * ONE MARK PER ROW (`contracts/status-dot-motion.ts`,
 * `contracts/activity-module-retirement.ts`).
 *
 * The row used to draw its status dot AND a separate working indicator on the
 * same `.meta` line, so a running lane carried two marks for one fact. The dot
 * absorbed the motion and the indicator left. What these cases assert is that
 * the `.meta` line holds exactly ONE aria-hidden mark, and that the status WORD
 * is beside it in the same render — colour and motion are the second and third
 * carriers of the status, never the first.
 *
 * They cannot assert the motion itself. Vitest resolves `*.module.css` to a
 * blanked module and jsdom applies no stylesheet, so the pulse is invisible
 * here; `LaneRail.styles.test.ts` asserts the declarations and the build proves
 * the emitted animation name resolves.
 */
describe('LaneRail — the status dot is the row’s only mark', () => {
  /**
   * The `.meta` line that encloses the status span, and every aria-hidden mark
   * on it. `.meta` is reached through the status span rather than by class:
   * CSS Module class names do not survive into jsdom, which is why every dot
   * assertion in this suite goes through `[data-status]`.
   */
  function metaOf(row: HTMLElement): { status: HTMLElement; marks: Element[] } {
    const status = row.querySelector('[data-status]');
    expect(status).not.toBeNull();
    const meta = (status as HTMLElement).parentElement;
    expect(meta).not.toBeNull();
    return {
      status: status as HTMLElement,
      marks: [...(meta as HTMLElement).querySelectorAll('[aria-hidden="true"]')],
    };
  }

  it('draws the status dot, the status word and no second mark on a running lane', () => {
    renderRail({ rows: [makeRow(makeLane({ status: 'running' }), { status: 'running' })] });

    const row = screen.getByTestId('lane-row:lane-matriarch');
    const { status, marks } = metaOf(row);

    expect(status.getAttribute('data-status')).toBe('running');
    // Exactly one mark on the meta line, and it is the dot inside `.status`.
    expect(marks).toHaveLength(1);
    const dot = marks[0] as HTMLElement;
    expect(dot.parentElement).toBe(status);
    // The dot carries nothing by itself: no text, no children, no test id.
    expect(dot.tagName).toBe('SPAN');
    expect(dot.textContent).toBe('');
    expect(dot.children).toHaveLength(0);
    expect(dot.getAttribute('data-testid')).toBeNull();
    // Nothing anywhere in the row is a mounted indicator any more.
    expect(row.querySelector('[data-testid*="indicator"]')).toBeNull();
    // Colour is never the only carrier: the word is in the SAME render.
    expect(row.textContent).toContain(LANE_STATUS_LABEL.running);
  });

  it.each(['done', 'orphaned', 'stopped'] as const)(
    'draws the same single dot and its word on a %s lane, with nothing added',
    (status) => {
      // The Matriarch is never collapsed, whatever its status, so the row is
      // demonstrably rendered and the count below is this row's.
      renderRail({ rows: [makeRow(makeLane({ status }), { status })] });

      const row = screen.getByTestId('lane-row:lane-matriarch');
      const { status: statusEl, marks } = metaOf(row);

      expect(statusEl.getAttribute('data-status')).toBe(status);
      expect(marks).toHaveLength(1);
      expect((marks[0] as HTMLElement).parentElement).toBe(statusEl);
      expect((marks[0] as HTMLElement).textContent).toBe('');
      expect(row.querySelector('[data-testid*="indicator"]')).toBeNull();
      expect(row.textContent).toContain(LANE_STATUS_LABEL[status]);
    },
  );
});
