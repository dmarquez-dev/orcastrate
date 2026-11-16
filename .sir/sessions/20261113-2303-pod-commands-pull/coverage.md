# Coverage

| Item | Covering task | Gate 2 | End state |
|---|---|---|---|
| 1. `INVOKE_CHANNELS.podCommands` and `pods.commands` declared | T1 (C1, C3) | covered | met (C1, C3 met in `reviews/T1.md`) |
| 2. `PodCommandsPush` docblock states the pull ordering rule | T1 (C2) | covered | met (C2 met) |
| 3. Open Pod answers its current visible list | T1 (C6a-f, C7a, C7f, C9a) | covered | met (all nine met) |
| 4. Open Pod with no catalog answers `[]` | T1 (C7b) | covered | met (C7b met) |
| 5. Pod with no live session answers `[]` | T1 (C7c-e, C9b) | covered | met (all four met) |
| 6. Error codes, never rejects, no push or log | T1 (C7g, C7h, C9c-e, C10) | covered | met (all six met) |
| 7. Openness prohibition kept | T1 (C4, C5, C8) | covered | met (all three met) |
| 8. Preload forwards `pods.commands` | T1 (C11a-b) | covered | met (both met) |
| 9. Stub implements `pods.commands` | T2 (D1) | covered | met (D1 met in `reviews/T2.md`) |
| 10. Store pulls once per Pod at start, together; none on a failed list | T2 (D2a, D2b, D3) | covered | met (all three met) |
| 11. No pull on a switch or a later refresh | T2 (D4a, D4b) | covered | met (both met) |
| 12. Answer becomes the list; empty answer handling | T2 (D5, D6a, D6b) | covered | met (all three met) |
| 13. Push wins | T2 (D7) | covered | met (D7 met, reviewer-reproduced) |
| 14. Earlier push, or another Pod's push, does not drop the answer | T2 (D8, D9) | covered | met (both met) |
| 15. Failed pull is silent | T2 (D10, D12a, D13b) | covered | met (all three met) |
| 16. Fresh renderer shows the list on `/` with no push or send | T2 (D13a) | covered | met (D13a met) |
| 17. Error-discipline and failure-path classifications | T2 (D11, D12a-c) | covered | met (all four met) |
| 18. No docblock says the list arrives only by push | T2 (D14) | covered | met (D14 met) |
| 19. No shipped file cites a session id or `.sir/` path | T1 (C12); T2 (D15) | covered | met (C12, D15 met) |
| 20. `npm run typecheck` exits 0 | T1 (C14, node); T2 (D16, both) | covered | met (C14, D16 met) |
| 21. `npm test` exits 0, more than 2792 tests | T1 (C13, scoped); T2 (D17) | covered | met (C13 met; D17 met, 2832 tests) |
| 22. Human check: reload under `npm run dev`, type `/`, list shows | orchestrator | uncovered; D1: orchestrator carries it to Gate 3 as a human check the user makes (open a Pod under `npm run dev`, Ctrl+R, type `/`); the observation is recorded here at Gate 3, and if it can't be made it goes to `.sir/backlog.md` as an open human check | met: human check H1 passed (the user's own observation at Gate 3, under `npm run dev` in the session worktree at f8eee61; the docblock-only commit ce9a0cb followed it) |
| 23. Backlog row F4 removed at Gate 3 | orchestrator | uncovered; D2: orchestrator; end state is written after Gate 3 approval as "removed in the Gate 3 backlog edit", with evidence `grep -c "no ordering rule exists between pull and push" .sir/backlog.md` (prints 1 at Gate 2, must print 0 after); the approved report shows it as pending | met: removed in the Gate 3 backlog edit; `grep -c "no ordering rule exists between pull and push" .sir/backlog.md` prints 0 |

| Operation | Implementing task | Consuming task | Gate 2 | End state |
|---|---|---|---|---|
| `INVOKE_CHANNELS.podCommands` | T1 | T2 | covered; predicted `called` | called: `src/main/ipc/handlers.ts:185` and `src/preload/api.ts:106`, found by the whole-repo fallback at f8eee61 (both files are T1's and absent at e7fed6b, so plain `called`); prediction confirmed |
| `OrcastrateApi.pods.commands` | T1 | T2 | covered; predicted `called` | called: `src/renderer/src/state/store.ts:379` (T2), absent at e7fed6b; prediction confirmed |
