// @vitest-environment jsdom
/**
 * The preview: what it shows, and the accessibility floor a dialog has to
 * clear. The panel is rendered whole here rather than the dialog alone, because
 * "focus returns to the control that opened it" is a claim about both.
 */
import { useState, type JSX } from 'react';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import type { BeachcomberPreview } from '@shared/contracts/beachcomber';
import { PANEL_TEST_IDS } from '../contracts/renderer-panels';
import { testId } from '../shell/contract-runtime';
import { BeachcomberPanel } from './BeachcomberPanel';
import { BEACHCOMBER_LOCAL_TEST_IDS } from './copy';
import {
  makeEntry,
  makeGroup,
  makePreview,
  makePreviewItem,
  makeRow,
  makeView,
  recordActions,
  type RecordedActions,
} from './test-fixtures';

afterEach(cleanup);

function renderWithPreview(preview: BeachcomberPreview, trashing = false): RecordedActions {
  const actions = recordActions();
  render(
    <BeachcomberPanel
      actions={actions}
      view={makeView({
        value: [makeGroup({ rows: [makeRow(makeEntry({ id: 'entry-1' }), { selected: true })] })],
        selectedIds: ['entry-1'],
        selectedBytes: 2048,
        preview,
        trashing,
      })}
    />,
  );
  return actions;
}

/**
 * The panel with the preview under this component's own control, so opening
 * and closing it can be driven the way the state layer drives it.
 */
function OpenablePanel({ actions }: { actions: RecordedActions }): JSX.Element {
  const [preview, setPreview] = useState<BeachcomberPreview | null>(null);
  return (
    <BeachcomberPanel
      actions={{
        ...actions,
        requestPreview: async () => {
          setPreview(makePreview());
          return actions.requestPreview();
        },
        dismissPreview: () => {
          setPreview(null);
          actions.dismissPreview();
        },
      }}
      view={makeView({
        value: [makeGroup({ rows: [makeRow(makeEntry({ id: 'entry-1' }), { selected: true })] })],
        selectedIds: ['entry-1'],
        selectedBytes: 2048,
        preview,
      })}
    />
  );
}

describe('the preview shows exactly what will be removed (AC7)', () => {
  it('lists one item per id with its path, size, file count and sample names, plus the totals', () => {
    renderWithPreview(
      makePreview({
        items: [
          makePreviewItem({
            id: 'entry-1',
            displayPath: 'C:\\Users\\dmarq\\repo',
            sizeBytes: 2048,
            fileCount: 4,
            sampleNames: ['session-a.jsonl', 'session-b.jsonl'],
          }),
          makePreviewItem({ id: 'entry-2', displayPath: 'C:\\Users\\dmarq\\other', fileCount: 1 }),
        ],
        totalBytes: 4096,
        totalFiles: 5,
      }),
    );

    const first = screen.getByTestId(testId(PANEL_TEST_IDS.beachcomberPreviewItem, 'entry-1'));
    expect(within(first).getByText('C:\\Users\\dmarq\\repo')).toBeDefined();
    expect(within(first).getByText('2 KB · 4 files')).toBeDefined();
    expect(within(first).getByText('session-a.jsonl')).toBeDefined();
    expect(within(first).getByText('session-b.jsonl')).toBeDefined();

    expect(screen.getByTestId(testId(PANEL_TEST_IDS.beachcomberPreviewItem, 'entry-2'))).toBeDefined();
    expect(screen.getByTestId(BEACHCOMBER_LOCAL_TEST_IDS.previewTotals).textContent).toBe(
      '2 items · 4 KB · 5 files',
    );
  });

  it('lists every refusal with its reason', () => {
    const fixtures = [
      {
        id: 'entry-9',
        displayPath: 'C:\\Users\\dmarq\\Repos\\router',
        reason: 'Refactor the router uses this directory.',
      },
      {
        id: 'entry-8',
        displayPath: 'C:\\Users\\dmarq\\Repos\\gone',
        reason: 'This entry is not part of the current scan. Rescan first.',
      },
    ];
    renderWithPreview(makePreview({ refused: fixtures }));

    const refused = screen.getByTestId(PANEL_TEST_IDS.beachcomberPreviewRefused);
    expect(within(refused).getByText('Refactor the router uses this directory.')).toBeDefined();
    expect(
      within(refused).getByText('This entry is not part of the current scan. Rescan first.'),
    ).toBeDefined();

    // Each refusal names its entry: the `<li>` holding the reason holds the path.
    for (const fixture of fixtures) {
      const item = within(refused).getByText(fixture.reason).closest('li');
      expect(item?.textContent).toContain(fixture.displayPath);
    }
  });

  it('marks an item that changed since the scan', () => {
    renderWithPreview(makePreview({ items: [makePreviewItem({ stale: true })] }));
    expect(screen.getByText(/changed since the scan/)).toBeDefined();
  });

  it('refuses to offer a confirm when the preview accepted nothing', () => {
    renderWithPreview(makePreview({ items: [], totalBytes: 0, totalFiles: 0 }));

    expect(
      screen.getByTestId<HTMLButtonElement>(PANEL_TEST_IDS.beachcomberPreviewConfirm).disabled,
    ).toBe(true);
  });
});

describe('confirming is the only route to a deletion (AC6)', () => {
  it('calls trashPreviewed from the confirm button and from nothing else', async () => {
    const user = userEvent.setup();
    const actions = renderWithPreview(makePreview());

    const dialog = screen.getByTestId(PANEL_TEST_IDS.beachcomberPreviewDialog);
    const others = [...dialog.querySelectorAll<HTMLButtonElement>('button')].filter(
      (button) =>
        button.getAttribute('data-testid') !== PANEL_TEST_IDS.beachcomberPreviewConfirm &&
        !button.disabled,
    );
    for (const button of others) await user.click(button);
    expect(actions.calls.trashPreviewed).toBe(0);

    await user.click(screen.getByTestId(PANEL_TEST_IDS.beachcomberPreviewConfirm));
    expect(actions.calls.trashPreviewed).toBe(1);
  });

  it('locks both buttons while the move is in flight', () => {
    renderWithPreview(makePreview(), true);

    expect(
      screen.getByTestId<HTMLButtonElement>(PANEL_TEST_IDS.beachcomberPreviewConfirm).disabled,
    ).toBe(true);
    expect(
      screen.getByTestId<HTMLButtonElement>(PANEL_TEST_IDS.beachcomberPreviewCancel).disabled,
    ).toBe(true);
  });

  it('cancels without deleting anything', async () => {
    const user = userEvent.setup();
    const actions = renderWithPreview(makePreview());

    await user.click(screen.getByTestId(PANEL_TEST_IDS.beachcomberPreviewCancel));
    expect(actions.calls.dismissPreview).toBe(1);
    expect(actions.calls.trashPreviewed).toBe(0);
  });
});

describe('the accessibility floor for a dialog (AC11)', () => {
  it('has an accessible name and receives focus when it opens', () => {
    renderWithPreview(makePreview());

    const dialog = screen.getByTestId(PANEL_TEST_IDS.beachcomberPreviewDialog);
    expect(dialog.getAttribute('role')).toBe('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    // Named by its heading, not by a bare label attribute nobody maintains.
    const labelledBy = dialog.getAttribute('aria-labelledby');
    expect(labelledBy).not.toBeNull();
    expect(document.getElementById(labelledBy ?? '')?.textContent).toBe(
      'Move these to the recycle bin?',
    );
    expect(document.activeElement).toBe(dialog);
  });

  it('keeps Tab inside itself, in both directions', async () => {
    const user = userEvent.setup();
    renderWithPreview(makePreview());

    const dialog = screen.getByTestId(PANEL_TEST_IDS.beachcomberPreviewDialog);
    const cancel = screen.getByTestId(PANEL_TEST_IDS.beachcomberPreviewCancel);
    const confirm = screen.getByTestId(PANEL_TEST_IDS.beachcomberPreviewConfirm);

    // Backwards from the dialog itself wraps to the last control.
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(confirm);

    // Forwards from the last control wraps to the first.
    await user.tab();
    expect(document.activeElement).toBe(cancel);

    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it('closes on Escape', async () => {
    const user = userEvent.setup();
    const actions = renderWithPreview(makePreview());

    await user.keyboard('{Escape}');
    expect(actions.calls.dismissPreview).toBe(1);
    expect(actions.calls.trashPreviewed).toBe(0);
  });

  it('returns focus to the control that opened it', async () => {
    const user = userEvent.setup();
    render(<OpenablePanel actions={recordActions()} />);

    const opener = screen.getByTestId(PANEL_TEST_IDS.beachcomberPreviewButton);
    opener.focus();
    await user.click(opener);

    const dialog = await screen.findByTestId(PANEL_TEST_IDS.beachcomberPreviewDialog);
    expect(document.activeElement).toBe(dialog);

    await user.click(screen.getByTestId(PANEL_TEST_IDS.beachcomberPreviewCancel));
    expect(screen.queryByTestId(PANEL_TEST_IDS.beachcomberPreviewDialog)).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('puts focus somewhere visible when the opener is gone by the time it closes', async () => {
    const user = userEvent.setup();
    const actions = recordActions();
    const { rerender } = render(
      <BeachcomberPanel
        actions={actions}
        view={makeView({ selectedIds: ['entry-1'], selectedBytes: 1, preview: makePreview() })}
      />,
    );

    // Confirming trashes the selection, which prunes it, which disables the
    // button that opened the dialog. Focus must not fall to <body>.
    rerender(
      <BeachcomberPanel
        actions={actions}
        view={makeView({ selectedIds: [], selectedBytes: 0, preview: null })}
      />,
    );

    expect(screen.queryByTestId(PANEL_TEST_IDS.beachcomberPreviewDialog)).toBeNull();
    expect(document.activeElement).toBe(screen.getByTestId(PANEL_TEST_IDS.beachcomberPanel));
    // Vacuity guard for the line above.
    expect(document.activeElement).not.toBe(document.body);
    await user.click(screen.getByTestId(PANEL_TEST_IDS.beachcomberRescan));
    expect(actions.calls.rescan).toBe(1);
  });
});
