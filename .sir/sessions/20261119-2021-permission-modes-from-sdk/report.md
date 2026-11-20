sir-sdlc 1.0.49 — Gate 3 report — 20261119-2021-permission-modes-from-sdk

**Decisions needed:** none blocking — Gate 3 asks a disposition on 1 finding in section 4, and on 1 item the spec routed to the backlog; escalation E1 resolved during implementation with no deferred action, and blocking finding B1 closed in T1's revision round 1.

## 2. Acceptance criteria

- **T1** · database · 25 criteria · 25 met
- **T2** · backend · 18 criteria · 18 met
- **T3** · frontend · 12 criteria · 12 met

Criteria resting on a demonstration: 14 criteria, 13 demonstrations.

- **C4, C10** (T1) · met · reviewer-reproduced · amended by A1 (C4 now ends "Shown in C10." instead of "Shown in C9."): TS2344 at `options.ts(51,3)`, `schema.ts(138,49)` and `(392,3)`, plus web `wording.e2e.test.tsx(62,7)`
- **C9** (T1) · met · reviewer-reproduced (round 1, the review before revision round 1): `typecheck:node` exits 1 at `options.ts(40,3)`, `schema.ts(81,3)` and `(328,3)`. `typecheck:web` exits 1 at `renderer-view.ts(172,3)` and `(211,3)`. The revert compared IDENTICAL
- **C17** (T1) · met · (a) reviewer-reproduced (round 1, the review before revision round 1), (b) injected defect: (a) With the CREATE INDEX line deleted, the run fails with `expected undefined to be 'pods'` (1 failed, 11 passed), and the revert compared IDENTICAL. (b) rests on the implementer's T1/C17b-migration-6.txt
- **C19** (T1) · met · injected defect: `_UncoveredAtSchemaHead` at :391-393 is keyed to MIGRATION_6. The implementer's r2-c19-node.txt shows TS2344 at `schema.ts(391,3)`
- **C20** (T1) · met · injected defect: `_PodStatusCoveredAtSchemaHead` at :407-409 is keyed to MIGRATION_6. The implementer's r2-c20-node.txt shows TS2344 at `schema.ts(407,3)`
- **B7** (T2) · met · injected defect, reviewer-reproduced: The value-only injection at :41 fails only the resolvedModel test (1 failed, 7 passed). The revert was IDENTICAL
- **B11** (T2) · met · injected defect, reviewer-reproduced: Deleting :941 gives 4 failed and 9 passed, including the predicted equal-answer test. The revert was IDENTICAL
- **B17** (T2) · met · reviewer-reproduced: The exact grep printed nothing (exit 1), and its positive control printed line 1 (exit 0). A wider pattern counted 0 over the added lines and the new files
- **F6** (T3) · met · injected defect: Auto and dontAsk each submit their own mode, with no bypass warning and Create enabled. `dangerSelected` still keys on `option.danger`
- **F7** (T3) · met · reviewer-reproduced: With line 68 replaced, the F2 command exits 1 with 2 failed and 19 passed. The two failures are exactly the F4 and F5 tests. The revert compared IDENTICAL
- **F8** (T3) · met · injected defect: The e2e test (:25-39) emits false, opens the dialog, finds no auto and finds dontAsk
- **F9** (T3) · met · injected defect: The e2e test (:41-57) emits false then true and finds auto
- **F10** (T3) · met · reviewer-reproduced: `grep -rlE` over src and tests prints nothing (exit 1). The positive control on lessons.md prints the path

Every row lives in `reviews/T1.md`, `reviews/T2.md` and `reviews/T3.md`.

**Coverage, as mapped at Gate 2, amended where an amendment changed a contract, and checked at Gate 3:** definition-of-done items 1–16 met; operations `PermissionMode`, `PermissionModeOption`, `PERMISSION_MODE_OPTIONS`, `AutoModeSupport` and `useAutoModeSupport` called (two of them pre-existing callers), and `StubAutoModeSupportEmit` called through its test seam. A call site shows that something calls the operation. It does not show that a user can reach it. Exceptions:

- **Item 17** · uncovered at Gate 2, orchestrator's (Gate 2 D3 e) · applied after approval: its evidence is the Gate 3 backlog edit that removes the row "Offer every permission mode the SDK declares for new Pods"
- **`ALLOWED_PERMISSION_MODES`, `requirePermissionMode`, `DONT_ASK_OPTION`, `AUTO_OPTION`** · uncovered at Gate 2, own-task members of T1 with no consumer, not searched (Gate 2 D3 d) · out of scope

**Limits:** none — every verification command ran in the worktree.

**Human checks.** These come from T3's reviewer and no test covers them. Launch command: `npm --prefix C:/Users/dmarq/Development/Repos/orcastrate/.claude-worktrees/20261119-2021-permission-modes-from-sdk run dev`. It comes from `package.json`'s `dev` script (`electron-vite dev`). I read it but did not run it, because running it opens an Electron window on your desktop. The worktree is removed when this gate closes, so after the merge use `npm --prefix C:/Users/dmarq/Development/Repos/orcastrate run dev`. Stop the dev server before you answer the approval, or its folder will outlive cleanup. The cached flag comes from the latest Pod whose `system`/`init` model the SDK's `supportedModels()` answer marks with `supportsAutoMode`. A Pod sends that on its first turn.

- **H1** · New Pod with auto unsupported:
  1. Launch with the command above.
  2. Open or create a Pod running a model that does not support auto mode, and send it one prompt, so its `init` arrives.
  3. Open New Pod.
  4. Pass: five permission-mode radios (default, acceptEdits, plan, dontAsk, bypassPermissions), no "auto", and no gap or broken spacing where it was. Fail: an auto radio, or a visible hole in the list.
- **H2** · Flag changes while the dialog is open:
  1. Launch, and get the flag to one value by sending a prompt in a Pod on one model, as in H1.
  2. Start a Pod on a model with the other auto-mode answer, send its first prompt, and open New Pod at once, before that Pod's `init` arrives.
  3. Watch the radios when the `init` lands.
  4. Pass: auto appears or disappears in place, the dialog keeps its title, folder and selection, and the checked radio still makes sense to you. Note: a hidden auto selection shows as default, and comes back as auto if auto reappears (`NewPodDialog.tsx:126-130`, the section 4 finding). Fail: the dialog resets, or the checked radio confuses you.

## 3. What ran

- **T1** · sir-database-engineer, then sir-reviewer · database · opus / opus · 2 reviews · 1 round · 0 redispatches · 0fc6ec4
- **T2** · sir-backend-engineer, then sir-reviewer · backend · opus / opus · 1 review · 0 rounds · 0 redispatches · 958dbbb
- **T3** · sir-frontend-engineer, then sir-reviewer · frontend · opus / opus · 1 review · 0 rounds · 0 redispatches · 3e22e1f

The other dispatches were sir-architect for the decomposition (opus) and sir-git for `init-session` and for `commit-T1`, `commit-T2` and `commit-T3` (haiku).

**Change surface:** `3bb3007..3e22e1f`, 3 commits, 49 files changed, 1903 insertions, 184 deletions. `git diff 3bb3007..3e22e1f` shows it in full. The base branch has not moved since the branch point: `main` is at 3bb3007, the merge-base.

**Amendments: 1**

- **A1** · `manifest.json` · authorized by E1: T1 C4 ended "Shown in C9." and now ends "Shown in C10."

## 4. Advisory findings

- **Correctness risks: 1**
  - `src/renderer/src/pods/NewPodDialog.tsx:126-130`: a hidden `auto` selection stays in `mode`. If the flag goes from false back to true while the dialog is open, the checked radio switches from default back to auto without telling the user. The code comment there states this as a design choice, and no criterion covers it (T3 A2).
- **Test and CI concerns: 4**, in `reviews/T1.md`, `reviews/T2.md` and `reviews/T3.md`.
- **Cosmetics: 1**, in `reviews/T1.md`.

## 5. Metrics

- **userInteractions** · 4: Gates 1, 2 and 3, and the batched escalation E1. The push question is part of Gate 3.
- **escalationsRaised** · 1
- **reviewRounds** · 1: the sum of section 3's rounds column
