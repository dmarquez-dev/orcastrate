# Coverage — 2026-08-27-orcastrate-indicator-collapse

Gate 2 columns written before the approval that froze `manifest.json`. End state filled at Gate 3 from `reviews/T1.md`–`T3.md` and from a content search over the session's touched files.

Change surface: `git diff --name-only f042fc3..0dd8468` → 19 files, +790/−485, across three commits.

## Definition of done

| Item | Covering task | Gate 2 | End state |
|---|---|---|---|
| 1. `PodTab.tsx` drops the mount; `statusDot` keeps its `statusToken(status)` hue | T1 c1–c3 | covered | met |
| 2. Pod tab dot animates under `running` and no other status | T1 c3 | covered | met |
| 3. Pod tab `idle` is a hollow ring at `--oc-status-idle`, border `--oc-border-thick` | T1 c5 | covered | met |
| 4. Pod tab `waiting` / `beached` / `closed` rules unchanged | T1 c5 | covered | met |
| 5. Pod tab `srOnly` sentence still opens with `STATUS_LABEL[status]` | T1 c6 | covered | met |
| 6. `LaneRow.tsx` drops the mount | T2 c1 | covered | met |
| 7. Lane `.dot` animates under `running` and no other lane status | T2 c3, c4 | covered | met |
| 8. `LANE_STATUS_LABEL` unchanged; no `Active`/`Waiting` vocabulary | T2 c2 | covered | met |
| 9. All seven files under `activity/` deleted | T3 c1 | covered | met |
| 10. `*.tsx?raw` declaration re-homed to `styles/raw.d.ts`; `tsc` exits 0 | T3 c2, c3 | covered | met |
| 11. "Nothing schedules a frame" source guard re-homed to both mount sites | T1 c8, T2 c8 | covered | met |
| 12. `prefers-reduced-motion` guarantee asserted for both surfaces | T1 c4, T2 c5 | covered | met |
| 13. Every `WORKING_INDICATOR_TEST_ID` site replaced, not deleted | T1 c7, T2 c7 | covered | met |
| 14. Drift guard exists and is seen failing against an injected drift | T3 c5–c7 | covered | met |
| 15. Build proves keyframe and `animation:` name agree, literal strings reported | T3 c4 | covered | met |
| Accounting that no deleted suite's obligation was dropped | T3 c9 | covered | met |
| "Not in scope" sentence on the stopped/waiting hue adjacency | — (prose obligation on `spec.md`) | covered — written into `spec.md` `### Not in scope`; not a code deliverable | met |

## Contract operations

**A note on what this table can mean for this session.** The standard check searches the touched files for each declared operation's name and records the call site. These two contracts declare **pinned values and file paths**, not callable operations: they live in `.dir-sdlc/`, are never imported by the application, and are consumed by agents as specification. A literal name search would report every row `not called` and would be misleading rather than informative.

So the faithful analogue was run instead, and it is the one that serves the check's actual purpose — proving the product does the thing: **each row was searched for the VALUE it pins, in the shipped source under `src/renderer/src/`.** Command: `grep -rl "<value>" src/renderer/src --include=*.css --include=*.ts --include=*.tsx`.

| Operation | Value searched | Implementing task | Consuming task | Gate 2 | End state |
|---|---|---|---|---|---|
| `PULSE_KEYFRAME_NAME` | `ocStatusPulse` | T1, T2 (declared once each) | T1 c3, T2 c4, T3 c5 | covered | called — `pods/PodBar.module.css`, `lanes/LaneRail.module.css` (plus 3 test files) |
| `PULSE_KEYFRAME_BODY` | keyframe body text | T1, T2 | T1 c3, T2 c4, T3 c5 | covered | called — both module stylesheets; agreement asserted by `styles/status-motion.styles.test.ts` |
| `PULSE_ANIMATION_TAIL` | `1.4s ease-in-out infinite` | T1, T2 | T1 c3, T2 c4 | covered | called — `pods/PodBar.module.css`, `lanes/LaneRail.module.css` |
| `PULSE_SELECTOR.podTab` | `.statusDot[data-status='running']` | T1 | T1 c3 | covered | called — `pods/PodBar.module.css` |
| `PULSE_SELECTOR.laneRow` | `.status[data-status='running'] .dot` | T2 | T2 c4 | covered | called — `lanes/LaneRail.module.css` |
| `REDUCED_MOTION_QUERY` | `prefers-reduced-motion` | T1, T2 | T1 c4, T2 c5, T3 c5 | covered | called — both module stylesheets |
| `REDUCED_MOTION_DECLARATION` | `animation: none` | T1, T2 | T1 c4, T2 c5, T3 c5 | covered | called — both module stylesheets |
| `StatusDotMotionSurface` | (type, spec-only) | — | T3 c5 | covered | out of scope for a runtime search — a type alias naming the two surfaces; both surfaces exist and are guarded |
| `DELETED_FILES` | the seven paths | T3 | T3 c1 | covered | called — all seven deleted in `0dd8468`; `src/renderer/src/activity` no longer exists |
| `IMPORTERS` | `from '../activity'` | T1, T2 | T1 c1, T2 c1 | covered | called — zero live importers remain; the only surviving occurrences are forbidden-token lists asserting absence |
| `SOURCE_GUARD` | the four scheduling primitives | T1, T2 | T1 c8, T2 c8 | covered | called — `pods/PodTab.source.test.ts`, `lanes/LaneRow.source.test.ts` |
| `SOURCE_GUARD_FORBIDDEN_TEXT` | the three retired names | T1, T2 | T1 c8, T2 c8 | covered | called — both source tests |
| `REDUCED_MOTION_GUARD` | the assertion | T1, T2 | T1 c4, T2 c5 | covered | called — `pods/PodBar.styles.test.ts`, `lanes/LaneRail.styles.test.ts` |
| `RAW_TSX_DECLARATION_HOME` | `src/renderer/src/styles/raw.d.ts` | T3 | T3 c2 | covered | called — exactly one `declare module '*.tsx?raw'` in the tree, at `styles/raw.d.ts:28`, verified by orchestrator grep |
| `DRIFT_GUARD` | `styles/status-motion.styles.test.ts` | T3 | T3 c5–c7 | covered | called — file exists, six tests, seen failing under co-drift |
| `RetirementObligationOwner` | (type, spec-only) | — | T3 c9 | covered | out of scope for a runtime search — the accounting it types is discharged in `reviews/T3.md` c9 |

**No row is `not called`.** The one row class this check exists to catch — an operation with an implementer and no consumer — does not occur here.

## Orchestrator's own verification at Gate 3

Run on the quiescent branch tip, not inherited from any agent's report:

- `vitest run` → **131 files passed (131), 2041 tests passed (2041)**
- `tsc --noEmit -p tsconfig.web.json --composite false` → exit 0
- `tsc --noEmit -p tsconfig.node.json --composite false` → exit 0
- `git status --porcelain` → empty
