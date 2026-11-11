# Coverage

| Item | Covering task | Gate 2 | End state |
|---|---|---|---|
| 1 driver amended: 7 slugs, 15-key `meta`, S8-S10, O24-O32, O1-O23 window byte-identical | T1 (C4, C19-C23) | covered | met (T1 27/27, `reviews/T1.md`) |
| 2 base run measured the base tree | T1 (C1, C2) | covered | met (T1 C1, C2) |
| 3 base run O1-O23 `pass` | T1 (C9) | covered | met (T1 C9) |
| 4 base run O24-O32 scorable and compared with contract E | T1 (C10-C18, C24) | covered | met (T1 C10-C18; C24 on its A1-amended text) |
| 5 earlier hand-run artifacts byte-identical (150 files, `badc4c0f…`) | T1 (C27), T3 (C28) | covered | met (T1 C27, T3 C28, both reviewer-reproduced) |
| 6 Gate 2 width policy applied and survives the build | T2 (C2, C3, C5); scored by T3 (C12, C18) | covered | met (T2 C2, C3, C5; T3 C12, C18) |
| 7 panel rule with no alert row, alert and fork-error rules otherwise unchanged | T2 (C4, C6); T3 (C6-C11) | covered | met (T2 C4 on its A2-amended text, C6; T3 C6-C11) |
| 8 reorder alert bounded iff O25 `defect` at base, else byte-identical | T2 (C7-C13) | covered | met (reorder branch: T2 C7-C12 met, C13 not applicable per C1) |
| 9 no token change | T2 (C14) | covered | met (T2 C14) |
| 10 fix run used the same driver and main bundle; CSS hash differs iff a stylesheet changed | T3 (C2, C3) | covered | met (T3 C2, C3) |
| 11 fix run O1-O23 `pass` | T3 (C6-C11) | covered | met (T3 C6-C11) |
| 12 fix run O24, O30 `pass` | T3 (C12, C18) | covered | met (T3 C12, C18) |
| 13 fix run O25-O27 follow their branch | T3 (C13-C15) | covered | met (T3 C13-C15, reorder branch) |
| 14 fix run O28, O29 `pass` | T3 (C16, C17) | covered | met (T3 C16, C17) |
| 15 fix run O31, O32 `pass` | T3 (C19, C20) | covered | met (T3 C19, C20) |
| 16 findings file written | T3 (C21-C24) | covered | met (T3 C21-C24) |
| 17 README bullet | T3 (C25) | covered | met (T3 C25) |
| 18 human validation file H1-H8 | T4 (C1-C13) | covered | met (T4 C1-C13) |
| 19 harness-blocked writes copied in verbatim, sha256 matched | T1 (C25), T3 (C26), T4 (C14); orchestrator for the copy itself | covered; orchestrator: evidence is the agent's reported sha256 against `sha256sum` of the copied file, on that task's `log.md` dispatch line; "not needed" if no write was blocked | met (T1 C25 and T4 C14 not triggered; T3 C26 met). Orchestrator: one block, T3's `FINDINGS-CHROME-ALERT-WIDTH.md`; reported sha256 `6b6675c2…cbc16` is recorded in `reviews/T3.md` and not on a `log.md` dispatch line as Gate 2 named; re-run at Gate 3 as `MSYS_NO_PATHCONV=1 git -C C:/Users/dmarq/Development/Repos/orcastrate show a557b70:.dir-sdlc/handruns/2026-09-30-electron-handrun/FINDINGS-CHROME-ALERT-WIDTH.md` piped to `sha256sum`, which printed `6b6675c21e37f817dc01048511bc49abdbae833a8472c22589dc0bd7682cbc16` |
| 20 `npm run typecheck` and `npm test` exit 0 at the tip | T4 (C15, C16); also T2 (C17, C18) | covered | met (T4 C15, C16, round 2, at tip `a682156`: 161 files, 2589 tests) |
| 21 three `20261110-1618-chrome-alert-squeeze` rows removed from `.sir/backlog.md` | orchestrator | orchestrator: a Gate 3 action after approval; evidence is the Gate 2 decision plus O24, O30 (row "Decide how much width…"), O28, O29, O31, O32 ("Measure … overflow"), and O25-O27 with their branch ("Measure `PodBarPanel`'s reorder alert") in `driven-report-chrome-alert-width.json` | applied after approval: met. The three rows were removed in this gate's backlog edit; `grep -c '20261110-1618-chrome-alert-squeeze' .sir/backlog.md` prints 0 (evidence: T3 C12-C20 met) |
| 22 H1-H8 results recorded, passing checks close their rows | orchestrator | orchestrator: the user's reported result per check, written into the Gate 3 report; the end state reads "recorded in the approved report; backlog edit after approval" | applied after approval: met. The approved report records the results: H2-H8 `pass`, and H1 behaviour good with its placement questioned, which is replaced by the high-priority notification row. The five rows those checks covered are removed; `grep -c 'Human check not made' .sir/backlog.md` prints 0 |

| Operation | Implementing task | Consuming task | Gate 2 | End state |
|---|---|---|---|---|
| A. DOM hooks | T2 | T1, T3 | covered | applied: kept by T2 (C7, "Contract A holds"); read by the driver in T1's base run and T3's fix run (S1-S10 all reached, T3 C5) |
| B. Invocation and outputs | T1 | T3, T4, orchestrator | covered | applied: T1 C1-C4, C23; T3 C1-C4 |
| C. States S8-S10 | T1 | T3 | covered | applied: T1 C6-C8; T3 C5 |
| D. Observations O24-O32 | T1 | T3 | covered | applied: T1 C10-C18; T3 C12-C20 |
| E. Base verdicts and the measure-first gate | T1 | T2, T3, orchestrator | covered | applied: T1 C24 table (`reviews/T1.md`); T2 C1 selected the reorder branch |
| F. Width policy | T2 | T1, T3 (O24, O27, O30), T4 | covered | applied: `PodsChrome.module.css:24-26` and `PodBarPanel.module.css:18-20` (T2 C2, C11); scored `pass` by T3 C12, C15, C18 |
| G. Human validation file | T4 | orchestrator and the user at Gate 3 | covered | applied: `docs/human-checks/chrome-alert-width.md` (T4 C1-C13) |
