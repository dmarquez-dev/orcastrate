sir-sdlc 1.0.25 — Gate 3 report — 20261109-1642-fork-ui-human-checks

**Decisions needed:** none — both escalations (E1, E2) resolved during implementation with no deferred action, and no blocking finding was raised.

## 2. Acceptance criteria

| Task | Domain | Criteria | Met |
|---|---|---|---|
| T1 | test | 33 | 33 |
| T2 | frontend | 7 | 7 |
| T3 | test | 8 | 8 |

No criterion is `not met`.

**Demonstrated criteria** (18 criteria, 18 demonstrations, counted from the rows below):

| Task | Criterion | Tag | Evidence |
|---|---|---|---|
| T1 | C3 | reviewer-reproduced | driver imports `sandbox.mjs`: greps 1 and 0; control on `sandbox.mjs` 1 |
| T1 | C4 | reviewer-reproduced | earlier handrun artifacts `a9edbb25…c9ca`, count 80 |
| T1 | C9 | injected defect | O1 pass; U+0379 control reported "missing glyph" (driver:579) |
| T1 | C10 | injected defect, amended (A2) | O2 text-range heights 16/16/16; doubled-font control 0 of 2 equal (32 at 24px). A2 changed the measure from box height to text-range height |
| T1 | C18 | injected defect | O10 `defect`: 0 line boxes contain the button centre; column control 0, undo verified (driver:833) |
| T1 | C20 | injected defect | O12 contrast 6.573 vs 4.5; colour=background control 1.00 (driver:929) |
| T1 | C22 | injected defect | O14 ring visible, contrast 7.02 vs 3.0; `outline:none` control `none` (driver:1011-1015) |
| T1 | C26 | reviewer-reproduced | `python -I`: findings table 1 header, 16 rows O1–O16, 9 fields each |
| T1 | C30 | reviewer-reproduced | no tracked-path screenshot writes: grep 0 (control 9 on `run-c3.mjs`) |
| T1 | C31 | reviewer-reproduced | `grep -c '\.sir/'` 0/0/0 |
| T2 | C3 | red step | `fork-ui-regression.styles.test.ts:44-46` failed before the fix (`expected [ 'center' ] to deeply equal [ 'flex-start' ]`), implementer's, not reproduced by the reviewer |
| T2 | C5 | reviewer-reproduced | greps `PodTab.tsx:0`, `PodsChrome.tsx:0`, `tabIndex={-1}` 1 |
| T2 | C7 | reviewer-reproduced | scoped vitest: 15 files / 202 tests passed |
| T3 | C3 | injected defect | O10 `pass` in recheck; column control observed 0 against a prediction of 0 |
| T3 | C5 | reviewer-reproduced | recheck table: 16 rows, 9 fields each; `grep -c '\.sir/'` 0 (control 1) |
| T3 | C6 | reviewer-reproduced | earlier artifacts still `a9edbb25…c9ca`, 80, with recheck files present |
| T3 | C7 | reviewer-reproduced | `npm run typecheck` exit 0 |
| T3 | C8 | reviewer-reproduced | `npm test` exit 0: 157 files / 2544 tests passed |

Every row is in `reviews/T1.md`, `reviews/T2.md` and `reviews/T3.md`.

**Coverage**, as mapped at Gate 2, amended where an amendment changed a contract, and checked at Gate 3: 16 of 17 definition-of-done rows `met`, and all 6 contract-operation rows `called` or `applied`, with I4 noting amendment A1. Exception:

- DoD 16 (Gate 3 backlog edit) was `uncovered` at Gate 2: it is the orchestrator's row (D4). As of the gate, its end state is `applied after approval`. Lines 34, 35, 36 and 38 are to be removed, because every observation mapped to them is `pass`. Line 37 stays, trimmed to its open clause, because O11 is `instrument-invalid`. The settled value is recorded in `coverage.md` after the edit.

**Limits:** none. Every verification command ran in the worktree.

**Human checks.** Run `npm run dev` in `C:\Users\dmarq\Development\Repos\orcastrate\.claude-worktrees\20261109-1642-fork-ui-human-checks` until this gate closes. The worktree is removed on approval. After that, run `npm run dev` in `C:\Users\dmarq\Development\Repos\orcastrate`.

- This session (T1 review): open `.dir-sdlc/handruns/2026-09-30-electron-handrun/screenshots/fork-ui-recheck/O1-fork.png`, or a Pod tab in the app, and check that the ⑂ reads as a fork mark. O1 proves only that it is not the missing-glyph box and not blank.
- This session (T1 review): show a fork error and compare the Pod tabs against `01-s1-s2-bar.png`. While the alert is up, the tab titles are not visible.
- Open in `.sir/backlog.md`, from `20261106-0120-fork-hardening` (line 37): make a fork fail and check that the `×` is vertically centred on the error's first line. O11 could not measure this, because its control cannot fire under a wrapped error.
- Open in `.sir/backlog.md`, from `20261105-1907-fork-session-branching` (lines 34–36) and `20261106-0120-fork-hardening` (line 38): this session measured every observation on these rows as `pass`. They are removed on approval unless you report otherwise.

## 3. What ran

| Task | Agent | Domain | Model | Reviews | Rounds | Redispatches | Commit |
|---|---|---|---|---|---|---|---|
| T1 | sir-test-engineer | test | opus | 1 | 0 | 0 | `cca88ce` |
| T2 | sir-frontend-engineer | frontend | opus | 1 | 0 | 0 | `c66e1e7` |
| T3 | sir-test-engineer | test | opus | 1 | 0 | 0 | `0792ae2` |

T1 was dispatched twice: once before escalations E1 and E2, and once after amendments A1 and A2. That second dispatch was not a crash re-dispatch. The orchestrator copied `FINDINGS-FORK-UI.md` and `FINDINGS-FORK-UI-RECHECK.md` verbatim from the task scratch directories after the harness blocked the agents' writes, with user approval, and the sha256 values match.

**Amendments (2):**

- A1 `contracts/fork-ui-driver.md`, authorised by E2. Before: O2 compared font-size and rendered box height. After: O2 compares font-size and text-range height (`Range.getBoundingClientRect`), and box height is recorded unscored.
- A2 `manifest.json`, authorised by E2. Before: T1 C10 named box height with 0 of 2 height pairs equal. After: T1 C10 names text-range height with 0 of 2 text-range pairs equal.

**Change surface:**

- Range: `fea8246..0792ae2` (merge-base of `main` and `agent/20261109-1642-fork-ui-human-checks`, to the branch tip).
- Stat: 30 files changed, 2388 insertions(+), 1 deletion(-).
- Full diff: `git diff fea8246..0792ae2`.

## 4. Advisory findings

**Contract gaps (4)**

- I4's O11 control prediction (half the button height) holds only for a single-line alert. Under the wrapped error the control cannot fire, so O11 stays `instrument-invalid`. T2 ranked amending the prediction first (`contracts/fork-ui-driver.md:169`; T2 advisory 2).
- C28 strict reading: `tol` is derived from `const winFacts`, and the in-window lookups are `const x = … ?? null`. Neither is null-initialised, and each fails rather than passes when missing (`run-fork-ui.mjs:506`, `:509`).
- O14's "byte-identical to the control capture" is implemented as two successive captures under the control, `capB` ≡ `capB2`. The wording is ambiguous (`run-fork-ui.mjs:1020`, `:1045`).
- `meta.sandboxRemoved` and `meta.precondition` are additions beyond I2's report shape (`run-fork-ui.mjs:365-366`).

**Correctness risks (2)**

- O16's control `win.click(DISMISS)` may run while O15's Shift-control alert is still in the DOM, so it relies on Playwright picking the first match (`run-fork-ui.mjs:1121`).
- The Pod tab titles disappear while the fork-error alert is shown. This is unscored (`FINDINGS-FORK-UI.md:102-104`). The orchestrator re-measured it against `screenshots/fork-ui-recheck/03-s4-fork-error.png` and `01-s1-s2-bar.png`.

**Cosmetics (2):** see `reviews/T1.md` and `reviews/T2.md`.

## 5. Metrics

- `userInteractions`: 5 so far. The push question is not yet counted.
- `escalationsRaised`: 2
- `reviewRounds`: 0, the sum of the Rounds column.
