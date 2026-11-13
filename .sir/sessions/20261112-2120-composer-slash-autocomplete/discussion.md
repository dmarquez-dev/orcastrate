# Composer slash-command autocomplete

When the Composer textarea starts with `/`, offer up to 5 matching slash commands read at runtime from the Pod's SDK session. Also make sure a submitted slash command behaves the way it would in Claude Code. Any execution gap too severe to close in this session becomes a backlog follow-up.

## Context

- This picks up the `.sir/backlog.md` row appended by 20261110-1821-slash-command-autocomplete, a Small feasibility-only session that changed no source (`.sir/backlog.md:34`).
- The row's citations were re-checked against `main` at `c218dd4` during this phase:
  - The textarea is at `src/renderer/src/composer/Composer.tsx:130`, with its placeholder at `:147`.
  - `src/main/pod/sdk-bridge.ts:72-80` exposes only `interrupt`, `setPermissionMode` and `initialized` (which wraps `q.initializationResult()`).
  - `grep -rn "commands_changed\|supportedCommands" src` prints nothing.
  - The installed SDK is `@anthropic-ai/claude-agent-sdk` 0.3.235 (`node_modules/@anthropic-ai/claude-agent-sdk/package.json:3`).
- Per the backlog row, the SDK surface is:
  - `Query.supportedCommands()` (`sdk.d.ts:2506`) returns the initial list.
  - A `system`/`commands_changed` push (`sdk.d.ts:3132-3137`) carries a replacement list when plugins or skills change mid-session.
  - `terminal_slash_commands` is at `sdk.d.ts:4770`.
  - The spec phase re-measures each of these anchors before citing it.
- Why this item: of the 15 open backlog rows, 8 are human checks only the user can make, 4 are deliberately kept-deferred design decisions (`.sir/backlog.md:30-33`), and 1 (`:35`, N6 announce timing) waits on a human check. That leaves this row and the hand-run harness row (`:27`), and this one is the concrete one.

## Decisions

- Track: Standard (Gate 1, approved 2026-11-12T21:25Z).
- Trigger: a `/` at the start of the textarea opens the suggestions. A command matches when its name or any alias starts with the typed prefix. Show at most 5, in the order the SDK lists them.
- Display: a dropdown of up to 5 rows anchored above the textarea, each showing the command and its description. No inline ghost text.
- Keys: ArrowUp and ArrowDown move the selection, Tab or Enter accepts it, and Escape closes the dropdown. While the dropdown is closed, Enter keeps its current meaning (send).
- Source of the list: `supportedCommands()` once the Pod's query is up, then each `commands_changed` push replaces the list for that Pod. The list is per Pod, and the renderer never hard-codes commands.
- `terminal_slash_commands` are hidden from the suggestions, because they belong to an interactive terminal and Orcastrate has none.
- Plumbing that has to be built: a bridge member reading `supportedCommands()`, main-process handling of `commands_changed`, and a path that delivers each Pod's list to the renderer. Today none of these exists.
- Execution alignment (added by the user at Gate 1): Orcastrate should behave as the user expects when a slash command is submitted.
  - The spec phase determines, from the SDK types and the docs (`sir-inference` ladder), which commands run when sent as a prompt through the SDK and which do not.
  - For any that do not run, it finds the right way to adjust Orcastrate so they do.
  - Gaps that can be closed within this session's scope are in scope.
  - A gap whose fix is severe enough (a new subsystem, an unavailable SDK surface, or behaviour that only an interactive terminal provides) goes to `.sir/backlog.md` as a follow-up row naming the blocker. It is not left silent.
- Until the alignment work settles execution, the suggestions show what the SDK reports and make no claim that a command will run.
