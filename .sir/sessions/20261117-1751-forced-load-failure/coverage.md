# Coverage

| Item | Covering task | Gate 2 | End state |
|---|---|---|---|
| 1 Driver exists, sandboxed, bound to bundle and sha, plan first, bad invocation exits 2 | T1 (C1-C7) | covered | met (T1 C1-C7, 7/7 met, `reviews/T1.md`) |
| 2 Console-delete route raises E8 and E9 with one Retry each; live Pod raises none | T1 (C8-C13) | covered | met (T1 C8-C13, 6/6 met, verdicts pass) |
| 3 H1 measured: button look, beside message, Tab reaches it, ring painted and unclipped | T1 (C14-C19) | covered | met (T1 C14-C19, 6/6 met; C17's measurement O9 has verdict `fail`, ring 1.6px against 2px, a Gate 3 finding per C24) |
| 4 H2 measured: contrast at least 4.5 under dark and light; colours identical | T1 (C20-C22) | covered | met (T1 C20-C22, 3/3 met, verdicts pass) |
| 5 Screenshots, honest exit code, must-fail skip-delete run, controls undone | T1 (C23-C26) | covered | met (T1 C23-C26, 4/4 met) |
| 6 FINDINGS file with E8/E9 attribution and the E10 statement; no backlog line numbers | T1 (C27-C28) | covered | met (T1 C27-C28, 2/2 met) |
| 7 Harness-copy path, sha256 in `reviews/<task-id>.md` | T1 (C29), T2 (C20) | covered | met (T1 C29 met on the inline handover accepted at E2; T2 C20 met, not triggered) |
| 8 No `src/` or `tests/` change; switch not built | T1 (C30); orchestrator half: `git diff --name-only e539917 <T1 tip> -- src tests` quoted in `reviews/T1.md` | covered | met (T1 C30 met; orchestrator half re-run at Gate 3: `git diff --name-only e539917 8fe3c41 -- src tests \| wc -l` prints 0, and at the tip `git diff --name-only e539917 ab9846f -- src tests \| wc -l` prints 0) |
| 9 Recipe file: sections, setup, title guard, create, reload, confirm-then-delete, side effects | T2 (C1-C10) | covered | met (T2 C1-C10, 10/10 met; C10 met against its text as amended by A1) |
| 10 Recipe H1, H2, driven results cited, E10, cleanup | T2 (C11-C15) | covered | met (T2 C11-C15, 5/5 met) |
| 11 Recipe: no backlog line numbers; citations checked | T2 (C16-C17) | covered | met (T2 C16-C17, 2/2 met) |
| 12 README entry, nothing else changed | T2 (C18-C19) | covered | met (T2 C18-C19, 2/2 met) |
| 13 Gate 3: H1 made, result recorded | orchestrator: the user's answer at Gate 3, recorded in the report and here | uncovered: orchestrator's (no task can make a human check) | met (human check H1: the user reported pass at Gate 3, made against `npm run dev` per HUMANCHECKS-FORCED-LOAD-FAILURE.md) |
| 14 Gate 3: H2 made, result recorded | orchestrator: the user's answer at Gate 3, recorded in the report and here | uncovered: orchestrator's (no task can make a human check) | met (human check H2: the user reported pass at Gate 3 and that one palette under both preferences closes the row, made against `npm run dev` per HUMANCHECKS-FORCED-LOAD-FAILURE.md) |
| 15 If both pass, the two 20261112-0151-workspace-load-retry rows are removed | orchestrator: Gate 3 backlog edit after approval, end-state wording "removed after approval", evidence here | uncovered: orchestrator's (the edit follows approval) | removed after approval: both H1 and H2 passed, and after the Gate 3 edit `grep -c "20261112-0151-workspace-load-retry Human check not made" .sir/backlog.md` prints 0 (it printed 2 before the edit) |

| Operation | Implementing task | Consuming task | Gate 2 | End state |
|---|---|---|---|---|
