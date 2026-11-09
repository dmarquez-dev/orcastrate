# Coverage

<!-- Definition of done: one row per spec.md item. `Item`, `Covering task`, and
     `Gate 2` are written at Gate 2; `End state` is written at Gate 3. -->

| Item | Covering task | Gate 2 | End state |
|---|---|---|---|
| 1 driver exists, imports `sandbox.mjs` | T1 (C3) | covered | met: T1 C3 |
| 2 earlier handrun artifacts byte-identical | T1 (C4), T3 (C6) | covered | met: T1 C4, T3 C6 (`a9edbb25…c9ca`, 80 files, reviewer-reproduced both) |
| 3 launch from worktree, sandbox redirect, real home untouched | T1 (C1, C2, C33) | covered | met: T1 C1, C2, C33 |
| 4 states S1–S4 reached by I3 routes | T1 (C5–C8) | covered | met: T1 C5–C8 |
| 5 check 1: glyph and size | T1 (C9, C10) | covered | met: T1 C9, C10 (C10 amended A2) |
| 6 check 2: dimmed, cursor, reason tooltip | T1 (C11–C16) | covered | met: T1 C11–C16 |
| 7 check 3: fork's tab tooltip | T1 (C17) | covered | met: T1 C17 |
| 8 check 4: same line, centred, readable dark and light | T1 (C18–C21) | covered | met: T1 C18–C21 (O10 `defect`, O11 `instrument-invalid`, both on C25 terms) |
| 9 check 5: focus ring, Enter closes, ring on chrome | T1 (C22–C24) | covered | met: T1 C22–C24 |
| 10 every observation positive-controlled | T1 (C9–C25, C29) | covered | met: T1 C9–C25, C29 |
| 11 findings durable, mapped to backlog rows | T1 (C26, C27, C31) | covered | met: T1 C26, C27, C31 |
| 12 no pixel literal, null-initialised references | T1 (C28) | covered | met: T1 C28 (reviewer reading recorded, advisory 1) |
| 13 defects fixed with a regression test, or escalated | T2 (C1–C4, C7) | covered | met: T2 C1–C4, C7 (O10 fixed, red step) |
| 14 fixed defects re-checked | T3 (C1–C5) | covered | met: T3 C1–C5 (O10 `pass` in recheck) |
| 15 repo-wide typecheck and suite | T3 (C7, C8) | covered | met: T3 C7, C8 (typecheck exit 0; 157 files / 2544 tests, reviewer-reproduced) |
| 16 Gate 3 backlog edit per verdict | orchestrator (no task can own an edit made after Gate 3 approval) | uncovered: orchestrator's (D4). Filled from each backlog row's verdicts in `FINDINGS-FORK-UI.md` (and `FINDINGS-FORK-UI-RECHECK.md` if written) plus `git diff` of `.sir/backlog.md` after the edit; end state `applied after approval` | applied after approval (as of the gate: rows 1, 2, 3, 5 have every observation `pass` per `FINDINGS-FORK-UI-RECHECK.md`, so lines 34, 35, 36, 38 are to be removed; row 4 has O11 `instrument-invalid`, so line 37 stays, trimmed to its open clause). Settled after approval: `git diff -U0 -- .sir/backlog.md` shows 5 `-` rows (lines 34–38) and 8 `+` rows (line 37 re-added, trimmed to the centring clause, plus 7 Gate 3 appends), 8 insertions and 5 deletions; predicted 5 and 8 |
| 17 README bullet | T1 (C32) | covered | met: T1 C32 |

<!-- Contract operations: one row per declared contract operation. `Operation`,
     `Consuming task`, and `Gate 2` are written at Gate 2; `Implementing task`
     and `End state` are written at Gate 3. -->

| Operation | Implementing task | Consuming task | Gate 2 | End state |
|---|---|---|---|---|
| I1 driver invocation and exit codes | T1 | T3 (C2) | covered | called: `FINDINGS-FORK-UI-RECHECK.md:3` (whole-word `run-fork-ui`, T3-owned; absent at base `fea8246`) |
| I2 report JSON incl. `driverSha256` | T1 | T3 (C2–C4) | covered | called: `driven-report-fork-ui-recheck.json:5` (`driverSha256`, T3-owned; absent at base) |
| I2 findings verdict table | T1 | T2 (C1, C2), T3 (C3, C5) | covered | called: `FINDINGS-FORK-UI-RECHECK.md` verdict table, read by T2 and T3 (T3-owned; absent at base) |
| I3 states and routes | T1 | T3 (re-run, C2) | covered | called: `FINDINGS-FORK-UI-RECHECK.md` route-per-state summary (T3-owned; absent at base) |
| I4 observations and controls | T1 | T3 (re-run, C3, C4) | covered | called: `FINDINGS-FORK-UI-RECHECK.md` O1–O16 rows (T3-owned; absent at base); O2 row amended A1 |
| I5 defect-handling rule | none (a rule) | T2 (C2–C4), T3 (C1, C3) | covered; a rule with no implementer | applied: O10 `defect` fixed by T2 (`c66e1e7`); O11 `instrument-invalid` treated as not a defect, per I5 |
