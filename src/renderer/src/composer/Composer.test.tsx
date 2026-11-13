// @vitest-environment jsdom
/**
 * Composer behaviour (spec 5.2, 5.3, 5.4).
 *
 * The subject is a pure function of `ComposerProps`, so these mount it with
 * plain RTL rather than `renderWithWorkspace`: it reads no context and touches
 * no `window.orcastrate`, and standing up T5's provider would test T5. The
 * contract-conformant parent is `Harness` below, which is the only place any
 * state lives — exactly as in the real app, where that state is T5's.
 */

import { useState, type JSX } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { IpcError } from '@shared/contracts/ipc';
import type { ComposerState } from '../contracts/renderer-state';
import { STEER_PREFILL_PREFIX } from '../contracts/renderer-state';
import { TEST_IDS } from '../contracts/renderer-view';

import { Composer, disabledMessage } from './Composer';

afterEach(() => {
  cleanup();
});

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

const input = (): HTMLTextAreaElement =>
  screen.getByTestId(TEST_IDS.composerInput) as HTMLTextAreaElement;
const sendButton = (): HTMLButtonElement =>
  screen.getByTestId(TEST_IDS.composerSend) as HTMLButtonElement;

/**
 * A parent that behaves the way the frozen `WorkspaceActions` say the state
 * layer behaves: `setComposerText` is a local edit, `sendComposer` flips
 * `sending`. Nothing here is the subject; it exists so the subject can be
 * driven the way the app will drive it.
 */
function Harness(props: {
  initial?: Partial<ComposerState>;
  /** Contract behaviour: an edit clears the last send error. Off proves the
   *  composer clears the message itself, without waiting for the state layer. */
  clearErrorOnEdit?: boolean;
  onSend?: () => void;
  onInterrupt?: () => void;
}): JSX.Element {
  const [state, setState] = useState<ComposerState>(composerState(props.initial));
  const [lane, setLane] = useState('lane-matriarch');

  return (
    <div>
      <button type="button" onClick={() => setLane('lane-calf-1')}>
        select calf lane
      </button>
      <span data-testid="selected-lane">{lane}</span>
      <Composer
        state={state}
        onChange={(text) =>
          setState((prev) => ({
            ...prev,
            text,
            error: props.clearErrorOnEdit === false ? prev.error : null,
          }))
        }
        onSend={() => {
          props.onSend?.();
          setState((prev) => ({ ...prev, sending: true }));
        }}
        onInterrupt={() => props.onInterrupt?.()}
        commands={[]}
      />
    </div>
  );
}

describe('Composer — bound to the Pod, not the lane (criterion 1)', () => {
  it('keeps its text and stays writable when a read-only Calf lane is selected', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.type(input(), 'half a thought');
    await user.click(screen.getByRole('button', { name: 'select calf lane' }));

    expect(screen.getByTestId('selected-lane').textContent).toBe('lane-calf-1');
    expect(input().value).toBe('half a thought');
    expect(input().readOnly).toBe(false);
    expect(input().disabled).toBe(false);
    expect(sendButton().disabled).toBe(false);
  });

  it('renders exactly one composer', () => {
    render(<Harness />);
    expect(screen.getAllByTestId(TEST_IDS.composer)).toHaveLength(1);
    expect(screen.getAllByTestId(TEST_IDS.composerInput)).toHaveLength(1);
  });
});

describe('Composer — sending (criterion 2)', () => {
  it('sends on Enter', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(<Harness onSend={onSend} initial={{ text: 'ship it' }} />);

    await user.click(input());
    await user.keyboard('{Enter}');

    expect(onSend).toHaveBeenCalledTimes(1);
    expect(input().value).toBe('ship it');
  });

  it('inserts a newline on Shift+Enter and does not send', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(<Harness onSend={onSend} />);

    await user.type(input(), 'line one{Shift>}{Enter}{/Shift}line two');

    expect(onSend).not.toHaveBeenCalled();
    expect(input().value).toBe('line one\nline two');
  });

  it('disables send while sending, so a second click sends nothing', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(<Harness onSend={onSend} initial={{ text: 'once' }} />);

    await user.click(sendButton());
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(sendButton().disabled).toBe(true);

    await user.click(sendButton());
    fireEvent.click(sendButton());
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it('shows "Sending…" as well as the disabled state — colour is not the only signal', () => {
    render(<Composer state={composerState({ sending: true })} onChange={vi.fn()} onSend={vi.fn()} onInterrupt={vi.fn()} commands={[]} />);
    expect(sendButton().textContent).toBe('Sending…');
    expect(sendButton().getAttribute('aria-busy')).toBe('true');
  });

  it.each([
    ['not-opened' as const, 'not running'],
    ['beached' as const, 'beached'],
    ['awaiting-permission' as const, 'permission'],
  ])('explains a disabled composer (%s) instead of swallowing input', async (reason, fragment) => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(
      <Composer
        state={composerState({ disabled: true, disabledReason: reason, text: 'kept' })}
        onChange={vi.fn()}
        onSend={onSend}
        onInterrupt={vi.fn()}
        commands={[]}
      />,
    );

    const note = screen.getByTestId('composer-disabled-note');
    expect(note.textContent).toContain(fragment);
    expect(sendButton().disabled).toBe(true);
    expect(input().readOnly).toBe(true);
    // The note is wired to the field, so it is announced and not merely painted.
    expect(input().getAttribute('aria-describedby')).toContain(note.id);

    await user.click(sendButton());
    expect(onSend).not.toHaveBeenCalled();
  });

  it('has copy for a disabled composer with no attributed reason', () => {
    expect(disabledMessage(composerState({ disabled: true }))).toBeTypeOf('string');
    expect(disabledMessage(composerState())).toBeNull();
  });
});

describe('Composer — Esc interrupts and keeps the draft (criterion 3)', () => {
  it('calls onInterrupt exactly once and leaves the text alone', async () => {
    const user = userEvent.setup();
    const onInterrupt = vi.fn();
    const onSend = vi.fn();
    render(<Harness onInterrupt={onInterrupt} onSend={onSend} />);

    await user.type(input(), 'a draft worth keeping');
    await user.keyboard('{Escape}');

    expect(onInterrupt).toHaveBeenCalledTimes(1);
    expect(onSend).not.toHaveBeenCalled();
    expect(input().value).toBe('a draft worth keeping');
    expect(document.activeElement).toBe(input());
  });
});

describe('Composer — send failure (criterion 4)', () => {
  const error: IpcError = { code: 'NOT_RUNNING', message: 'Pod process is not running.' };

  it('renders state.error.message verbatim', () => {
    render(<Composer state={composerState({ error })} onChange={vi.fn()} onSend={vi.fn()} onInterrupt={vi.fn()} commands={[]} />);
    const shown = screen.getByTestId('composer-error');
    expect(shown.textContent).toContain('Pod process is not running.');
    expect(shown.getAttribute('role')).toBe('alert');
  });

  it('clears the message on the next edit even if the parent has not yet', async () => {
    const user = userEvent.setup();
    render(<Harness initial={{ error }} clearErrorOnEdit={false} />);

    expect(screen.getByTestId('composer-error')).toBeTruthy();
    await user.type(input(), 'r');
    expect(screen.queryByTestId('composer-error')).toBeNull();
  });

  it('shows a NEW failure that arrives after an edit', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <Composer state={composerState({ error })} onChange={vi.fn()} onSend={vi.fn()} onInterrupt={vi.fn()} commands={[]} />,
    );
    await user.type(input(), 'x');
    const second: IpcError = { code: 'IO', message: 'Write failed.' };
    rerender(
      <Composer
        state={composerState({ text: 'x', error: second })}
        onChange={vi.fn()}
        onSend={vi.fn()}
        onInterrupt={vi.fn()}
        commands={[]}
      />,
    );
    expect(screen.getByTestId('composer-error').textContent).toContain('Write failed.');
  });
});

describe('Composer — Steer prefill arrives as ordinary text (criterion 5)', () => {
  it('renders the string it was handed and focuses the input', () => {
    const prefill = `${STEER_PREFILL_PREFIX}agent_7: rerun the failing test`;
    render(
      <Composer state={composerState({ text: prefill })} onChange={vi.fn()} onSend={vi.fn()} onInterrupt={vi.fn()} commands={[]} />,
    );

    expect(input().value).toBe(prefill);
    expect(document.activeElement).toBe(input());
  });

  it('takes focus when a prefill arrives while mounted, but not on the user\'s own keystrokes', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = render(
      <Composer state={composerState()} onChange={onChange} onSend={vi.fn()} onInterrupt={vi.fn()} commands={[]} />,
    );

    const outside = document.createElement('button');
    document.body.appendChild(outside);
    outside.focus();
    expect(document.activeElement).toBe(outside);

    rerender(
      <Composer
        state={composerState({ text: `${STEER_PREFILL_PREFIX}agent_7: ` })}
        onChange={onChange}
        onSend={vi.fn()}
        onInterrupt={vi.fn()}
        commands={[]}
      />,
    );
    expect(document.activeElement).toBe(input());

    // A local edit must not re-focus (it is already focused) nor be treated as
    // an external prefill; the harness proves the loop is stable.
    await user.type(input(), 'go');
    expect(onChange).toHaveBeenCalled();
    outside.remove();
  });
});

describe('Composer — contract surface (criteria 12, 13)', () => {
  it('carries every composer data-testid the contract names', () => {
    render(<Composer state={composerState()} onChange={vi.fn()} onSend={vi.fn()} onInterrupt={vi.fn()} commands={[]} />);
    expect(screen.getByTestId(TEST_IDS.composer)).toBeTruthy();
    expect(screen.getByTestId(TEST_IDS.composerInput)).toBeTruthy();
    expect(screen.getByTestId(TEST_IDS.composerSend)).toBeTruthy();
  });

  it('labels the textarea programmatically', () => {
    render(<Composer state={composerState()} onChange={vi.fn()} onSend={vi.fn()} onInterrupt={vi.fn()} commands={[]} />);
    expect(screen.getByLabelText('Message this Pod')).toBe(input());
  });

});
