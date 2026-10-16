# Driven hand-run — token sweep

Generated 2026-10-13T00:41:20.971Z

**52/52 checks passed.** 0 step(s) errored.

Every number in this file was produced by the run that wrote it:

| Count | Produced by |
|---|---|
| checks total/failed/errored | counted by this driver over its own results array at report time |
| hairline consumers in bundle | counted by this driver as /var\(--oc-border-hairline\)/g over the built CSS text |
| 0.06em occurrences in bundle | counted by this driver as /0\.06em/g over the built CSS text |
| swept element count | document.querySelectorAll("*").length at sweep time |
| the 1px reference used by every border check | measured at TS-1 on a synthetic element declaring border-width:1px in this window |
| per-stylesheet measured/total | counted over this run's own coverage table, which lists every converted site |

- repoRoot launched: `C:\Users\dmarq\Development\Repos\orcastrate\.claude-worktrees\2026-10-12-orcastrate-token-sweep`
- sandbox root: `C:\oc-sandbox-token-sweep`
- built renderer CSS: `out/renderer/assets/index-0uCezQ_O.css`

## The pixel grid this run measured against

A declared `border-width: 1px` computes to **`0.8px`** in this window, and `var(--oc-border-hairline)` computes to `0.8px` — identical. Chromium snaps used border widths to whole DEVICE pixels, so on a fractionally scaled display the computed value of a 1px border is not the string "1px". Every border check in this run therefore compares against that measured reference rather than a hardcoded literal.

| Declared | Computed |
|---|---|
| `1px` | `0.8px` |
| `2px` | `1.6px` |
| `3px` | `2.4px` |
| `4px` | `4px` |
| `5px` | `4.8px` |
| `thin` | `0.8px` |
| `medium` | `2.4px` |
| `thick` | `4.8px` |
| `var(--oc-border-hairline)` | `0.8px` |

devicePixelRatio reported by the window: `1.0000000149011612`

## Steps

| Step | Title | Checks | Verdict |
|---|---|---|---|
| TS-0 | Provenance: the live window is THIS worktree's build | 11 | PASS |
| TS-1 | Both tokens resolve on :root in the real window | 3 | PASS |
| TS-2 | Empty workspace — WorkspaceLayout regions and EmptyWorkspace action | 3 | PASS |
| TS-3 | Border probe + CONTROL: the probe discriminates on TOKEN RESOLUTION | 5 | PASS |
| TS-4 | NewPodDialog — converted borders in the open dialog | 4 | PASS |
| TS-5 | .railHeading RENDERED — tracking measured against its own font-size | 10 | PASS |
| TS-6 | .bypassBadge — tracking and border on a bypassPermissions Pod | 4 | PASS |
| TS-7 | DeletePodDialog — converted borders in the open dialog | 2 | PASS |
| TS-8 | Per-stylesheet coverage — measured, or named as unreachable | 9 | PASS |
| TS-9 | OBSERVATION (not a criterion): does border-width `thin` compute to 1px? | 1 | PASS |

## Per-stylesheet coverage

| Stylesheet | Site | Kind | This session? | Status | Measured value / reason |
|---|---|---|---|---|---|
| `lanes/LaneRail.module.css` | `.rail` | border | yes | measured | `right=0.8px` |
| `lanes/LaneRail.module.css` | `.inlineNote` | border | yes | not reached | needs routingMode === 'inline' |
| `lanes/LaneRail.module.css` | `.errorState` | border | yes | not reached | needs the rail to fail to load |
| `lanes/LaneRail.module.css` | `.row` | border | yes | not reached | needs at least one lane, which needs a live `claude` process |
| `lanes/LaneRail.module.css` | `.dot` | border | yes | not reached | needs a lane row to carry a status dot |
| `lanes/LaneRail.module.css` | `.rowAction` | border | yes | not reached | needs a lane row with a Steer action |
| `lanes/LaneRail.module.css` | `.finishedToggle` | border | yes | not reached | needs at least one FINISHED lane |
| `lanes/LaneRail.module.css` | `.railHeading` | tracking | yes | measured | `letter-spacing=0.44px (font-size=11px)` |
| `pods/DeletePodDialog.module.css` | `.dialog` | border | yes | measured | `top=0.8px right=0.8px bottom=0.8px left=0.8px` |
| `pods/DeletePodDialog.module.css` | `.error` | border | yes | not reached | needs a failing delete |
| `pods/DeletePodDialog.module.css` | `.button` | border | yes | measured | `top=0.8px right=0.8px bottom=0.8px left=0.8px` |
| `pods/NewPodDialog.module.css` | `.dialog` | border | yes | measured | `top=0.8px right=0.8px bottom=0.8px left=0.8px` |
| `pods/NewPodDialog.module.css` | `.input` | border | yes | measured | `top=0.8px right=0.8px bottom=0.8px left=0.8px` |
| `pods/NewPodDialog.module.css` | `.cwdDisplay` | border | yes | measured | `top=0.8px right=0.8px bottom=0.8px left=0.8px` |
| `pods/NewPodDialog.module.css` | `.mode` | border | yes | measured | `top=0.8px right=0.8px bottom=0.8px left=0.8px` |
| `pods/NewPodDialog.module.css` | `.bypass` | border | yes | measured | `top=0.8px right=0.8px bottom=0.8px left=0.8px` |
| `pods/NewPodDialog.module.css` | `.error` | border | yes | not reached | needs a rejected submission |
| `pods/NewPodDialog.module.css` | `.button` | border | yes | measured | `top=0.8px right=0.8px bottom=0.8px left=0.8px` |
| `pods/PodBar.module.css` | `.statusDot` | border | yes | measured | `top=0.8px right=0.8px bottom=0.8px left=0.8px` |
| `pods/PodBar.module.css` | `.bypassBadge` | border | yes | measured | `top=0.8px right=0.8px bottom=0.8px left=0.8px` |
| `pods/PodBar.module.css` | `.runControl` | border | yes | measured | `top=0.8px right=0.8px bottom=0.8px left=0.8px` |
| `pods/PodBar.module.css` | `.newPod` | border | yes | measured | `top=0.8px right=0.8px bottom=0.8px left=0.8px` |
| `pods/PodBar.module.css` | `.bypassBadge` | tracking | yes | measured | `letter-spacing=0.44px (font-size=11px)` |
| `shell/EmptyWorkspace.module.css` | `.action` | border | yes | measured | `top=0.8px right=0.8px bottom=0.8px left=0.8px` |
| `shell/WorkspaceLayout.module.css` | `.podBarRegion` | border | yes | measured | `bottom=0.8px` |
| `shell/WorkspaceLayout.module.css` | `.panelBarRegion` | border | no — already tokenised at af12edc | measured | `bottom=0.8px` |
| `shell/WorkspaceLayout.module.css` | `.laneRailRegion` | border | yes | measured | `right=0.8px` |
| `shell/WorkspaceLayout.module.css` | `.splitPane` | border | yes | not reached | needs a split view, i.e. a pinned follower lane |
| `shell/WorkspaceLayout.module.css` | `.composerRegion` | border | yes | measured | `top=0.8px` |
| `transcript/Transcript.module.css` | `.pane` | border | yes | measured | `left=0.8px` |
| `transcript/Transcript.module.css` | `.paneHeader` | border | yes | measured | `bottom=0.8px` |
| `transcript/Transcript.module.css` | `.unpin` | border | yes | not reached | needs a SPLIT pane, i.e. a pinned follower lane |
| `transcript/Transcript.module.css` | `.paneError` | border | yes | not reached | needs the transcript to fail to load |
| `transcript/Transcript.module.css` | `.event` | border | yes | not reached | needs a user-role transcript event, which needs a live `claude` process |
| `transcript/Transcript.module.css` | `.eventCode` | border | yes | not reached | needs a tool-result event carrying code |
| `transcript/Transcript.module.css` | `.disclosure` | border | yes | not reached | needs compact tool activity in the stream |
| `transcript/Transcript.module.css` | `.loadMore` | border | yes | not reached | needs more events than one transcript page |
| `transcript/Transcript.module.css` | `.dispatchCard` | border | yes | not reached | needs a dispatch event from a live agent |
| `transcript/Transcript.module.css` | `.dispatchAgent` | border | yes | not reached | needs a dispatch event from a live agent |
| `transcript/Transcript.module.css` | `.eventLabel` | tracking | yes | not reached | needs a real transcript event, which needs a live `claude` process |

## Full check log

### TS-0 — Provenance: the live window is THIS worktree's build

- PASS the built bundle contains a .railHeading rule — `hash=1h7yc`
- PASS that rule carries letter-spacing: var(--oc-tracking-wide) — the converted form — `margin: 0; padding: var(--oc-space-3) var(--oc-space-3) var(--oc-space-2); font-size: var(--oc-text-xs); font-weight: var(--oc-weight-semibold); letter-spacing:`
- PASS the pre-conversion literal 0.06em appears 0 times in the built bundle — `0 occurrence(s)`
- PASS the bundle has strictly more hairline consumers than the 24 recorded at af12edc — `60 > 24`
- PASS file hash resolved unambiguously for lanes/LaneRail.module.css — `signature {railHeading, rail, finishedToggle} -> _1h7yc_`
- PASS file hash resolved unambiguously for pods/DeletePodDialog.module.css — `signature {session, dialog, buttonDanger} -> _cgaoz_`
- PASS file hash resolved unambiguously for pods/NewPodDialog.module.css — `signature {cwdDisplay, bypass, bypassWarning} -> _ccdyc_`
- PASS file hash resolved unambiguously for pods/PodBar.module.css — `signature {bypassBadge, newPod, runControl} -> _e9f3f_`
- PASS file hash resolved unambiguously for shell/EmptyWorkspace.module.css — `signature {empty, heading, body, action} -> _glur9_`
- PASS file hash resolved unambiguously for shell/WorkspaceLayout.module.css — `signature {podBarRegion, laneRailRegion, composerRegion} -> _l2fht_`
- PASS file hash resolved unambiguously for transcript/Transcript.module.css — `signature {dispatchCard, dispatchAgent, paneHeader} -> _m07co_`
- note: repoRoot resolved by lib.mjs = C:\Users\dmarq\Development\Repos\orcastrate\.claude-worktrees\2026-10-12-orcastrate-token-sweep
- note: sandbox root = C:\oc-sandbox-token-sweep
- note: built renderer CSS = out/renderer/assets/index-0uCezQ_O.css
- note: var(--oc-border-hairline) appears 60 time(s) in the built bundle (counted by this driver over the bundle text; the frozen contract records 24 consumers at the session base `af12edc`, so a bundle showing ~24 would be a PRE-session build)
- note: no .railHeading in the DOM yet (no active Pod) — the window/bundle hash agreement is re-checked at TS-4 where the rail renders

### TS-1 — Both tokens resolve on :root in the real window

- PASS --oc-border-hairline resolves to 1px — `1px`
- PASS --oc-tracking-wide resolves to 0.04em — `0.04em`
- PASS a literal 1px and var(--oc-border-hairline) compute IDENTICALLY on synthetic elements — `literal 1px -> 0.8px, var(--oc-border-hairline) -> 0.8px`
- note: --oc-text-xs = 11px, --oc-border-thick = 2px
- note: pixel grid measured on synthetic elements: declared 1px computes 0.8px; ladder 1px->0.8px 2px->1.6px 3px->2.4px 4px->4px 5px->4.8px; devicePixelRatio=1.0000000149011612
- note: NOT 1px. This display snaps used border widths to whole DEVICE pixels, so a declared 1px computes 0.8px. This is the engine's pixel grid, not a token failure — and it is why every border check below compares against this measured reference rather than the string "1px". Hardcoding 1px here would be the same mistake criterion 4 forbids for tracking.
- note: At --oc-text-xs: 11px both tracking candidates are SUB-PIXEL — 0.04em = 0.44px, 0.06em = 0.66px — which is why every tracking check below is computed from the element's own measured font-size.

### TS-2 — Empty workspace — WorkspaceLayout regions and EmptyWorkspace action

- PASS podBarRegion border-bottom computes a declared 1px (=0.8px) — WorkspaceLayout.module.css:20 — `border-bottom-width=0.8px (reference 0.8px)`
- PASS panelBarRegion border-bottom computes a declared 1px (=0.8px) — WorkspaceLayout.module.css:30 — `border-bottom-width=0.8px (reference 0.8px)`
- PASS EmptyWorkspace .action border computes a declared 1px (=0.8px) on all four sides — EmptyWorkspace.module.css:26 — `top=0.8px right=0.8px bottom=0.8px left=0.8px (reference 0.8px)`
- note: swept 33 elements; 4 converted-class hit(s)
- shot: `screenshots/token-sweep/01-empty-workspace.png`

### TS-3 — Border probe + CONTROL: the probe discriminates on TOKEN RESOLUTION

- PASS the probe found .podBarRegion in the live DOM — `_podBarRegion_l2fht_35`
- PASS BASELINE: .podBarRegion computes border-bottom-width 0.8px — identical to a literal 1px — `bottom=0.8px style=solid (literal-1px reference 0.8px)`
- PASS CONTROL: with --oc-border-hairline overridden to a non-length, the computed width CHANGES — `baseline bottom=0.8px -> overridden bottom=0px (style solid -> none)`
- PASS CONTROL: the overridden width is no longer 1px — `0px (shipped reference 0.8px)`
- PASS the override was removed and the shipped hairline came back — `bottom=0.8px (reference 0.8px)`
- note: Element: the Pod-bar region div. Stylesheet: src/renderer/src/shell/WorkspaceLayout.module.css:20 — `border-bottom: var(--oc-border-hairline) solid var(--oc-border)`.
- shot: `screenshots/token-sweep/02-control-border-token-broken.png`

### TS-4 — NewPodDialog — converted borders in the open dialog

- PASS NewPodDialog .dialog border computes a declared 1px (=0.8px) on all sides — NewPodDialog.module.css:19 — `top=0.8px right=0.8px bottom=0.8px left=0.8px`
- PASS every rendered NewPodDialog converted border is a declared 1px (=0.8px) on the sides it sets — `all 14 rendered hit(s) at 0.8px`
- PASS the bypassPermissions mode option could be selected
- PASS NewPodDialog .bypass border computes a declared 1px (=0.8px) — NewPodDialog.module.css:74 — `top=0.8px right=0.8px bottom=0.8px left=0.8px`
- note: rendered NewPodDialog converted classes (hash ccdyc): .dialog, .input, .cwdDisplay, .button, .mode, .mode, .mode, .mode, .input, .input, .button, .button, .button, .button
- shot: `screenshots/token-sweep/03-newpod-dialog.png`
- shot: `screenshots/token-sweep/03b-newpod-dialog-bypass-mode.png`

### TS-5 — .railHeading RENDERED — tracking measured against its own font-size

- PASS createPod succeeded — `{"ok":true,"value":{"id":"412f955b-68e4-46a3-8529-ba531b343795","title":"oc-token-sweep","cwd":"C:\\oc-sandbox-token-sweep\\repos\\plain-rep`
- PASS a Pod tab is rendered after the reload — `1 tab(s)`
- PASS the lane rail heading is present in the DOM
- PASS .railHeading is ON SCREEN (non-zero layout rect) — `h2#lane-rail-heading rect=239.1999969482422x35.95000076293945 text="LANES"`
- PASS measured letter-spacing equals 0.04 x its own computed font-size (sub-pixel tolerance) — `|0.44 - 0.4400| = 0.0000px`
- PASS measured letter-spacing is STRICTLY LESS than 0.06 x font-size (the old value) — `0.44px < 0.6600px`
- PASS the live element is the h2 the contract names — `<h2 id="lane-rail-heading">`
- PASS CONTROL: overridden back to 0.06em, the SAME probe reports a STRICTLY LARGER value — `shipped 0.44px -> overridden 0.66px (0.66 > 0.44)`
- PASS CONTROL: the overridden value matches 0.06 x font-size, so the probe tracks the declaration — `|0.66 - 0.6600| = 0.0000px`
- PASS the override was removed and the shipped tracking came back — `0.44px`
- note: activated pod-tab:412f955b-68e4-46a3-8529-ba531b343795
- note: MEASURED: letter-spacing=0.44px font-size=11px -> 0.04x font-size = 0.4400px, 0.06x font-size = 0.6600px
- note: rendered converted classes with an active Pod: WorkspaceLayout.module.css:.podBarRegion, PodBar.module.css:.statusDot, PodBar.module.css:.runControl, PodBar.module.css:.newPod, WorkspaceLayout.module.css:.panelBarRegion, WorkspaceLayout.module.css:.laneRailRegion, LaneRail.module.css:.rail, LaneRail.module.css:.railHeading, Transcript.module.css:.pane, Transcript.module.css:.paneHeader, WorkspaceLayout.module.css:.composerRegion
- shot: `screenshots/token-sweep/04-rail-heading-rendered.png`
- shot: `screenshots/token-sweep/05-control-rail-heading-0.06em.png`
- shot: `screenshots/token-sweep/06-workspace-body.png`

### TS-6 — .bypassBadge — tracking and border on a bypassPermissions Pod

- PASS createPod with permissionMode bypassPermissions succeeded — `{"ok":true,"value":{"id":"2b7d4707-8beb-4546-9552-c5350ae74699","title":"oc-token-sweep-bypass","cwd":"C:\\oc-sandbox-token-sweep\\repos\\bl`
- PASS the bypass badge is on screen — `rect=51.82500076293945x17.55000114440918`
- PASS .bypassBadge letter-spacing equals 0.04 x its own font-size (PodBar.module.css:212) — `|0.44 - 0.4400| = 0.0000px`
- PASS .bypassBadge border computes a declared 1px (=0.8px) on all sides — PodBar.module.css:206 — `top=0.8px right=0.8px bottom=0.8px left=0.8px (reference 0.8px)`
- note: MEASURED .bypassBadge: letter-spacing=0.44px font-size=11px -> 0.04x font-size = 0.4400px
- shot: `screenshots/token-sweep/07-bypass-badge.png`

### TS-7 — DeletePodDialog — converted borders in the open dialog

- PASS at least one DeletePodDialog converted border is rendered — `.dialog, .button, .button`
- PASS every rendered DeletePodDialog converted border is a declared 1px (=0.8px) on the sides it sets — `all 3 rendered hit(s) at 0.8px`
- shot: `screenshots/token-sweep/08-deletepod-dialog.png`

### TS-8 — Per-stylesheet coverage — measured, or named as unreachable

- PASS lanes/LaneRail.module.css: at least one converted declaration MEASURED on screen — `2/8 site(s) measured: .rail, .railHeading`
- PASS pods/DeletePodDialog.module.css: at least one converted declaration MEASURED on screen — `2/3 site(s) measured: .dialog, .button`
- PASS pods/NewPodDialog.module.css: at least one converted declaration MEASURED on screen — `6/7 site(s) measured: .dialog, .input, .cwdDisplay, .mode, .bypass, .button`
- PASS pods/PodBar.module.css: at least one converted declaration MEASURED on screen — `5/5 site(s) measured: .statusDot, .bypassBadge, .runControl, .newPod, .bypassBadge`
- PASS shell/EmptyWorkspace.module.css: at least one converted declaration MEASURED on screen — `1/1 site(s) measured: .action`
- PASS shell/WorkspaceLayout.module.css: at least one converted declaration MEASURED on screen — `4/5 site(s) measured: .podBarRegion, .panelBarRegion, .laneRailRegion, .composerRegion`
- PASS transcript/Transcript.module.css: at least one converted declaration MEASURED on screen — `2/11 site(s) measured: .pane, .paneHeader`
- PASS every one of the 7 converted stylesheets is accounted for in the coverage table — `7 stylesheet(s)`
- PASS this session's converted-site count matches the frozen contract's 36 + 3 — `39 site(s) enumerated as converted by this session`
- note: lanes/LaneRail.module.css .inlineNote (border) NOT measured — needs routingMode === 'inline'
- note: lanes/LaneRail.module.css .errorState (border) NOT measured — needs the rail to fail to load
- note: lanes/LaneRail.module.css .row (border) NOT measured — needs at least one lane, which needs a live `claude` process
- note: lanes/LaneRail.module.css .dot (border) NOT measured — needs a lane row to carry a status dot
- note: lanes/LaneRail.module.css .rowAction (border) NOT measured — needs a lane row with a Steer action
- note: lanes/LaneRail.module.css .finishedToggle (border) NOT measured — needs at least one FINISHED lane
- note: pods/DeletePodDialog.module.css .error (border) NOT measured — needs a failing delete
- note: pods/NewPodDialog.module.css .error (border) NOT measured — needs a rejected submission
- note: shell/WorkspaceLayout.module.css .splitPane (border) NOT measured — needs a split view, i.e. a pinned follower lane
- note: transcript/Transcript.module.css .unpin (border) NOT measured — needs a SPLIT pane, i.e. a pinned follower lane
- note: transcript/Transcript.module.css .paneError (border) NOT measured — needs the transcript to fail to load
- note: transcript/Transcript.module.css .event (border) NOT measured — needs a user-role transcript event, which needs a live `claude` process
- note: transcript/Transcript.module.css .eventCode (border) NOT measured — needs a tool-result event carrying code
- note: transcript/Transcript.module.css .disclosure (border) NOT measured — needs compact tool activity in the stream
- note: transcript/Transcript.module.css .loadMore (border) NOT measured — needs more events than one transcript page
- note: transcript/Transcript.module.css .dispatchCard (border) NOT measured — needs a dispatch event from a live agent
- note: transcript/Transcript.module.css .dispatchAgent (border) NOT measured — needs a dispatch event from a live agent
- note: transcript/Transcript.module.css .eventLabel (tracking) NOT measured — needs a real transcript event, which needs a live `claude` process
- note: TALLY (counted over this run's coverage table): 40 enumerated site(s), of which 39 were converted by this session (36 border declarations + 3 tracking) and 1 was already tokenised at af12edc (.panelBarRegion).
- note: MEASURED 21 of this session's 39 converted sites on screen; the remaining 18 are listed above, each with the reason it was not reachable.

### TS-9 — OBSERVATION (not a criterion): does border-width `thin` compute to 1px?

- PASS OBSERVATION: `thin` computes to the SAME width as a declared `1px` in this engine — `thin=0.8px vs 1px=0.8px`
- note: synthetic elements: thin=0.8px medium=2.4px thick=4.8px; declared 1px=0.8px; dpr=1.0000000149011612
- note: Consequence for the backlog item: converting the six surviving `thin` border widths in composer/Composer.module.css and permissions/PermissionCards.module.css to var(--oc-border-hairline) is a ZERO-PIXEL change in this engine — the two compute identically here. It is a consistency change, not a visual one.
- note: Scope: this says what THIS Chromium does, measured here, on this display. The CSS spec fixes only the thin<medium<thick ordering and leaves the widths UA-defined, so this is an engine measurement, not a standards claim, and it is an observation outside this run's acceptance criteria.
