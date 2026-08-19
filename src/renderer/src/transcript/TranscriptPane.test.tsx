// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { EventPayload, EventType, NormalizedEvent } from '@shared/contracts/events';

import type { TranscriptPaneProps } from '../contracts/renderer-view';
import { TranscriptPane } from './TranscriptPane';
import {
  makeCalf,
  makeDispatchEvent,
  makeEvent,
  makeLane,
  makeView,
  stubScrollGeometry,
} from './test-fixtures';

afterEach(cleanup);

const noop = () => undefined;

const matriarch = makeLane();
const calf1 = makeCalf('lane-calf-1');

function props(overrides: Partial<TranscriptPaneProps> = {}): TranscriptPaneProps {
  return {
    lane: makeLane(),
    view: makeView([]),
    lanes: [],
    routingMode: 'lanes',
    isSplit: false,
    hasMore: false,
    onLoadMore: noop,
    onJumpToLane: noop,
    permissionSlot: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// AC4 — every EventType renders, in seq order, one element per event
// ---------------------------------------------------------------------------

describe('TranscriptPane — event stream (AC4)', () => {
  it('renders events in ascending seq order with one testid per event', () => {
    const events = [
      makeEvent(1, { type: 'user_message', text: 'first' }),
      makeEvent(2, { type: 'assistant_text', text: 'second' }),
      makeEvent(3, { type: 'thinking', text: 'third' }),
    ];
    render(<TranscriptPane {...props({ view: makeView(events) })} />);

    const rendered = screen.getAllByTestId(/^transcript-event:/);
    expect(rendered.map((el) => el.getAttribute('data-testid'))).toEqual([
      'transcript-event:1',
      'transcript-event:2',
      'transcript-event:3',
    ]);
  });

  it('has a rendering for every member of the frozen EventType union', () => {
    // One payload per member. If the union grows, this object stops
    // type-checking, which is the point — a new EventType cannot slip through
    // unrendered.
    const payloads: Record<EventType, EventPayload> = {
      user_message: { type: 'user_message', text: 'hello from the user' },
      assistant_text: { type: 'assistant_text', text: 'hello from claude' },
      thinking: { type: 'thinking', text: 'pondering' },
      tool_use: { type: 'tool_use', toolUseId: 'toolu_a', name: 'Read', input: { path: 'x' } },
      tool_result: { type: 'tool_result', toolUseId: 'toolu_a', isError: false, content: 'ok' },
      lane_opened: { type: 'lane_opened', lane: makeCalf('lane-calf-x') },
      lane_closed: { type: 'lane_closed', laneId: 'lane-calf-x', status: 'done' },
      permission_request: {
        type: 'permission_request',
        requestId: 'req-1',
        toolName: 'Bash',
        input: { command: 'ls' },
        toolUseId: 'toolu_b',
      },
      permission_decision: { type: 'permission_decision', requestId: 'req-1', decision: 'allow' },
      system: { type: 'system', subtype: 'task_progress', data: { pct: 50 } },
      error: { type: 'error', message: 'the process died', exitCode: 137 },
      malformed: { type: 'malformed', rawLine: '{not json', parseError: 'Unexpected token' },
    };

    const events = Object.values(payloads).map((payload, i) => makeEvent(i + 1, payload));
    render(<TranscriptPane {...props({ view: makeView(events) })} />);

    // Every event produced exactly one element, and none of them is empty.
    const rendered = screen.getAllByTestId(/^transcript-event:/);
    expect(rendered).toHaveLength(events.length);
    for (const el of rendered) {
      expect(el.textContent?.trim().length ?? 0).toBeGreaterThan(0);
    }

    // The two the spec singles out.
    const malformed = screen.getByTestId(`transcript-event:${events.length}`);
    expect(malformed.getAttribute('data-event-type')).toBe('malformed');
    expect(malformed.textContent).toContain('{not json');

    const errorEl = screen.getByTestId(`transcript-event:${events.length - 1}`);
    expect(errorEl.textContent).toContain('the process died');
    expect(errorEl.textContent).toContain('Exit code 137');
  });

  it('renders a malformed line visibly rather than skipping it', () => {
    const events = [
      makeEvent(1, { type: 'assistant_text', text: 'before' }),
      makeEvent(2, { type: 'malformed', rawLine: '<<<garbage>>>', parseError: 'bad json' }),
      makeEvent(3, { type: 'assistant_text', text: 'after' }),
    ];
    render(<TranscriptPane {...props({ view: makeView(events) })} />);
    expect(screen.getAllByTestId(/^transcript-event:/)).toHaveLength(3);
    expect(screen.getByText('<<<garbage>>>')).toBeTruthy();
  });

  it('omits the exit code when the error carries none', () => {
    render(
      <TranscriptPane
        {...props({
          view: makeView([makeEvent(1, { type: 'error', message: 'boom', exitCode: null })]),
        })}
      />,
    );
    expect(screen.getByTestId('transcript-event:1').textContent).not.toContain('Exit code');
  });
});

// ---------------------------------------------------------------------------
// AC5 — append without re-mount; auto-scroll only when already at the bottom
// ---------------------------------------------------------------------------

describe('TranscriptPane — live append (AC5)', () => {
  function scrollContainer(): HTMLElement {
    return screen.getByTestId('transcript-scroll-primary');
  }

  it('does not re-mount existing event elements when a new one is appended', () => {
    const base: NormalizedEvent[] = [
      makeEvent(1, { type: 'assistant_text', text: 'one' }),
      makeEvent(2, { type: 'assistant_text', text: 'two' }),
    ];
    const { rerender } = render(<TranscriptPane {...props({ view: makeView(base) })} />);

    const firstBefore = screen.getByTestId('transcript-event:1');
    const secondBefore = screen.getByTestId('transcript-event:2');

    const appended = [...base, makeEvent(3, { type: 'assistant_text', text: 'three' })];
    rerender(<TranscriptPane {...props({ view: makeView(appended) })} />);

    // Same DOM nodes — React reused them rather than tearing the list down.
    expect(screen.getByTestId('transcript-event:1')).toBe(firstBefore);
    expect(screen.getByTestId('transcript-event:2')).toBe(secondBefore);
    // And the new one landed at the bottom.
    const ids = screen.getAllByTestId(/^transcript-event:/).map((el) => el.textContent);
    expect(ids.at(-1)).toContain('three');
  });

  it('follows new events for a reader who is already at the bottom', () => {
    const base = [makeEvent(1, { type: 'assistant_text', text: 'one' })];
    const { rerender } = render(<TranscriptPane {...props({ view: makeView(base) })} />);

    const el = scrollContainer();
    stubScrollGeometry(el, { scrollHeight: 1000, clientHeight: 100 });
    el.scrollTop = 900; // pinned to the bottom
    fireEvent.scroll(el);

    rerender(
      <TranscriptPane
        {...props({ view: makeView([...base, makeEvent(2, { type: 'assistant_text', text: 'two' })]) })}
      />,
    );

    expect(el.scrollTop).toBe(1000);
  });

  it('does NOT yank a scrolled-up reader down when an event arrives', () => {
    const base = [makeEvent(1, { type: 'assistant_text', text: 'one' })];
    const { rerender } = render(<TranscriptPane {...props({ view: makeView(base) })} />);

    const el = scrollContainer();
    stubScrollGeometry(el, { scrollHeight: 1000, clientHeight: 100 });
    el.scrollTop = 0; // reading history near the top
    fireEvent.scroll(el);

    rerender(
      <TranscriptPane
        {...props({ view: makeView([...base, makeEvent(2, { type: 'assistant_text', text: 'two' })]) })}
      />,
    );

    expect(el.scrollTop).toBe(0);
    // The event still arrived; it just did not steal the viewport.
    expect(screen.getByTestId('transcript-event:2')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// AC6 — backfill
// ---------------------------------------------------------------------------

describe('TranscriptPane — backfill affordance (AC6)', () => {
  it('is hidden when hasMore is false', () => {
    render(<TranscriptPane {...props({ hasMore: false, view: makeView([]) })} />);
    expect(screen.queryByTestId('transcript-load-more')).toBeNull();
  });

  it('calls onLoadMore when shown and activated', () => {
    const onLoadMore = vi.fn();
    render(<TranscriptPane {...props({ hasMore: true, onLoadMore })} />);
    fireEvent.click(screen.getByTestId('transcript-load-more'));
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it('shows no error for a page shorter than requested — only hasMore ends paging', () => {
    // A short page: two events back, hasMore still true. Nothing about the page
    // length is rendered, and nothing has role="alert".
    render(
      <TranscriptPane
        {...props({
          hasMore: true,
          view: makeView([
            makeEvent(1, { type: 'assistant_text', text: 'one' }),
            makeEvent(2, { type: 'assistant_text', text: 'two' }),
          ]),
        })}
      />,
    );
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByTestId('transcript-load-more')).toBeTruthy();
  });

  it('surfaces a real transcript error, distinct from a short page', () => {
    render(
      <TranscriptPane
        {...props({
          view: makeView([], { phase: 'error', error: { code: 'INTERNAL', message: 'read failed' } }),
        })}
      />,
    );
    expect(screen.getByRole('alert').textContent).toContain('read failed');
  });
});

// ---------------------------------------------------------------------------
// AC7 / AC8 — the dispatch card, in place, detected by the field not the name
// ---------------------------------------------------------------------------

describe('TranscriptPane — inline dispatch card (AC7, AC8)', () => {
  it('renders the card at the position in the transcript where the dispatch fired', () => {
    const events = [
      makeEvent(1, { type: 'assistant_text', text: 'about to dispatch' }),
      makeDispatchEvent(2, 'Agent', 'lane-calf-1'),
      makeEvent(3, { type: 'assistant_text', text: 'dispatched' }),
      makeEvent(4, { type: 'assistant_text', text: 'after' }),
    ];
    render(<TranscriptPane {...props({ view: makeView(events), lanes: [matriarch, calf1] })} />);

    const dispatchEventEl = screen.getByTestId('transcript-event:2');
    expect(within(dispatchEventEl).getByTestId('dispatch-card')).toBeTruthy();

    // Position: it is the second of four event elements, in place, not hoisted.
    const all = screen.getAllByTestId(/^transcript-event:/);
    expect(all[1]).toBe(dispatchEventEl);
    expect(all).toHaveLength(4);
  });

  it("renders a card for name 'Agent' AND for name 'Task' — detection is by dispatchedLaneId", () => {
    // THE SILENT-FAILURE MODE THIS TEST EXISTS FOR. The dispatch tool is
    // `Agent` on CLI 2.1.235 and `Task` on older ones. A renderer that checks
    // the NAME against either one alone renders zero cards on the other CLI,
    // with no error anywhere.
    const events = [
      makeDispatchEvent(1, 'Agent', 'lane-calf-a'),
      makeDispatchEvent(2, 'Task', 'lane-calf-b'),
      // And a tool_use that is NOT a dispatch, even though it exists alongside
      // them: no `dispatchedLaneId`, so no card.
      makeEvent(3, { type: 'tool_use', toolUseId: 'toolu_3', name: 'Agent', input: {} }),
    ];
    render(
      <TranscriptPane
        {...props({
          view: makeView(events),
          lanes: [matriarch, makeCalf('lane-calf-a'), makeCalf('lane-calf-b')],
        })}
      />,
    );

    expect(screen.getAllByTestId('dispatch-card')).toHaveLength(2);
    expect(within(screen.getByTestId('transcript-event:1')).getByTestId('dispatch-card')).toBeTruthy();
    expect(within(screen.getByTestId('transcript-event:2')).getByTestId('dispatch-card')).toBeTruthy();
    expect(within(screen.getByTestId('transcript-event:3')).queryByTestId('dispatch-card')).toBeNull();
  });

  it('lists one row per opened lane and jumps to that lane on click', () => {
    const events = [makeDispatchEvent(1, 'Agent', 'lane-calf-1')];
    const onJumpToLane = vi.fn();
    render(
      <TranscriptPane
        {...props({ view: makeView(events), lanes: [matriarch, calf1], onJumpToLane })}
      />,
    );

    const rows = screen.getAllByTestId('dispatch-card-agent');
    expect(rows).toHaveLength(1);
    fireEvent.click(rows[0]!);
    expect(onJumpToLane).toHaveBeenCalledWith('lane-calf-1');
  });

  /**
   * THE REGRESSION THIS TEST EXISTS FOR - and the one the old fixtures hid.
   *
   * A real Matriarch stream contains the dispatching `tool_use` and NEVER the
   * Calf's `lane_opened`: `store.ts` buckets events by `event.laneId`, and
   * `lane-router.ts` `materialize()` stamps that `lane_opened` with the Calf's
   * OWN laneId. Every event below therefore carries `laneId: 'lane-matriarch'`,
   * asserted outright so the fixture cannot drift back.
   *
   * A pane that derives its lane index from `view.events` renders zero rows
   * here. A pane fed the registry renders the rows, each with its CURRENT
   * status - which no event in this stream could have supplied.
   */
  it('renders per-agent rows from the lane registry when the stream has NO lane_opened', () => {
    const events = [
      makeEvent(1, { type: 'user_message', text: 'review this' }),
      makeDispatchEvent(2, 'Agent', 'lane-calf-1'),
      makeDispatchEvent(3, 'Agent', 'lane-calf-2'),
      makeEvent(4, { type: 'assistant_text', text: 'dispatched two reviewers' }),
    ];

    // The producer's reality: no event here belongs to any lane but the
    // Matriarch, and nothing in the stream mentions a Calf lane opening.
    for (const event of events) expect(event.laneId).toBe('lane-matriarch');
    expect(events.some((event) => event.payload.type === 'lane_opened')).toBe(false);

    const onJumpToLane = vi.fn();
    render(
      <TranscriptPane
        {...props({
          view: makeView(events),
          lanes: [
            matriarch,
            makeCalf('lane-calf-1', { subagentType: 'reviewer', status: 'running' }),
            makeCalf('lane-calf-2', { subagentType: 'tester', status: 'done' }),
          ],
          onJumpToLane,
        })}
      />,
    );

    const firstCard = screen.getByTestId('transcript-event:2');
    const firstRows = within(firstCard).getAllByTestId('dispatch-card-agent');
    expect(firstRows).toHaveLength(1);
    expect(firstRows[0]!.getAttribute('data-lane-id')).toBe('lane-calf-1');
    expect(firstRows[0]!.textContent).toContain('Running');

    const secondCard = screen.getByTestId('transcript-event:3');
    const secondRows = within(secondCard).getAllByTestId('dispatch-card-agent');
    expect(secondRows).toHaveLength(1);
    expect(secondRows[0]!.getAttribute('data-lane-id')).toBe('lane-calf-2');
    expect(secondRows[0]!.textContent).toContain('Done');

    fireEvent.click(secondRows[0]!);
    expect(onJumpToLane).toHaveBeenCalledWith('lane-calf-2');
  });

  it('still degrades to count-only when the registry has not caught up yet', () => {
    const events = [makeDispatchEvent(1, 'Agent', 'lane-calf-1')];
    render(<TranscriptPane {...props({ view: makeView(events), lanes: [matriarch] })} />);
    const card = screen.getByTestId('dispatch-card');
    expect(card).toBeTruthy();
    expect(within(card).queryByTestId('dispatch-card-agent')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// AC9 — both routing modes through the same component
// ---------------------------------------------------------------------------

describe('TranscriptPane — routing mode (AC9)', () => {
  const events = [makeDispatchEvent(1, 'Agent', 'lane-calf-1')];
  const registry = [matriarch, calf1];

  it("renders per-agent rows in 'lanes' mode and count-only in 'inline' mode", () => {
    const { unmount } = render(
      <TranscriptPane
        {...props({ view: makeView(events), lanes: registry, routingMode: 'lanes' })}
      />,
    );
    expect(screen.getByTestId('dispatch-card').textContent).toContain('dispatched 1 agents');
    expect(screen.getAllByTestId('dispatch-card-agent')).toHaveLength(1);
    unmount();

    render(
      <TranscriptPane
        {...props({ view: makeView(events), lanes: registry, routingMode: 'inline' })}
      />,
    );
    // Still present — it does not disappear.
    const card = screen.getByTestId('dispatch-card');
    expect(card.textContent).toContain('dispatched 1 agents');
    expect(screen.queryByTestId('dispatch-card-agent')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// AC10 — the pinned split pane
// ---------------------------------------------------------------------------

describe('TranscriptPane — split pane (AC10)', () => {
  it('uses the split testid and carries no composer of its own', () => {
    render(
      <TranscriptPane
        {...props({
          isSplit: true,
          lane: makeCalf('lane-calf-1'),
          view: makeView([makeEvent(1, { type: 'assistant_text', text: 'pinned' })]),
        })}
      />,
    );

    const pane = screen.getByTestId('transcript-split');
    expect(screen.queryByTestId('transcript-primary')).toBeNull();
    expect(within(pane).queryByTestId('composer-input')).toBeNull();
    expect(within(pane).queryByTestId('composer')).toBeNull();
    expect(within(pane).queryByTestId('composer-send')).toBeNull();
    expect(within(pane).queryByRole('textbox')).toBeNull();
  });

  it('uses the primary testid when not split, and it too has no composer', () => {
    render(<TranscriptPane {...props({ isSplit: false })} />);
    const pane = screen.getByTestId('transcript-primary');
    expect(screen.queryByTestId('transcript-split')).toBeNull();
    expect(within(pane).queryByTestId('composer-input')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// AC11 — permissionSlot
// ---------------------------------------------------------------------------

describe('TranscriptPane — permissionSlot (AC11)', () => {
  it('renders the slot inside the scroll container, after the events, in document flow', () => {
    const sentinel = <div data-testid="permission-sentinel">sentinel</div>;
    render(
      <TranscriptPane
        {...props({
          view: makeView([makeEvent(1, { type: 'assistant_text', text: 'one' })]),
          permissionSlot: sentinel,
        })}
      />,
    );

    const scroll = screen.getByTestId('transcript-scroll-primary');
    const node = screen.getByTestId('permission-sentinel');

    // Inside the pane's own scroll container — not a portal, not an overlay.
    expect(scroll.contains(node)).toBe(true);
    expect(screen.getByTestId('transcript-primary').contains(node)).toBe(true);
    // Nothing was portalled to the body outside the pane.
    expect(document.body.querySelectorAll('[data-testid="permission-sentinel"]')).toHaveLength(1);

    // After the last event in document order.
    const lastEvent = screen.getByTestId('transcript-event:1');
    expect(lastEvent.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('renders nothing about the slot contents when there is none', () => {
    render(<TranscriptPane {...props({ permissionSlot: null })} />);
    expect(screen.getByTestId('transcript-permission-slot').textContent).toBe('');
  });
});

// ---------------------------------------------------------------------------
// Loading / empty states and focus
// ---------------------------------------------------------------------------

describe('TranscriptPane — declared states and focus', () => {
  it('declares loading, empty and no-lane states', () => {
    const { unmount } = render(
      <TranscriptPane {...props({ view: makeView([], { phase: 'loading' }) })} />,
    );
    expect(screen.getByRole('status').textContent).toContain('Loading transcript');
    unmount();

    const second = render(<TranscriptPane {...props({ view: makeView([], { phase: 'ready' }) })} />);
    expect(screen.getByText('No events in this lane yet.')).toBeTruthy();
    second.unmount();

    render(<TranscriptPane {...props({ lane: null, view: makeView([], { phase: 'ready' }) })} />);
    expect(screen.getByText('Select a lane to see its transcript.')).toBeTruthy();
  });

  it('moves focus to the pane heading when the lane changes, but not on first mount', () => {
    const { rerender } = render(<TranscriptPane {...props({ lane: makeLane() })} />);
    expect(document.activeElement).toBe(document.body);

    rerender(<TranscriptPane {...props({ lane: makeCalf('lane-calf-1') })} />);
    expect(document.activeElement?.textContent).toContain('reviewer');
  });

  it('keeps the scroll region keyboard reachable', () => {
    render(<TranscriptPane {...props()} />);
    expect(screen.getByTestId('transcript-scroll-primary').getAttribute('tabindex')).toBe('0');
    expect(screen.getByRole('log')).toBeTruthy();
  });
});
