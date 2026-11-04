/**
 * The three things the accessibility floor asks of a modal dialog: focus ON
 * OPEN, focus KEPT INSIDE, focus RETURNED on close. Every modal dialog in the
 * renderer uses this — Beachcomber's preview and both Pod dialogs — so none of
 * them has to become a focus manager as well as a composition of its parts.
 *
 * OPEN, NOT MOUNT. A dialog can be mounted only while it is open (Beachcomber's
 * preview) or mounted always and render null while closed (`PodsChrome` mounts
 * both Pod dialogs that way). So the opener is captured when `open` becomes
 * true and focus is returned when it becomes false — or when the component
 * unmounts while open, which is the same close seen from the other side.
 * Capturing at mount would record whatever held focus before anything was ever
 * opened, and restoring only at unmount would never fire for an always-mounted
 * dialog at all.
 *
 * WHY THE RESTORE TARGET IS NOT SIMPLY THE OPENER. A dialog's own action can
 * remove or disable the control that opened it: confirming Beachcomber's
 * preview prunes the selection and DISABLES the preview button; deleting a Pod
 * removes its tab, delete control included; creating a Pod from the empty
 * workspace unmounts the empty workspace. Focusing a disabled or detached
 * element silently does nothing and focus falls to `<body>` — keyboard position
 * lost at the exact moment the user most needs to read what happened. So the
 * opener is used only while it is still connected and still enabled; otherwise
 * focus goes to the fallback the caller names.
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

export interface DialogFocusOptions {
  /**
   * Whether the dialog is showing. Defaults to true, for a dialog that is
   * mounted only while it is open.
   */
  open?: boolean;
  /**
   * What receives focus on open. Defaults to the dialog element itself, so the
   * user hears its accessible name and lead sentence before any button. A
   * dialog whose first job is input (New Pod) names its first field instead.
   */
  initialFocus?: RefObject<HTMLElement | null>;
  /**
   * What the dialog is currently about, for a dialog that can switch subject
   * while it stays open (Delete Pod, put up for a second Pod before the first
   * was answered). While `open` is true, a change in this value re-runs the
   * open path: focus moves to `initialFocus`, or to the dialog element, so the
   * user hears the new subject instead of staying on a button that now acts on
   * something else. The switch runs the close path first, so the opener is
   * restored and then read again as the opener of the new subject: focus still
   * returns to it on close, or to `fallback` if it was gone by the switch.
   *
   * A primitive, compared by value — pass an id, never the object it belongs
   * to, or every rerender that rebuilds the object would yank focus. Leaving it
   * out keeps the subject fixed for as long as the dialog is open.
   */
  focusKey?: string | number | null;
}

/**
 * Returns the ref to spread onto the dialog element, plus the `keydown`
 * handler that keeps Tab inside it.
 */
export function useDialogFocus(
  fallback: RefObject<HTMLElement | null>,
  { open = true, initialFocus, focusKey }: DialogFocusOptions = {},
): {
  dialogRef: RefObject<HTMLDivElement | null>;
  onKeyDown(event: KeyboardEvent<HTMLElement>): void;
} {
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    // Read before anything below moves focus: this is the control the user
    // was on when the dialog appeared.
    const opener = document.activeElement;
    (initialFocus?.current ?? dialogRef.current)?.focus();

    return () => {
      const target = isUsable(opener) ? opener : fallback.current;
      target?.focus();
    };
  }, [open, fallback, initialFocus, focusKey]);

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
