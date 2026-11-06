# Remove Helm's dormant warning plumbing

Goal: remove the `warning` validation-severity path from Helm's save pipeline, end to end, so that every validation issue is a blocking error and no code carries a branch that nothing produces.

## Context

- No validator has produced `severity: 'warning'` since the `crossSessionInbound: hold` warning was removed (session `20261105-0107-design-decisions-sweep`). At base `main` 3cb07f5, `grep -rnE "severity: *'warning'" src --exclude='*.test.*'` prints nothing, and its control `severity: *'error'` prints 16. The one `'warning'` severity in `src` is the synthetic test at `HelmPanel.test.tsx:356`.
- The plumbing runs from the shared contract (`HelmValidationSeverity`, `HelmSaveResult.warnings`) through main (`warningIssues`, the `warnings:` field `HelmService.save` returns) and preload (pass-through) to the renderer (`lastSave` → `savedHere` → `HelmNotices`' "Saved with warnings" banner, plus `IssueList`'s warning colour and word). The architect traced this by reading the data flow, not by searching for names (lesson 2026-11-05).
- Gate 1 chose **remove**, over keeping the path as a documented extension point and over giving it a producer.
- The backlog line asking for this decision is `.sir/backlog.md:34`.

## Definition of done

1. `HelmValidationSeverity` is `'error'` and nothing else.
2. `HelmSaveResult` has no `warnings` member, and `HelmService.save` resolves with exactly `document` and `backupDisplayPath`.
3. `warningIssues` no longer exists anywhere in `src` or `tests`.
4. The saved banner has no warnings branch. It always shows the "Saved" heading, the success tone and the backup path.
5. `IssueList` has no warning branch, and it still prints the word "Error" beside every issue.
6. `COPY.warningsHeading`, `COPY.severityWarning` and the `.issueWarning` CSS rule are removed.
7. No fake or stub carries a `warnings` field.
8. The synthetic warning tests are reworded to test the behaviour that remains: the backup-path banner, the shape of the hold-save result, and issue placement.
9. Every docblock that described a `warning` severity now says that every validation issue blocks the save.
10. Error behaviour is unchanged. The same issues are produced, they still block the save, and no rule is added.
11. Unrelated uses of `warning` are untouched: the conflict comment at `helm.ts:37`, `NoticeTone`, the stale notice's tone, and the `.warning` Notice CSS.
12. `npm run typecheck` exits 0, and `npm test` exits 0 with no test deleted.
13. The `.sir/backlog.md` line for this decision is removed at Gate 3 once the removal merges.

## Scope

- **T1 (backend).** Narrow `HelmValidationSeverity` and `HelmSaveResult` in `src/shared/contracts/helm.ts` and reword its `HelmValidation` docblock. Remove `warningIssues` and reword the header docblock in `src/main/helm/validate.ts`. Remove `warnings:` from `HelmService.save`. Reword `tests/unit/helm/validation.test.ts` and tighten its hold-save test. Drop `warnings: []` from `tests/unit/ipc/panel-fakes.ts`.
- **T2 (frontend).** Remove the warnings prop and branch from `HelmNotices`. Stop passing `warnings` from `HelmPanel`. Remove the warning branch from `IssueList`. Remove `COPY.warningsHeading`, `COPY.severityWarning` and `.issueWarning`, and reword the CSS notices comment. Reword the `validateDraft` docblock. Drop `warnings: []` from `stub-api.ts` and `test-fixtures.ts`. Reword the synthetic tests in `HelmPanel.test.tsx` and `issues.test.ts`. Add `IssueList.test.tsx`.

### Not in scope

- Any new validation rule, and any change to `error` behaviour.
- Removing the `severity` field itself. It stays, narrowed to `'error'`.
- `src/preload/api.ts` and `src/renderer/src/contracts/renderer-panels.ts`. They name only the `HelmSaveResult` type, and its narrowing reaches them unchanged.
- `.dir-sdlc/**`, which is history: five files there name the plumbing. `docs/` and `README.md` have no matches.
- Every other backlog item.

## Assumptions

| Question | Answer | Rung | Evidence |
|---|---|---|---|
| Is there any real producer of a `warning` issue? | No. | 1 | `grep -rnE "severity: *'warning'" src --exclude='*.test.*'` prints nothing; control `severity: *'error'` prints 16 (run at 3cb07f5) |
| Keep the `severity` field? | Yes. Narrow `HelmValidationSeverity` to `'error'` so that all 16 `severity: 'error'` producers stay valid unchanged. | 4 | The Gate 1 scope names "the `'warning'` member", not the field; `contracts/helm-validation.ts` |
| What does `IssueList` render? | Every item gets `styles.issueError` and the word `COPY.severityError`. The word stays because colour is never the only carrier of meaning. | 2 | `disciplines/frontend.md`, Accessibility floor; `IssueList.tsx:1-9` |
| What does the saved banner render? | Always `COPY.savedHeading`, tone `success`, and the backup path. No issue list. | 4 | `HelmNotices.tsx:159-171`; the narrowed `HelmSaveResult` |
| Delete the synthetic tests or reword them? | Reword them. The backup-path banner, the hold-save result and issue placement are still real behaviour. | 4 | `HelmPanel.test.tsx:353-370`, `validation.test.ts:104-118`, `issues.test.ts:17-25` |
| Is `helm.ts:37`, "CONFLICT and a warning — never a silent overwrite", part of the plumbing? | No. It describes conflict detection, not a severity. It stays and is pinned by T1 criterion 5. | 1 | Read at `helm.ts:28-41` |
| Is the "BLOCKING / ADVISORY" wording in `validate.ts:2` and `validation.test.ts:2` part of the split? | Yes. It is reworded. The two `ADVISORY` lines in `helm.ts` (`:57`, `:293`) describe `HelmService.watch` and stay. | 1 | Architect's read; T1 criterion 6 control |
| One task or two? | Two, chained T1 → T2, so each reviewer judges one domain. | 1 | `tsconfig.node.json` includes `src/main`, `src/preload`, `src/shared` and `tests/**`, with no import from `src/renderer` (architect's grep), so the node project typechecks at T1's tip on its own |
| May T1's commit leave `typecheck:web` failing? | Yes. The renderer still names `warnings` until T2. The repo-wide `npm run typecheck` sits on T2, the tail of the chain, and T1's commit body says that T2 restores it. The merge is a merge commit, so `main` never holds the broken state. | 2 | Lesson "scoped test gates miss type errors" (repo-wide tsc on the DAG tail); T1 C13 scopes T1 to `typecheck:node` |
| Can tasks build concurrently? | Not relevant. T1 → T2 is ordered by `dependsOn`, so no task runs beside a builder or an injector. | 1 | `manifest.json` `dependsOn` |
| How is the saved banner's tone observed under vitest? | Through the `✓` glyph that `Notice` renders for `success` (`MARKERS.success`, `Notice.tsx:21`). CSS-module class names are not asserted. | 4 | `Notice.tsx:18-23` |
| Is a new `IssueList.test.tsx` in scope? | Yes. The user kept it at Gate 2 (D1). No test covers the "Error" word at base, and it backs definition-of-done item 5. | 1 | Architect's `grep -rnE "COPY\.severity\|'Error'\|IssueList" --include=*.test.*` printed nothing |

## Contracts

- [`contracts/helm-validation.ts`](contracts/helm-validation.ts): the narrowed `HelmValidationSeverity`, `HelmValidationIssue`, `HelmValidation` and `HelmSaveResult`. The source home is `src/shared/contracts/helm.ts`, owned by T1. The `HelmService.save` error cases are unchanged.

## Open questions

None. The user kept `IssueList.test.tsx` in scope at Gate 2.
