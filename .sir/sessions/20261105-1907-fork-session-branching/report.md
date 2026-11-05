sir-sdlc 1.0.22 — Gate 3 report — 20261105-1907-fork-session-branching

**Decisions needed:** none. All three escalations (E1–E3) were resolved during the session and none left work deferred to the backlog. The one blocking finding (T2 B1) was closed in its revision round.

## 2. Acceptance criteria

| Task | Domain | Criteria | Met |
|---|---|---|---|
| T1 | backend | 20 | 20 |
| T2 | database | 37 | 37 |
| T3 | backend | 36 | 36 |
| T4 | frontend | 26 | 26 |

No criterion is `not met`. **Amended criteria:**
- T2 #11 (A1, from E2): "… no `INSERT`, `UPDATE` or `DELETE`" became "… no `INSERT`, `UPDATE` or `DELETE` **statement**". Met: two ALTERs plus a CREATE INDEX; the per-statement test at migration-5.test.ts:138 failed when an UPDATE was injected. Tag: injected defect.
- T3 #35 (A2, from E3): "`npm test` exits 0" became "exits 0 except exactly the 4 named channel-enumeration tests in T4-owned files". Met: exit 1, and the only 4 failures were the named tests. Tag: reviewer-reproduced. T4 #25 turned those 4 green.

**Criteria resting on a demonstration** (92 rows: T1 6, T2 30, T3 34, T4 22). Each line gives the criterion number, its tag, and the evidence.

*T1:* 6 reviewer-reproduced: nonce absent from both fork prompts, and the positive control found it in the source prompt · 12 reviewer-reproduced: C6 counts 48/10, a single distinct id · 16 reviewer-reproduced: 3+3 live prompts · 17 reviewer-reproduced: no `dmarq` in evidence/doc/script, and the positive control hit 1 · 19 reviewer-reproduced: typecheck clean · 20 reviewer-reproduced: no `.sir/` in the 4 owned files, and the positive control hit 1.

*T2:* 1 red step (`expected 4 to be 5`) · 3 injected defect (DELETE then UPDATE at schema.ts:759) · 4 red step (migration-5.test.ts:175) · 5 injected defect (SET NULL→CASCADE, schema.ts:756) · 6 red step (:205) · 7 injected defect (constraint name removed) · 8 red step (:228) · 11 injected defect (amended, above) · 13 injected defect + reviewer-reproduced (both `@ts-expect-error` directives, TS2578) · 14 red step (fork.test.ts:177) · 16 red step (:203) · 17 red step (:212) · 18 injected defect (sqlite-event-store.ts:267) · 19 red step (:246) · 20 injected defect (:320) · 21 injected defect (:331) · 22 injected defect (:331) · 23 injected defect (:331) · 24 injected defect (:306) · 25 injected defect (:299) · 26 red step (:392) · 27 red step (:402) · 28 injected defect (transaction removed → {pods:2,lanes:4}) · 29 red step (:437) · 30 red step (:448) · 31 injected defect (CASCADE) · 32 injected defect (CASCADE) · 34 injected defect (round 2: :111, :187, :266 each injected and reverted) · 35 reviewer-reproduced (typecheck 0) · 36 reviewer-reproduced (npm test 149/2427).

*T3:* 2 red step · 3 red step + injected defect (I2) · 4 red step · 5 injected defect (I1) · 6 red step · 7 red step + injected defect (I14) · 8 red step · 9 red step · 10 injected defect (I10) · 11 injected defect (I8) · 12 injected defect (I11) · 13 red step · 14 injected defect (I6) · 15 injected defect (I7) · 16 red step · 17 injected defect (I4) · 18 injected defect (I5, I6) · 20 injected defect (I3) · 21 injected defect (I12) · 22 injected defect (I14) · 23 injected defect (I9) · 24 red step (channels.test expects 22) · 25 injected defect (I15) · 26 red step · 27 red step · 28 injected defect (I6) · 29 red step · 30 injected defect (I16) · 31 red step · 32 injected defect (I17) · 33 red step + injected defect (43 failed / 138 passed at red) · 34 reviewer-reproduced (typecheck 0) · 35 reviewer-reproduced (amended, above) · 36 reviewer-reproduced (no `.sir` in 19 files).

*T4:* 1 injected defect (store.ts:600) · 2 injected defect (store.ts:612–613) · 3 injected defect (re-wrap at :608) · 4 injected defect (:604) · 5 injected defect (PodTab.tsx:355) · 6 injected defect (wrong id in PodBar onFork) · 7 injected defect (tabOrder 0) · 8 injected defect (setActivePod removed) · 9 injected defect (PodsChrome.tsx:84) · 10 injected defect (PodTab.tsx:354, :360) · 11 injected defect (same sites) · 12 injected defect (onClick→onMouseDown) · 14 injected defect (PodTab.tsx:352) · 15 injected defect (PodsChrome.tsx:104) · 16 injected defect (id in place of title) · 17 injected defect (null-parent branch) · 18 injected defect (always-deleted sentence) · 19 injected defect (useRef freeze) · 20 injected defect (PodTab.tsx:365) · 21 injected defect (Fork hidden) · 24 reviewer-reproduced (typecheck 0) · 25 reviewer-reproduced (npm test 155/2510).

Every row is in `reviews/T1.md` … `reviews/T4.md`.

**Coverage** (mapped at Gate 2, checked at Gate 3; no amendment changed a contract): 13 of 13 definition-of-done items are `met` and 4 of 4 contract operations are `called`. One item was `uncovered` at Gate 2: D13 (design doc item 8). Gate 2 decision 3 made it a T1 criterion, and it is met (T1 #18). A `called` operation has a caller in the code, which does not by itself prove a user can reach it.

**Limits:** none. Every verification command ran in the worktree.

**Human checks.** No test can make these. Launch with `npm run dev`. This command is not in the verification record; it is the repo's `dev` script. Run it in the worktree `C:/Users/dmarq/Development/Repos/orcastrate/.claude-worktrees/20261105-1907-fork-session-branching`, which is removed when this gate closes. After the merge, run it in `C:/Users/dmarq/Development/Repos/orcastrate`.
- Check that the ⑂ glyph on each Pod tab shows as a fork mark (not a missing-glyph box) at the same size as ▶ and ×.
- On a Pod with no session, and on a running Pod, check that Fork looks dimmed with a not-allowed cursor and that hovering shows the reason tooltip.
- Hover a forked Pod's tab and check that the native tooltip reads "Forked from <parent title>".

## 3. What ran

| Task | Agent | Domain | Model | Reviews | Rounds | Redispatches | Commit |
|---|---|---|---|---|---|---|---|
| T1 | sir-backend-engineer | backend | opus | 1 | 0 | 0 | d164a69 |
| T2 | sir-database-engineer | database | opus | 2 | 1 | 0 | 0cfb633 |
| T3 | sir-backend-engineer | backend | opus | 1 | 0 | 0 | f70e6ee |
| T4 | sir-frontend-engineer | frontend | opus | 1 | 0 | 0 | 70f9c86 |

Reviewers were `sir-reviewer` (opus), 5 dispatches in all. Git work went to `sir-git` (haiku): init-session plus 4 task commits.

**Amendments (2):**
- A1 changed `manifest.json`, from E2. T2 #11 "no `INSERT`, `UPDATE` or `DELETE`" became "… `DELETE` statement".
- A2 changed `manifest.json`, from E3. T3 #35 "`npm test` exits 0" became "exits 0 except exactly the 4 named T4-owned channel-enumeration tests".

**Change surface:** `0d16358..agent/20261105-1907-fork-session-branching`, 4 commits. 51 files changed, 4390 insertions, 55 deletions. Run `git diff 0d16358..agent/20261105-1907-fork-session-branching` for the full diff.

## 4. Advisory findings

**Contract gaps (1)**
- T2: `remapPayloadLanes` writes remapped payloads back with `JSON.stringify`, so they keep their meaning but are not byte-identical to the stored text. The contract says only "nothing else in the payload changes". src/main/store/sqlite-event-store.ts:582

**Correctness risks (5)**
- T2: `remap` falls back to the original id (`laneMap.get(id) ?? id`). A payload lane reference that has no mapping silently keeps pointing at the parent's lane. src/main/store/sqlite-event-store.ts:291
- T3: `forkPod` does not check whether the fork port returned an empty string or the parent's own ccSessionId. src/main/pod-manager/pod-manager.ts:550
- T4: A refused fork's alert is cleared only when the next fork starts, so it stays on screen until then. src/renderer/src/pods/PodsChrome.tsx:95
- T4: A `forkedFromPodId` naming a Pod that is not listed renders "Forked from a deleted Pod". No test covers that branch; the e2e test covers only the null-parent branch. src/renderer/src/pods/fork-control.ts:65
- T1: Design doc item 8 says `forkSession` "returns its id before any CLI process runs". The probe shows only that the fork transcript existed before any resume (C2). docs/superpowers/specs/2026-08-18-orcastrate-design.md:464

**Test and CI concerns:** 4, listed in reviews/T1.md, T2.md, T4.md.
**Cosmetics:** 1, listed in reviews/T3.md.

## 5. Metrics

- userInteractions: 5 (Gate 1, Gate 2, E2, E3, and this gate; the push question is not counted yet)
- escalationsRaised: 3
- reviewRounds: 1 (equals the sum of the Rounds column)
