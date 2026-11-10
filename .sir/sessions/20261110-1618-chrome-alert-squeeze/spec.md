# chrome-alert-squeeze

Measure whether any alert in the Pod-bar `.chrome` row squeezes the Pod tabs, and fix the CSS only where a measurement shows a squeeze.

## Context

The previous session (`20261109-2239-fork-ui-followups`) gave the fork-error row a zero flex basis (`src/renderer/src/pods/PodsChrome.module.css:41`) and a two-line clamp (`:54-61`). It left two rows in `.sir/backlog.md`:

- `:35`: the fork-error row has never been measured with the Pod tabs alone filling or overflowing `.chrome`. Driver O17 runs with 5 tabs and leftover space.
- `:36`: the open-error and pods-error alerts (`PodsChrome.tsx:282`, `:309`) are bare `.listError` paragraphs (`PodsChrome.module.css:18-24`, no `flex`). Each therefore keeps the default `0 1 auto` basis of its whole message, which is the mechanism that squeezed the tabs under the fork error. Neither has been measured.

The instrument is the fork-UI hand-run driver, `.dir-sdlc/handruns/2026-09-30-electron-handrun/driver/run-fork-ui.mjs` (1562 lines at base `87b15e5`).

Contract: `contracts/chrome-alert-driver.md`.

## Definition of done

1. The driver is amended per contract sections B–D:
   - five slugs and a 15-key `meta`, adding `rendererCssSha256`
   - states S5–S7 and observations O19–O23, each with a written injection and prediction
   - null-initialised references and in-window controls only
2. A base run (`--slug chrome-alert-squeeze-base`) measured the base tree:
   - `mainBundleSha256` is `025d3f6f…52c8`
   - `rendererCssSha256` is `9f238352…ea04`
3. Base run: O1–O18 are each `pass` with `control.fired` true.
4. Base run: O19–O23 are each scorable (`pass` or `defect`, control fired), and each verdict is compared with contract section E's prediction.
5. Every earlier hand-run artifact is byte-identical: the filtered `find | sort | xargs sha256sum | sha256sum` prints `e7d68bd7…6527` over 119 files.
6. A production change lands only for an alert whose gating observation (O19 for the open error, O22 for the pods error) is `defect` in the base report.
7. The open-error alert, if gated in, is bounded (zero basis on a wrapper, two-line clamp on the alert) and its `title` carries main's whole message.
8. The pods-error alert, if gated in, is bounded the same way and its `title` carries the whole message.
9. Both alerts keep `role="alert"` and the message as a direct text-node child.
10. The fork-error row's CSS is unchanged (`PodsChrome.module.css:13-16`, `:39-44`, `:54-61`).
11. Fix run (`--slug chrome-alert-squeeze`): O1–O18 are each `pass`.
12. Fix run: O19 (open-error tab titles) is `pass`.
13. Fix run: O20 (open-error alert painted inside the row) is `pass`.
14. Fix run: O21 (fork-error row with the tabs overflowing `.chrome`) is `pass`.
15. Fix run: O22 (pods-error tab titles) is `pass`.
16. Fix run: O23 (pods-error alert painted inside the row) is `pass`.
17. The fix run used the same driver bytes as the base run and the same main bundle, and its renderer CSS hash differs exactly when T2 committed a stylesheet change.
18. `FINDINGS-CHROME-ALERT-SQUEEZE.md` holds:
    - the 23-row verdict table
    - the 5-row base-versus-fix table
    - the summary, including O21's `podBarWidthReference` against `podBarWidthAlertShown`
19. The README's `## Later runs in this directory` gains one bullet, and no existing line changes.
20. Files the harness blocks under `.dir-sdlc/handruns/` are copied in by the orchestrator, and each copy's sha256 matches.
21. `npm run typecheck` and `npm test` exit 0 at the tip.
22. `.sir/backlog.md:35` is removed at Gate 3, after approval. Its closing citation is O21 `pass` in the fix run.
23. `.sir/backlog.md:36` is removed at Gate 3, after approval. Its closing citation is O19, O20, O22 and O23 `pass` in the fix run.

## Scope

- Backlog rows `:35` and `:36`.
- The driver amendment, the two runs, the findings and the README bullet.
- At most a stylesheet and markup change in `PodsChrome.tsx` and `PodsChrome.module.css` for the two bare alerts, with their tests.

### Not in scope

- The human checks at `.sir/backlog.md:34`, `:37` and `:38`, which stay open.
- The live-`claude` harness (`:27`) and the kept-deferred design items (`:30-33`), which stay open.
- The open-error and pods-error alerts when the Pod tabs overflow the row. T2 bounds each alert on a wrapper that keeps its min-content width, as `.dismissible` does (Gate 2 D5), but no observation measures this case. It is carried to the backlog at Gate 3.
- `PodBarPanel`'s reorder alert (`PodBarPanel.module.css:13-18`). It uses the same `0 1 auto` mechanism inside the panel and is unmeasured. It is carried to the backlog at Gate 3.

## Assumptions

| Question | Answer | Rung | Evidence |
|---|---|---|---|
| Can the driver reach the open error without a production change? | Yes. Create P5 with a cwd under the sandbox, remove that directory, then click Run. Main throws `CWD_MISSING` before any spawn. | 1 | `src/main/pod-manager/pod-manager.ts:401-403`, `src/main/pod/pod-runner.ts:171`, `:236`, `pod-manager.ts:809-810` |
| Can it reach the pods error with tabs still listed? | Yes. Substitute the `pod:update` and `pod:list` handlers in main (`app.evaluate`), then press a keyboard reorder. The failed refetch sets `podsPhase: 'error'` and keeps the list. | 1 | `src/renderer/src/state/store.ts:457-466`, `:528`, `src/renderer/src/pods/PodTab.tsx:210-223`, `src/shared/contracts/ipc.ts:94`, `:96` |
| Where is `pods.error` set? | `store.ts:465`, not `panel-store.ts` (whose `:371` and `:548` are the Beachcomber and Helm paths). | 1 | `store.ts:465` |
| Does `PodBarPanel`'s reorder alert confound S7? | It is held constant: the update fails with `refused` at both the reference and the measurement. | 1 | `src/renderer/src/pods/PodBarPanel.tsx:97-101` |
| Can two builds or driver runs share the worktree? | No. There is one `out/`, and the driver launches `out/main/index.js`. The chain is linear. | 1 | `run-fork-ui.mjs:93` |
| Does a CSS change show in `mainBundleSha256`? | No. The CSS ships in `out/renderer/assets/*.css`, which is why `meta.rendererCssSha256` is added. | 1 | `out/renderer/assets/index-DcH28GQD.css` after the orchestrator's base build |
| Is the main build reproducible? | Yes. `sha256sum out/main/index.js` at base is `025d3f6f…52c8`, equal to the followups and recheck reports' `mainBundleSha256`. | 1 | orchestrator's re-run, this phase |
| Add new slugs, or overwrite earlier runs' reports? | Two new slugs. The earlier reports stay byte-identical. | 1 | `run-fork-ui.mjs:63`, `:74`; `README.md:44-52` |
| How many Pods does S6 need to overflow the row? | About 2–3 beyond 6, at roughly 180px per tab. The loop is bounded at 12. | 4 | derived from O17's `podBarWidthAlertShown` 1098.25 in `driven-report-fork-ui-followups.json` |
| Worktree root and branch | `.claude-worktrees/<id>/` (framework default); branch `agent/<id>` | 1 | `.gitignore:1`; `.sir/config.json` `git.branchPrefix` |
| How does the window hash handle line endings? | The worktree is CRLF on disk. The window hash normalises with `splitlines`. | 1 | T1 C15. Re-run this phase: prints 1 at line 103 for n=54; the near-miss n=53 prints 0 |

## Contracts

- [`contracts/chrome-alert-driver.md`](contracts/chrome-alert-driver.md), sections:
  - A: the alert DOM hooks
  - B: invocation and outputs
  - C: states S5–S7
  - D: observations O19–O23
  - E: the base verdicts and the measure-first gate

## Open questions

- Which of T2's criteria stand depends on the base run's O19 and O22 verdicts, so it cannot be known before T1 commits. The orchestrator applies contract section E between T1's commit and T2's dispatch. If a base verdict differs from its prediction, that is one escalation, answered by an amendment.
