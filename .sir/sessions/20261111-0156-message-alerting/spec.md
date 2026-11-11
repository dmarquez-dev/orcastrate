# Message alerting

Add an in-app notification region to the renderer, move the Pod tab header's in-row alerts onto
it, and make every data-altering action report success or info and every unrecoverable failure
report an error, with main's message verbatim.

## Context

- `.sir/backlog.md:36` (session `20261110-1857-chrome-alert-width`) asks for a researched
  alerting mechanism and questions the Pod tab header as the place for errors: `.alertRow`
  (`PodsChrome.module.css:81`; used at `PodsChrome.tsx:286`, `:316`), the fork-error
  `.dismissible` (`:49`; `PodsChrome.tsx:299`) and `.reorderRow` (`PodBarPanel.module.css:30`;
  `PodBarPanel.tsx:101`).
- `.sir/backlog.md:35` (same session) asks for a measurement of an alert beside a long reorder
  alert in that row.
- No notification mechanism exists at `7489152`: `grep -rniE 'Notification|toast|snackbar'`
  over `src/` and `docs/superpowers/specs/` finds only prose. `package.json` has no UI library.
- Seven invoke channels reach no rendered error surface today (`SURFACELESS_CHANNELS`,
  `failure-paths.e2e.test.tsx:183-191`). Five of them are reachable: `podClose`
  (`PodsChrome.tsx:127` discards the result), `podInterrupt` (`App.tsx:219`), `laneList`,
  `eventsRead` and `appRoutingMode` (`store.ts:312` returns without recording, so the app waits
  forever). `podUpdate` and `podSetPermissionMode` have no UI caller.

## Definition of done

The frozen tables of outcomes are `contracts/action-messages.md` (rows S1-S8, E1-E10, R1).

1. `src/renderer/src/notifications/index.ts` exports the names `contracts/notifications.ts` declares.
2. An `error` notification persists until dismissed (fake timers, 10x the auto-dismiss time).
3. An `info` or `success` notification auto-dismisses after `autoDismissMs` (6000 ms in the app).
4. Each item has a role (`alert` for errors, `status` otherwise), a `Dismiss notification` button, a per-kind marker, and the focus rules of the contract.
5. `App` mounts exactly one viewport, and it is not inside `pods-chrome`.
6. S1 create raises success `Pod created: {title}`.
7. S2 delete raises success `Pod deleted: {title}`.
8. S3 fork raises success `Pod forked: {title}`.
9. S4 open raises info `Pod started: {title}`.
10. S5 reconnect raises info `Pod reconnected: {title}`.
11. S6 close raises info `Pod stopped: {title}`.
12. S7 reorder raises success `Pod order saved`.
13. S8 interrupt raises info `Interrupt sent`.
14. E1 `pods.list` failure raises an error, and the Pod header holds no `role="alert"`.
15. E2 open failure raises an error, and the header holds none.
16. E3 reconnect failure raises an error, and the header holds none.
17. E4 fork failure raises an error, and the header holds none.
18. E5 reorder failure raises an error, and the header holds none.
19. E6 close failure raises an error (silent at base), and the header holds none.
20. E7 interrupt failure raises an error (silent at base).
21. E8 `lanes.list` failure raises an error (silent at base).
22. E9 `events.read` backfill failure raises an error (silent at base).
23. E10 `app.routingMode` failure raises an error (silent at base).
24. `WorkspaceStore.routingModeError` exists per `contracts/workspace-store-routing-error.ts`.
25. `SURFACELESS_CHANNELS` equals `['podUpdate', 'podSetPermissionMode']`, and `failure-paths.e2e.test.tsx` passes.
26. The in-row alert markup and rules are gone: `grep -cE "\b(alertRow|reorderRow|dismissible|reorderError)\b"` prints 0 for `PodsChrome.tsx`, `PodsChrome.module.css`, `PodBarPanel.tsx` and `PodBarPanel.module.css` (base 4, 7, 5, 6).
27. The inline surfaces (NewPodDialog, DeletePodDialog, Composer, PermissionCard, Helm, Beachcomber) are unchanged: no task owns them, and the full suite passes.
28. R1: a Pod whose backfill carries the startup-reconciliation event raises no notification.
29. `src/renderer/src/transcript/startup-reconciliation.test.tsx` is byte-identical to base: sha256 `101d1b8b3d9ca17badac387e13d5ba62ed3af230aa1b540853854f35c55cde4b`.
30. `docs/human-checks/message-alerting.md` exists with the checks jsdom cannot make.
31. `npm run typecheck`, `npm test` and `npm run build` exit 0 at the session tip.
32. The `.sir/backlog.md` row from `20261110-1857-chrome-alert-width` that asks to measure an alert beside a long reorder alert is removed as moot. Its end state is `met at Gate 3 backlog edit`, written after approval.
33. The `.sir/backlog.md` row from `20261110-1857-chrome-alert-width` that asks for a native alerting mechanism is removed as done. Its end state is `met at Gate 3 backlog edit`, written after approval.

## Scope

Mechanism A, an in-app notification region in the renderer: one always-mounted viewport at a
window corner. Errors (`role="alert"`) stay until dismissed. Info and success
(`role="status"`) auto-dismiss after 6 s, paused on hover or focus. A keyed notify replaces in
place, at most three transients are shown, and there is no IPC and no dependency. The Pod header
alerts move onto it, and the five reachable silent channels gain an error.

### Not in scope

- OS notifications through Electron `Notification`, alone (B) or alongside A when the window is
  unfocused (C). This is deferred work and is carried to the backlog at Gate 3.
- A retry affordance for E8-E10. This is deferred work, carried to the backlog at Gate 3.
- Moving any inline, dialog-bound or panel-bound message (see Assumptions row 2).
- `podUpdate` and `podSetPermissionMode`, which have no UI caller.
- The historical hand-run driver and reports under `.dir-sdlc/handruns/`. Their alert
  selectors will stop matching, and no task owns them.

## Assumptions

| Question | Answer | Rung | Evidence |
|---|---|---|---|
| Which mechanism? | A, the in-app region (decided at Gate 2) | repo + judgment | `package.json` (no UI dependency); `failure-paths.e2e.test.tsx` measures "every failure surfaces" as body text; `helm/Notice.tsx:18-23` marker precedent. B and C can be suppressed by the OS, so they cannot guarantee "always" |
| Do the inline form, dialog and panel errors move? | No. Each is bound to where the user acted, and its dialog stays open | repo | `NewPodDialog.tsx:206-210`, `:319-323`; `DeletePodDialog.tsx:170-174`; `Composer.tsx:161`; `PermissionCard.tsx:173`; `HelmNotices.tsx:157-168`; `BeachcomberResult.tsx:45-50`; `BeachcomberError.tsx:30` |
| Do `sendComposer` and `respondToPermission` successes get a notification? | No. The composer clears and a transcript row appears, and the card is removed (decided at Gate 2) | repo + judgment | `contracts/action-messages.md`, "Outcomes reported where the user acted" |
| Is an error's text reworded? | No. It is `IpcError.message` verbatim, with no heading | repo | `failure-paths.e2e.test.tsx` ("no wrapper sentence") |
| Does a success sit beside a standing error for the same action? | No. They share a key, so a successful retry replaces the error | judgment | `contracts/action-messages.md` Table A note |
| Is E10 in scope, given that it needs a `WorkspaceStore` field? | Yes, as T2 (decided at Gate 2) | repo | `store.ts:312` |
| Does startup reconciliation's "No modal, no toast, no dismissible banner" decision stand? | Yes. Reconciliation is neither a user action nor a failure, and the durable transcript row is the record. Encoded as R1 | repo | `startup-reconciliation.test.tsx:113`; `transcript-filter.ts:255` |
| Can tasks build or test concurrently in one worktree? | Yes for scoped vitest. Only T1 and T2 run in parallel, neither runs a repo-wide command, and T1's files import nothing from `state` | repo | T1 C23, C25; T2 C7 |
| Which tasks inject defects, and where? | T1 into `notifications/*`, T2 into `store.ts:312`, T4 into `App.tsx`, T5 into `PodsChrome.tsx:127`. T3 uses a red step | repo | manifest criteria |
| `.sir/backlog.md:35`: re-measure or close? | Close as moot, because no alert remains in the tab-header row | repo | DoD 26; T6 C4 |

## Contracts

- [`contracts/notifications.ts`](contracts/notifications.ts): the region's API, DOM guarantees, timers, focus and layout
- [`contracts/workspace-store-routing-error.ts`](contracts/workspace-store-routing-error.ts): `routingModeError` on `WorkspaceStore`
- [`contracts/action-messages.md`](contracts/action-messages.md): which outcome raises which notification

## Open questions

None. The three Gate 2 decisions (mechanism A; no send or answer notification; E10 included) are recorded as E1-E3 in `state.json`.
