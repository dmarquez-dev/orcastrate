# Coverage — 2026-08-27-orcastrate-matriarch-pod-status

Gate 2 columns written before the approval that froze `manifest.json`. End state filled at Gate 3 from `reviews/T1.md`–`T5.md` and a content search over the session's touched files.

Change surface: `git diff --name-only a048aec..52a69cc` → **14 files, +1278/−39**, across five commits.

## Definition of done

| Item | Covering task | Gate 2 | End state |
|---|---|---|---|
| 1. `LaneRowVm` carries the Pod status without mixing vocabularies in one attribute | T1 | covered | met |
| 2. `deriveLaneRail` receives it and populates it for the Matriarch, recomputed per snapshot | T3 c1–c3, c6 | covered | met |
| 3. Open Matriarch renders `PodStatus` — word, hue, dot shapes | T4 c2–c4; T5 c2 | covered | met |
| 4. The dot pulses when the Pod is streaming and at no other time | T4 c6; T5 c2 | covered | met |
| 5. Open + idle shows the grey `--oc-border-thick` hollow ring | T4 c5; T5 c2 | covered | met |
| 6. Awaiting permission shows the amber halo; `beached`/`closed` keep square and bar | T4 c5; T5 c3 | covered | met |
| 7. Ended lane: terminal `LaneStatus` wins, today's hue and frozen duration | T3 c4; T4 c2; T5 c4 | covered | met |
| 8. Calf rows byte-unchanged in behaviour, asserted by the `LaneRow.tsx` owner | T4 c11; T3 c5; T5 c5 | covered | met |
| 9. No new status vocabulary; words from `POD_STATUS_LABEL` / `LANE_STATUS_LABEL` | T2 c1; T4 c3; T5 c3 | covered | met |
| 10. Colour never the only carrier — word asserted in the same render | T4 c3, c12; T5 c3 | covered | met |
| 11. Reduced motion stops the pulse, never the dot | T4 c7 | covered | met |
| 12. The emitted animation name still resolves, proved at build level | T4 c14 | covered | met |
| 13. Rail and Pod tab agree, proved jointly in one e2e rendering both surfaces | T5 c2, c3 | covered | met |

## Contract operations

As in the previous session, these contracts declare **pinned values and file paths** rather than callable APIs — they live in `.dir-sdlc/` and the application never imports them. Each row was therefore searched for the **value it pins** in shipped source under `src/renderer/src/`, excluding test files. Command: `grep -rl "<value>" src/renderer/src --include=*.ts --include=*.tsx --include=*.css | grep -v "\.test\."`.

| Operation | Value searched | Implementing task | Consuming task | Gate 2 | End state |
|---|---|---|---|---|---|
| `LaneRowVm.podStatus` | `podStatus` | T1 (`contracts/renderer-state.ts`) | T3 writes, T4 reads, T5 observes | covered | called — written in `state/workspace-provider.tsx`, read in `lanes/LaneRow.tsx` |
| `deriveLaneRail(runtime, nowMs, podStatus)` | the third parameter | T3 | T3 | covered | called — `workspace-provider.tsx:198` |
| `pod?.status ?? 'closed'` at the `lanes:` call site | the fallback expression | T3 | T3 | covered | called — `workspace-provider.tsx:198`, identical to the `deriveComposer` call at `:207` |
| `data-pod-status` attribute | `data-pod-status` | T4 (`lanes/LaneRow.tsx`) | emitted T4, consumed by CSS, queried T5 | covered | called — emitted in `LaneRow.tsx`, consumed by six rules in `LaneRail.module.css` |
| `data-status` (unchanged, lane vocabulary only) | `data-status` | existing | T4 preserves, T5 asserts | covered | called — still holds only `LaneStatus` values; the three positional queries work unedited |
| `POD_STATUS_LABEL` | `POD_STATUS_LABEL` | T2 (`pods/pod-status.ts`) | T4, T5 | covered | called — **`lanes/LaneRow.tsx` and `pods/PodTab.tsx`**, a genuine cross-task consumer |
| `statusToken(podStatus)` → `--pod-status-color` | `statusToken` | existing (`shell/contract-runtime.ts`) | T4 | covered | called — `lanes/LaneRow.tsx`, with the hue landing in `LaneRail.module.css` |
| `@keyframes ocStatusPulse` (local to `LaneRail.module.css`) | `ocStatusPulse` | existing | referenced T4, guarded T4 c9 | covered | called — both lane selectors reference the same hashed name in the emitted bundle |

**No row is `not called`.** The failure this check exists to catch — an operation with an implementer and no consumer — does not occur.

## Orchestrator's own verification at Gate 3

Run on the quiescent branch tip, not inherited from any agent's report:

- `vitest run` → **134 files passed (134), 2096 tests passed (2096)**, zero failures. Baseline before the session: 2089 across 133 files; pre-repair mid-session: 3 failed / 2086 passed.
- `tsc --noEmit -p tsconfig.web.json --composite false` → exit 0
- `git status --porcelain` → empty
- Emitted bundle: LaneRail's `data-status='running'` and `data-pod-status='running'` both reference `_ocStatusPulse_1fdbq_1`; PodBar references its own `_ocStatusPulse_1qe9h_1`. Each module self-references.
