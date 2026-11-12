// frozen: 20261112-0151-workspace-load-retry, Gate 2
/**
 * CONTRACT — an optional action on a notification.
 *
 * Boundary between:
 *   - T1 (PRODUCER) owns `src/renderer/src/notifications/**`. The declarations
 *     below are written ONCE, in `src/renderer/src/notifications/types.ts`, and
 *     re-exported from `src/renderer/src/notifications/index.ts`. Every consumer
 *     imports from `index.ts` and from nowhere else; no consumer re-declares
 *     `NotificationAction` or the `action` field.
 *   - T3 (CONSUMER) passes an `action` from `src/renderer/src/shell/WorkspaceAlerts.tsx`
 *     on the three workspace load errors (keys `lanes-load:{podId}`,
 *     `events-load:{podId}`, `routing-mode`), and tests through the DOM below.
 *
 * Everything the existing notification region guarantees is UNCHANGED unless a
 * rule below says otherwise: lifetimes, the transient cap, pausing, keyed
 * identity, `notify` and `dismiss(key)` never moving focus, the dismiss
 * control and its focus rule, the message element's role and children, and
 * `NOTIFICATION_TEST_IDS` (no id is added). RENDERER ONLY: no IPC, no preload
 * member, no new dependency.
 */

// ---------------------------------------------------------------------------
// Declarations
// ---------------------------------------------------------------------------

/** UNCHANGED. Restated so this file compiles on its own. */
export type NotificationKind = 'error' | 'info' | 'success';

/**
 * One control on one notification that does something other than dismiss it.
 */
export interface NotificationAction {
  /**
   * The control's visible text and its ENTIRE accessible name: the control
   * carries no `aria-label` and no `aria-labelledby`. Rendered verbatim. An
   * empty string is a caller defect; it is rendered as given and nothing
   * throws.
   */
  label: string;
  /**
   * Called EXACTLY ONCE per activation of the control, synchronously inside
   * the activation handler, AFTER the provider has requested the item's
   * removal (see ACTIVATION). Its return value is ignored. It must not throw;
   * the provider does not catch, so a caller handing over a store action wraps
   * it as `() => { void actions.x(...); }` — store actions resolve and never
   * reject.
   */
  onAction: () => void;
}

/**
 * AMENDED. `kind`, `message` and `key` are unchanged in meaning.
 */
export interface NotificationRequest {
  kind: NotificationKind;
  message: string;
  key?: string;
  /**
   * ADDED, OPTIONAL. Absent means the item renders and behaves exactly as an
   * item does without this field: no action control, no extra attribute on
   * any element.
   */
  action?: NotificationAction;
}

// ---------------------------------------------------------------------------
// Behaviour (declarations only; no export carries these)
// ---------------------------------------------------------------------------

/*
 * DOM. An item whose request carries `action` has, as separate children and in
 * this order: the marker glyph, the message element, the ACTION CONTROL, the
 * dismiss control. The action control is a native `<button type="button">`,
 * a SIBLING of the message element and never inside it, whose `textContent`
 * is `label` and whose accessible name is `label`. Its `aria-describedby`
 * names the `id` of the message element of the same item, so a screen reader
 * hears which failure it acts on when several items share a label. That `id`
 * is set on the message element ONLY when an action is present. The message
 * element otherwise keeps every guarantee it has today: same role, and it
 * holds nothing but `message`.
 *
 * An item whose request carries no `action` has exactly the three children it
 * has today (marker, message element, dismiss control), exactly one button,
 * and no `id` on its message element.
 *
 * ACTIVATION. Activating the action control (click, or Enter / Space on the
 * native button) does, in this order:
 *   1. records the focus target exactly as the dismiss control does — the
 *      dismiss control of the item that followed this one; if none followed,
 *      of the item that preceded it; if no item remains, the viewport element;
 *   2. removes THIS item (only this one);
 *   3. calls `action.onAction()` once.
 * Focus lands on the recorded target once the item has left the DOM. If
 * `onAction` synchronously calls `notify` with the same `key`, the result is
 * one live item carrying that key — added as a new item at the end of the
 * viewport, since the old one was removed — and focus still lands on the
 * target recorded in step 1; `notify` itself never moves focus.
 *
 * KEYED REPLACEMENT. A `notify` whose `key` matches a live item makes that
 * item exactly what the new request describes: its `kind`, its `message` AND
 * its `action` become the new request's. A replacement that carries an
 * `action` sets it (a different label or callback replaces the old one); a
 * replacement that carries NO `action` REMOVES the action control. Position
 * and the restart of a transient's timer are unchanged.
 *
 * LIFETIMES. An action changes nothing about lifetime: an `'error'` with an
 * action still persists, and an `'info'` or `'success'` with one still
 * auto-dismisses and still counts toward the transient cap. Focus on the
 * action control is focus within the viewport, so it pauses timers like
 * focus on the dismiss control does.
 *
 * STYLE. The action control's stylesheet rules use only `--oc-*` tokens that
 * `TOKENS` in `src/renderer/src/contracts/renderer-theme.ts` names, and a
 * `:focus-visible` rule draws the same thick focus-ring outline the dismiss
 * control has.
 */
