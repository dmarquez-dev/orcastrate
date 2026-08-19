/**
 * PodRunner error type and the SDK-failure -> contract error-code mapping.
 *
 * NOTE ON THE CONTRACT: `src/shared/contracts/pod-runner.ts` declares
 * `PodRunnerError` with `export declare class`, which is an *ambient*
 * declaration — TypeScript emits no runtime value for it, so nothing can `new`
 * it or `instanceof` it at runtime from that module. The concrete class
 * therefore lives here, mirroring what T3 did for `EventStoreError` in
 * `src/main/store/errors.ts`. The contract file is frozen, so this is reported
 * as a finding rather than fixed there. `assertContractShape` below keeps this
 * class structurally assignable to the declared one, so the two cannot drift.
 */

import type {
  PodRunnerError as ContractPodRunnerError,
  PodRunnerErrorCode,
} from '../../shared/contracts/pod-runner';

export class PodRunnerError extends Error {
  readonly code: PodRunnerErrorCode;

  constructor(code: PodRunnerErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'PodRunnerError';
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Compile-time proof that this class still satisfies the frozen declaration. */
const assertContractShape: ContractPodRunnerError = new PodRunnerError('NOT_RUNNING', 'shape check');
void assertContractShape;

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
 * Classifies a failure raised *before* the session was confirmed up.
 *
 * `RESUME_FAILED` is only ever returned when a `resume` id was actually
 * supplied — a spawn failure on a fresh Pod must never be blamed on resume.
 * The CLI's rejection wording is not part of any contract, so the match is
 * deliberately broad and falls back to `SPAWN_FAILED`.
 */
export function classifyStartupFailure(err: unknown, resumeRequested: boolean): PodRunnerError {
  if (err instanceof PodRunnerError) return err;
  const message = errorMessage(err);
  if (resumeRequested && /resume|no conversation found|session .*not found|invalid session/i.test(message)) {
    return new PodRunnerError('RESUME_FAILED', `resume rejected by the CLI: ${message}`, {
      cause: err,
    });
  }
  return new PodRunnerError('SPAWN_FAILED', `could not start the claude CLI: ${message}`, {
    cause: err,
  });
}
