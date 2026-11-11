<!-- frozen at Gate 2: 20261110-1857-chrome-alert-width -->

# Contract: the alert width policy, the amended fork UI driver, the measure-first gate, and the human validation file

Markdown, because none of these interfaces has a language form: DOM hooks a Playwright
driver reads, a CLI, its output files, the base verdicts one task hands the next, and a
document the user follows at Gate 3. Declarations only.

Abbreviations: `H` = `.dir-sdlc/handruns/2026-09-30-electron-handrun` (relative to the
worktree root). "The squeeze contract" = the frozen contract `chrome-alert-driver.md` of
session `20261110-1618-chrome-alert-squeeze`. "The followups contract" and "the prior
contract" are as the squeeze contract defines them. `tol` = `1 / devicePixelRatio` CSS px,
read in the window **at the measurement** (S10 changes the zoom, so `tol` is re-read there).
"The panel" = the first element child of `[data-testid="pods-chrome"]` (`PodBarPanel`,
`src/renderer/src/pods/PodsChrome.tsx:269`). "The pod bar" = `[data-testid="pod-bar"]`
(`src/renderer/src/pods/PodBar.tsx:92`), the panel's first element child. "The base run" =
slug `chrome-alert-width-base`; "the fix run" = slug `chrome-alert-width`.

Backlog rows are named by the session that wrote them and their words, never by line
number:

| Driver `backlogRow` | Backlog row |
|---|---|
| 9 | `20261110-1618-chrome-alert-squeeze`, "Decide how much width the open-error and pods-error alerts get" |
| 10 | `20261110-1618-chrome-alert-squeeze`, "Measure the open-error and pods-error alerts when the Pod tabs alone overflow `.chrome`" |
| 11 | `20261110-1618-chrome-alert-squeeze`, "Measure `PodBarPanel`'s reorder alert" |

**Supersession.** This contract supersedes the squeeze contract's section B (slug set,
`observations[].id` and `backlogRow` ranges, findings file) and extends its section C (states)
and section D (observations) with S8-S10 and O24-O32. Every other clause of the squeeze
contract, and every clause it keeps from the followups and prior contracts, applies
unchanged to the amended driver. In particular O1-O23, S1-S7 and their routes are unchanged.

| Section | Implementer | Consumer |
|---|---|---|
| A. DOM hooks | T2 (keeps every one; may wrap the reorder alert) | T1 (base run), T3 (fix run) |
| B. Invocation and outputs | T1 | T3 (runs it, writes the findings); T4 (cites the fix run's screenshots); the orchestrator at Gate 3 |
| C. States S8-S10 | T1 | T3 (runs it) |
| D. Observations O24-O32 | T1 | T3 (runs it) |
| E. Base verdicts and the measure-first gate | T1 (produces the base report) | T2 (branches on it); T3 (scores the fix run by it); the orchestrator |
| F. Width policy | T2 | T1 and T3 (O24, O27, O30 score it); T4 (states it to the user) |
| G. Human validation file | T4 | the orchestrator and the user at Gate 3 |

---

## A. DOM hooks the driver reads (T2 must keep every one)

Every hook of the squeeze contract section A, plus:

| Hook | Declared at base `921dd24` | Guarantee the driver relies on |
|---|---|---|
| Reorder alert | `src/renderer/src/pods/PodBarPanel.tsx:97-101` | An element with `role="alert"` inside the panel whose `textContent` is exactly the failed reorder's `error.message`, carried as a **direct text-node child**. It is, or is a descendant of, a child element of the panel other than the pod bar. At most one is mounted. |
| Reorder alert's panel child | (the alert itself at base) | The child element of the panel that is, or contains, the reorder alert. O26's control and O27's measurement read it. |
| Pod bar | `PodBar.tsx:92` | The panel's first element child. |
| P5 run control after S5 | `src/renderer/src/pods/run-control.ts:42-47` | P5 is beached after S5, so its `[data-testid="pod-tab-open:<P5 id>"]` carries `data-verb="reconnect"`; activating it calls `reconnectPod` (`PodsChrome.tsx` `handleRun`), whose start raises `CWD_MISSING` before any spawn (`src/main/pod-manager/pod-manager.ts:495-500`, `src/main/pod/pod-runner.ts:171`, `:236`). |

Error case: a hook missing at measurement leaves its reference `null` and the observation
`instrument-invalid` (prior I4, binding rule 2), never `defect`.

## B. Invocation and outputs (supersedes the squeeze contract's section B)

```
node H/driver/run-fork-ui.mjs [--slug <slug>] [--sandbox-root <absolute path>] [--keep-sandbox]
```

| Parameter | Type | Default | Meaning |
|---|---|---|---|
| `--slug` | `fork-ui` \| `fork-ui-recheck` \| `fork-ui-followups` \| `chrome-alert-squeeze-base` \| `chrome-alert-squeeze` \| `chrome-alert-width-base` \| `chrome-alert-width` | `fork-ui` | As prior I1. Any other value: exit 2, nothing written. |
| `--sandbox-root` | absolute Windows path | `C:\oc-sandbox-<slug>` | As prior I1. |
| `--keep-sandbox` | flag | absent | As prior I1. |

Exit codes: as prior I1, with "O1-O16" read as "O1-O32".

Outputs: as the squeeze contract's section B, plus the screenshots
`08-s8-reorder-error.png`, `09-s9-overflow-open-error.png` and
`10-s10-overflow-pods-error.png`. The findings file `H/FINDINGS-CHROME-ALERT-WIDTH.md` is
written by T3's agent by hand from both runs' JSON. It carries the prior I2 verdict table
header exactly, one row per observation O1-O32 of the fix run in order, and a second table
with the header `| Obs | Backlog row | Alert | Base verdict | Fix-run verdict |`, one row
per observation O24-O32 in order. Both tables keep the no-raw-`|` rule.

`driven-report-<slug>.json`: `meta` exactly as the squeeze contract (fifteen keys, no more).
`states[].id` ranges over `'S1'` … `'S10'`, in id order. `observations[].id` ranges over
`'O1'` … `'O32'`, in id order; `backlogRow` over 1-11 (1-8 as the squeeze contract; 9-11 as
the table above).

Where the harness blocks an agent's edit tools under `H/`, the agent writes the file's full
text into its own scratch directory and the orchestrator copies it into the worktree
verbatim; the copy's `sha256sum` equals the sha256 the agent reports
(project lesson 2026-11-09).

## C. States S8-S10 (extend the squeeze contract's section C)

Run order: S5 (O19, O20, O24) → **S8** (O25, O26, O27) → S6 (O21) → **S9** (O28, O29) →
S7 (O22, O23, O30) → **S10** (O31, O32). No observation of O1-O18 runs after S5. Each
reload is followed by a wait for the expected Pod tab count and by reinstalling the
in-window helpers.

| State | Route | Reached when |
|---|---|---|
| S8 reorder error, 6 Pod tabs leaving free space | After O24's control is undone: reload (clears the open error; 6 Pod tabs). With no alert shown and the mouse parked, the free-space condition of the squeeze contract is checked, and the reference taken: every Pod tab's title width, and the pod bar's max-content width (inline `flex: none; width: max-content` on the pod bar, read after two animation frames, cleared, undo verified). In main, by `app.evaluate`, the `pod:update` handler is replaced (`ipcMain.removeHandler`, then `ipcMain.handle`) by one resolving `{ ok: false, error: { code: 'NOT_FOUND', message: M8 } }`. M8 is the text main's store raises for a Pod it does not hold, `updatePod: no pod with id ` followed by P5's id: the prefix is read by the driver from `src/main/store/sqlite-event-store.ts:233`, and it reaches the renderer verbatim (`src/main/store/errors.ts:43`, `src/main/ipc/errors.ts:90`, `:95`). P1's tab button is focused and `Control+ArrowRight` pressed (`src/renderer/src/pods/PodTab.tsx:218`): every update fails, the list refetch (`src/renderer/src/state/store.ts:528`, real `pod:list`) succeeds, and the reorder alert shows M8. | Exactly one reorder alert, whose `textContent` equals M8; no alert outside the panel; 6 Pod tabs; `pods.list` length 6 before and after; the free-space condition held for the reference. |
| S9 open error, Pod tabs overflowing `.chrome` | After O21's control is undone, in S6's state: reload (clears the fork error). With no alert shown, S6's overflow condition is checked again and an unscored reference of every Pod tab's title width taken (mouse parked). Then P5's run control (`data-verb="reconnect"`) is clicked. | Exactly one open-error alert (squeeze contract section A), the overflow condition held for the reference, and `pods.list` returns the same number of Pods before and after the click. |
| S10 pods error, Pod tabs overflowing `.chrome` | After O30's control is undone, in S7's final state (the pods-error alert still shown; no reload, which would refetch through the replaced `pod:list`): the window's zoom is raised by `app.evaluate` (`webContents.setZoomFactor`) from 1.0 in steps of 0.1, at most to 2.0, each step followed by two animation frames and a re-read of `tol`, until the pod bar's max-content width exceeds the `pods-chrome` `clientWidth` by more than `tol` ("the Pod tabs alone overflow"). No alert-free reference is possible here, and none is scored. | The overflow condition holds at the zoom reached; exactly one alert whose `textContent` equals M7 is shown; 5 Pod tabs. The evidence records the zoom factor, `tol`, the pod bar's max-content width and the `pods-chrome` `clientWidth`. |

The S8 substitution is never restored; S7 replaces the same handler again, and nothing the
driver does between S8 and S7 invokes `pod:update` (only `reorderPods` calls `pods.update`
in the renderer, `store.ts:518-534`). S10 is the last state; the app is closed after O32.

## D. Observations O24-O32 (extend the squeeze contract's section D)

Every prior I4 binding rule applies, including that `tol` is a reference. "Title width",
"painted line boxes", "panel max-content width" and "row min-content width" are as the
squeeze contract defines them. "The alert's chrome child" is as there; "the alert's panel
child" is as section A.

| Obs | Row | State | Measurement → `pass` when | Control (injection) | Predicted |
|---|---|---|---|---|---|
| O24 | 9 | S5 | With the open-error alert shown and the mouse parked: `w` = the alert's chrome child's width, `c` = the `pods-chrome` `clientWidth`, `b` = S5's reference panel max-content width. **`pass` (section F, option A) when `abs(w - (c - b))` is at most `tol`.** Recorded: `w`, `c`, `b`, `c - b`, the panel's width. | Inline `flex-grow: 1` on the panel. | `abs(w - (c - b))` exceeds `tol`. |
| O25 | 11 | S8 | As O19, with S8's reference and the reorder alert. 6 Pod tabs expected. Also recorded: the reorder alert's text and width, M8's length, the pod bar's width at the reference and at the measurement, the panel max-content width and the `pods-chrome` `clientWidth`. | As O19. | As O19. |
| O26 | 11 | S8 | As O20, over the reorder alert. | As O20, on the reorder alert's panel child. | As O20. |
| O27 | 9 | S8 | With the reorder alert shown and the mouse parked: `w` = the alert's panel child's width, `c` = the panel's `clientWidth`, `b` = S8's reference pod bar max-content width. **`pass` (section F, option A) when `abs(w - (c - b))` is at most `tol`.** Recorded: `w`, `c`, `b`, `c - b`. | Inline `flex-grow: 1` on the pod bar. | `abs(w - (c - b))` exceeds `tol`. |
| O28 | 10 | S9 | As O21, over the open-error alert's chrome child (the row): `pass` when the row's width is at most its min-content width plus `tol`, and at least 1 painted line box is non-empty. Recorded unscored: `podBarWidthReference`, `podBarWidthAlertShown` and their difference, every Pod tab's reference and alert-shown title width, the tab count, the panel max-content width and the `pods-chrome` `clientWidth`. | As O21, on that row. | As O21. |
| O29 | 10 | S9 | As O20, over the open-error alert. | As O20. | As O20. |
| O30 | 9 | S7 | As O24, with the pods-error alert and `b` = S7's reference panel max-content width. | As O24. | As O24. |
| O31 | 10 | S10 | As O28, over the pods-error alert's chrome child. No title-width reference is recorded (S10 has none). Also recorded: the zoom factor and `tol`. | As O28. | As O28. |
| O32 | 10 | S10 | As O20, over the pods-error alert. | As O20. | As O20. |

Ordering guarantees: as the squeeze contract section D, with section C's run order.

## E. Base verdicts and the measure-first gate

The base run measures the tree at T1's tip, which carries no production change (base
`921dd24`, the tree the squeeze session's fix run measured).

| Obs | Gates | Session prediction for the base run (written at Gate 2, before any run) | Grounds |
|---|---|---|---|
| O1-O23 | T1 only | all `pass`, every control fired | All 23 are `pass` with `control.fired` true in `driven-report-chrome-alert-squeeze.json`, and no file under `src/` differs between `c5243ea` and `921dd24`. |
| O24 | nothing (the policy is the Gate 2 decision) | `defect` | Measured: `w` 76.838 against `c - b` = 1280 - 1126.325 = 153.675 (O19 of `driven-report-chrome-alert-squeeze.json`). |
| O25 | T2's reorder criteria | `defect` | `.reorderError` (`PodBarPanel.module.css:13-18`) sets no `flex`, so its basis is M8's whole width (62 characters at 11px, est. 330-380 px). With 6 tabs the pod bar's basis is about 1126 px (S5's panel max-content), so the two bases exceed 1280 px, and both shrink in proportion to their bases. |
| O26 | nothing | `pass` or `defect`, low confidence | Depends on whether the shrunk, unclamped paragraph, which keeps its default block margins, wraps to 2 or to 3 line boxes. |
| O27 | nothing | `defect` | At base the alert is its own panel child and shrinks from M8's basis, so `w` is well above `c - b`. |
| O28 | escalation only | `pass` | `.alertRow` is `flex: 1 1 0` with no `overflow` (`PodsChrome.module.css:71-75`), so under negative free space it keeps its min-content width, as `.dismissible` did in O21. |
| O29 | escalation only | `pass` | `.alertRow > .listError` clamps and clips (`:82-89`), as in O20. |
| O30 | nothing | `defect` | Measured: `w` 143.675 against `c - b` = 1280 - 992.663 = 287.337 (O22, same report). |
| O31 | escalation only | `pass` | As O28. |
| O32 | escalation only | `pass` | As O29. |

Gate rule, decided mechanically from `H/driven-report-chrome-alert-width-base.json` as T1
committed it (T2 and its reviewer decide it; no git is needed):

- **The reorder branch.** T2's reorder criteria apply if and only if O25 is `defect` with
  `control.fired` true there. Otherwise T2's "reorder unchanged" criterion applies instead:
  the three reorder files are byte-identical to base (sha256 in T2's criteria).
- O26 `defect` while O25 is `pass` is an escalation, not a branch.
- O28, O29, O31 or O32 `defect` is an escalation: no task in this session changes the
  overflow behaviour.
- O24 or O30 `pass` at base contradicts measured values and is an escalation.
- Any O1-O32 `instrument-invalid` or `not-run`, or any O1-O23 not `pass`, is T1 unmet, not a
  verdict.

## F. Width policy (decided at Gate 2: option A, reaching the reorder alert, not the fork-error row)

**Option A.** While an alert row is shown beside the Pod tabs, the tabs keep their
content width and the alert row takes all the space left over.

- In `.chrome`: while an `.alertRow` (open error or pods error) is a child of `pods-chrome`,
  the panel's used `flex-grow` is 0. With none, the panel's declarations are exactly those of
  `.chrome > :first-child` at base (`flex: 1 1 auto`, `min-width: 0`;
  `PodsChrome.module.css:13-16`).
- In the panel, if the reorder branch applies: while the reorder alert's wrapper is a child of
  the panel, the pod bar's used `flex-grow` is 0. With none, the pod bar's declarations are
  exactly those of `.panel > :first-child` at base (`PodBarPanel.module.css:8-11`).
- `.dismissible` (the fork-error row) is unchanged, and so are its rules
  (`PodsChrome.module.css:39-44`, `:54-61`).
- Under negative free space (the Pod tabs alone overflow) nothing changes: each zero-basis row
  keeps its min-content width (O28, O31).

## G. Human validation file

| Item | Declaration |
|---|---|
| Path | `docs/human-checks/chrome-alert-width.md` (outside `H`, so the harness block on `H` does not reach it; the copy rule of section B applies if it does). |
| Checks | Eight sections, headed `## H1` … `## H8` in order, each followed by a space and a title. H1: the open-error alert's width under the section F policy. H2: the open-error alert's two-line clamp and tooltip. H3: the pods-error alert's two-line clamp and tooltip. H4: the reorder alert. H5: the open-error and pods-error alerts with the Pod tabs overflowing the row. H6: the ⑂ fork mark. H7: the fork-error tooltip. H8: the two-line clamped fork error. |
| Each section | Numbered steps (`1.`, `2.`, …); exactly one line beginning `**Passes when:**`; exactly one line beginning `**Backlog:**`, naming the backlog row by its session id and words, or `this session` for H4 and H5. Where a check cannot be made from the app's own UI, the section says so and names the screenshot or test that stands in, and what that cannot show. |
| Backlog rows named | H1: `20261110-1618-chrome-alert-squeeze`, "judge whether the ~77 px two-line clamp … tells the user enough", judged at the width section F gives. H2 and H3: `20261110-1618-chrome-alert-squeeze`, "trigger a long open error and a long pods error". H6: `20261109-1642-fork-ui-human-checks`, "the ⑂ on a Pod tab reads as a fork mark". H7: `20261109-2239-fork-ui-followups`, "hover the clamped fork-error text". H8: `20261109-2239-fork-ui-followups`, "two-line clamped fork error ending in "…" is acceptable". |
| Error case | No backlog row is cited by line number: Gate 3 removes rows, and a line number would then point at a different row. |

Gate 3 records each check's result as the user reports it; that recording is the
orchestrator's, not part of this file.
