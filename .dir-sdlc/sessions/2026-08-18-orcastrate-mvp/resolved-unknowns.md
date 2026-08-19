# Resolved unknowns — 2026-08-18-orcastrate-mvp

Ladder per `dir-inference`. Rungs 1–2 empty: the repository contained only the
design spec at session start, with no `CLAUDE.md`, README, `package.json`, or
prior `.dir-sdlc/` sessions.

## Assumptions table

| Question | Answer | Rung | Evidence |
| --- | --- | --- | --- |
| SDK package name | `@anthropic-ai/claude-agent-sdk` | 3 | https://code.claude.com/docs/en/agent-sdk/typescript |
| Does streaming input mode exist as the spec assumes? | Yes — `prompt` accepts `AsyncIterable<SDKUserMessage>`; exposes `interrupt()`, `setPermissionMode()`, `setModel()`, `streamInput()` on the returned `Query` | 3 | ibid., "Streaming Input Mode" |
| `canUseTool` signature | `(request: CanUseToolRequest, options: { signal: AbortSignal }) => Promise<CanUseToolResult>` | 3 | ibid., "Permission Callback" |
| Is `parent_tool_use_id` on SDK messages? | Yes, documented on `SDKUserMessage` and `SDKAssistantMessage`, "set for subagent messages" | 3 | ibid., "`parent_tool_use_id` Field" |
| Build tooling | electron-vite | 4 | No repo or doc evidence; chosen for Vite alignment with the React renderer and first-class Electron main/preload/renderer separation |
| Test runner | Vitest | 4 | No repo or doc evidence; chosen for Vite alignment so one transform pipeline serves both build and test |

## Spec corrections required (fold into `spec.md`, present at Gate 2)

These are rung-3 facts that contradict the approved design spec. None is a
decision for the user to make — each is the documented API disagreeing with an
assumption the spec made — but all four are user-visible or behavior-changing,
so they are surfaced at Gate 2 rather than applied silently.

1. **`forwardSubagentText` is required.** Subagent text blocks are forwarded as
   messages only when `options.forwardSubagentText: true`. Without it, Calf lanes
   receive nothing. The spec's section 4.3 does not mention it. This is the single
   most load-bearing correction: the lane feature does not function without it.

2. **`permissionMode` has no `acceptEdits` in the SDK.** The documented enum is
   `'default' | 'plan' | 'bypassPermissions'`. Spec section 4.2 and the New Pod
   dialog in section 5.1 both offer `acceptEdits`, which does not exist on this
   surface. The Pod option set must drop it.

3. **The resume option is `resume`, not `resumeSessionId`**, and it is joined by
   `resumeSessionAt` (resume at a message UUID), `resumeDropsTurn`, `forkSession`,
   and `continue`. Sections 4.2 and 4.4 name the wrong option. `forkSession` is
   also a latent feature — branching a Pod — worth a backlog note, not MVP.

4. **`env` replaces the subprocess environment rather than merging.** Spec
   section 4.2 describes it as "an environment overlay merged over the inherited
   environment". `PodRunner` must spread `process.env` explicitly. Left as
   written, every Pod would launch with only the override keys set — which would
   strip `PATH` and break the CLI launch entirely.

## Design implications beyond corrections

- **`canUseTool` is not invoked for every tool call.** It is skipped for calls
  auto-approved by `allowedTools`, calls matching allow rules, calls in
  `bypassPermissions` mode, and actions no mode auto-approves. The permission UI
  in section 5.4 must not assume it sees all tool activity; tool use is observed
  from the message stream, and `canUseTool` is only the prompt path.

- **Lane routing may need a tree, not a flat map.** Nested subagents (depth > 1)
  carry `parent_agent_id` alongside `parent_tool_use_id`, requiring Claude Code
  v2.1.202+ (installed: 2.1.235). Section 4.3 specifies a flat
  `parent_tool_use_id` lookup, which cannot represent an agent that spawns
  agents. The probe should capture a depth-2 dispatch so the router is built
  against real nesting rather than retrofitted.

- **`Query.interrupt()`** backs the section 5.4 interrupt requirement directly;
  no separate mechanism is needed.
