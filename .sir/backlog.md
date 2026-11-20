# Backlog

<!-- Project-level, not session-level. Append one line per item at Gate 3,
     after approval: the date, the session id, and the action in a
     sentence. Never create this file when there is nothing to append. -->

<!-- Example: 2026-10-26 oauth-login Defer rate-limiting the refresh endpoint to a later session. -->

<!-- Seeded 2026-10-29 from the open items of the previous framework's backlog
     (.dir-sdlc/backlog.md and .dir-sdlc/handoff-after-keyword-sweep.md), every
     file:line citation re-measured against the tree that day. Session ids
     dir-audit-2026-10-09, dir-handrun-2026-10-07 and dir-handoff-2026-10-26
     name DIR blocks that had no session of their own. -->

## Correctness

## Tests and guards

## Prose drift

## Cosmetic and structural

## Design decisions

## Tooling

## Ungrouped (Gate 3 appends land here)
2026-11-05 20261105-0107-design-decisions-sweep Kept deferred: direct Calf steering (`src/main/pod/pod-runner.ts:486` still returns `{ supported: false }`); the steering tools exist, and the open question is how a user-authored message sent by the host reaches an agent without becoming that agent's permission consent (`docs/superpowers/specs/2026-08-18-orcastrate-design.md:444-452`).
2026-11-05 20261105-0107-design-decisions-sweep Kept deferred: the full config manager (MCP servers, hooks builder, agent/skill browsing), MVP-deferred at `docs/superpowers/specs/2026-08-18-orcastrate-design.md:438`.
2026-11-05 20261105-0107-design-decisions-sweep Kept deferred: adopting terminal-started Claude Code sessions by scanning `~/.claude/projects/`, MVP-deferred at `docs/superpowers/specs/2026-08-18-orcastrate-design.md:437`.
2026-11-05 20261105-0107-design-decisions-sweep Kept deferred: macOS and Linux validation, MVP-deferred at `docs/superpowers/specs/2026-08-18-orcastrate-design.md:443`.
2026-11-13 20261112-2120-composer-slash-autocomplete F1: render `system`/`informational` messages at levels other than `info`. Blocker: it needs an Orcastrate-owned visible marker and a design for each level. The LaneRouter purity rule (`src/main/lane/purity.test.ts`) allows no shared runtime import, and mapping these to `assistant_text` would attribute hook feedback to Claude.
2026-11-13 20261112-2120-composer-slash-autocomplete F2: mark a `/clear` or `/compact` boundary in the transcript. Blocker: the same marker problem, or a 13th `EventType`, which is a schema migration (`src/main/store/schema.ts`). Also undecided: whether the durable record shows a boundary at all.
2026-11-13 20261112-2120-composer-slash-autocomplete F3: capture a real slash-command turn into `tests/fixtures/protocol`. Blocker: the `local_command_output` and bypassed-`result` mappings in `src/main/lane/lane-router.ts` rest on SDK types and docs, not on a capture, and how the CLI echoes an expanded skill prompt is unmeasured.
2026-11-13 20261112-2120-composer-slash-autocomplete F5: reconcile a Pod's displayed `permissionMode` (`src/renderer/src/pods/PodTab.tsx`) with `system`/`init.permissionMode`. Blocker: no command is known to change it, and which side wins is a design decision.
2026-11-13 20261112-2120-composer-slash-autocomplete F6: terminal-only commands are offered before a Pod's first turn, because the SDK carries `terminal_slash_commands` only on `system`/`init` (`SDKControlInitializeResponse` has no terminal field). Blocker: the SDK surface; the list is shown unfiltered until the first `init`, as Gate 2 decided.
2026-11-13 20261112-2120-composer-slash-autocomplete Deferred, not execution gaps, from the slash-command autocomplete spec: inline ghost text, showing `argumentHint`, fuzzy or case-insensitive matching, commands for Calf lanes, stamping `origin` on prompts, persisting command lists, and changing the Composer placeholder.
2026-11-13 20261112-2120-composer-slash-autocomplete `routeResult` in `src/main/lane/lane-router.ts` treats `terminal_reason: null` as unset, beyond the SDK's declared `terminal_reason?: TerminalReason`. Revisit if the SDK starts sending null for a real reason. Check: `git grep -n "loopBypassed =" -- src/main/lane/lane-router.ts`.
2026-11-20 20261119-2021-permission-modes-from-sdk Give migrations 5 and 6 the frozen-blob tripwire: `SHIPPED_BLOB` in `tests/unit/store/migration-frozen.test.ts` holds entries for migrations 1-4 only. Add `5: '0cfb633:src/main/store/schema.ts'` (the commit "fork Pods via migration 5", found by `git log -S "version: 5, sql" --format="%h %s" -- src/main/store/schema.ts`) and `6: '0fc6ec4:src/main/store/schema.ts'` (the T1 commit that shipped migration 6), then extend `it.for([1, 2, 3, 4])` to `[1, 2, 3, 4, 5, 6]`. Check: `npm test` passes, and editing one character of MIGRATION_5's SQL fails the migration 5 case. Source: spec.md Not in scope, carried at Gate 3.
2026-11-20 20261119-2021-permission-modes-from-sdk `/clear` shows "Unparseable stream line … unrecognized message type \"conversation_reset\"" in the transcript. The SDK declares `SDKConversationResetMessage` (`type: 'conversation_reset'`, `new_conversation_id`, in node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts, documented as "Emitted by /clear, plan-mode exit, and fresh-session flows"), but the router's type switch in `src/main/lane/lane-router.ts` sends every type it does not know to `this.malformed(…, 'unrecognized message type …')`. Route `conversation_reset` explicitly so it is never recorded as malformed. How the reset shows in the transcript is the open marker design in the F2 row (mark a `/clear` or `/compact` boundary); until that is settled, recommended: drop it from the transcript and log it. The defect is present at base 3bb3007, so this session did not cause it. Check: a router test feeding `{"type":"conversation_reset",…}` produces no `malformed` event. Source: the user, during a Gate 3 human check.
2026-11-20 20261119-2021-permission-modes-from-sdk Fix the elapsed-time readout, and judge whether it is worth showing. `LaneRowVm.elapsedMs` (`src/renderer/src/contracts/renderer-state.ts`, rendered by `formatElapsed` in `src/renderer/src/lanes/format-elapsed.ts`) runs from `lane.startedAt` to `lane.endedAt`, or to now while the lane runs. So a Pod stopped for two days and then resumed counts those two days as working time, as the user observed. Options: count only time spent running (sum the run intervals; this needs the stop and resume times, which may mean a store change); restart the count at each resume; or remove the readout. Recommended: restart at each resume, which shows how long the current run has gone on. Check: a test that stops a lane, advances the clock by two days and resumes it expects an elapsed time with no two-day jump. Source: the user, at Gate 3.
2026-11-20 20261119-2021-permission-modes-from-sdk Add a working indicator to the main output: an animated ellipsis under an agent's latest message while that agent is working, removed once it stops. It goes alongside the lane rail's coloured status indicator and does not replace it, to show at a glance that nothing has stalled. Drive it from the same lane status the rail reads, so the two cannot disagree, and respect `prefers-reduced-motion`. Check: a transcript test shows the indicator while the lane is running and none once it finishes, and a reduced-motion test shows a static form. Source: the user, at Gate 3.
2026-11-20 20261119-2021-permission-modes-from-sdk Review Pod statuses and actions now that slash commands reach the SDK. The user does not expect to use fork, and thinks start/pause may be redundant once `/clear` and `/exit` work. List every Pod status and every user action on a Pod (fork, start/stop, pause/resume, delete), and for each say what a slash command or the SDK already covers. Remove what is redundant. Fork includes `forkPod` and migration 5's ancestry columns, so removing it needs a schema decision: keep the columns, or rebuild. Recommended: get `/clear` (row above) and `/exit` working first, then remove the redundant controls in one session, and keep fork's schema even if its UI goes. Check: the list is written into the session's spec with a citation for each status and action, and every control that is kept or removed has a test. Source: the user, at Gate 3.
