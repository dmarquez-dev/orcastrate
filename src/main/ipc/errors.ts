/**
 * Failure -> `IpcError` mapping.
 *
 * Acceptance criterion 3 is absolute: an invoke handler must NEVER reject. An
 * Electron IPC rejection is serialized as a bare string across the bridge and
 * loses its type, so the renderer could not branch on it. Every failure is
 * therefore turned into data here, and every path through `toIpcError` yields
 * one of the nine `IpcErrorCode`s the frozen contract documents.
 *
 * The two concrete error classes are imported from the IMPLEMENTATION modules,
 * never from the contracts. `src/shared/contracts/{event-store,pod-runner}.ts`
 * declare `EventStoreError` / `PodRunnerError` with `export declare class`,
 * which is ambient: TypeScript emits no runtime value, so `instanceof` against
 * a contract import is always false at runtime.
 */

import type { IpcError, IpcErrorCode, IpcResult } from '../../shared/contracts/ipc';
import { PodRunnerError } from '../pod';
import { EventStoreError } from '../store';

/** Every code `toIpcError` may produce. Enumerated so a test can assert on it. */
export const IPC_ERROR_CODES: readonly IpcErrorCode[] = [
  'NOT_FOUND',
  'CONFLICT',
  'INVALID_ARGUMENT',
  'CWD_MISSING',
  'SPAWN_FAILED',
  'NOT_RUNNING',
  'IO',
  'UNSUPPORTED',
  'INTERNAL',
];

/**
 * A failure raised deliberately by main with the code it should cross the
 * bridge as. Everything else is classified by `toIpcError`.
 */
export class IpcFailure extends Error {
  readonly code: IpcErrorCode;

  constructor(code: IpcErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'IpcFailure';
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export function invalidArgument(message: string): IpcFailure {
  return new IpcFailure('INVALID_ARGUMENT', message);
}

export function notFound(message: string): IpcFailure {
  return new IpcFailure('NOT_FOUND', message);
}

export function cwdMissing(message: string): IpcFailure {
  return new IpcFailure('CWD_MISSING', message);
}

/**
 * `SCHEMA_MISMATCH` means the database on disk was written by a NEWER build
 * than this one. That is not an I/O fault and not the caller's fault — this
 * build simply cannot read it, which is what `UNSUPPORTED` names.
 */
const STORE_CODES: Record<EventStoreError['code'], IpcErrorCode> = {
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  IO: 'IO',
  SCHEMA_MISMATCH: 'UNSUPPORTED',
};

/**
 * `ALREADY_STARTED` is a CONFLICT rather than an INTERNAL: it means the Pod is
 * already open, which is a state clash the renderer can act on.
 * `RESUME_FAILED` collapses onto SPAWN_FAILED because the contract's code list
 * has no resume-specific member and the user-visible outcome is identical: the
 * session did not come up.
 */
const RUNNER_CODES: Record<PodRunnerError['code'], IpcErrorCode> = {
  CWD_MISSING: 'CWD_MISSING',
  SPAWN_FAILED: 'SPAWN_FAILED',
  NOT_RUNNING: 'NOT_RUNNING',
  ALREADY_STARTED: 'CONFLICT',
  RESUME_FAILED: 'SPAWN_FAILED',
};

function isDevelopment(): boolean {
  return process.env['NODE_ENV'] !== 'production';
}

function messageOf(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return 'an unexpected internal error occurred';
}

/**
 * Classifies ANY thrown value.
 *
 * `RangeError` is called out explicitly, not swept into INTERNAL: PodRunner's
 * `assertAllowedPermissionMode` throws a bare `RangeError` (no `.code`) for a
 * permission mode outside the contract's union, from both the constructor and
 * `setPermissionMode`. That is a bad argument, and the renderer should see it
 * as one. Nothing here reads `.code` off an error without first proving the
 * error's class.
 */
export function toIpcError(err: unknown): IpcError {
  const error: IpcError = { code: 'INTERNAL', message: messageOf(err) };

  if (err instanceof IpcFailure) {
    error.code = err.code;
  } else if (err instanceof EventStoreError) {
    error.code = STORE_CODES[err.code] ?? 'IO';
  } else if (err instanceof PodRunnerError) {
    error.code = RUNNER_CODES[err.code] ?? 'INTERNAL';
  } else if (err instanceof RangeError) {
    // A genuine internal `TypeError` is deliberately NOT swept in here — it
    // would misreport a main-process bug as the renderer's bad argument.
    error.code = 'INVALID_ARGUMENT';
  } else if (err instanceof Error && err.name === 'InvalidPermissionAnswerError') {
    // Thrown by `src/main/pod/permissions.ts` for a malformed answer.
    error.code = 'INVALID_ARGUMENT';
  }

  if (isDevelopment()) {
    const detail = err instanceof Error ? (err.stack ?? err.message) : String(err);
    error.detail = detail;
  }
  return error;
}

export function ok<T>(value: T): IpcResult<T> {
  return { ok: true, value };
}

export function fail<T>(err: unknown): IpcResult<T> {
  return { ok: false, error: toIpcError(err) };
}
