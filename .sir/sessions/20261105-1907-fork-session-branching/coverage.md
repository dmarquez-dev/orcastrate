# Coverage

| Item | Covering task | Gate 2 | End state |
|---|---|---|---|
| D1 verification record | T1 | covered | met — T1 20/20 met (reviews/T1.md) |
| D2 migration 5 | T2 | covered | met — T2 37/37 met, criterion 11 as amended by A1 (reviews/T2.md round 2) |
| D3 Pod ancestry type + round-trip | T2, T3 | covered | met — T2 37/37, T3 36/36 met |
| D4 fork creates one correct row | T2, T3 | covered | met — T2 37/37, T3 36/36 met |
| D5 ineligible / SDK failure → typed error, no rows | T2, T3 | covered | met — T2 37/37, T3 36/36 met |
| D6 events copied to fork point, then diverge | T2, T3 | covered | met — T2 37/37, T3 36/36 met |
| D7 parent delete leaves fork intact | T2 | covered | met — T2 37/37 met |
| D8 fork resumes its own session | T3 | covered | met — T3 36/36 met, criterion 35 as amended by A2 (reviews/T3.md) |
| D9 pod:fork channel | T3 | covered | met — T3 36/36 met |
| D10 Fork control on each tab | T4 | covered | met — T4 26/26 met (reviews/T4.md) |
| D11 fork tab shows ancestry | T4 | covered | met — T4 26/26 met; delivered as accessible description + native tooltip, not visible tab text (reviews/T4.md, implementer assumption) |
| D12 repo-wide typecheck + tests | T4 (tail; every task also carries both) | covered | met — T4 criteria 24–25: typecheck exit 0, npm test 155 files / 2510 tests, reviewer-reproduced |
| D13 design doc item 8 updated | T1 | uncovered → became a T1 criterion at Gate 2 (decision 3) | met — T1 criterion 18 |

Contract-operation search, at the session tip: `git grep -w <name>` over `git diff --name-only 0d16358..agent/20261105-1907-fork-session-branching`. Discards: the definition site; files owned by the implementing task (none of the surviving callers exists at base); test files (`*.test.ts(x)`, `tests/**`, `src/renderer/src/test-utils/**`). `OrcastrateApi.pods.fork` searched as `pods.fork` since `fork` is not a distinctive whole word.

| Operation | Implementing task | Consuming task | Gate 2 | End state |
|---|---|---|---|---|
| `Pod.forkedFromPodId` / `Pod.forkedFromCcSessionId` | T2 | T3, T4 | covered | called — src/renderer/src/pods/fork-control.ts |
| `EventStore.forkPod` | T2 | T3 | covered | called — src/main/pod-manager/pod-manager.ts:559 |
| `INVOKE_CHANNELS.podFork` / `OrcastrateApi.pods.fork` | T3 | T4 | covered | called — src/renderer/src/state/store.ts:607 |
| `forkEligibility` | T3 | T3, T4 | covered | called — src/renderer/src/pods/fork-control.ts, src/renderer/src/pods/PodTab.tsx |
