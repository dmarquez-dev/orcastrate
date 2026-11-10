sir-sdlc 1.0.26 — Gate 3 report — 20261109-2239-fork-ui-followups

**Decisions needed:** none. All four escalations are resolved: E1 and E2 at Gate 2, and E3 and E4 by amendments A1 and A2. None of them left a deferred action for the backlog.

## 2. Acceptance criteria

| Task | Domain | Criteria | Met |
|---|---|---|---|
| T1 | frontend | 13 | 13 |
| T2 | test | 22 | 22 |

The criteria below either have a demonstration tag or were changed by an amendment. These 9 rows cover 20 criteria: 1 row is the amended criterion, and the other 8 rows are demonstrations covering 19 tagged criteria.

| Criteria | Tag | Evidence |
|---|---|---|
| T1 C2 | amended (A1, E3) | The requirement is now that each title keeps its width; the `pod-bar` element's own width may change. On the pre-amendment wording the reviewer recorded `not met (letter)`. Under A1 the declarations are named and asserted (`PodsChrome.module.css:13-16`, `:39`), and the scored evidence is O17 (T2 C5). |
| T1 C3 | injected defect | With `flex: 1 1 0;` removed at `PodsChrome.module.css:39`, `fork-error-layout.styles.test.ts` failed 1 test at `:96`. Restored, it passed 8/8. |
| T1 C5 | red step | Before `title={forkError}` was added, `pod-fork.e2e.test.tsx:471-477` failed with `expected null to be …` (1 failed of 31). After it, 31 passed. |
| T1 C6 | injected defect | With `{forkError}` wrapped in a `<span>`, the test failed: `expected <span></span> to be an instance of Text`. Restored, it passed. |
| T1 C12, C13 | reviewer-reproduced | Typecheck exited 0. `npm test` passed 158/158 files and 2554/2554 tests. |
| T2 C5, C6, C7, C8, C14 | injected defect | In-window controls. O17's half-width `max-width` cut 5 of 5 titles. O18's `top: 37.2px` pushed 3 of 3 line boxes outside. O11 had shift − h = 0.000. O1–O10 and O12–O16 all fired, and O10 was judged under A2. PLAN has an injection and a prediction for O1–O18. |
| T2 C2, C3 | reviewer-reproduced | Read with `python -I`: `CLAUDE_CONFIG_DIR` is None, and the sandbox `userData` and the real settings sha are the same before and after. `meta` has 14 keys equal to §B. |
| T2 C15, C17, C18, C19, C20 | reviewer-reproduced | The findings table is 1 header plus 18 rows, 9 fields each. FINDINGS sha `a64dca0a…4f75` matches the scratch copy. `.sir/` greps print 0. The earlier-artifact hash is `b7be6357…d38d` over 106 files. README numstat is `5 0`. |
| T2 C21, C22 | reviewer-reproduced | At the tip, typecheck exited 0 and `npm test` passed 158/158 files and 2554/2554 tests. |

Every row is in `reviews/T1.md` and `reviews/T2.md`.

**Coverage.** This is coverage as mapped at Gate 2, amended where A2 changed the contract, and checked at Gate 3. DoD items 1–14 are `met`. Contract §A is `applied`: T1 kept the hooks and the driver reads them. Exceptions:
- DoD 15 (the Gate 3 backlog edit) was uncovered at Gate 2 and is the orchestrator's. It is `pending (applied after approval)`: O11 is `pass`, so the edit removes the fork-hardening centring row and the five fork-ui-human-checks rows this session covered.
- §B (driver invocation and `meta` shape) was uncovered at Gate 2 and read by the orchestrator. It is `applied`: `python -I` printed 14 keys, equal to §B; `exitCode` 0, `sandboxRemoved` True, `precondition` None.
- §C rows O11, O14, O16, O17 and O18 were uncovered at Gate 2 and read by the orchestrator. They are `applied`: each is `pass` with `control.fired` True, and none of the 18 observations is anything other than `pass`.
- §C row O10 over painted line boxes is `amended` (A2, E4) and `applied`: it is `pass` and fired, with 3 painted line boxes of 10 raw.

**Limits:** none. Every verification command ran in the worktree.

**Human checks.** You can run these now against the worktree with `npm --prefix C:\Users\dmarq\Development\Repos\orcastrate\.claude-worktrees\20261109-2239-fork-ui-followups run dev`. The worktree is removed when this gate closes. After the merge, run `npm run dev` in the repository root instead.
- Make a fork fail, then hover the clamped fork-error text. Check that the native tooltip shows main's whole message. No driver observation measures this. (T1, T2)
- Open `.dir-sdlc/handruns/2026-09-30-electron-handrun/screenshots/fork-ui-followups/03-s4-fork-error.png`, in the worktree now or in the root after the merge. Check that a two-line clamped fork error ending in "…" is acceptable as the only visible text. (T2)
- Still open in the backlog from session 20261109-1642-fork-ui-human-checks: check that the ⑂ on a Pod tab reads as a fork mark, either in the running app or in `screenshots/fork-ui-recheck/O1-fork.png`.

## 3. What ran

| Task | Agent | Domain | Model | Reviews | Rounds | Redispatches | Commit |
|---|---|---|---|---|---|---|---|
| T1 | sir-frontend-engineer | frontend | opus | 2 | 1 | 0 | f6d2ddc, ce69b20 |
| T2 | sir-test-engineer | test | opus | 1 | 0 | 0 | 4326d23 |

At this gate you chose to fix T1 advisory A1 now. That became T1's revision round 1: the comment above `.dismissible` was reworded, the re-review passed with 0 blocking and 1 advisory (A3, which overlaps A2), and the fix was committed as `ce69b20`. T2 was dispatched twice. The second dispatch continued the task after E4 and A2, because the first had ended by escalating rather than crashing. T1's commit message was amended from `54b089e` to `f6d2ddc`, and its content is identical. The harness refused T2's write of `FINDINGS-FORK-UI-FOLLOWUPS.md`, so the orchestrator copied it in from scratch. Both copies have sha `a64dca0a…4f75`.

Two amendments:
- A1 (E3), `manifest.json`: T1 C2 changed from "keeps the Pod bar at the width it has without an alert" to "keeps each Pod tab title at the width it has without an alert (the `pod-bar` element's own width may change)".
- A2 (E4), `contracts/fork-ui-driver-followups.md`: §C gained an O10 row that counts only painted line boxes. Before, it counted every line box of the text node.

Change surface: `74e79ff..ce69b20` (merge-base of `main` and `agent/20261109-2239-fork-ui-followups`, to the branch tip), 3 commits. 19 files changed, 1243 insertions, 67 deletions. `git diff 74e79ff..ce69b20` shows the full diff.

## 4. Advisory findings

**Correctness risks (2)**
- `src/renderer/src/pods/PodsChrome.module.css:32-33`: the comment said the zero-basis row "takes only the width the Pod bar panel leaves over". Both flex items have flex-grow 1, so they share the leftover space, and the panel keeps only its content basis. (T1 A1. Re-measured: the CSS comment did say this. The test docstring at `fork-error-layout.styles.test.ts:15-17` says "the width the bar's content basis leaves over", which is accurate, so that half of the finding was dropped.) Fixed at this gate in `ce69b20`.
- `src/renderer/src/pods/PodsChrome.module.css:41` (`:39` before `ce69b20`): no measurement covers the case where the tabs alone fill the row. There, the panel still gives up the alert row's min-content width, which is the button plus about one glyph. (T1 A2, joined by T1 A3 from the re-review: when free space is negative, the panel shrinks alone and the row floors at its min-content.)

**Test and CI concerns (1)**: see `reviews/T2.md`.

## 5. Metrics

- userInteractions: 5. This includes Gate 3. The push question comes later and is not counted here.
- escalationsRaised: 4
- reviewRounds: 1. This is the sum of the Rounds column, and it includes the revision round run at this gate.
