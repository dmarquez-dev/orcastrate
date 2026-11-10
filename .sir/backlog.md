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
2026-11-09 20261109-1642-fork-ui-human-checks Human check not made at Gate 3: run `npm run dev` in the repository root, or open `.dir-sdlc/handruns/2026-09-30-electron-handrun/screenshots/fork-ui-recheck/O1-fork.png`, and check that the ⑂ on a Pod tab reads as a fork mark; driver O1 proves only that it is not the missing-glyph box and not blank.
2026-11-10 20261109-2239-fork-ui-followups Human check not made at Gate 3: run `npm run dev` in the repository root, make a fork fail, and hover the clamped fork-error text; check that the native tooltip shows main's whole message (`title={forkError}`, `src/renderer/src/pods/PodsChrome.tsx:300`); no driver observation measures it.
2026-11-10 20261109-2239-fork-ui-followups Human check not made at Gate 3: open `.dir-sdlc/handruns/2026-09-30-electron-handrun/screenshots/fork-ui-followups/03-s4-fork-error.png` and check that the two-line clamped fork error ending in "…" is acceptable as the only visible text.
2026-11-10 20261110-1618-chrome-alert-squeeze Decide how much width the open-error and pods-error alerts get: `.alertRow` is `flex: 1 1 0` (`src/renderer/src/pods/PodsChrome.module.css:71`), so with 6 Pod tabs the open-error alert is 76.838 px wide and its two-line clamp shows about two words ("cwd is not / accessible:…"), and the pods-error alert is 143.675 px wide; the full message is only the `title` (re-measure with `python -I` over `.dir-sdlc/handruns/2026-09-30-electron-handrun/driven-report-chrome-alert-squeeze.json`, reading `measured.alertWidth` of O19 and O22).
2026-11-10 20261110-1618-chrome-alert-squeeze Measure the open-error and pods-error alerts when the Pod tabs alone overflow `.chrome`: each `.alertRow` wrapper (`src/renderer/src/pods/PodsChrome.module.css:71`) has a zero basis and keeps its min-content width, as `.dismissible` does, and no driver observation covers the case (O19 and O22 run with 6 and 5 tabs and leftover space; only O21 overflows, for the fork error).
2026-11-10 20261110-1618-chrome-alert-squeeze Measure `PodBarPanel`'s reorder alert: `.reorderError` (`src/renderer/src/pods/PodBarPanel.module.css:13-18`) sets no `flex`, so it keeps the default `0 1 auto` basis of its whole message inside the panel, the mechanism that squeezed the tab titles under the fork error; unmeasured.
2026-11-10 20261110-1618-chrome-alert-squeeze Human check not made at Gate 3: run `npm run dev` in the repository root, trigger a long open error and a long pods error, and check that each message is clamped to two lines inside the Pod-bar row and that hovering shows the whole message as a tooltip.
2026-11-10 20261110-1618-chrome-alert-squeeze Human check not made at Gate 3: run `npm run dev` in the repository root with 6 Pod tabs and an open-error alert, or open `.dir-sdlc/handruns/2026-09-30-electron-handrun/screenshots/chrome-alert-squeeze/05-s5-open-error.png`, and judge whether the ~77 px two-line clamp ("cwd is not / accessible:…") tells the user enough when the full message is only on hover.
2026-11-10 20261110-1821-slash-command-autocomplete Add slash-command autocomplete to the Composer textarea (`src/renderer/src/composer/Composer.tsx:130`, placeholder `:147`): on a leading `/`, show the first 5 commands whose name or alias starts with the typed prefix. Read the list at runtime from the Pod's SDK `Query`: `supportedCommands()` (`node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts:2506`, SDK 0.3.235) for the first list, then let each `system`/`commands_changed` push (`sdk.d.ts:3132-3137`) replace it when plugins or skills change mid-session. Neither is connected today: `src/main/pod/sdk-bridge.ts:72-79` exposes only `interrupt`, `setPermissionMode` and `initializationResult`, and nothing in `src/main` handles `commands_changed`. Open: inline ghost text or a 5-row dropdown; whether to hide `terminal_slash_commands` (`sdk.d.ts:4770`); and which commands actually run when sent as a prompt through the SDK.
