# Coverage

| Item | Covering task | Gate 2 | End state |
|---|---|---|---|
| 1. `HelmValidationSeverity` is `'error'` only | T1 (C1) | covered | met (T1 C1) |
| 2. `HelmSaveResult` has no `warnings`; `save` resolves with exactly two keys | T1 (C2, C10) | covered | met (T1 C2, C10) |
| 3. `warningIssues` gone from `src` and `tests` | T1 (C3); T2 (C1) | covered | met (T1 C3; T2 C1) |
| 4. Saved banner: always "Saved", success, backup path | T2 (C6, C7, C8) | covered | met (T2 C6, C7, C8) |
| 5. `IssueList` has no warning branch and still prints "Error" | T2 (C9–C13) | covered | met (T2 C9–C13) |
| 6. `warningsHeading`, `severityWarning`, `.issueWarning` removed | T2 (C1, C2, C14) | covered | met (T2 C1, C2, C14) |
| 7. No fake or stub carries `warnings` | T1 (C4); T2 (C2, C5) | covered | met (T1 C4; T2 C2, C5) |
| 8. Synthetic warning tests reworded | T1 (C10); T2 (C7, C16) | covered | met (T1 C10; T2 C7, C16) |
| 9. Docblocks say every issue blocks the save | T1 (C6–C9); T2 (C12, C13, C15) | covered | met (T1 C6–C9; T2 C12, C13, C15) |
| 10. Error behaviour unchanged | T1 (C11, C12, C14); T2 (C15, C18) | covered | met (T1 C11, C12, C14; T2 C15, C18) |
| 11. Unrelated `warning` uses untouched | T1 (C5, C6); T2 (C2, C4, C14) | covered | met (T1 C5, C6; T2 C2, C4, C14) |
| 12. `npm run typecheck` and `npm test` exit 0, no test deleted | T2 (C17, C18) | covered | met (T2 C17, C18) |
| 13. Backlog line removed at Gate 3 | orchestrator | orchestrator: no task has `.sir/backlog.md`. Evidence: `grep -c "dormant warning plumbing" .sir/backlog.md` in the main checkout prints 0 after the Gate 3 backlog edit (prints 1 at base). That edit follows approval, so the approved report renders this row `removed after approval` and the row is filled from the post-edit grep. Predicted: met | met — removed after approval: `grep -c "dormant warning plumbing" .sir/backlog.md` in the main checkout printed 0 after the edit (1 before); `wc -l` went 39 → 38. Prediction confirmed |

| Operation | Implementing task | Consuming task | Gate 2 | End state |
|---|---|---|---|---|
| `HelmService.save` → `HelmSaveResult` (via `window.api.helm.save`) | T1 (definition site `src/main/helm/helm-service.ts:167`) | T2 (`panel-store.ts` save action stores `lastSave`; `HelmPanel.tsx` reads `backupDisplayPath`) | covered. Predicted: called (pre-existing) | called — `src/renderer/src/state/panel-store.ts:725` (`api.helm.save({`), the one survivor of the first search over `git diff --name-only 3cb07f5..agent/20261106-2050-helm-warning-plumbing`. Prediction refuted on its qualifier only: the call is present at base (`git show 3cb07f5:src/renderer/src/state/panel-store.ts` has it at :725), but it survived the first search, which labels plain `called`; `(pre-existing)` is the fallback search's label, and the fallback did not run |
