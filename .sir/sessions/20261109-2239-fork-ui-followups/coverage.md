# Coverage

| Item | Covering task | Gate 2 | End state |
|---|---|---|---|
| 1. Cause named and removed; stylesheet-text regression test shown failing | T1 (C1, C3) | covered | met (T1 C1, C3 met; C3 injected defect) |
| 2. Tab titles keep their no-alert width while the alert shows (O17) | T1 (C2), T2 (C5) | covered | met (T1 C2 met under its A1 wording, the reviewer's `not met (letter)` on the pre-amendment wording resolved by E3; T2 C5 met, injected defect) |
| 3. Alert text not painted outside the Pod-bar row (O18) | T1 (C4), T2 (C6) | covered | met (T1 C4, T2 C6 met; C6 injected defect) |
| 4. Full fork-error message stays available (decision 1) | T1 (C5) | covered (E1: clamp, with the full message as the alert's title) | met (T1 C5 met, red step) |
| 5. Driver DOM hooks kept; existing fork e2e tests pass unmodified | T1 (C6, C7, C9) | covered | met (T1 C6, C7, C9 met; C6 injected defect) |
| 6. O11 scorable; "half the button height" gone | T2 (C7, C9) | covered | met (T2 C7, C9 met; O11 `pass`) |
| 7. `tol` and `?? null` lookups null-initialised and in `refs` | T2 (C12, C13) | covered | met (T2 C12, C13 met) |
| 8. O14 wording matches the computation | T2 (C10) | covered | met (T2 C10 met) |
| 9. `meta`'s fourteen keys are the I2 shape | T2 (C3) | covered | met (T2 C3 met, reviewer-reproduced) |
| 10. O16's control dismisses its own alert | T2 (C11) | covered | met (T2 C11 met) |
| 11. O1–O10 and O12–O16 still pass, controls fired | T2 (C8) | covered | met (T2 C8 met; O10 judged under A2) |
| 12. Earlier handrun artifacts byte-identical (106 files, `b7be6357…d38d`) | T2 (C19) | covered | met (T2 C19 met, reviewer-reproduced) |
| 13. Findings file O1–O18 and one README bullet | T2 (C15, C16, C20) | covered | met (T2 C15, C16, C20 met) |
| 14. `npm run typecheck` and `npm test` exit 0 at the tip | T1 (C12, C13), T2 (C21, C22) | covered | met (T2 C21, C22 at the tip 4326d23, reviewer-reproduced: 158 files / 2554 tests) |
| 15. Gate 3 backlog edit of `:34` and `:36-41` | orchestrator | uncovered; the orchestrator's (Gate 2). Evidence: `.sir/backlog.md` after the Gate 3 edit, with `:36-41` removed where their criteria are met and `:34` removed only if O11 is `pass`, otherwise rewritten with the re-measured values. The edit follows approval, so the report renders `pending (applied after approval)` and the row is filled afterwards | applied after approval: met. O11 was `pass`, so the Gate 3 edit of `.sir/backlog.md` removed the fork-hardening centring row (was `:34`) and the six fork-ui-human-checks rows covered by T1 and T2 (`:36-41`). The approved report and the Gate 3 question both said "five", which is a miscount: `:36-41` is six rows. The ⑂ row was kept, and four rows were appended under `## Ungrouped (Gate 3 appends land here)` |

| Operation | Implementing task | Consuming task | Gate 2 | End state |
|---|---|---|---|---|
| §A fork-error row DOM hooks (`pods-chrome`, `pod-bar`, `pod-tab:<id>`, title span, alert with direct text node, sibling dismiss button) | T1 | T2 | covered | applied: kept by T1 (C6 and C9 met; the hooks sit in `src/renderer/src/pods/PodsChrome.tsx`, T1-owned), and read by the driver at the tip (`grep -c` over `run-fork-ui.mjs` printed `pods-chrome` 8, `pod-bar` 5, `pod-tab:` 7, `Dismiss fork error` 5), with O10, O11, O17 and O18 `pass` against them |
| §B driver invocation and `driven-report-<slug>.json` shape | T2 | none | uncovered; the orchestrator consumes it at Gate 3 (Gate 2). Evidence: the `meta` key set in `driven-report-fork-ui-followups.json` against §B's fourteen keys | applied (orchestrator's row): `python -I` over `driven-report-fork-ui-followups.json` at the tip printed 14 keys, set equal to §B's: True; `exitCode` 0, `sandboxRemoved` True, `precondition` None |
| §C observation rows O11, O14, O16, O17, O18 | T2 | none | uncovered; the orchestrator consumes it at Gate 3 (Gate 2). Evidence: each of O11, O14, O16, O17 and O18 in `driven-report-fork-ui-followups.json`, with its verdict and `control.fired` | applied (orchestrator's row): `python -I` over the same report printed O11, O14, O16, O17, O18 each `pass` with `control.fired` True; 18 observations, none other than `pass` |
| §C observation row O10 over painted line boxes | T2 | none | amended (A2, E4) | applied (orchestrator's row): the same read printed O10 `pass`, `control.fired` True, `paintedLineBoxCount` 3 of `rawLineBoxCount` 10 |
