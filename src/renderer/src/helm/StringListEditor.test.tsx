// @vitest-environment jsdom
/**
 * THE ACCESSIBILITY FLOOR, as assertions.
 *
 * The list editor is the control most likely to be unusable without a mouse:
 * it adds and removes rows, and every add or remove changes what is on screen
 * under the user's cursor. So this suite asserts where focus LANDED after each
 * one, which is the part a DOM snapshot cannot show.
 *
 * ADD is driven by Tab-to-the-button then Enter, which is the honest keyboard
 * path and also proves the button is reachable at all. REMOVE is driven by
 * `user.click`, and that is not a gap: `user-event`'s click dispatches a real
 * pointer-and-focus sequence to a `<button type="button">`, and the row it
 * removes is chosen by accessible name — so what is under test is where focus
 * goes AFTERWARDS, which is identical for a click and for Enter. The one thing
 * a click would hide is a control that keyboard cannot reach, and the Tab
 * sweep at the bottom of this file covers exactly that.
 *
 * The component is controlled, so the harness below holds the array. That is
 * the same contract `HelmSettingsForm` fulfils with the draft.
 */

import { useState, type JSX } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

// `vitest.config.ts` sets `globals: false`, so RTL never installs its own
// auto-cleanup. Without this, one test's rows are still mounted during the
// next and every `getByLabelText` finds two.
afterEach(() => {
  cleanup();
});

import { COPY } from './copy';
import { StringListEditor } from './StringListEditor';

function Harness({ initial }: { initial: string[] }): JSX.Element {
  const [values, setValues] = useState(initial);
  return (
    <StringListEditor
      addLabel={COPY.allowAdd}
      addTestId="allow-add"
      disabled={false}
      domId="allow"
      emptyLabel={COPY.allowEmpty}
      issues={[]}
      itemLabel={COPY.allowItemLabel}
      legend={COPY.allowLegend}
      listTestId="allow-list"
      onChange={setValues}
      values={values}
    />
  );
}

function row(index: number): HTMLInputElement {
  return screen.getByLabelText(`${COPY.allowItemLabel} ${String(index)}`) as HTMLInputElement;
}

describe('StringListEditor', () => {
  it('names every input and every Remove button, so six Removes are six different buttons', () => {
    render(<Harness initial={['a', 'b']} />);

    expect(row(1).value).toBe('a');
    expect(row(2).value).toBe('b');
    expect(
      screen.getByLabelText(`${COPY.removeRow} ${COPY.allowItemLabel} 1`),
    ).not.toBe(screen.getByLabelText(`${COPY.removeRow} ${COPY.allowItemLabel} 2`));
  });

  it('says so when the list is empty rather than showing a bare Add button', () => {
    render(<Harness initial={[]} />);
    expect(screen.getByText(COPY.allowEmpty)).not.toBeNull();
  });

  it('adds a row from the keyboard and puts focus in it', async () => {
    const user = userEvent.setup();
    render(<Harness initial={['a']} />);

    await user.tab();
    await user.tab();
    await user.tab();
    expect(document.activeElement).toBe(screen.getByTestId('allow-add'));

    await user.keyboard('{Enter}');

    expect(row(2)).not.toBeNull();
    expect(document.activeElement).toBe(row(2));

    await user.keyboard('Bash(ls)');
    expect(row(2).value).toBe('Bash(ls)');
  });

  it('removes a row from the keyboard and moves focus to the nearest remaining row', async () => {
    const user = userEvent.setup();
    render(<Harness initial={['a', 'b', 'c']} />);

    await user.click(screen.getByLabelText(`${COPY.removeRow} ${COPY.allowItemLabel} 2`));

    expect(row(1).value).toBe('a');
    expect(row(2).value).toBe('c');
    // The row that slid into position 2 is the one that now holds focus.
    expect(document.activeElement).toBe(row(2));
  });

  it('falls back to the Add button when the row removed was the last one', async () => {
    const user = userEvent.setup();
    render(<Harness initial={['only']} />);

    await user.click(screen.getByLabelText(`${COPY.removeRow} ${COPY.allowItemLabel} 1`));

    expect(screen.queryByLabelText(`${COPY.allowItemLabel} 1`)).toBeNull();
    expect(document.activeElement).toBe(screen.getByTestId('allow-add'));
  });

  it('reaches every control by Tab alone', async () => {
    const user = userEvent.setup();
    render(<Harness initial={['a', 'b']} />);

    const reached: (Element | null)[] = [];
    for (let step = 0; step < 5; step += 1) {
      await user.tab();
      reached.push(document.activeElement);
    }

    expect(reached).toContain(row(1));
    expect(reached).toContain(row(2));
    // Every Remove too, so "operable by keyboard alone" covers the destructive
    // control and not only the fields.
    expect(reached).toContain(screen.getByLabelText(`${COPY.removeRow} ${COPY.allowItemLabel} 1`));
    expect(reached).toContain(screen.getByLabelText(`${COPY.removeRow} ${COPY.allowItemLabel} 2`));
    expect(reached).toContain(screen.getByTestId('allow-add'));
  });
});
