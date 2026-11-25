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
2026-11-13 20261112-2120-composer-slash-autocomplete,20261119-2021-permission-modes-from-sdk F2: mark a `/clear` or `/compact` boundary in the transcript, including the SDK's `conversation_reset` message, which `src/main/lane/lane-router.ts` currently records as malformed (route it out of `malformed` first and, until the marker is settled, drop it from the transcript and log it). Blocker: the same marker problem, or a 13th `EventType`, which is a schema migration (`src/main/store/schema.ts`). Also undecided: whether the durable record shows a boundary at all.
2026-11-13 20261112-2120-composer-slash-autocomplete F3: capture a real slash-command turn into `tests/fixtures/protocol`. Blocker: the `local_command_output` and bypassed-`result` mappings in `src/main/lane/lane-router.ts` rest on SDK types and docs, not on a capture, and how the CLI echoes an expanded skill prompt is unmeasured.
2026-11-13 20261112-2120-composer-slash-autocomplete F5: reconcile a Pod's displayed `permissionMode` (`src/renderer/src/pods/PodTab.tsx`) with `system`/`init.permissionMode`. Blocker: no command is known to change it, and which side wins is a design decision.
2026-11-13 20261112-2120-composer-slash-autocomplete F6: terminal-only commands are offered before a Pod's first turn, because the SDK carries `terminal_slash_commands` only on `system`/`init` (`SDKControlInitializeResponse` has no terminal field). Blocker: the SDK surface; the list is shown unfiltered until the first `init`, as Gate 2 decided.
2026-11-13 20261112-2120-composer-slash-autocomplete Deferred, not execution gaps, from the slash-command autocomplete spec: inline ghost text, showing `argumentHint`, fuzzy or case-insensitive matching, commands for Calf lanes, stamping `origin` on prompts, persisting command lists, and changing the Composer placeholder.
2026-11-13 20261112-2120-composer-slash-autocomplete `routeResult` in `src/main/lane/lane-router.ts` treats `terminal_reason: null` as unset, beyond the SDK's declared `terminal_reason?: TerminalReason`. Revisit if the SDK starts sending null for a real reason. Check: `git grep -n "loopBypassed =" -- src/main/lane/lane-router.ts`.
2026-11-20 20261119-2021-permission-modes-from-sdk Add a working indicator to the main output: an animated ellipsis under an agent's latest message while that agent is working, removed once it stops. It goes alongside the lane rail's coloured status indicator and does not replace it, to show at a glance that nothing has stalled. Drive it from the same lane status the rail reads, so the two cannot disagree, and respect `prefers-reduced-motion`. Check: a transcript test shows the indicator while the lane is running and none once it finishes, and a reduced-motion test shows a static form. Source: the user, at Gate 3.
2026-11-20 20261119-2021-permission-modes-from-sdk Review Pod statuses and actions now that slash commands reach the SDK. The user does not expect to use fork, and thinks start/pause may be redundant once `/clear` and `/exit` work. List every Pod status and every user action on a Pod (fork, start/stop, pause/resume, delete), and for each say what a slash command or the SDK already covers. Remove what is redundant. Fork includes `forkPod` and migration 5's ancestry columns, so removing it needs a schema decision: keep the columns, or rebuild. Recommended: get `/clear` (row above) and `/exit` working first, then remove the redundant controls in one session, and keep fork's schema even if its UI goes. Check: the list is written into the session's spec with a citation for each status and action, and every control that is kept or removed has a test. Source: the user, at Gate 3.
2026-11-23 20261123-0710-bash-lanes-and-frame-sends Give each renderer-push failure its own log mark when the id is not yet known. In `createRendererPush` (`src/main/renderer-push.ts`), `failing` is a `Set<number | undefined>` and `id` stays unset until `contents.id` is read, so throws from `window.isDestroyed()` or from reading `webContents` are all keyed `undefined`, and several windows failing that way log once between them. Key the mark per window object (e.g. a `WeakSet` of windows) or log those throws unconditionally. Check: a test in `tests/unit/main/renderer-push.test.ts` where two windows throw from `isDestroyed()` on one broadcast expects two log lines. Source: T3 review A2, carried at Gate 3.
2026-11-23 20261123-0710-bash-lanes-and-frame-sends Stop a CLI message from posing as the startup-reconciliation notice. `isStartupReconciliationNotice` (`src/renderer/src/transcript/transcript-filter.ts`) shows a `system` event in both filter modes when `data.subtypeMarker` equals the marker, and `LaneRouter` (`src/main/lane/lane-router.ts`) stores every CLI `system` message, and now `tool_progress`, with the whole message as `data`, so a CLI line carrying that field would render as the notice. This was already so at 293864a. A CLI `system` message whose own subtype equals the marker would match the same way. Recommended: in the router, strip `subtypeMarker` from CLI-sourced `data` and store a CLI subtype equal to `STARTUP_RECONCILIATION_SUBTYPE` as `malformed`. The real producer, `#appendReconciliationEvents` in `src/main/pod-manager/pod-manager.ts`, writes to the store directly, not through the router. Check: router tests where a CLI `system` message carrying either carrier is not stored as the notice, and a transcript-filter test where such an event stays hidden in conversation mode. Source: background security review of d24d4aa, carried at Gate 3.
