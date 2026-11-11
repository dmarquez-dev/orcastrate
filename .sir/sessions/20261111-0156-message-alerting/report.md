sir-sdlc 1.0.30 — Gate 3 report — 20261111-0156-message-alerting

## 1. Decisions needed

**D1. Escalation E1's deferred work: OS notifications.** At Gate 2, E1 chose mechanism A, the in-app region. Its answer reads "B and C are deferred to the backlog at Gate 3", and `spec.md`'s *Not in scope* routes the same item there. E1's own options for the deferred part are:

1. **C: A plus an OS Notification while the window is unfocused.** This adds reach for long events, but it needs a new IPC channel and guarantees nothing extra, so it fits better as a follow-up. Evidence: judgment.
2. **B: OS Notification only.** The OS notification settings can suppress it, so it cannot meet "always produces an error", and it is noise for actions in the focused window. Evidence: judgment.

## 2. Acceptance criteria

| Task | Domain | Criteria | Met |
|---|---|---|---|
| T1 | frontend | 25 | 25 |
| T2 | frontend | 7 | 7 |
| T3 | test | 17 | 17 |
| T4 | frontend | 18 | 18 |
| T5 | frontend | 24 | 24 |
| T6 | test | 10 | 10 |

All 101 criteria are met, and none is not met.

**Demonstrated criteria:** 68 criteria, in 35 rows. Where several criteria rest on one demonstration, they share a row.

| Task | Criteria | Tag | Evidence (the review's words) |
|---|---|---|---|
| T1 | C1 | injected defect | Injecting `key?: string \| null` gave TS2344 at test :130 |
| T1 | C2, C3, C5, C11, C24 | injected defect | Four injections (C2 :65, C3 :167, C5 :96, C11 :250), each naming its site, command and failure, each reverted. The reviewer confirmed each pattern occurs once |
| T1 | C21 | injected defect | `Notifications.styles.test.ts:43-54` checks tokens against `TOKENS`, with a must-fail and a must-pass fixture. Injecting `--oc-font-monospace` failed it |
| T1 | C22 | reviewer-reproduced | The reviewer's run of hygiene: 43/43 with the new stylesheet present |
| T1 | C23 | reviewer-reproduced | The reviewer re-ran the grep: nothing printed (exit 1). The PodsChrome control printed 1 line (`:4`) |
| T1 | C25 | reviewer-reproduced | The reviewer's scoped vitest exits 0. The implementer ran no repo-wide command while T2 was in flight |
| T2 | C2, C6 | injected defect | Injecting the base `if (!result.ok) return;` into `loadRoutingMode` makes `npx vitest run src/renderer/src/state/store.test.ts` exit 1 on the C2 test: "Tests 1 failed \| 110 passed (111)". The revert was verified at 111 passed |
| T2 | C4 | injected defect | The implementer's extra injection, `routingModeError: null,` in `workspace-provider.tsx`, failed 1 of 22 tests |
| T2 | C7 | reviewer-reproduced | The reviewer re-ran `npx vitest run src/renderer/src/state`: "Test Files 7 passed (7) / Tests 263 passed (263)" |
| T3 | C1, C5, C7 | red step; reviewer-reproduced | `npx vitest run src/renderer/src/__tests__/message-alerting.e2e.test.tsx` exited 1 with "Tests 19 failed (19)": exactly 19 titles, S1-S8, E1-E10 and R1. The S and E tests failed after their reach checks passed, and R1 failed at the missing viewport after its row rendered |
| T3 | C9, C10, C11, C12, C13, C14 | reviewer-reproduced | `failure-paths.e2e.test.tsx` at T3: 10 failed and 70 passed of 80. The `toEqual` test passes. The podClose, podInterrupt, laneList, eventsRead and appRoutingMode viewport tests are red now |
| T3 | C16 | reviewer-reproduced | `npm --prefix <worktree> run typecheck` exited 0 (`tc.txt`) |
| T3 | C17 | reviewer-reproduced | hygiene: 43/43 (`hy.txt`) |
| T4 | C1 | reviewer-reproduced | The test at `WorkspaceAlerts.test.tsx:54-64` asserts exactly one viewport, outside `pods-chrome`, and passes |
| T4 | C4, C5, C6, C7, C8, C9, C10, C11, C12, C13 | reviewer-reproduced | `-t S8`, `E7`, `E8`, `E9`, `E10` and `R1` pass (`run1.txt`), and so do the failure-paths podInterrupt, laneList, eventsRead and appRoutingMode tests |
| T4 | C14 | reviewer-reproduced | It mounts under StrictMode and asserts one `laneList` call and exactly one error item. Removing `key`, and also removing the deps array, both stayed green (see advisory) |
| T4 | C15 | injected defect | Removing the else-dismiss at `WorkspaceAlerts.tsx:47-48` failed it, and so did removing `key` |
| T4 | C16 | injected defect | Injecting `void actions.interruptPod(podId);` at `App.tsx:~244` made `-t "E7"` exit 1 with "the viewport holds no items". After the revert, the re-run is green |
| T4 | C17 | reviewer-reproduced | `npm --prefix <worktree> run typecheck` exits 0 |
| T4 | C18 | reviewer-reproduced | The scoped vitest run gives 16 files / 369 tests passed |
| T5 | C1, C2, C3, C4, C5, C6, C7, C10, C12, C13 | reviewer-reproduced | The message-alerting suite in verbose mode: 19/19 passed (S1-S7, E3, E5, E6 ✓) |
| T5 | C8 | reviewer-reproduced | `-t "E1 "`: "Tests 1 passed \| 18 skipped (19)" |
| T5 | C9, C11 | injected defect | Removing `dismiss('pod-open')` and `dismiss('pod-fork')` turned E2 and E4 red at `expectNoErrorNotification`; the revert turned them green |
| T5 | C14 | reviewer-reproduced | failure-paths, pod-fork, PodBarPanel.test and PodsChrome.styles.test together: 4 files / 122 tests passed |
| T5 | C16 | reviewer-reproduced | The grep prints 0 for all four files; the control prints 1. Base re-measured: `PodBarPanel.module.css` 6 |
| T5 | C17 | reviewer-reproduced | `role="alert"` prints 0 for both files; the DeletePodDialog control prints 1 |
| T5 | C18 | reviewer-reproduced | Both greps print 0 (base re-measured: 16) |
| T5 | C21 | reviewer-reproduced | The dismiss tests target `Dismiss notification`. The `:432` test has no diff hunk and passes |
| T5 | C22 | injected defect | Replacing `handleStop`'s body with `void actions.closePod(podId);` made `-t "E6"` fail ("…the viewport holds no items"). The revert passes |
| T5 | C23 | reviewer-reproduced | typecheck exits 0 |
| T5 | C24 | reviewer-reproduced | `npm test`: 160 files / 2605 tests passed |
| T6 | C4 | reviewer-reproduced | A `git grep` re-run of its `role="alert"` census at 3227124 matches the three dialog sites |
| T6 | C6 | reviewer-reproduced | `grep -c '\.sir/sessions'` prints 0 in both files; positive control: the pattern matches `.sir/lessons.md` |
| T6 | C7 | reviewer-reproduced | The reviewer printed every cited line with `git show 3227124:<path> \| sed -n`, without the implementer's checker, and each one matched |
| T6 | C8, C9, C10 | reviewer-reproduced | The reviewer re-ran all three gate commands: typecheck exit 0, `npm test` 160 files / 2605 tests passed, build exit 0 |

**Amended criteria:**

- T6 C2, amended (A1 from E4). The wording changed from "an error raised while" to "an error showing while the New Pod or Delete dialog is open". It was not met in round 1 and is met after the amendment: N5 (`message-alerting.md:182-201`) keeps an error on screen, opens each dialog, and confirms the error is drawn above the scrim.
- T5 C19, amended (A2 from E5). The wording changed from "calls no state hook" to "calls no state-layer hook, meaning nothing imported from `../state`". It is met: `PodBarPanel` imports nothing from `../state` or notifications, and React's `useState` keeps the optimistic order.

Every row is in `reviews/T1.md` through `reviews/T6.md`.

**Coverage**, as mapped at Gate 2, amended where an amendment changed a contract, and checked at Gate 3: 30 of the 33 definition-of-done rows are covered and met, and all 7 contract operations are `called`. `called` means something calls the operation, not that a user can reach it. Here are the exceptions:

- Row 29, `startup-reconciliation.test.tsx` byte-identical: uncovered at Gate 2, and the orchestrator's own row. It is **met**, but the Gate 2 evidence is wrong as written. `git show <tip>:<path> | sha256sum` prints `900f554c…`, not the recorded `101d1b8b…cde4b`, which is the hash of the CRLF working-tree copy. With the instrument corrected, the tip blob equals the base blob (`900f554c…` both), `git diff --name-only 7489152..c200154 -- <path>` is empty, and the worktree copy hashes to `101d1b8b…`.
- Rows 32 and 33, the two `20261110-1857-chrome-alert-width` backlog rows: uncovered at Gate 2, the orchestrator's own rows, `applied after approval`. Their evidence is the Gate 3 backlog edit.
- `NotificationProviderProps`: predicted `not called`, and the prediction is **refuted**. The second search, over the whole repository, finds it as the parameter type of `NotificationProvider.tsx`. No consumer outside `notifications/` names it.

**Limits:** none. Every verification command ran in the worktree.

**Human checks**, from `docs/human-checks/message-alerting.md` (N1-N8; the reviewers asked for these four). To run them before the merge, run `npm run dev` in `C:/Users/dmarq/Development/Repos/orcastrate/.claude-worktrees/20261111-0156-message-alerting`. After the merge, run `npm run dev` in `C:/Users/dmarq/Development/Repos/orcastrate`. The worktree is removed when this gate closes. The app runs against your real profile; read the doc's "Before you start" first.

- N3: at 1280×800, at 940×600 and maximised, check that a notification sits about 16 px from the bottom-right corner and overlaps no Pod tab, Pod bar or panel strip.
- N5: with each scrimmed dialog open (New Pod, Delete), check that an error notification shows at full brightness above the scrim and is not dimmed.
- N6: with Narrator on, check that it reads the error at once and reads "Pod deleted: HC spare" politely, without moving focus.
- N7 step 5: dismiss the last item from the keyboard, then check whether the focus outline on the empty region is visible at all.

## 3. What ran

| Task | Agent | Domain | Model | Reviews | Rounds | Redispatches | Commit |
|---|---|---|---|---|---|---|---|
| T1 | sir-frontend-engineer | frontend | opus | 1 | 0 | 0 | fed4297 |
| T2 | sir-frontend-engineer | frontend | opus | 1 | 0 | 0 | 28df675 |
| T3 | sir-test-engineer | test | opus | 1 | 0 | 0 | d9f3c8e |
| T4 | sir-frontend-engineer | frontend | opus | 1 | 0 | 0 | fbeb36d |
| T5 | sir-frontend-engineer | frontend | opus | 1 | 0 | 0 | 3227124 |
| T6 | sir-test-engineer | test | opus | 2 | 0 | 0 | c200154 |

The second T6 review re-checked C2 only. Amendment A1 caused it, so it is not a revision round. The session also dispatched `sir-architect` (opus) once for the decomposition, and `sir-git` (haiku) seven times: `init-session` and six task commits.

**Amendments: 2.**

- A1 (`manifest.json`, from E4): T6 C2 "an error raised while the New Pod or Delete dialog is open" became "an error showing while the New Pod or Delete dialog is open".
- A2 (`manifest.json`, from E5): T5 C19 "calls no state hook" became "calls no state-layer hook, meaning nothing imported from ../state; React's own useState for the optimistic order is allowed".

**Change surface:** `7489152..c200154` (merge-base of `main` and `agent/20261111-0156-message-alerting` to the branch tip), 6 commits. 31 files changed, 2507 insertions, 1090 deletions. `git diff 7489152..c200154` shows the full diff.

## 4. Advisory findings

**Contract gaps (1)**

- For `message === ''`, React renders no Text node, so the contract's "first child is a single Text node whose data is `message`" cannot hold. `textContent` is still `''`. See `contracts/notifications.ts:124-125` and `src/renderer/src/notifications/NotificationItem.tsx:53-55` (T1).

**Correctness risks (3)**

- A `role="status"` item inserted already holding its text may not be announced by some screen readers. The contract fixes this DOM shape (`src/renderer/src/notifications/NotificationItem.tsx:53`, T1).
- A successful stop of a Pod that is not in `pods.value` raises no notification, because `closePod` resolves void and S6 needs a title (`src/renderer/src/pods/PodsChrome.tsx:164`, T5).
- The focus outline on the empty viewport is probably too small to see, because the viewport has no padding or size (`src/renderer/src/notifications/Notifications.module.css:8-22`, T6). N7 step 5 asks you to report it.

**Session conduct (2)**

- T2: the new `routingModeError` docblock names a session artifact, "Amendment frozen in session 20261111-0156-message-alerting (`contracts/workspace-store-routing-error.ts`)". That path resolves only under `.sir/sessions/` (`src/renderer/src/contracts/renderer-state.ts`).
- T5, a pattern across tasks: long-lived source cites the session id and its `contracts/*` files, at `PodsChrome.tsx:37` and `pod-fork.e2e.test.tsx:340`, and also in `notifications/types.ts`, `WorkspaceAlerts.tsx` and `renderer-state.ts`.

**Test and CI concerns:** 8, in `reviews/T2.md`, `reviews/T3.md`, `reviews/T4.md` and `reviews/T5.md`.

**Cosmetics:** 2, in `reviews/T3.md` and `reviews/T6.md`.

## 5. Metrics

- `userInteractions`: 4 (Gates 1, 2 and 3, and the E4/E5 batch). The push question is still to come and is not counted yet.
- `escalationsRaised`: 5
- `reviewRounds`: 0, the sum of the Rounds column
