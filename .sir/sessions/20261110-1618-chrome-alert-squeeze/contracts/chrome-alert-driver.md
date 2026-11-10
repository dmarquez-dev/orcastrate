<!-- frozen at Gate 2: 20261110-1618-chrome-alert-squeeze -->

# Contract: the Pod-bar alerts' DOM hooks, the amended fork UI driver, and the measure-first gate

Markdown, because none of these interfaces has a language form: DOM hooks a Playwright
driver reads, a CLI, its output files, and the base verdicts one task hands the next.
Declarations only.

Abbreviations: `H` = `.dir-sdlc/handruns/2026-09-30-electron-handrun` (relative to the
worktree root). "The followups contract" = the frozen contract `fork-ui-driver-followups.md`
of session `20261109-2239-fork-ui-followups`, as amended there (A2). "The prior contract" =
the frozen contract `fork-ui-driver.md` of session `20261109-1642-fork-ui-human-checks`.
"One device pixel" / `tol` = `1 / devicePixelRatio` CSS px, read in the window. "The panel"
= the first element child of `[data-testid="pods-chrome"]` (`PodsChrome.tsx:269`,
`PodBarPanel`), the item `.chrome > :first-child` (`PodsChrome.module.css:13-16`) styles.
"The base run" = the run with slug `chrome-alert-squeeze-base`; "the fix run" = the run with
slug `chrome-alert-squeeze`.

**Supersession.** This contract supersedes the followups contract's section B (slug set,
`meta` shape, `observations[].id` and `backlogRow` ranges, findings file list) and extends
prior I3's state list and prior I4's observation table with S5-S7 and O19-O23. Every other
clause of the followups contract (section A hooks, section C rows O10, O11, O14, O16, O17,
O18 and its ordering guarantees) and of the prior contract it keeps (I1 preconditions and
reuse rules, I2 verdict rule and table format, I3 states S1-S4 and routes, I4 binding rules
and rows) applies unchanged to the amended driver.

| Section | Implementer | Consumer |
|---|---|---|
| A. Alert DOM hooks | T2 (keeps them; they all exist at base) | T1 (base run), T3 (fix run) |
| B. Invocation and outputs | T1 | T3 (runs it); the orchestrator at Gate 3 |
| C. States S5-S7 | T1 | T3 (runs it) |
| D. Observations O19-O23 | T1 | T3 (runs it) |
| E. Base verdicts and the measure-first gate | T1 (produces the base report) | T2 (cites it); the orchestrator (dispatches T2 on it) |

---

## A. DOM hooks the driver reads (T2 must keep every one)

Every hook of the followups contract section A, plus:

| Hook | Declared at base `87b15e5` | Guarantee the driver relies on |
|---|---|---|
| Open-error alert | `src/renderer/src/pods/PodsChrome.tsx:281-285` | An element with `role="alert"` whose `textContent` is exactly main's message, carried as a **direct text-node child** of that element. The message starts with the literal the driver reads from `src/main/pod/pod-runner.ts:236` (`cwd is not accessible: `). The element is, or is a descendant of, a child element of `pods-chrome`. At most one is mounted. |
| Pods-error alert | `PodsChrome.tsx:308-312` | An element with `role="alert"` whose `textContent` is exactly `pods.error.message`, carried as a direct text-node child. The element is, or is a descendant of, a child element of `pods-chrome`. At most one is mounted. |
| Run control | `src/renderer/src/pods/PodTab.tsx:46` (`POD_TAB_OPEN_TEST_ID = 'pod-tab-open'`) | `[data-testid="pod-tab-open:<podId>"]`, one per closed or beached Pod; activating it calls `openPod` or `reconnectPod` (`PodsChrome.tsx:156-168`). |
| Pod tab keyboard reorder | `PodTab.tsx:210-223` | `Control+ArrowRight` on a focused `[data-testid="pod-tab:<podId>"]` button commits a reorder through `reorderPods` (`src/renderer/src/state/store.ts:518-534`), which refetches the list on any update failure (`:528`). |

"The alert's chrome child" (used by O20 and O23) = the child element of `pods-chrome` that is,
or contains, the alert.

Error case: a hook missing at measurement time leaves the reading reference `null`, and the
observation is `instrument-invalid` (prior contract I4, binding rule 2). It is never a `defect`.

## B. Invocation and outputs (supersedes the followups contract's section B)

```
node H/driver/run-fork-ui.mjs [--slug <slug>] [--sandbox-root <absolute path>] [--keep-sandbox]
```

| Parameter | Type | Default | Meaning |
|---|---|---|---|
| `--slug` | `fork-ui` \| `fork-ui-recheck` \| `fork-ui-followups` \| `chrome-alert-squeeze-base` \| `chrome-alert-squeeze` | `fork-ui` | As prior I1. Any other value: exit 2, nothing written. |
| `--sandbox-root` | absolute Windows path | `C:\oc-sandbox-<slug>` | As prior I1. |
| `--keep-sandbox` | flag | absent | As prior I1. |

Exit codes: as prior I1, with "O1-O16" read as "O1-O23".

Outputs: as prior I2 (`H/driven-report-<slug>.json`, `.md`, `H/screenshots/<slug>/`), plus
the screenshots `05-s5-open-error.png`, `06-s6-overflow-fork-error.png` and
`07-s7-pods-error.png`. The findings file `H/FINDINGS-CHROME-ALERT-SQUEEZE.md` is written by
T3's agent by hand from both runs' JSON; it carries the prior I2 verdict table header exactly,
one row per observation O1-O23 of the fix run in order, and a second table with the header
`| Obs | Backlog row | Alert | Base verdict | Fix-run verdict |`, one row per observation
O19-O23 in order. Both tables keep the no-raw-`|` rule: a value containing `|` is written into
the JSON only and the cell says `see JSON`.

`driven-report-<slug>.json` shape, superseding the followups contract's `meta`, `states` and
`observations` element types:

```
meta: {
  slug: string,
  generatedAt: string,
  driverSha256: string,
  mainBundleSha256: string,
  rendererCssSha256: string | 'absent', // sha256 of the bytes of every *.css under out/renderer/assets, concatenated in sorted file-name order
  electron: string, playwright: string,
  devicePixelRatio: number,
  viewport: { width: number, height: number },
  sandboxRoot: string,
  mainEnv: { USERPROFILE: string, userData: string, CLAUDE_CONFIG_DIR: string | null },
  realSettingsSha256: { before: string | 'absent', after: string | 'absent' },
  exitCode: 0 | 1 | 2,
  sandboxRemoved: boolean,
  precondition: string | null
}
states: Array<{ id: 'S1' | ... | 'S7', route: string, reached: boolean, evidence: string }>
observations: Array<{
  id: 'O1' | ... | 'O23',
  backlogRow: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8,
  // 1-6 as the followups contract; 7 = the fork-error row when the Pod tabs alone overflow
  // .chrome (.sir/backlog.md:35); 8 = the open-error and pods-error alerts (.sir/backlog.md:36)
  verdict, measured, control, reason   // as prior I2
}>
```

`meta` carries exactly the fifteen keys above, no more.

## C. States S5-S7 (extend prior I3)

They run after O16's control and the `04-after-dismiss.png` screenshot, in the order S5, S6,
S7; no observation of O1-O18 runs after them. Each reload is followed by a wait for the
expected Pod tab count and by reinstalling the in-window helpers.

| State | Route | Reached when |
|---|---|---|
| S5 open error, Pod tabs leaving free space | `pods.create` P5 (title `P5 cwd gone`) with `cwd` a directory the driver creates under `meta.sandboxRoot`; that directory is then removed; reload (6 Pod tabs); with no alert shown, the panel's max-content width is at most the `pods-chrome` `clientWidth` minus `tol` ("free space"); then P5's run control (`data-verb="open"`) is clicked. Main's runner raises `CWD_MISSING` before any spawn (`src/main/pod/pod-runner.ts:171`, `:236`) and beaches P5 (`src/main/pod-manager/pod-manager.ts:809-810`). | Exactly one open-error alert (section A) is shown, the free-space condition held for the reference, and `pods.list` returns the same number of Pods before and after the click. |
| S6 fork error, Pod tabs overflowing `.chrome` | Reload (clears the open error). Pods titled `P<n> overflow` (cwd: the sandbox repo the earlier Pods use) are created one at a time, each followed by a reload, until, with no alert shown, the panel's max-content width exceeds the `pods-chrome` `clientWidth` by more than `tol` ("overflow"); at most 12 are added. Then P4's Fork control is clicked, as in S4. | The overflow condition held for the reference, every Pod tab title's reference width exceeds `tol`, and exactly one fork-error alert is shown. |
| S7 pods error, Pod tabs leaving free space | `pods.delete({ podId, deleteSession: false })` for P5 and every Pod S6 added; reload (5 Pod tabs, as at O17). In main, by `app.evaluate`, the `pod:update` handler is replaced (`ipcMain.removeHandler`, then `ipcMain.handle`) by one resolving `{ ok: false, error: { code: 'IO', message: 'refused' } }`; channel names are read from `src/shared/contracts/ipc.ts:94` and `:96`. P1's tab button is focused and `Control+ArrowRight` pressed: every update fails, the list refetch succeeds, and `PodBarPanel`'s reorder alert shows `refused`. The free-space condition is checked and the reference taken here. Then the `pod:list` handler is replaced the same way, resolving `{ ok: false, error: { code: 'IO', message: M7 } }`, where M7 is `pods.list failed (hand-run driver substitution): ` followed by S4's alert text verbatim; `Control+ArrowRight` is pressed again on the focused tab. | Exactly one alert whose `textContent` equals M7 is shown, the Pod tab count is still 5, the reorder alert's text is `refused` both at the reference and at the measurement, and the free-space condition held for the reference. |

The replaced handlers are never restored; S7 is the last state, and the app is closed after
its observations.

"Panel max-content width" is read by setting inline `flex: none; width: max-content` on the
panel, reading its `getBoundingClientRect().width` after two animation frames, and clearing
both; the undo is verified (inline style empty, `pod-bar` width back within `tol`) before
anything else is measured.

## D. Observations O19-O23 (extend prior I4)

Every prior I4 binding rule applies, including the followups contract's rule that `tol` is a
reference: an observation whose `pass` or `fired` decision reads `tol`, directly or through a
helper, lists it among the references checked for `null`. "Title width" is as O17: the
`getBoundingClientRect().width` of the only descendant `span` of `pod-tab:<podId>` whose
`textContent` is exactly the Pod's title. "Painted line boxes" is as O10 amended A2 and O18:
`Range.getClientRects()` over the alert's direct text node, each intersected with the box of
every element from the text node's parent up to, not including, `pods-chrome` whose computed
`overflow-x` or `overflow-y` is not `visible`, keeping the non-empty ones.

| Obs | Row | State | Measurement → `pass` when | Control (injection) | Predicted |
|---|---|---|---|---|---|
| O19 | 8 | S5 | Reference: S5's free-space reference (no alert, mouse parked): every Pod tab's title width. Measurement, with the open-error alert shown and the mouse parked: the same widths. `pass` when every Pod tab present in both (6 expected) has a title width equal to its reference within `tol`, and every reference width exceeds `tol`. Also recorded: the tab count, each title's `scrollWidth` and `clientWidth`, `podBarWidthReference`, `podBarWidthAlertShown`, the alert element's width, the panel max-content width and the `pods-chrome` `clientWidth`. | With the alert shown, inline `max-width` on `[data-testid="pod-bar"]` equal to half its measured width. | At least 1 Pod tab title is narrower than its reference by more than `tol`. |
| O20 | 8 | S5 | The open-error alert's painted line boxes. `pass` when at least 1 painted line box is non-empty and every one lies within the `pods-chrome` box, each edge within `tol`. Also recorded: raw and painted line-box counts and extents, the clipping ancestors, the chrome box. | Inline `position: relative; top: <H>px` on the alert's chrome child, `H` the `pods-chrome` box height. | At least 1 non-empty painted line box lies outside the `pods-chrome` box by more than `tol`. |
| O21 | 7 | S6 | Reference: S6's overflow reference (no alert, mouse parked). Measurement, with the fork-error alert shown and the mouse parked: the alert row's width (the alert's parent element), the row's min-content width (inline `flex: none; width: min-content` on the row, read, cleared, undo verified), and the fork alert's painted line boxes. **`pass` rule (decided at Gate 2, D1):** `pass` when the row's width is at most its min-content width plus `tol`, and at least 1 painted line box is non-empty. Recorded unscored: `podBarWidthReference`, `podBarWidthAlertShown` and their difference (the check `.sir/backlog.md:35` names), every Pod tab's reference and alert-shown title width, the tab count, the Pods added, the panel max-content width and the `pods-chrome` `clientWidth`. | Inline `flex: 0 0 <2m>px` on the alert row, `m` the row's measured min-content width. | The row's width exceeds `m` by more than `tol`. |
| O22 | 8 | S7 | As O19, with S7's reference and the pods-error alert. 5 Pod tabs expected. Also recorded: the reorder alert's text and width at the reference and at the measurement. | As O19. | As O19. |
| O23 | 8 | S7 | As O20, over the pods-error alert. | As O20, on the pods-error alert's chrome child. | As O20. |

Ordering guarantees the driver keeps: each state's reference is taken before the action that
shows its alert; every control is undone and the undo verified before the next observation
(prior I4); O19 and O20 run in S5, O21 in S6, O22 and O23 in S7.

## E. Base verdicts and the measure-first gate

The base run measures the tree at T1's tip, which carries no production change. Its
verdicts for O19-O23 are the only evidence that gates a production change.

| Obs | Gates | Session prediction for the base run (written at Gate 2, before any run) | Grounds |
|---|---|---|---|
| O19 | T2's open-error criteria | `defect` | `.listError` (`PodsChrome.module.css:18-24`) sets no `flex`, so the open-error paragraph keeps a `0 1 auto` basis of its whole one-line message, about 150 characters at `--oc-text-xs` 11px (`src/renderer/src/styles/tokens.css:151`); with 6 tabs the two bases exceed the row, both items shrink in proportion to their bases, and the panel falls below its content basis. |
| O20 | nothing | `pass` or `defect`, low confidence | Depends on whether the shrunk, unclamped paragraph wraps to 2 or to 3 line boxes. |
| O21 | escalation only (no task changes the fork-error CSS) | `pass` | `.dismissible` is `flex: 1 1 0` (`PodsChrome.module.css:41`) with no `min-width`, so under negative free space its zero basis takes no share of the shrink and its automatic minimum, its min-content width, is what it keeps; the panel (`:15`, `1 1 auto`) absorbs the rest. |
| O22 | T2's pods-error criteria | `defect` | As O19, with M7, longer than the S4 alert text it contains. |
| O23 | nothing | `pass` or `defect`, low confidence | As O20. |

Gate rule, applied by the orchestrator between T1's commit and T2's dispatch:
- T2 is dispatched with its open-error criteria only if O19 is `defect` with `control.fired`
  true in `H/driven-report-chrome-alert-squeeze-base.json`, and with its pods-error criteria
  only if O22 is. A gating observation that is `pass` removes that alert's criteria from T2 by
  amendment; if both are `pass`, T2 is not dispatched and its criteria leave the session by
  amendment.
- O21 `defect` is an escalation: no task in this session changes the fork-error row.
- Any O19-O23 `instrument-invalid` or `not-run` is T1 unmet, not a verdict.
