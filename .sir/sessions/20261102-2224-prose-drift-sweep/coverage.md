# Coverage

<!-- Definition of done: one row per spec.md item. `Item`, `Covering task`, and
     `Gate 2` are written at Gate 2; `End state` is written at Gate 3. -->

| Item | Covering task | Gate 2 | End state |
|---|---|---|---|
| 1 renderer-state three fields | T1 | covered | met (T1 C1) |
| 2 PodTab.tsx `POD_STATUS_LABEL` | T1 | covered | met (T1 C2) |
| 3 PodTab.test.tsx `POD_STATUS_LABEL` / `pod-status.ts` | T3 | covered | met (T3 C1) |
| 4 pod-stop title `Idle` | T3 | covered | met (T3 C2) |
| 5 PodTab.source.test.ts `styles/raw.d.ts` tense | T3 | covered | met (T3 C3) |
| 6 rules.ts lookahead stated correctly (+ hygiene:807-810 follow-on, Gate 2 E1) | T4 | covered | met (T4 C1, C2) |
| 7 index.ts no "Criterion N" | T5 | covered | met (T5 C1) |
| 8 tokens.css four Lane statuses | T2 | covered | met (T2 C1) |
| 9 tokens.css 1.796 vs 2.173 | T2 | covered | met (T2 C2) |
| 10 design §4.4 → §8 cross-reference | T6 | covered | met (T6 C1) |
| 11 renderer-panels failed `compare()` | T1 | covered | met (T1 C3) |
| 12 renderer-panels phase guard | T1 | covered | met (T1 C4) |
| 13 hygiene shell count (already resolved) | T4 | covered (preserved state) — predicted: already-resolved | met (T4 C3) — prediction confirmed: already resolved, line unedited |
| 14 hygiene literal counts (already resolved) | T4 | covered (preserved state) — predicted: already-resolved | met (T4 C3, as amended by A1/A2) — prediction confirmed: already resolved, lines unedited |
| 15 FINDINGS dated correction | T6 | covered | met (T6 C2–C5) |
| 16 Composer empty-capture clause | T3 | covered | met (T3 C4) |
| 17 tokens.css boundary margin | T2 | covered | met (T2 C3, C4) |
| 18 resume-fallback `abandonedCcSessionId` | T5 | covered | met (T5 C2) |
| 19 openPod/reconnectPod rejected-resume | T5 | covered | met (T5 C3) |
| 20 No executable change | T1–T6 | covered | met (T1 C5, T2 C5, T3 C5, T4 C4, T5 C4; T6 is Markdown only) |
| 21 Typecheck + full suite green | T6 (tail) | covered | met (T6 C6, C7) |

<!-- Contract operations: one row per declared contract operation. `Operation`,
     `Consuming task`, and `Gate 2` are written at Gate 2; `Implementing task`
     and `End state` are written at Gate 3. -->

| Operation | Implementing task | Consuming task | Gate 2 | End state |
|---|---|---|---|---|

No rows: the session has no `contracts/` directory and declares no operation (checked at Gate 3, 2026-11-03).
