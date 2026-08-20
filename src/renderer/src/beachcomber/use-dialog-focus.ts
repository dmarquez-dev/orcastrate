/**
 * The three things the accessibility floor asks of a dialog that this app had
 * nowhere to put: focus ON OPEN, focus KEPT INSIDE, focus RETURNED on close.
 *
 * A hook rather than a component so `BeachcomberPreviewDialog.tsx` stays a
 * composition of its parts and does not also become a focus manager.
 *
 * WHY THE RESTORE TARGET IS NOT SIMPLY THE OPENER. Confirming the preview
 * trashes the selection, which prunes it, which DISABLES the preview button
 * that opened the dialog. Focusing a disabled element silently does nothing and
 * focus falls to `<body>` — keyboard position lost at the exact moment the user
 * most needs to read what happened. So the opener is used only while it is
 * still connected and still enabled; otherwise focus goes to the fallback the
 * caller names.
 */

import { useEffect, useRef, type KeyboardEvent, type RefObject } from 'react';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function focusableWithin(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (element) => element.getAttribute('aria-hidden') !== 'true',
  );
}

function isUsable(element: Element | null): element is HTMLElement {
  if (element === null || !(element instanceof HTMLElement)) return false;
  if (!element.isConnected) return false;
  // `<body>` is where focus lands when nothing holds it. Restoring TO it is
  // the loss this hook exists to prevent, not a restore.
  if (element === element.ownerDocument.body) return false;
  return !('disabled' in element && element.disabled === true);
}

/**
 * Returns the ref to spread onto the dialog element, plus the `keydown`
 * handler that keeps Tab inside it.
 */
export function useDialogFocus(fallback: RefObject<HTMLElement | null>): {
  dialogRef: RefObject<HTMLDivElement | null>;
  onKeyDown(event: KeyboardEvent<HTMLElement>): void;
} {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const openerRef = useRef<Element | null>(null);

  useEffect(() => {
    openerRef.current = document.activeElement;
    const dialog = dialogRef.current;
    // The dialog itself, not its first control: the user should hear the
    // accessible name and the lead sentence before the confirm button.
    dialog?.focus();

    return () => {
      const opener = openerRef.current;
      const target = isUsable(opener) ? opener : fallback.current;
      target?.focus();
    };
  }, [fallback]);

  function onKeyDown(event: KeyboardEvent<HTMLElement>): void {
    if (event.key !== 'Tab') return;
    const dialog = dialogRef.current;
    if (dialog === null) return;

    const focusable = focusableWithin(dialog);
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (first === undefined || last === undefined) {
      // Nothing to move to: Tab must not leave the dialog.
      event.preventDefault();
      return;
    }

    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === dialog)) {
      event.preventDefault();
      last.focus();
      return;
    }
    if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return { dialogRef, onKeyDown };
}
