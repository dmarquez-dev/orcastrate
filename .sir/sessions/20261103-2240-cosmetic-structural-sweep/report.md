sir-sdlc 1.0.18 — Gate 3 report — 20261103-2240-cosmetic-structural-sweep

**Decisions needed:** none.

## 2. Acceptance criteria

| Task | Domain | Criteria | Met |
|---|---|---|---|
| T1 | backend | 9 | 9 |
| T2 | frontend | 7 | 7 |
| T3 | frontend | 5 | 5 |
| T4 | frontend | 12 | 12 |
| T5 | frontend | 18 | 18 |
| T6 | test | 16 | 16 |
| T7 | database | 9 | 9 |
| T8 | test | 2 | 2 |

78 criteria, 78 met, 0 not met. The 60 criteria below carry a demonstration tag and are listed in full; every row is in `reviews/<task-id>.md`.

| Task | Criterion | Tag | Evidence |
|---|---|---|---|
| T1 | C1-a | reviewer-reproduced | Docblock at `paths.ts:131-136`, function on 137; byte-identical to base 53-58 |
| T1 | C1-b | reviewer-reproduced | Line 52 blank, 53 `/**` above the `podBlockerFor` docblock |
| T1 | C3 | reviewer-reproduced | `grep -c "from './validate'" index.ts` prints 1; same seven names |
| T1 | C5-preview | injected defect | `displayPath: entry.name` at `service.ts:310` failed `pod-blocking.test.ts:86` |
| T1 | C5-trash | injected defect | Same injection failed `:105` |
| T1 | C5-fixtures | reviewer-reproduced | Typecheck exit 0; every fixture carries `displayPath` |
| T1 | T1-scope | reviewer-reproduced | 16 files / 247 tests passed |
| T2 | C4-copy | red step; injected defect | TypeError before `selectAllLabel` existed; `copy.ts:49` mutation gave 2 failures |
| T2 | C4-preserved | injected defect | Toggle label `toBe('Select all in ' + HEADING)`; same mutation failed it |
| T2 | C5-preview-render | red step; injected defect | `refusalPath` span deleted at `BeachcomberRefusals.tsx:41` failed `:131` |
| T2 | C5-result-render | injected defect | Same span removal failed `:274` |
| T2 | C5-structure | reviewer-reproduced | Path and reason in separate spans; e2e file 72/72 |
| T2 | T2-scope | reviewer-reproduced | beachcomber dir 7 files / 75 tests passed |
| T3 | C2-select | injected defect; reviewer-reproduced | Release call at `:122` deleted: 1 failed / 50 passed |
| T3 | C2-discard | injected defect | `onDiscard` `:201` release deleted: only that test failed |
| T3 | C2-reload | injected defect | `onReload` `:205` release deleted: only that test failed |
| T3 | C2-preserved | reviewer-reproduced | Additions-only test diff; helm 11 files / 184 tests |
| T4 | C67-resolver | reviewer-reproduced | `\|\| true` and tie-break `<` mutations each reddened their control |
| T4 | C7-inner | red step | `expected true to be false` at base |
| T4 | C7-calf | injected defect | `.row:hover` deleted |
| T4 | C7-matriarch | injected defect; reviewer-reproduced | Rule reorder |
| T4 | C7-selected-primary | injected defect | Rule at 150 deleted |
| T4 | C7-selected-follower | injected defect | Rule at 154 deleted |
| T4 | C6-primary | injected defect; reviewer-reproduced | Rule at 183 deleted |
| T4 | C6-follower | injected defect | Rule at 187 deleted |
| T4 | C67-background-only | injected defect | `box-shadow` added to a hover rule |
| T4 | C8 | red step; injected defect | `flex: none` removed from `.dot` (line 264) |
| T5 | C11-move | reviewer-reproduced | 3 importers, all `'../shell/use-dialog-focus'`; old path absent |
| T5 | C11-always-mounted | injected defect | Mount-time capture at `:84`: 2 failed |
| T5 | C11-beachcomber | reviewer-reproduced | Beachcomber dialog test diff empty; passes |
| T5 | C11-D-open | injected defect | Open-focus call `:85` voided: failed `DeletePodDialog.test.tsx:120` |
| T5 | C11-D-trap-forward | red step | Tab from Confirm lands on the checkbox, not the outside button |
| T5 | C11-D-trap-backward | red step | Shift+Tab lands on Confirm |
| T5 | C11-D-restore | red step; injected defect | `<body>` at red; mount-time capture failed it |
| T5 | C11-D-fallback | red step | Fallback focused, not `<body>` |
| T5 | C11-D-wired | red step | pod-lifecycle delete lands on Pod chrome |
| T5 | C11-N-trap-forward | red step | Tab from Cancel lands on title |
| T5 | C11-N-trap-backward | red step | Shift+Tab from title lands on Cancel |
| T5 | C11-N-restore | red step; injected defect | Mount-time capture failed `NewPodDialog.test.tsx:150` |
| T5 | C11-N-fallback | red step | Fallback focused, not `<body>` |
| T5 | C11-N-wired | red step | pod-lifecycle create lands on Pod chrome |
| T5 | T5-typecheck | reviewer-reproduced | Typecheck exit 0, no task in flight |
| T5 | T5-scope | reviewer-reproduced | 25 files / 293 tests passed |
| T6 | C9-bars | injected defect | Base regex at `BARRED_HOOK`: 4 failures |
| T6 | C9-allows | injected defect | Base regex restored: `useRef` fixture failed |
| T6 | U1-must-match | injected defect | Alternation narrowed to `['"]`: backtick fixture failed |
| T6 | U1-near-miss | injected defect | Base `includes` semantics: `expected 1 to be +0` at `:1333` |
| T6 | U2-two-term | injected defect | Base `MULTI_VALUE_WIDTH_MAX_TERMS` path restored: red |
| T6 | U2-raw-length | injected defect | `every`→`some` at `:472` |
| T6 | U2-wrong-family | reviewer-reproduced | Any-`var(--oc-` mutation at `:472`: failed `:512` |
| T6 | U2-too-many | injected defect | Bound loosened to 99 |
| T6 | U2-per-side | injected defect | `border-top-width` added to the map |
| T6 | U2-axis | injected defect | Injections 5 and 6 |
| T6 | T6-scope | reviewer-reproduced | 3 files / 96 tests; only owned paths dirty; typecheck exit 0 |
| T7 | C10-delete | reviewer-reproduced | Test name grep prints 0 |
| T7 | C10-orphans | reviewer-reproduced | Five orphan identifiers each grep 0 |
| T7 | C10-kept | reviewer-reproduced | 10 `it(` blocks, 10 passing |
| T7 | C10-subsumed | reviewer-reproduced | `migration-frozen` migrations 1-4 ran, not skipped; 9 files / 123 tests |
| T8 | Tail-typecheck | reviewer-reproduced | `typecheck:node && typecheck:web` at `d90d008`, exit 0 |
| T8 | Tail-suite | reviewer-reproduced | 146 files / 2374 tests passed; +1 / +41 against base 145 / 2333, reconciled per task |

**Coverage, as mapped at Gate 2, amended where an amendment changed a contract, and checked at Gate 3:** 15 of 16 definition-of-done rows `met`, the U3 prediction `moot` confirmed, and the one contract operation, `BeachcomberPreviewRefusal.displayPath`, `called` from `BeachcomberRefusals.tsx:41`. A call site shows that something calls the operation. It does not show that a user can reach it. One exception: the **Backlog** row was `uncovered` at Gate 2 and assigned to the orchestrator. Its end state is filled from `git diff` on `.sir/backlog.md` after the Gate 3 backlog edit, so it is pending at render.

**Limits:** none — every verification command ran in the worktree.

**Human checks:**
- In the running app, hover over an unselected Calf, an unselected Matriarch, a selected Calf and a selected Matriarch in the lane rail. Confirm that the hover tint covers the whole row including Steer, that a selected Calf does not dim, and that a selected Matriarch visibly changes surface. (T4)
- In the running app, open Delete on a Pod tab and confirm. After the tab disappears, check that the Pod chrome shows a visible focus indication. It is a `tabIndex={-1}` container with no focus style. (T5)

## 3. What ran

| Task | Agent | Domain | Model | Reviews | Rounds | Redispatches | Commit |
|---|---|---|---|---|---|---|---|
| T1 | sir-backend-engineer | backend | opus | 1 | 0 | 0 | 6c026bf |
| T2 | sir-frontend-engineer | frontend | opus | 1 | 0 | 0 | f5b4a6c |
| T3 | sir-frontend-engineer | frontend | opus | 1 | 0 | 0 | 4d3d51d |
| T4 | sir-frontend-engineer | frontend | opus | 1 | 0 | 0 | 97f60e3 |
| T5 | sir-frontend-engineer | frontend | opus | 1 | 0 | 0 | d90d008 |
| T6 | sir-test-engineer | test | opus | 1 | 0 | 0 | 84d0a1f |
| T7 | sir-database-engineer | database | opus | 1 | 0 | 0 | cddbe31 |
| T8 | sir-test-engineer | test | opus | 1 | 0 | 0 | none (verification only, `owns` empty) |

Each task's reviewer ran on opus, and each of the 7 task commits went through `sir-git` on haiku. The Rounds column sums to 0, which matches §5's `reviewRounds`.

**Change surface:** `e2e81e1..d90d008` (`git merge-base main agent/20261103-2240-cosmetic-structural-sweep` to the branch tip), 7 commits, **35 files changed, 1199 insertions(+), 235 deletions(-)**. `git diff e2e81e1..d90d008` shows the full diff.

## 4. Advisory findings

**Correctness risks (2)**
- `src/renderer/src/pods/PodsChrome.tsx:206`: the `tabIndex={-1}` fallback container that receives focus after a Pod delete or create has no focus style, and the discipline says "focus is visible". The CSS is outside T5's ownership. (T5 A2)
- `src/renderer/src/pods/DeletePodDialog.tsx:96`: focus now moves only on open (`open: podId !== null`), not on every `podId` change as it did at base `:89-93`. Switching Pods without passing through null would not re-focus. PodsChrome never does that today. (T5 A3)

**Session conduct (4)**
- The T4 manifest criterion C6-comment: its grep `darkens rather than brightening` cannot fail, because the base phrase is split across a line break. Its "(base prints 1)" is wrong; the base prints 0. The criterion was met on its second evidence, which was reading the comment. (T4 A1)
- Commit `84d0a1f` (T6): the subject says "narrow … the PodBar width rule", but U2 relaxes that predicate. The body states it correctly. (T6 A3)
- Commit `f5b4a6c` (T2): the body says both tests assert the path appears "beside its reason". The panel test only asserts that the path is inside the refused list. (T2 A2)
- Schedule: T2, T3 and T4 each injected defects into production files they owned and were dispatched concurrently in one worktree, which departs from the rule to serialize such tasks. Each brief forbade the unscoped suite and the repo-wide typecheck, and no cross-task red was observed. (T8 orchestrator note)

**Test and CI concerns (4)**: see `reviews/T4.md` A3, `reviews/T6.md` A2, `reviews/T8.md` A1-A2.

**Cosmetics (3)**: see `reviews/T2.md` A1, `reviews/T4.md` A2, `reviews/T6.md` A1.

## 5. Metrics

- `userInteractions`: 3 so far (Gates 1, 2 and 3). The push question is not yet counted.
- `escalationsRaised`: 0
- `reviewRounds`: 0
