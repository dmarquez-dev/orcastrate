// @vitest-environment jsdom
import { createRef, type RefObject } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { PermissionMode } from '@shared/contracts/events';
import type { ActionResult } from '../contracts/renderer-state';
import {
  BYPASS_PERMISSIONS_WARNING,
  PERMISSION_MODE_OPTIONS,
  TEST_IDS,
} from '../contracts/renderer-view';
import { testId } from '../shell/contract-runtime';
import { ipcError } from '../test-utils';
import { NewPodDialog } from './NewPodDialog';

const PICKED = '/home/dana/projects/orcastrate';

function pickResolving(path: string | null) {
  return vi.fn(
    async (): Promise<ActionResult<{ path: string | null }>> => ({ ok: true, value: { path } }),
  );
}

function renderDialog(overrides: Partial<Parameters<typeof NewPodDialog>[0]> = {}) {
  const onCreate = vi.fn();
  const onCancel = vi.fn();
  const browse = overrides.browse ?? pickResolving(PICKED);
  const result = render(
    <NewPodDialog
      autoModeSupported={null}
      browse={browse}
      error={null}
      fallbackFocusRef={createRef<HTMLElement>()}
      onCancel={onCancel}
      onCreate={onCreate}
      open
      submitting={false}
      {...overrides}
    />,
  );
  return { ...result, onCreate, onCancel, browse };
}

const OPENER_ID = 'test-opener';
const FALLBACK_ID = 'test-fallback';
const OUTSIDE_ID = 'test-outside';

/**
 * The dialog the way `PodsChrome` mounts it: ALWAYS, returning null while
 * closed, beside the control that opens it and a focusable fallback.
 * `withOpener` false is the opener gone — the empty-workspace control unmounts
 * once the new Pod is active.
 */
function Harness({
  open,
  withOpener = true,
  fallbackRef,
}: {
  open: boolean;
  withOpener?: boolean;
  fallbackRef: RefObject<HTMLDivElement | null>;
}) {
  return (
    <div data-testid={FALLBACK_ID} ref={fallbackRef} tabIndex={-1}>
      {withOpener ? (
        <button data-testid={OPENER_ID} type="button">
          New Pod
        </button>
      ) : null}
      <NewPodDialog
        autoModeSupported={null}
        browse={pickResolving(PICKED)}
        error={null}
        fallbackFocusRef={fallbackRef}
        onCancel={vi.fn()}
        onCreate={vi.fn()}
        open={open}
        submitting={false}
      />
    </div>
  );
}

/**
 * The dialog with a focusable control OUTSIDE it, on the side Tab would leave
 * by. Without one, `userEvent.tab()` wraps around the document and lands back
 * on the dialog's own first control whether or not anything traps focus.
 */
function renderWithOutside(side: 'before' | 'after') {
  const outside = (
    <button data-testid={OUTSIDE_ID} type="button">
      Outside
    </button>
  );
  render(
    <>
      {side === 'before' ? outside : null}
      <NewPodDialog
        autoModeSupported={null}
        browse={pickResolving(PICKED)}
        error={null}
        fallbackFocusRef={createRef<HTMLElement>()}
        onCancel={vi.fn()}
        onCreate={vi.fn()}
        open
        submitting={false}
      />
      {side === 'after' ? outside : null}
    </>,
  );
}

describe('NewPodDialog focus (accessibility floor)', () => {
  it('keeps Tab inside: forward from the last enabled control wraps to the title field', async () => {
    const user = userEvent.setup();
    renderWithOutside('after');
    const dialog = screen.getByTestId(TEST_IDS.newPodDialog);

    // Create is disabled with an empty draft, so Cancel is the last enabled
    // control — the one Tab leaves from.
    expect((screen.getByTestId(TEST_IDS.newPodSubmit) as HTMLButtonElement).disabled).toBe(true);
    screen.getByRole('button', { name: 'Cancel' }).focus();
    await user.tab();

    expect(document.activeElement).not.toBe(screen.getByTestId(OUTSIDE_ID));
    expect(document.activeElement).toBe(screen.getByTestId(TEST_IDS.newPodTitleInput));
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it('keeps Tab inside: backward from the title field wraps to the last enabled control', async () => {
    const user = userEvent.setup();
    renderWithOutside('before');

    expect(document.activeElement).toBe(screen.getByTestId(TEST_IDS.newPodTitleInput));
    await user.tab({ shift: true });

    expect(document.activeElement).not.toBe(screen.getByTestId(OUTSIDE_ID));
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancel' }));
  });

  it('returns focus to the opener when it closes, though it was mounted closed', () => {
    const fallbackRef = createRef<HTMLDivElement>();
    const { rerender } = render(<Harness fallbackRef={fallbackRef} open={false} />);

    const opener = screen.getByTestId(OPENER_ID);
    opener.focus();
    rerender(<Harness fallbackRef={fallbackRef} open />);
    expect(document.activeElement).toBe(screen.getByTestId(TEST_IDS.newPodTitleInput));

    rerender(<Harness fallbackRef={fallbackRef} open={false} />);
    expect(screen.queryByTestId(TEST_IDS.newPodDialog)).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('puts focus on the fallback when the opener is gone by the time it closes', () => {
    const fallbackRef = createRef<HTMLDivElement>();
    const { rerender } = render(<Harness fallbackRef={fallbackRef} open={false} />);

    screen.getByTestId(OPENER_ID).focus();
    rerender(<Harness fallbackRef={fallbackRef} open />);
    rerender(<Harness fallbackRef={fallbackRef} open withOpener={false} />);
    rerender(<Harness fallbackRef={fallbackRef} open={false} withOpener={false} />);

    expect(screen.queryByTestId(OPENER_ID)).toBeNull();
    expect(document.activeElement).toBe(screen.getByTestId(FALLBACK_ID));
    // Vacuity guard for the line above.
    expect(document.activeElement).not.toBe(document.body);
  });
});

async function fillValidDraft(browse: ReturnType<typeof pickResolving>): Promise<void> {
  fireEvent.change(screen.getByTestId(TEST_IDS.newPodTitleInput), {
    target: { value: 'Refactor the router' },
  });
  fireEvent.click(screen.getByTestId(TEST_IDS.newPodBrowseButton));
  await waitFor(() => {
    expect(browse).toHaveBeenCalled();
    expect(screen.getByTestId(TEST_IDS.newPodCwdDisplay).textContent).toBe(PICKED);
  });
}

describe('NewPodDialog', () => {
  it('renders nothing when closed', () => {
    renderDialog({ open: false });
    expect(screen.queryByTestId(TEST_IDS.newPodDialog)).toBeNull();
  });

  it('obtains the directory only from pickDirectory and shows it read-only', async () => {
    const browse = pickResolving(PICKED);
    const { container } = renderDialog({ browse });

    fireEvent.click(screen.getByTestId(TEST_IDS.newPodBrowseButton));
    await waitFor(() => {
      expect(screen.getByTestId(TEST_IDS.newPodCwdDisplay).textContent).toBe(PICKED);
    });

    // No editable input anywhere in the dialog is bound to the path.
    expect(screen.getByTestId(TEST_IDS.newPodCwdDisplay).tagName).not.toBe('INPUT');
    expect(screen.queryByDisplayValue(PICKED)).toBeNull();
    const inputs = Array.from(container.querySelectorAll('input, textarea'));
    for (const input of inputs) {
      expect((input as HTMLInputElement).value).not.toBe(PICKED);
    }
  });

  it('treats a cancelled pick as a non-event: dialog stays open, no error', async () => {
    const browse = pickResolving(null);
    renderDialog({ browse });

    fireEvent.click(screen.getByTestId(TEST_IDS.newPodBrowseButton));
    await waitFor(() => {
      expect(browse).toHaveBeenCalledTimes(1);
    });

    expect(screen.getByTestId(TEST_IDS.newPodDialog)).toBeDefined();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByTestId(TEST_IDS.newPodCwdDisplay).textContent).toBe('No directory chosen');
    expect((screen.getByTestId(TEST_IDS.newPodSubmit) as HTMLButtonElement).disabled).toBe(true);
  });

  it('renders exactly the modes in PERMISSION_MODE_OPTIONS, from that array', () => {
    const { container } = renderDialog();
    const radios = container.querySelectorAll('input[type="radio"]');
    expect(radios.length).toBe(PERMISSION_MODE_OPTIONS.length);
    for (const option of PERMISSION_MODE_OPTIONS) {
      const radio = screen.getByTestId(`${TEST_IDS.newPodModeOption}:${option.mode}`);
      expect(radio).toBeDefined();
      expect(screen.getByText(option.label)).toBeDefined();
      expect(screen.getAllByText(option.summary).length).toBeGreaterThan(0);
    }
  });

  it('requires a second confirmation for bypassPermissions and surfaces the warning verbatim', async () => {
    const browse = pickResolving(PICKED);
    const { onCreate } = renderDialog({ browse });
    await fillValidDraft(browse);

    const submit = screen.getByTestId(TEST_IDS.newPodSubmit) as HTMLButtonElement;
    expect(submit.disabled).toBe(false);

    fireEvent.click(screen.getByTestId(`${TEST_IDS.newPodModeOption}:bypassPermissions`));

    expect(screen.getByTestId(TEST_IDS.newPodBypassWarning).textContent).toBe(
      BYPASS_PERMISSIONS_WARNING,
    );
    expect(submit.disabled).toBe(true);

    fireEvent.click(screen.getByRole('checkbox'));
    expect(submit.disabled).toBe(false);

    fireEvent.click(submit);
    expect(onCreate).toHaveBeenCalledWith({
      title: 'Refactor the router',
      cwd: PICKED,
      permissionMode: 'bypassPermissions' satisfies PermissionMode,
      envOverrides: {},
    });
  });

  it('keeps Create disabled until title is non-empty and cwd is set', async () => {
    const browse = pickResolving(PICKED);
    renderDialog({ browse });
    const submit = screen.getByTestId(TEST_IDS.newPodSubmit) as HTMLButtonElement;

    expect(submit.disabled).toBe(true);
    fireEvent.change(screen.getByTestId(TEST_IDS.newPodTitleInput), {
      target: { value: '   ' },
    });
    expect(submit.disabled).toBe(true);

    fireEvent.change(screen.getByTestId(TEST_IDS.newPodTitleInput), { target: { value: 'Pod' } });
    expect(submit.disabled).toBe(true); // still no directory

    fireEvent.click(screen.getByTestId(TEST_IDS.newPodBrowseButton));
    await waitFor(() => {
      expect(submit.disabled).toBe(false);
    });
  });

  it('collects optional env overrides', async () => {
    const browse = pickResolving(PICKED);
    const { onCreate } = renderDialog({ browse });
    await fillValidDraft(browse);

    fireEvent.change(screen.getByLabelText('Variable 1 name'), { target: { value: 'CI' } });
    fireEvent.change(screen.getByLabelText('Variable 1 value'), { target: { value: '1' } });
    fireEvent.click(screen.getByTestId(TEST_IDS.newPodSubmit));

    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({ envOverrides: { CI: '1' } }),
    );
  });

  it('stays open on a failed create, shows error verbatim, and keeps the input', async () => {
    const browse = pickResolving(PICKED);
    const { rerender } = renderDialog({ browse });
    await fillValidDraft(browse);

    const message = ipcError('CWD_MISSING', 'ENOENT: no such directory').message;
    rerender(
      <NewPodDialog
        autoModeSupported={null}
        browse={browse}
        error={message}
        fallbackFocusRef={createRef<HTMLElement>()}
        onCancel={vi.fn()}
        onCreate={vi.fn()}
        open
        submitting={false}
      />,
    );

    expect(screen.getByTestId(TEST_IDS.newPodDialog)).toBeDefined();
    expect(screen.getByRole('alert').textContent).toBe('ENOENT: no such directory');
    expect((screen.getByTestId(TEST_IDS.newPodTitleInput) as HTMLInputElement).value).toBe(
      'Refactor the router',
    );
    expect(screen.getByTestId(TEST_IDS.newPodCwdDisplay).textContent).toBe(PICKED);
  });

  it('offers no "Create and open" option, because Create no longer opens', async () => {
    // Create makes the row and stops. A checkbox here would reintroduce the
    // folded error path that decision removes — a spawn failure reported as a
    // failed create for a Pod that had in fact been created. The only checkbox
    // this dialog may ever show is the bypass confirmation, and it is absent
    // until the danger mode is selected.
    const browse = pickResolving(PICKED);
    const { container } = renderDialog({ browse });
    await fillValidDraft(browse);

    expect(container.querySelectorAll('input[type="checkbox"]').length).toBe(0);
    expect(screen.queryByLabelText(/open/i)).toBeNull();
    expect(container.textContent).not.toContain('Create and open');

    // The bypass confirmation still appears when its mode is chosen, so the
    // count above is a real absence rather than a dialog that shows nothing.
    fireEvent.click(screen.getByTestId(`${TEST_IDS.newPodModeOption}:bypassPermissions`));
    expect(container.querySelectorAll('input[type="checkbox"]').length).toBe(1);
  });

  it('cancels on Escape and on the Cancel button', () => {
    const { onCancel } = renderDialog();
    fireEvent.keyDown(screen.getByTestId(TEST_IDS.newPodDialog), { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  it('focuses the title field when it opens', () => {
    renderDialog();
    expect(document.activeElement).toBe(screen.getByTestId(TEST_IDS.newPodTitleInput));
  });
});

/**
 * Every member of the `PermissionMode` union, by a literal that stops
 * compiling when the union gains or loses one. The radio assertions below are
 * keyed by it rather than by `PERMISSION_MODE_OPTIONS`, so an option the array
 * dropped would be missed here even if the array and the dialog agreed.
 */
const EVERY_MODE: Record<PermissionMode, true> = {
  default: true,
  acceptEdits: true,
  plan: true,
  dontAsk: true,
  auto: true,
  bypassPermissions: true,
};

const ALL_MODES = Object.keys(EVERY_MODE) as PermissionMode[];

function modeRadio(mode: PermissionMode): HTMLInputElement | null {
  return screen.queryByTestId<HTMLInputElement>(testId(TEST_IDS.newPodModeOption, mode));
}

function radioCount(container: HTMLElement): number {
  return container.querySelectorAll('input[type="radio"]').length;
}

describe('NewPodDialog permission modes and the auto-mode flag', () => {
  it('offers one radio per PermissionMode when nothing is cached (flag null)', () => {
    const { container } = renderDialog({ autoModeSupported: null });

    for (const mode of ALL_MODES) {
      expect(modeRadio(mode), `radio for ${mode}`).not.toBeNull();
    }
    expect(radioCount(container)).toBe(ALL_MODES.length);
  });

  it('offers the same radios when the model supports auto mode (flag true)', () => {
    const { container } = renderDialog({ autoModeSupported: true });

    for (const mode of ALL_MODES) {
      expect(modeRadio(mode), `radio for ${mode}`).not.toBeNull();
    }
    expect(radioCount(container)).toBe(ALL_MODES.length);
  });

  it('hides auto, and only auto, when the model does not support it (flag false)', () => {
    const { container } = renderDialog({ autoModeSupported: false });

    expect(screen.queryByTestId('new-pod-mode:auto')).toBeNull();
    const others = ALL_MODES.filter((mode) => mode !== 'auto');
    for (const mode of others) {
      expect(modeRadio(mode), `radio for ${mode}`).not.toBeNull();
    }
    expect(others.length).toBe(5);
    expect(radioCount(container)).toBe(5);
  });

  it('reads a selected auto that becomes hidden as default, and submits default', async () => {
    const browse = pickResolving(PICKED);
    const onCreate = vi.fn();
    const dialog = (autoModeSupported: boolean | null) => (
      <NewPodDialog
        autoModeSupported={autoModeSupported}
        browse={browse}
        error={null}
        fallbackFocusRef={createRef<HTMLElement>()}
        onCancel={vi.fn()}
        onCreate={onCreate}
        open
        submitting={false}
      />
    );
    const { rerender } = render(dialog(null));
    await fillValidDraft(browse);

    fireEvent.click(screen.getByTestId(testId(TEST_IDS.newPodModeOption, 'auto')));
    expect(modeRadio('auto')?.checked).toBe(true);
    expect(modeRadio('default')?.checked).toBe(false);

    rerender(dialog(false));

    expect(modeRadio('auto')).toBeNull();
    expect(modeRadio('default')?.checked).toBe(true);
    fireEvent.click(screen.getByTestId(TEST_IDS.newPodSubmit));
    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({ permissionMode: 'default' satisfies PermissionMode }),
    );
  });

  for (const mode of ['auto', 'dontAsk'] as const satisfies readonly PermissionMode[]) {
    it(`submits ${mode} with no bypass warning and Create enabled`, async () => {
      const browse = pickResolving(PICKED);
      const { onCreate } = renderDialog({ browse, autoModeSupported: null });
      await fillValidDraft(browse);

      fireEvent.click(screen.getByTestId(testId(TEST_IDS.newPodModeOption, mode)));

      expect(screen.queryByTestId(TEST_IDS.newPodBypassWarning)).toBeNull();
      const submit = screen.getByTestId<HTMLButtonElement>(TEST_IDS.newPodSubmit);
      expect(submit.disabled).toBe(false);
      fireEvent.click(submit);
      expect(onCreate).toHaveBeenCalledWith({
        title: 'Refactor the router',
        cwd: PICKED,
        permissionMode: mode,
        envOverrides: {},
      });
    });
  }
});
