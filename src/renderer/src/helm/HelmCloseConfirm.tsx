/**
 * The confirmation the Helm panel raises when a close would throw away unsaved
 * edits.
 *
 * THE PANEL OWNS THIS, NOT THE SHELL. `PanelCloseGuard.beforeClose` says so in
 * as many words: the panel is what knows the word "draft", so the panel
 * renders the dialog and resolves the guard from its outcome. `App.tsx` and
 * `shell/` render nothing and are never handed the word.
 *
 * PRESENTATION ONLY. Two callbacks in, no hook into any store, no bridge — it
 * mounts in a test with no provider. The promise it settles is the guard's
 * business, in `HelmCloseGuard.tsx`.
 *
 * THE ACCESSIBILITY FLOOR, IN FULL, BECAUSE A DIALOG IS WHERE IT USUALLY GOES
 * WRONG:
 *
 *   - Both controls are real `<button>`s: reachable and operable by keyboard
 *     with no key handling of our own.
 *   - The dialog is NAMED by its heading (`aria-labelledby`) and DESCRIBED by
 *     its body (`aria-describedby`), so a screen reader announces what is
 *     being asked, not just "dialog".
 *   - FOCUS MOVES IN when it opens, onto "Keep editing" — the non-destructive
 *     answer, so a stray Enter cannot discard anything.
 *   - FOCUS RETURNS on close to whatever had it when the dialog opened, which
 *     is the shell control the user actually pressed. Captured on mount rather
 *     than passed in, because the panel does not know which of the shell's
 *     three affordances raised it.
 *   - TAB IS TRAPPED between the two buttons, and Escape answers "keep
 *     editing" — the way out that loses nothing.
 */

import { useLayoutEffect, useRef, type JSX, type KeyboardEvent } from 'react';

import { COPY } from './copy';
import { HELM_SAFETY_TEST_IDS } from './test-ids';
import styles from './Helm.module.css';

const HEADING_ID = 'helm-close-confirm-heading';
const BODY_ID = 'helm-close-confirm-body';

export interface HelmCloseConfirmProps {
  /** Cancel the close. The guard resolves `false`. */
  onKeep(): void;
  /** Let the close proceed, losing the edits. The guard resolves `true`. */
  onDiscard(): void;
}

export function HelmCloseConfirm({ onKeep, onDiscard }: HelmCloseConfirmProps): JSX.Element {
  const keep = useRef<HTMLButtonElement | null>(null);
  const discard = useRef<HTMLButtonElement | null>(null);

  useLayoutEffect(() => {
    const owner = keep.current?.ownerDocument ?? null;
    const raisedBy = owner === null ? null : owner.activeElement;
    keep.current?.focus();

    return () => {
      // `isConnected` because the raising control may itself have gone — a
      // panel-switch button that re-rendered, say. Focusing a detached node
      // silently drops focus to the body, which is the outcome this exists to
      // avoid, so we simply leave it where it is instead.
      if (raisedBy instanceof HTMLElement && raisedBy.isConnected) raisedBy.focus();
    };
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onKeep();
      return;
    }
    if (event.key !== 'Tab') return;

    // Two focusable controls, so the trap is just "the other one" at each end.
    const first = keep.current;
    const last = discard.current;
    if (first === null || last === null) return;

    const active = first.ownerDocument.activeElement;
    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div className={styles.confirmScrim}>
      {/*
        The keydown handler sits on the dialog, which is not itself focusable —
        it catches the event on its way up from whichever button has focus, and
        both of those are real buttons. No non-interactive element here is
        clickable, so none needs a role or a key handler of its own.
      */}
      <div
        aria-describedby={BODY_ID}
        aria-labelledby={HEADING_ID}
        aria-modal="true"
        className={styles.confirm}
        data-testid={HELM_SAFETY_TEST_IDS.closeConfirm}
        onKeyDown={onKeyDown}
        role="dialog"
      >
        <p className={styles.confirmHeading} id={HEADING_ID}>
          {COPY.closeConfirmHeading}
        </p>
        <p className={styles.noticeText} id={BODY_ID}>
          {COPY.closeConfirmBody}
        </p>
        <div className={styles.confirmActions}>
          <button
            className={styles.button}
            data-testid={HELM_SAFETY_TEST_IDS.closeConfirmKeep}
            onClick={onKeep}
            ref={keep}
            type="button"
          >
            {COPY.closeConfirmKeep}
          </button>
          <button
            className={styles.button}
            data-testid={HELM_SAFETY_TEST_IDS.closeConfirmDiscard}
            onClick={onDiscard}
            ref={discard}
            type="button"
          >
            {COPY.closeConfirmDiscard}
          </button>
        </div>
      </div>
    </div>
  );
}
