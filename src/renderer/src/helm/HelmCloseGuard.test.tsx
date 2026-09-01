// @vitest-environment jsdom
/**
 * WHAT THE MUTATION MATRIX CANNOT SHOW.
 *
 * `discrimination.test.tsx` proves the confirmation properties DISCRIMINATE —
 * that each notices the defect it exists for. Those properties are statements
 * about one still frame: the dialog is up, named, operable, focused. The three
 * things below are statements about what happens NEXT, and a DOM mutation
 * cannot stage them:
 *
 *   - answering "discard" lets the close through, and answering "keep editing"
 *     cancels it and leaves the panel mounted with its draft intact;
 *   - focus RETURNS to the control that raised the dialog once it is gone;
 *   - Escape is the way out that loses nothing, and Tab cannot leave the
 *     dialog.
 *
 * Each was written against a panel that could not do it, and each was seen
 * failing first — the report for T4 names what each said when it did.
 *
 * The harness is the real `usePanelCloseGuardHost` with `App`'s `openPanel`
 * state and nothing else, so what these tests exercise is the shipped
 * registration path, not a stand-in for it.
 */

import { useState, type JSX } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { PanelKey } from '../contracts/renderer-panels';
import { PanelCloseGuardProvider, usePanelCloseGuardHost } from '../shell/panel-close-guard';

import { HelmCloseGuard } from './HelmCloseGuard';
import { COPY } from './copy';
import { HELM_SAFETY_TEST_IDS } from './test-ids';

afterEach(() => {
  cleanup();
});

const OPENER = 'guard-test-opener';
const RECORD = 'guard-test-record';

function Harness({ dirty }: { dirty: boolean }): JSX.Element {
  const [openPanel, setOpenPanel] = useState<PanelKey | null>('helm');
  const host = usePanelCloseGuardHost(openPanel, setOpenPanel);

  return (
    <PanelCloseGuardProvider host={host}>
      <button
        data-testid={OPENER}
        onClick={() => {
          void host.controller.requestClose();
        }}
        type="button"
      >
        Close the panel
      </button>
      <div data-open={String(openPanel !== null)} data-testid={RECORD} />
      {openPanel === 'helm' ? <HelmCloseGuard dirty={dirty} /> : null}
    </PanelCloseGuardProvider>
  );
}

function opener(): HTMLElement {
  return screen.getByTestId(OPENER);
}

function stillOpen(): boolean {
  return screen.getByTestId(RECORD).dataset.open === 'true';
}

function dialog(): HTMLElement | null {
  return screen.queryByTestId(HELM_SAFETY_TEST_IDS.closeConfirm);
}

/** Presses Close from the keyboard-focused opener and waits for the dialog. */
async function askToClose(dirty: boolean): Promise<void> {
  render(<Harness dirty={dirty} />);
  opener().focus();
  fireEvent.click(opener());
  await waitFor(() => {
    expect(dialog()).not.toBeNull();
  });
}

describe('answering the confirmation', () => {
  it('lets the close through when the user discards, and says so in words first', async () => {
    await askToClose(true);
    const confirmation = dialog();
    expect(confirmation?.textContent).toContain(COPY.closeConfirmHeading);
    expect(confirmation?.textContent).toContain(COPY.closeConfirmBody);

    fireEvent.click(screen.getByTestId(HELM_SAFETY_TEST_IDS.closeConfirmDiscard));

    await waitFor(() => {
      expect(stillOpen()).toBe(false);
    });
    expect(dialog()).toBeNull();
  });

  it('cancels the close when the user keeps editing, leaving the panel mounted', async () => {
    await askToClose(true);

    fireEvent.click(screen.getByTestId(HELM_SAFETY_TEST_IDS.closeConfirmKeep));

    await waitFor(() => {
      expect(dialog()).toBeNull();
    });
    // The whole point: the panel is STILL OPEN, so the draft it holds is still
    // there. A close that was merely delayed would fail here.
    expect(stillOpen()).toBe(true);
  });

  it('asks nothing at all when there is nothing to lose', async () => {
    render(<Harness dirty={false} />);
    fireEvent.click(opener());

    await waitFor(() => {
      expect(stillOpen()).toBe(false);
    });
    expect(dialog()).toBeNull();
  });
});

describe('the keyboard, which is the only way some users will answer this', () => {
  it('returns focus to the control that raised the confirmation', async () => {
    await askToClose(true);
    // It moved in first, or "returns" would be describing focus that never left.
    expect(dialog()?.contains(document.activeElement)).toBe(true);

    fireEvent.click(screen.getByTestId(HELM_SAFETY_TEST_IDS.closeConfirmKeep));

    await waitFor(() => {
      expect(dialog()).toBeNull();
    });
    expect(document.activeElement).toBe(opener());
  });

  it('treats Escape as keep editing, the way out that loses nothing', async () => {
    await askToClose(true);

    fireEvent.keyDown(screen.getByTestId(HELM_SAFETY_TEST_IDS.closeConfirmKeep), {
      key: 'Escape',
    });

    await waitFor(() => {
      expect(dialog()).toBeNull();
    });
    expect(stillOpen()).toBe(true);
  });

  it('keeps Tab inside the confirmation, in both directions', async () => {
    await askToClose(true);
    const keep = screen.getByTestId(HELM_SAFETY_TEST_IDS.closeConfirmKeep);
    const discard = screen.getByTestId(HELM_SAFETY_TEST_IDS.closeConfirmDiscard);

    // Forward off the last control wraps to the first.
    discard.focus();
    fireEvent.keyDown(discard, { key: 'Tab' });
    expect(document.activeElement).toBe(keep);

    // And backwards off the first wraps to the last.
    fireEvent.keyDown(keep, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(discard);
  });

  it('focuses the non-destructive answer, so a stray Enter cannot discard', async () => {
    await askToClose(true);
    expect(document.activeElement).toBe(
      screen.getByTestId(HELM_SAFETY_TEST_IDS.closeConfirmKeep),
    );
  });
});
