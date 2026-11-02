# Rejected-resume hardening

Make `RESUME_FAILED` as narrow as its caller already claims it is, stop a rejected `ccSessionId` from surviving the fallback, and trim three backlog lines an earlier session closed.

## Context

When a Pod opens with a stored `ccSessionId`, `#start` asks the CLI to resume it. If the start fails and `classifyStartupFailure` (`src/main/pod/errors.ts:60-71`) labels the failure `RESUME_FAILED`, `pod-manager.ts:678-680` silently starts a fresh session instead of beaching the Pod. Two defects (`.sir/backlog.md:23-24`, DIR audit 2026-10-09):

- The regex `/resume|no conversation found|session .*not found|invalid session/i` accepts any message containing the bare word `resume`, so a spawn failure whose stderr says "failed to resume: spawn ENOENT" becomes a silent fresh session. The function's docblock calls this "deliberately broad"; the caller's docblock (`pod-manager.ts:668-676`) says the label requires wording that names the session.
- `#startFreshAfterRejectedResume` (`pod-manager.ts:713-732`) retries without clearing the stored id. Until the fresh run's first `onSessionId`, a reopen or Reconnect re-sends the id the CLI just refused and writes a second fallback notice; a retry that itself fails leaves the rejected id on a beached Pod.

The SDK delivers the CLI's stderr inside the error message (`getProcessExitError` + `formatStderrTail` → `Claude Code process exited with code N. stderr: <tail>`), so the CLI's own wording is what the regex sees.

## Definition of done

- [ ] With a resume requested, a startup failure whose message mentions `resume` but names no session classifies `SPAWN_FAILED`, and its test goes red if the bare `resume` alternative is restored.
- [ ] With a resume requested, each of the four CLI 2.1.235 rejection strings (Assumptions row 1) still classifies `RESUME_FAILED`.
- [ ] With a resume requested, `session started; working directory not found` classifies `SPAWN_FAILED`.
- [ ] The `classifyStartupFailure` docblock and the `pod-manager.ts:668-676` docblock agree with each other and with the narrowed regex.
- [ ] After a rejected-resume fallback and before the fresh run's first `onSessionId`, the stored `ccSessionId` is null; a reopen or Reconnect in that window sends no `resume`, and the fallback notice count stays 1.
- [ ] The id is cleared before the retry starts; after a retry that itself fails, the Pod is beached with a null `ccSessionId`.
- [ ] Each fix's regression test is shown red against the unfixed code.
- [ ] The four comments that say a null `ccSessionId` means "never reached first turn" (`events.ts:199`, `ipc.ts:188-189`, `remover.ts:55-56`, `DeletePodDialog.tsx:98-99`) also name the rejected-resume case, with comment-only diffs.
- [ ] `.sir/backlog.md` lines 27, 41 and 46 (as of `fa113f2`) are removed, each with cited evidence of closure at `77f8fd4`; lines 23–24 are removed, citing T1's and T2's commits; line 47 is unchanged.
- [ ] `npm test` and `npm run typecheck` exit 0 in the worktree with all tasks committed.

## Scope

T1 narrows the classifier (`src/main/pod/errors.ts` + its tests). T2 clears the id before the retry (`src/main/pod-manager/pod-manager.ts`, `resume.test.ts`, `helpers.ts`) and rewords the four null-id comments (Gate 2 decision). T1 and T2 run in parallel. T3 trims five backlog lines (23, 24, 27, 41, 46; lines 23–24 by Gate 2 decision) and runs the repo-wide gate after both.

### Not in scope

- Any other backlog item.
- Any non-comment change to `events.ts`, `ipc.ts`, `remover.ts` or `DeletePodDialog.tsx`.
- Changing `classifyStartupFailure`'s signature or the caller's guard at `pod-manager.ts:678`.

## Assumptions

| Question | Answer | Rung | Evidence |
|---|---|---|---|
| What wording does the CLI use when it rejects a resume? | `No conversation found with session ID: <id>`, `Session not found in any project directory`, `Error: Invalid session ID. Must be a valid UUID.`, `Invalid session_id: contains unsafe characters` | 1 | Strings in the bundled CLI binary `node_modules/@anthropic-ai/claude-agent-sdk-win32-x64/claude.exe` (SDK 0.3.235); nothing under `tests/fixtures/protocol/` or `probe/evidence/` records a rejection |
| Does the CLI's stderr reach the classifier? | Yes, as `. stderr: <tail>` appended to the exit message | 1 | `sdk.mjs` `getProcessExitError` and `formatStderrTail` |
| Which regex alternatives survive? | Drop bare `resume`; keep the session-naming alternatives; bound `session .*not found` so unrelated clauses cannot match | 1 | The four strings above; caller's contract at `pod-manager.ts:668-676`; existing tests `errors.test.ts:87-105` use `No conversation found to resume` and still pass |
| Clear the id before or after the retry? | Before | 4 | A failed retry beaches the Pod and must not keep the id; clearing after would need a second write on the failure path. The id survives in the notice's `abandonedCcSessionId` |
| Is a null id after a rejected resume safe for Reconnect and deletion? | Yes: Reconnect starts fresh; deletion reports `'no-session'`, correct for a session the CLI says does not exist | 1 | `pod-manager.ts:598`; `ipc.ts:188`; `remover.ts:57-59` |
| Can the verification commands run in a worktree with no `node_modules`? | Yes: module resolution walks up to the main checkout's `node_modules` | 1 | Probes in `state.json` `verification`: typecheck exit 0, with `tsc --listFilesOnly` reading the worktree's sources; `npm test` 2261 passed |

## Contracts

None. T1 and T2 share only the existing `RESUME_FAILED` code in `src/shared/contracts/pod-runner.ts`, which neither changes.

## Open questions

None. Both questions raised at Gate 2 were answered there: the four null-id comments are fixed in T2, and T3 also removes backlog lines 23–24.
