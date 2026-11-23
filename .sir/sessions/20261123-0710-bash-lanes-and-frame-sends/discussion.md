# Bash lanes and frame sends

Fix three defects the user hit while running Orcastrate: a send to a disposed render frame,
Bash exit codes rendered as red errors, and one Calf lane per Bash command. Also take backlog
row 39, the frozen-blob tripwire for migrations 5 and 6.

## Context

**1. Lanes from Bash commands.** `LaneRouter.onTaskStarted` (`src/main/lane/lane-router.ts:482-496`)
registers a Calf lane, keyed by `tool_use_id`, for every `system/task_started`. The CLI now
sends a `task_started` for each Bash call too, with `task_type: 'local_bash'` and the
command as its `description`. Something later materializes the lane; the spec finds the exact
path (likely `closeLane` from `task_updated`/`task_notification`, or `task_progress` through
`emit`). This session ran a read-only query (python `sqlite3`, `mode=ro`) on the user's
`%APPDATA%/orcastrate/orcastrate.db`. Pod "Reminder App Brainstorm" (`c106eded-…`) has 377
lanes. Its `task_started` events break down as 327 `local_bash` and 49 `local_agent`. 328 of the
lanes have no `subagent_type` and 49 are `general-purpose`. The matriarch lane is one of the
328, which leaves 327 Bash lanes, one per `local_bash` task. **Correction to the Gate 1 card:**
E2's question said 328 Bash lanes. The right figure is 327. In the same Pod: `lane_opened` 376, `lane_closed` 378, `system` 3082, total
`tool_use` 1512. Pod id and counts come from that query, recorded here because the scratch
script will not outlive this thread.

The protocol fixtures carry `"task_type":"local_agent"` on every occurrence: `git grep -ho` over
`tests/fixtures/protocol` printed 9 occurrences, all `local_agent`. **Correction to the Gate 1
card:** its first default said an absent `task_type` "covers older CLIs and the protocol
fixtures". The fixtures do not need that case. Absent still has to be treated as an agent task,
for older CLIs and for the hand-written messages in `lane-router.test.ts`.

**2. Exit codes in red.** A Bash call that exits non-zero comes back as `tool_result` with
`isError: true` and content `Exit code N\n<output>`. The same DB holds two examples:
`Exit code 1\nC:/…/.superpowers/brainstorm/305812-1795221241/` and
`Exit code 2\n/usr/bin/bash: -c: line 38: unexpected EOF …`.
`TranscriptEventItem.tsx:89-96` labels every `isError` result `Tool result (error)`, expands
it, and applies `styles.failed`. `ToolDisclosure.tsx:46-49` documents why tool errors are
treated that way.

**3. Disposed render frame.** The user's stack: `#consume` → `onMessage` → `guard2` →
`#persist` → `podEvent` → `sendToRenderers` → `WebContents.send` → `WebFrameMain.send`:
"Render frame was disposed before WebFrameMain could be accessed". It shows up after a long run
or after the window has been open a long time. `sendToRenderers` (`src/main/index.ts:86-93`)
skips a destroyed window and destroyed `webContents`, but not a disposed or crashed main frame.
Why the frame was disposed is still unknown. Candidates are a renderer crash or OOM (possibly
the 377-lane Pod), a reload, or a GPU or sleep event. The spec should check what Electron
exposes (`webContents.mainFrame`, `isCrashed()`, `render-process-gone`) in the installed
Electron version before choosing the guard.

**4. Backlog row 39** (`.sir/backlog.md:39`). `SHIPPED_BLOB` (`tests/unit/store/migration-frozen.test.ts:64`)
holds entries for migrations 1 to 4, and `it.for([1, 2, 3, 4])` is at `:148`. `git log -1`
confirms `0cfb633` is "feat(store): fork Pods via migration 5 and EventStore.forkPod" and
`0fc6ec4` is "feat: derive PermissionMode from the Agent SDK and admit six modes".
`git grep -c "version: [0-9]*, sql"` over `src/main/store/schema.ts` prints 6. Row 39 is
removed from the backlog at Gate 3 once the work is done.

Backlog rows passed over at Gate 1: 28 to 31 are kept deferred, 32 to 36 (F1, F2, F3, F5, F6)
are blocked, 37 holds deferred spec items, and 38 is revisit-only. Rows 40 to 42 (the
elapsed-time readout, the working indicator, the Pod status review) are left for their own
sessions.

## Decisions

- Track: Standard (Gate 1). Branch `fix/bash-lanes-and-frame-sends` (`branchType` `fix`).
- E1 (Gate 1, recommended option): a Bash `tool_result` whose content shows a non-zero exit
  renders as a normal result. It is collapsed, labelled with its exit code (e.g.
  `Tool result (exit 1)`), and has no failure border. Every other `isError` tool result keeps
  its current treatment (`Tool result (error)`, expanded, `styles.failed`). The spec defines how
  a result is recognised as a Bash exit (the tool name of the matching `tool_use`, the
  `Exit code N` prefix, or both).
- E2 (Gate 1, recommended option): fix new runs only. No schema change, no data change, and no
  read-time hiding. Lanes already stored stay as they are.
- A `task_started` opens a lane only when its `task_type` is `local_agent` or absent. Any other
  `task_type` (`local_bash` and anything new) registers no lane. Its `task_progress`,
  `task_updated` and `task_notification` stay on the Matriarch lane as `system` events and
  never materialize a lane.
- `sendToRenderers` also skips a crashed renderer or one with no live main frame, and wraps
  `send` so a failing send is logged once and never thrown. Main also logs
  `render-process-gone` (its reason and exit code) so the cause of a disposed frame can be
  found later. The disposed-frame fix is checked by a unit test, because reproducing it needs
  hours of runtime. `sendToRenderers` may be extracted from `index.ts` so it can be tested.
- Row 39 is done as the row states.
- Predicted human checks, 2: a fresh Pod running Bash commands shows no new lanes for them, and a
  non-zero Bash exit shows as E1 describes.
- Models: implementers and the reviewer run on opus, `sir-git` on haiku.
- Integration: PR mode, per CLAUDE.md. The branch is pushed and the user opens and merges the PR
  with a merge commit.
