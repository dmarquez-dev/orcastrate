# Elapsed time since resume

Stop the lane rail's elapsed-time readout counting the time a Pod spent stopped: after a resume
the readout restarts from zero and shows how long the current run has gone on. Source: backlog
row 39 (`.sir/backlog.md:39`, appended by 20261119-2021-permission-modes-from-sdk, from the user
at that session's Gate 3).

## Context

- `elapsedMsOf` (`src/renderer/src/state/workspace-provider.tsx:304-310`) returns
  `endedAt - startedAt`, or `now - startedAt` while `lane.endedAt === null`. It feeds
  `LaneRowVm.elapsedMs` (`workspace-provider.tsx:293`; docblock at
  `src/renderer/src/contracts/renderer-state.ts:370`), rendered through `formatElapsed`
  (`src/renderer/src/lanes/format-elapsed.ts:16`) in `src/renderer/src/lanes/LaneRow.tsx:162`.
- Resume revives only the Matriarch lane: `#reviveMatriarchLane`
  (`src/main/pod-manager/pod-manager.ts:1115-1120`) calls `setLaneStatus(id, 'running')`, which
  sets `ended_at` to null (`src/main/store/sqlite-event-store.ts:431`). Nothing records when the
  lane came back, so the readout counts from the original `startedAt` across the stopped gap.
- Calf lanes are never revived (`pod-manager.ts:1109-1111`).
- `lane.startedAt` cannot be restamped on resume: Calf ordering sorts on it
  (`src/renderer/src/state/ordering.ts:33`) and the lane contract documents it
  (`src/shared/contracts/events.ts:182`).
- The store has migrations 1-6 (`src/main/store/schema.ts:918-923`, measured at base `2beb8da`).
- PR mode (`git.integration` `"pr"`), preflight reported `gh` ready and no `CLAUDE.md` override
  of the closeout. Base `main` at `2beb8da`.

## Decisions

- Track: Standard (Gate 1).
- E1 (ambiguous, raised and answered at Gate 1): the readout restarts at each resume. Options
  offered: restart at each resume (recommended, chosen); sum only running time; remove the
  readout. Answer: "Restart at each resume". Not deferred, so nothing goes to the backlog.
- Default, not corrected at Gate 1: the resume time is stored on the lane by a new migration 7,
  stamped by `setLaneStatus` whenever a lane goes back to `running`. The spec phase may derive
  it without a migration instead and must say so at Gate 2.
- Default, not corrected: Calf lanes are left alone; only the Matriarch's readout changes in
  practice. A lane that was never resumed keeps today's readout (`startedAt` to `endedAt`/now).
- Default, not corrected: architect, implementers and reviewers on opus; `sir-git` on haiku.
- Required test, from the row: stop a lane, advance the clock two days, resume, and the elapsed
  readout shows no two-day jump.
- One human check: stop a Pod, reopen it later, and the rail's time restarts from zero.
- Branch `fix/elapsed-since-resume` (`branchType` `fix`).
