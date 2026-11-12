# Workspace load retry

Give the workspace-level load-error notifications E8, E9 and E10 a Retry action that re-runs the failed load, so recovering no longer needs an app restart.

## Context

- `src/renderer/src/shell/WorkspaceAlerts.tsx` raises three keyed, persistent error notifications. E8 (`lanes.list`) uses the key `lanes-load:{podId}`, E9 (`events.read` backfill) uses `events-load:{podId}`, and E10 (`app.routingMode`) uses `routing-mode`. E8 and E9 are dismissed when the Pod's phase leaves `'error'`. E10 is never dismissed, "because there is no retry" (`:13-14`).
- The notification API has no action. `NotificationRequest` (`notifications/types.ts:17-23`) carries a kind, a message and a key. A keyed replacement copies only `kind` and `message` (`NotificationProvider.tsx:96-101`).
- In the store, `loadLanes` (`store.ts:979`) and `loadRoutingMode` (`:316`) are private. A successful routing-mode read never clears `routingModeError`: the only write of that field is the failure branch at `:322`. E9 already has a public retry. `loadMoreEvents` re-reads a failed page, because its no-op is keyed on `phase === 'ready' && !hasMore` (`:853`).
- The work comes from the backlog row at `.sir/backlog.md:36`, and its scope was settled at Gate 1 (`discussion.md`).

## Definition of done

1. A notification raised without an action renders exactly as it does today: three children, one button, and no `id` on the message element.
2. A notification raised with an action renders a native button between the message and the dismiss control. Its accessible name is the action's label.
3. The action button is `aria-describedby` its own item's message element.
4. Activating the action calls its callback exactly once and removes only that item.
5. After activation, focus moves to the following item's dismiss control.
6. If no item follows, focus moves to the preceding item's dismiss control.
7. If no item is left, focus moves to the viewport.
8. If the callback synchronously re-raises the same key, exactly one item results.
9. A keyed replacement that carries an action replaces the old action.
10. A keyed replacement that carries no action removes the action control.
11. A keyed replacement can add an action to an item that had none.
12. An `info` notification with an action still auto-dismisses at `autoDismissMs`.
13. An `error` notification with an action still persists.
14. The action control's styles use only tokens, and it has the dismiss control's focus ring.
15. `retryLanes(podId)` succeeds after a failure: the lanes become ready, and `lanesError` is `null`.
16. When `retryLanes` fails, `lanesError` is the same `IpcError` object the bridge returned.
17. While `retryLanes` is in flight, the lanes show the `'loading'` phase.
18. A `retryLanes` call made while a lane load is in flight coalesces into that load.
19. `retryRoutingMode()` succeeds after a failure: the mode is set, and `routingModeError` is `null`.
20. When `retryRoutingMode` fails, `routingModeError` is that failure's `IpcError` object.
21. `routingModeError` is `null` while a retry is in flight.
22. `retryRoutingMode` is a no-op once the mode is resolved.
23. `retryRoutingMode` coalesces with the startup read.
24. The store's error-discipline table covers both new entry points.
25. Both `WorkspaceActions` enumeration tests list the two new members.
26. E9's retry (`loadMoreEvents` after a failure) re-reads the same page.
27. No source docblock says that a workspace load has no retry.
28. E8 Retry, when the retry succeeds, removes the item and shows the lanes.
29. E8 Retry, when the retry fails again, leaves exactly one E8 item with a Retry button.
30. E9 Retry, when the retry succeeds, re-reads the same page and removes the item.
31. E9 Retry, when the retry fails again, leaves exactly one E9 item with a Retry button.
32. E10 Retry, when the retry succeeds, removes the item, and the lane rail appears.
33. E10 Retry, when the retry fails again with the same error object, leaves exactly one E10 item with a Retry button.
34. E10 is dismissed by key whenever `routingModeError` is `null`.
35. While a retry is in flight, its item is absent.
36. The touched files carry no session-id citation and no `.sir/sessions` path. The `src` census drops from 12 files to 8, and the `.sir/sessions` census from 1 to 0.
37. `npm run typecheck`, `npm test` and `npm run build` pass at the last task's tip, and the build rewrites no tracked file.
38. The Retry control is visible and legible in both themes. Accepted out of scope at Gate 2 (D2); see Not in scope.

## Scope

- **In scope:**
  - An optional, opt-in `action` on `NotificationRequest`, with its control in `NotificationItem` and its behaviour in `NotificationProvider`.
  - `retryLanes` and `retryRoutingMode` on `WorkspaceActions`.
  - Wiring E8, E9 and E10 to their retry in `WorkspaceAlerts`.
  - Rewording the docblocks that deny a retry.
  - Removing the session citations in the four docblocks the tasks rewrite.

### Not in scope

- The other open backlog rows: the human checks N3, N5, N6 and N7 step 5, the N6-dependent row at `:35`, and the rows at `:27` and `:30-34`.
- Retry for any notification other than E8, E9 and E10. No other caller passes an `action`.
- Any change to IPC, preload or the main process. No task's ownership set reaches those files.
- A visual check that the Retry control is visible and legible in both themes (item 38). Gate 2 accepted it out of scope (D2). Gate 3 carries it to `.sir/backlog.md` as a human check not made.

## Assumptions

| Question | Answer | Rung | Evidence |
|---|---|---|---|
| What shape does the action take on `NotificationRequest`? | `action?: { label: string; onAction: () => void }` | 1 | Callbacks in this layer return void: `NotificationItem.tsx:32-37` (`onDismiss(): void`) and `types.ts:25-30` |
| What is the button's accessible name? | Its visible label, `Retry`, with no `aria-label`. It is also `aria-describedby` its own message, because E8, E9 and E10 can all be live at once, giving three buttons named Retry. | 1 + 4 | The dismiss control needs `aria-label` only because its content is a glyph (`NotificationItem.tsx:58`, `:65`). The `aria-describedby` part is judgment. |
| What does a keyed replacement do to the action? | It takes the new request's action, and removes the action when the new request has none. | 1 | Replacement already takes `kind` and `message` from the new request (`NotificationProvider.tsx:96-101`) |
| What happens when Retry is activated? | It removes the item, moves focus as the dismiss control does, then calls `onAction`. A failed retry raises the item again under the same key. | user (Gate 2, D1) | The dismiss focus rule is at `NotificationProvider.tsx:201-207`. The E8/E9 alert is already dismissed when the phase leaves `'error'` (`WorkspaceAlerts.tsx:45-49`), and the loads set `'loading'` before the call (`store.ts:981-985`, `:863`). |
| Should the action control get a test id? | No. Tests query by role and name, and the runtime-exports test stays unchanged. | 1 | `NotificationProvider.test.tsx:113-126` |
| What are the entry points named? | `retryLanes(podId)` and `retryRoutingMode()`. E9 reuses `loadMoreEvents`. | 1 | `store.ts:853`; the retry-after-failure test at `store.test.ts:717-731` |
| Do retries coalesce? | Yes, with any load already in flight, including the activation load and the startup read. | 1 | `renderer-state.ts:516-520` ("the state layer … is responsible for suppressing a redundant in-flight duplicate"); the in-flight maps at `store.ts:200-203` |
| What does a retry do once the routing mode is resolved? | Nothing. The value is constant for the app's lifetime. | 1 | `ipc.ts:423-428` ("Constant for the app's lifetime"); `renderer-state.ts:142-144` |
| What is `routingModeError` while a retry is in flight? | `null`, so a repeat failure that returns the same error object still changes the field and re-raises E10. | 1 | The stub returns the same `IpcError` object on every failed call (`test-utils/stub-api.ts:564-565`). The E10 effect re-runs only when the field changes (`WorkspaceAlerts.tsx:71-74`). |
| Is E10 dismissed when `routingModeError` is `null`? | Yes. | user | `discussion.md`, Decisions ("E10 newly, once `routingModeError` clears") |
| Should the session citations in rewritten docblocks be removed? | Yes, in the four docblocks the tasks rewrite. A source docblock states its rule in place. | 1 | `.sir/lessons.md:63-64`; the citation at `renderer-state.ts:164-165` points to a rule that says "No retry" |
| Should the `loadMoreEvents` docblock be corrected? | Yes. It says the method is a no-op whenever `hasMore` is false, but the code also requires phase `'ready'`. | 1 | `renderer-state.ts:682-686` against `store.ts:853` |
| Can T1 and T2 run concurrently in the one worktree? | Yes. Neither imports the other's directory, neither runs a build or a repo-wide command, and T3 runs after both. | 1 | `git grep -l notifications -- src/renderer/src/state` and the reverse grep both print nothing (exit 1); the positive control `git grep -l notifications -- src/renderer/src/shell` lists 2 files |

## Contracts

- [`contracts/notification-action.ts`](contracts/notification-action.ts): `NotificationAction`, `NotificationRequest.action`, and the DOM, activation, keyed-replacement, lifetime and style rules. Produced by T1, consumed by T3.
- [`contracts/workspace-retry-actions.ts`](contracts/workspace-retry-actions.ts): `retryLanes`, `retryRoutingMode`, the corrected `loadMoreEvents` docblock, and the reworded `routingMode` and `routingModeError` docblocks. Produced by T2, consumed by T3.

## Open questions

None. Gate 2 settled the two open questions:
- D1: activating Retry removes the item at once.
- D2: item 38 is out of scope and goes to the backlog as a human check.
