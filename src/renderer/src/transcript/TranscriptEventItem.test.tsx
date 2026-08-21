// @vitest-environment jsdom
/**
 * The compact tool row and its disclosure (`contracts/transcript-turns.ts`
 * section 3), and the turn role every event's `<li>` carries (section 1).
 *
 * WHAT THIS SUITE IS BUILT NOT TO DO: pass against a pane that rendered
 * nothing. Every negative here — "the raw JSON is absent", "the result body is
 * absent" — is paired with a positive in the SAME test naming a row that must
 * be present, because `queryBy(...)` returning null is exactly what an empty
 * DOM returns too.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import type { EventPayload, EventType } from '@shared/contracts/events';

import type { TranscriptPaneProps } from '../contracts/renderer-view';
import { TranscriptPane } from './TranscriptPane';
import { makeCalf, makeEvent, makeLane, makeView } from './test-fixtures';

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

const WEATHER_URL = 'https://api.weather.gov/stations/KRNO/observations/latest';

// ---------------------------------------------------------------------------
// A `tool_use` row is a one-line summary, not a JSON dump
// ---------------------------------------------------------------------------

describe('a tool_use row renders a summary instead of a JSON dump', () => {
  it('shows the summary and keeps the pretty-printed input out of the DOM', () => {
    render(
      <TranscriptPane
        {...props({
          view: makeView([
            makeEvent(1, {
              type: 'tool_use',
              toolUseId: 'toolu_a',
              name: 'WebFetch',
              input: { url: WEATHER_URL },
            }),
          ]),
        })}
      />,
    );

    // POSITIVE FIRST. Without this the two negatives below pass against a pane
    // that rendered no rows at all.
    const row = screen.getByTestId('transcript-event:1');
    expect(row.getAttribute('data-event-type')).toBe('tool_use');
    expect(row.textContent).toContain(`WebFetch("${WEATHER_URL}")`);

    // The two-space-indented JSON `preview()` produces is NOT on the page.
    const prettyPrinted = JSON.stringify({ url: WEATHER_URL }, null, 2);
    expect(prettyPrinted).toContain('\n  "url"'); // the needle can fire
    expect(row.textContent ?? '').not.toContain('"url"');
    expect(document.body.textContent ?? '').not.toContain(prettyPrinted);
  });

  it('brings the raw input back, verbatim, when the input disclosure is expanded', async () => {
    const user = userEvent.setup();
    const input = { url: WEATHER_URL, prompt: 'summarise' };
    render(
      <TranscriptPane
        {...props({
          view: makeView([
            makeEvent(1, { type: 'tool_use', toolUseId: 'toolu_a', name: 'WebFetch', input }),
          ]),
        })}
      />,
    );

    const button = screen.getByRole('button', { name: 'Show tool input' });
    expect(button.getAttribute('aria-expanded')).toBe('false');
    const regionId = button.getAttribute('aria-controls');
    expect(regionId).toBeTruthy();
    expect(document.getElementById(regionId!)).toBeNull();

    await user.click(button);

    expect(screen.getByRole('button', { name: 'Hide tool input' })).toBe(button);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    const region = document.getElementById(regionId!);
    expect(region).not.toBeNull();
    // Byte-identical to what `preview()` produces today.
    expect(region!.textContent).toBe(JSON.stringify(input, null, 2));
    // Focus never left the control.
    expect(document.activeElement).toBe(button);

    await user.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(document.getElementById(regionId!)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// A `tool_result` row is collapsed, sized, expandable — and loses nothing
// ---------------------------------------------------------------------------

describe('a tool_result row is collapsed, sized, and expandable', () => {
  const body = 'x'.repeat(312);

  function renderResult(content: unknown, isError = false) {
    render(
      <TranscriptPane
        {...props({
          view: makeView([
            makeEvent(1, { type: 'tool_result', toolUseId: 'toolu_a', isError, content }),
          ]),
        })}
      />,
    );
    return screen.getByTestId('transcript-event:1');
  }

  it('reports the size, hides the body, and round-trips through two clicks', async () => {
    const user = userEvent.setup();
    const row = renderResult(body);

    // Positive: the row exists and says what it is.
    expect(row.getAttribute('data-event-type')).toBe('tool_result');
    expect(row.textContent).toContain('312 chars');

    const button = screen.getByRole('button', { name: 'Show tool result (312 chars)' });
    expect(button.getAttribute('aria-expanded')).toBe('false');
    const regionId = button.getAttribute('aria-controls')!;
    // `aria-controls` names an element that does not exist while collapsed —
    // the region is REMOVED, not merely hidden, so the page and the attribute
    // agree.
    expect(document.getElementById(regionId)).toBeNull();
    expect(screen.queryByText(body)).toBeNull();

    await user.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('button', { name: 'Hide tool result (312 chars)' })).toBe(button);
    const region = document.getElementById(regionId);
    expect(region).not.toBeNull();
    expect(region!.textContent).toBe(body);
    expect(document.activeElement).toBe(button);

    await user.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(document.getElementById(regionId)).toBeNull();
    expect(screen.queryByText(body)).toBeNull();
  });

  it('is singular at one char', () => {
    const row = renderResult('x');
    expect(row.textContent).toContain('1 char');
    expect(row.textContent).not.toContain('1 chars');
    expect(screen.getByRole('button', { name: 'Show tool result (1 char)' })).toBeTruthy();
  });

  it('is keyboard reachable and operable, and keeps focus across a toggle', async () => {
    const user = userEvent.setup();
    renderResult(body);
    const button = screen.getByRole('button', { name: 'Show tool result (312 chars)' });

    button.focus();
    expect(document.activeElement).toBe(button);
    await user.keyboard('{Enter}');
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(button);
    await user.keyboard(' ');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(button);
  });

  it('renders a non-string result through the same preview path', async () => {
    const user = userEvent.setup();
    const content = { ok: true, rows: [1, 2, 3] };
    const row = renderResult(content);
    const expected = JSON.stringify(content, null, 2);

    expect(row.textContent).toContain(`${JSON.stringify(content).length} chars`);
    await user.click(screen.getByRole('button', { name: /^Show tool result/ }));
    const regionId = screen
      .getByRole('button', { name: /^Hide tool result/ })
      .getAttribute('aria-controls')!;
    expect(document.getElementById(regionId)!.textContent).toBe(expected);
  });
});

describe('a FAILED tool result defaults to expanded and says so in words', () => {
  it('renders the body on first render and names the failure in text', () => {
    const body = 'ENOENT: no such file or directory';
    render(
      <TranscriptPane
        {...props({
          view: makeView([
            makeEvent(1, {
              type: 'tool_result',
              toolUseId: 'toolu_a',
              isError: true,
              content: body,
            }),
          ]),
        })}
      />,
    );

    const row = screen.getByTestId('transcript-event:1');
    const button = screen.getByRole('button', {
      name: `Hide tool result (${body.length} chars)`,
    });
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(document.getElementById(button.getAttribute('aria-controls')!)).not.toBeNull();
    expect(screen.getByText(body)).toBeTruthy();

    // In WORDS, not by a class name and not by a colour.
    expect((row.textContent ?? '').toLowerCase()).toContain('error');
  });

  it('leaves a SUCCESSFUL result collapsed — the exception is an exception', () => {
    render(
      <TranscriptPane
        {...props({
          view: makeView([
            makeEvent(1, { type: 'tool_result', toolUseId: 'toolu_a', isError: false, content: 'x' }),
          ]),
        })}
      />,
    );
    expect(screen.getByRole('button', { name: 'Show tool result (1 char)' }).getAttribute(
      'aria-expanded',
    )).toBe('false');
  });
});

// ---------------------------------------------------------------------------
// ONE EVENT, ONE `<li>`, ONE `transcript-event:<seq>`
// ---------------------------------------------------------------------------

describe('a call and its result stay two rows', () => {
  it('renders three list items for a call, an unrelated event, and a result', () => {
    render(
      <TranscriptPane
        {...props({
          view: makeView([
            makeEvent(1, {
              type: 'tool_use',
              toolUseId: 'toolu_a',
              name: 'WebFetch',
              input: { url: WEATHER_URL },
            }),
            makeEvent(2, { type: 'assistant_text', text: 'meanwhile' }),
            makeEvent(3, {
              type: 'tool_result',
              toolUseId: 'toolu_a',
              isError: false,
              content: 'x'.repeat(312),
            }),
          ]),
        })}
      />,
    );

    const items = [...document.querySelectorAll('ol li')];
    expect(items).toHaveLength(3);
    expect(items.map((el) => el.getAttribute('data-testid'))).toEqual([
      'transcript-event:1',
      'transcript-event:2',
      'transcript-event:3',
    ]);
  });
});

// ---------------------------------------------------------------------------
// Turn role, on every one of the twelve members
// ---------------------------------------------------------------------------

describe("every event's <li> carries a correct data-turn-role", () => {
  it('maps all twelve EventType members to the contracted role', () => {
    // `Record<EventType, …>` stops type-checking the moment the union grows,
    // so a thirteenth member cannot slip through unattributed.
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
    // Every member has to be ON SCREEN to be asserted, and six of them are
    // plumbing now, so this suite runs in 'everything' mode.
    fireEvent.click(screen.getByTestId('transcript-filter:primary'));

    const rows = [...document.querySelectorAll('ol li')];
    // THE FULL ORDERED LIST, not a length: a component that rendered nothing
    // cannot produce it.
    expect(
      rows.map((el) => [el.getAttribute('data-event-type'), el.getAttribute('data-turn-role')]),
    ).toEqual([
      ['user_message', 'user'],
      ['assistant_text', 'assistant'],
      ['thinking', 'assistant'],
      ['tool_use', 'assistant'],
      ['tool_result', 'assistant'],
      ['lane_opened', 'system'],
      ['lane_closed', 'system'],
      ['permission_request', 'system'],
      ['permission_decision', 'system'],
      ['system', 'system'],
      ['error', 'system'],
      ['malformed', 'system'],
    ]);
  });

  it('keeps the visible role labels as real text, outside any aria-hidden subtree', () => {
    render(
      <TranscriptPane
        {...props({
          view: makeView([
            makeEvent(1, { type: 'user_message', text: 'a prompt' }),
            makeEvent(2, { type: 'assistant_text', text: 'an answer' }),
          ]),
        })}
      />,
    );

    for (const label of ['You', 'Claude']) {
      const el = screen.getByText(label);
      expect(el.textContent).toBe(label);
      for (let node: HTMLElement | null = el; node !== null; node = node.parentElement) {
        expect(node.getAttribute('aria-hidden'), `${label} under aria-hidden`).not.toBe('true');
      }
    }
  });
});
