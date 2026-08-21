// @vitest-environment jsdom
/**
 * The delete confirmation, driven by props alone. `PodsChrome` owns the call;
 * this component owns only what it says and what value it hands back.
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

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
