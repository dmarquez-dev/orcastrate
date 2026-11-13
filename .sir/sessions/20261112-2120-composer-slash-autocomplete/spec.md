# Composer slash-command autocomplete

When the Composer textarea starts with `/`, offer up to 5 matching slash commands read at runtime from the Pod's SDK session, and make the result of a submitted slash command visible the way Claude Code shows it.

## Context

- The Composer textarea (`src/renderer/src/composer/Composer.tsx`) has no suggestions today. Main reads nothing about commands: `src/main/pod/sdk-bridge.ts:26-41` exposes only `stream`, `interrupt`, `setPermissionMode` and `initialized`. Neither `git grep -n "commands_changed\|supportedCommands" c218dd4 -- src` nor the same grep on `local_command_output` prints anything.
- The SDK is `@anthropic-ai/claude-agent-sdk` 0.3.235. It provides `Query.supportedCommands()` (`sdk.d.ts:2506`) and the `system`/`commands_changed` replacement push (`:3132-3140`). `system`/`init` carries `terminal_slash_commands` (`:4770`).
- Dispatch already works: Orcastrate sends `/name args` as plain prompt text (`src/main/pod/input-queue.ts:20-21`), which is how the Agent SDK documentation says a command is run.
- The gap is the output. A local command such as `/context` or `/usage` answers with `system`/`local_command_output`. A command that bypasses the model loop, such as `/theme` or an empty `/compact`, answers only through its `result` text. Orcastrate stores both as `system` events (`lane-router.ts:426-428`, `:512-518`), and the default conversation filter hides those (`transcript-filter.ts:49-51`). So the user sees nothing come back.

## Definition of done

1. For each Pod session, main reads `supportedCommands()` once after start. Open, reconnect and the resume fallback don't wait for it. The read times out after 10 s, and a timeout or rejection logs one warn naming the Pod.
2. A `commands_changed` message replaces that Pod's list. An initial-read answer that arrives after a replacement is discarded.
3. Commands named in the latest `system`/`init`'s `terminal_slash_commands` are not offered.
4. Main pushes the visible list per Pod on `push:podCommands`. It always pushes the session's first defined list, even an empty one. After that it pushes only on change, and never after the session is disposed.
5. The preload exposes `on.podCommands`. There are 7 push channels, and the invoke channels stay at 22.
6. The renderer keeps each Pod's latest list. `useSlashCommands()` returns the active Pod's list and makes no IPC call.
7. A leading `/` with no whitespace after it opens a list of at most 5 commands whose name or any alias starts with the typed prefix. The match is case-sensitive, and the list keeps SDK order. Each row shows `/name` and the description and nothing else. The list has listbox and option semantics.
8. ArrowUp and ArrowDown move the selection and wrap. Tab, Enter and mousedown accept, inserting `/<canonical name> ` without sending. Escape closes the list without interrupting.
9. While the list is closed, Enter, Shift+Enter, Escape and Tab behave as at base. A disabled composer never shows the list.
10. The renderer hard-codes no command names.
11. Local command output (`system`/`local_command_output`) appears in the default conversation view as assistant text.
12. A turn that bypassed the model loop shows its `result` text once, and a normal reply is never duplicated.
13. Replaying the existing fixture corpus yields no new `assistant_text`.
14. End to end, a push leads to the dropdown, then accept, then send, which sends the accepted text.
15. `npm run typecheck`, the whole suite and `npm run build` pass.
16. No shipped file this session writes cites `.sir/` or this session's id.
17. Human check H1. State: a real Pod open and idle in a project (`npm run dev` in the repository root). Action: type `/`. Expected: at most 5 of the CLI's commands in a list sitting directly above the textarea, each showing `/name` and its description. The textarea and the send controls stay where they are at base.
18. Human check H2. State: an open Pod. Action: send `/context`. Expected: its output appears as a Claude row in the default (conversation) view.
19. Human check H3. State: an open Pod. Action: send `/theme`. Expected: the text "isn't available in this environment" is visible in the default view.
20. Human check H4. State: a newly opened Pod with no turns. Action: send `/compact`. Expected: the reason text, for example "Not enough messages to compact.", is visible in the default view.
21. Human check H5. State: a Pod with at least one completed turn, where the CLI's init lists `terminal_slash_commands` (the fixture CLI listed `doctor` and `color`). Action: type `/doc`. Expected: `doctor` is not offered.
22. At Gate 3 the orchestrator appends to `.sir/backlog.md` one follow-up row for each execution gap this session does not close (F1 to F6 below). Each row names its blocker.

## Scope

- T1, main: the command read, `commands_changed` and terminal-set tracking, the `push:podCommands` channel, and the preload member.
- T2, LaneRouter: G1 (local output becomes `assistant_text`) and G2 (bypassed-loop `result` text becomes `assistant_text`).
- T3, renderer state: per-Pod lists, `useSlashCommands`, and the stub-API seam.
- T4, Composer: the dropdown and its keys.
- T5: App wiring, an end-to-end test, and the repo-wide gates.

### Not in scope

Each of these is deferred work. The ones that are execution gaps are carried as follow-up rows by item 22.
- F1 (G3): rendering `system`/`informational` at levels other than `info`. Blocker: it needs an Orcastrate-owned visible marker and a design for each level. The LaneRouter purity rule (`src/main/lane/purity.test.ts:83`) allows no shared runtime import, and mapping it to `assistant_text` would attribute hook feedback to Claude.
- F2 (G4): marking a `/clear` or `/compact` boundary in the transcript. Blocker: the same marker problem, or a 13th `EventType`, which is a schema migration (`src/main/store/schema.ts`). Also undecided: whether the durable record shows a boundary at all.
- F3: capturing a real slash-command turn into `tests/fixtures/protocol`. Blocker: the G1 and G2 mappings rest on SDK types and docs, not on a capture. How the CLI echoes an expanded skill prompt is unmeasured.
- F4: a pull channel for command lists. A renderer reloaded while main keeps running shows no suggestions until the next change or reopen. Blocker: no ordering rule exists between pull and push.
- F5 (G5): reconciling a Pod's displayed `permissionMode` with `system`/`init.permissionMode`. Blocker: no command is known to change it, and deciding which side wins is a design decision.
- F6 (Gate 2 decision D1 chose to show the list unfiltered until the first `init`): terminal commands are visible before the Pod's first turn. Blocker: the SDK carries the terminal set only on `init`.
- Also deferred, and not execution gaps:
  - ghost text
  - showing `argumentHint`
  - fuzzy or case-insensitive matching
  - commands for Calf lanes
  - stamping `origin` on prompts
  - persisting command lists
  - changing the Composer placeholder

## Assumptions

| Question | Answer | Rung | Evidence |
|---|---|---|---|
| Does `/name args` sent as prompt text dispatch the command? | Yes. No dispatch work is needed. | external, repo | Agent SDK slash-commands doc (code.claude.com/docs/en/agent-sdk/slash-commands); `src/main/pod/input-queue.ts:20-21` |
| Is the missing `origin` stamp load-bearing for commands? | No. | judgment | Nothing in `sdk.d.ts` or the doc ties command dispatch to `origin` |
| Is a `/clear` that changes the session id followed? | Yes, because capture is last-write-wins. | repo | `src/shared/contracts/pod-runner.ts:187-205` |
| How does local command output render? (G1) | `system`/`local_command_output` with non-empty string `content` becomes one Matriarch `assistant_text`, replacing the `system` event. | external, repo | `sdk.d.ts:4257-4259` ("Displayed as assistant-style text"); `transcript-filter.ts:40-45` |
| Which `result` counts as a bypassed turn? (G2) | One with `subtype: 'success'`, `is_error: false`, no `terminal_reason`, a non-empty `result` string, and no Matriarch `assistant_text` since the previous `result`. It is emitted before the unchanged `system` event. | external, repo | `sdk.d.ts:7908-7911` ("Unset when the loop was bypassed"); all 6 fixture results carry `terminal_reason: "completed"` (C51's two greps print 6 and 6) |
| Render `system`/`informational`? (G3) | Out of scope; this is F1. | repo | `src/main/lane/purity.test.ts:69`, `:83` |
| Does Orcastrate show the model, so that `/model` misleads? (G5) | No. It shows `permissionMode`, which is F5. | repo | `src/renderer/src/pods/PodTab.tsx:143`; the model appears only in the Helm editor |
| What is the terminal set before the first `init`? | Empty, so nothing is hidden until the first turn begins. Decided at Gate 2 (D1); the follow-up is F6. | external | `sdk.d.ts:4743` (init arrives per turn); `SDKControlInitializeResponse` (`:3718`) has no terminal field |
| Where is the terminal filter applied? | In main. The renderer never keys on CLI vocabulary. | repo | `transcript-filter.ts:203-212` |
| Is `PodRunner.supportedCommands` required? | No, it is optional, so the inert e2e runners and FakeRunner are unchanged. While the catalog is unknown, nothing is pushed. | repo | `src/renderer/src/__tests__/pod-stop.e2e.test.tsx:141-154` |
| How does matching treat case? | Case-sensitive `startsWith` on name or alias. | judgment | The discussion says "starts with" |
| How do selection and accept behave? | The selection wraps at both ends, and row 0 is selected on open or when the rows change. Accept inserts `/<name> ` with a trailing space, which closes the list. | judgment | `contracts/renderer-slash-commands.ts` part B |
| How long may the initial read take? | 10 s timeout, after which one warn is logged. | judgment | backend discipline, Async |
| Can tasks build concurrently? | Scoped vitest and `typecheck:node` are parallel-safe. The repo-wide gates are serialized to T5. | repo | `package.json` scripts (`--noEmit`); `tsconfig.node.json:2-10` reaches no `src/renderer/**` file, and T3 and T4 own no `tests/**` file |
| Can injected defects overlap between peers? | No. None of T2, T3 or T4's injected files is imported by a peer's scoped suite. T4's `hygiene.test.ts` scans the renderer tree as text, including T3's files, but T3's injection changes behaviour and no hygiene token. | repo | The architect's import greps; the `hygiene.test.ts` rule list |

## Contracts

- [`contracts/slash-command-delivery.ts`](contracts/slash-command-delivery.ts) adds `SlashCommandInfo`, `PodCommandsPush`, `EVENT_CHANNELS.podCommands` and `OrcastrateApi.on.podCommands`, plus main's six push rules.
- [`contracts/renderer-slash-commands.ts`](contracts/renderer-slash-commands.ts) has three parts: A, `useSlashCommands()`; B, `ComposerProps.commands` with the open, match, key and accept rules; C, the stub API's `podCommands` seam.

## Open questions

None. Gate 2 settled D1, D2 and D3.
