# Coverage

| Item | Covering task | Gate 2 | End state |
|---|---|---|---|
| D1. On a rejected save, "changed" is in exactly one banner, main's sentence is not rendered, and the banner is the lead with its path, the advice and Compare | T1 (C1, C2, C3, C7, C8, C9, C10) | covered | met: T1 26/26 met, every mapped criterion met (reviews/T1.md) |
| D2. No stale banner beside a conflict banner, presentational and end to end | T1 (C4, C7) | covered | met: T1 26/26 met, every mapped criterion met (reviews/T1.md) |
| D3. An on-disk change with no rejected save still warns, and so does the state Discard leaves | T1 (C5, C6) | covered | met: T1 26/26 met, every mapped criterion met (reviews/T1.md) |
| D4. A successful settle with a leftover scope-listing error scrolls to Saved | T1 (C12) | covered | met: T1 26/26 met, every mapped criterion met (reviews/T1.md) |
| D5. A failed settle scrolls to its own banner, never to an older Saved or conflict banner; the 7 existing settle tests pass | T1 (C13, C14, C15, C16, C17) | covered | met: T1 26/26 met, every mapped criterion met (reviews/T1.md) |
| D6. The hook's docblock states the per-outcome rule | T1 (C18) | covered | met: T1 26/26 met, every mapped criterion met (reviews/T1.md) |
| D7. The `HelmPanel.test.tsx` docblock claim is gone and its replacement is true | T1 (C21) | covered | met: T1 26/26 met, every mapped criterion met (reviews/T1.md) |
| D8. The compare()+effect rule holds, the target is derived and not stored, main and the store are byte-identical to `c40d1bb`, and no source cites a session | T1 (C11, C19, C20, C22) | covered | met: T1 26/26 met, every mapped criterion met (reviews/T1.md) |
| D9. Human check H1: a rejected save in the running app shows one conflict banner and no stale banner | orchestrator: the Gate 3 human check, with the state reached by editing a Pod project's `.claude/settings.json` on disk after Helm loads it (T1's C1-C4 and C7 deliver the behaviour) | covered | met: human check H1 passed at Gate 3 (user's observation; launch `npm --prefix <worktree> run dev`) |
| D10. Repo-wide typecheck and suite exit 0 | T1 (C23, C24, C25, C26) | covered | met: T1 26/26 met, every mapped criterion met (reviews/T1.md) |
| D11. Gate 3 removes the three closed rows and re-checks citations in the rows that stay open | orchestrator: the Gate 3 backlog edit, measured after approval with `git diff` of `.sir/backlog.md` and recorded in this file and `report.md`. The end state is written after approval as `applied in the Gate 3 backlog edit` | covered | applied in the Gate 3 backlog edit: the three rows were removed (`grep -c "20261118-1810-helm-save-outcome-in-view" .sir/backlog.md` prints 0); the citation sweep over the open rows found no hit for a file in `c40d1bb..840d2cd` |
| D12. Gate 3 appends the permission-modes row | orchestrator: the same Gate 3 backlog edit, with the same evidence site and the same end-state wording | covered | applied in the Gate 3 backlog edit: the permission-modes row was appended as written (`git diff --stat -- .sir/backlog.md` printed 1 insertion, 3 deletions) |

| Operation | Implementing task | Consuming task | Gate 2 | End state |
|---|---|---|---|---|
