// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { NormalizedEvent } from '@shared/contracts/events';

import { PANE_TEST_IDS, type TranscriptPaneProps } from '../contracts/renderer-view';
import { TranscriptPane } from './TranscriptPane';
import {
  makeCalf,
  makeDispatchEvent,
  makeEvent,
  makeFirstRunEvents,
  makeLane,
  makeReconciliationEvent,
  makeView,
  STARTUP_RECONCILIATION_REASON,
} from './test-fixtures';

afterEach(cleanup);

const noop = () => undefined;

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

const PRIMARY_FILTER = 'transcript-filter:primary';
const SPLIT_FILTER = 'transcript-filter:split';

function typeCount(pane: HTMLElement, type: string): number {
  return pane.querySelectorAll(`[data-event-type="${type}"]`).length;
}

function renderedSeqs(pane: HTMLElement): string[] {
  return [...pane.querySelectorAll('[data-testid^="transcript-event:"]')].map(
    (el) => el.getAttribute('data-testid')!.split(':')[1]!,
  );
}

// ---------------------------------------------------------------------------
// AC2 — the default is the conversation, measured on a realistic stream
// ---------------------------------------------------------------------------

describe('the default filter, against the first run in proportion (AC2)', () => {
  it('renders none of the plumbing and all of the conversation', () => {
    const events = makeFirstRunEvents();

    // The fixture really does hold the proportions the run measured — if it
    // ever stops doing so, every assertion below becomes weaker without
    // failing, so it is checked outright.
    const count = (type: string) => events.filter((e) => e.payload.type === type).length;
    expect(count('system')).toBe(53);
    expect(count('assistant_text')).toBe(11);
    for (const type of ['thinking', 'lane_opened', 'lane_closed', 'error', 'malformed']) {
      expect(count(type), type).toBeGreaterThanOrEqual(1);
    }

    render(<TranscriptPane {...props({ view: makeView(events), lanes: [makeLane()] })} />);
    const pane = screen.getByTestId('transcript-primary');

    // The noise: gone. Against the current code all 53 `system` rows render,
    // so this is the first assertion to fail.
    expect(typeCount(pane, 'system')).toBe(0);
    expect(typeCount(pane, 'thinking')).toBe(0);
    expect(typeCount(pane, 'lane_opened')).toBe(0);
    expect(typeCount(pane, 'lane_closed')).toBe(0);

    // NOT VACUOUS. The pane did not simply render nothing: every one of the 11
    // assistant turns is on screen, by text, and so are the diagnostics.
    expect(typeCount(pane, 'assistant_text')).toBe(11);
    for (let i = 1; i <= 11; i += 1) {
      expect(screen.getByText(`assistant turn ${i}`)).toBeTruthy();
    }
    expect(typeCount(pane, 'error')).toBe(1);
    expect(typeCount(pane, 'malformed')).toBe(1);

    // 69 events in, 13 rendered: 11 assistant turns plus the two diagnostics.
    expect(renderedSeqs(pane)).toHaveLength(13);
  });
});

// ---------------------------------------------------------------------------
// AC3 — error and malformed are visible in BOTH modes
// ---------------------------------------------------------------------------

describe('diagnostics are never filtered (AC3)', () => {
  const events = [
    makeEvent(1, { type: 'system', subtype: 'init', data: null }),
    makeEvent(2, { type: 'error', message: 'the process died', exitCode: 137 }),
    makeEvent(3, { type: 'malformed', rawLine: '<<<garbage>>>', parseError: 'bad json' }),
  ];

  it('renders error and malformed in conversation mode, by test id', () => {
    render(<TranscriptPane {...props({ view: makeView(events) })} />);
    expect(screen.getByTestId('transcript-event:2')).toBeTruthy();
    expect(screen.getByTestId('transcript-event:3')).toBeTruthy();
    expect(screen.queryByTestId('transcript-event:1')).toBeNull();
    expect(screen.getByText('<<<garbage>>>')).toBeTruthy();
  });

  it('still renders them in everything mode, alongside the system row', () => {
    render(<TranscriptPane {...props({ view: makeView(events) })} />);
    fireEvent.click(screen.getByTestId(PRIMARY_FILTER));

    expect(screen.getByTestId('transcript-event:1')).toBeTruthy();
    expect(screen.getByTestId('transcript-event:2')).toBeTruthy();
    expect(screen.getByTestId('transcript-event:3')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// The startup-reconciliation notice (contract amendment, escalation E5)
// ---------------------------------------------------------------------------

describe('the startup-reconciliation notice is visible in BOTH modes', () => {
  /** Plumbing on either side of the notice, so position is testable too. */
  const events = [
    makeEvent(1, { type: 'system', subtype: 'hook_started', data: null }),
    makeReconciliationEvent(2),
    makeEvent(3, { type: 'system', subtype: 'hook_response', data: null }),
    makeEvent(4, { type: 'assistant_text', text: 'after' }),
  ];

  it('renders in the DEFAULT mode, verbatim, while the plumbing around it does not', () => {
    render(<TranscriptPane {...props({ view: makeView(events) })} />);
    const pane = screen.getByTestId('transcript-primary');

    // THE DISCRIMINATOR. Against the pre-amendment code this row is filtered
    // out with every other `system` event and the sentence is nowhere.
    const notice = screen.getByTestId('transcript-event:2');
    expect(notice.getAttribute('data-event-type')).toBe('system');
    expect(notice.textContent).toContain(STARTUP_RECONCILIATION_REASON);
    expect(notice.textContent).toContain('lane-matriarch');

    // NOT VACUOUS, AND NOT `system` UN-HIDDEN WHOLESALE: the two unmarked
    // `system` rows either side of it are still gone, and the conversation
    // still renders.
    expect(screen.queryByTestId('transcript-event:1')).toBeNull();
    expect(screen.queryByTestId('transcript-event:3')).toBeNull();
    expect(typeCount(pane, 'system')).toBe(1);
    expect(renderedSeqs(pane)).toEqual(['2', '4']);
  });

  it('still renders it in everything mode, back among its plumbing, in seq order', () => {
    render(<TranscriptPane {...props({ view: makeView(events) })} />);
    fireEvent.click(screen.getByTestId(PRIMARY_FILTER));

    const pane = screen.getByTestId('transcript-primary');
    expect(renderedSeqs(pane)).toEqual(['1', '2', '3', '4']);
    expect(screen.getByTestId('transcript-event:2').textContent).toContain(
      STARTUP_RECONCILIATION_REASON,
    );
  });

  it('is not counted as hidden, so the toggle does not over-claim', () => {
    render(<TranscriptPane {...props({ view: makeView(events) })} />);
    // Two hidden `system` rows — the notice is not one of them.
    expect(screen.getByTestId(PRIMARY_FILTER).getAttribute('aria-label')).toBe(
      'Show 2 hidden system events',
    );
    expect(screen.getByTestId('transcript-filter-count').textContent).toBe('2');
  });

  it('does not make the lane look empty when the notice is all there is', () => {
    render(<TranscriptPane {...props({ view: makeView([makeReconciliationEvent(1)]) })} />);
    expect(screen.queryByText('No events in this lane yet.')).toBeNull();
    expect(screen.getByTestId('transcript-event:1').textContent).toContain(
      STARTUP_RECONCILIATION_REASON,
    );
    // Nothing is hidden at all, so the toggle names no count.
    expect(screen.getByTestId(PRIMARY_FILTER).getAttribute('aria-label')).toBe(
      'Show system events',
    );
    expect(screen.queryByTestId('transcript-filter-count')).toBeNull();
  });

  it('reaches the follower pane on its own default too', () => {
    render(
      <TranscriptPane
        {...props({ isSplit: true, lane: makeCalf('lane-calf-1'), view: makeView(events) })}
      />,
    );
    expect(screen.getByTestId('transcript-event:2').textContent).toContain(
      STARTUP_RECONCILIATION_REASON,
    );
    expect(screen.getByTestId(SPLIT_FILTER).getAttribute('aria-pressed')).toBe('false');
  });
});

// ---------------------------------------------------------------------------
// AC4 — the toggle is always present, in both panes, and names its count
// ---------------------------------------------------------------------------

describe('the toggle (AC4)', () => {
  it('renders in a lane where nothing is hidden, enabled, with no count', () => {
    render(
      <TranscriptPane
        {...props({ view: makeView([makeEvent(1, { type: 'assistant_text', text: 'hi' })]) })}
      />,
    );
    const toggle = screen.getByTestId(PRIMARY_FILTER);
    expect(toggle.tagName).toBe('BUTTON');
    expect((toggle as HTMLButtonElement).disabled).toBe(false);
    expect(toggle.hasAttribute('disabled')).toBe(false);
    expect(screen.queryByTestId('transcript-filter-count')).toBeNull();
    // The name carries no number at all.
    expect(toggle.getAttribute('aria-label')).toBe('Show system events');
    expect(screen.getByRole('button', { name: 'Show system events' })).toBe(toggle);
  });

  it('renders in an EMPTY lane, still enabled, still with no count', () => {
    render(<TranscriptPane {...props({ view: makeView([]) })} />);
    const toggle = screen.getByTestId(PRIMARY_FILTER);
    expect((toggle as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByTestId('transcript-filter-count')).toBeNull();
    expect(toggle.getAttribute('aria-label')).toBe('Show system events');
  });

  it('names the count in words and renders it, when there is one', () => {
    const events = [
      ...Array.from({ length: 42 }, (_, i) =>
        makeEvent(i + 1, { type: 'system', subtype: 'hook_started', data: null }),
      ),
      makeEvent(43, { type: 'assistant_text', text: 'hi' }),
    ];
    render(<TranscriptPane {...props({ view: makeView(events) })} />);

    const toggle = screen.getByTestId(PRIMARY_FILTER);
    expect(toggle.getAttribute('aria-label')).toBe('Show 42 hidden system events');
    expect(screen.getByRole('button', { name: 'Show 42 hidden system events' })).toBe(toggle);
    expect(screen.getByTestId('transcript-filter-count').textContent).toBe('42');
    expect(toggle.getAttribute('aria-pressed')).toBe('false');

    // Expanded, it still names the count — of what it is about to hide.
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    expect(toggle.getAttribute('aria-label')).toBe('Hide 42 system events');
    expect(screen.getByTestId('transcript-filter-count').textContent).toBe('42');
  });

  it('renders in the split pane too, under its own test id', () => {
    render(
      <TranscriptPane
        {...props({
          isSplit: true,
          lane: makeCalf('lane-calf-1'),
          view: makeView([makeEvent(1, { type: 'system', subtype: 'init', data: null })]),
        })}
      />,
    );
    const toggle = screen.getByTestId(SPLIT_FILTER);
    expect((toggle as HTMLButtonElement).disabled).toBe(false);
    expect(toggle.getAttribute('aria-label')).toBe('Show 1 hidden system events');
    expect(screen.queryByTestId(PRIMARY_FILTER)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// AC5 — reversible, and it restores POSITION, not order-of-arrival
// ---------------------------------------------------------------------------

describe('hiding is reversible and restores position (AC5)', () => {
  it('interleaves restored events back into seq order rather than appending them', () => {
    const events = [
      makeEvent(1, { type: 'assistant_text', text: 'one' }),
      makeEvent(2, { type: 'system', subtype: 'hook_started', data: null }),
      makeEvent(3, { type: 'user_message', text: 'three' }),
      makeEvent(4, { type: 'system', subtype: 'hook_response', data: null }),
      makeEvent(5, { type: 'assistant_text', text: 'five' }),
    ];
    render(<TranscriptPane {...props({ view: makeView(events) })} />);
    const pane = screen.getByTestId('transcript-primary');

    expect(renderedSeqs(pane)).toEqual(['1', '3', '5']);

    fireEvent.click(screen.getByTestId(PRIMARY_FILTER));
    // A block appended at the end would read 1, 3, 5, 2, 4 and fail here.
    expect(renderedSeqs(pane)).toEqual(['1', '2', '3', '4', '5']);

    // And back again — the toggle is a toggle, not a one-way door.
    fireEvent.click(screen.getByTestId(PRIMARY_FILTER));
    expect(renderedSeqs(pane)).toEqual(['1', '3', '5']);
  });
});

// ---------------------------------------------------------------------------
// AC7 — filtering never changes a count
// ---------------------------------------------------------------------------

describe('filtering never changes a count (AC7)', () => {
  /**
   * The unread badge, derived the way the state layer derives it: from the
   * events the lane HOLDS, not from the ones a pane happens to be rendering.
   * `src/renderer/src/state/**` is not in this task's ownership set and is not
   * edited, so the badge is reconstructed here from the same `TranscriptView`
   * the pane is given. A pane that mutated, spliced or re-sorted `view.events`
   * would move this number.
   */
  function Harness({ view, lastSeenSeq }: { view: ReturnType<typeof makeView>; lastSeenSeq: number }) {
    const unread = view.events.filter((e) => e.seq > lastSeenSeq).length;
    return (
      <>
        <span data-testid="unread-badge">{unread}</span>
        <span data-testid="high-water">{view.highWaterSeq}</span>
        <TranscriptPane {...props({ view })} />
      </>
    );
  }

  it('leaves the unread badge and the high-water seq untouched across a toggle', () => {
    const events: NormalizedEvent[] = [
      makeEvent(1, { type: 'assistant_text', text: 'seen' }),
      makeEvent(2, { type: 'system', subtype: 'hook_started', data: null }),
      makeEvent(3, { type: 'system', subtype: 'hook_progress', data: null }),
      makeEvent(4, { type: 'assistant_text', text: 'unseen' }),
    ];
    const view = makeView(events);
    const snapshot = structuredClone(events);

    render(<Harness view={view} lastSeenSeq={1} />);

    // Three events arrived after the last one the user saw — two of which the
    // filter is hiding right now. A badge a user could clear by filtering would
    // read 1 here.
    expect(screen.getByTestId('unread-badge').textContent).toBe('3');
    expect(screen.getByTestId('high-water').textContent).toBe('4');
    expect(renderedSeqs(screen.getByTestId('transcript-primary'))).toEqual(['1', '4']);

    fireEvent.click(screen.getByTestId(PRIMARY_FILTER));

    expect(screen.getByTestId('unread-badge').textContent).toBe('3');
    expect(screen.getByTestId('high-water').textContent).toBe('4');
    expect(renderedSeqs(screen.getByTestId('transcript-primary'))).toEqual(['1', '2', '3', '4']);

    fireEvent.click(screen.getByTestId(PRIMARY_FILTER));
    expect(screen.getByTestId('unread-badge').textContent).toBe('3');
    expect(screen.getByTestId('high-water').textContent).toBe('4');

    // And the view's own array came through both toggles unchanged.
    expect(view.events).toEqual(snapshot);
    expect(view.events).toBe(events);
    expect(view.highWaterSeq).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// AC8 — each pane holds its own mode
// ---------------------------------------------------------------------------

describe('each pane holds its own mode (AC8)', () => {
  it('toggling the primary does not change what the split pane renders', () => {
    const events = [
      makeEvent(1, { type: 'assistant_text', text: 'one' }),
      makeEvent(2, { type: 'system', subtype: 'hook_started', data: null }),
      makeEvent(3, { type: 'system', subtype: 'hook_progress', data: null }),
    ];
    render(
      <>
        <TranscriptPane {...props({ view: makeView(events) })} />
        <TranscriptPane
          {...props({ isSplit: true, lane: makeCalf('lane-calf-1'), view: makeView(events) })}
        />
      </>,
    );

    const primary = screen.getByTestId('transcript-primary');
    const split = screen.getByTestId('transcript-split');
    expect(renderedSeqs(primary)).toEqual(['1']);
    expect(renderedSeqs(split)).toEqual(['1']);

    fireEvent.click(screen.getByTestId(PRIMARY_FILTER));

    expect(renderedSeqs(primary)).toEqual(['1', '2', '3']);
    // Unchanged — a shared mode would have expanded this one too.
    expect(renderedSeqs(split)).toEqual(['1']);
    expect(screen.getByTestId(SPLIT_FILTER).getAttribute('aria-pressed')).toBe('false');
  });
});

// ---------------------------------------------------------------------------
// AC9 — the follower pane carries its own unpin control
// ---------------------------------------------------------------------------

describe('the follower pane unpin control (AC9)', () => {
  it('renders in the split pane when onHide is given, and calls it exactly once', () => {
    const onHide = vi.fn();
    render(
      <TranscriptPane
        {...props({
          isSplit: true,
          lane: makeCalf('lane-calf-1'),
          onHide,
          view: makeView([makeEvent(1, { type: 'assistant_text', text: 'pinned' })]),
        })}
      />,
    );

    const unpin = screen.getByTestId(PANE_TEST_IDS.transcriptUnpin);
    expect(unpin.tagName).toBe('BUTTON');
    expect(within(screen.getByTestId('transcript-split')).getByTestId('transcript-unpin')).toBe(
      unpin,
    );

    fireEvent.click(unpin);
    expect(onHide).toHaveBeenCalledTimes(1);
  });

  it('is ABSENT from the primary pane in every state, onHide given or not', () => {
    const view = makeView([makeEvent(1, { type: 'assistant_text', text: 'x' })]);
    for (const overrides of [
      { isSplit: false as const, view },
      { isSplit: false as const, view, onHide: vi.fn() },
      { isSplit: false as const, view: makeView([]) },
      { isSplit: false as const, view: makeView([]), onHide: vi.fn() },
      { isSplit: false as const, view, lane: null },
      { isSplit: false as const, view, onHide: vi.fn(), lane: null },
    ]) {
      const { unmount } = render(<TranscriptPane {...props(overrides)} />);
      expect(screen.getByTestId('transcript-primary')).toBeTruthy();
      expect(screen.queryByTestId(PANE_TEST_IDS.transcriptUnpin)).toBeNull();
      unmount();
    }
  });

  it('is absent from the split pane when onHide is not supplied', () => {
    render(
      <TranscriptPane
        {...props({ isSplit: true, lane: makeCalf('lane-calf-1'), view: makeView([]) })}
      />,
    );
    expect(screen.getByTestId('transcript-split')).toBeTruthy();
    expect(screen.queryByTestId(PANE_TEST_IDS.transcriptUnpin)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// AC10 — the inline dispatch card survives the filter, in BOTH modes
// ---------------------------------------------------------------------------

describe('the dispatch card is conversation, not plumbing (AC10)', () => {
  it('renders on its tool_use event in both filter modes', () => {
    const events = [
      makeEvent(1, { type: 'system', subtype: 'init', data: null }),
      makeDispatchEvent(2, 'Agent', 'lane-calf-1'),
      makeEvent(3, { type: 'assistant_text', text: 'dispatched' }),
    ];
    render(
      <TranscriptPane
        {...props({
          view: makeView(events),
          lanes: [makeLane(), makeCalf('lane-calf-1')],
        })}
      />,
    );

    const dispatchRow = () => screen.getByTestId('transcript-event:2');
    expect(within(dispatchRow()).getByTestId('dispatch-card')).toBeTruthy();
    expect(within(dispatchRow()).getByTestId('dispatch-card-agent')).toBeTruthy();
    // The plumbing around it is gone; the card is not.
    expect(screen.queryByTestId('transcript-event:1')).toBeNull();

    fireEvent.click(screen.getByTestId(PRIMARY_FILTER));
    expect(within(dispatchRow()).getByTestId('dispatch-card')).toBeTruthy();
    expect(within(dispatchRow()).getByTestId('dispatch-card-agent')).toBeTruthy();
    expect(screen.getByTestId('transcript-event:1')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// The filtered-empty lane says so, rather than claiming the lane is empty
// ---------------------------------------------------------------------------

describe('a lane that is all plumbing', () => {
  it('distinguishes "filtered to nothing" from "no events yet"', () => {
    const { unmount } = render(<TranscriptPane {...props({ view: makeView([]) })} />);
    expect(screen.getByText('No events in this lane yet.')).toBeTruthy();
    unmount();

    render(
      <TranscriptPane
        {...props({
          view: makeView([makeEvent(1, { type: 'system', subtype: 'init', data: null })]),
        })}
      />,
    );
    expect(screen.queryByText('No events in this lane yet.')).toBeNull();
    expect(screen.getByTestId(PRIMARY_FILTER).getAttribute('aria-label')).toBe(
      'Show 1 hidden system events',
    );
    fireEvent.click(screen.getByTestId(PRIMARY_FILTER));
    expect(screen.getByTestId('transcript-event:1')).toBeTruthy();
  });
});
