# Coverage

<!-- Definition of done: one row per spec.md item. `Item`, `Covering task`, and
     `Gate 2` are written at Gate 2; `End state` is written at Gate 3. -->

| Item | Covering task | Gate 2 | End state |
|---|---|---|---|
| 1. event `lane_id` names another Pod's lane → `IO`, no row | T1 | covered | met (T1 criterion 1) |
| 2. lane `parentLaneId` names another Pod's lane → `IO`, no row | T1 | covered | met (T1 criterion 2) |
| 3. `lane_opened` `payload.lane.id` unmapped → `IO`, no row | T1 | covered | met (T1 criterion 3) |
| 4. `lane_opened` `payload.lane.parentLaneId` unmapped → `IO`, no row | T1 | covered | met (T1 criterion 4) |
| 5. `lane_closed` `payload.laneId` unmapped → `IO`, no row | T1 | covered | met (T1 criterion 5) |
| 6. `tool_use` `payload.dispatchedLaneId` unmapped → `IO`, no row | T1 | covered | met (T1 criterion 6) |
| 7. message begins `forkPod:`, names lane and parent | T1 | covered | met (T1 criterion 7) |
| 8. `EventStore.forkPod` ERRORS lists the missing-lane case | T1 | covered | met (T1 criterion 8) |
| 9. `EventStore.forkPod` doc states the guarantee, old "nothing else" claim gone | T1 | covered (criterion extended by Gate 2 answer D1) | met (T1 criterion 9) |
| 10. `remapPayloadLanes` doc states the guarantee, keeps `JSON.stringify` | T1 | covered | met (T1 criterion 10) |
| 11. `fork.test.ts:360` comment states the guarantee | T1 | covered | met (T1 criterion 11) |
| 12. fork port `''` → `IpcFailure` `IO` | T2 | covered | met (T2 criterion 1) |
| 13. fork port `''` → store not called, no row | T2 | covered | met (T2 criterion 2) |
| 14. fork port = parent's id → `IpcFailure` `IO` | T2 | covered | met (T2 criterion 3) |
| 15. fork port = parent's id → store not called, no row | T2 | covered | met (T2 criterion 4) |
| 16. rejection message names `forkSession`, PodId, ccSessionId | T2 | covered | met (T2 criterion 5) |
| 17. fork-id rejection logs no warning | T2 | covered | met (T2 criterion 6) |
| 18. `PodManager.forkPod` docblock names the rejection | T2 | covered | met (T2 criterion 7) |
| 19. real store dangling lane → `IpcFailure` `IO` with lane id, no row (preserved, newly tested) | T2 | covered (reworded by Gate 2 answer D2) | met (T2 criterion 8) |
| 20. orphaned-session warning names the forked session id (preserved, newly tested) | T2 | covered (reworded by Gate 2 answer D2) | met (T2 criterion 9) |
| 21. `Dismiss fork error` button shown with the alert | T3 | covered | met (T3 criterion 1) |
| 22. `×` glyph inside `aria-hidden` | T3 | covered | met (T3 criterion 2) |
| 23. click removes the alert | T3 | covered | met (T3 criterion 3) |
| 24. Enter removes the alert | T3 | covered | met (T3 criterion 4) |
| 25. Space removes the alert | T3 | covered | met (T3 criterion 5) |
| 26. focus lands on `PODS_CHROME_TEST_ID` | T3 | covered | met (T3 criterion 6) |
| 27. button outside `role="alert"`, text unchanged | T3 | covered | met (T3 criterion 7) |
| 28. next fork clears the alert while pending, tested | T3 | covered | met (T3 criterion 8) |
| 29. no timer call | T3 | covered | met (T3 criterion 9) |
| 30. `:focus-visible` outline rule, asserted | T3 | covered | met (T3 criterion 11) |
| 31. unlisted-parent test, shown failing under injection at `fork-control.ts:66` | T3 | covered | met (T3 criterion 12) |
| 32. `fork-control.ts` unchanged | T3 | covered | met (T3 criterion 13) |
| 33. "before any CLI process runs" gone | T4 | covered | met (T4 criterion 1) |
| 34. item 8 states transcript exists before first resume | T4 | covered | met (T4 criterion 2) |
| 35. item 8 makes no CLI-process claim | T4 | covered | met (T4 criterion 3) |
| 36. item 8 keeps mechanism, verdict, link; no other line changes | T4 | covered | met (T4 criteria 4, 5) |
| 37. repo-wide `npm run typecheck` exits 0 at session tip | T3 (chain tail) | covered | met (T3 criterion 16; T3's tip `d30f8db` is the branch tip and contains T4's `b775209`) |
| 38. repo-wide `npm test` exits 0 at session tip | T3 (chain tail) | covered | met (T3 criterion 17: 155 files / 2538 tests at `d30f8db`, the branch tip) |
| 39. no file under `.sir/sessions/20261105-1907-fork-session-branching/` changes | orchestrator — no task has git | uncovered → orchestrator's (Gate 2 answer D3); evidence: `git diff --stat <merge-base> agent/20261106-0120-fork-hardening -- .sir/sessions/20261105-1907-fork-session-branching/` prints nothing | met — orchestrator's own row, run at Gate 3: `git -C <repo root> diff --stat 4301c23 agent/20261106-0120-fork-hardening -- .sir/sessions/20261105-1907-fork-session-branching/` printed nothing, exit 0 (merge-base `4301c23` from `git merge-base main agent/20261106-0120-fork-hardening`) |
| 40. backlog lines 35–40 removed, 41–43 kept | orchestrator — a Gate 3 action | uncovered → orchestrator's (Gate 2 answer D3); evidence: after the edit, `rg -c "20261105-1907-fork-session-branching" .sir/backlog.md` prints 3 and `rg -c "20261105-1907-fork-session-branching Human check" .sir/backlog.md` prints 3 (both 9 and 3 before) | met — orchestrator's own row, run after the Gate 3 backlog edit: `rg -c "20261105-1907-fork-session-branching" .sir/backlog.md` printed 3 and `rg -c "20261105-1907-fork-session-branching Human check" .sir/backlog.md` printed 3 (9 and 3 before, measured at Gate 3) |

<!-- Contract operations: one row per declared contract operation. `Operation`,
     `Consuming task`, and `Gate 2` are written at Gate 2; `Implementing task`
     and `End state` are written at Gate 3. -->

| Operation | Implementing task | Consuming task | Gate 2 | End state |
|---|---|---|---|---|
| `EventStore.forkPod` missing-lane failure (`contracts/store-fork-missing-lane.ts`) | T1 (definition site `src/main/store/sqlite-event-store.ts:254`) | T2 (`PodManager.forkPod`, real-store test) | covered; predicted `called` | called — `src/main/pod-manager/pod-manager.ts:573` (`this.#store.forkPod(`; the call is also present at base `4301c23`, :559); prediction confirmed. Search: `rg -n -w "forkPod"` over the touched source files at the worktree tip |
