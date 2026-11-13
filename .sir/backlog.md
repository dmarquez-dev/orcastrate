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

2026-10-26 dir-handoff-2026-10-26 Build a live-`claude` hand-run harness, checking first whether the app's own IPC can reach a state; still unexercised are `B5`, the same-millisecond backup collision, `D3`, and narrow-window layout.

## Ungrouped (Gate 3 appends land here)
2026-11-05 20261105-0107-design-decisions-sweep Kept deferred: direct Calf steering (`src/main/pod/pod-runner.ts:486` still returns `{ supported: false }`); the steering tools exist, and the open question is how a user-authored message sent by the host reaches an agent without becoming that agent's permission consent (`docs/superpowers/specs/2026-08-18-orcastrate-design.md:444-452`).
2026-11-05 20261105-0107-design-decisions-sweep Kept deferred: the full config manager (MCP servers, hooks builder, agent/skill browsing), MVP-deferred at `docs/superpowers/specs/2026-08-18-orcastrate-design.md:438`.
2026-11-05 20261105-0107-design-decisions-sweep Kept deferred: adopting terminal-started Claude Code sessions by scanning `~/.claude/projects/`, MVP-deferred at `docs/superpowers/specs/2026-08-18-orcastrate-design.md:437`.
2026-11-05 20261105-0107-design-decisions-sweep Kept deferred: macOS and Linux validation, MVP-deferred at `docs/superpowers/specs/2026-08-18-orcastrate-design.md:443`.
2026-11-12 20261112-0151-workspace-load-retry Human check not made: with a workspace load failing (E8 `lanes.list`, E9 `events.read` or E10 `app.routingMode`, the only notifications that carry an action), check that the Retry button reads as a button next to the message, and that tabbing to it shows its thick focus ring (the `.action:focus-visible` rule in `src/renderer/src/notifications/Notifications.module.css`) unclipped by the item's border. Nothing in the app forces such a failure, so the check first needs a way to make one of those loads fail. Run `npm run dev` in the repository root.
2026-11-12 20261112-0151-workspace-load-retry Human check not made: definition-of-done item 38 of that session, that the Retry control is visible and legible in both the light and the dark theme. It needs the same failing load as the row above. Run `npm run dev` in the repository root.
2026-11-13 20261112-2120-composer-slash-autocomplete F1: render `system`/`informational` messages at levels other than `info`. Blocker: it needs an Orcastrate-owned visible marker and a design for each level. The LaneRouter purity rule (`src/main/lane/purity.test.ts`) allows no shared runtime import, and mapping these to `assistant_text` would attribute hook feedback to Claude.
2026-11-13 20261112-2120-composer-slash-autocomplete F2: mark a `/clear` or `/compact` boundary in the transcript. Blocker: the same marker problem, or a 13th `EventType`, which is a schema migration (`src/main/store/schema.ts`). Also undecided: whether the durable record shows a boundary at all.
2026-11-13 20261112-2120-composer-slash-autocomplete F3: capture a real slash-command turn into `tests/fixtures/protocol`. Blocker: the `local_command_output` and bypassed-`result` mappings in `src/main/lane/lane-router.ts` rest on SDK types and docs, not on a capture, and how the CLI echoes an expanded skill prompt is unmeasured.
2026-11-13 20261112-2120-composer-slash-autocomplete F4: add a pull channel for Pod command lists. A renderer reloaded while main keeps running shows no suggestions until the next `push:podCommands` or reopen. Blocker: no ordering rule exists between pull and push.
2026-11-13 20261112-2120-composer-slash-autocomplete F5: reconcile a Pod's displayed `permissionMode` (`src/renderer/src/pods/PodTab.tsx`) with `system`/`init.permissionMode`. Blocker: no command is known to change it, and which side wins is a design decision.
2026-11-13 20261112-2120-composer-slash-autocomplete F6: terminal-only commands are offered before a Pod's first turn, because the SDK carries `terminal_slash_commands` only on `system`/`init` (`SDKControlInitializeResponse` has no terminal field). Blocker: the SDK surface; the list is shown unfiltered until the first `init`, as Gate 2 decided.
2026-11-13 20261112-2120-composer-slash-autocomplete Deferred, not execution gaps, from the slash-command autocomplete spec: inline ghost text, showing `argumentHint`, fuzzy or case-insensitive matching, commands for Calf lanes, stamping `origin` on prompts, persisting command lists, and changing the Composer placeholder.
2026-11-13 20261112-2120-composer-slash-autocomplete `routeResult` in `src/main/lane/lane-router.ts` treats `terminal_reason: null` as unset, beyond the SDK's declared `terminal_reason?: TerminalReason`. Revisit if the SDK starts sending null for a real reason. Check: `git grep -n "loopBypassed =" -- src/main/lane/lane-router.ts`.
2026-11-13 20261112-2120-composer-slash-autocomplete The Composer's slash-command list stays rendered and clickable after the textarea loses focus, because `listOpen` in `src/renderer/src/composer/Composer.tsx` depends only on matches and dismissal. Decide whether blur closes it. Check: `git grep -n "const listOpen" -- src/renderer/src/composer/Composer.tsx`.
2026-11-13 20261112-2120-composer-slash-autocomplete The Composer's slash-command list stays dismissed if the parent rewrites the draft away and back with no local edit, because only a local edit calls `setDismissedFor(null)` in `src/renderer/src/composer/Composer.tsx`. No path in the app does this today. Check: `git grep -n "setDismissedFor" -- src/renderer/src/composer/Composer.tsx`.
2026-11-13 20261112-2120-composer-slash-autocomplete While the slash-command list is open, Esc closes it and does not interrupt (`handleListKey` in `src/renderer/src/composer/Composer.tsx`), so interrupting a running turn with `/…` in the draft takes two Esc presses. This is the behaviour the spec signed. Options raised by the security review: make Esc both close and interrupt while a turn is in flight, or keep it as designed.
