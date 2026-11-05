# forkSession Pod branching

Let a user fork a Pod at its current state: one conversation continues as two divergent Pod
tabs, each with its own transcript, with the branch's ancestry recorded in the `pods` table.

## Context

- Backlog line (Ungrouped, 2026-11-05, `20261105-0107-design-decisions-sweep`): "Run
  `forkSession` branching as its own session: SDK 0.3.235 declares `forkSession()`
  (`node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts:723`) and the `forkSession?: boolean`
  option (`:1547`), and `grep -rnw forkSession src | wc -l` prints 0." This session closes it.
- The design doc's deferred item 8, `docs/superpowers/specs/2026-08-18-orcastrate-design.md:458-466`:
  resuming with `forkSession` continues a session into a new one; "what is missing is the UI and
  the `pods`-table bookkeeping for a branch's ancestry — and a check that the option behaves as
  described … Verifying it is the first step of this item, not an assumption it may rest on."
- The SDK offers two mechanisms: the `forkSession: true` query option used with `resume`
  (`sdk.d.ts:1543-1547`), and a standalone `forkSession(sessionId, { dir?, upToMessageId?, title? })`
  returning `{ sessionId }` (`sdk.d.ts:~710-723`; its docblock says forked sessions start without
  undo history).
- Resume today: `src/main/pod/options.ts:238-241` passes `resume` only when present;
  `classifyStartupFailure` (`src/main/pod/errors.ts`, called from `pod-runner.ts:200,210,285`)
  classifies a rejected resume as `RESUME_FAILED`.
- Prior Helm work confirmed behaviour against CLI 2.1.318; the design doc's probe was against
  CLI 2.1.235. The verification step should name the CLI version it ran against.

## Decisions

- Track: Standard (new IPC/persistence/UI surface across main and renderer).
- Chosen at Gate 1 over the Helm warning-plumbing item and the live-`claude` hand-run harness,
  which both stay on the backlog.
- Verifying that `forkSession` behaves as documented against the installed CLI is the first
  step and a precondition, not an assumption: the spec must make the rest of the work depend on
  that verification's result, and say what happens if it refutes the documentation.
- Scope is the three pieces design item 8 names: the verification, the `pods`-table ancestry
  bookkeeping, and the UI to fork a Pod into a new tab. Which of the two SDK mechanisms to use,
  the ancestry schema shape, and the UI entry point are left to the spec phase to resolve from
  repository evidence via `sir-inference`.
- Not in scope: the four kept-deferred backlog items (Calf steering, config manager,
  terminal-session adoption, macOS/Linux validation).
