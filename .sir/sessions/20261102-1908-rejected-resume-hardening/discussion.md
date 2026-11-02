# Rejected-resume hardening

Harden the path that falls back to a fresh session when the Claude Code CLI rejects a resume:
make the `RESUME_FAILED` classification as narrow as its callers already claim it is, and stop
an abandoned `ccSessionId` from surviving the fallback. Also trim three `.sir/backlog.md` lines
that an earlier session already closed.

## Context

Both items come from `.sir/backlog.md` under "Correctness" (seeded from the DIR audit of
2026-10-09). Their citations were re-read against `fa113f2` during this discussion:

- **Classifier too broad.** `classifyStartupFailure` in `src/main/pod/errors.ts` (regex at
  `:63`) returns `RESUME_FAILED` for any startup failure, provided a resume was requested,
  whose message matches
  `/resume|no conversation found|session .*not found|invalid session/i`. Because the bare
  alternative `resume` is in that regex, any message containing that word counts. The
  function's own docblock (`:53-59`) calls the match "deliberately broad". Its caller's
  docblock, `src/main/pod-manager/pod-manager.ts:668-676`, says the opposite: that
  `RESUME_FAILED` is produced only when "the CLI's wording names the session", and that
  widening the test "would turn a missing directory or an unspawnable binary into a silent
  fresh session". The label decides between a silent fresh session (`:678-680`) and a
  surfaced, beached error (`:688`).
- **Abandoned id survives the fallback.** `#startFreshAfterRejectedResume`
  (`pod-manager.ts:713-732`) calls `#start(pod, false)` without clearing the stored
  `ccSessionId`. The stored id changes only when the fresh run's first authoritative
  `session_id` reaches `onSessionId` (`:1181-1183`). If the Pod is reopened inside that window,
  `#start(pod, true)` reads the rejected id again (`:598`), retries the resume the CLI already
  refused, and appends a second fallback notice.
- **Backlog lines already closed.** Session `20261029-1730-census-root-hygiene` (merge
  `77f8fd4`) closed three `.sir/backlog.md` items, but Gate 3 only appends, so they are still
  listed: line 27 (`process.cwd()` census roots), line 41 (retired-test-id self-check proving
  purpose), and line 46 (`BORDER_PROPERTIES` docblock narrow-or-widen). Line 47
  (`retiredLiteralUseReport` substring count) came from that same session and is **still open**.
  Do not trim it.

## Decisions

- Track: **Standard**. Session name: `rejected-resume-hardening`. Approved at Gate 1.
- Scope is the two Correctness items plus the backlog trim, and nothing else from the backlog.
- Narrow the classifier so `RESUME_FAILED` requires wording that names the session, which is
  the contract `pod-manager.ts:668-676` already states. Do not widen the caller to match the
  regex. The spec phase decides which alternatives survive. It settles this from the repo's own
  evidence first, meaning recorded CLI output under `tests/fixtures/protocol/` and
  `probe/evidence/` and the existing tests of `classifyStartupFailure`, and escalates only if
  that evidence cannot settle it.
- The two docblocks (`errors.ts:53-59` and `pod-manager.ts:668-676`) must agree with each other
  and with the narrowed regex once the change lands.
- Clear the abandoned `ccSessionId` as part of the fallback, so that a reopen between the
  fallback and the fresh run's first `session_id` cannot retry the rejected resume. The spec
  phase decides whether to clear it before or after the retry. It should consider that a
  retry which itself fails beaches the Pod, and a beached Pod should not keep a rejected id
  either.
- Each fix gets a regression test that goes red when the fix is reverted: a message containing
  `resume` but not naming a session must classify as `SPAWN_FAILED`, and a reopen inside the
  window must not send the rejected id.
- Trim backlog lines 27, 41 and 46 by hand, verifying each against `77f8fd4` before removing
  it. Leave line 47.
- Gate on the full suite plus a repo-wide `tsc`, because a scoped vitest run does not
  typecheck (see the project's lessons and memory).
