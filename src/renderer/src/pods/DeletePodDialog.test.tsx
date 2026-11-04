// @vitest-environment jsdom
/**
 * The delete confirmation, driven by props alone. `PodsChrome` owns the call;
 * this component owns only what it says and what value it hands back.
 */

import { createRef, type RefObject } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { Pod } from '@shared/contracts/events';
import { makeStubPod } from '../test-utils';
import { DeletePodDialog, DELETE_POD_TEST_IDS } from './DeletePodDialog';

// Imported for its `afterEach(cleanup)` side effect.
import '../test-utils';

const WITH_SESSION = makeStubPod({
  id: 'a',
  title: 'Alpha',
  status: 'closed',
  ccSessionId: 'sess-1',
});
const WITHOUT_SESSION = makeStubPod({
  id: 'b',
  title: 'Bravo',
  status: 'closed',
  ccSessionId: null,
});

function renderDialog(overrides: Partial<Parameters<typeof DeletePodDialog>[0]> = {}) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  const result = render(
    <DeletePodDialog
      error={null}
      fallbackFocusRef={createRef<HTMLElement>()}
      onCancel={onCancel}
      onConfirm={onConfirm}
      pod={WITH_SESSION}
      podDeleted={false}
      submitting={false}
      {...overrides}
    />,
  );
  return { ...result, onConfirm, onCancel };
}

const OPENER_ID = 'test-opener';
const FALLBACK_ID = 'test-fallback';
const OUTSIDE_ID = 'test-outside';

/**
 * The dialog the way `PodsChrome` mounts it: ALWAYS, returning null while
 * `pod` is null, beside the control that opens it and a focusable fallback.
 * `withOpener` false is the opener gone — a successful delete removes the tab
 * that carried the delete control.
 */
function Harness({
  pod,
  withOpener = true,
  fallbackRef,
}: {
  pod: Pod | null;
  withOpener?: boolean;
  fallbackRef: RefObject<HTMLDivElement | null>;
}) {
  return (
    <div data-testid={FALLBACK_ID} ref={fallbackRef} tabIndex={-1}>
      {withOpener ? (
        <button data-testid={OPENER_ID} type="button">
          Delete Alpha
        </button>
      ) : null}
      <DeletePodDialog
        error={null}
        fallbackFocusRef={fallbackRef}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
        pod={pod}
        podDeleted={false}
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
      <DeletePodDialog
        error={null}
        fallbackFocusRef={createRef<HTMLElement>()}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
        pod={WITH_SESSION}
        podDeleted={false}
        submitting={false}
      />
      {side === 'after' ? outside : null}
    </>,
  );
}

describe('focus (accessibility floor)', () => {
  it('moves focus onto the dialog element when it opens', () => {
    renderDialog();
    expect(document.activeElement).toBe(screen.getByTestId(DELETE_POD_TEST_IDS.dialog));
  });

  it('keeps Tab inside: forward from the last control wraps to the first', async () => {
    const user = userEvent.setup();
    renderWithOutside('after');
    const dialog = screen.getByTestId(DELETE_POD_TEST_IDS.dialog);

    screen.getByTestId(DELETE_POD_TEST_IDS.confirm).focus();
    await user.tab();

    expect(document.activeElement).not.toBe(screen.getByTestId(OUTSIDE_ID));
    expect(document.activeElement).toBe(screen.getByTestId(DELETE_POD_TEST_IDS.session));
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it('keeps Tab inside: backward from the dialog and from the first control wraps to the last', async () => {
    const user = userEvent.setup();
    renderWithOutside('before');
    const dialog = screen.getByTestId(DELETE_POD_TEST_IDS.dialog);
    const outside = screen.getByTestId(OUTSIDE_ID);
    const confirm = screen.getByTestId(DELETE_POD_TEST_IDS.confirm);

    dialog.focus();
    await user.tab({ shift: true });
    expect(document.activeElement).not.toBe(outside);
    expect(document.activeElement).toBe(confirm);

    screen.getByTestId(DELETE_POD_TEST_IDS.session).focus();
    await user.tab({ shift: true });
    expect(document.activeElement).not.toBe(outside);
    expect(document.activeElement).toBe(confirm);
  });

  it('returns focus to the opener when it closes, though it was mounted closed', () => {
    const fallbackRef = createRef<HTMLDivElement>();
    const { rerender } = render(<Harness fallbackRef={fallbackRef} pod={null} />);

    const opener = screen.getByTestId(OPENER_ID);
    opener.focus();
    rerender(<Harness fallbackRef={fallbackRef} pod={WITH_SESSION} />);
    expect(document.activeElement).toBe(screen.getByTestId(DELETE_POD_TEST_IDS.dialog));

    rerender(<Harness fallbackRef={fallbackRef} pod={null} />);
    expect(screen.queryByTestId(DELETE_POD_TEST_IDS.dialog)).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('puts focus on the fallback when the opener is gone by the time it closes', () => {
    const fallbackRef = createRef<HTMLDivElement>();
    const { rerender } = render(<Harness fallbackRef={fallbackRef} pod={null} />);

    screen.getByTestId(OPENER_ID).focus();
    rerender(<Harness fallbackRef={fallbackRef} pod={WITH_SESSION} />);
    // The delete succeeded: the tab, and its delete control, went first.
    rerender(<Harness fallbackRef={fallbackRef} pod={WITH_SESSION} withOpener={false} />);
    rerender(<Harness fallbackRef={fallbackRef} pod={null} withOpener={false} />);

    expect(screen.queryByTestId(OPENER_ID)).toBeNull();
    expect(document.activeElement).toBe(screen.getByTestId(FALLBACK_ID));
    // Vacuity guard for the line above.
    expect(document.activeElement).not.toBe(document.body);
  });
});

describe('focus when the Pod changes while the dialog is open', () => {
  it('moves focus back onto the dialog element when it switches to a Pod with a different id', () => {
    const fallbackRef = createRef<HTMLDivElement>();
    const { rerender } = render(<Harness fallbackRef={fallbackRef} pod={WITH_SESSION} />);
    const dialog = screen.getByTestId(DELETE_POD_TEST_IDS.dialog);

    screen.getByTestId(DELETE_POD_TEST_IDS.cancel).focus();
    // Vacuity guard: focus is somewhere else before the switch.
    expect(document.activeElement).not.toBe(dialog);

    // Straight from A to B, never through `pod={null}`.
    rerender(<Harness fallbackRef={fallbackRef} pod={WITHOUT_SESSION} />);

    expect(screen.getByText('Bravo')).toBeDefined();
    expect(document.activeElement).toBe(screen.getByTestId(DELETE_POD_TEST_IDS.dialog));
  });

  it('leaves focus where it is when it rerenders with a new object for the same Pod id', () => {
    const fallbackRef = createRef<HTMLDivElement>();
    const { rerender } = render(<Harness fallbackRef={fallbackRef} pod={WITH_SESSION} />);
    const cancel = screen.getByTestId(DELETE_POD_TEST_IDS.cancel);
    cancel.focus();
    expect(document.activeElement).toBe(cancel);

    const sameIdNewObject = { ...WITH_SESSION, title: 'Alpha (renamed)' };
    expect(sameIdNewObject).not.toBe(WITH_SESSION);
    expect(sameIdNewObject.id).toBe(WITH_SESSION.id);
    rerender(<Harness fallbackRef={fallbackRef} pod={sameIdNewObject} />);

    expect(screen.getByText('Alpha (renamed)')).toBeDefined();
    expect(document.activeElement).toBe(screen.getByTestId(DELETE_POD_TEST_IDS.cancel));
  });

  it('still returns focus to the original opener on close after switching Pods while open', () => {
    const fallbackRef = createRef<HTMLDivElement>();
    const { rerender } = render(<Harness fallbackRef={fallbackRef} pod={null} />);

    const opener = screen.getByTestId(OPENER_ID);
    opener.focus();
    rerender(<Harness fallbackRef={fallbackRef} pod={WITH_SESSION} />);
    rerender(<Harness fallbackRef={fallbackRef} pod={WITHOUT_SESSION} />);
    expect(document.activeElement).toBe(screen.getByTestId(DELETE_POD_TEST_IDS.dialog));

    rerender(<Harness fallbackRef={fallbackRef} pod={null} />);
    expect(screen.queryByTestId(DELETE_POD_TEST_IDS.dialog)).toBeNull();
    expect(document.activeElement).toBe(opener);
  });
});

describe('the confirmation states what it destroys', () => {
  it('renders nothing when there is no Pod pending', () => {
    renderDialog({ pod: null });
    expect(screen.queryByTestId(DELETE_POD_TEST_IDS.dialog)).toBeNull();
  });

  it('names the Pod and says the transcript history goes permanently', () => {
    renderDialog();
    expect(screen.getByTestId(DELETE_POD_TEST_IDS.dialog)).toBeDefined();
    // The title, so a mis-click on the wrong tab is visible.
    expect(screen.getByText('Alpha')).toBeDefined();
    // The sentence `pods.delete` has always earned and no dialog ever said.
    expect(
      screen.getByText("This Pod's transcript history is removed permanently."),
    ).toBeDefined();
  });

  it('is a modal dialog that Escape cancels', () => {
    const { onCancel } = renderDialog();
    const dialog = screen.getByTestId(DELETE_POD_TEST_IDS.dialog);
    expect(dialog.getAttribute('role')).toBe('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

describe('the session checkbox', () => {
  it('is present and UNCHECKED for a Pod that has a session file', () => {
    renderDialog();
    const box = screen.getByTestId(DELETE_POD_TEST_IDS.session) as HTMLInputElement;
    expect(box.type).toBe('checkbox');
    expect(box.checked).toBe(false);
    // A programmatically associated label, and it describes what is removed.
    expect(
      screen.getByLabelText(
        "Also move this Pod's Claude Code conversation file to the recycle bin. You can restore it from there.",
      ),
    ).toBe(box);
  });

  it('is ABSENT — not disabled — when there is no session file', () => {
    renderDialog({ pod: WITHOUT_SESSION });

    // Present first: the dialog really did render, so the absence below is
    // about the checkbox and not about an empty tree.
    expect(screen.getByTestId(DELETE_POD_TEST_IDS.dialog)).toBeDefined();
    expect(screen.getByText('Bravo')).toBeDefined();
    expect(screen.getByTestId(DELETE_POD_TEST_IDS.confirm)).toBeDefined();

    expect(screen.queryByTestId(DELETE_POD_TEST_IDS.session)).toBeNull();
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('hands back false when unchecked and true when checked', () => {
    const { onConfirm, unmount } = renderDialog();
    fireEvent.click(screen.getByTestId(DELETE_POD_TEST_IDS.confirm));
    expect(onConfirm).toHaveBeenCalledWith(false);
    unmount();

    const second = renderDialog();
    fireEvent.click(screen.getByTestId(DELETE_POD_TEST_IDS.session));
    fireEvent.click(screen.getByTestId(DELETE_POD_TEST_IDS.confirm));
    expect(second.onConfirm).toHaveBeenCalledWith(true);
  });

  it('defaults back to off when a different Pod is put up for deletion', () => {
    const { rerender } = renderDialog();
    fireEvent.click(screen.getByTestId(DELETE_POD_TEST_IDS.session));
    expect((screen.getByTestId(DELETE_POD_TEST_IDS.session) as HTMLInputElement).checked).toBe(
      true,
    );

    const other = makeStubPod({ id: 'c', title: 'Charlie', ccSessionId: 'sess-2' });
    rerender(
      <DeletePodDialog
        error={null}
        fallbackFocusRef={createRef<HTMLElement>()}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
        pod={other}
        podDeleted={false}
        submitting={false}
      />,
    );

    expect((screen.getByTestId(DELETE_POD_TEST_IDS.session) as HTMLInputElement).checked).toBe(
      false,
    );
  });
});

describe('what it reports afterwards', () => {
  it('disables both buttons while the call is in flight', () => {
    renderDialog({ submitting: true });
    expect((screen.getByTestId(DELETE_POD_TEST_IDS.confirm) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect((screen.getByTestId(DELETE_POD_TEST_IDS.cancel) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it('shows a failed delete verbatim and still offers Delete', () => {
    renderDialog({ error: 'NOT_FOUND: no Pod with that id' });
    expect(screen.getByRole('alert').textContent).toBe('NOT_FOUND: no Pod with that id');
    // The Pod was NOT deleted, so the action is still on the table.
    expect(screen.getByTestId(DELETE_POD_TEST_IDS.confirm)).toBeDefined();
  });

  it('says the Pod was deleted anyway when only the session file failed', () => {
    renderDialog({ error: 'EBUSY: resource busy or locked', podDeleted: true });
    const alert = screen.getByRole('alert');
    // The platform's message, VERBATIM, inside the sentence that says which of
    // the two things actually happened.
    expect(alert.textContent).toContain('EBUSY: resource busy or locked');
    expect(alert.textContent).toContain('The Pod itself was deleted.');
    // Nothing left to confirm: a second Delete would answer NOT_FOUND.
    expect(screen.queryByTestId(DELETE_POD_TEST_IDS.confirm)).toBeNull();
    expect(screen.getByTestId(DELETE_POD_TEST_IDS.cancel).textContent).toBe('Dismiss');
  });
});
