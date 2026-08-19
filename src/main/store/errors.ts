/**
 * The SQLite -> contract error-code mapping.
 *
 * `EventStoreError` itself is defined in `src/shared/contracts/event-store.ts`
 * and only re-exported here. Amendment E1 turned that declaration from an
 * ambient `export declare class` (which emitted no runtime value, so nothing
 * could `new` it or `instanceof` it) into a real class. The parallel class this
 * file used to declare, and the compile-time assignability pin that kept the
 * two from drifting, are gone with it: there is now exactly one definition, so
 * there is nothing to keep in sync. Existing importers of
 * `src/main/store` are unaffected — the re-export keeps that path working.
 */

import type { EventStoreErrorCode } from '../../shared/contracts/event-store';
import { EventStoreError } from '../../shared/contracts/event-store';

export { EventStoreError };

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
