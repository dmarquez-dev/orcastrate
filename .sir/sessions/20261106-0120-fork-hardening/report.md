sir-sdlc 1.0.23 — Gate 3 report — 20261106-0120-fork-hardening

**Decisions needed:** none.

## 2. Acceptance criteria

| Task | Domain | Criteria | Met |
|---|---|---|---|
| T1 | database | 15 | 15 |
| T2 | backend | 13 | 13 |
| T3 | frontend | 18 | 18 |
| T4 | backend | 6 | 6 |

No criterion is `not met`, and no amendment changed one. 27 criteria have a demonstration tag:

- **T1.1** [red step; injected defect; reviewer-reproduced]: the foreign-Pod `events.lane_id` test asserts IO with counts unchanged through a fresh connection. It went red when the transaction at :356 was removed.
- **T1.2** [red step; injected defect; reviewer-reproduced]: the `parentLaneId` naming another Pod's lane throws at :322 after the pod row is written. Red with no transaction.
- **T1.3** [red step; injected defect; reviewer-reproduced]: `ghost-opened-id` through `remapPayloadLanes` (:595): IO, counts unchanged.
- **T1.4** [red step; injected defect; reviewer-reproduced]: `ghost-opened-parent` through :598: IO, counts unchanged.
- **T1.5** [red step; injected defect; reviewer-reproduced]: `ghost-closed` through :602: IO, counts unchanged.
- **T1.6** [red step; injected defect; reviewer-reproduced]: `ghost-dispatched` through :604: IO, counts unchanged.
- **T1.7** [injected defect]: the message starts with `forkPod:` and names both ids. Dropping `${parent.id}` at :301 failed only this test.
- **T1.12** [red step; injected defect]: all 7 new tests failed before the fix (`7 failed | 20 passed (27)`). Restoring `?? id` at :297 and the :301 injection were both reverted and checked.
- **T2.1** [red step]: the `it.each` test asserts `IpcFailure` `IO` for `''`, against the guard at `pod-manager.ts:564-570`.
- **T2.2** [red step]: for `''`, `spy.writes` has no `forkPod` and `rowCounts` are unchanged.
- **T2.3** [red step]: the same `it.each` covers `'cc-parent'`.
- **T2.4** [red step]: no write for `'cc-parent'`.
- **T2.5** [red step]: the message at :567-568 holds `forkSession`, the PodId and the `ccSessionId`, asserted for both cases.
- **T2.6** [injected defect]: the guard does not log. Adding a `warn` at :565 failed 2 tests, and it was reverted.
- **T2.8** [injected defect]: a real `:memory:` store with a dangling lane gives an `IpcFailure` `IO` with the prefixed message and unchanged counts. Removing the IO translation at :592-594 failed 2 tests, and it was reverted.
- **T2.9** [injected defect]: exactly 1 `warn` names `cc-orphan`. Removing the orphan warn at :587-591 failed it, and it was reverted.
- **T2.10** [red step ×8; injected defect ×4]: every new test has a demonstration with its file:line, `-t` command, window and revert check.
- **T3.1** [red step]: a native `<button aria-label="Dismiss fork error">`, found by role and name.
- **T3.2** [red step]: `<span aria-hidden="true">` holds `×` (U+00D7). The aria-hidden texts equal `['×']`.
- **T3.3** [red step]: a click clears `forkAlerts()`.
- **T3.4** [red step]: Enter clears it.
- **T3.5** [red step]: Space clears it.
- **T3.6** [injected defect]: focus lands on `PODS_CHROME_TEST_ID`. Removing `focus()` gave `<body>`.
- **T3.7** [injected defect]: the button is a sibling of `<p role="alert">` and the text matches with `toBe`. Moving `</p>` after the button failed the test.
- **T3.8** [injected defect]: a second, pending fork clears the alert. Deleting `setForkError(null)` at :95 failed the test.
- **T3.11** [red step]: the `.dismiss:focus-visible` outline uses `--oc-border-thick` / `--oc-focus-ring`, asserted by two new style tests.
- **T3.12** [reviewer-reproduced]: the unlisted parent reads `Forked from a deleted Pod`. Changing `fork-control.ts:66` to `? null :` failed it while the null-parent test still passed. Reverted.

Every row is in `reviews/T1.md` … `reviews/T4.md`.

**Coverage** (as mapped at Gate 2, amended where an amendment changed a contract, checked at Gate 3): 38 of 40 definition-of-done rows were covered at Gate 2 and are `met`. The single contract operation is `called`. Exceptions:

- **Row 39** was uncovered at Gate 2 and given to the orchestrator (D3). Now `met`: `git diff --stat 4301c23 agent/20261106-0120-fork-hardening -- .sir/sessions/20261105-1907-fork-session-branching/` printed nothing.
- **Row 40** was uncovered at Gate 2 and given to the orchestrator (D3). Still `pending`: it is a Gate 3 action, measured after the backlog edit that follows approval. The counts before the edit are 9 and 3.
- **Contract `EventStore.forkPod` missing-lane failure** is `called` from `src/main/pod-manager/pod-manager.ts:573`, which confirms the Gate 2 prediction. The call was already there at base `4301c23` (:559).

**Limits:** none — every verification command ran in the worktree.

**Human checks** (from T3's review). Run the app with `npm --prefix C:\Users\dmarq\Development\Repos\orcastrate\.claude-worktrees\20261106-0120-fork-hardening run dev`. The worktree has no `node_modules` of its own, and it is removed when this gate closes. After the merge, use `npm run dev` in the repository root.

- Fail a fork. Check that the `×` button sits on the error text's line, vertically centred, and is readable in light and dark themes.
- Tab to the dismiss control. Check that the focus ring is visible, that Enter closes the alert, and that the ring then appears on the Pods chrome container.

## 3. What ran

| Task | Agent | Domain | Model | Reviews | Rounds | Redispatches | Commit |
|---|---|---|---|---|---|---|---|
| T1 | sir-database-engineer | database | opus | 1 | 0 | 0 | 2e604f2 |
| T2 | sir-backend-engineer | backend | opus | 1 | 0 | 0 | 5909b19 |
| T3 | sir-frontend-engineer | frontend | opus | 1 | 0 | 0 | d30f8db |
| T4 | sir-backend-engineer | backend | opus | 1 | 0 | 0 | b775209 |

Commit range `4301c23..d30f8db` (`git merge-base main agent/20261106-0120-fork-hardening` to the branch tip), 4 commits: 10 files changed, 498 insertions, 31 deletions. Run `git diff 4301c23..agent/20261106-0120-fork-hardening` for the full diff.

## 4. Advisory findings

**Session conduct (1)**
- T1 (`src/main/store/sqlite-event-store.ts:356`): the implementer said the transaction rollback was not isolated by any injected defect. The reviewer closed that gap: running `writeFork(input)` without the transaction failed 8 of 27 tests on row counts. The change was reverted. The orchestrator re-checked at 02:09Z, and again at Gate 3: `rg` shows `return this.db.transaction(writeFork).immediate(input);` at :356 and no `?? id`.

**Cosmetics (1)**: see `reviews/T1.md`.

Withdrawn: T3's advisory said the implementer misquoted the glyph as `{'×'}` when the file holds a bare `×`. Re-measured, the advisory is wrong: `rg -n "aria-hidden" src/renderer/src/pods/PodsChrome.tsx` at the worktree tip prints `300: <span aria-hidden="true">{'×'}</span>`. The implementer's report was accurate.

## 5. Metrics

- userInteractions: 3 (Gates 1, 2 and 3; the push question comes later and is not counted yet)
- escalationsRaised: 0
- reviewRounds: 0 (equals the sum of section 3's Rounds column)
