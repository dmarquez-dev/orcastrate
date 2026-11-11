# chrome-alert-width

Give the open-error and pods-error alerts a width the user chooses at Gate 2. Measure the two cases nobody has measured: those alerts with the Pod tabs overflowing, and `PodBarPanel`'s reorder alert. Bound the reorder alert only if the measurement shows it squeezing the tabs. Then hand the user a step-by-step human validation pass for this session's changes and the pending human checks.

## Context

- `20261110-1618-chrome-alert-squeeze` put the open-error and pods-error alerts in an `.alertRow` wrapper (`flex: 1 1 0`, `src/renderer/src/pods/PodsChrome.module.css:71-75`). The wrapper has a two-line clamp and the full message in `title`.
  - Both the panel (`.chrome > :first-child`, `flex: 1 1 auto`, `:13-16`) and the row grow at 1, so the leftover space is split between them evenly.
  - With 6 Pod tabs, the open-error alert is 76.838 px wide out of 153.675 px of free space (1280 − 1126.325).
  - With 5 tabs, the pods-error alert is 143.675 px wide out of 287.337 px of free space (1280 − 992.663).
  - Source: O19 and O22 in `.dir-sdlc/handruns/2026-09-30-electron-handrun/driven-report-chrome-alert-squeeze.json`.
- No driver observation measures those two alerts when the Pod tabs alone overflow `.chrome`. O21 covers only the fork error.
- `.reorderError` (`src/renderer/src/pods/PodBarPanel.module.css:13-18`) sets no `flex`. It keeps a `0 1 auto` basis, the whole width of its message, which is the mechanism that once squeezed the tab titles. Nothing has measured it.
  - The longest message main produces deterministically is `updatePod: no pod with id <uuid>` (`src/main/store/sqlite-event-store.ts:233`), 62 characters.
- The instrument is the fork-UI hand-run driver, `.dir-sdlc/handruns/2026-09-30-electron-handrun/driver/run-fork-ui.mjs`. The squeeze session already amended it in place, and this session amends it again: S8-S10 and O24-O32.

## Definition of done

1. The driver is amended. It has seven slugs, `meta` keeps its 15 keys, and it adds S8-S10 and O24-O32, each observation with an injection and a prediction. The O1-O23 window is byte-identical (whole-window hash).
2. The base run measured the base tree: main bundle `025d3f6f…52c8`, renderer CSS `66295bbb…57ba`.
3. In the base run, O1-O23 are each `pass` with the control fired.
4. In the base run, O24-O32 are each scorable, and each is compared with contract section E's prediction.
5. The earlier hand-run artifacts are byte-identical: 150 files hashing to `badc4c0f…6f4a`, at T1's tip and at T3's tip.
6. The width policy chosen at Gate 2 is applied to the open-error and pods-error rows, and the built CSS carries it.
7. With no alert row, the panel's rule is unchanged. The alert-row, clamp and fork-error rules are otherwise unchanged.
8. The reorder alert is bounded (wrapper, clamp, `title`, DOM hook kept, policy) if and only if O25 is `defect` with its control fired in the base report. Otherwise its three files are byte-identical to base.
9. No design token is added or changed.
10. The fix run used the same driver bytes and main bundle as the base run. Its renderer CSS hash differs exactly when a stylesheet changed.
11. In the fix run, O1-O23 are each `pass`.
12. In the fix run, O24 and O30 are `pass`: the policy holds in the app.
13. In the fix run, O25-O27 follow their branch.
14. In the fix run, O28 and O29 are `pass`: the open error with the tabs overflowing.
15. In the fix run, O31 and O32 are `pass`: the pods error with the tabs overflowing.
16. `FINDINGS-CHROME-ALERT-WIDTH.md` is written: a verdict table, a before/after table, and a summary.
17. The README's `## Later runs in this directory` list gains one bullet, placed first.
18. `docs/human-checks/chrome-alert-width.md` has eight sections, H1-H8, each with numbered steps, one `**Passes when:**` and one `**Backlog:**`. It cites no backlog line numbers.
19. Where the harness blocks an agent's write, the orchestrator copies the agent's scratch text into the worktree verbatim, and the copy's sha256 matches the one the agent reported.
20. `npm run typecheck` and `npm test` exit 0 at the tip.
21. At Gate 3, after approval, three `20261110-1618-chrome-alert-squeeze` rows are removed from `.sir/backlog.md`: "Decide how much width…", "Measure … when the Pod tabs alone overflow `.chrome`", and "Measure `PodBarPanel`'s reorder alert".
22. Gate 3 records the user's result for each of H1-H8. Each passing check closes its backlog row: the 1642 "reads as a fork mark" row; the 2239 "hover the clamped fork-error text" and "acceptable as the only visible text" rows; and the 1618 "trigger a long open error…" and "tells the user enough" rows. A check that fails, or is not made, stays in the backlog or becomes a new row, with the user's words.

## Scope

Backlog rows `20261110-1618-chrome-alert-squeeze` "Decide how much width…", "Measure … overflow `.chrome`" and "Measure `PodBarPanel`'s reorder alert". The session also covers a human validation pass over this session's work and the five pending human checks named in item 22. Four tasks run in a serial chain: T1 amends the driver and makes the base run, T2 changes the renderer, T3 makes the fix run and writes the findings, and T4 writes the human validation file.

### Not in scope

- The hand-run harness tooling row (`dir-handoff-2026-10-26`), slash-command autocomplete (`20261110-1821-slash-command-autocomplete`), and the kept-deferred design items (`20261105-0107-design-decisions-sweep`).
- Deferred to the backlog: an open-error or pods-error alert shown together with a long reorder alert. If Chromium counts a zero-basis item's max-content in its container's max-content, the reorder message would inflate the panel's basis. No observation measures that combination.

## Assumptions

| Question | Answer | Rung | Evidence |
|---|---|---|---|
| Can builds or test runs share the worktree? | No. There is one `out/`, the driver launches it, and vitest writes `node_modules/.vite` in the worktree. The chain is serial; only T2 injects defects, and only into files it owns. | 1 | `.gitignore` (`out/`), `package.json:12`, `run-fork-ui.mjs:107`, `.sir/lessons.md` (2026-11-03 cosmetic-structural-sweep) |
| Do T2's repo-wide gates read files T3 or T4 own? | No. The tree-scanning tests scan `src`, `tests` and `probe`, and no test names `docs/` or `.dir-sdlc/`. | 1 | `tests/unit/pod-manager/marker-single-definition.test.ts:54`; grep of `tests/` and `src/**/*.test.*` |
| Which failures can a reorder show? | NOT_FOUND `updatePod: no pod with id <uuid>` (62 characters, the longest deterministic one), IO/CONFLICT `updatePod: <sqlite msg> (<code>)`, and INTERNAL bridge faults. The renderer never triggers INVALID_ARGUMENT. | 1 | `src/main/store/sqlite-event-store.ts:233`, `src/main/store/errors.ts:43-47`, `validate.ts:128-151`, `store.ts:1165`, `:1175` |
| Why does S8 substitute the message rather than use a stale tab? | The genuine route deletes a Pod, which changes the tab count between the reference and the measurement. The driver reads main's own prefix from source and substitutes the `pod:update` handler. | 1 | contract C; `store.ts:518-534` |
| Is the open error reachable by hand? | Yes: delete a Pod's folder, then use its run control. | 1 | `pod-runner.ts:171`, `:230-243`; `pod-manager.ts:495-500` |
| Is the pods error reachable by hand? | No. Only a failed `pods.list` sets it. H3 uses the screenshot and the jsdom test instead. | 1 | `src/renderer/src/state/store.ts:465`; `handlers.ts:121` |
| Is the reorder alert reachable by hand? | Through the DevTools console: `window.orcastrate.pods.delete` on a throwaway Pod, then `Control+ArrowRight`. DevTools availability is judgment: `src/main` has no `setApplicationMenu`, so Electron's default menu should apply. | 1 / judgment | `src/preload/index.ts:20`, `src/preload/api.ts:92`, `:98`, `src/main/window.ts:21` |
| How does S10 overflow? | By raising the zoom factor. A reload would refetch through the replaced `pod:list`, and the window's minimum width is 940. | 1 | `src/main/window.ts:18`; contract C |
| Will O25 be `defect` at base? | Predicted yes: 1126 px of tab basis plus M8's basis is more than 1280. The base run decides T2's branch. | estimate | contract E; `PodBarPanel.module.css:13-18` |
| Does the worktree's `out/` reflect base? | Yes. The probe build at setup gives main `025d3f6f…52c8` and CSS `66295bbb…57ba`, the squeeze fix run's values. | 1 | `sha256sum` and `python -I`, re-run by the orchestrator this phase |
| Where does the human validation file live? | `docs/human-checks/chrome-alert-width.md`, outside the `.dir-sdlc/handruns/` path the harness blocked before. The copy rule is kept anyway. | 1 | `.sir/lessons.md` (2026-11-09 fork-ui-human-checks) |
| Does `:has()` work in this Electron? | Yes (Electron 43, Chromium far past 105). T2 C3 checks that CSS Modules keeps the rule in the built CSS. | judgment | `package.json:35` |

## Contracts

- [`contracts/chrome-alert-width-driver.md`](contracts/chrome-alert-width-driver.md): A, DOM hooks · B, invocation and outputs · C, states S8-S10 · D, observations O24-O32 · E, base verdicts and the measure-first gate · F, width policy · G, the human validation file.

## Open questions

None. The width policy is decided at Gate 2.
