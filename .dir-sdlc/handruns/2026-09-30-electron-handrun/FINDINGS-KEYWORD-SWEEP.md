# Keyword hairline sweep verification hand-run — 2026-10-20

This session replaced the bare CSS width keyword `thin` with
`var(--oc-border-hairline)` in **six border declarations** across
`composer/Composer.module.css` and `permissions/PermissionCards.module.css`, and widened
the repo-wide and scoped hygiene rules to flag the keyword forms. This run renders those
six against the real built Electron app — and closes the **enumeration defect** that the
previous run's own coverage table exposed.

**70 of 70 checks passed. 0 step errors. Driver exit 0. No application defect found.**

**All six converted declarations were measured on screen.** The previous run measured 21
of its 39 sites; this one reached every site it enumerated, including the three permission
card declarations its own pre-written reach note expected to be out of range.

Driver: `driver/run-keyword-sweep.mjs`. Report: `driven-report-keyword-sweep.md` / `.json`.
Screenshots: `screenshots/keyword-sweep/`. Sandbox: **`C:\oc-sandbox-keyword-sweep`**, a
root of its own so this run neither races nor clobbers the earlier ones, with
`USERPROFILE`/`APPDATA`/`LOCALAPPDATA`/`TEMP` redirected by `driver/sandbox.mjs`. The real
`~/.claude/settings.json` was hashed before the run and after it and is **byte-identical**
(KS-8), and no backup appeared beside it.

## Why this run ships its own driver

`driver/run-token-sweep.mjs` is **left byte-identical** and is named nowhere in this task's
diff. That was a Gate 2 decision the user upheld: each session in this directory ships its
own driver, and a completed driver is the record of its own run — editing it would silently
restate what that run observed. The enumeration property is held by the new driver, and
`FINDINGS-TOKEN-SWEEP.md` carries a dated correction pointing here.

## The build under test, and why that is a check rather than an assumption

`driver/lib.mjs:8` resolves `repoRoot` four levels up **from the driver file**, so a copy
run from another checkout would launch that checkout's build and confirm nothing.

- `npm run build` was run in the session worktree
  `C:\Users\dmarq\Development\Repos\orcastrate\.claude-worktrees\2026-10-16-orcastrate-keyword-hairline-sweep`
  and **exited 0**, including `typecheck:node` and `typecheck:web`, which run ahead of the
  bundle.
- `repoRoot` as resolved at run time is that worktree (printed by the driver at KS-0).
- The bundle is `out/renderer/assets/index-B8ruB0_i.css`. The token sweep measured
  `index-0uCezQ_O.css`; a different Vite content hash is what a renderer-CSS change
  produces, and the six conversions are that change.
- KS-0 reads all six rules **out of that bundle by their CSS Modules class token** and
  checks each names `var(--oc-border-hairline)` and no longer declares a bare width
  keyword in its own rule body.

Attribution is by **per-file hash**, never by class name: in this bundle `input` occurs
under four file hashes and `action` under two, so a name-keyed sweep would misattribute
measurements between stylesheets. Each stylesheet's hash is resolved from a signature of
classes that co-occur only in that file, and ambiguity fails the run loudly.

## 1. The enumeration defect, closed as a property

`run-token-sweep.mjs` keys its site map by **class name**: one class per declaration. A
declaration under a comma-grouped selector has more than one, so the others were never
probed and the declaration was reported `not reached` while it was on screen.
`transcript/Transcript.module.css` is the instance — selector group at `:45-46`
(`.filterToggle, .unpin`), hairline declaration at `:51` — and both the token sweep and its
merged-`main` re-run reported it unreached.

This driver keys every site by the **declaration** (`<stylesheet>:<line>`) and carries
`selectors`, every class in that declaration's group. A declaration counts as reached when
**any** of them renders. The shape is identical for a one-selector declaration and a
grouped one; no entry names an extra class for the one known instance.

### It is measured, and the report says through which selector

| | |
|---|---|
| Declaration | `src/renderer/src/transcript/Transcript.module.css:51` |
| Selector group | `.filterToggle, .unpin` (stylesheet rule opens at `:46`) |
| Status | **MEASURED** |
| Resolved through | **`.filterToggle`** — not `.unpin`, which is the one a class-keyed map held |
| Element | `<button>` reading `Show system events`, layout rect 115.1 x 25.6 |
| Measured widths | `top=0.8px right=0.8px bottom=0.8px left=0.8px` |
| Reference measured in the same window | `0.8px` — **equal on all four sides** |

Visible top-right of `02-active-pod-composer-and-transcript.png` and
`04-permission-card.png`.

### The map is not trusted either

A hand-written selector group can go stale exactly as a class-keyed map did. KS-2 therefore
reads each stylesheet **on disk**, finds the rule block that physically contains the
declared line, extracts that rule's own selector list, and fails if it disagrees with the
driver. All 7 groups agreed. It also checks each line really is a `var(--oc-border-hairline)`
declaration, and that the stylesheet contains no at-rule that could nest a declaration out
of that parse.

**The validator was shown able to reject.** The same validator was offered
`{filterToggle}` alone — precisely what a one-class-per-declaration map can hold — against
the stylesheet's `{filterToggle, unpin}`, and rejected it.

### The enumeration was shown able to report `not reached`

A reachability instrument never seen reporting unreachable has not been shown to
discriminate. So the grouped declaration's selector list was replaced with two class names
present nowhere in the bundle (`ocNoSuchSelectorAlpha`, `ocNoSuchSelectorBeta` — `grep -c`
over the built CSS returns 0 for both, exit 1, while the same `grep -c` returns 3 for
`filterToggle`, exit 0, so the instrument that established their absence was itself
controlled), and the driver was re-run.

| Run | That site's verdict | Checks | Driver exit |
|---|---|---|---|
| shipped selector list | **measured**, via `.filterToggle` | 70/70 | 0 |
| selector list replaced with names absent from the bundle | **`not reached`** | 65/70 | 1 |
| list restored | **measured**, via `.filterToggle` | 70/70 | 0 |

The injected run failed in two independent places — the reachability verdict flipped to
`not reached`, and KS-2's group validator separately rejected the map. The other six sites
were unaffected, so the discrimination is specific to the site injected rather than a
blanket failure. The driver file was restored and verified **byte-identical by sha256**
against a copy taken before the injection.

## 2. The measurement protocol: equalities, never literals

**No pixel literal is an expectation anywhere in this run, or anywhere in this document.**
Every converted border is compared against the used width of a synthetic element
**declaring** `1px`, measured live in the same window. The `Npx` strings inside the
driver's reference probe are declared *inputs* whose computed values are read.

### Measured fresh in this run's own window

`thin` and the declared `1px` were measured **side by side**: both synthetic elements were
alive in the document at the same moment and read in the same pass, which the run asserts
(`bothAliveTogether=true`). Nothing is carried over from the earlier runs — those were
different windows.

| Declared | Used width measured in this window |
|---|---|
| `border-width: thin` | `0.8px` |
| `border-width: 1px` | `0.8px` |
| `border-width: var(--oc-border-hairline)` | `0.8px` |
| `border-width: medium` | `2.4px` |
| `border-width: thick` | `4.8px` |
| `border-width: 1px` … `5px` (ladder) | `0.8px`, `1.6px`, `2.4px`, `4px`, `4.8px` |

`devicePixelRatio` reported by this window: **`1.0000000149011612`**.

A declared `1px` does not compute to the string `1px` here. Chromium snaps used border
widths to whole **device** pixels, and every rung of the ladder above equals
`floor(declared x 1.25) / 1.25`. That arithmetic is consistent with a 1.25 device scale
even though the window reports a `devicePixelRatio` of ~1 — a discrepancy this run records
rather than explains. The run also checks the probe distinguishes the three keywords at
all (`0.8px < 2.4px < 4.8px`), so a probe that returned one constant would not have passed.

### The probe was shown able to report something else

`--oc-border-hairline` was overridden in-page to a value that is not a length, which makes
the whole shorthand invalid at computed-value time:

| State of `--oc-border-hairline` | `.composer` `border-top-width` | `border-top-style` |
|---|---|---|
| shipped | `0.8px` (equal to the reference) | `solid` |
| overridden to `not-a-length` | `0px` (not equal to the reference) | `none` |
| override removed | `0.8px` (equal to the reference) | `solid` |

A unit test cannot tell `var(--oc-border-hairline)` from a literal, and a token that
*failed* to resolve would not throw — it would silently paint a different width. That is
what makes the equalities below mean something. Visible in `03-control-token-broken.png`.

## 3. Coverage — every enumerated declaration, measured

One row per **declaration**, not per class. Nothing is reported as verified unless it was
measured with a non-zero layout rect: `getComputedStyle` answers for a `display:none`
element too.

| Declaration | Selector group | Sides | Status | Resolved via | Measured | Equals the reference |
|---|---|---|---|---|---|---|
| `composer/Composer.module.css:15` | `.composer` | top | measured | `.composer` | `top=0.8px` | yes |
| `composer/Composer.module.css:44` | `.input` | all | measured | `.input` | all four `0.8px` | yes |
| `composer/Composer.module.css:70` | `.send` | all | measured | `.send` | all four `0.8px` | yes |
| `permissions/PermissionCards.module.css:27` | `.card` | all | measured | `.card` | all four `0.8px` | yes |
| `permissions/PermissionCards.module.css:85` | `.reason` | all | measured | `.reason` | all four `0.8px` | yes |
| `permissions/PermissionCards.module.css:100` | `.action` | all | measured | `.action` | all four `0.8px` | yes |
| `transcript/Transcript.module.css:51` | `.filterToggle, .unpin` | all | measured | `.filterToggle` | all four `0.8px` | yes |

The first six are the frozen contract's `KEYWORD_WIDTH_SITES`; the seventh is the
grouped-selector declaration this driver's enumeration fix was written for and is **not**
one of the six. Elements: `<section>` composer region, `<textarea>` message input,
`<button>` Send, `<li>` permission card, `<input>` deny reason, `<button>` Allow,
`<button>` Show system events.

### The permission cards were reachable, and how matters

The contract's reach note said a card needs a real permission prompt, which needs a live
`claude` process, and `PermissionCardList` returns `null` on an empty card list
(`PermissionCardList.tsx:35`). What it actually needs is the app's own two pushes, and the
**main process** can send those without a `claude` process: `push:laneChanged` with one
Matriarch lane, then `push:permissionRequested` for that lane.

**Stated plainly so the measurement is not read as more than it is:** no `claude` process
ran. The originating child process is the one thing that was absent. Everything between
the IPC channel and the pixel — the shipped channel names, the preload bridge, the
workspace store, the React tree, the stylesheet and layout — is the shipped code path,
which is what a CSS measurement depends on. The card is visible in
`04-permission-card.png`.

This is the same shape of result as the previous run's `.bypassBadge`: a site the brief
expected to be out of reach turned out to be reachable once the actual precondition was
read rather than assumed.

## 4. The zero-pixel conclusion, and its exact strength

**In this engine, in this window, `border-width: thin` and a declared `border-width: 1px`
produced the same used width** — both `0.8px`, measured side by side on synthetic elements
at KS-1. So replacing `thin` with `var(--oc-border-hairline)` at these six declarations
changed no rendered width here: it is a consistency change, not a visual one.

**This is an engine measurement on one display, not a standards claim.** The CSS
specification fixes only the `thin < medium < thick` ordering and leaves the widths
UA-defined; MDN states `thin` is equivalent to `1px`, which is a statement about common
engines rather than a requirement on them. The authoritative answer for Orcastrate is the
engine that ships, and this is that engine saying it — once.

Which display and which window, precisely:

- **The display:** the primary display of this Windows 11 machine, driven by the integrated
  AMD Radeon 780M adapter at 1920 x 1200 (`Win32_VideoController`). The ladder above is
  consistent with a 1.25 device scale.
- **The window:** the single `BrowserWindow` opened by `out/main/index.js` from the build
  named above, launched through Playwright `_electron` against the sandbox home
  `C:\oc-sandbox-keyword-sweep`, viewport 1280 x 900, `devicePixelRatio`
  `1.0000000149011612`. Measured at KS-1 of this run, timestamped in
  `driven-report-keyword-sweep.json`.

The figure `0.8px` is **not portable** and must never be written down as an expectation.
What is portable is the *equality*: `thin`, a declared `1px`, and
`var(--oc-border-hairline)` were indistinguishable here. A different display would move
all three together.

## 5. What this run did NOT prove

Stated plainly, because a run that reports only its passes is this project's instrument
problem in another form.

- **Nothing about other displays or other engines.** One Chromium, one window, one
  display. The equalities survive the quantization; the pixel figures do not.
- **No before/after of the shipped build.** The discrimination control is an in-page
  override, not a render of the pre-conversion bundle. It shows the probe can report a
  different value and that the shipped values are what they claim; it is not a rendered
  regression diff against `6914e49`.
- **The borders were not visually differenced.** `thin` -> `var(--oc-border-hairline)` is
  shown to be zero-pixel by the identical used widths of keyword, literal and token in one
  window, not by an image comparison.
- **One element carried the token-resolution control.** `.composer` was broken and
  restored; the other six measured declarations were read in their shipped state and are
  not each independently discriminated.
- **No live `claude` process ran.** The permission cards were reached by the app's own
  pushes from the main process (see above). Nothing here exercises the CLI, the pod runner,
  or a real tool-permission round trip, and nothing here re-checks the transcript event
  sites the previous run left unreached — they still need that harness, which remains the
  highest-value instrument this project lacks.
- **Nothing here re-checks the token sweep's other findings**, beyond the one correction
  recorded in `FINDINGS-TOKEN-SWEEP.md`.
- **This document makes no claim about how many bare width keywords remain in the
  renderer.** That claim is a scanner's to make, not prose's: it is
  `src/renderer/src/__tests__/hygiene.test.ts:1986` ("gives no listed border-width property
  a raw length or a bare width keyword, everywhere, with no exception list") repo-wide, and
  `:860` for the three panel roots, both widened to the keyword forms by `6cf4d0b`. Cite
  those, and read what they actually implement; a sentence here restating the rule would be
  a second definition in a position to disagree with the one that runs. Two docblocks in
  this tree (`pods/PodBar.module.css:1-8`, `pods/DeletePodDialog.module.css:1-5`) already
  carry exhaustive enumerations that no scanner enforces, and are on the backlog for
  exactly that reason.

## Every count in this document, and what produced it

| Count | Produced by |
|---|---|
| 70/70 checks, 0 step errors, exit 0 | the driver, over its own results array at report time |
| 65/70 and exit 1 on the injected run | that run's own output; the injection and its restoration are described above |
| build exit code 0 | `npm run build` in the session worktree |
| 7 declarations enumerated, 6 of them the contract's | the driver's own coverage table, asserted as a check at KS-7 |
| every measured value (`0.8px`, `2.4px`, `4.8px`, the ladder, the rects) | `getComputedStyle` / `getBoundingClientRect` in the running window, per element named above |
| the declared-`1px` reference every border check uses | measured at KS-1 on a synthetic element declaring `border-width: 1px` in this window |
| `thin` versus a declared `1px` | measured at KS-1 on two synthetic elements alive in this window at the same moment |
| 7/7 selector groups agree with their stylesheets | read off the stylesheets on disk at KS-2 and compared with the driver's map |
| 0 occurrences of the injected class names in the bundle | `grep -c` over `out/renderer/assets/index-B8ruB0_i.css`, exit 1; the same command returns 3 for `filterToggle`, exit 0 |
| the driver restored byte-identically | `sha256sum` and `cmp` against a pre-injection copy |
| the real `settings.json` unchanged | `sha256` of the file before launch and after close, at KS-8 |
| 21 of 39 measured by the previous run | `FINDINGS-TOKEN-SWEEP.md`, cited not re-derived |
| the six converted sites | the frozen contract `contracts/keyword-hairline-sweep.ts` `KEYWORD_WIDTH_SITES`; each independently re-read off its stylesheet at KS-2 |
| `--oc-border-hairline` at `styles/tokens.css:156` | `grep -n 'oc-border-hairline' src/renderer/src/styles/tokens.css` against the current tree (it was `:144` at `6914e49`, before this session added comment lines above it) |
| display adapter and resolution | `Get-CimInstance Win32_VideoController` on this machine |
