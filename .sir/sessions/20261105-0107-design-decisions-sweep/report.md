sir-sdlc 1.0.21 — Gate 3 report — 20261105-0107-design-decisions-sweep

**Decisions needed:** none — no escalation was raised, and no review raised a blocking finding.

## 2. Acceptance criteria

| Task | Domain | Criteria | Met |
|---|---|---|---|
| T1 | frontend | 21 | 21 |
| T2 | backend | 13 | 13 |
| T3 | frontend | 13 | 13 |
| T4 | architecture | 12 | 12 |
| T5 | test | 3 | 3 |

No criterion is `not met`, and no criterion was amended. 26 criteria rest on a demonstration:

| Task | # | Tag | Evidence |
|---|---|---|---|
| T1 | C1 | injected defect | re-click test asserts onClose 1 / onOpen 0; failed under I1 (per-panel `onClick` body, PanelBar.tsx:99–107), reverted and read back |
| T1 | C2 | injected defect | Enter on the open panel's button asserts onClose 1 / onOpen 0; failed in the same I1 run |
| T1 | C3 | injected defect | open=beachcomber, click helm asserts onOpen once with 'helm'; failed under I2 |
| T1 | C6 | injected defect | `settledGuard(false)`, `calls()` 1, helm region present; failed under I1 |
| T1 | C7 | injected defect | `settledGuard(true)`, `calls()` 1, helm region absent; failed under I1 |
| T1 | C8 | injected defect | real Beachcomber closed inside one synchronous `act`; failed under I1 |
| T1 | C9 | injected defect | focus inside the region, then click; activeElement is the strip button; failed under I1 |
| T1 | C11 | injected defect | e2e dirty draft, re-click, `closeConfirm`, Keep; panel and `TYPED_MODEL` kept; failed under I1 |
| T1 | C12 | injected defect | Discard twin: helmPanel, closeConfirm, beachcomberPanel all absent; failed under I1 |
| T1 | C19 | reviewer-reproduced | `Test Files 18 passed (18)`, `Tests 263 passed (263)` |
| T1 | C20 | reviewer-reproduced | tsc node exit 0 |
| T1 | C21 | reviewer-reproduced | tsc web exit 0 |
| T2 | C1 | red step | `it.each` accept/hold/refuse → `[]`; hold failed against startRef `validate.ts` |
| T2 | C2 | red step | hold save returns `warnings` `[]` and writes `'hold'`; failed in the same red run |
| T2 | C11 | reviewer-reproduced | `Test Files 17 passed (17)`, `Tests 219 passed (219)` |
| T2 | C12 | reviewer-reproduced | tsc node exit 0 |
| T2 | C13 | reviewer-reproduced | tsc web exit 0 |
| T3 | C1 | red step | `validateDraft` → `[]` for a hold draft; startRef `panel-store.ts` returned the caveat warning |
| T3 | C2 | red step | each radio's `aria-describedby` text equals `CROSS_SESSION_HINTS[value]`; hold failed at startRef (hint plus caveat) |
| T3 | C6 | reviewer-reproduced | `discrimination.test.tsx (81 tests)` passed |
| T3 | C10 | reviewer-reproduced | `Test Files 18 passed (18)`, `Tests 436 passed (436)` |
| T3 | C11 | reviewer-reproduced | tsc node exit 0 |
| T3 | C12 | reviewer-reproduced | tsc web exit 0 |
| T5 | C1 | reviewer-reproduced | tsc node at `05cf6b4` exit 0; `--listFilesOnly` counted 136 files |
| T5 | C2 | reviewer-reproduced | tsc web exit 0; `--listFilesOnly` counted 221 files |
| T5 | C3 | reviewer-reproduced | `Test Files  147 passed (147)` / `Tests  2393 passed (2393)` |

Every row: `.sir/sessions/20261105-0107-design-decisions-sweep/reviews/T1.md` … `T5.md`.

**Coverage — as mapped at Gate 2, amended where an amendment changed a contract, and checked at Gate 3.** D1, D2, D12 and D13 are `met`. D3–D11 are the orchestrator's rows: their evidence is the `.sir/backlog.md` edit made after this gate is approved. Four contract operations are `called` and one deletion row is `removed` (0 surviving names repo-wide; the base control printed the predicted 33). The exceptions:

- `PanelCloseController.requestOpen` same-key no-op: uncovered at Gate 2, ruled *keep as a defence*, predicted `not called`. End state `called (pre-existing)` at `App.tsx:97`, so the prediction is **refuted** by the name search. The search cannot see the same-key branch, which `PanelBar.tsx:99-107` now routes to `onClose`.
- `HelmValidationSeverity 'warning'` / `warnings` / `warningIssues`: uncovered at Gate 2, ruled *keep and file a backlog line at Gate 3*, predicted `not called`. End state `called (pre-existing)` at `helm-service.ts:240`, so the prediction is **refuted** by the name search. No `severity: 'warning'` producer remains in `src/` outside tests; the base control printed the predicted 2.

**Limits:** none — every verification command ran in the worktree.

**Human checks:**

- In the running app, open Helm's `crossSessionInbound` fieldset. Confirm that `hold` looks like `accept` and `refuse`: a label and a one-line hint, with nothing beside it in the old waiting colour. This is hand-run step 5d of `docs/first-run.md` (T3).
  - Before approval: `npm run dev` in `C:\Users\dmarq\Development\Repos\orcastrate\.claude-worktrees\20261105-0107-design-decisions-sweep`. That worktree is removed when this gate closes.
  - After the merge: `npm run dev` in `C:\Users\dmarq\Development\Repos\orcastrate`. Neither command is in the verification record; both come from `package.json`'s `dev` script.

## 3. What ran

| Task | Agent | Domain | Model | Reviews | Rounds | Redispatches | Commit |
|---|---|---|---|---|---|---|---|
| T1 | sir-frontend-engineer | frontend | opus | 1 | 0 | 0 | `e3ab57e` |
| T2 | sir-backend-engineer | backend | opus | 1 | 0 | 0 | `911f203` |
| T3 | sir-frontend-engineer | frontend | opus | 1 | 0 | 0 | `2302c05` |
| T4 | sir-architect | architecture | opus | 1 | 0 | 0 | `05cf6b4` |
| T5 | sir-test-engineer | test | opus | 1 | 0 | 0 | — (verification only, `owns` empty) |

Change surface: `cc5077c..05cf6b4` (`git merge-base main agent/20261105-0107-design-decisions-sweep` to the branch tip), 4 commits. Stat: 23 files changed, 256 insertions(+), 225 deletions(-). Run `git diff cc5077c..05cf6b4` to see the full diff.

## 4. Advisory findings

**Session conduct (2)**

- T2, commit `911f203`: the body says only `OBSERVED_CLI_VERSION`'s re-export was removed from `src/main/helm/index.ts`. The diff removes `HOLD_WARNING_MESSAGE`'s too. The message understates the change but states nothing false (`reviews/T2.md`, commit readback).
- T4, commit `05cf6b4`: the body says "the warning that validation carried for it [is] removed". This commit changes only `helm.ts` comment text, while the warning itself was removed in `911f203` and `2302c05`, so the sentence can be read as a behaviour change this diff does not make (`reviews/T4.md`, commit readback).

## 5. Metrics

- `userInteractions`: 3 (Gates 1, 2 and 3; the push question is not yet counted)
- `escalationsRaised`: 0
- `reviewRounds`: 0 (the Rounds column above sums to 0)
