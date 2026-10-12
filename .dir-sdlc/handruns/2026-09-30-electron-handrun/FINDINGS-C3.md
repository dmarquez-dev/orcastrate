# C3 verification hand-run — 2026-10-12

Sub-session C3 shipped two theme tokens, nineteen converted call sites and an
accessibility attribute rename, all confirmed by grep, by a two-sided hygiene census and
by a green 2240-test suite — **and none of it had ever been rendered.** This run renders
it, against the real built Electron app.

**32 of 32 checks passed. 0 step errors. No defect found.**

Driver: `driver/run-c3.mjs`. Report: `driven-report.md` / `.json`. Screenshots:
`screenshots/c3/`. Same sandbox as the 2026-10-07 run — `C:\oc-sandbox`, with
`USERPROFILE`/`APPDATA`/`LOCALAPPDATA`/`TEMP` redirected — so the real `~/.claude` was
never touched.

## What was actually proved, and how

Three of these checks are ones no unit test in this repo can make.

### 1. The scrims composite — all four of them

A `color-mix()` with alpha in `getComputedStyle` proves the *declaration*, not the
pixels. The discriminator used here is decoder-free and behavioural: with a dialog open,
screenshot two equal-sized regions of scrim that have **different content behind them**.
An opaque scrim paints both as one flat colour, so the two PNGs come back
**byte-identical**. A translucent one lets the differing content through, so they differ.

| Scrim | Computed background | Regions differ |
|---|---|---|
| `NewPodDialog` | `color(srgb 0.078 0.086 0.102 / 0.7)` | yes — 128B vs 116B |
| `DeletePodDialog` | same | yes — 142B vs 126B |
| Helm `.confirmScrim` | same | yes — 385B vs 116B |
| `BeachcomberPreviewDialog` | same | yes — 409B vs 116B |

All four resolve to alpha **0.7**, strictly between 0 and 1, derived from `--oc-bg-app`
through `color-mix` with no colour literal — which is the objection the stylesheets had
recorded for choosing opacity in the first place.

**The instrument was validated, twice.** Forcing the scrim opaque in-page and re-probing
the *same two regions* collapses them to byte-identical. So the probe demonstrably
distinguishes opaque from translucent, and the four results above mean what they say.
This control runs at step C3-3, on the first dialog that opens, deliberately — see
*Harness defects* below.

**Visually confirmed, not just asserted.** In `02-newpod-dialog-veiled.png` the `+`
button and the Beachcomber/Helm strip read through the scrim; in the forced-opaque
control `02b-control-forced-opaque.png` they are **gone**. The same A/B at
`05-helm-close-confirm-veiled.png` shows the entire Helm panel — settings path,
permission rules, environment variables — legible behind the confirmation. That is the
exact defect the backlog filed, fixed.

### 2. The renamed attribute still *paints*

`aria-pressed` → `aria-current` touched the component **and** the stylesheet's
`.button[aria-current='true']` selector. Had only the component changed, every renderer
test would still have passed while the open panel silently lost its highlight — jsdom
computes no styles, so nothing in the suite could see it.

Measured in the window: exactly one button reports `aria-current="true"` (helm), **no
button carries `aria-pressed` at all**, and the open button renders
`rgb(51, 58, 71)` against the closed button's `rgba(0, 0, 0, 0)`. The paint survived the
rename. Visible in `04-panelbar-aria-current.png` and again behind the Helm confirmation.

### 3. The semibold token resolves

`--oc-weight-semibold` resolves to `600` on `:root`, and the pre-existing ramp is
untouched at `400`/`700` — the additions-only claim, checked in the running app rather
than in the diff. A token that failed to resolve would compute to the inherited weight,
which is observable; none did. The distinct computed font-weights across the whole live
DOM were **400, 500, 600** — every one on the token ramp, with nothing off it.

## What this run did NOT prove

Stated plainly, because a run that reports only its passes is the instrument problem in
another form.

- **Only 3 of the 10 converted `font-weight` sites were rendered.** The three `.heading`
  declarations (EmptyWorkspace, NewPodDialog, DeletePodDialog) were each measured at
  `600`. The other seven were **not on screen** and are not covered: `.railHeading` and
  `.agentType` (`LaneRail`), `.subject` (`DeletePodDialog` — the element is absent for a
  Pod with no session), `.bypassWarning` (`NewPodDialog` — needs bypass permission mode),
  and `.paneTitle`, `.dispatchCount`, `.dispatchAgentType` (`Transcript` — all need a
  live Pod with transcript and dispatch content, which needs a real `claude` process).
- **The five zero-pixel conversions were not visually differenced.** `400`→
  `--oc-weight-regular` and `700`→`--oc-weight-bold` are asserted to be unchanged in
  value by the token definitions, not by a before/after image comparison.
- **No before/after of the shipped build.** The opaque comparison is a forced in-page
  override, not the pre-C3 bundle. It proves the probe works and that the shipped scrim
  is not opaque; it is not a regression diff against `41f274e`.
- **Nothing here re-checked the 2026-10-07 findings.** This run is scoped to C3.

## Harness defects found and fixed during this run

All three failures in the first pass were the harness, not the app. Recorded because the
first pass would have reported `20/23` and invited the reading that C3 was defective.

1. **The positive control was last, and a modal scrim swallowed it.** Step C3-6 clicked
   *Keep editing*, which correctly preserves the dirty draft **and** the open panel — so
   the close guard re-fired on every later panel switch, and its own full-window scrim
   blocked the clicks in C3-7 and C3-8. That is right app behaviour catching a wrong test.
   The fix was to discard the draft, and to **move the instrument validation to the first
   dialog that opens** so it can never again be hostage to a later step. A control that
   runs last is a control that an earlier failure can delete.
2. **`createPod` was given a session-records directory as its cwd.** It validates the
   path, so `…\.claude\projects\oc-test-recorded` failed `CWD_MISSING`.
   `…\repos\plain-repo` is a real working directory.
3. **`createPod` through the preload bridge does not notify the renderer.** The Pod
   lands in the sqlite store but the pod bar never learns about it, so no tab appeared.
   A `win.reload()` re-fetches the list. The 2026-10-07 run never hit this because
   Beachcomber's Pod blocking reads `listPods()` in the **main** process.
4. Two test ids were guessed wrong — the new-Pod control is `new-pod-button`, and the
   Beachcomber preview is one toolbar button (`beachcomber-preview-button`, `disabled`
   until a row is selected), not a per-row control. `NewPodDialog`'s Cancel carries no
   test id at all; Escape is the handle.

## One observation, not a finding

`BeachcomberPreviewDialog` is the dialog that authorises a deletion, and it is now the
one where the user can read the panel behind it while deciding. That is a safety
improvement the backlog item did not claim and nobody scoped — worth noting because the
item was filed as cosmetic.
