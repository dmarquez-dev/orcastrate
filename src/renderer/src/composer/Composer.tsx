/**
 * The Pod composer (spec 5.2, 5.3, 5.4).
 *
 * THE COMPOSER IS BOUND TO THE POD, NOT THE LANE. There is exactly one of
 * these per Pod; selecting a Calf lane does not change its text and does not
 * disable it, because the message is addressed to the Pod's Matriarch either
 * way. This component holds no draft of its own — `state.text` is the draft,
 * and every keystroke goes out through `onChange`. That is what makes the
 * "select another lane, come back, the text is still there" guarantee free.
 *
 * It is a pure function of `ComposerProps`. It never touches
 * `window.orcastrate` and never imports from `../state`.
 *
 * SLASH-COMMAND SUGGESTIONS. A draft that is a leading `/` with no whitespace
 * after it opens a list of at most five of `commands`, those whose name or an
 * alias starts with the text after `/` (`matchSlashCommands` holds that rule).
 * The list never opens while the composer is disabled, and is shown only while
 * the textarea has focus: a blur closes it, a focus reopens it if the draft
 * still matches. While it is open the
 * keys change meaning: ArrowDown and ArrowUp move the selection and wrap;
 * Tab and Enter write `'/' + name + ' '` through `onChange` and neither send
 * nor interrupt; Esc closes the list and neither interrupts nor edits. While
 * it is closed every key does exactly what it does without it. The only state
 * the composer keeps for this is interaction state: which row is selected,
 * which draft Esc dismissed the list for, and whether the textarea has
 * focus. The rows themselves are derived
 * on every render, never stored.
 */

import { useEffect, useId, useRef, useState, type JSX, type KeyboardEvent } from 'react';

import type { IpcError, SlashCommandInfo } from '@shared/contracts/ipc';
import type { ComposerState } from '../contracts/renderer-state';
import type { ComposerProps } from '../contracts/renderer-view';
import { TEST_IDS } from '../contracts/renderer-view';

import styles from './Composer.module.css';
import { matchSlashCommands } from './slash-suggestions';
import { SlashCommandList, slashOptionId } from './SlashCommandList';

/**
 * Why the composer is not accepting input. Every branch of the frozen
 * `ComposerState['disabledReason']` union has copy here; the `null` case is
 * covered by `DISABLED_FALLBACK`, which is reachable when `disabled` is true
 * and the state layer has not attributed it.
 */
const DISABLED_COPY: Record<NonNullable<ComposerState['disabledReason']>, string> = {
  'not-opened': 'This Pod is not running. Open it before sending a message.',
  beached: 'This Pod is beached. Reconnect it before sending a message.',
  'awaiting-permission': 'Waiting on your permission decision below.',
};

const DISABLED_FALLBACK = 'This Pod is not accepting messages right now.';

export function disabledMessage(state: ComposerState): string | null {
  if (!state.disabled) return null;
  if (state.disabledReason === null) return DISABLED_FALLBACK;
  return DISABLED_COPY[state.disabledReason];
}

/**
 * The selection the user last made, and the rows it was made over. It counts
 * only while those are still the rows shown: a different set of rows, by
 * identity and order, puts the selection back on row 0.
 */
interface SuggestionSelection {
  rows: readonly SlashCommandInfo[];
  index: number;
}

function sameRows(a: readonly SlashCommandInfo[], b: readonly SlashCommandInfo[]): boolean {
  return a.length === b.length && a.every((row, index) => row === b[index]);
}

export function Composer({ state, onChange, onSend, onInterrupt, commands }: ComposerProps): JSX.Element {
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const labelId = useId();
  const noteId = useId();
  const errorId = useId();
  const listboxId = `${labelId}-commands`;

  /**
   * The draft Esc dismissed the list for, or `null`. The list stays closed
   * only while the draft is still that exact text. The first render that sees
   * any other draft clears it, whichever way the draft changed — a keystroke
   * here or a parent rewriting `state.text` — so coming back to the dismissed
   * text later, by any route, shows the list again.
   */
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);
  const [selection, setSelection] = useState<SuggestionSelection | null>(null);

  /**
   * Whether the textarea has focus, tracked from its own focus and blur
   * events. The list is shown only while it does: blurring closes it, and
   * focusing again reopens it if the draft still matches. A press on a row
   * does not blur, because the row accepts on mousedown and prevents the
   * default focus change. The prefill effect below focuses the textarea, and
   * that counts like any other focus.
   */
  const [focused, setFocused] = useState(false);

  if (dismissedFor !== null && dismissedFor !== state.text) setDismissedFor(null);


  const matches = state.disabled ? [] : matchSlashCommands(state.text, commands);
  const listOpen = focused && matches.length > 0 && dismissedFor !== state.text;
  const rows = listOpen ? matches : [];
  const selectedIndex = selection !== null && sameRows(selection.rows, rows) ? selection.index : 0;

  // A closed list forgets its selection, so the next time it opens it opens
  // on row 0 even if it shows the same rows as before.
  if (!listOpen && selection !== null) setSelection(null);

  /**
   * The last value this composer itself produced. Two things read it, and
   * neither works without it:
   *   - the focus effect, so typing does not re-focus on every keystroke;
   *   - nothing else. The draft still lives entirely in `state.text`.
   */
  const lastLocalEdit = useRef<string | null>(null);

  /**
   * Criterion: the send error clears on the next edit. The state layer clears
   * `ComposerState.error` in `setComposerText`, but the composer does not
   * depend on that having happened yet — it suppresses the error object it was
   * showing when the edit occurred. A NEW error object (a second failed send)
   * is a different identity and shows immediately, so this cannot latch.
   */
  const [suppressedError, setSuppressedError] = useState<IpcError | null>(null);
  const error = state.error !== null && state.error !== suppressedError ? state.error : null;

  const note = disabledMessage(state);
  const blocked = state.sending || state.disabled;

  /**
   * Focus on prefill (spec 5.3). Steer writes into `ComposerState.text` and the
   * composer takes focus so the user can edit and send. Any externally
   * supplied text does this — the composer does not sniff for
   * `STEER_PREFILL_PREFIX`, because the prefill is "text like any other value"
   * and this task neither formats nor recognises that string.
   */
  useEffect(() => {
    if (state.text.length === 0) return;
    if (lastLocalEdit.current === state.text) return;
    const input = inputRef.current;
    if (input === null) return;
    input.focus();
    const end = input.value.length;
    input.setSelectionRange(end, end);
  }, [state.podId, state.text]);

  function handleChange(next: string): void {
    lastLocalEdit.current = next;
    setSuppressedError(state.error);
    onChange(next);
  }

  /**
   * Accepts row `index`: writes `'/' + name + ' '`, the canonical name even
   * when only an alias matched. The trailing space is what closes the list,
   * because a draft with whitespace after the `/` matches nothing.
   */
  function acceptRow(index: number): void {
    const row = rows[index];
    if (row === undefined) throw new Error(`no suggestion row at index ${index}`);
    handleChange(`/${row.name} `);
  }

  /**
   * The keys the open list takes over. Returns true when it handled the key,
   * so the base handling below does not also run. Esc closes the list with or
   * without modifiers. Shift+Tab and Shift+Enter, and any other modified or
   * composing key, are left to the base handling.
   */
  function handleListKey(event: KeyboardEvent<HTMLTextAreaElement>): boolean {
    if (!listOpen) return false;
    if (event.key === 'Escape') {
      // Closes the list only. It does not interrupt and does not edit. The
      // list stays closed while the draft is this exact text; a draft that
      // differs clears the dismissal, and so does nothing else. Esc with the
      // list closed falls through to the interrupt below.
      event.preventDefault();
      setDismissedFor(state.text);
      setSelection(null);
      return true;
    }
    const plain =
      !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey && !event.nativeEvent.isComposing;
    if (!plain) return false;

    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        event.preventDefault();
        const step = event.key === 'ArrowDown' ? 1 : -1;
        setSelection({ rows, index: (selectedIndex + step + rows.length) % rows.length });
        return true;
      }
      case 'Tab':
      case 'Enter':
        event.preventDefault();
        acceptRow(selectedIndex);
        return true;
      default:
        return false;
    }
  }

  function handleSend(): void {
    if (blocked) return;
    onSend();
    // Focus stays where the user was working, rather than being stranded on a
    // button that is about to disable itself.
    inputRef.current?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (handleListKey(event)) return;

    if (event.key === 'Escape') {
      // Interrupts the active Pod's turn. It deliberately does NOT clear the
      // draft — the user's typing survives an interrupt (spec 5.4).
      event.preventDefault();
      onInterrupt();
      return;
    }

    if (event.key !== 'Enter') return;
    // Shift+Enter inserts a newline: let the textarea do it. So do the other
    // modifiers, and so does an in-flight IME composition, where Enter commits
    // the candidate rather than sending.
    if (event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.nativeEvent.isComposing) return;
    event.preventDefault();
    handleSend();
  }

  const describedBy = [note !== null ? noteId : null, error !== null ? errorId : null]
    .filter((id): id is string => id !== null)
    .join(' ');

  return (
    <section className={styles.composer} data-testid={TEST_IDS.composer} aria-label="Message composer">
      <label className={styles.srOnly} id={labelId} htmlFor={`${labelId}-input`}>
        Message this Pod
      </label>
      {listOpen && (
        <SlashCommandList rows={rows} selectedIndex={selectedIndex} listboxId={listboxId} onPick={acceptRow} />
      )}
      <textarea
        id={`${labelId}-input`}
        ref={inputRef}
        className={styles.input}
        data-testid={TEST_IDS.composerInput}
        value={state.text}
        onChange={(event) => handleChange(event.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        /*
         * `readOnly` rather than `disabled`: a disabled textarea leaves the
         * keyboard with nowhere to land, and Esc-to-interrupt needs the
         * composer focusable even while the Pod is waiting on a permission
         * decision. Input is refused, not swallowed — the note below says why.
         */
        readOnly={state.disabled}
        aria-readonly={state.disabled}
        aria-describedby={describedBy.length > 0 ? describedBy : undefined}
        aria-autocomplete={listOpen ? 'list' : undefined}
        aria-controls={listOpen ? listboxId : undefined}
        aria-activedescendant={listOpen ? slashOptionId(listboxId, selectedIndex) : undefined}
        placeholder="Message this Pod. Enter sends, Shift+Enter adds a line."
        spellCheck
      />

      {note !== null && (
        <p className={styles.disabledNote} id={noteId} data-testid="composer-disabled-note">
          <span className={styles.marker} aria-hidden="true">
            {'[!]'}
          </span>
          {note}
        </p>
      )}

      {error !== null && (
        <p className={styles.error} id={errorId} role="alert" data-testid="composer-error">
          <span className={styles.marker} aria-hidden="true">
            {'[x]'}
          </span>
          {error.message}
        </p>
      )}

      <div className={styles.row}>
        <span className={styles.hint}>Enter sends · Shift+Enter newline · Esc interrupts</span>
        <button
          type="button"
          className={styles.send}
          data-testid={TEST_IDS.composerSend}
          onClick={handleSend}
          disabled={blocked}
          aria-busy={state.sending}
        >
          {state.sending ? 'Sending…' : 'Send'}
        </button>
      </div>
    </section>
  );
}
