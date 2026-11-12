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
2026-11-10 20261110-1821-slash-command-autocomplete Add slash-command autocomplete to the Composer textarea (`src/renderer/src/composer/Composer.tsx:130`, placeholder `:147`): on a leading `/`, show the first 5 commands whose name or alias starts with the typed prefix. Read the list at runtime from the Pod's SDK `Query`: `supportedCommands()` (`node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts:2506`, SDK 0.3.235) for the first list, then let each `system`/`commands_changed` push (`sdk.d.ts:3132-3137`) replace it when plugins or skills change mid-session. Neither is connected today: `src/main/pod/sdk-bridge.ts:72-79` exposes only `interrupt`, `setPermissionMode` and `initializationResult`, and nothing in `src/main` handles `commands_changed`. Open: inline ghost text or a 5-row dropdown; whether to hide `terminal_slash_commands` (`sdk.d.ts:4770`); and which commands actually run when sent as a prompt through the SDK.
2026-11-11 20261111-0156-message-alerting Check whether a `role="status"` notification inserted already holding its text is announced by Windows screen readers (`src/renderer/src/notifications/NotificationItem.tsx:73`); if not, render the live region empty and set its text after insertion. Human check N6 in `docs/human-checks/message-alerting.md` is the observation that settles it.
2026-11-11 20261111-0156-message-alerting Human check not made: N3 in `docs/human-checks/message-alerting.md`, that a notification sits about 16 px from the bottom-right corner and overlaps no Pod tab, Pod bar or panel strip at 1280×800, 940×600 and maximised. Run `npm run dev` in the repository root.
2026-11-11 20261111-0156-message-alerting Human check not made: N5 in `docs/human-checks/message-alerting.md`, that an error notification shows at full brightness above the scrim of the New Pod and Delete dialogs and is not dimmed. Run `npm run dev` in the repository root.
2026-11-11 20261111-0156-message-alerting Human check not made: N6 in `docs/human-checks/message-alerting.md`, that Narrator reads an error notification at once and a success ("Pod deleted: HC spare") politely, without moving focus. Run `npm run dev` in the repository root.
2026-11-11 20261111-0156-message-alerting Human check not made: N7 step 5 in `docs/human-checks/message-alerting.md`, whether the focus outline on the empty notification region is visible after the last item is dismissed from the keyboard. Run `npm run dev` in the repository root.
2026-11-12 20261112-0151-workspace-load-retry Human check not made: with a workspace load failing (E8 `lanes.list`, E9 `events.read` or E10 `app.routingMode`, the only notifications that carry an action), check that the Retry button reads as a button next to the message, and that tabbing to it shows its thick focus ring (the `.action:focus-visible` rule in `src/renderer/src/notifications/Notifications.module.css`) unclipped by the item's border. Nothing in the app forces such a failure, so the check first needs a way to make one of those loads fail. Run `npm run dev` in the repository root.
2026-11-12 20261112-0151-workspace-load-retry Human check not made: definition-of-done item 38 of that session, that the Retry control is visible and legible in both the light and the dark theme. It needs the same failing load as the row above. Run `npm run dev` in the repository root.
