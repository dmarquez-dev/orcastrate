// @vitest-environment jsdom
/**
 * The panel, driven through `PANEL_TEST_IDS` and asserted on what a user can
 * see. Nothing here reads component state, and nothing here mounts a provider:
 * the panel is a pure function of `BeachcomberPanelProps`, which is what makes
 * that possible.
 */
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import { PANEL_TEST_IDS, type BeachcomberPanelProps } from '../contracts/renderer-panels';
import { testId } from '../shell/contract-runtime';
import { BeachcomberPanel } from './BeachcomberPanel';
import { BEACHCOMBER_LOCAL_TEST_IDS } from './copy';
import {
  makeBlockedRow,
  makeEntry,
  makeError,
  makeGroup,
  makeRow,
  makeTrashResult,
  makeView,
  recordActions,
  type RecordedActions,
} from './test-fixtures';

// `vitest.config.ts` sets `globals: false`, so RTL installs no auto-cleanup.
afterEach(cleanup);

function renderPanel(view: Partial<BeachcomberPanelProps['view']> = {}): RecordedActions {
  const actions = recordActions();
  render(<BeachcomberPanel actions={actions} view={makeView(view)} />);
  return actions;
}

describe('grouping (AC2)', () => {
  it('renders one group per root, with heading, display path, entry count and total size', () => {
    renderPanel({
      value: [
        makeGroup({
          root: 'projects',
          heading: 'Projects',
          displayPath: '~/.claude/projects',
          rows: [makeRow(makeEntry({ id: 'a' })), makeRow(makeEntry({ id: 'b' }))],
          totalBytes: 1024 * 1024,
        }),
        makeGroup({
          root: 'pasteCache',
          heading: 'Paste cache',
          displayPath: '~/.claude/paste-cache',
          rows: [makeRow(makeEntry({ id: 'c', root: 'pasteCache', sessionCount: null }))],
          totalBytes: 512,
        }),
      ],
    });

    const projects = screen.getByTestId(testId(PANEL_TEST_IDS.beachcomberGroup, 'projects'));
    expect(within(projects).getByText('Projects')).toBeDefined();
    expect(within(projects).getByText('~/.claude/projects')).toBeDefined();
    expect(within(projects).getByText('2 entries · 1 MB')).toBeDefined();

    const paste = screen.getByTestId(testId(PANEL_TEST_IDS.beachcomberGroup, 'pasteCache'));
    expect(within(paste).getByText('Paste cache')).toBeDefined();
    expect(within(paste).getByText('1 entry · 512 B')).toBeDefined();
  });

  it('renders a failed root’s OS message while every other group still renders its rows', () => {
    renderPanel({
      value: [
        makeGroup({
          root: 'fileHistory',
          heading: 'File history',
          rows: [],
          error: 'EACCES: permission denied, scandir ~/.claude/file-history',
        }),
        makeGroup({ root: 'projects', rows: [makeRow(makeEntry({ id: 'survivor' }))] }),
      ],
    });

    const broken = screen.getByTestId(testId(PANEL_TEST_IDS.beachcomberGroup, 'fileHistory'));
    expect(
      within(broken).getByTestId(PANEL_TEST_IDS.beachcomberGroupError).textContent,
    ).toBe('EACCES: permission denied, scandir ~/.claude/file-history');

    // The other group is untouched by its neighbour's failure.
    expect(screen.getByTestId(testId(PANEL_TEST_IDS.beachcomberRow, 'survivor'))).toBeDefined();
  });
});

describe('multi-select (AC3)', () => {
  it('gives every selectable row a labelled checkbox that names the entry', async () => {
    const user = userEvent.setup();
    const actions = renderPanel({
      value: [makeGroup({ rows: [makeRow(makeEntry({ id: 'a', name: 'project-alpha' }))] })],
    });

    const row = screen.getByTestId(testId(PANEL_TEST_IDS.beachcomberRow, 'a'));
    const checkbox = within(row).getByTestId(PANEL_TEST_IDS.beachcomberRowSelect);
    // Programmatically associated: the accessible name comes from the label.
    expect(within(row).getByLabelText('project-alpha')).toBe(checkbox);

    await user.click(checkbox);
    expect(actions.calls.toggle).toEqual(['a']);
  });

  it('reflects selection, and the group toggle asks for the whole group', async () => {
    const user = userEvent.setup();
    const actions = renderPanel({
      value: [
        makeGroup({
          root: 'projects',
          rows: [
            makeRow(makeEntry({ id: 'a' }), { selected: true }),
            makeRow(makeEntry({ id: 'b' })),
          ],
        }),
      ],
      selectedIds: ['a'],
      selectedBytes: 2048,
    });

    const group = screen.getByTestId(testId(PANEL_TEST_IDS.beachcomberGroup, 'projects'));
    const toggle = within(group).getByTestId<HTMLInputElement>(
      PANEL_TEST_IDS.beachcomberGroupToggle,
    );
    // Partially selected: mixed, not checked.
    expect(toggle.checked).toBe(false);
    expect(toggle.getAttribute('aria-checked')).toBe('mixed');
    expect(toggle.indeterminate).toBe(true);

    await user.click(toggle);
    expect(actions.calls.toggleGroup).toEqual(['projects']);

    expect(
      screen.getByTestId(BEACHCOMBER_LOCAL_TEST_IDS.selectionSummary).textContent,
    ).toBe('1 item selected · 2 KB');
  });

  it('disables the group toggle when the group has no selectable row', () => {
    renderPanel({ value: [makeGroup({ root: 'projects', rows: [makeBlockedRow()] })] });

    const group = screen.getByTestId(testId(PANEL_TEST_IDS.beachcomberGroup, 'projects'));
    const toggle = within(group).getByTestId<HTMLInputElement>(
      PANEL_TEST_IDS.beachcomberGroupToggle,
    );
    expect(toggle.disabled).toBe(true);
  });
});

describe('there is no path from a row to a deletion (AC6)', () => {
  it('never calls trashPreviewed, however hard the panel is clicked, while no preview is shown', async () => {
    const user = userEvent.setup();
    const actions = renderPanel({
      value: [
        makeGroup({
          rows: [
            makeRow(makeEntry({ id: 'a' }), { selected: true }),
            makeRow(makeEntry({ id: 'b' }), { selected: true }),
            makeBlockedRow(),
          ],
        }),
      ],
      selectedIds: ['a', 'b'],
      selectedBytes: 4096,
      lastResult: makeTrashResult(),
      preview: null,
    });

    const panel = screen.getByTestId(PANEL_TEST_IDS.beachcomberPanel);
    const controls = [
      ...panel.querySelectorAll<HTMLButtonElement | HTMLInputElement>('button, input'),
    ].filter((control) => !control.disabled);
    // Vacuity guard: a panel with nothing enabled would pass this trivially.
    expect(controls.length).toBeGreaterThanOrEqual(5);

    for (const control of controls) {
      await user.click(control);
      // And by keyboard, since a checkbox answers Space as well as a click.
      control.focus();
      await user.keyboard(' ');
    }

    expect(actions.calls.trashPreviewed).toBe(0);
    // The preview dialog is the only thing that could have offered one, and it
    // was never rendered.
    expect(screen.queryByTestId(PANEL_TEST_IDS.beachcomberPreviewDialog)).toBeNull();
    expect(screen.queryByTestId(PANEL_TEST_IDS.beachcomberPreviewConfirm)).toBeNull();
  });

  it('routes the preview button to requestPreview and nothing else', async () => {
    const user = userEvent.setup();
    const actions = renderPanel({ selectedIds: ['a'], selectedBytes: 10 });

    await user.click(screen.getByTestId(PANEL_TEST_IDS.beachcomberPreviewButton));
    expect(actions.calls.requestPreview).toBe(1);
    expect(actions.calls.trashPreviewed).toBe(0);
  });

  it('disables the preview button when nothing is selected', () => {
    renderPanel({ selectedIds: [] });
    const button = screen.getByTestId<HTMLButtonElement>(PANEL_TEST_IDS.beachcomberPreviewButton);
    expect(button.disabled).toBe(true);
  });
});

describe('errors are always on screen (AC8)', () => {
  it('renders a failed scan’s message at beachcomberError', () => {
    renderPanel({
      phase: 'error',
      value: [],
      error: makeError('EPERM: operation not permitted, scandir ~/.claude'),
      actionError: 'EPERM: operation not permitted, scandir ~/.claude',
    });

    const surface = screen.getByTestId(PANEL_TEST_IDS.beachcomberError);
    expect(surface.textContent).toBe('EPERM: operation not permitted, scandir ~/.claude');
    // Both fields carry the same sentence after a failed scan; saying it twice
    // would read as two failures.
    expect(surface.querySelectorAll('p')).toHaveLength(1);
  });

  it('renders an action failure while the panel is still ready', () => {
    renderPanel({ phase: 'ready', actionError: 'The recycle bin refused the item.' });

    expect(screen.getByTestId(PANEL_TEST_IDS.beachcomberError).textContent).toBe(
      'The recycle bin refused the item.',
    );
    // Still a working panel, not an error page.
    expect(screen.getByTestId(PANEL_TEST_IDS.beachcomberRescan)).toBeDefined();
  });

  it('renders no error surface when there is nothing to say', () => {
    renderPanel({});
    expect(screen.queryByTestId(PANEL_TEST_IDS.beachcomberError)).toBeNull();
  });
});

describe('the result reports both halves (AC9)', () => {
  it('names what was trashed and what failed, with the OS message verbatim', () => {
    renderPanel({
      lastResult: makeTrashResult({
        trashed: ['a', 'b'],
        failed: [
          {
            id: 'c',
            displayPath: 'C:\\Users\\dmarq\\locked',
            message: 'EBUSY: resource busy or locked, unlink',
          },
        ],
        refused: [
          {
            id: 'd',
            displayPath: 'C:\\Users\\dmarq\\Repos\\router',
            reason: 'A Pod is using this directory.',
          },
        ],
      }),
    });

    const result = screen.getByTestId(PANEL_TEST_IDS.beachcomberResult);
    const summary = within(result).getByTestId(BEACHCOMBER_LOCAL_TEST_IDS.resultSummary);
    // A PARTIAL SUCCESS MUST NOT READ AS A SUCCESS.
    expect(summary.textContent).toContain('Moved 2 items to the recycle bin.');
    expect(summary.textContent).toContain('1 item could not be moved');

    const failures = within(result).getAllByTestId(PANEL_TEST_IDS.beachcomberResultFailure);
    expect(failures.map((node) => node.textContent)).toEqual([
      'EBUSY: resource busy or locked, unlink',
    ]);
    expect(within(result).getByText('A Pod is using this directory.')).toBeDefined();
    // Each refusal names its entry, not only why it was refused.
    const refusedList = within(result).getByTestId(`${PANEL_TEST_IDS.beachcomberResult}-refused`);
    expect(within(refusedList).getByText('C:\\Users\\dmarq\\Repos\\router')).toBeDefined();
  });

  it('reads as a clean success only when nothing failed', () => {
    renderPanel({ lastResult: makeTrashResult({ trashed: ['a'], failed: [] }) });

    expect(
      screen.getByTestId(BEACHCOMBER_LOCAL_TEST_IDS.resultSummary).textContent,
    ).toBe('Moved 1 item to the recycle bin.');
    expect(screen.queryAllByTestId(PANEL_TEST_IDS.beachcomberResultFailure)).toEqual([]);
  });
});

describe('loading, empty and error are three distinguishable states (AC10)', () => {
  it('says a scan is running', () => {
    renderPanel({ phase: 'loading', value: [] });

    expect(screen.getByTestId(BEACHCOMBER_LOCAL_TEST_IDS.loading)).toBeDefined();
    expect(screen.queryByTestId(BEACHCOMBER_LOCAL_TEST_IDS.empty)).toBeNull();
    expect(screen.queryByTestId(PANEL_TEST_IDS.beachcomberError)).toBeNull();
  });

  it('says in words that a finished scan found nothing, rather than rendering a blank panel', () => {
    renderPanel({ phase: 'ready', value: [] });

    const empty = screen.getByTestId(BEACHCOMBER_LOCAL_TEST_IDS.empty);
    expect(empty.textContent).toContain('Nothing to clear');
    expect(screen.queryByTestId(BEACHCOMBER_LOCAL_TEST_IDS.loading)).toBeNull();
    expect(screen.queryByTestId(PANEL_TEST_IDS.beachcomberError)).toBeNull();
  });

  it('says a scan failed, and says neither of the other two things', () => {
    renderPanel({ phase: 'error', value: [], error: makeError('the bridge is down') });

    expect(screen.getByTestId(PANEL_TEST_IDS.beachcomberError)).toBeDefined();
    expect(screen.queryByTestId(BEACHCOMBER_LOCAL_TEST_IDS.loading)).toBeNull();
    expect(screen.queryByTestId(BEACHCOMBER_LOCAL_TEST_IDS.empty)).toBeNull();
  });
});

describe('the toolbar (AC1, AC10)', () => {
  it('asks for a rescan and for a cleared selection, and fetches nothing itself', async () => {
    const user = userEvent.setup();
    const actions = renderPanel({ selectedIds: ['a'], selectedBytes: 1 });

    // A render alone issues nothing: the panel states what it needs and the
    // hook's mount is what scans.
    expect(actions.calls.rescan).toBe(0);

    await user.click(screen.getByTestId(PANEL_TEST_IDS.beachcomberRescan));
    expect(actions.calls.rescan).toBe(1);

    await user.click(screen.getByTestId(BEACHCOMBER_LOCAL_TEST_IDS.clearSelection));
    expect(actions.calls.clearSelection).toBe(1);
  });

  it('keeps the rows visible while a rescan is in flight', () => {
    renderPanel({ phase: 'loading', value: [makeGroup({ rows: [makeRow(makeEntry({ id: 'a' }))] })] });

    expect(screen.getByTestId(testId(PANEL_TEST_IDS.beachcomberRow, 'a'))).toBeDefined();
    expect(screen.getByTestId(BEACHCOMBER_LOCAL_TEST_IDS.loading)).toBeDefined();
  });
});
