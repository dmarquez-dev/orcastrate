# Driven hand-run — keyword hairline sweep

Generated 2026-10-20T17:53:01.405Z

**70/70 checks passed.** 0 step(s) errored.

Every number in this file was produced by the run that wrote it:

| Count | Produced by |
|---|---|
| checks total/failed/errored | counted by this driver over its own results array at report time |
| swept element count | document.querySelectorAll("*").length at sweep time |
| the declared-1px reference every border check uses | measured at KS-1 on a synthetic element declaring border-width:1px in this window |
| `thin` versus a declared `1px` | measured at KS-1 on two synthetic elements alive in this window at the same moment |
| enumerated / measured / unreached | counted over this run's own coverage table, which lists every enumerated declaration |
| selector groups validated | read from the stylesheets on disk at KS-2 and compared with this driver's map |

- repoRoot launched: `C:\Users\dmarq\Development\Repos\orcastrate\.claude-worktrees\2026-10-16-orcastrate-keyword-hairline-sweep`
- sandbox root: `C:\oc-sandbox-keyword-sweep`
- built renderer CSS: `out/renderer/assets/index-B8ruB0_i.css`

## The reference this run measured against

No pixel literal is an expectation anywhere in this run. Every border below is an EQUALITY against the used width of a synthetic element DECLARING `1px`, measured in this same window. `thin` and that declared `1px` were measured side by side, on two elements alive in the document at the same moment.

| Declared | Used width measured in this window |
|---|---|
| `border-width: thin` | `0.8px` |
| `border-width: 1px` | `0.8px` |
| `border-width: var(--oc-border-hairline)` | `0.8px` |
| `border-width: medium` | `2.4px` |
| `border-width: thick` | `4.8px` |
| `border-width: 1px` | `0.8px` |
| `border-width: 2px` | `1.6px` |
| `border-width: 3px` | `2.4px` |
| `border-width: 4px` | `4px` |
| `border-width: 5px` | `4.8px` |

`devicePixelRatio` reported by this window: `1.0000000149011612`

## Steps

| Step | Title | Checks | Verdict |
|---|---|---|---|
| KS-0 | Provenance: the live window is THIS worktree's build | 17 | PASS |
| KS-1 | The reference, measured in THIS window: declared 1px, and `thin` beside it | 5 | PASS |
| KS-2 | Selector groups validated against the stylesheets, and the validator controlled | 22 | PASS |
| KS-3 | Empty workspace — sweep before any Pod exists | 0 | n/a |
| KS-4 | Active Pod — the composer declarations and the GROUPED transcript declaration | 8 | PASS |
| KS-5 | CONTROL: the border probe discriminates on TOKEN RESOLUTION | 5 | PASS |
| KS-6 | Permission cards — .card, .reason and .action through the app's own pushes | 6 | PASS |
| KS-7 | Coverage — every enumerated declaration measured, or named unreachable with its reason | 4 | PASS |
| KS-8 | Safety: the real ~/.claude/settings.json was never written | 3 | PASS |

## Coverage — one row per converted DECLARATION

| Stylesheet | Line | Selector group | Sides | Contract site? | Status | Resolved via | Measured value / reason |
|---|---|---|---|---|---|---|---|
| `composer/Composer.module.css` | 15 | `.composer` | top | yes | measured | `.composer` | `top=0.8px` |
| `composer/Composer.module.css` | 44 | `.input` | top/right/bottom/left | yes | measured | `.input` | `top=0.8px right=0.8px bottom=0.8px left=0.8px` |
| `composer/Composer.module.css` | 70 | `.send` | top/right/bottom/left | yes | measured | `.send` | `top=0.8px right=0.8px bottom=0.8px left=0.8px` |
| `permissions/PermissionCards.module.css` | 27 | `.card` | top/right/bottom/left | yes | measured | `.card` | `top=0.8px right=0.8px bottom=0.8px left=0.8px` |
| `permissions/PermissionCards.module.css` | 85 | `.reason` | top/right/bottom/left | yes | measured | `.reason` | `top=0.8px right=0.8px bottom=0.8px left=0.8px` |
| `permissions/PermissionCards.module.css` | 100 | `.action` | top/right/bottom/left | yes | measured | `.action` | `top=0.8px right=0.8px bottom=0.8px left=0.8px` |
| `transcript/Transcript.module.css` | 51 | `.filterToggle`, `.unpin` | top/right/bottom/left | no — the grouped-selector demonstration | measured | `.filterToggle` | `top=0.8px right=0.8px bottom=0.8px left=0.8px` |

## Selector groups, as read off the stylesheets

| Declaration | Group in this driver | Group in the stylesheet | Agrees |
|---|---|---|---|
| `composer/Composer.module.css:15` | {composer} | {composer} | yes |
| `composer/Composer.module.css:44` | {input} | {input} | yes |
| `composer/Composer.module.css:70` | {send} | {send} | yes |
| `permissions/PermissionCards.module.css:27` | {card} | {card} | yes |
| `permissions/PermissionCards.module.css:85` | {reason} | {reason} | yes |
| `permissions/PermissionCards.module.css:100` | {action} | {action} | yes |
| `transcript/Transcript.module.css:51` | {filterToggle, unpin} | {filterToggle, unpin} | yes |

## Full check log

### KS-0 — Provenance: the live window is THIS worktree's build

- PASS file hash resolved unambiguously for composer/Composer.module.css — `signature {composer, srOnly, send, hint} -> _1vr7c_`
- PASS file hash resolved unambiguously for permissions/PermissionCards.module.css — `signature {card, reason, kicker, asked} -> _22tzo_`
- PASS file hash resolved unambiguously for transcript/Transcript.module.css — `signature {filterToggle, unpin, paneHeaderActions, paneHeader} -> _m07co_`
- PASS the built bundle's .composer rule (hash 1vr7c) names var(--oc-border-hairline) — ` display: flex; flex-direction: column; gap: var(--oc-space-2); padding: var(--oc-space-3); min-height: var(--oc-composer-min-height); background: var`
- PASS that same .composer rule no longer declares a bare width keyword — `no bare keyword in the rule body`
- PASS the built bundle's .input rule (hash 1vr7c) names var(--oc-border-hairline) — ` width: 100%; min-height: var(--oc-composer-min-height); resize: vertical; padding: var(--oc-space-2); background: var(--oc-bg-raised); color: var(--o`
- PASS that same .input rule no longer declares a bare width keyword — `no bare keyword in the rule body`
- PASS the built bundle's .send rule (hash 1vr7c) names var(--oc-border-hairline) — ` padding: var(--oc-space-1) var(--oc-space-4); background: var(--oc-bg-selected); color: var(--oc-fg-primary); border: var(--oc-border-hairline) solid`
- PASS that same .send rule no longer declares a bare width keyword — `no bare keyword in the rule body`
- PASS the built bundle's .card rule (hash 22tzo) names var(--oc-border-hairline) — ` display: flex; flex-direction: column; gap: var(--oc-space-2); padding: var(--oc-space-3); background: var(--oc-bg-raised); border: var(--oc-border-h`
- PASS that same .card rule no longer declares a bare width keyword — `no bare keyword in the rule body`
- PASS the built bundle's .reason rule (hash 22tzo) names var(--oc-border-hairline) — ` padding: var(--oc-space-1) var(--oc-space-2); background: var(--oc-bg-panel); color: var(--oc-fg-primary); border: var(--oc-border-hairline) solid va`
- PASS that same .reason rule no longer declares a bare width keyword — `no bare keyword in the rule body`
- PASS the built bundle's .action rule (hash 22tzo) names var(--oc-border-hairline) — ` padding: var(--oc-space-1) var(--oc-space-3); background: var(--oc-bg-selected); color: var(--oc-fg-primary); border: var(--oc-border-hairline) solid`
- PASS that same .action rule no longer declares a bare width keyword — `no bare keyword in the rule body`
- PASS CONTROL: the keyword predicate FLAGS a body declaring `border: thin solid …` — `border:thin solid var(--oc-border);`
- PASS CONTROL: the same predicate does NOT flag var(--oc-border-thick) — the session near-miss — `border:var(--oc-border-thick) solid var(--oc-border);`
- note: repoRoot resolved by lib.mjs = C:\Users\dmarq\Development\Repos\orcastrate\.claude-worktrees\2026-10-16-orcastrate-keyword-hairline-sweep
- note: sandbox root = C:\oc-sandbox-keyword-sweep
- note: built renderer CSS = out/renderer/assets/index-B8ruB0_i.css

### KS-1 — The reference, measured in THIS window: declared 1px, and `thin` beside it

- PASS --oc-border-hairline resolves to a non-empty value on :root — `1px`
- PASS the two synthetic elements were alive in the document together when read — `bothAliveTogether=true`
- PASS THE SESSION'S PREMISE, measured in this window: `thin` and a declared `1px` have the SAME used width — `thin -> 0.8px, declared 1px -> 0.8px`
- PASS var(--oc-border-hairline) and a declared `1px` have the SAME used width — `token -> 0.8px, declared 1px -> 0.8px`
- PASS the reference is ORDERED thin < medium < thick, so the probe distinguishes the keywords — `0.8px < 2.4px < 4.8px`
- note: --oc-border-hairline resolves on :root to "1px"; --oc-border-thick to "2px"
- note: MEASURED FRESH IN THIS WINDOW: border-width:thin -> 0.8px; border-width:1px -> 0.8px; border-width:var(--oc-border-hairline) -> 0.8px; medium -> 2.4px; thick -> 4.8px; devicePixelRatio=1.0000000149011612
- note: declared-to-computed ladder in this window: 1px->0.8px 2px->1.6px 3px->2.4px 4px->4px 5px->4.8px — these are declared INPUTS whose computed values are read, not expectations.
- note: A declared 1px does NOT compute to the string "1px" here: it computes 0.8px. That is this display's device-pixel quantization, not a token failure — and it is why every border check below is an EQUALITY against this measured reference rather than against any literal.

### KS-2 — Selector groups validated against the stylesheets, and the validator controlled

- PASS composer/Composer.module.css:15 is a var(--oc-border-hairline) declaration in the stylesheet — `border-top: var(--oc-border-hairline) solid var(--oc-border);`
- PASS composer/Composer.module.css:15 — this driver's selector group matches the stylesheet's own — `stylesheet rule at :8 is ".composer" -> {composer}; this driver carries {composer}`
- PASS composer/Composer.module.css contains no at-rule that could nest a declaration out of this parse — `0 at-rule(s)`
- PASS composer/Composer.module.css:44 is a var(--oc-border-hairline) declaration in the stylesheet — `border: var(--oc-border-hairline) solid var(--oc-border);`
- PASS composer/Composer.module.css:44 — this driver's selector group matches the stylesheet's own — `stylesheet rule at :35 is ".input" -> {input}; this driver carries {input}`
- PASS composer/Composer.module.css contains no at-rule that could nest a declaration out of this parse — `0 at-rule(s)`
- PASS composer/Composer.module.css:70 is a var(--oc-border-hairline) declaration in the stylesheet — `border: var(--oc-border-hairline) solid var(--oc-border-strong);`
- PASS composer/Composer.module.css:70 — this driver's selector group matches the stylesheet's own — `stylesheet rule at :66 is ".send" -> {send}; this driver carries {send}`
- PASS composer/Composer.module.css contains no at-rule that could nest a declaration out of this parse — `0 at-rule(s)`
- PASS permissions/PermissionCards.module.css:27 is a var(--oc-border-hairline) declaration in the stylesheet — `border: var(--oc-border-hairline) solid var(--oc-status-waiting);`
- PASS permissions/PermissionCards.module.css:27 — this driver's selector group matches the stylesheet's own — `stylesheet rule at :21 is ".card" -> {card}; this driver carries {card}`
- PASS permissions/PermissionCards.module.css contains no at-rule that could nest a declaration out of this parse — `0 at-rule(s)`
- PASS permissions/PermissionCards.module.css:85 is a var(--oc-border-hairline) declaration in the stylesheet — `border: var(--oc-border-hairline) solid var(--oc-border);`
- PASS permissions/PermissionCards.module.css:85 — this driver's selector group matches the stylesheet's own — `stylesheet rule at :81 is ".reason" -> {reason}; this driver carries {reason}`
- PASS permissions/PermissionCards.module.css contains no at-rule that could nest a declaration out of this parse — `0 at-rule(s)`
- PASS permissions/PermissionCards.module.css:100 is a var(--oc-border-hairline) declaration in the stylesheet — `border: var(--oc-border-hairline) solid var(--oc-border-strong);`
- PASS permissions/PermissionCards.module.css:100 — this driver's selector group matches the stylesheet's own — `stylesheet rule at :96 is ".action" -> {action}; this driver carries {action}`
- PASS permissions/PermissionCards.module.css contains no at-rule that could nest a declaration out of this parse — `0 at-rule(s)`
- PASS transcript/Transcript.module.css:51 is a var(--oc-border-hairline) declaration in the stylesheet — `border: var(--oc-border-hairline) solid var(--oc-border-strong);`
- PASS transcript/Transcript.module.css:51 — this driver's selector group matches the stylesheet's own — `stylesheet rule at :46 is ".filterToggle,
.unpin" -> {filterToggle, unpin}; this driver carries {filterToggle, unpin}`
- PASS transcript/Transcript.module.css contains no at-rule that could nest a declaration out of this parse — `0 at-rule(s)`
- PASS CONTROL: the validator REJECTS a selector group with a member missing — `offered {filterToggle} against the stylesheet's {filterToggle, unpin} -> rejected`
- note: That control is the class-keyed defect in miniature: {filterToggle} alone is what a one-class-per-declaration map can hold, and the validator rejects it.

### KS-3 — Empty workspace — sweep before any Pod exists

- note: swept 33 elements; 0 converted-declaration hit(s)
- shot: `screenshots/keyword-sweep/01-empty-workspace.png`

### KS-4 — Active Pod — the composer declarations and the GROUPED transcript declaration

- PASS createPod succeeded — `{"ok":true,"value":{"id":"1dea7631-b31d-4cd4-a987-059ff7469460","title":"oc-keyword-sweep","cwd":"C:\\oc-sandbox-keyword-sweep\\repos\\plain`
- PASS a Pod id is known to the driver for the push steps — `1dea7631-b31d-4cd4-a987-059ff7469460`
- PASS composer/Composer.module.css:15 MEASURED on screen and equal to the declared-1px reference on the sides it sets — `via .composer <section> rect=1040.0x186.7 top=0.8px (reference 0.8px)`
- PASS composer/Composer.module.css:44 MEASURED on screen and equal to the declared-1px reference on the sides it sets — `via .input <textarea> rect=1016.0x76.0 top=0.8px right=0.8px bottom=0.8px left=0.8px (reference 0.8px)`
- PASS composer/Composer.module.css:70 MEASURED on screen and equal to the declared-1px reference on the sides it sets — `via .send <button> rect=62.3x28.5 top=0.8px right=0.8px bottom=0.8px left=0.8px (reference 0.8px)`
- PASS transcript/Transcript.module.css:51 (.filterToggle, .unpin) is MEASURED, not `not reached` — `resolved via .filterToggle of group {filterToggle, unpin}; <button> text="Show system events" rect=115.1x25.6; top=0.8px right=0.8px bottom=0.8px left=0.8px`
- PASS that grouped declaration equals the declared-1px reference on all four sides — `top=0.8px right=0.8px bottom=0.8px left=0.8px (reference 0.8px)`
- PASS it resolved through a selector that is NOT the one a class-keyed map would have held (.unpin) — `resolved via .filterToggle`
- note: activated pod-tab:1dea7631-b31d-4cd4-a987-059ff7469460
- note: rendered declarations with an active Pod: composer/Composer.module.css:15 via .composer, composer/Composer.module.css:44 via .input, composer/Composer.module.css:70 via .send, transcript/Transcript.module.css:51 via .filterToggle
- shot: `screenshots/keyword-sweep/02-active-pod-composer-and-transcript.png`

### KS-5 — CONTROL: the border probe discriminates on TOKEN RESOLUTION

- PASS the probe found the .composer element in the live DOM — `_composer_1vr7c_15`
- PASS BASELINE: .composer border-top equals the declared-1px reference — `top=0.8px style=solid (reference 0.8px)`
- PASS CONTROL: with --oc-border-hairline overridden to a non-length, the measured width CHANGES — `baseline top=0.8px -> overridden top=0px (style solid -> none)`
- PASS CONTROL: the overridden width no longer equals the reference — `0px (reference 0.8px)`
- PASS the override was removed and the shipped hairline came back — `top=0.8px (reference 0.8px)`
- shot: `screenshots/keyword-sweep/03-control-token-broken.png`

### KS-6 — Permission cards — .card, .reason and .action through the app's own pushes

- PASS the laneChanged push was sent from the main process — `true`
- PASS the permissionRequested push was sent from the main process — `true`
- PASS a permission card list is in the DOM
- PASS permissions/PermissionCards.module.css:27 MEASURED on screen and equal to the declared-1px reference on all four sides — `via .card <li> rect=991.2x239.9 top=0.8px right=0.8px bottom=0.8px left=0.8px (reference 0.8px)`
- PASS permissions/PermissionCards.module.css:85 MEASURED on screen and equal to the declared-1px reference on all four sides — `via .reason <input> rect=965.6x27.0 top=0.8px right=0.8px bottom=0.8px left=0.8px (reference 0.8px)`
- PASS permissions/PermissionCards.module.css:100 MEASURED on screen and equal to the declared-1px reference on all four sides — `via .action <button> rect=57.3x28.5 top=0.8px right=0.8px bottom=0.8px left=0.8px (reference 0.8px)`
- note: HOW THIS STATE WAS REACHED, stated so the measurement is not read as more than it is: the lane and the pending request were delivered on the app's own `push:laneChanged` and `push:permissionRequested` channels from the main process. No `claude` process ran. Everything between the channel and the pixel — preload bridge, store, React tree, stylesheet, layout — is the shipped code path.
- shot: `screenshots/keyword-sweep/04-permission-card.png`

### KS-7 — Coverage — every enumerated declaration measured, or named unreachable with its reason

- PASS every one of the frozen contract's six converted declarations is enumerated — `6 enumerated as inContract`
- PASS every enumerated declaration is EITHER measured on screen OR carries a reason written before the run — `6/6 contract site(s) measured; 0 unreached, each with a reason`
- PASS every MEASURED declaration equals the declared-1px reference on the sides it sets — `composer/Composer.module.css:15=eq composer/Composer.module.css:44=eq composer/Composer.module.css:70=eq permissions/PermissionCards.module.css:27=eq permissions/PermissionCards.module.css:85=eq permissions/PermissionCards.module.css:100=eq transcript/Transcript.module.css:51=eq`
- PASS no selector group in the coverage table disagreed with its stylesheet — `7/7 group(s) validated`
- note: TALLY (counted over this run's own coverage table): 7 declaration(s) enumerated, of which 6 are the frozen contract's KEYWORD_WIDTH_SITES and 1 is the grouped-selector declaration this session's enumeration fix was written for.

### KS-8 — Safety: the real ~/.claude/settings.json was never written

- PASS the real settings.json is byte-identical (sha256) to before the run — `before=2ce33958d4b55467 after=2ce33958d4b55467`
- PASS no stray settings backup appeared beside it — `none`
- PASS CONTROL: the same backup predicate FLAGS a listing containing settings.json.bak — `settings.json, settings.json.bak`
