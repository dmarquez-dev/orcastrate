# Coverage

| Item | Covering task | Gate 2 | End state |
|---|---|---|---|
| D1 `Lane.resumedAt` field and its docblock | T1 (C1) | covered | met (T1 C1) |
| D2 Migration 7 adds `lanes.resumed_at`, backfills nothing | T1 (C3, C4, C6, C7, C8) | covered | met (T1 C3, C4, C6, C7, C8) |
| D3 Migrations 1–6 unchanged | T1 (C5) | covered | met (T1 C5) |
| D4 `setLaneStatus` resume stamp, all cases | T1 (C2, C10–C16, C18, C21) | covered | met (T1 C2, C10–C16, C18, C21) |
| D5 `startedAt` never restamped | T1 (C17) | covered | met (T1 C17) |
| D6 `forkPod` carries `resumed_at` | T1 (C19, C20) | covered | met (T1 C19, C20) |
| D7 Revive stamped from the manager's clock | T2 (C1, C2, C5) | covered | met (T2 C1, C2, C5) |
| D8 Calf lanes not revived, `resumedAt` null | T2 (C3) | covered | met (T2 C3) |
| D9 Rail counts from the resume | T3 (C1, C2) | covered | met (T3 C1, C2) |
| D10 Never-resumed lane keeps today's reading | T3 (C3, C4); T2 (C4) | covered | met (T3 C3, C4; T2 C4) |
| D11 Required test: stop, +2 days, resume, no jump | T3 (C6, C7, C8, C9) | covered | met (T3 C6, C7, C8, C9) |
| D12 Migration 7 in the frozen-migration tripwire | T4 (C1–C5) | covered | met (T4 C1–C5) |
| D13 Repo-wide typecheck exits 0 | T1 (C23); T3 (C12) | covered | met (T1 C23; T3 C12) |
| D14 Whole suite passes, RUN line names the worktree | T1 (C24); T3 (C13) | covered | met (T1 C24; T3 C13: 186 files, 2998 tests, RUN line names the worktree) |
| D15 Rules stated in place; no session citation in src/tests | T1 (C1, C2, C4, C25); T2 (C6, C8); T3 (C10, C14) | covered | met (T1 C1, C2, C4, C25; T2 C6, C8; T3 C10, C14) |
| D16 Human check H1 | none | uncovered; Gate 2 D1: a human check, carried to `.sir/backlog.md` at Gate 3 | met: human check H1 passed at Gate 3, observed by the user against `npm --prefix C:/Users/dmarq/Development/Repos/orcastrate/.claude-worktrees/20261124-0127-elapsed-since-resume run dev` (the session worktree at `d481181`) |

| Operation | Implementing task | Consuming task | Gate 2 | End state |
|---|---|---|---|---|
| `Lane.resumedAt` | T1 (definition `src/shared/contracts/events.ts:199`) | T3 (`elapsedMsOf`) | covered; predicted `called` | called: `src/renderer/src/state/workspace-provider.tsx:312` (absent at base `2beb8da`); prediction confirmed. Search: `git grep -nw resumedAt fix/elapsed-since-resume -- src`; hits in `lane-router.ts` and `rows.ts` discarded as T1-owned, test files discarded |
| `setLaneStatus` resume stamp | T1 (definition `src/main/store/sqlite-event-store.ts:430`) | T2 (`#reviveMatriarchLane`) | covered; predicted `called` | called (pre-existing): `src/main/pod-manager/pod-manager.ts:1125`, which calls `setLaneStatus(matriarchLaneId, 'running')` at base `:1118`; T2 added the `at` argument. Prediction confirmed as `called`, qualified pre-existing |
| `MIGRATION_7` | T1 (definition `src/main/store/schema.ts:932`) | T4 (`SHIPPED_BLOB[7]`) | covered; predicted `called` | applied: the only whole-word hit beyond the definition is `MIGRATIONS` in the same file (`schema.ts:947`, `{ version: 7, sql: MIGRATION_7 }`), which `migrate()` applies; T4 reads it through `shippedMigration(7)` (`tests/unit/store/migration-frozen.test.ts:186`), not by name. Prediction `called` refuted: a migration is applied, not called. Search: `git grep -nw MIGRATION_7 fix/elapsed-since-resume -- src tests` |
| `forkPod` copies `resumed_at` | T1 (definition `src/main/store/sqlite-event-store.ts:254`) | pre-existing caller `pod-manager.ts:608` (no task changes it) | covered; predicted `called` | called (pre-existing): `src/main/pod-manager/pod-manager.ts:608`, present at base `2beb8da:…:608`; prediction confirmed |
