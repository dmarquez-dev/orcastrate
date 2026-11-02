sir-sdlc 1.0.12 — Gate 3 report — 20261102-1908-rejected-resume-hardening

**Decisions needed:** none.

## 2. Acceptance criteria

| Task | Domain | Criteria | Met |
|---|---|---|---|
| T1 — Narrow `classifyStartupFailure` so `RESUME_FAILED` requires wording that names the session | backend | 9 | 9 |
| T2 — Clear the abandoned `ccSessionId` before the fresh retry | backend | 15 | 15 |
| T3 — Trim closed backlog lines and run the repo-wide gate | architecture | 8 | 8 |

**Not met:** none.

**Criteria resting on a demonstration:**

| Task | # | Tag | Evidence |
|---|---|---|---|
| T1 | 1 | red step; injected defect; reviewer-reproduced | The new `resume`-only test went red against the fa113f2 regex and with `resume\|` restored (`expected 'RESUME_FAILED' to be 'SPAWN_FAILED'`). The reviewer reproduced it: 2 failed \| 21 passed (23). |
| T1 | 2 | injected defect | The `No conversation found with session ID: …` test failed with `no conversation found\|` removed. |
| T1 | 3 | injected defect | The `Session not found in any project directory` test was the only failure with `\bsession not found\b\|` removed. |
| T1 | 4 | injected defect | The `Invalid session ID. Must be a valid UUID.` test was the only failure with `\binvalid session id\b\|` removed. |
| T1 | 5 | injected defect | The `Invalid session_id: contains unsafe characters` test was the only failure with `\|\binvalid session_id\b` removed. |
| T1 | 6 | red step; injected defect; reviewer-reproduced | The `session started; working directory not found` test failed at fa113f2 and with the unbounded `session .*not found` restored. |
| T2 | 1 | red step; reviewer-reproduced | The stored `ccSessionId` is null after the fallback and before `onSessionId`. Reverted: `expected 'cc-gone' to be null`. |
| T2 | 2 | red step; reviewer-reproduced | A close and reopen in the window sends no `resume`. Reverted: `expected 'cc-gone' to be undefined`. |
| T2 | 3 | red step; reviewer-reproduced | With a `refusesToResume('cc-gone')` double, a reopen gives 1 notice and `idle`. Reverted: `length of 1 but got 2`. |
| T2 | 4 | red step; reviewer-reproduced | A reconnect in the window sends no `resume`. Reverted: `expected 'cc-gone' to be undefined`. |
| T2 | 5 | red step; reviewer-reproduced | A failed retry leaves the Pod beached with a null id. Reverted: `expected 'cc-gone' to be null`. |
| T2 | 6 | red step; reviewer-reproduced | A reconnect after the failed retry sends no `resume`. Reverted: `expected 'cc-gone' to be undefined`. |
| T2 | 7 | red step; injected defect; reviewer-reproduced | The store is already null inside the retry runner's `start()`. A clear-after-success injection failed exactly #5–#7. |
| T3 | 1 | reviewer-reproduced | The `process.cwd()` item is deleted. `git grep -cF` over the six files finds 0 at 4be18c5 and 1 per file at 4be18c5^. |
| T3 | 7 | reviewer-reproduced | `npm --prefix <worktree> test` exited 0: Test Files 141 passed (141), Tests 2274 passed (2274). |
| T3 | 8 | reviewer-reproduced | `npm --prefix <worktree> run typecheck` exited 0 for both node and web, with no diagnostics. |

Every row is in `reviews/T1.md`, `reviews/T2.md`, and `reviews/T3.md`.

**Coverage, as mapped at Gate 2, amended where an amendment changed a contract, and checked at Gate 3:** all 10 definition-of-done rows are met. One exception: the four null-id comments were uncovered at draft, added to T2 by a Gate 2 decision, and met (T2 #12–#15). There are no contract-operation rows because `manifest.json` declares no contracts.

**Limits:** none — every verification command ran in the worktree.

## 3. What ran

| Task | Agent | Review dispatches | rounds | redispatches | Commit |
|---|---|---|---|---|---|
| T1 | sir-backend-engineer (opus) | 1 (sir-reviewer, opus) | 0 | 0 | 94a9285 |
| T2 | sir-backend-engineer (opus) | 1 (sir-reviewer, opus) | 0 | 0 | 3790f24 |
| T3 | sir-architect (opus) | 1 (sir-reviewer, opus) | 0 | 0 | bb796d8 |

The session also dispatched sir-architect once for decomposition and sir-git (haiku) once for init-session and three times for commit-task.

**Change surface:** `fa113f2..bb796d8`, which is `git merge-base main sir/20261102-1908-rejected-resume-hardening` to the branch tip. It covers 3 commits and 10 files changed, with 258 insertions and 16 deletions (`git diff --stat`). Run `git diff fa113f2..bb796d8` to see the full diff.

## 4. Advisory findings

**Correctness risks (2):**
- A1. `src/main/pod-manager/resume-fallback.ts:63-67`: the `abandonedCcSessionId` doc says the row's id "is overwritten by the fresh session moments later". That is now incomplete, because the row is nulled first and stays null if the retry fails. The file is outside T2's owns.
- A2. `src/main/pod-manager/pod-manager.ts` ~447/~467: the `openPod`/`reconnectPod` docblocks still describe a null id only as "never reached its first turn".

**Cosmetics:** 1 finding, in `reviews/T2.md`.

## 5. Metrics

`userInteractions: 3` · `escalationsRaised: 0` · `reviewRounds: 0`

These are the interactions so far. The push question has not been asked yet, so it is not counted here.
