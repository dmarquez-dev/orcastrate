# Coverage

<!-- Definition of done: one row per spec.md item. `Item`, `Covering task`, and
     `Gate 2` are written at Gate 2; `End state` is written at Gate 3. -->

| Item | Covering task | Gate 2 | End state |
|---|---|---|---|
| 1. D1 Helm empty-serialization acknowledgement via `save` | — | uncovered: accepted out of scope (E1, closed as moot: `document.ts:206` never returns `''`) | out of scope |
| 2. D2 failure-leaf import scan | T3 | covered | met |
| 3. D3 orphan marker position | T6 | covered | met |
| 4. D4 `absentControlLabels` exact | T6 | covered | met |
| 5. D5 IPC duplicate-registration guard | T3 | covered | met |
| 6. D6 `recordAttempts` trap | T4 | covered | met |
| 7. D7 every push channel counted | T4 | covered | met |
| 8. D8 exact recursive `sizeBytes` | T5 | covered | met |
| 9. D9 migration-frozen shallow skip | T5 | covered | met |
| 10. D10 watcher waits on a condition | T1 | covered | met |
| 11. D11 `.ndjson` integrity | T5 | covered | met |
| 12. D12 PanelBar open-state selector | T7 | covered | met |
| 13. D13 robust `:root` body end | T7 | covered | met |
| 14. D14 PodBar / DeletePodDialog docblock claims | T7 | covered | met |
| 15. D15 `retiredLiteralUseReport` same-match count | T8 | covered | met |
| 16. G1 positive control per worked item | T1, T3–T8 | covered | met |
| 17. G2 repo-wide typecheck | T8 | covered | met |
| 18. G3 full suite, no test removed | T8 | covered | met |
| 19. G4 no runtime change | T1, T3–T7 (per task), T8 (session-wide) | covered | met |

<!-- Contract operations: one row per declared contract operation. `Operation`,
     `Consuming task`, and `Gate 2` are written at Gate 2; `Implementing task`
     and `End state` are written at Gate 3. -->

| Operation | Implementing task | Consuming task | Gate 2 | End state |
|---|---|---|---|---|
