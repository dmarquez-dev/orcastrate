# Coverage

| Item | Covering task | Gate 2 | End state |
|---|---|---|---|
| 1 driver amended per contract B-D | T1 (C1, C4, C6-C8, C15-C18) | covered | met (T1 22/22, `reviews/T1.md`) |
| 2 base run measured the base tree | T1 (C1, C2) | covered | met (T1 C1, C2) |
| 3 base run O1-O18 pass | T1 (C9) | covered | met (T1 C9) |
| 4 base run O19-O23 scorable, compared with section E | T1 (C10-C14, C19) | covered | met (T1 C10-C14, C19) |
| 5 earlier artifacts byte-identical | T1 (C22), T3 (C18) | covered | met (T1 C22, T3 C18) |
| 6 production change only behind a `defect` gating verdict | T2 (C1); orchestrator | uncovered in part: the orchestrator's. Evidence: `git -C <main> diff --stat 87b15e5..<merge> -- src/` read against O19 and O22 in `driven-report-chrome-alert-squeeze-base.json` (`python -I`) | met (T2 C1; orchestrator: `git diff --stat 87b15e5..24e2da0 -- src/` prints 4 files, all in T2's `owns`, 321 insertions, 6 deletions; base JSON read with `python -I` at `24e2da0`: O19 `defect` fired, O22 `defect` fired, so both alerts were gated in) |
| 7 open-error alert bounded, `title` carries message | T2 (C2-C4, C9) | covered | met (T2 C2-C4, C9) |
| 8 pods-error alert bounded, `title` carries message | T2 (C5-C7, C9) | covered | met (T2 C5-C7, C9) |
| 9 both alerts keep `role=alert` and a direct text node | T2 (C8) | covered | met (T2 C8) |
| 10 fork-error row CSS unchanged | T2 (C10); orchestrator | uncovered in part: the orchestrator's. Evidence: the window-hash instrument of T1 C15 over `PodsChrome.module.css` at the tip, for the blocks measured at base: `:13-16` (n=4) `dea84f4565500e85e050dc3ffe174f6c22bc30880978bb5391ef92e1976a14e5`, `:39-44` (n=6) `530e1dd2f87b941d5389013baad2d05fd9eeb64fd9fe85424491d65cffc191c3`, `:54-61` (n=8) `2a113a4b18848852d820541206c2e6b1bb8f28ceb5a68274d41ac81f6b586c80`; each must print 1 | met (T2 C10; orchestrator: the instrument over `git show 24e2da0:src/renderer/src/pods/PodsChrome.module.css` prints 1, 1, 1; the same over `87b15e5` prints 1, 1, 1; near-miss n=7 with the `:54-61` hash prints 0) |
| 11 fix run O1-O18 pass | T3 (C6) | covered | met (T3 C6) |
| 12 fix run O19 pass | T3 (C7) | covered | met (T3 C7) |
| 13 fix run O20 pass | T3 (C8) | covered | met (T3 C8) |
| 14 fix run O21 pass | T3 (C9) | covered | met (T3 C9) |
| 15 fix run O22 pass | T3 (C10) | covered | met (T3 C10) |
| 16 fix run O23 pass | T3 (C11) | covered | met (T3 C11) |
| 17 fix run provenance | T3 (C1-C5) | covered | met (T3 C1-C5) |
| 18 FINDINGS tables and summary | T3 (C12-C14, C17) | covered | met (T3 C12-C14, C17) |
| 19 README bullet | T3 (C15) | covered | met (T3 C15) |
| 20 harness copy | T1 (C20), T3 (C16) | covered | met (T1 C20: no copy needed; T3 C16: findings file copied, sha256 `1b00c0e7…a850` both sides) |
| 21 typecheck and suite at tip | T2 (C14-C15), T3 (C19-C20) | covered | met (T2 C14-C15, T3 C19-C20) |
| 22 `.sir/backlog.md:35` closed citing O21 `pass` | orchestrator | uncovered: the orchestrator's, measured by the Gate 3 backlog edit after approval. The report renders it `closed on approval`, not `met` | met (applied after approval: the fork-error overflow row removed in the Gate 3 backlog edit, citing fix-run O21 `pass`; `grep -c 'Measure the fork-error row' .sir/backlog.md` prints 0) |
| 23 `.sir/backlog.md:36` closed citing O19, O20, O22, O23 `pass` | orchestrator | uncovered: the orchestrator's, as row 22 | met (applied after approval: the open/pods-error squeeze row removed in the Gate 3 backlog edit, citing fix-run O19, O20, O22, O23 `pass`; `grep -c 'Check whether the open-error and pods-error' .sir/backlog.md` prints 0) |

| Operation | Implementing task | Consuming task | Gate 2 | End state |
|---|---|---|---|---|
| A open-error alert hook | T2 (`PodsChrome.tsx:286-287`) | T1 (base run), T3 (fix run) | covered | called (`run-fork-ui.mjs:375`, `:603`; absent at base) |
| A pods-error alert hook | T2 (`PodsChrome.tsx:316-317`) | T1 (base run), T3 (fix run) | covered | called (`run-fork-ui.mjs:472`, `:481`; the S7 read is absent at base) |
| A run control `pod-tab-open:<podId>` | none (`PodTab.tsx`, no task owns it) | T1, T3 | covered (exists at base in `PodTab.tsx`, no task owns it) | called (`run-fork-ui.mjs:1888`, the S5 Run click, absent at base; the driver's other reads, `:754`, `:902`, exist at base) |
| A Pod tab keyboard reorder | none (`PodTab.tsx`, no task owns it) | T1, T3 | covered (exists at base, no task owns it) | called (`run-fork-ui.mjs:2100`, `:2118`; `Control+ArrowRight` absent at base) |
| B invocation (`--slug` set) | T1 (`run-fork-ui.mjs`) | T3 (C1) | covered | applied (T1 C18: unknown slug exits 2, nothing written; T3 C1: fix run under `--slug chrome-alert-squeeze`) |
| B base report output | T1 (`run-fork-ui.mjs`) | T2 (C1), T3 (C2, C3, C13) | covered | applied (`driven-report-chrome-alert-squeeze-base.json` read by T2 C1 and T3 C2, C3, C13) |
| B FINDINGS file | T3 (`FINDINGS-CHROME-ALERT-SQUEEZE.md`) | orchestrator | uncovered: the orchestrator's, read at Gate 3 to close rows 22 and 23 | applied (read at `24e2da0`: table 2 rows O19-O23 fix-run verdict `pass`; summary O21 `podBarWidthReference` 1280, `podBarWidthAlertShown` 1239; fix JSON read with `python -I` agrees, 23 of 23 `pass`) |
| C states S5-S7 | T1 (`run-fork-ui.mjs`) | T3 (C5) | covered | applied (T3 C5: S1-S7 all reached) |
| D observations O19-O23 | T1 (`run-fork-ui.mjs`) | T3 (C7-C11) | covered | applied (T3 C7-C11: each `pass`, control fired) |
| E measure-first gate | orchestrator | T2 (C1); orchestrator | covered; the orchestrator applies it between T1's commit and T2's dispatch | applied (`log.md` 17:16Z `DISPATCH T2` line: O19 defect, O22 defect, O21 pass, all T2 criteria stand, no amendment) |
