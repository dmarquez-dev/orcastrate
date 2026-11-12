# Coverage

<!-- Definition of done: one row per spec.md item. `Item`, `Covering task`, and
     `Gate 2` are written at Gate 2; `End state` is written at Gate 3. -->

| Item | Covering task | Gate 2 | End state |
|---|---|---|---|
| 1. No-action item renders as today | T1 (C2); T3 (C59, C62) | covered | met |
| 2. Action renders a native button named by its label | T1 (C3) | covered | met |
| 3. Action button described by its own message | T1 (C4) | covered | met |
| 4. Activation calls once, removes only that item | T1 (C5) | covered | met |
| 5. Focus to following dismiss control | T1 (C6) | covered | met |
| 6. Else preceding dismiss control | T1 (C7) | covered | met |
| 7. Else the viewport | T1 (C8) | covered | met |
| 8. Synchronous same-key re-raise leaves one item | T1 (C9) | covered | met |
| 9. Keyed replacement replaces the action | T1 (C10) | covered | met |
| 10. Keyed replacement without action removes it | T1 (C11) | covered | met |
| 11. Keyed replacement can add an action | T1 (C12) | covered | met |
| 12. Info with action still auto-dismisses | T1 (C13) | covered | met |
| 13. Error with action still persists | T1 (C14) | covered | met |
| 14. Token-only style and focus ring | T1 (C17, C18) | covered | met |
| 15. `retryLanes` succeeds after failure | T2 (C25) | covered | met |
| 16. `retryLanes` failure keeps the same error object | T2 (C26) | covered | met |
| 17. `retryLanes` loading while in flight | T2 (C27) | covered | met |
| 18. `retryLanes` coalesces | T2 (C28) | covered | met |
| 19. `retryRoutingMode` succeeds and clears the error | T2 (C29) | covered | met |
| 20. `retryRoutingMode` failure records the error | T2 (C30) | covered | met |
| 21. `routingModeError` null while in flight | T2 (C31) | covered | met |
| 22. `retryRoutingMode` no-op once resolved | T2 (C32) | covered | met |
| 23. `retryRoutingMode` coalesces with startup read | T2 (C33) | covered | met |
| 24. Error-discipline table covers both channels | T2 (C34) | covered | met |
| 25. Enumeration tests list the new members | T2 (C35) | covered | met |
| 26. E9 retry re-reads the same page | T2 (C36) | covered | met |
| 27. No docblock says there is no retry | T2 (C37); T3 (C55, C57) | covered | met |
| 28. E8 Retry success | T3 (C45) | covered | met |
| 29. E8 Retry failure | T3 (C46) | covered | met |
| 30. E9 Retry success | T3 (C47) | covered | met |
| 31. E9 Retry failure | T3 (C48) | covered | met |
| 32. E10 Retry success, lane rail appears | T3 (C49) | covered | met |
| 33. E10 Retry failure, same error object | T3 (C50) | covered | met |
| 34. E10 dismissed whenever `routingModeError` is null | T3 (C51) | covered | met |
| 35. Item absent while a retry is in flight | T3 (C52) | covered | met |
| 36. Citation census 12 → 8 and 1 → 0 | T1 (C20); T2 (C38); T3 (C55, C58) | covered | met (T1 C20, T2 C38, T3 C55, C58); 8 files at tip: failure-paths.e2e.test.tsx, hygiene.test.ts, message-alerting.e2e.test.tsx, pod-fork.e2e.test.tsx, LaneRail.styles.test.ts, PodsChrome.tsx, tokens.css, beachcomber.ts |
| 37. typecheck, test, build pass at the tip | T3 (C60, C61, C62) | covered | met; the tip moved to 95863f8 at Gate 3, and the orchestrator re-ran the gates there: `npm run typecheck` exit 0, `vitest run --root <worktree>` `Tests  2649 passed (2649)`, `npm run build` exit 0, then `git status --short` empty |
| 38. Retry control visible and legible in both themes | — | uncovered; accepted out of scope at Gate 2 (D2), carried to `.sir/backlog.md` at Gate 3 as a human check not made | out of scope |

<!-- Contract operations: one row per declared contract operation. `Operation`,
     `Consuming task`, and `Gate 2` are written at Gate 2; `Implementing task`
     and `End state` are written at Gate 3. -->

| Operation | Implementing task | Consuming task | Gate 2 | End state |
|---|---|---|---|---|
| `NotificationRequest.action` / `NotificationAction` | T1 | T3 (C45-C54) | covered; predicted `called` | called, `shell/WorkspaceAlerts.tsx:57` and `:110` (absent at e2e3b0a); prediction confirmed |
| `retryLanes` | T2 | T3 (E8 `onAction`; C45, C46, C52) | covered; predicted `called` | called, `shell/WorkspaceAlerts.tsx:84` (absent at e2e3b0a); prediction confirmed |
| `retryRoutingMode` | T2 | T3 (E10 `onAction`; C49, C50, C51) | covered; predicted `called` | called, `shell/WorkspaceAlerts.tsx:113` (absent at e2e3b0a); prediction confirmed |
| `loadMoreEvents` (docblock corrected) | T2 | T3 (E9 `onAction`; C47, C48) | covered; predicted `called` | called, `shell/WorkspaceAlerts.tsx:90` (absent at e2e3b0a); `state/store.ts:680` also survives as a caller already at e2e3b0a (`:649`); prediction confirmed |
| `routingModeError` (reworded) | T2 | T3 (E10 effect; C50, C51) | covered; predicted `called` | called (pre-existing), `shell/WorkspaceAlerts.tsx:72` (at e2e3b0a as `:55`); prediction refuted on its qualifier only |
| `routingMode` (reworded) | T2 | `App.tsx:146-152` already reads it; T3 C49 observes it | covered; predicted `called` | called (pre-existing), `state/store.ts:784` (at e2e3b0a as `:753`); `App.tsx` outside the diff also reads it; the `shell/WorkspaceAlerts.tsx:9` hit names the IPC method `app.routingMode()` in a docblock and is not a caller; prediction refuted on its qualifier only |
