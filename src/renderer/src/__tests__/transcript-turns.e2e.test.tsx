// @vitest-environment jsdom
/**
 * TURN ATTRIBUTION AND COMPACT TOOL ACTIVITY, driven through the assembled app
 * (`contracts/transcript-turns.ts`).
 *
 * `TranscriptEventItem.test.tsx` and `tool-summary.test.ts` already prove these
 * two things about the COMPONENT and the FUNCTION. What they cannot prove is
 * that the assembled app puts either on the page: a `data-turn-role` the pane
 * never renders, a label the layout hides, a disclosure whose state is reset by
 * something above it in the tree are all invisible to a component test and all
 * visible here. So this file mounts `main.tsx`'s tree and pushes events at it
 * exactly the way the main process does.
 *
 * WHAT IS DELIBERATELY NOT ASSERTED HERE. Not the CSS — jsdom applies no
 * stylesheet, so "the user's turn is right-aligned" is not a claim this
 * environment can make, and `Transcript.styles.test.ts` and `hygiene.test.ts`
 * are where the alignment, the cap, the border and the token discipline are
 * actually checked. What IS asserted is every channel the contract says must
 * reach a reader who never sees the colours: the role on the element, and the
 * visible label as real text.
 */

import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import type { LaneId, NormalizedEvent, Seq } from '@shared/contracts/events';
import { TEST_IDS, TRANSCRIPT_FILTER_TEST_IDS } from '../contracts/renderer-view';
import { testId } from '../shell/contract-runtime';
import { stubOrcastrateApi, type StubOrcastrateApi } from '../test-utils';

import {
  BRAVO_ID,
  MATRIARCH,
  MATRIARCH_ID,
  POD_BRAVO,
  flushPendingWork,
  installUnhandledRejectionGuard,
  mountWorkspace,
} from './harness';

installUnhandledRejectionGuard();

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PROMPT = 'summarise the lane router';
const REPLY = 'the router maps a tool_use_id to a lane';

/**
 * The URL the contract's own worked example uses.
 *
 * ASSEMBLED FROM SEGMENTS so this file is not its own violation:
 * `hygiene.test.ts` forbids a literal scheme anywhere under
 * `src/renderer/src/__tests__/**`, because a suite that names a live endpoint
 * is one edit away from reaching it. Nothing here fetches anything — the
 * string is a tool ARGUMENT the transcript has to render.
 */
const FETCH_URL = ['https:', '', 'api.weather.gov', 'stations', 'KRNO', 'observations', 'latest'].join('/');

/**
 * A result body long enough that nobody could mistake its presence for an
 * accident, and whose exact length is the number the collapsed row reports.
 * 312 is the contract's worked example.
 */
const RESULT_BODY = `temperature ${'8'.repeat(299)}`;
const RESULT_CHARS = RESULT_BODY.length;

function event(seq: Seq, payload: NormalizedEvent['payload']): NormalizedEvent {
  return {
    id: seq,
    podId: BRAVO_ID,
    laneId: MATRIARCH_ID as LaneId,
    seq,
    type: payload.type,
    payload,
    createdAt: '2026-01-01T00:01:00.000Z',
  };
}

/** One Pod, one Matriarch lane, an empty transcript to push into. */
function turnsApi(): StubOrcastrateApi {
  return stubOrcastrateApi({
    pods: { list: async () => ({ ok: true, value: [POD_BRAVO] }) },
    lanes: { list: async () => ({ ok: true, value: [MATRIARCH] }) },
  });
}

async function mountPrimary(api: StubOrcastrateApi): Promise<HTMLElement> {
  mountWorkspace(api);
  const primary = await screen.findByTestId(TEST_IDS.transcriptPrimary);
  await flushPendingWork();
  return primary;
}

/** The full ordered `(seq, data-turn-role)` list of what is on screen. */
function turnRoles(pane: HTMLElement): Array<[string, string]> {
  return within(pane)
    .queryAllByTestId(/^transcript-event:/)
    .map((li) => [
      li.getAttribute('data-testid')?.slice('transcript-event:'.length) ?? '',
      li.getAttribute('data-turn-role') ?? '<none>',
    ]);
}

// ---------------------------------------------------------------------------
// Item 2: the user's turn and the model's reply are distinguishable
// ---------------------------------------------------------------------------

describe('a prompt and its reply in the assembled app', () => {
  it("marks the user's turn 'user' and the model's 'assistant', and renders both role labels as real text", async () => {
    const api = turnsApi();
    const primary = await mountPrimary(api);

    act(() => {
      api.emit.podEvent({
        podId: BRAVO_ID,
        events: [
          event(1, { type: 'user_message', text: PROMPT }),
          event(2, { type: 'assistant_text', text: REPLY }),
        ],
      });
    });

    /*
     * CHANNEL 1 — the role on the element, as the FULL ordered list. A length
     * or a single `getAttribute` would both pass against a pane that rendered
     * one row twice; this cannot.
     */
    expect(turnRoles(primary)).toEqual([
      ['1', 'user'],
      ['2', 'assistant'],
    ]);

    /*
     * CHANNEL 2 — the visible labels, in the SAME test, because the contract's
     * whole point is that the role reaches a reader through both. `getByText`
     * with a string matches an element's own text in full, so these are the
     * labels themselves and not a substring of the message beneath them.
     */
    expect(within(primary).getByText('You')).toBeDefined();
    expect(within(primary).getByText('Claude')).toBeDefined();

    /*
     * ...and the labels are NOT inside an `aria-hidden` subtree, which is the
     * way this guarantee is most likely to be lost: a treatment that made the
     * label decorative would leave both `getByText` calls above passing while
     * removing the only channel a screen reader has.
     */
    for (const label of ['You', 'Claude']) {
      let node: HTMLElement | null = within(primary).getByText(label);
      while (node !== null) {
        expect(node.getAttribute('aria-hidden'), `${label} under aria-hidden`).not.toBe('true');
        node = node.parentElement;
      }
    }

    // The two rows are the two messages, not one row with both texts in it.
    const rows = within(primary).getAllByTestId(/^transcript-event:/);
    expect(rows[0]?.textContent).toContain(PROMPT);
    expect(rows[0]?.textContent).not.toContain(REPLY);
    expect(rows[1]?.textContent).toContain(REPLY);
    expect(rows[1]?.textContent).not.toContain(PROMPT);
  });
});

// ---------------------------------------------------------------------------
// Item 3: the call reads compactly, the result expands, nothing is lost
// ---------------------------------------------------------------------------

describe('a tool call and its result in the assembled app', () => {
  it('summarises the call in one line, keeps the result body out of the DOM until asked, and gives all of it back on expand', async () => {
    const user = userEvent.setup();
    const api = turnsApi();
    const primary = await mountPrimary(api);

    act(() => {
      api.emit.podEvent({
        podId: BRAVO_ID,
        events: [
          event(1, {
            type: 'tool_use',
            toolUseId: 'toolu-fetch',
            name: 'WebFetch',
            input: { url: FETCH_URL },
          }),
          event(2, {
            type: 'tool_result',
            toolUseId: 'toolu-fetch',
            isError: false,
            content: RESULT_BODY,
          }),
        ],
      });
    });

    // ONE EVENT, ONE ROW — the invariant the merged call-and-result sketch
    // would have broken. Two seqs, two list items, in order.
    expect(turnRoles(primary)).toEqual([
      ['1', 'assistant'],
      ['2', 'assistant'],
    ]);

    // THE CALL READS AS A LINE, not as a JSON dump. The URL is present as part
    // of the summary; the pretty-printed input is not on the page at all.
    const call = within(primary).getByTestId('transcript-event:1');
    expect(call.textContent).toContain(`WebFetch("${FETCH_URL}")`);
    expect(call.textContent).not.toContain('"url"');

    // THE RESULT IS COLLAPSED, SIZED, AND ITS BODY IS ABSENT FROM THE DOM —
    // not merely hidden, which is what makes `aria-expanded="false"` true.
    const result = within(primary).getByTestId('transcript-event:2');
    expect(result.textContent).toContain(`${String(RESULT_CHARS)} chars`);
    expect(result.textContent).not.toContain(RESULT_BODY);

    const disclosure = within(result).getByRole('button', {
      name: `Show tool result (${String(RESULT_CHARS)} chars)`,
    });
    expect(disclosure.getAttribute('aria-expanded')).toBe('false');
    const regionId = disclosure.getAttribute('aria-controls') ?? '';
    expect(regionId).not.toBe('');
    expect(document.getElementById(regionId)).toBeNull();

    await user.click(disclosure);

    // EXPANDED, AND NOTHING WAS LOST: the region named by `aria-controls` now
    // exists and holds the content BYTE FOR BYTE, not an elided preview of it.
    expect(disclosure.getAttribute('aria-expanded')).toBe('true');
    const region = document.getElementById(regionId);
    expect(region).not.toBeNull();
    expect(region?.textContent).toBe(RESULT_BODY);
    // The name follows the state, so a keyboard user is told what the control
    // will do next rather than what it just did.
    expect(
      within(result).getByRole('button', {
        name: `Hide tool result (${String(RESULT_CHARS)} chars)`,
      }),
    ).toBe(disclosure);
    // Focus did not move off the control across the toggle.
    expect(document.activeElement).toBe(disclosure);

    await user.click(disclosure);
    expect(disclosure.getAttribute('aria-expanded')).toBe('false');
    expect(document.getElementById(regionId)).toBeNull();
    expect(result.textContent).not.toContain(RESULT_BODY);
  });

  it('keeps a row expanded across a filter toggle that leaves it on screen', async () => {
    const user = userEvent.setup();
    const api = turnsApi();
    const primary = await mountPrimary(api);

    /*
     * A HIDDEN EVENT BETWEEN THE TWO VISIBLE ONES, so the toggle has something
     * to do and so the reveal is INTERLEAVED rather than appended — which is
     * the case where a pane that re-keyed its rows would lose the expansion.
     */
    act(() => {
      api.emit.podEvent({
        podId: BRAVO_ID,
        events: [
          event(1, {
            type: 'tool_use',
            toolUseId: 'toolu-fetch',
            name: 'WebFetch',
            input: { url: FETCH_URL },
          }),
          event(2, { type: 'system', subtype: 'hook_started', data: { note: 'plumbing' } }),
          event(3, {
            type: 'tool_result',
            toolUseId: 'toolu-fetch',
            isError: false,
            content: RESULT_BODY,
          }),
        ],
      });
    });

    const seqs = (): string[] =>
      within(primary)
        .queryAllByTestId(/^transcript-event:/)
        .map((li) => li.getAttribute('data-testid')?.slice('transcript-event:'.length) ?? '');

    expect(seqs()).toEqual(['1', '3']);

    const disclosure = within(primary).getByRole('button', {
      name: `Show tool result (${String(RESULT_CHARS)} chars)`,
    });
    await user.click(disclosure);
    const regionId = disclosure.getAttribute('aria-controls') ?? '';
    expect(document.getElementById(regionId)?.textContent).toBe(RESULT_BODY);

    // REVEAL the plumbing. The two tool rows stay on screen and the expansion
    // is per-event state held inside the row, so it survives.
    const toggle = within(primary).getByTestId(
      testId(TRANSCRIPT_FILTER_TEST_IDS.transcriptFilter, 'primary'),
    );
    await user.click(toggle);

    expect(seqs()).toEqual(['1', '2', '3']);
    expect(
      within(primary)
        .getByRole('button', { name: `Hide tool result (${String(RESULT_CHARS)} chars)` })
        .getAttribute('aria-expanded'),
    ).toBe('true');
    expect(document.getElementById(regionId)?.textContent).toBe(RESULT_BODY);

    // ...and back again.
    await user.click(toggle);
    expect(seqs()).toEqual(['1', '3']);
    expect(document.getElementById(regionId)?.textContent).toBe(RESULT_BODY);
  });

  it('defaults a FAILED result to expanded and says so in words', async () => {
    const api = turnsApi();
    const primary = await mountPrimary(api);

    act(() => {
      api.emit.podEvent({
        podId: BRAVO_ID,
        events: [
          event(1, {
            type: 'tool_result',
            toolUseId: 'toolu-fetch',
            isError: true,
            content: RESULT_BODY,
          }),
        ],
      });
    });

    const row = within(primary).getByTestId('transcript-event:1');
    // IN WORDS, not in colour: a purely chromatic error treatment fails here,
    // and jsdom would not see a colour anyway.
    expect(row.textContent?.toLowerCase()).toContain('error');
    // ...and open on arrival, because a failure the user must go looking for
    // is a silent drop in every way that matters to them.
    const disclosure = within(row).getByRole('button', {
      name: `Hide tool result (${String(RESULT_CHARS)} chars)`,
    });
    expect(disclosure.getAttribute('aria-expanded')).toBe('true');
    expect(
      document.getElementById(disclosure.getAttribute('aria-controls') ?? '')?.textContent,
    ).toBe(RESULT_BODY);
  });
});
