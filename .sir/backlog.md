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
2026-11-11 20261110-1857-chrome-alert-width Measure an open-error or pods-error alert shown together with a long reorder alert. The zero-basis `.reorderRow` (`src/renderer/src/pods/PodBarPanel.module.css:30`) counts its max-content toward the panel's max-content: fix-run O22 `podBarWidthReference` 940.513 plus the short "refused" reorder alert's 52.15 equals O30's `b`, 992.663. Re-measure with `python -I` over `.dir-sdlc/handruns/2026-09-30-electron-handrun/driven-report-chrome-alert-width.json`, reading `measured` of O22 and O30. A long reorder message would therefore inflate the panel's basis and narrow the alert row, and no driver observation covers the combination.
2026-11-11 20261110-1857-chrome-alert-width High priority: research the best native mechanism for alerting the user to events (error, informational, success; toasts are one candidate, and others are open) and build it into the app. Reconsider the in-row alerts in the Pod tab header, which the user questioned as the right place for error messages at this session's Gate 3: `.alertRow` (`src/renderer/src/pods/PodsChrome.module.css:81`), the fork-error `.dismissible` (`:49`) and `.reorderRow` (`src/renderer/src/pods/PodBarPanel.module.css:30`). Every data-altering action should produce an informational or success message, and every unrecoverable failure (a missing directory, a conversation that cannot be forked, and the like) must always produce an error message.
