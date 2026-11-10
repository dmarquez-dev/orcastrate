<!-- frozen: 20261109-2239-fork-ui-followups, Gate 2 -->

# Contract: the fork-error row's DOM hooks, and the amended fork UI driver

Markdown, because none of these interfaces has a language form: DOM hooks a Playwright
driver reads, a CLI, and its output files. Declarations only.

Abbreviations: `H` = `.dir-sdlc/handruns/2026-09-30-electron-handrun` (relative to the
worktree root). "The prior contract" = the frozen contract `fork-ui-driver.md` of session
`20261109-1642-fork-ui-human-checks`. "One device pixel" / `tol` = `1 / devicePixelRatio`
CSS px, read in the window.

**Supersession.** This contract supersedes the prior contract's clauses for: I1's `--slug`
values and the exit-code table's observation range; I2's `meta` shape, `observations[].id`
and `backlogRow` ranges, and the findings file list; I4's rows O10 (line set, amended A2 by
E4), O11, O14 (prediction wording) and O16 (control); and it adds rows O17 and O18. Every
other clause of the prior contract (I1 preconditions and reuse rules, I2 verdict rule and
table format, I3 states and routes, I4 binding rules and rows O1-O9, O12, O13, O15) applies
unchanged to the amended driver.
Prior I5 (the defect-handling rule between that session's tasks) does not apply here.

| Section | Implementer | Consumer |
|---|---|---|
| A. Fork-error row DOM hooks | T1 (keeps them) | T2 (the driver reads them) |
| B. Driver invocation and outputs (amended I1, I2) | T2 | none among tasks; read by the orchestrator at Gate 3 |
| C. Observations (amended and new I4 rows) | T2 | none among tasks; read by the orchestrator at Gate 3 |

---

## A. DOM hooks the driver reads (T1 must keep every one)

At base `74e79ff` each hook below exists; T1's fix must not remove or rename any of them.

| Hook | Declared at base | Guarantee T2 relies on |
|---|---|---|
| `[data-testid="pods-chrome"]` | `src/renderer/src/pods/PodsChrome.tsx:17`, `:265` | Exactly one; it is the Pod-bar row's container and the box O18 measures against. Remains `tabIndex={-1}` (O16). |
| `[data-testid="pod-bar"]` | `src/renderer/src/contracts/renderer-view.ts:371` (`podBar: 'pod-bar'`), rendered `PodBar.tsx:92` | Exactly one; a descendant of `pods-chrome`; holds every Pod tab. O17's control writes an inline `max-width` on it. |
| `[data-testid="pod-tab:<podId>"]` | `renderer-view.ts:373`, `PodTab.tsx:238` | One per Pod. |
| Pod tab title element | `PodTab.tsx:280` (`<span className={styles.title}>{pod.title}</span>`) | The **only** descendant `span` of `pod-tab:<podId>` whose `textContent` is exactly the Pod's title. |
| Fork-error alert | `PodsChrome.tsx:291-293` | An element with `role="alert"` whose `textContent` is exactly main's message (which starts `forkSession failed for pod `), carried as a **direct text-node child** of that element (O10, O11, O18 build a `Range` over it). At most one fork-error alert is mounted at a time. |
| Dismiss control | `PodsChrome.tsx:294-301` | `button[aria-label="Dismiss fork error"]`, a **sibling** of the alert, never inside it; the alert and the button share one parent element (the "alert row"). |

Error case: a hook missing at measurement time leaves the reading reference `null`, and the
observation is `instrument-invalid` (prior contract I4, binding rule 2). It is never a `defect`.

## B. Invocation and outputs (amends prior I1 and I2)

```
node H/driver/run-fork-ui.mjs [--slug <slug>] [--sandbox-root <absolute path>] [--keep-sandbox]
```

| Parameter | Type | Default | Meaning |
|---|---|---|---|
| `--slug` | `fork-ui` \| `fork-ui-recheck` \| `fork-ui-followups` | `fork-ui` | As prior I1. Any other value: exit 2, nothing written. |
| `--sandbox-root` | absolute Windows path | `C:\oc-sandbox-<slug>` | As prior I1. |
| `--keep-sandbox` | flag | absent | As prior I1. |

Exit codes: as prior I1, with "O1-O16" read as "O1-O18".

Outputs: as prior I2, plus the findings file `H/FINDINGS-FORK-UI-FOLLOWUPS.md` for slug
`fork-ui-followups`, written by T2's agent by hand from the JSON. That file carries the prior
I2 verdict table header exactly, one row per observation O1-O18 in order, and the same
no-raw-`|` rule: a value containing `|` is written into the JSON only and the cell says
`see JSON`; no escape sequence is defined, so none can occur.

`driven-report-<slug>.json` shape, superseding prior I2's `meta` and `observations` element
types (`states` unchanged):

```
meta: {
  slug: string,
  generatedAt: string,
  driverSha256: string,
  mainBundleSha256: string,
  electron: string, playwright: string,
  devicePixelRatio: number,
  viewport: { width: number, height: number },
  sandboxRoot: string,
  mainEnv: { USERPROFILE: string, userData: string, CLAUDE_CONFIG_DIR: string | null },
  realSettingsSha256: { before: string | 'absent', after: string | 'absent' },
  exitCode: 0 | 1 | 2,
  sandboxRemoved: boolean,       // true iff the sandboxRoot directory does not exist when the report is written
  precondition: string | null    // null unless a precondition failed; then its message, and exitCode is 2
}
observations: Array<{
  id: 'O1' | ... | 'O18',
  backlogRow: 1 | 2 | 3 | 4 | 5 | 6,   // 1-5 as prior I2; 6 = Pod tab titles while the fork-error alert is shown
  verdict, measured, control, reason   // as prior I2
}>
```

`meta` carries exactly the fourteen keys above, no more.

## C. Observations (amends prior I4)

Every prior I4 binding rule applies, including: every reference a verdict or a control
decision reads starts as `null`, and a reference still `null` at its comparison makes the
observation `instrument-invalid`. **`tol` is such a reference**: an observation whose `pass`
or `fired` decision reads `tol`, directly or through a helper it passes `tol` to, lists it
among the references checked for `null`.

| Obs | Row | State | Measurement → `pass` when | Control (injection) | Predicted |
|---|---|---|---|---|---|
| O10 | 4 | S4 | Amended A2 (E4): the line boxes are the **painted** line boxes, those of the alert's direct text node (`Range.getClientRects()`) each intersected with every clipping ancestor as in O18, keeping the non-empty ones, so lines hidden by the clamp are not counted. `pass` when the number of painted line boxes whose vertical extent contains the `Dismiss fork error` button's vertical centre is at least 1. Also recorded: the raw and painted line-box counts, and whether the button lies to the right of that line's right edge. | Unchanged from prior I4: inline `flex-direction: column` on the button's parent. | 0 painted line boxes contain the centre. |
| O11 | 4 | S4 | Unchanged from prior I4: the absolute value of (button centre Y − centre Y of the line box from O10 that contains it) is at most `tol`. The signed difference (button centre − line centre) is recorded. | Inline `position: relative; top: <h>px` on the dismiss button, where `h` is the button's measured height. The line is the one at the **same index** as O10's containing line, re-measured under the control. | (signed difference under the control) − (signed difference without it) equals `h` within `tol`, and the absolute difference under the control exceeds `tol`. |
| O14 | 5 | S4 | Unchanged from prior I4. | Unchanged from prior I4. | `outline-style` is `none`; and the painted-ring decision ("the two captures differ") applied to two successive captures of the same clip, both taken under the control, reports not painted (the two are byte-identical). Supersedes the prior wording "the clip is byte-identical to the control capture". |
| O16 | 5 | S4 | Unchanged from prior I4. | A further failed fork of P4, dismissed by mouse click on **the dismiss button in the alert row of the alert that fork produced** (identified in the window, not by the first match of a selector). The number of fork-error alerts and of dismiss buttons in the DOM immediately before the click is recorded in `control.observed`. | Chrome focused; `:focus-visible` false; the clicked alert is absent afterwards. |
| O17 | 6 | S4 | Reference, taken after O9 and before P4's Fork click (five Pod tabs, no alert): the `getBoundingClientRect().width` of each Pod tab's title element (section A). Measurement, with the S4 alert shown and the mouse parked: the same widths. `pass` when every Pod tab present in both (five expected) has a title width equal to its reference within `tol`, and every reference width exceeds `tol`. Also recorded: the tab count, each title's `scrollWidth` and `clientWidth`, and the `pod-bar` width in both. | With the alert shown, inline `max-width` on `[data-testid="pod-bar"]` equal to half its measured width. | At least 1 of the Pod tabs' title widths is narrower than its reference by more than `tol`. |
| O18 | 6 | S4 | The alert text's line boxes (`Range.getClientRects()` over the alert's direct text node), each intersected with the box of every element from the text node's parent up to, **not including**, `pods-chrome` whose computed `overflow-x` or `overflow-y` is not `visible`. `pass` when every intersected line box that is non-empty lies within the `pods-chrome` box, each edge within `tol`. Also recorded: the raw and intersected line-box counts, and the chrome's box. | Inline `position: relative; top: <H>px` on the alert row (the alert's parent element), where `H` is the `pods-chrome` box height. | At least 1 non-empty intersected line box lies outside the `pods-chrome` box by more than `tol`. |

Ordering guarantees the driver keeps: O17's reference is taken before S4's click; O17 and
O18 run after S4 is reached and before O10; every control is undone and the undo verified
before the next observation (prior I4).
