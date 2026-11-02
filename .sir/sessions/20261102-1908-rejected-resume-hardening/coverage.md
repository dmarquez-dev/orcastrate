# Coverage

<!-- Definition of done: one row per spec.md item. `Item`, `Covering task`, and
     `Gate 2` are written at Gate 2; `End state` is written at Gate 3. -->

| Item | Covering task | Gate 2 | End state |
|---|---|---|---|
| `resume` without a session name classifies `SPAWN_FAILED`; red if bare `resume` restored | T1 | covered | met (T1 #1) |
| Four CLI 2.1.235 strings still classify `RESUME_FAILED` | T1 | covered | met (T1 #2–#5) |
| `session started; working directory not found` classifies `SPAWN_FAILED` | T1 | covered | met (T1 #6) |
| The two docblocks agree with each other and with the regex | T1 (errors.ts), T2 (pod-manager.ts, preserved) | covered | met (T1 #8, T2 #11) |
| Null id in the window; reopen/Reconnect sends no `resume`; notice count stays 1 | T2 | covered | met (T2 #1–#4) |
| Cleared before retry; failed retry leaves a beached Pod with a null id | T2 | covered | met (T2 #5–#7) |
| Each fix's regression test shown red against unfixed code | T1, T2 | covered | met (T1 #1, #6; T2 #1–#7) |
| Four null-id comments name the rejected-resume case, comment-only diffs | T2 | uncovered at draft; Gate 2 decision: added to T2 | met (T2 #12–#15) |
| Backlog lines 27, 41, 46 removed with evidence; 23–24 removed citing T1/T2; 47 unchanged | T3 | covered (23–24 added by Gate 2 decision) | met (T3 #1–#6) |
| `npm test` and `npm run typecheck` exit 0 in the worktree | T3 | covered | met (T3 #7–#8) |

<!-- Contract operations: one row per declared contract operation. `Operation`,
     `Consuming task`, and `Gate 2` are written at Gate 2; `Implementing task`
     and `End state` are written at Gate 3. -->

| Operation | Implementing task | Consuming task | Gate 2 | End state |
|---|---|---|---|---|

<!-- No rows: manifest.json declares `"contracts": []`, so there is no operation to search for. -->
