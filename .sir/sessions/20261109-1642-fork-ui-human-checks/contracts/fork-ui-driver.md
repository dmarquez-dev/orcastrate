<!-- frozen: 20261109-1642-fork-ui-human-checks, Gate 2 -->

# Contract: the fork UI driver, its outputs, and the defect rule

Markdown, because none of these interfaces has a language form: a CLI, two output files,
and a rule that decides which task acts on a finding. Declarations only.

Abbreviations: `H` = `.dir-sdlc/handruns/2026-09-30-electron-handrun` (relative to the
worktree root). `<slug>` = the run slug (see I1).

Implementer of everything here: **T1**. Consumers: **T2** (I2's findings table, I5) and **T3** (I1, I2, I3, I4, I5).

---

## I1. Invocation

```
node H/driver/run-fork-ui.mjs [--slug <slug>] [--sandbox-root <absolute path>] [--keep-sandbox]
```

| Parameter | Type | Default | Meaning |
|---|---|---|---|
| `--slug` | `fork-ui` \| `fork-ui-recheck` | `fork-ui` | Names every output (I2) and the default sandbox root. Any other value: exit 2, nothing written. |
| `--sandbox-root` | absolute Windows path | `C:\oc-sandbox-<slug>` | Passed to `buildSandbox` from `H/driver/sandbox.mjs`. Short by default for the MAX_PATH reason recorded at `smoke.mjs:30-32`. |
| `--keep-sandbox` | flag | absent | Absent: the driver removes the sandbox root after the app has closed. |

Preconditions (the driver checks each and exits 2 when one fails, writing the report):
- `npm run build` has run in this worktree, so `<repoRoot>/out/main/index.js` exists.
  `repoRoot` is the one `H/driver/lib.mjs:8` resolves relative to the driver file.
- The launch environment is `buildSandbox(root).env` **with `CLAUDE_CONFIG_DIR` and
  `CLAUDE_CODE_PROJECT_DIR_NAME` deleted**. The SDK reads both when it resolves the
  projects directory, and either one inherited from the caller's shell would point
  `forkSession` at a real home.

Reuse: `sandbox.mjs` is imported, never copied. `lib.mjs`'s `launch`, `step`, `check`,
`note`, `stepError`, `results` and `repoRoot` may be imported. `lib.mjs`'s `shot()` and
`writeReport()` must not be called, because they write to `H/screenshots/` and
`H/driven-report.*`, which belong to earlier runs. No file under `H/` other than I2's own
outputs is written.

Exit codes:

| Code | Meaning |
|---|---|
| 0 | Every observation O1–O16 is `pass` and every control fired as predicted. |
| 1 | At least one observation is `defect`, and none is `not-run` or `instrument-invalid`. |
| 2 | A precondition failed, or at least one observation is `not-run` or `instrument-invalid`. |

## I2. Outputs (all written by the driver except the findings file)

| Path | Written by |
|---|---|
| `H/driven-report-<slug>.json` | driver |
| `H/driven-report-<slug>.md` | driver |
| `H/screenshots/<slug>/*.png` | driver |
| `H/FINDINGS-FORK-UI.md` (slug `fork-ui`) / `H/FINDINGS-FORK-UI-RECHECK.md` (slug `fork-ui-recheck`) | the task's agent, by hand, from the JSON |

`driven-report-<slug>.json` shape:

```
{
  meta: {
    slug: string,
    generatedAt: string,                 // ISO, read from the clock at write time
    driverSha256: string,                // sha256 of run-fork-ui.mjs as it ran
    mainBundleSha256: string,            // sha256 of out/main/index.js as launched
    electron: string, playwright: string,
    devicePixelRatio: number,            // read in the window
    viewport: { width: number, height: number },
    sandboxRoot: string,
    mainEnv: { USERPROFILE: string, userData: string, CLAUDE_CONFIG_DIR: string | null },
    realSettingsSha256: { before: string | 'absent', after: string | 'absent' },
    exitCode: 0 | 1 | 2
  },
  states: Array<{ id: 'S1'|'S2'|'S3'|'S4', route: string, reached: boolean, evidence: string }>,
  observations: Array<{
    id: 'O1' | ... | 'O16',
    backlogRow: 1 | 2 | 3 | 4 | 5,       // the check number in discussion.md's Context list
    verdict: 'pass' | 'defect' | 'not-run' | 'instrument-invalid',
    measured: Record<string, number | string | boolean | null>,
    control: { injection: string, predicted: string, observed: string, fired: boolean },
    reason: string | null                // required when verdict is not-run or instrument-invalid
  }>
}
```

Verdict rule: an observation whose control did not fire as predicted is
`instrument-invalid`, whatever its own measurement says. `defect` therefore always means
"the check failed, and the same instrument was shown able to fail."

`FINDINGS-FORK-UI*.md` carries one markdown verdict table, header exactly:

```
| Obs | Backlog row | Verdict | Measured | Control | Predicted | Observed |
```

One row per observation, O1–O16, in order. **A raw `|` cannot occur in any cell**: a value
containing one is written into the JSON only, and the cell says `see JSON`. No escape
sequence is defined. Below the table, the findings file states the exit code, the
`devicePixelRatio` and viewport, the route used for each state, and, for each backlog row
1–5, whether every observation mapped to it is `pass`. No path under `.sir/` appears in the
findings file or the driver.

## I3. States and how they are reached

All four states are reached in one launch. Pods are created through
`window.orcastrate.pods.create(...)`, which spawns nothing (`pod-manager.ts:401-406`). A
created Pod reaches the bar after `win.reload()`, which re-lists (precedent:
`H/driver/run-c3.mjs:317-322`). Every Pod's cwd is the sandbox's `plainRepo`.

| State | Pod | Route | Reached when |
|---|---|---|---|
| S1 no session | P1 | `pods.create`, then reload. Born `'closed'` with `ccSessionId` null. | P1's fork control has `data-eligibility="no-session"` (`PodTab.tsx:357`). |
| S2 running | P2 | `pods.create`, reload, then from **main**: `webContents.send('push:podStatus', { podId, status: 'running' })` to the app window. The renderer applies it (`state/store.ts:378`). Sent after the last reload, because a reload re-lists from the store and drops it. | P2's fork control has `data-eligibility="mid-turn"` and its run control has `data-verb="stop"` (`PodTab.tsx:331`). |
| S3 fork succeeded | P3, and its fork | Sandbox fixture: `<sandbox>/home/.claude/projects/<encodeCwdForProjects(plainRepo)>/<U3>.jsonl`, where `U3` is a fresh UUID, holding at least one non-sidechain `type: "user"` record with a string `uuid`. That is the minimum the SDK's `forkSession` copies (`@anthropic-ai/claude-agent-sdk` 0.3.235; it throws "has no messages to fork" otherwise). `pods.create`, then write `cc_session_id = U3` on P3's row (see *Session-id write*), then reload, then click P3's Fork control. **No `claude` process is involved**: `defaultForkSession` calls the SDK's standalone `forkSession`, which copies the transcript file (`src/main/pod/fork-session.ts:10-12`). | `pods.list` holds a Pod whose `forkedFromPodId` is P3's id and whose `ccSessionId` is neither null nor `U3`; the fixture directory holds exactly one more `.jsonl` than before the click. |
| S4 fork failed | P4 | `pods.create`, write `cc_session_id = U4` (a fresh UUID with **no** transcript file anywhere), reload, click P4's Fork control. The SDK rejects with "Session … not found in project directory for …", which main wraps as `IO` (`pod-manager.ts:551-556`), and the renderer shows the message (`PodsChrome.tsx:104`). | An alert is rendered whose text starts with `forkSession failed for pod `, and `pods.list` has as many Pods as before the click. |

*Session-id write.* It stands in for the one production writer, `onSessionId`
(`pod-manager.ts:1314-1316`), which needs a live `claude`. `PodManager` re-reads the row on
every call (`#requirePod`, `pod-manager.ts:1547-1550`), so a row written while the app
runs is what `forkPod` sees. Route, in preference order. The driver records the route it
used in `states[].route`:
1. From **main**, through `app.evaluate`. Obtain a `require` anchored at the launched
   `out/main/index.js` (`process.getBuiltinModule('node:module').createRequire`, or
   `process.mainModule.require`). Open `join(app.getPath('userData'), 'orcastrate.db')`
   (`src/main/index.ts:119`) with the `better-sqlite3` main already loaded. Run
   `UPDATE pods SET cc_session_id = ? WHERE id = ?` (column at `src/main/store/schema.ts:568`)
   and assert that it changed 1 row.
2. Close the app, run the same `UPDATE` in a separate `electron` process started with
   `ELECTRON_RUN_AS_NODE=1` against the same file, and relaunch with the same sandbox.

A state is `reached: false` only after both routes were attempted, with each one's error
recorded in `evidence`. An observation whose state was not reached is `not-run`.

## I4. Observations, measurements, controls

Rules that bind every row:
- No pixel literal is an expectation. Lengths are compared with another measurement taken
  in the same window. The only tolerance is one device pixel, `1 / devicePixelRatio` CSS
  px, read in the window.
- Every reference to a measured element or value starts as `null`. A reference still
  `null` at its comparison makes the observation `instrument-invalid`, not `pass`.
- Controls are **in-window injections**: inline styles, an added `<style>` element, a
  substituted text node, or a different input key or pointer path. No source file is
  edited to run a control. Each control is undone before the next observation, and the
  undo is verified.
- A "tooltip" is the native `title` tooltip. Chromium draws it outside the page, so what is
  measured is the `title` the hovered element exposes. After `hover()`, take
  `document.elementFromPoint` at the element's box centre, then `closest('[title]')`, then
  its `title` (or `null`). This is the measurement discussion.md assigns to a real
  Chromium.
- Contrast is the WCAG 2.x relative-luminance ratio. The foreground is the computed
  `color` or `outline-color`. The background is the computed `background-color` of the
  nearest ancestor-or-self whose alpha is non-zero. Thresholds come from an external
  standard: 4.5 for text (WCAG 2.2 SC 1.4.3) and 3.0 for a focus indicator (SC 1.4.11).

| Obs | Row | State | Measurement → `pass` when | Control (injection) | Predicted |
|---|---|---|---|---|---|
| O1 | 1 | S1 | The `⑂` span (`[data-icon="fork"]` in P1's fork control) does not render as a missing glyph. Reference: the same span with its text replaced by U+0378 (an unassigned code point), captured at the same clip. `pass` when the fork capture differs from the reference **and** from the same span under `color: transparent` (ink present). Instrument check: U+0379 at the same clip is byte-identical to the U+0378 reference. If it is not, O1 is `instrument-invalid`. | Substitute U+0379 into the fork span and apply the same decision. | Decision reports "missing glyph". U+0379 is byte-identical to the reference. |
| O2 | 1 | S1 | Computed `font-size` and text-range height (`Range.getBoundingClientRect().height` over the span's text node) of the `⑂` span equal those of P1's `▶` span (`[data-icon="play"]`) and `×` span (`[data-icon="delete"]`): 2 of 2 pairs equal, to within one device pixel. The element box height is recorded, unscored: the shared `[data-icon]` rule fixes it, so it cannot respond to the control (amended A1, E2). | Set the fork span's inline `font-size` to twice its computed value. | 0 of 2 text-range height pairs equal. |
| O3 | 2 | S1 | P1's fork control's computed `opacity` is less than P1's run control's computed `opacity` (dimmed). | Same measurement on P3 before its fork (eligible). | Fork opacity equals run opacity, so not dimmed. |
| O4 | 2 | S1 | P1's fork control's computed `cursor` is `not-allowed`. | P3 before its fork. | `pointer`. |
| O5 | 2 | S1 | The hovered `title` on P1's fork control equals `FORK_REASON_NO_SESSION`, the text at `src/renderer/src/pods/fork-control.ts:25`. | P3 before its fork. | `null`. |
| O6 | 2 | S2 | O3's measurement on P2. | Same control as O3. | As O3. |
| O7 | 2 | S2 | O4's measurement on P2. | Same control as O4. | As O4. |
| O8 | 2 | S2 | The hovered `title` on P2's fork control equals `FORK_REASON_MID_TURN` (`fork-control.ts:28`). | P3 before its fork. | `null`. |
| O9 | 3 | S3 | The hovered `title` on the fork's tab (`[data-testid="pod-tab:<forkId>"]`) equals `Forked from ` followed by P3's title (`fork-control.ts:66`). | P3's own tab. | `null`. |
| O10 | 4 | S4 | Same line: of the line boxes of the alert's text node (`Range.getClientRects()`), the number whose vertical extent contains the `Dismiss fork error` button's vertical centre is at least 1. Also recorded: the line-box count, and whether the button lies to the right of that line's right edge. | Inline `flex-direction: column` on the button's parent. | 0 line boxes contain the centre. |
| O11 | 4 | S4 | Centred: \|button centre Y − centre Y of the containing line box from O10\| is at most one device pixel. | Inline `margin-top` on the button equal to its own measured height. | The difference equals half the button height, to within one device pixel, and so exceeds the tolerance. |
| O12 | 4 | S4 | Under `emulateMedia({ colorScheme: 'dark' })`, the contrast of the button's `color` against its background is at least 4.5. | Inline `color` on the button set to the measured background colour. | Ratio 1.00. |
| O13 | 4 | S4 | O12's measurement under `emulateMedia({ colorScheme: 'light' })`. Also recorded: whether the button's colour and background are identical to O12's. The renderer's stylesheets hold no `prefers-color-scheme` rule (`tokens.css:12-16`), so they are predicted identical. | Same control as O12. | Ratio 1.00. |
| O14 | 5 | S4 | Focus is moved to `Dismiss fork error` by `Tab` presses only (the count recorded, bounded by the number of tabbable elements). `pass` when the button matches `:focus-visible`, its computed `outline-style` is not `none`, its `outline-width` is greater than 0, its outline contrast is at least 3.0, **and** a clip around it differs from the same clip under the control (ring painted). | Add a `<style>` element: `[aria-label="Dismiss fork error"]{outline:none !important}`. | `outline-style` is `none`, and the clip is byte-identical to the control capture. Run the control after the measurement and remove it before O15. |
| O15 | 5 | S4 | After `Enter` on the focused button, the alert from S4 and the button are absent (count 0 each). | On a second failed fork of P4, press `Shift` (a non-activating key) on the focused button instead. | Alert count stays 1. |
| O16 | 5 | S4 | After O15's `Enter`, `document.activeElement` is `[data-testid="pods-chrome"]`, it matches `:focus-visible`, its `outline-style` is not `none`, its `outline-width` is greater than 0, and its outline contrast is at least 3.0. | Dismiss a further failed fork of P4 by **mouse click** instead of `Enter`. | The chrome is focused but does not match `:focus-visible` (`false`). |

## I5. Defect-handling rule (consumed by T2 and T3)

- T1 does not fix anything. Its run is the record, and `FINDINGS-FORK-UI.md` is what the
  later tasks read.
- **T2 acts only on `defect` verdicts.** For each one, T2 fixes the cause inside its own
  `owns`. A regression test comes with the fix, in this order of preference:
  1. a jsdom component test (attribute, DOM, focus behaviour);
  2. a stylesheet-text test in the node environment, after `PodsChrome.styles.test.ts`;
  3. neither, when no jsdom or text assertion can express the defect (glyph rendering, for
     example). T2's report then says so, per observation.

  Each regression test is shown able to fail, either by a red step or by an injection at a
  named `file:line`.
- **T2 escalates instead of fixing** when the fix needs a file outside its `owns`, a new or
  changed token in `src/renderer/src/styles/tokens.css`, or a product decision. Adding a
  light theme is a product decision.
- `not-run` and `instrument-invalid` are not defects. T2 does nothing about them, and they
  reach Gate 3 as rows that stay in the backlog with their `reason`.
- No `defect` verdict: T2 writes no file. No file changed by T2: T3 does not re-run the
  driver and writes no file.
- **T3's re-run** uses the T1 driver unchanged, with `--slug fork-ui-recheck`. Each
  observation T2's report names as fixed must now be `pass`, with its control firing as
  predicted. An observation T2 escalated instead of fixing is recorded as it stands.
