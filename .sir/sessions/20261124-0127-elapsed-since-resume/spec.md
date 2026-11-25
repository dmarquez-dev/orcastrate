# Elapsed time since resume

After a Pod is resumed, the lane rail's elapsed-time readout restarts from zero and shows how long the current run has gone on, instead of counting the time the Pod spent stopped.

## Context

`elapsedMsOf` (`src/renderer/src/state/workspace-provider.tsx:304-310` at base `2beb8da`) measures from `lane.startedAt` to `lane.endedAt`, or to now while `endedAt` is null. A resume revives only the Matriarch lane: `#reviveMatriarchLane` (`src/main/pod-manager/pod-manager.ts:1115-1120`) calls `setLaneStatus(id, 'running')`, which clears `ended_at` (`src/main/store/sqlite-event-store.ts:431`). Nothing records when the lane came back, so a Pod stopped for two days and then reopened shows those two days as working time. The user reported this at the Gate 3 of 20261119-2021-permission-modes-from-sdk. Gate 1 of this session (E1) chose "restart at each resume".

`startedAt` cannot be restamped, because `listLanes` and Calf ordering sort on it. The fix is a new nullable `lanes.resumed_at` column (migration 7). The store stamps it when a lane goes from a terminal status back to `running`, and the rail counts from `resumedAt ?? startedAt`.

## Definition of done

- [ ] D1. `interface Lane` declares `resumedAt: Timestamp | null`, and its docblock states the rule in place: null until a resume; not cleared when the lane ends again; `startedAt` never restamped; the current run began at `resumedAt ?? startedAt`.
- [ ] D2. Migration 7 adds one nullable `lanes.resumed_at` column and backfills nothing. Every pre-existing lane row keeps every value it had and reads `resumed_at` NULL, and the row counts and `schema_version` history are intact.
- [ ] D3. Migrations 1–6 render unchanged (`migration-frozen.test.ts`).
- [ ] D4. `setLaneStatus` stamps `resumedAt` exactly when a lane goes from a terminal status (`done`, `orphaned`, `stopped`) to `running`. A `running` lane set to `running` keeps its `resumedAt`. A terminal status leaves `resumedAt` as it was. `listLanes` and `getLane` read the stamp back.
- [ ] D5. `startedAt` is never restamped by a stop or a resume.
- [ ] D6. `forkPod` copies each parent lane's `resumed_at` to the fork's lane.
- [ ] D7. A Matriarch revived by `openPod` or `reconnectPod` is stamped from PodManager's injected clock, not from the store's wall clock.
- [ ] D8. Calf lanes are not revived and read `resumedAt` null.
- [ ] D9. The rail's `LaneRowVm.elapsedMs` counts from `resumedAt` when it is set: now − `resumedAt` while the lane runs, and `endedAt` − `resumedAt` once it ends.
- [ ] D10. A lane that was never resumed keeps today's reading (`startedAt` to `endedAt`/now).
- [ ] D11. The required test: open a Pod, stop it, advance the clock two days, open it again, advance 5 s, and the Matriarch's elapsed readout is exactly `formatElapsed(5_000)`, with no two-day jump.
- [ ] D12. Migration 7 is recorded in the frozen-migration tripwire at the commit that shipped it.
- [ ] D13. Repo-wide typecheck (`npm --prefix <worktree> run typecheck`) exits 0.
- [ ] D14. The whole suite (`npm --prefix <worktree> test`) exits 0, and its RUN line names the worktree.
- [ ] D15. Docblocks state their rules in place; no file under `src` or `tests` cites this session or a `.sir/sessions` path.
- [ ] D16. Human check H1: open a Pod at least once so its Matriarch lane exists; press Stop on its tab; wait at least 2 minutes; press Open. While stopped, the Matriarch row reads Stopped and its time is frozen. Right after Open, its elapsed time starts near `0s` and climbs, rather than resuming from the minutes since the lane first started. Quitting and relaunching the app instead of waiting gives the same result: the boot sweep orphans the lane and Open stamps it. No task covers H1; Gate 2 (D1) routed it to a human check, carried to `.sir/backlog.md` at Gate 3.

## Scope

The store, PodManager's revive, the rail's elapsed derivation, and the frozen-migration tripwire.

### Not in scope

- Summing running time across runs (E1 chose restart at each resume).
- Removing the readout.
- Reviving Calf lanes.
- Backfilling `resumed_at` for lanes that existed before the upgrade: they read as never resumed until their next resume.
- Showing `resumedAt` anywhere other than the elapsed readout.

## Assumptions

| Question | Answer | Rung | Evidence |
|---|---|---|---|
| Store the resume time, or derive it? | Store it, in a new migration 7 column (the Gate 1 default stands). A revive writes no event, the renderer reads events in pages, and the rail builds from lane rows rather than event payloads, so a derived time would be wrong whenever the right page is not loaded. | repo | `pod-manager.ts:1115-1120`; `workspace-provider.tsx:293` |
| Does a new lane stamp `resumedAt`? | No, it reads null. The run start is `resumedAt ?? startedAt`. | judgment | contracts/lane-resumed-at.ts §1 |
| Is `resumedAt` cleared when a lane ends again? | No. A lane stopped after a resume shows the length of its last run, which is consistent with E1. | judgment | E1; contracts/lane-resumed-at.ts §1 |
| Does `running` → `running` restamp? | No. Only a change from a terminal status to `running` stamps. | judgment | contracts/lane-resumed-at.ts §2 |
| Does `forkPod` copy `resumed_at`? | Yes, unchanged, alongside `started_at`. | judgment | contracts/lane-resumed-at.ts §3 |
| Whose clock stamps a revive? | PodManager's injected `now`, the same clock that stamped the stop. | repo | `pod-manager.ts:699` (stop uses the manager's `at`) |
| Do lanes cross IPC through a payload validator? | No. `endedAt` appears under src/main, src/preload and src/shared only in the store, router, pod-manager and contract files. | repo | architect's `grep -rln endedAt`, with `lane-router.ts` as the positive control |
| How many places break when the field becomes required? | 9 sites in 7 files at typecheck, and 1 test at runtime (`lanes.test.ts` createLane `toStrictEqual`). T1 owns all of them. | repo | architect's scratch typecheck: node 4 errors, web 9 |
| Where does the required test live? | In `pod-stop.e2e.test.tsx`, which already drives the real store and PodManager under a faked `Date` and is already on `hygiene.test.ts`'s `MAIN_REACHING_FILES`. | repo | `hygiene.test.ts:162-165`; `pod-stop.e2e.test.tsx:33,464` |
| Can tasks build concurrently? | Only T2 and T4 overlap, and each runs scoped vitest only. Repo-wide typecheck and suite runs sit in T1 (which runs alone) and T3 (which runs alone, last). | repo | manifest `dependsOn` |

## Contracts

- [contracts/lane-resumed-at.ts](contracts/lane-resumed-at.ts): §1 the `Lane.resumedAt` field, §2 `setLaneStatus`'s resume stamp, §3 `MIGRATION_7` and the `forkPod` copy.

## Open questions

None.
