// @vitest-environment jsdom
/**
 * Composer slash-command suggestions: the list above the textarea.
 *
 * The rules under test: the list is open while the composer is enabled, the
 * textarea has focus, the draft is a leading `/` followed by no whitespace,
 * some command's name or alias starts with the text after `/`, and Esc has not
 * dismissed it for this exact draft. A draft that differs from the dismissed
 * one, by any route, clears the dismissal. It shows at most five rows. ArrowDown and ArrowUp move
 * the selection and wrap; Tab, Enter or a press on a row writes
 * `'/' + name + ' '` through `onChange`; Esc closes it. While it is closed,
 * Enter sends and Esc interrupts exactly as without it.
 *
 * Mounted with plain RTL, as in `Composer.test.tsx`: the subject is a pure
 * function of its props, and `Harness` below is the only place state lives.
 */

import { useState, type JSX } from 'react';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { SlashCommandInfo } from '@shared/contracts/ipc';
import type { ComposerState } from '../contracts/renderer-state';
import { TEST_IDS } from '../contracts/renderer-view';

import { Composer } from './Composer';

afterEach(() => {
  cleanup();
});

function command(name: string, description: string, aliases: string[] = []): SlashCommandInfo {
  return { name, description, argumentHint: '', aliases };
}

const HELP = command('help', 'Show help and available commands');
const CLEAR = command('clear', 'Clear conversation history');
const COMPACT = command('compact', 'Compact the conversation');
const CONFIG = command('config', 'Open the config panel');
const USAGE = command('usage', 'Show plan usage limits', ['stats']);

const THREE = [HELP, CLEAR, COMPACT];

function composerState(overrides: Partial<ComposerState> = {}): ComposerState {
  return {
    podId: 'pod-1',
    text: '',
    sending: false,
    error: null,
    disabled: false,
    disabledReason: null,
    ...overrides,
  };
}

const input = (): HTMLTextAreaElement => {
  const element = screen.getByTestId(TEST_IDS.composerInput);
  if (!(element instanceof HTMLTextAreaElement)) throw new Error('composer input is not a textarea');
  return element;
};

const options = (): HTMLElement[] => within(screen.getByRole('listbox')).getAllByRole('option');

const selectedIndex = (): number =>
  options().findIndex((option) => option.getAttribute('aria-selected') === 'true');

/** A parent holding the draft, as the state layer does: every edit lands in `text`. */
function Harness(props: {
  text: string;
  commands: readonly SlashCommandInfo[];
  disabled?: boolean;
  onChange?: (text: string) => void;
  onSend?: () => void;
  onInterrupt?: () => void;
}): JSX.Element {
  const [state, setState] = useState<ComposerState>(
    composerState({ text: props.text, disabled: props.disabled ?? false }),
  );
  return (
    <Composer
      state={state}
      onChange={(text) => {
        props.onChange?.(text);
        setState((prev) => ({ ...prev, text }));
      }}
      onSend={() => props.onSend?.()}
      onInterrupt={() => props.onInterrupt?.()}
      commands={props.commands}
    />
  );
}

describe('Composer suggestions — what the list shows', () => {
  it("renders one named listbox holding one option per command, in order, each showing only '/name' and the description", () => {
    render(<Harness text="/" commands={THREE} />);

    const listboxes = screen.getAllByRole('listbox');
    expect(listboxes).toHaveLength(1);
    expect(screen.getByRole('listbox', { name: /\S/ })).toBe(listboxes[0]);

    const shown = options();
    expect(shown).toHaveLength(3);
    THREE.forEach((expected, index) => {
      const option = shown[index];
      if (option === undefined) throw new Error(`option ${index} is missing`);
      const descendants = Array.from(option.querySelectorAll('*'));
      expect(descendants.filter((el) => el.textContent === `/${expected.name}`)).toHaveLength(1);
      expect(descendants.filter((el) => el.textContent === expected.description)).toHaveLength(1);

      const visible = option.cloneNode(true);
      if (!(visible instanceof HTMLElement)) throw new Error(`option ${index} did not clone as an element`);
      visible.querySelectorAll('[aria-hidden="true"]').forEach((hidden) => hidden.remove());
      expect(visible.textContent).toMatch(
        new RegExp(`^\\s*/${expected.name}\\s*${expected.description}\\s*$`),
      );
    });
  });

  it('renders exactly five options when eight commands match', () => {
    const eight = ['a1', 'b2', 'c3', 'd4', 'e5', 'f6', 'g7', 'h8'].map((name) => command(name, `${name} does a thing`));
    render(<Harness text="/" commands={eight} />);
    expect(options()).toHaveLength(5);
  });

  it('renders no listbox while the composer is disabled, even when commands match', () => {
    render(<Harness text="/" commands={THREE} disabled />);
    expect(screen.queryByRole('listbox')).toBeNull();
  });
});

describe('Composer suggestions — accessibility wiring', () => {
  it('points the textarea at the listbox and the selected option while open, and at neither once Esc closes it', async () => {
    const user = userEvent.setup();
    render(<Harness text="/" commands={THREE} />);

    const listbox = screen.getByRole('listbox');
    expect(listbox.id).not.toBe('');
    expect(input().getAttribute('aria-autocomplete')).toBe('list');
    expect(input().getAttribute('aria-controls')).toBe(listbox.id);
    const selected = options()[selectedIndex()];
    if (selected === undefined) throw new Error('no option is selected');
    expect(selected.id).not.toBe('');
    expect(input().getAttribute('aria-activedescendant')).toBe(selected.id);

    await user.keyboard('{ArrowDown}');
    const moved = options()[1];
    if (moved === undefined) throw new Error('option 1 is missing');
    expect(input().getAttribute('aria-activedescendant')).toBe(moved.id);

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(input().hasAttribute('aria-controls')).toBe(false);
    expect(input().hasAttribute('aria-activedescendant')).toBe(false);
  });

  it('gives a textarea whose draft opens no list neither aria-controls nor aria-activedescendant', () => {
    render(<Harness text="hello" commands={THREE} />);
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(input().hasAttribute('aria-controls')).toBe(false);
    expect(input().hasAttribute('aria-activedescendant')).toBe(false);
  });

  it('marks the selected option with aria-selected and a hidden marker no other option carries', async () => {
    const user = userEvent.setup();
    render(<Harness text="/" commands={THREE} />);

    const check = (expected: number): void => {
      options().forEach((option, index) => {
        expect(option.getAttribute('aria-selected')).toBe(index === expected ? 'true' : 'false');
        expect(option.querySelectorAll('[aria-hidden="true"]')).toHaveLength(index === expected ? 1 : 0);
      });
    };
    check(0);
    await user.keyboard('{ArrowDown}');
    check(1);
  });
});

describe('Composer suggestions — moving the selection', () => {
  it('selects row 1 on ArrowDown from row 0', async () => {
    const user = userEvent.setup();
    render(<Harness text="/" commands={THREE} />);
    expect(selectedIndex()).toBe(0);
    await user.keyboard('{ArrowDown}');
    expect(selectedIndex()).toBe(1);
  });

  it('wraps ArrowDown from the last row to row 0', async () => {
    const user = userEvent.setup();
    render(<Harness text="/" commands={THREE} />);
    await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(selectedIndex()).toBe(2);
    await user.keyboard('{ArrowDown}');
    expect(selectedIndex()).toBe(0);
  });

  it('wraps ArrowUp from row 0 to the last row', async () => {
    const user = userEvent.setup();
    render(<Harness text="/" commands={THREE} />);
    expect(selectedIndex()).toBe(0);
    await user.keyboard('{ArrowUp}');
    expect(selectedIndex()).toBe(2);
  });

  it("selects row 0 when further typing changes the rows shown, '/' to '/c'", async () => {
    const user = userEvent.setup();
    render(<Harness text="/" commands={THREE} />);
    await user.keyboard('{ArrowDown}');
    expect(selectedIndex()).toBe(1);

    await user.keyboard('c');
    expect(input().value).toBe('/c');
    expect(options()).toHaveLength(2);
    expect(selectedIndex()).toBe(0);
  });
});

describe('Composer suggestions — accepting a row', () => {
  it("writes '/' + rows[1].name + ' ' on Enter with row 1 selected, and does not send", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onSend = vi.fn();
    render(<Harness text="/" commands={THREE} onChange={onChange} onSend={onSend} />);

    await user.keyboard('{ArrowDown}{Enter}');

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(`/${CLEAR.name} `);
    expect(onSend).not.toHaveBeenCalled();
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it("writes '/' + rows[0].name + ' ' on Tab, does not send, and keeps focus in the textarea", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onSend = vi.fn();
    render(<Harness text="/" commands={THREE} onChange={onChange} onSend={onSend} />);
    expect(document.activeElement).toBe(input());

    await user.keyboard('{Tab}');

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(`/${HELP.name} `);
    expect(onSend).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(input());
  });

  it("writes the canonical '/usage ' when the row matched only by its alias 'stats'", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness text="/st" commands={[HELP, USAGE]} onChange={onChange} />);
    expect(options()).toHaveLength(1);

    await user.keyboard('{Enter}');

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('/usage ');
  });

  it("writes '/' + rows[1].name + ' ' on a mousedown on the second option, and keeps focus in the textarea", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness text="/" commands={THREE} onChange={onChange} />);
    expect(document.activeElement).toBe(input());
    const second = options()[1];
    if (second === undefined) throw new Error('option 1 is missing');

    await user.pointer({ keys: '[MouseLeft>]', target: second });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(`/${CLEAR.name} `);
    expect(document.activeElement).toBe(input());
  });
});

describe('Composer suggestions — Esc closes the list', () => {
  it('removes the listbox on Escape and calls neither onInterrupt nor onChange', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onInterrupt = vi.fn();
    render(<Harness text="/" commands={THREE} onChange={onChange} onInterrupt={onInterrupt} />);
    expect(screen.getByRole('listbox')).toBeTruthy();

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('listbox')).toBeNull();
    expect(onInterrupt).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("shows the listbox again, with row 0 selected, after an edit that still matches, '/c' to '/co'", async () => {
    const user = userEvent.setup();
    render(<Harness text="/c" commands={[CLEAR, COMPACT, CONFIG]} />);
    await user.keyboard('{ArrowDown}{Escape}');
    expect(screen.queryByRole('listbox')).toBeNull();

    await user.keyboard('o');

    expect(input().value).toBe('/co');
    expect(screen.getByRole('listbox')).toBeTruthy();
    expect(selectedIndex()).toBe(0);
  });
});

describe('Composer suggestions — focus opens and closes the list', () => {
  it('closes the list when the textarea loses focus', async () => {
    const user = userEvent.setup();
    render(<Harness text="/" commands={THREE} />);
    expect(document.activeElement).toBe(input());
    expect(screen.getByRole('listbox')).toBeTruthy();

    await user.click(document.body);

    expect(document.activeElement).not.toBe(input());
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(input().getAttribute('aria-expanded')).not.toBe('true');
    expect(input().hasAttribute('aria-controls')).toBe(false);
    expect(input().hasAttribute('aria-activedescendant')).toBe(false);
  });

  it('reopens the list when the textarea is focused again and the draft still matches', async () => {
    const user = userEvent.setup();
    render(<Harness text="/" commands={THREE} />);
    await user.click(document.body);
    expect(screen.queryByRole('listbox')).toBeNull();

    await user.click(input());

    expect(document.activeElement).toBe(input());
    expect(input().value).toBe('/');
    expect(options()).toHaveLength(3);
    expect(selectedIndex()).toBe(0);
  });
});

describe('Composer suggestions — an Esc dismissal lasts only while the draft is unchanged', () => {
  it('shows the list again when the parent rewrites the draft away and back, with no local edit', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const view = (text: string): JSX.Element => (
      <Composer
        state={composerState({ text })}
        onChange={onChange}
        onSend={() => undefined}
        onInterrupt={() => undefined}
        commands={THREE}
      />
    );
    const { rerender } = render(view('/'));
    expect(screen.getByRole('listbox')).toBeTruthy();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).toBeNull();

    rerender(view('hello'));
    expect(screen.queryByRole('listbox')).toBeNull();

    rerender(view('/'));

    expect(onChange).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(input());
    expect(options()).toHaveLength(3);
  });
});

describe('Composer suggestions — a closed list leaves every key as it was', () => {
  it("sends exactly once on Enter for '/compact now', which opens no list", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(<Harness text="/compact now" commands={[COMPACT]} onSend={onSend} />);
    expect(screen.queryByRole('listbox')).toBeNull();

    await user.keyboard('{Enter}');

    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it("sends exactly once on Enter and interrupts exactly once on Escape for '/zz', which matches nothing", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    const onInterrupt = vi.fn();
    render(<Harness text="/zz" commands={THREE} onSend={onSend} onInterrupt={onInterrupt} />);
    expect(screen.queryByRole('listbox')).toBeNull();

    await user.keyboard('{Enter}');
    await user.keyboard('{Escape}');

    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onInterrupt).toHaveBeenCalledTimes(1);
  });

  it('does not intercept Tab, which moves focus out of the textarea and writes nothing', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness text="hello" commands={THREE} onChange={onChange} />);
    expect(document.activeElement).toBe(input());

    await user.keyboard('{Tab}');

    expect(onChange).not.toHaveBeenCalled();
    expect(document.activeElement).not.toBe(input());
  });
});
