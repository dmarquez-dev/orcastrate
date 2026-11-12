# Workspace load retry

This session gives the workspace-level load-error notifications (E8, E9 and E10) a Retry action. Pressing it re-runs the failed load, and the notification is dismissed once the load succeeds.

## Context

- The work comes from the backlog row at `.sir/backlog.md:36` (session `20261111-0156-message-alerting`, routed by that session's spec as Not in scope). The row asks for a retry affordance for E8 (`lanes.list`), E9 (`events.read` backfill) and E10 (`app.routingMode`).
- `src/renderer/src/shell/WorkspaceAlerts.tsx` raises all three as keyed, persistent error notifications:
  - E8 uses the key `lanes-load:{podId}` and E9 uses `events-load:{podId}`. Both are dismissed when that Pod's phase leaves `'error'`.
  - E10 uses the key `routing-mode` and is never dismissed. The file's header comment gives the reason: "because there is no retry".
  - Today the only recovery from any of the three is restarting the app.
- The notification API has no action field. `NotificationRequest` (`src/renderer/src/notifications/types.ts:17`) carries a kind, a message and a key. `NotificationItem` (`src/renderer/src/notifications/NotificationItem.tsx`) renders the marker and the message only.
- The three loads are in `src/renderer/src/state/store.ts`:
  - `app.routingMode()` is at `:319`, inside the private `loadRoutingMode`. Its doc comment at `:311-315` says it is read once at startup, with "No retry", and the failure is kept as `routingModeError` (`:136-137`).
  - The backfill page load is at `:848-880`, with `backfill.phase` and `backfill.error`. It sits inside the public action `loadMoreEvents(podId)` (`:841`), so a page read can already be re-run from outside the store. The spec phase should check whether that is enough for E9's retry.
  - `lanes.list` is at `:987`, inside the private `loadLanes(podId)` (`:979`).
  - E8 and E10 therefore have no public retry entry point. This was checked by grepping `retry|reload` in `src/renderer/src/{state,notifications,shell}`. The only hits are `panel-store.ts`'s document `reload`, which is unrelated, and the "No retry" comment.
- The message texts and keys come from the frozen `contracts/action-messages.md` of session `20261111-0156-message-alerting`.

## Decisions

- Gate 1 approved this goal, the Standard track and the name `workspace-load-retry`. Standard because the work adds new interfaces: an optional notification action, and retry entry points in the store.
- Scope covers all three errors: E8, E9 and E10.
- A Retry action re-runs the load that failed. On success, the notification is dismissed through the existing keyed dismissal: E8 and E9 when the phase leaves `'error'`, and E10 newly, once `routingModeError` clears.
- The notification action is optional and opt-in. Notifications raised without one must render and behave exactly as they do today.
- Not settled here, left to the spec phase:
  - The exact shape of the action (label, callback) on `NotificationRequest`.
  - Whether pressing Retry dismisses the item at once, or leaves it until the outcome is known.
  - How the button meets the region's accessibility floor and focus behaviour.
- Out of scope: the other open backlog rows. These are the human checks N3, N5, N6 and N7 step 5, the N6-dependent live-region row at `:35`, and the rows at `:27`, `:30-34`.
