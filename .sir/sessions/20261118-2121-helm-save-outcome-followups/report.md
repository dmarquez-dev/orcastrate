sir-sdlc 1.0.46 — Gate 3 report — 20261118-2121-helm-save-outcome-followups

## 1. Decisions needed

**D1:** E2's deferred action, as D12 and the spec's *Not in scope* route it: append this permission-modes row to `.sir/backlog.md`, anchors re-measured at `c40d1bb`?

> Offer every permission mode the SDK declares for new Pods. `@anthropic-ai/claude-agent-sdk` 0.3.235 has no runtime list of modes. `PermissionMode` is a compile-time union of six (`default`, `acceptEdits`, `bypassPermissions`, `plan`, `dontAsk`, `auto`, at `sdk.d.ts:2193`), and `SDKControlInitializeResponse` (`sdk.d.ts:3718`) carries no modes. Orcastrate allows four (`ALLOWED_PERMISSION_MODES`, `src/main/pod/options.ts:29`). Derive the allowed set from the SDK union, with a type-level check that fails the build when the SDK adds or removes a mode. Widen every site that pins the four: the union and checklist at `src/shared/contracts/events.ts:152-157`, the SQLite CHECK at `src/main/store/schema.ts:569` (needs a migration 4, never an edit to `MIGRATION_3_PERMISSION_MODES`), `requirePermissionMode`'s message at `src/main/ipc/validate.ts:76`, and `PERMISSION_MODE_OPTIONS` at `src/renderer/src/contracts/renderer-view.ts:175`. Hide `auto` when the model's `ModelInfo.supportsAutoMode` (`sdk.d.ts:1283`) is false. The New Pod dialog runs before any session exists, so it needs a source for that flag. The options are a value cached from another running Pod's `init`, a probe, or showing `auto` until the first `init` reports otherwise. Recommended: the cached value, falling back to showing `auto`. F5 is adjacent. Check: removing a mode from a local copy of the union fails `npm run typecheck`, and a New Pod dialog test lists all six modes. Source: user's ask at Gate 1 (E1, E2).

- **Append as written** ← *recommended*: E2's answer and the SDK findings in `discussion.md` decided this row at Gate 1, and D12 froze it at Gate 2. Every anchor in it was re-measured at `c40d1bb` with `grep -n`.

## 2. Acceptance criteria

- **T1** · frontend · 26 criteria · 26 met
- **C1, C2, C4, C7, C12, C13** · met · red step, reviewer-reproduced: each failed with the `c40d1bb` production files swapped in. C1 failed `expected [ 'helm-conflict', 'helm-stale' ] to deeply equal [ 'helm-conflict' ]`, C2 failed `expected 1 to be +0`, C7 failed at `:1601` under base, and C12 failed `expected false to be true`. C4 and C7 also failed under the reviewer's stale-guard injection (C4 under `{stale ? (`, C7 alone at `:1603`).
- **C8** · met · reviewer-reproduced: `helm-draft-safety.e2e.test.tsx:207-208` passes, and failed at `:207` under base.
- **C3** · met · injected defect: the implementer deleted the single `{COPY.conflictAdvice}</p>` site (`HelmNotices.tsx:144`). The test failed at `:405`, and the revert was cmp-confirmed.
- **C6** · met · injected defect: the implementer's `false &&` injection at `HelmNotices.tsx:160` failed this test and C5's.
- **C14, C15** · met · injected defect: the implementer's "helmBackupPath wins" injection at `useSaveOutcomeScroll.ts:75` failed them at `:607` and `:616`.
- **C16** · met · injected defect, reviewer-reproduced: the same implementer injection at `:75`, plus the reviewer's `if (conflict !== null)` for `if (actionError === conflict)` at `:62`. Under the reviewer's, this test alone failed (`:626`). Reverted, cmp-confirmed.
- 12 tagged criteria in the 6 rows above. All 26 rows are in `reviews/T1.md`.

**Coverage** (as mapped at Gate 2, with no amendments, checked at Gate 3). 9 of 12 definition-of-done rows are `met` through T1's 26/26. There are no contract operations. Three rows are not settled yet:
- **D9** · decided by human check H1 (below)
- **D11** · applied after approval: removing the three closed backlog rows. The citation sweep over the rows that stay open found no hit outside those three.
- **D12** · applied after approval: the D1 append above

**Limits:** none. Every verification command ran in the worktree.

**Human checks**

H1 (this session, D9): a rejected save shows one conflict banner and no stale banner.
1. Launch from the worktree, with the worktree named as an argument: `npm --prefix C:/Users/dmarq/Development/Repos/orcastrate/.claude-worktrees/20261118-2121-helm-save-outcome-followups run dev`. If you check after the merge instead, use `npm --prefix C:/Users/dmarq/Development/Repos/orcastrate run dev`. I read this command from `package.json`'s `dev` script (`electron-vite dev`) rather than ran it, because running it opens an Electron window on your desktop.
2. Open Helm on a Pod's **project** scope, not `~/.claude/settings.json`, and change a field without saving.
3. In a text editor, edit and save that project's `.claude/settings.json`.
4. Press Save in Helm.
5. **Pass:** one red "Nothing was written" banner. It names the file, gives the Compare/Reload advice and offers Compare. No yellow "This file changed on disk" banner and no "Something went wrong" banner sit beside it, and your typed edit is still in the form. The yellow banner may show *before* you press Save, because the watcher can fire first; that is not a fail, as long as it goes once the red banner appears. Focus moving off Save is not part of the check (Save is disabled while saving, `HelmActionBar.tsx:72`).
6. **Fail:** "changed" appears in two banners, main's own sentence is printed under the red banner's lead, or the yellow banner stays beside the red one.
7. Stop the dev server before you answer the approval, because `cleanup` removes the worktree then.

No other human check is open in `.sir/backlog.md`.

## 3. What ran

- **T1** · sir-frontend-engineer, then sir-reviewer · frontend · opus / opus · 1 review · 0 rounds · 0 redispatches · 840d2cd
- Other dispatches: `init-session` and `commit-T1` (sir-git, haiku), and `decomposition` (sir-architect, opus).
- **Change surface:** `c40d1bb..840d2cd` (merge-base to the tip of `agent/20261118-2121-helm-save-outcome-followups`), 1 commit, 7 files changed, 250 insertions, 54 deletions. The full diff is `git diff c40d1bb..840d2cd`.
- `main` is still at `c40d1bb`, the merge-base, so the merged tree will be the tip's tree. The `^{tree}` comparison runs after the merge.

## 4. Advisory findings

Correctness risks: 1
- `src/renderer/src/helm/useSaveOutcomeScroll.ts:79`: the effect's deps now include `actionError` and `conflict`, so the effect re-runs when they change. `settled` stays false when `saving` did not fall, so behaviour is unchanged, and 'does not scroll on a re-render where no save was in flight' (`HelmPanel.test.tsx:538`) passes. Re-measured at `840d2cd`: `:72-74` return early unless `saving` fell.

Test and CI concerns: 2, in `reviews/T1.md`.

## 5. Metrics

- userInteractions: 3 (Gates 1, 2 and 3; the push question is part of Gate 3)
- escalationsRaised: 2 (E1 and E2, both raised and answered at Gate 1)
- reviewRounds: 0
