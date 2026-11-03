sir-sdlc 1.0.14 — Gate 3 report — 20261103-1657-tests-and-guards-sweep

**Decisions needed:** none. E1 was resolved at Gate 2 with no deferred action, and T7's one blocking finding (B1) was closed within its revision round.

## 2. Acceptance criteria

| Task | Domain | Criteria | Met |
|---|---|---|---|
| T1 | test | 8 | 8 |
| T3 | test | 7 | 7 |
| T4 | test | 10 | 10 |
| T5 | test | 10 | 10 |
| T6 | test | 8 | 8 |
| T7 | test | 14 | 14 |
| T8 | test | 7 | 7 |

No criterion is `not met`, and no amendment changed one. The 55 criteria below have a demonstration tag (verdicts from the final round):

- T1.4 D10 latency control `[injected defect]`: a 60 ms delay at `watcher.ts:126` turned the ce1cd36 file red with 5 named failures. The rewritten file passed 11/11.
- T1.5 D10 discrimination control `[injected defect]` `[reviewer-reproduced]`: suppressing the push gave 6 failed and 5 passed, the six failures being exactly the push-waiting tests, each with `timed out after 2000 ms`. The injection was reverted, and `git diff --exit-code` exits 0.
- T1.7 Helm directory `[reviewer-reproduced]`: 8 files and 60 tests passed.
- T1.8 G4 `[reviewer-reproduced]`: only `helpers.ts` and `watcher.test.ts` changed, and `watcher.ts` has no diff.
- T3.1 D2 import forms `[red step]` `[reviewer-reproduced]`: the old scan finds nothing for the bare, double-quoted and semicolon-less forms. The new scan finds one statement for each, and both return `[]` on the near-misses.
- T3.2 D2 zero is a failure `[injected defect]`: every loop goes through `eachStatement`, which fails when it finds zero statements. Deleting `failure.ts:24` fails two of the loops.
- T3.3 D2 injected defect `[injected defect]` `[reviewer-reproduced]`: a double-quoted import and a semicolon-less import were each injected at `failure.ts:25`. The ce1cd36 file stayed green and the new file went red (3 failed) for each.
- T3.5 D5 injected defect `[injected defect]`: deleting the guard at `handlers.ts:106-108` turned the new file red (2 failed), while `channels.test.ts` stayed green at 21/21.
- T3.6 `tests/unit/ipc` run `[reviewer-reproduced]`: 9 files and 157 tests passed.
- T3.7 G4 `[reviewer-reproduced]`: `failure.ts` and `handlers.ts` have no diff from ce1cd36 (exit 0).
- T4.1 D6 forwarding `[red step]`: the two-argument fake receives `['first','second']` with the correct `this`, using `Reflect.apply`.
- T4.2 D6 stable identity `[red step]`: `proxy[m] === proxy[m]` holds for all 5 push methods, and the table of methods is pinned to `createPushes`.
- T4.3 D6 red step `[red step]`: the ce1cd36 trap produced `[ 'first', undefined ]` and failed the identity check for all 5 methods.
- T4.4 D7 harness-wide rule `[injected defect]`: the rule is enforced in `makeManagerHarness`'s `dispose()`. The census is 5 files, all green under a shuffled run.
- T4.5 D7 every channel counted `[injected defect]`: `closePod` is held to its whole-record delta with `toEqual`, keyed from `createPushes`.
- T4.6 D7 injected defect, harness-wide `[injected defect]`: an empty `podEvent` push at `pod-manager.ts:455` is green under the ce1cd36 helpers and red under the task's harness (31 tests).
- T4.7 D7 injected defect, whole-record `[injected defect]`: an extra `podStatus` push at `:518` is green at ce1cd36 and red in the task (expected 1, received 2).
- T4.8 Isolation `[reviewer-reproduced]`: a shuffled run with seed 1793727485716 passed 8 files and 95 tests.
- T4.9 Scoped run `[reviewer-reproduced]`: 8/8 files and 95/95 tests passed, with none skipped.
- T4.10 G4 `[reviewer-reproduced]`: `pod-manager.ts` has no diff from ce1cd36 (exit 0).
- T5.2 D8 injected defect `[injected defect]`: dropping directory children at `walk.ts:71` gives `expected 48 to be 58` in the task, while ce1cd36 stays green.
- T5.3 D9 shallow skip `[reviewer-reproduced]`: a shallow `GIT_DIR` gives 1 passed and 5 skipped, with the skip reason printed. Under a stricter reading of the criterion the reporter itself would print the annotation, which is advisory below.
- T5.4 D9 real fault not hidden `[injected defect]`: a bogus `SHIPPED_BLOB[2]` gives 1 failed with none skipped.
- T5.5 D9 full clone `[reviewer-reproduced]`: 6 tests passed with none skipped.
- T5.6 D11 integrity `[reviewer-reproduced]`: the reviewer recomputed `git show ce1cd36:<p> | sha256sum` for all 10 files, and every hash matches.
- T5.8 D11 injected defect `[injected defect]`: changing one byte in `foreground-shipped.ndjson` turns the test red and names the file. A CRLF→LF control stays green.
- T5.9 Scoped suite `[reviewer-reproduced]`: 17 files and 201 tests passed, with none skipped.
- T5.10 G4 `[reviewer-reproduced]`: every injection-only file has an empty diff from ce1cd36.
- T6.2 D3 injected defect `[injected defect]`: moving the orphan block above the path leaves ce1cd36 green at 14/14 and turns the task red with "expected +0 to be 4".
- T6.4 D4 Save `[injected defect]`: deleting the Save button leaves ce1cd36 green on the target test and turns the task red, naming `"Save"`.
- T6.5 D4 Discard `[injected defect]`: deleting the Discard button leaves ce1cd36 green at 4/4 and turns the task red, naming `"Discard changes"`.
- T6.6 D4 Reload `[injected defect]`: deleting the Reload button leaves ce1cd36 green at 4/4 and turns the task red, naming `"Reload from disk"`.
- T6.7 Scoped run `[reviewer-reproduced]`: 2 files and 19 tests passed.
- T6.8 G4 `[reviewer-reproduced]`: `BeachcomberRow.tsx` and `HelmActionBar.tsx` have no diff (exit 0).
- T7.1 D12 `[reviewer-reproduced]`: Panels passes 14/14, with 4 new open-state tests.
- T7.2 D12 class revert `[injected defect]`: changing `:43` to `.buttonOpen` leaves ce1cd36 green and gives 2 failed in the task.
- T7.3 D12 value dropped `[injected defect]`: changing it to `.button[aria-current]` leaves ce1cd36 green and gives 3 failed in the task.
- T7.4 D12 paint removed `[injected defect]`: deleting the `background` turns the task red with "declares no background".
- T7.5 D13 `[red step]`: swapping ce1cd36's `indexOf('}')` back in loses `--fx-quoted` and `--fx-late`, which the brace matcher finds.
- T7.6 D13 near-miss `[injected defect]`: the `--fx-outside` fixture fails under an injected `lastIndexOf`.
- T7.7 D14 PodBar bare lengths `[injected defect]` `[reviewer-reproduced]`: injecting `margin: -1px` turns `:403` red. This criterion was not met in round 1 and was fixed by B1.
- T7.8 D14 PodBar border widths `[injected defect]`: the test is red when `.newPod` is set to `1px solid …`.
- T7.9 D14 PodBar tracking `[injected defect]`: the test is red when tracking is set to `--oc-tracking-tight`.
- T7.10 D14 DeletePodDialog lengths `[injected defect]` `[reviewer-reproduced]`: injecting `margin: -1px` into `.button` turns the test red. Not met in round 1, fixed by B1.
- T7.11 D14 DeletePodDialog raw values `[injected defect]` `[reviewer-reproduced]`: both `margin: -1px` and `line-height: 1.4` turn the test red, and the `var(--oc-space-6)` near-miss stays clean. Not met in round 1, fixed by B1.
- T7.12 Needle assembly and hygiene `[reviewer-reproduced]`: the fixtures are assembled from fragments, and hygiene passes 41/41.
- T7.13 Scoped 5-file run `[reviewer-reproduced]`: 6 files and 115 tests passed, hygiene included.
- T7.14 G4 `[reviewer-reproduced]`: the three `.module.css` files have no diff from ce1cd36 (exit 0).
- T8.1 D15 prefix not counted `[red step]` `[reviewer-reproduced]`: restoring `split(literal)` fails exactly the new test (1 failed, 41 passed).
- T8.2 D15 preserved behaviour `[injected defect]`: each quote-class narrowing fails the fixture for its own quote style.
- T8.3 HV `[reviewer-reproduced]`: hygiene passes 42/42 with none skipped.
- T8.4 G2 `[reviewer-reproduced]`: `npm run typecheck` exits 0 (node and web).
- T8.5 G3 `[reviewer-reproduced]`: `npm test` passes 145 files and 2329 tests, against a floor of 2274.
- T8.6 G3 no test removed `[reviewer-reproduced]`: every touched file's head count is at or above its floor.
- T8.7 G4 session-wide `[reviewer-reproduced]`: 17 paths changed (4 added, 13 modified). No non-test file under `src/` changed and no `.ndjson` file changed, confirmed with a positive control on the predicate.

The remaining 9 criteria have no tag: T1.1–3, T1.6, T3.4, T5.1, T5.7, T6.1 and T6.3. Every row is in `reviews/<task-id>.md`.

**Coverage** (as mapped at Gate 2 and checked at Gate 3): 18 of 19 definition-of-done rows are met. One row is an exception: item 1 (D1) was uncovered at Gate 2 and accepted out of scope under E1, because `document.ts:206` never returns `''`. Its end state is `out of scope`. There are no contract operations (`contracts: []`).

**Limits:** none — every verification command ran in the worktree.

## 3. What ran

| Task | Agent | Domain | Model | Reviews | Rounds | Redispatches | Commit |
|---|---|---|---|---|---|---|---|
| T1 | sir-test-engineer | test | opus | 1 | 0 | 0 | b0f2bf8 |
| T3 | sir-test-engineer | test | opus | 1 | 0 | 0 | 5d92a5e |
| T4 | sir-test-engineer | test | opus | 1 | 0 | 0 | aced629 |
| T5 | sir-test-engineer | test | opus | 1 | 0 | 0 | 462077d |
| T6 | sir-test-engineer | test | opus | 1 | 0 | 0 | d949990 |
| T7 | sir-test-engineer | test | opus | 2 | 1 | 0 | 67878fb |
| T8 | sir-test-engineer | test | opus | 1 | 0 | 0 | 58f6c25 |

The models in that table come from the dispatch lines in `log.md`. Other agents dispatched: `sir-architect` (opus) for the decomposition; `sir-reviewer` (opus) 8 times; and `sir-git` (haiku) for `init-session` and 7 `commit-task` operations.

**Change surface:** `ce1cd36..58f6c25` (7 commits), touching 17 files with 1252 insertions and 129 deletions. `git diff ce1cd36..58f6c25` produces the full diff.

## 4. Advisory findings

**Correctness risks (2)**
- `PodBar.styles.test.ts:469`: the border-width predicate rejects a multi-value longhand such as `border-width: var(--oc-border-hairline) 0`, which is stricter than the docblock. No such declaration exists today. (T7)
- `hygiene.test.ts:1331`: the retired-id offender scan uses `text.includes(literal)`, so it still matches substrings. This is the same shape as D15. The spec routed it here as well, citing `:1325`. (T8)

**Test and CI concerns (5).** See `reviews/T1.md`, `T4.md`, `T5.md`, `T6.md` and `T7.md`.

**Cosmetics (2).** See `reviews/T1.md` and `T6.md`.

## 5. Metrics

- `userInteractions`: 3 (Gate 3 included; the push question is not counted yet)
- `escalationsRaised`: 1
- `reviewRounds`: 1, which equals the sum of the Rounds column
