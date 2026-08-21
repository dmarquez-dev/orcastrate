// @vitest-environment jsdom
/**
 * The counted label, and the plural defect
 * (`contracts/transcript-filter-amendment.ts` section 3).
 *
 * `LaneRail.tsx`'s `finishedLabel` is the local precedent that gets this
 * construction right; this file is the one that gets it wrong today, in two
 * places — the toggle's own name, and `TranscriptPane.tsx`'s filtered-empty
 * copy, which embeds the identical counted phrase. Both are asserted here so a
 * fix applied to one and not the other cannot pass.
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { TranscriptPaneProps } from '../contracts/renderer-view';
import { TranscriptPane } from './TranscriptPane';
import { filterToggleLabel } from './TranscriptFilterToggle';
import { makeEvent, makeLane, makeView } from './test-fixtures';

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

describe('filterToggleLabel — the six contracted strings, character for character', () => {
  const table: readonly ['conversation' | 'everything', number, string][] = [
    ['conversation', 0, 'Show system events'],
    ['conversation', 1, 'Show 1 hidden system event'],
    ['conversation', 2, 'Show 2 hidden system events'],
    ['conversation', 42, 'Show 42 hidden system events'],
    ['everything', 0, 'Hide system events'],
    ['everything', 1, 'Hide 1 system event'],
    ['everything', 2, 'Hide 2 system events'],
    ['everything', 42, 'Hide 42 system events'],
  ];

  for (const [mode, count, expected] of table) {
    it(`${mode} at ${count} reads "${expected}"`, () => {
      expect(filterToggleLabel(mode, count)).toBe(expected);
    });
  }
});

describe("the filtered-empty copy is singular at one too", () => {
  function renderAllPlumbing(count: number): string {
    render(
      <TranscriptPane
        {...props({
          view: makeView(
            Array.from({ length: count }, (_, i) =>
              makeEvent(i + 1, { type: 'system', subtype: 'hook_started', data: null }),
            ),
          ),
        })}
      />,
    );
    // POSITIVE: the pane really is in the filtered-empty state, not merely
    // empty — the toggle is present and names the same count.
    expect(screen.getByTestId('transcript-filter:primary')).toBeTruthy();
    return screen.getByTestId('transcript-primary').textContent ?? '';
  }

  it('says "1 hidden system event" at one, and the PRONOUN agrees too', () => {
    const text = renderAllPlumbing(1);
    expect(text).toContain('Show 1 hidden system event to read it.');
    expect(text).not.toContain('1 hidden system events');
    // A half-fixed sentence is still wrong: the noun agreeing while the pronoun
    // stays plural is the same defect one word later.
    expect(text).not.toContain('to read them.');
  });

  it('says "2 hidden system events" at two, with the plural pronoun', () => {
    const text = renderAllPlumbing(2);
    expect(text).toContain('Show 2 hidden system events to read them.');
    expect(text).not.toContain('to read it.');
  });
});
