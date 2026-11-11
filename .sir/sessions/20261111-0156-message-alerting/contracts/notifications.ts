// frozen: 20261111-0156-message-alerting, Gate 2
/**
 * CONTRACT — the in-app notification region (mechanism A).
 *
 * Boundary between:
 *   - T1 (PRODUCER) writes `src/renderer/src/notifications/**`. The
 *     declarations below ship from `src/renderer/src/notifications/index.ts`,
 *     which T1 owns. Every consumer imports from that file and from nowhere
 *     else; no consumer re-declares any of these names.
 *   - T4 (CONSUMER) mounts `NotificationProvider` in `App.tsx` and calls
 *     `useNotify()` for the workspace-level rows of `action-messages.md`.
 *   - T5 (CONSUMER) calls `useNotify()` from `PodsChrome.tsx` for the Pod
 *     header rows of `action-messages.md`.
 *   - T3 (TEST CONSUMER) queries the region through `NOTIFICATION_TEST_IDS`
 *     and the DOM guarantees below.
 *
 * RENDERER ONLY. No IPC channel, no preload member, no `node:` import, no new
 * dependency. Notifications are client interaction state: they live in the
 * provider's own state and never in the workspace store.
 */

import type { JSX, ReactNode } from 'react';

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

/**
 * `'error'`   — an unrecoverable failure. PERSISTS until the user dismisses it
 *               or a caller calls `dismiss(key)`. Never auto-dismissed, never
 *               evicted by the transient cap.
 * `'info'`    — a neutral outcome of a data-altering action. Transient.
 * `'success'` — a completed data-altering action. Transient.
 */
export type NotificationKind = 'error' | 'info' | 'success';

export interface NotificationRequest {
  kind: NotificationKind;
  /**
   * Shown VERBATIM: no prefix, no suffix, no wrapper sentence. For an error
   * that crossed IPC this is `IpcError.message`, unmodified.
   * An empty string is a caller defect; the provider renders it as given and
   * does not throw.
   */
  message: string;
  /**
   * Optional identity. While a live notification carries this key, a second
   * `notify` with the same key REPLACES it in place — its kind and message
   * become the new ones, its DOM position is kept, and a transient's
   * auto-dismiss timer restarts — and never adds a second item. Without a key,
   * every `notify` adds a new item.
   */
  key?: string;
}

export interface Notifier {
  /**
   * Adds or replaces a notification. Synchronous, returns nothing, never
   * throws inside a provider. NEVER MOVES FOCUS.
   */
  notify(request: NotificationRequest): void;
  /**
   * Removes the live notification carrying `key`. A key that names no live
   * notification is a NO-OP: no throw, no warning. Does not move focus.
   */
  dismiss(key: string): void;
}

// ---------------------------------------------------------------------------
// Provider and hook
// ---------------------------------------------------------------------------

export interface NotificationProviderProps {
  children: ReactNode;
  /**
   * Test seam. How long an `'info'` or `'success'` notification stays before
   * it is removed. Omitted in the app, where it is 6000 ms. Has no effect on
   * `'error'`.
   */
  autoDismissMs?: number;
}

/**
 * Renders `children` and THEN the viewport, exactly once, as the last child.
 * The viewport is mounted for the provider's whole lifetime, empty included.
 * On unmount every pending auto-dismiss timer is cleared.
 */
export declare function NotificationProvider(props: NotificationProviderProps): JSX.Element;

/**
 * The returned object is REFERENTIALLY STABLE for the provider's lifetime
 * (`Object.is` across renders), so it is safe in effect dependency lists.
 *
 * OUTSIDE A PROVIDER IT THROWS `Error` whose message contains the text
 * `NotificationProvider`. It never returns a silent no-op: a notifier that
 * drops errors would break the "every unrecoverable failure always produces
 * an error" requirement without a trace.
 */
export declare function useNotify(): Notifier;

/*
 * TRANSIENT CAP (behaviour, not an export: no other task reads it). At most
 * three `'info'` + `'success'` notifications are live at once. Adding one
 * beyond the cap removes the OLDEST transient. Errors are not counted and are
 * never removed by the cap.
 */

// ---------------------------------------------------------------------------
// DOM guarantees (what T3 queries)
// ---------------------------------------------------------------------------

/**
 * VIEWPORT: one element carrying `data-testid={NOTIFICATION_TEST_IDS.viewport}`,
 * `aria-label="Notifications"` and `tabIndex={-1}`. Items appear in it in the
 * order they were first added (oldest first); a keyed replacement keeps its
 * place.
 *
 * ITEM: one element per live notification, inside the viewport, carrying
 * `data-testid={NOTIFICATION_TEST_IDS.item}` and `data-kind={kind}`. It
 * contains, as separate children:
 *   - a marker glyph, `aria-hidden="true"`, distinct per kind, so colour is
 *     never the only carrier of the kind;
 *   - the MESSAGE ELEMENT: `role="alert"` for `'error'`, `role="status"` for
 *     `'info'` and `'success'`. Its `textContent` is EXACTLY `message`, and its
 *     first child is a single `Text` node whose data is `message`;
 *   - the DISMISS CONTROL: a native `<button type="button">` with accessible
 *     name `Dismiss notification` and
 *     `data-testid={NOTIFICATION_TEST_IDS.dismiss}`. It is a SIBLING of the
 *     message element, never inside it. Every kind has one.
 *
 * TIMERS: a transient's auto-dismiss is PAUSED while the pointer is over the
 * viewport or focus is within it, and resumes when both have left.
 *
 * FOCUS AFTER A DISMISS-CONTROL ACTIVATION: moves to the dismiss control of
 * the item that followed the removed one; if none followed, to the item that
 * preceded it; if no item remains, to the viewport element.
 *
 * LAYOUT: the viewport is taken out of flow at one window corner and is NOT a
 * full-window overlay — it must not match `hygiene.test.ts`'s
 * `isFullWindowRule` (position fixed AND inset pinned on every edge) and paints
 * no scrim. It stacks above the dialog scrims. Its stylesheet uses only
 * `--oc-*` tokens that `TOKENS` in `contracts/renderer-theme.ts` names.
 */
export declare const NOTIFICATION_TEST_IDS: {
  readonly viewport: 'notification-viewport';
  readonly item: 'notification';
  readonly dismiss: 'notification-dismiss';
};
