/**
 * The deliberate-failure leaf.
 *
 * `IpcFailure`, its three constructors and `IPC_ERROR_CODES` depend on NOTHING
 * but types from `src/shared/contracts/ipc.ts`, so they live here rather than
 * in `./errors.ts`. That module imports `PodRunnerError` from `../pod` and
 * `EventStoreError` from `../store` as VALUES — `toIpcError` needs the
 * constructors for its `instanceof` checks — so every importer of `./errors.ts`
 * pulls both subsystems into its graph whether or not it wants them. Modules
 * that raise a failure but never classify one (`./validate.ts`,
 * `../pod-manager/pod-manager.ts`, `../beachcomber/service.ts`,
 * `../helm/helm-service.ts`) import from HERE, and reach neither subsystem.
 *
 * THIS FILE IMPORTS NO VALUE FROM ANYWHERE, and nothing from `../pod`,
 * `../store`, `electron` or `node:*`. `tests/unit/ipc/failure-leaf.test.ts`
 * scans the source and fails if that ever stops being true.
 *
 * ONE CONSTRUCTOR, STILL. `./errors.ts` RE-EXPORTS all five names from here
 * rather than declaring anything parallel, so there is exactly one `IpcFailure`
 * class in the process and every existing `instanceof IpcFailure` — in
 * `toIpcError`, in handlers, in tests — keeps classifying.
 */

import type { IpcErrorCode } from '../../shared/contracts/ipc';

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
