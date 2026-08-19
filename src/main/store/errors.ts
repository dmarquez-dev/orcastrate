/**
 * EventStore error type and the SQLite -> contract error-code mapping.
 *
 * NOTE ON THE CONTRACT: `src/shared/contracts/event-store.ts` declares
 * `EventStoreError` with `export declare class`, which is an *ambient*
 * declaration — TypeScript emits no runtime value for it, so nothing can
 * `new` it or `instanceof` it at runtime from that module. The concrete class
 * therefore lives here. The contract file is frozen, so this is reported as a
 * finding rather than fixed there. `assertContractShape` below keeps this class
 * structurally assignable to the declared one, so the two cannot drift.
 */

import type {
  EventStoreError as ContractEventStoreError,
  EventStoreErrorCode,
} from '../../shared/contracts/event-store';

export class EventStoreError extends Error {
  readonly code: EventStoreErrorCode;

  constructor(code: EventStoreErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'EventStoreError';
    this.code = code;
    // Keeps `instanceof` correct when this file is transpiled down to ES5-style
    // constructor functions by a consumer's bundler.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Compile-time proof that this class still satisfies the frozen declaration. */
const assertContractShape: ContractEventStoreError = new EventStoreError('IO', 'shape check');
void assertContractShape;

/** Shape of a `better-sqlite3` SqliteError, without depending on the stale types. */
interface SqliteLikeError {
  readonly code: string;
  readonly message: string;
}

function isSqliteLikeError(err: unknown): err is SqliteLikeError {
  if (!(err instanceof Error)) return false;
  const code: unknown = (err as Error & { code?: unknown }).code;
  return typeof code === 'string' && code.startsWith('SQLITE_');
}

/**
 * Maps anything thrown by better-sqlite3 onto a contract error code.
 *
 * - `SQLITE_CONSTRAINT_*` (unique, primary key, check, not null, foreign key)
 *   is a caller-supplied value the schema refused -> CONFLICT.
 * - Everything else (disk, corruption, locked, closed connection, native
 *   binding failures) -> IO.
 *
 * An `EventStoreError` passes through untouched so that a pre-check which
 * already decided on NOT_FOUND is not downgraded.
 */
export function toEventStoreError(err: unknown, context: string): EventStoreError {
  if (err instanceof EventStoreError) return err;

  if (isSqliteLikeError(err)) {
    const code: EventStoreErrorCode = err.code.startsWith('SQLITE_CONSTRAINT') ? 'CONFLICT' : 'IO';
    return new EventStoreError(code, `${context}: ${err.message} (${err.code})`, { cause: err });
  }

  const message = err instanceof Error ? err.message : String(err);
  return new EventStoreError('IO', `${context}: ${message}`, { cause: err });
}

/** Runs `fn`, converting any throw into an `EventStoreError`. */
export function guard<T>(context: string, fn: () => T): T {
  try {
    return fn();
  } catch (err) {
    throw toEventStoreError(err, context);
  }
}
