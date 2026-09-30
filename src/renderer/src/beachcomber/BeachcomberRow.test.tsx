// @vitest-environment jsdom
/**
 * The row, which is where this feature's three safety properties live: a
 * blocked row cannot be selected, an unverified path is labelled a guess, and
 * an unverified row is never called an orphan.
 */
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import {
  PANEL_TEST_IDS,
  UNVERIFIED_PATH_NOTICE,
  type BeachcomberRowVm,
} from '../contracts/renderer-panels';
import { testId } from '../shell/contract-runtime';
import { BeachcomberRow } from './BeachcomberRow';
import { makeBlockedRow, makeEntry, makeRow, makeUnverifiedRow } from './test-fixtures';

afterEach(cleanup);

function renderRow(row: BeachcomberRowVm): { toggled: string[] } {
  const toggled: string[] = [];
  render(
    <ul>
      <BeachcomberRow
        onToggle={(id) => {
          toggled.push(id);
        }}
        row={row}
      />
    </ul>,
  );
  return { toggled };
}

describe('a blocked row is visibly and programmatically unselectable (AC4)', () => {
  it('is aria-disabled, and says which Pod holds it and what to do', () => {
    const row = makeBlockedRow();
    renderRow(row);

    const element = screen.getByTestId(testId(PANEL_TEST_IDS.beachcomberRow, 'entry-blocked'));
    expect(element.getAttribute('aria-disabled')).toBe('true');

    const reason = within(element).getByTestId(PANEL_TEST_IDS.beachcomberRowBlocked);
    expect(reason.textContent).toBe(
      'Refactor the router uses this directory. Delete that Pod first.',
    );
    // Names the Pod, and says what to do about it.
    expect(reason.textContent).toContain('Refactor the router');
    expect(reason.textContent).toContain('Delete that Pod first.');
  });

  it('carries the blocked state in text and ARIA, not in colour alone', () => {
    renderRow(makeBlockedRow());

    const element = screen.getByTestId(testId(PANEL_TEST_IDS.beachcomberRow, 'entry-blocked'));
    // Text a screen reader and a monochrome display both get.
    expect(element.textContent).toContain('Cannot be selected');
    expect(
      within(element).getByTestId<HTMLInputElement>(PANEL_TEST_IDS.beachcomberRowSelect)
        .getAttribute('aria-disabled'),
    ).toBe('true');
  });

  it('has a checkbox that answers neither a click nor the keyboard', async () => {
    const user = userEvent.setup();
    const { toggled } = renderRow(makeBlockedRow());

    const checkbox = screen.getByTestId<HTMLInputElement>(PANEL_TEST_IDS.beachcomberRowSelect);
    expect(checkbox.disabled).toBe(true);

    await user.click(checkbox);
    expect(toggled).toEqual([]);

    // Not in the tab order, and unmoved by the key that toggles a checkbox.
    checkbox.focus();
    expect(document.activeElement).not.toBe(checkbox);
    await user.keyboard(' ');
    expect(toggled).toEqual([]);
    expect(checkbox.checked).toBe(false);
  });

  it('leaves a selectable row fully operable, by mouse and by keyboard', async () => {
    const user = userEvent.setup();
    const { toggled } = renderRow(makeRow(makeEntry({ id: 'free' })));

    const checkbox = screen.getByTestId<HTMLInputElement>(PANEL_TEST_IDS.beachcomberRowSelect);
    expect(checkbox.disabled).toBe(false);

    await user.click(checkbox);
    checkbox.focus();
    await user.keyboard(' ');
    expect(toggled).toEqual(['free', 'free']);
  });
});

describe('an unverified path is labelled a guess (AC5)', () => {
  it('renders the contract’s notice verbatim', () => {
    renderRow(makeUnverifiedRow());

    const notice = screen.getByTestId(PANEL_TEST_IDS.beachcomberRowUnverified);
    expect(notice.textContent).toBe(UNVERIFIED_PATH_NOTICE);
  });

  it('never marks an unverified row as an orphan, even if the entry claims to be one', () => {
    // The contract forbids this combination; the panel must not render an
    // orphan marker even if one ever reached it, because "this path does not
    // exist" is unfalsifiable when the path itself is a guess.
    renderRow(makeUnverifiedRow({ orphan: true }));

    expect(screen.getByTestId(PANEL_TEST_IDS.beachcomberRowUnverified)).toBeDefined();
    expect(screen.queryByTestId(PANEL_TEST_IDS.beachcomberRowOrphan)).toBeNull();
  });

  it('renders no notice for a path read from a session record', () => {
    renderRow(makeRow(makeEntry({ pathSource: 'session-record' })));
    expect(screen.queryByTestId(PANEL_TEST_IDS.beachcomberRowUnverified)).toBeNull();
  });

  it('marks a verified orphan as text rather than as a colour', () => {
    renderRow(makeRow(makeEntry({ id: 'gone', orphan: true, pathSource: 'session-record' })));

    const marker = screen.getByTestId(PANEL_TEST_IDS.beachcomberRowOrphan);
    expect(marker.textContent).toBe('Working directory no longer exists');
  });
});

describe('what a row shows about its entry', () => {
  it('shows the name, the display path and the size, file and session counts', () => {
    renderRow(
      makeRow(
        makeEntry({
          id: 'shown',
          name: 'C--Users-dmarq-repo',
          displayPath: 'C:\\Users\\dmarq\\repo',
          sizeBytes: 1536,
          fileCount: 1,
          sessionCount: 2,
          lastModified: '2026-08-17T22:15:00.000Z',
        }),
      ),
    );

    const element = screen.getByTestId(testId(PANEL_TEST_IDS.beachcomberRow, 'shown'));
    expect(within(element).getByText('C--Users-dmarq-repo')).toBeDefined();
    expect(within(element).getByText('C:\\Users\\dmarq\\repo')).toBeDefined();
    expect(within(element).getByText('1.5 KB · 1 file · 2 sessions · modified 2026-08-17')).toBeDefined();
  });

  it('omits the session count for a root that has none', () => {
    renderRow(makeRow(makeEntry({ id: 'paste', root: 'pasteCache', sessionCount: null })));

    const element = screen.getByTestId(testId(PANEL_TEST_IDS.beachcomberRow, 'paste'));
    expect(element.textContent).not.toContain('session');
  });
});

/**
 * DOM ORDER, NOT WORDING (T5, contract section 7). A caveat that arrives after
 * the thing it qualifies has already been read is not a caveat. These tests
 * compare rendered node positions, never the source text.
 */
describe('the notice that the path is a guess arrives before the guess (T5)', () => {
  /** Positions of the given nodes in document order within `root`. */
  function positions(root: HTMLElement, nodes: readonly Element[]): number[] {
    const all = [...root.querySelectorAll('*')];
    return nodes.map((node) => all.indexOf(node));
  }

  /**
   * Position of one node in document order within `root`. Throws rather than
   * returning a sentinel: a node that is not rendered is a test failure, not a
   * comparison against -1 or `undefined`.
   */
  function positionOf(root: HTMLElement, node: Element, label: string): number {
    const at = positions(root, [node])[0];
    if (at === undefined || at < 0) {
      throw new Error(`${label} is not rendered inside the row, so document order cannot be read`);
    }
    return at;
  }

  function rowElement(id: string): HTMLElement {
    return screen.getByTestId(testId(PANEL_TEST_IDS.beachcomberRow, id));
  }

  it('renders the unverified notice ahead of the display path (V1)', () => {
    const row = makeUnverifiedRow();
    renderRow(row);

    const element = rowElement('entry-unverified');
    const notice = within(element).getByTestId(PANEL_TEST_IDS.beachcomberRowUnverified);
    const path = within(element).getByText(row.entry.displayPath);

    expect(
      notice.compareDocumentPosition(path) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);

    const noticeAt = positionOf(element, notice, 'the unverified notice');
    const pathAt = positionOf(element, path, 'the display path');
    expect(pathAt).toBeGreaterThan(noticeAt);
  });

  it('moves only the notice: everything else keeps its order around the path (V4)', () => {
    const row = makeBlockedRow({ pathSource: 'decoded-name', orphan: false });
    renderRow(row);

    const element = rowElement('entry-blocked');
    const ordered = positions(element, [
      within(element).getByTestId<HTMLInputElement>(PANEL_TEST_IDS.beachcomberRowSelect),
      within(element).getByTestId(PANEL_TEST_IDS.beachcomberRowUnverified),
      within(element).getByText(row.entry.displayPath),
      within(element).getByText(/modified 2026-08-18/),
      within(element).getByTestId(PANEL_TEST_IDS.beachcomberRowBlocked),
    ]);

    expect(ordered).toEqual([...ordered].sort((a, b) => a - b));
    expect(ordered.filter((at) => at < 0)).toEqual([]);
  });

  it('keeps the checkbox described by both notices when blocked and unverified (V3)', () => {
    renderRow(makeBlockedRow({ pathSource: 'decoded-name' }));

    const element = rowElement('entry-blocked');
    const checkbox = within(element).getByTestId<HTMLInputElement>(
      PANEL_TEST_IDS.beachcomberRowSelect,
    );
    expect(checkbox.disabled).toBe(true);
    expect(element.getAttribute('aria-disabled')).toBe('true');

    const ids = (checkbox.getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean);
    expect(ids).toHaveLength(2);
    const described = ids.map((id) => element.querySelector(`#${CSS.escape(id)}`));
    expect(described).toEqual([
      within(element).getByTestId(PANEL_TEST_IDS.beachcomberRowBlocked),
      within(element).getByTestId(PANEL_TEST_IDS.beachcomberRowUnverified),
    ]);
  });

  it('leaves a session-record row exactly as it was: no notice, nothing reordered (V4)', () => {
    const row = makeRow(makeEntry({ id: 'verified', pathSource: 'session-record' }));
    renderRow(row);

    const element = rowElement('verified');
    expect(within(element).queryByTestId(PANEL_TEST_IDS.beachcomberRowUnverified)).toBeNull();

    const ordered = positions(element, [
      within(element).getByTestId<HTMLInputElement>(PANEL_TEST_IDS.beachcomberRowSelect),
      within(element).getByText(row.entry.displayPath),
      within(element).getByText(/modified 2026-08-18/),
    ]);
    expect(ordered).toEqual([...ordered].sort((a, b) => a - b));
    expect(ordered.filter((at) => at < 0)).toEqual([]);
  });
});
