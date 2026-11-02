/**
 * The SDK-failure -> contract error-code mapping.
 *
 * `PodRunnerError` itself is defined in `src/shared/contracts/pod-runner.ts`
 * and only re-exported here. Amendment E1 turned that declaration from an
 * ambient `export declare class` (no emitted runtime value, so `instanceof`
 * against the contract import threw) into a real class, in the same move that
 * fixed `EventStoreError`. The parallel class this file used to declare and its
 * compile-time assignability pin are gone: one definition, nothing to drift.
 */

import { PodRunnerError } from '../../shared/contracts/pod-runner';

export { PodRunnerError };

/**
 * Pulls the child-process exit code out of whatever the SDK throws.
 *
 * The SDK builds the failure in `getProcessExitError(code, signal)`
 * (`sdk.mjs`): a non-zero, non-null exit code produces
 * `Error("Claude Code process exited with code N")` carrying a numeric
 * `exitCode` own-property; a signal kill produces
 * `Error("Claude Code process terminated by signal SIGX")` with **no**
 * `exitCode`. Contract `onBeached(exitCode: number | null, ...)` wants `null`
 * for the signal case, which is exactly what falls out here.
 *
 * The message is parsed as a fallback because the own-property is not part of
 * any published type and could be dropped by a future SDK release; the message
 * text has been stable and is what the probe observed.
 */
export function exitCodeFromError(err: unknown): number | null {
  if (typeof err === 'object' && err !== null) {
    const direct: unknown = (err as { exitCode?: unknown }).exitCode;
    if (typeof direct === 'number' && Number.isInteger(direct)) return direct;
  }
  const message = errorMessage(err);
  const match = /exited with code (-?\d+)/.exec(message);
  if (match?.[1] !== undefined) return Number.parseInt(match[1], 10);
  return null;
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  try {
    return JSON.stringify(err) ?? String(err);
  } catch {
    return String(err);
  }
}

/**
 * The CLI wordings that name the session being resumed. Each alternative is
 * one wording, kept narrow on purpose:
 *  - `no conversation found` — "No conversation found with session ID: <id>"
 *    (CLI 2.1.235) and "No conversation found to resume";
 *  - `session not found` — "Session not found in any project directory";
 *  - `invalid session id` — "Invalid session ID. Must be a valid UUID.";
 *  - `invalid session_id` — "Invalid session_id: contains unsafe characters".
 * The bare word `resume` is NOT an alternative, and `session` and `not found`
 * must be adjacent: either loosening lets a spawn failure whose stderr merely
 * mentions them ("failed to resume: spawn ENOENT") read as a rejected resume.
 */
const RESUME_REJECTION =
  /no conversation found|\bsession not found\b|\binvalid session id\b|\binvalid session_id\b/i;

/**
 * Classifies a failure raised *before* the session was confirmed up.
 *
 * `RESUME_FAILED` requires BOTH halves: a `resume` id was actually supplied,
 * so a spawn failure on a fresh Pod is never blamed on resume; AND the CLI's
 * wording names the session (`RESUME_REJECTION`). The pod manager reads
 * `RESUME_FAILED` as "start a fresh session instead", so a false positive would
 * turn an unspawnable binary into a silent fresh session. The CLI's wording is
 * not part of any contract, so anything it does not match is `SPAWN_FAILED`.
 */
export function classifyStartupFailure(err: unknown, resumeRequested: boolean): PodRunnerError {
  if (err instanceof PodRunnerError) return err;
  const message = errorMessage(err);
  if (resumeRequested && RESUME_REJECTION.test(message)) {
    return new PodRunnerError('RESUME_FAILED', `resume rejected by the CLI: ${message}`, {
      cause: err,
    });
  }
  return new PodRunnerError('SPAWN_FAILED', `could not start the claude CLI: ${message}`, {
    cause: err,
  });
}
