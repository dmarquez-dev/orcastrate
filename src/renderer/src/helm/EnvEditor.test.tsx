// @vitest-environment jsdom
/**
 * The env editor, and the two things a `Record<string, string>` cannot express.
 *
 * Both are asserted here rather than left to reasoning, because both are
 * SILENT failures if they go wrong: a rename that collapses two rows destroys
 * a variable with no error, and a second blank row disappears into the first.
 */

import { useState, type JSX } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

// `globals: false` means RTL installs no auto-cleanup of its own.
afterEach(() => {
  cleanup();
});

import { PANEL_TEST_IDS } from '../contracts/renderer-panels';

import { COPY } from './copy';
import { EnvEditor } from './EnvEditor';

function Harness({ initial }: { initial: Record<string, string> }): JSX.Element {
  const [env, setEnv] = useState(initial);
  return <EnvEditor disabled={false} env={env} issues={[]} onChange={setEnv} />;
}

function name(index: number): HTMLInputElement {
  return screen.getByLabelText(`${COPY.envNameLabel} ${String(index)}`) as HTMLInputElement;
}

function value(index: number): HTMLInputElement {
  return screen.getByLabelText(`${COPY.envValueLabel} ${String(index)}`) as HTMLInputElement;
}

describe('EnvEditor', () => {
  it('labels the name and the value of every pair separately', () => {
    render(<Harness initial={{ ONE: '1', TWO: '2' }} />);

    expect(name(1).value).toBe('ONE');
    expect(value(1).value).toBe('1');
    expect(name(2).value).toBe('TWO');
    expect(value(2).value).toBe('2');
  });

  it('edits a value without disturbing the order of the rows', async () => {
    const user = userEvent.setup();
    render(<Harness initial={{ ONE: '1', TWO: '2' }} />);

    await user.clear(value(1));
    await user.type(value(1), '9');

    expect(name(1).value).toBe('ONE');
    expect(value(1).value).toBe('9');
    expect(name(2).value).toBe('TWO');
  });

  it('REFUSES a rename onto a name already in the list, and says why', async () => {
    const user = userEvent.setup();
    render(<Harness initial={{ ONE: '1', TWO: '2' }} />);

    await user.clear(name(2));
    await user.type(name(2), 'ONE');

    // Both rows survive; nothing was silently collapsed.
    expect(screen.getByText(COPY.envDuplicate)).not.toBeNull();
    expect(value(1).value).toBe('1');
    expect(value(2).value).toBe('2');
  });

  it('adds one blank row, puts focus in its name, and will not add a second', async () => {
    const user = userEvent.setup();
    render(<Harness initial={{ ONE: '1' }} />);

    await user.click(screen.getByTestId(PANEL_TEST_IDS.helmEnvAdd));

    expect(name(2).value).toBe('');
    expect(document.activeElement).toBe(name(2));

    const add = screen.getByTestId(PANEL_TEST_IDS.helmEnvAdd) as HTMLButtonElement;
    expect(add.disabled).toBe(true);
    expect(screen.getByText(COPY.envAddBlocked)).not.toBeNull();

    await user.type(name(2), 'TWO');
    expect((screen.getByTestId(PANEL_TEST_IDS.helmEnvAdd) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  it('removes a pair and moves focus to the nearest remaining name', async () => {
    const user = userEvent.setup();
    render(<Harness initial={{ ONE: '1', TWO: '2', THREE: '3' }} />);

    await user.click(screen.getByLabelText(`${COPY.removeRow} ${COPY.envNameLabel} 2`));

    expect(name(1).value).toBe('ONE');
    expect(name(2).value).toBe('THREE');
    expect(document.activeElement).toBe(name(2));
  });

  it('says so when there are no variables at all', () => {
    render(<Harness initial={{}} />);
    expect(screen.getByText(COPY.envEmpty)).not.toBeNull();
  });
});
