# Bash lanes and frame sends

Stop Bash commands from opening Calf lanes, stop rendering a non-zero Bash exit as a red tool error, make renderer pushes survive a disposed or crashed frame, and give migrations 5 and 6 the frozen-blob tripwire.

## Context

- **Lanes from Bash.** `LaneRouter.onTaskStarted` (`src/main/lane/lane-router.ts:482-496`) registers a Calf lane for every `system/task_started`. The CLI now sends one per Bash call, with `task_type: 'local_bash'`. A registered lane materializes in one of three ways: through a terminal `task_updated`/`task_notification` (`closeByAgentId` → `closeLane`, `:511-516`, `:679-692`), through `task_progress` (`resolveLaneId`/`emit`, `:440-451`, `:733-761`), or when `onTurnBoundary` orphan-closes it (`:594-602`). One user Pod holds 377 lanes, and 327 of them are Bash lanes (discussion.md).
- **Exit codes in red.** `TranscriptEventItem.tsx:83-101` labels every `isError` tool result `Tool result (error)`, expands it, and applies `styles.failed`. A Bash call that exits non-zero comes back exactly that way, with content `Exit code N\n<output>`. The `tool_result` payload carries `toolUseId` and no tool name (`src/shared/contracts/events.ts:276-282`).
- **Disposed frame.** `sendToRenderers` (`src/main/index.ts:86-93`) skips a destroyed window and destroyed `webContents`, but not a crashed renderer or a disposed main frame, so `WebFrameMain.send` threw "Render frame was disposed before WebFrameMain could be accessed" up through `#persist`. Electron 43.4.0 declares `WebContents.isCrashed()`, `mainFrame`, `WebFrameMain.isDestroyed()`/`detached`, and the App `render-process-gone` event (`node_modules/electron/electron.d.ts:18232`, `:18687`, `:19014`, `:19069`, `:700`).
- **Backlog: migrations 5 and 6 frozen-blob tripwire** (asked by `20261119-2021-permission-modes-from-sdk`). `SHIPPED_BLOB` (`tests/unit/store/migration-frozen.test.ts:64-69`) covers migrations 1-4 only. `0cfb633` holds `MIGRATION_5` and not `MIGRATION_6`, and `0fc6ec4` holds both (measured with `git show <sha>:src/main/store/schema.ts | grep -c`).

## Definition of done

- [ ] D1. A `task_started` whose `task_type` is a string other than `'local_agent'` registers no lane. Its later `task_updated`, `task_notification` and `task_progress` and the turn boundary emit no `lane_opened` or `lane_closed`, and `lanes()`, `getLaneByToolUseId` and `agentIds` gain nothing.
- [ ] D2. Those messages remain Matriarch `system` events.
- [ ] D3. A `task_type` of `'local_agent'`, or none at all, opens and closes a lane as before, and the protocol-fixture replay suite passes.
- [ ] D4. A Bash `tool_result` with `isError` and content beginning `Exit code N` (N ≠ 0), given as a string or as a text-block array, renders collapsed, labelled `Tool result (exit N)`, with no `styles.failed`.
- [ ] D5. Every other `isError` tool result keeps `Tool result (error)`, expanded, with `styles.failed`. That covers a non-Bash tool, a `tool_use` that is not loaded, and a Bash error with no exit prefix. A Bash result that is not an error stays `Tool result`.
- [ ] D6. The `ToolDisclosure` and `TranscriptEventItem` comments describe the new rule.
- [ ] D7. The renderer broadcast never throws. It skips a crashed renderer and a main frame that is destroyed, detached or unreadable, and it still delivers to the other windows.
- [ ] D8. A failing send is logged once per webContents per failure episode, with the channel, the id and the error, and never the payload.
- [ ] D9. `render-process-gone` is logged with its reason, exit code and webContents id.
- [ ] D10. The destroyed-window and destroyed-webContents skips are preserved. `index.ts` still wires `sendToRenderers` into `createPushes` and Helm, and its comments are accurate.
- [ ] D11. Migrations 5 and 6 are in `SHIPPED_BLOB` and in the `it.for` list, and they pass with nothing skipped.
- [ ] D12. Editing one character of `MIGRATION_5`'s SQL fails the migration 5 case alone, and the same holds for 6. `schema.ts` ends byte-identical to the task's start.
- [ ] D13. The migration-frozen docblocks name 1-6 as the checked set.
- [ ] D14. The full suite passes with 183 test files, typecheck exits 0, and no product source under `src` cites a session path.
- [ ] D15. The backlog row "Give migrations 5 and 6 the frozen-blob tripwire" is removed from `.sir/backlog.md` in the session's records commit after Gate 3 approval. At Gate 3 this row reads `pending (removed in the records commit)`.
- [ ] H1. Human check: in a new Pod run from the worktree, three separate Bash calls (`echo one`, `echo two`, `echo three`) add no "Lane opened" row and no lane to the lane rail; the Matriarch is the only lane. Control: dispatching one general-purpose subagent adds exactly one lane.
- [ ] H2. Human check: in that Pod, `exit 3` through the Bash tool shows a row labelled `Tool result (exit 3)`, collapsed (a "Show tool result (…)" button), with no red border, and expanding it shows `Exit code 3`. Control: a Read of `C:/does-not-exist.txt` still shows `Tool result (error)`, expanded, with a red border.

## Scope

T1 changes the router's `task_started` handling (`src/main/lane/lane-router.ts`). T2 adds a Bash-exit recogniser to the transcript and threads the tool name through the pane. T3 extracts the renderer broadcast into `src/main/renderer-push.ts` with guards, once-per-episode logging and a `render-process-gone` logger, and wires them in `src/main/index.ts`. T4 extends the migration-frozen test. T5 runs the whole-tree gate.

### Not in scope

- Lanes already stored, including the 327 Bash lanes in the Pod measured. E2 decided they stay as they are: no schema change, no data change, no read-time hiding.
- Why the frame was disposed in the first place. This session only adds the `render-process-gone` log that will show it.
- Backlog rows 28-38 and 40-42, as passed over at Gate 1 (discussion.md).

## Assumptions

| Question | Answer | Rung | Evidence |
|---|---|---|---|
| How is a Bash exit recognised? | All three must hold: `isError` is true; the `tool_use` with the same id among the pane's loaded `view.events` is named exactly `Bash`; and the text (the string itself, or `content[0].text` for a text-block array) matches `^Exit code ([0-9]+)(\r?\n\|$)` with N ≠ 0. If the tool name is unknown, the result keeps the error treatment. Prefix-only matching was rejected because it would relabel a non-Bash error, against E1. | repo + judgment | `events.ts:276-282` (no tool name on the payload); `TranscriptPane.tsx:117-128` (`dispatchLanesBySeq` precedent); E1 |
| What is the Bash tool's name? | `'Bash'` | repo | 8 `"name":"Bash"` occurrences across 4 files under `tests/fixtures/protocol` |
| Is a non-string or `null` `task_type` absent, so a lane still opens? | Yes. `str()` reads any non-string as null. Only a string other than `'local_agent'` suppresses the lane. | repo + judgment | `messages.ts` `str`; discussion decision |
| Does `'local_workflow'` or any future value open a lane? | Not from its `task_started`. An `Agent` dispatch inside it still opens one through the `tool_use` path. | discussion | discussion.md Decisions; `sdk.d.ts:4854-4856` |
| Can a permission prompt carry a Bash task's id as its `agentId`? | Not expected: `canUseTool`'s `agentId` names a subagent. If one did, `#attributePrompt` falls back to the Matriarch and logs drift, which is visible, not silent. | judgment | `pod-manager.ts:1362-1381` |
| What does "logged once" mean? | Per webContents `id`, per failure episode. The first throw (a pre-check or `send`) logs one line and marks the id. Repeats stay silent while it is marked. A send that completes clears the mark. Skips that throw nothing do not log. | judgment | discussion decision; backend discipline, Logging |
| What do the send pre-checks cover? | `isCrashed()`, `mainFrame.isDestroyed()` and `mainFrame.detached`, all inside the try. The `mainFrame` getter itself can throw, so the try/catch is the guarantee. | repo | `electron.d.ts:18232`, `:18687`, `:19014`, `:19069` |
| Where is `render-process-gone` attached? | `app.on('render-process-gone', …)` in `index.ts`, which also covers windows opened later by `activate`. The listener factory lives in `renderer-push.ts` so it can be tested. | repo | `electron.d.ts:700` |
| Is the name `sendToRenderers` kept? | Yes. Unowned prose names it. | repo | `pod-manager.ts:330`, `shared/contracts/helm.ts:331`, `tests/unit/ipc/helpers.ts:220`, `call-site.test.ts:73` |
| Does the migration test read the committed blob? | Yes, through `git show <ref>`, so autocrlf does not affect it. | repo | `migration-frozen.test.ts:123-127` |
| Can T1-T4 run concurrently? | Yes. Typecheck is `--noEmit --composite false` and writes nothing. vitest writes only its `node_modules/.vite` cache. T1-T4 run only scoped tests, and the repo-wide suite and typecheck run only in T5, after all four. | repo + judgment | `package.json:17-18`; lessons.md 2026-11-04 |
| Which tasks inject defects, and into what? | T1 into `lane-router.ts`, T2 into `bash-exit.ts`/`TranscriptEventItem.tsx`, T3 into `renderer-push.ts`, and T4 into `schema.ts:822` and `:906`. Each injection is read only by its own task's scoped run and reverted before it ends. | repo | manifest criteria T1 C11, T2 C15, T3 C19, T4 C4-C6 |

## Contracts

None. No interface crosses a task boundary: the recogniser and its consumers are all T2's, and the broadcast factory and its wiring are all T3's.

## Open questions

None.
