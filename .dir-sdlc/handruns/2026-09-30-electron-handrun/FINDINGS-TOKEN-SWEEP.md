# Token sweep verification hand-run — 2026-10-12

This session tokenised **36 border-width declarations** and **3 `letter-spacing`
declarations** across 7 stylesheets, and added three repo-wide censuses. All of it was
confirmed by grep, by two-sided census predicates and by a green suite — **and none of it
had ever been rendered.** This run renders it, against the real built Electron app.

**52 of 52 checks passed. 0 step errors. No application defect found.**

A call site is not a pixel. That sentence is why this run exists: the previous session
(C3) confirmed its work exactly the same way and recorded the honest limit that only **3
of its 10 converted sites were ever on screen**. `.railHeading` was not one of them, and
`.railHeading` is the element this session deliberately changed.

Driver: `driver/run-token-sweep.mjs`. Report: `driven-report-token-sweep.md` / `.json`.
Screenshots: `screenshots/token-sweep/`. Sandbox: **`C:\oc-sandbox-token-sweep`**, a root
of its own so this run neither races nor clobbers C3's, with
`USERPROFILE`/`APPDATA`/`LOCALAPPDATA`/`TEMP` redirected by `driver/sandbox.mjs` — the
real `~/.claude` was never read and never written.

## The build under test, and why that is a check rather than an assumption

`driver/lib.mjs:8` resolves `repoRoot` four levels up **from the driver file**. A copy of
this driver run from the main checkout would therefore launch `<main>/out/main/index.js`
— a build containing none of this session's conversions — and would confirm nothing while
appearing to pass. So the build is identified, not assumed:

- `npm run build` was run in the session worktree
  `C:\Users\dmarq\Development\Repos\orcastrate\.claude-worktrees\2026-10-12-orcastrate-token-sweep`
  and **exited 0**, including `typecheck:node` and `typecheck:web`, which run ahead of the
  bundle.
- `repoRoot` as resolved at run time is that worktree (printed by the driver at TS-0).
- The decisive evidence is the **same CSS rule in the two bundles**:

| Checkout | Bundle | `.railHeading` declaration |
|---|---|---|
| this worktree | `out/renderer/assets/index-0uCezQ_O.css` | `letter-spacing: var(--oc-tracking-wide);` |
| main checkout | `out/renderer/assets/index-DLsXrONq.css` | `letter-spacing: 0.06em;` |

The main checkout's bundle is a **pre-session** build and still carries the literal this
session replaced. In the worktree's bundle the literal `0.06em` appears **0 times**
(counted by the driver as `/0\.06em/g` over the bundle text), and
`var(--oc-border-hairline)` appears **60 times** against the **24 consumers the frozen
contract records at `af12edc`** — a bundle showing ~24 would be a pre-session build.

Finally, the window is tied to that bundle rather than to the file on disk: CSS Modules
emits a per-file hash, the bundle's rule is `._railHeading_1h7yc_13`, and the **live
element in the running window carries that same `_1h7yc_` hash**.

## What was actually proved, and how

### 1. `.railHeading` renders, and it renders tighter

`<h2 id="lane-rail-heading">` (`src/renderer/src/lanes/LaneRail.tsx:70`) is **on screen**
with a real layout rect of 239.2 x 35.95 — visible as `LANES` at the top of the rail in
`04-rail-heading-rendered.png`. No previous hand-run ever rendered it, because the lane
rail appears only when a Pod is active and no panel is open.

| Measured | Value |
|---|---|
| computed `letter-spacing` | **`0.44px`** |
| computed `font-size` | `11px` |
| 0.04 x font-size | `0.4400px` — matches exactly |
| 0.06 x font-size (the old value) | `0.6600px` — measured value is strictly below it |

The comparison is made against the element's **own measured font-size**, not a hardcoded
pixel value, and that is not a stylistic preference: at `--oc-text-xs: 11px` both
candidate values are **sub-pixel** (0.44px vs 0.66px), so a hardcoded expectation would
have been the wrong instrument.

**The probe was shown able to report something else.** Overriding `letter-spacing` back to
the pre-session `0.06em` on the same element, in-page, and re-probing returns **`0.66px`**
— strictly larger, and matching 0.06 x font-size exactly. Removing the override returns
`0.44px`. A probe that has only ever reported the value it expected has not been shown to
measure anything; this one reported both. The A/B is `04-rail-heading-rendered.png` vs
`05-control-rail-heading-0.06em.png`.

### 2. The border token resolves — checked on the failure a passing suite cannot see

Measured on the Pod-bar region div, from
`src/renderer/src/shell/WorkspaceLayout.module.css:20`
(`border-bottom: var(--oc-border-hairline) solid var(--oc-border)`): computed
`border-bottom-width` = **`0.8px`**, identical to a literal `1px` measured in the same
window (see the pixel grid below).

**The discriminator is token resolution, not width.** A unit test cannot tell
`var(--oc-border-hairline)` from a literal, and a token that *failed* to resolve would not
throw — it would silently paint a different width. So `--oc-border-hairline` was overridden
in-page to a value that is not a length:

| State | computed `border-bottom-width` | `border-bottom-style` |
|---|---|---|
| shipped | `0.8px` | `solid` |
| `--oc-border-hairline: not-a-length` | **`0px`** | `none` |
| override removed | `0.8px` | `solid` |

The `var()` substitution makes the whole declaration invalid at computed-value time, the
longhands fall back to their initial values, and the border disappears — visible in
`02-control-border-token-broken.png`. The probe therefore distinguishes a resolving token
from a non-resolving one, which is exactly what makes the `0.8px` readings mean something.

### 3. A declared `1px` does not compute to `1px` here — and that is the engine, not a defect

This is the instrument correction of the run, and it is recorded because the first pass
got it wrong in the direction that produces **false failures**.

Measured on synthetic off-screen elements in the live window:

| Declared | Computed |
|---|---|
| `1px` | `0.8px` |
| `2px` | `1.6px` |
| `3px` | `2.4px` |
| `4px` | `4px` |
| `5px` | `4.8px` |
| `var(--oc-border-hairline)` | `0.8px` |

`--oc-border-hairline` itself resolves to the string `1px` on `:root`. The computed *used*
width is `0.8px` because Chromium snaps used border widths to whole **device** pixels, and
this display is fractionally scaled: every value above is `floor(declared x 1.25) / 1.25`.
A literal `1px` and the token compute **identically**, so this is the pixel grid, not a
token failure.

Every border check in this run therefore compares the converted element against a
**literal-`1px` reference measured live in the same window**, rather than against the
string `"1px"`. Hardcoding `1px` would have been precisely the mistake the tracking
criterion already forbids for `letter-spacing`.

## Per-stylesheet coverage — every converted stylesheet accounted for

**21 of this session's 39 converted sites were measured on screen.** The driver enumerates
40 sites across the 7 stylesheets; 39 of them are this session's work (36 border
declarations + 3 tracking), and **1 is not**: `.panelBarRegion` already named
`var(--oc-border-hairline)` at `af12edc`
(`git show af12edc:…/WorkspaceLayout.module.css | grep -c 'var(--oc-border-hairline)'`
-> 1, against 5 now). It is measured and reported, but it is not credited to this session.

No site below is reported as verified unless it was measured with a non-zero layout rect.
`getComputedStyle` answers for a `display:none` element too, so a resolved value is not a
rendered one, and the driver counts only hits that actually had a box.

| Stylesheet | Measured | Sites measured (computed value) |
|---|---|---|
| `lanes/LaneRail` | 2/8 | `.rail` right=`0.8px`; `.railHeading` letter-spacing=`0.44px` |
| `pods/DeletePodDialog` | 2/3 | `.dialog`, `.button` — all four sides `0.8px` |
| `pods/NewPodDialog` | 6/7 | `.dialog`, `.input`, `.cwdDisplay`, `.mode`, `.bypass`, `.button` — all four sides `0.8px` |
| `pods/PodBar` | 5/5 | `.statusDot`, `.bypassBadge`, `.runControl`, `.newPod` borders `0.8px`; `.bypassBadge` letter-spacing=`0.44px` |
| `shell/EmptyWorkspace` | 1/1 | `.action` — all four sides `0.8px` |
| `shell/WorkspaceLayout` | 4/5 | `.podBarRegion` bottom, `.panelBarRegion` bottom, `.laneRailRegion` right, `.composerRegion` top — each `0.8px` |
| `transcript/Transcript` | 2/11 | `.pane` left=`0.8px`; `.paneHeader` bottom=`0.8px` |

Every one of the 7 stylesheets has at least one converted declaration **measured in the
running window**. The full 40-row table, with the reason for each unreached site, is in
`driven-report-token-sweep.md`.

### The sites that were NOT reached, and what each would need

Recording these is the point, not an apology for them — this is what the next session
scopes from.

**`transcript/Transcript` — 9 of 11 unreached, all for the same root cause.** A Pod can be
created without a `claude` process, but it has **no transcript content**, so every
event-level site is out of reach: `.event` (needs a user-role event), `.eventLabel`
(tracking — needs a real event), `.eventCode` (needs a tool result carrying code),
`.disclosure` (needs compact tool activity), `.loadMore` (needs more events than one
page), `.dispatchCard` and `.dispatchAgent` (need a dispatch from a live agent).
`.paneError` needs the transcript to fail to load, and `.unpin` needs a split pane.

**`lanes/LaneRail` — 6 of 8 unreached.** `.row`, `.dot`, `.rowAction` and
`.finishedToggle` all need at least one lane, and lanes come from a live `claude` process.
`.inlineNote` needs `routingMode === 'inline'`; `.errorState` needs the rail to fail.

**`shell/WorkspaceLayout` — 1 unreached.** `.splitPane` needs a split view, i.e. a pinned
follower lane.

**The two dialogs — 1 each.** `.error` in both needs a failing operation (a rejected
submission; a failing delete).

Reaching the transcript and lane sites needs a live `claude` process driving a real
session — a materially larger harness than this one, and the single most valuable thing a
follow-up could add.

## The three converted `letter-spacing` sites

| Site | Result |
|---|---|
| `lanes/LaneRail` `.railHeading` | **MEASURED `0.44px`** against font-size `11px`. The visible change, tightened from `0.06em`. |
| `pods/PodBar` `.bypassBadge` | **MEASURED `0.44px`** against font-size `11px`. |
| `transcript/Transcript:181` `.eventLabel` | **NOT reached** — needs a real transcript event, which needs a live `claude` process. |

The brief anticipated that **two** of these three would be out of reach. Only one was.
`.bypassBadge` turned out to be reachable without a `claude` process: `PodTab.tsx:113`
derives the badge from `pod.permissionMode` alone, so creating a Pod with
`permissionMode: 'bypassPermissions'` renders it — visible in `07-bypass-badge.png`. Its
border was measured at `0.8px` on all four sides in the same step.

## What this run did NOT prove

Stated plainly, because a run that reports only its passes is this project's instrument
problem in another form.

- **18 of this session's 39 converted sites were never on screen**, listed above with the
  reason for each. The headline is 21 measured, not 39.
- **The tracking change is measurable but not conspicuous.** 0.44px vs 0.66px across the
  five letters of `LANES` is a sub-pixel difference per gap. The A/B screenshots differ by
  7 bytes (28,602 vs 28,609). The change is *real and measured*; nobody should expect it
  to be obvious to the eye, and this run makes no claim that it is.
- **No before/after of the shipped build.** Both discrimination controls are in-page
  overrides, not the pre-session bundle. They prove the probes can report a different
  value and that the shipped values are what they claim; they are not a rendered
  regression diff against `af12edc`.
- **The borders were not visually differenced.** `1px` -> `var(--oc-border-hairline)` is
  asserted to be zero-pixel by the token's definition and by the identical computed widths
  of literal and token, not by an image comparison.
- **Only one element was used for the border-token control.** `.podBarRegion` was broken
  and restored; the other 20 measured border sites were read in their shipped state and
  are not each independently discriminated.
- **Nothing here re-checked C3's findings or the 2026-10-07 run.** This run is scoped to
  the token sweep.
- **One display, one engine.** Every computed value above is from this Chromium on this
  fractionally-scaled display. The `0.8px` figures are not portable; the *relationships*
  (token == literal, 0.04em < 0.06em) are.

## Harness defects found and fixed during this run

**All 10 failures in the first pass were the harness, not the application.** Recorded
because the first pass would have reported `36/46` and invited the reading that the
conversions were defective. C3's first pass would have reported `20/23` on three harness
faults for the same reason.

1. **The border checks hardcoded `1px` and produced 8 false failures.** Every converted
   border "failed" at `0.8px` — including, decisively, a **synthetic element declaring a
   literal `1px`**, which the same pass measured at `0.8px` too. The app was never
   involved. Fixed by measuring a literal-`1px` reference in the live window and comparing
   against that, and by recording the whole declared-to-computed ladder so the number is
   explained rather than asserted. This is the same class of error as hardcoding a tracking
   value, which the criteria already forbid.
2. **A single-class anchor was ambiguous and silently deleted a whole stylesheet.**
   `EmptyWorkspace`'s hash was resolved from `.empty`, which also exists in
   `Helm.module.css`. Two candidates meant no hash, which dropped `EmptyWorkspace` from the
   sweep plan entirely — so `.action` was reported **"not reached"** while the `New Pod`
   button was plainly on screen **in the screenshot that same step had just taken**. A
   coverage gap that reports itself as a limit is worse than one that errors. Fixed by
   resolving each stylesheet from a **signature of several classes** that co-occur only in
   that file, and by failing loudly on ambiguity instead of dropping the file.
3. **`createPod` through the preload bridge does not notify the renderer.** The Pod lands
   in the sqlite store but the Pod bar never learns about it, so no tab appears; a
   `win.reload()` re-fetches the list. Carried forward from C3, which hit it first.
4. **The worktree had no `node_modules`.** A build prerequisite rather than a driver fault:
   the session worktree was created without dependencies, so `npm run build` could not run
   until they were linked. Both `node_modules/` and `out/` are gitignored and reach no
   commit.

Class-name attribution is worth one more line, because getting it wrong would have been
invisible: `dialog`, `error` and `button` each exist in **both** pod dialogs, and `pane`
exists in **both** `WorkspaceLayout` and `Transcript`. A sweep keyed on the class name
would have misattributed measurements between stylesheets and reported coverage it did not
have. Every measurement here is attributed by the CSS Modules **per-file hash**.

## Every count in this document, and what produced it

| Count | Produced by |
|---|---|
| 52/52 checks, 0 errors | the driver, over its own results array at report time |
| build exit code 0 | `npm run build` in the session worktree |
| `0.06em` appears 0 times in the bundle | the driver, `/0\.06em/g` over the built CSS text |
| 60 hairline refs in the bundle | the driver, `/var\(--oc-border-hairline\)/g` over the built CSS text |
| 24 consumers at `af12edc` | the frozen contract `contracts/token-sweep-census.ts`, cited not re-derived |
| 36 borders + 3 tracking converted | the frozen contract; cross-checked by the driver's own 39-site enumeration, which the run asserts |
| 1 pre-existing site (`.panelBarRegion`) | `git show af12edc:…/WorkspaceLayout.module.css \| grep -c` -> 1, against 5 at `9a09c1b` |
| 21 of 39 measured, 18 unreached | the driver's coverage table, which enumerates every converted site |
| 40 enumerated sites, 7 stylesheets | the driver's coverage table; the 7-stylesheet total is asserted as a check |
| all computed px values | `getComputedStyle` in the running window, per element named above |
| 10 first-pass failures, all harness | the first run's own output, retained in the session scratch log |

## One observation, outside this run's acceptance criteria

**`border-width: thin` computes to `0.8px` in this Electron's Chromium — identical to a
declared `1px`.** Measured on a synthetic element in the same window, alongside
`medium` = `2.4px` and `thick` = `4.8px`. No stylesheet was modified to test it.

The backlog carries six untokenised `thin` border widths in
`composer/Composer.module.css` and `permissions/PermissionCards.module.css`. MDN states
`thin` = `1px`, but the CSS spec fixes only the `thin` < `medium` < `thick` *ordering* and
leaves the widths UA-defined, so the authoritative answer is the engine that actually
ships. Here it is: **converting those six is a zero-pixel change.** It is a consistency
change, not a visual one, and can be scoped as such.

This is an engine measurement on one display, not a standards claim, and it is explicitly
outside criteria 1-12.
