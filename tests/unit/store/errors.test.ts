/**
 * One provocation per documented error code, plus the "returns null" getters.
 * Acceptance criteria 8, 11.
 *
 * Each provocation is a standalone function that returns the
 * `EventStoreError` it caused. The coverage test below runs the whole
 * `PROVOCATIONS` table itself, so the "all four codes are reachable" claim
 * holds within one `it` and does not depend on its siblings having run first
 * — or at all. The individual `it` blocks call the same functions and add the
 * assertions specific to their route, so a provocation runs twice per file:
 * once for its own detail, once for the coverage claim.
 */

import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { EventStoreErrorCode } from '../../../src/shared/contracts/event-store';
import { EventStoreError as ContractEventStoreError } from '../../../src/shared/contracts/event-store';
import { EventStoreError, openEventStore } from '../../../src/main/store';
import {
  catchStoreError,
  cleanupStores,
  eventInput,
  fileStore,
  laneInput,
  memoryStore,
  podInput,
  rawDb,
  seededStore,
  tempDbPath,
} from './helpers';

afterEach(cleanupStores);

const ALL_CODES: EventStoreErrorCode[] = ['NOT_FOUND', 'CONFLICT', 'IO', 'SCHEMA_MISMATCH'];

describe('EventStoreError', () => {
  it('is a real, throwable Error carrying a contract code', () => {
    const err = new EventStoreError('IO', 'boom');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(EventStoreError);
    expect(err.name).toBe('EventStoreError');
    expect(err.code).toBe('IO');
    expect(err.message).toBe('boom');
  });
});

// ---------------------------------------------------------------------------
// Provocations. Every one opens its own store and returns the error it caused,
// so it is safe to call from any test, in any order, more than once.
// ---------------------------------------------------------------------------

/** A call that is required to fail, handing back the error for assertions. */
type Provocation = () => EventStoreError;

const notFoundOnDeletingAnAbsentPod: Provocation = () => {
  const store = memoryStore();
  return catchStoreError(() => store.deletePod('ghost'));
};

const conflictOnReusingAPodId: Provocation = () => {
  const store = memoryStore();
  store.createPod(podInput({ id: 'dupe' }));
  return catchStoreError(() => store.createPod(podInput({ id: 'dupe' })));
};

const ioWhenTheDatabaseFileCannotBeOpened: Provocation = () => {
  const missingDir = join(tempDbPath('unused.db'), 'no', 'such', 'dir', 'store.db');
  return catchStoreError(() => openEventStore(missingDir));
};

const ioOnACallAfterClose: Provocation = () => {
  const { store, podId } = seededStore();
  store.close();
  return catchStoreError(() => store.getPod(podId));
};

const ioOnACorruptJsonColumn: Provocation = () => {
  const path = tempDbPath();
  const store = fileStore(path);
  store.migrate();
  const pod = store.createPod(podInput({ id: 'pod-corrupt' }));

  rawDb(path).prepare('UPDATE pods SET env_overrides = ? WHERE id = ?').run('{not json', pod.id);

  return catchStoreError(() => store.getPod(pod.id));
};

const schemaMismatchOnAFutureSchemaVersion: Provocation = () => {
  const path = tempDbPath();
  const first = fileStore(path);
  first.migrate();
  first.close();

  rawDb(path).prepare('INSERT INTO schema_version (version, applied_at) VALUES (?, ?)').run(
    9999,
    '2099-01-01T00:00:00.000Z',
  );

  const second = fileStore(path);
  return catchStoreError(() => second.migrate());
};

/**
 * One provocation per documented code. Three routes above reach `IO`; the
 * table names the cheapest of them (no filesystem), because its job is to
 * witness that the code is reachable at all. The other two IO routes keep
 * their own `it` blocks, which assert the detail the table cannot.
 */
const PROVOCATIONS: Record<EventStoreErrorCode, Provocation> = {
  NOT_FOUND: notFoundOnDeletingAnAbsentPod,
  CONFLICT: conflictOnReusingAPodId,
  IO: ioOnACallAfterClose,
  SCHEMA_MISMATCH: schemaMismatchOnAFutureSchemaVersion,
};

describe('every documented error code is reachable (criterion 8)', () => {
  it('every mutation naming a row that does not exist fails NOT_FOUND', () => {
    expect(notFoundOnDeletingAnAbsentPod().code).toBe('NOT_FOUND');

    const store = memoryStore();
    const codes = [
      catchStoreError(() => store.updatePod('ghost', { title: 'x' })).code,
      catchStoreError(() => store.deletePod('ghost')).code,
      catchStoreError(() => store.createLane(laneInput('ghost-pod'))).code,
      catchStoreError(() => store.setLaneStatus('ghost', 'done')).code,
      catchStoreError(() => store.setLaneAgentId('ghost', 'agent')).code,
    ];
    expect(codes).toEqual(['NOT_FOUND', 'NOT_FOUND', 'NOT_FOUND', 'NOT_FOUND', 'NOT_FOUND']);
  });

  it('reusing a Pod id fails CONFLICT and names the SQLite constraint', () => {
    const err = conflictOnReusingAPodId();
    expect(err.code).toBe('CONFLICT');
    expect(err.message).toMatch(/SQLITE_CONSTRAINT/);
  });

  it('a database file that cannot be opened fails IO', () => {
    expect(ioWhenTheDatabaseFileCannotBeOpened().code).toBe('IO');
  });

  it('every call made after close() fails IO', () => {
    expect(ioOnACallAfterClose().code).toBe('IO');

    const { store, podId, laneId } = seededStore();
    store.close();

    expect(catchStoreError(() => store.getPod(podId)).code).toBe('IO');
    expect(catchStoreError(() => store.append(eventInput(podId, laneId))).code).toBe('IO');
    expect(catchStoreError(() => store.readEvents({ podId })).code).toBe('IO');
  });

  it('a corrupt JSON column on disk fails IO and names the column', () => {
    const err = ioOnACorruptJsonColumn();
    expect(err.code).toBe('IO');
    expect(err.message).toMatch(/env_overrides/);
  });

  it('migrating onto a newer schema version fails SCHEMA_MISMATCH', () => {
    expect(schemaMismatchOnAFutureSchemaVersion().code).toBe('SCHEMA_MISMATCH');
  });

  it('covers all four documented codes, provoking each one itself', () => {
    expect(Object.keys(PROVOCATIONS).sort()).toEqual([...ALL_CODES].sort());

    const yielded = Object.entries(PROVOCATIONS).map(([code, provoke]) => [code, provoke().code]);
    const expected = Object.keys(PROVOCATIONS).map((code) => [code, code]);
    expect(yielded).toEqual(expected);
  });
});

describe('getters documented to return null do not throw (criterion 8)', () => {
  it('getPod, getLane, getLaneByToolUseId, getMatriarchLane', () => {
    const store = memoryStore();
    expect(store.getPod('ghost')).toBeNull();
    expect(store.getLane('ghost')).toBeNull();
    expect(store.getLaneByToolUseId('ghost', 'toolu_ghost')).toBeNull();
    expect(store.getMatriarchLane('ghost')).toBeNull();
  });
});

describe('close()', () => {
  it('is safe to call twice', () => {
    const store = memoryStore();
    store.close();
    expect(() => store.close()).not.toThrow();
  });
});

/**
 * AMENDMENT E1. `EventStoreError` used to be `export declare class` in the
 * contract — an ambient declaration TypeScript emits no value for — so a
 * consumer importing it from the contract and writing `e instanceof
 * EventStoreError` got `undefined is not a constructor` at runtime. The
 * contract now declares a real class and is the single definition.
 */
describe('EventStoreError is a runtime value on the contract module (E1)', () => {
  it('the contract export is a constructor, not an ambient declaration', () => {
    expect(typeof ContractEventStoreError).toBe('function');
    expect(ContractEventStoreError.prototype).toBeInstanceOf(Error);
  });

  it('instanceof works against the contract import', () => {
    const err: unknown = new ContractEventStoreError('CONFLICT', 'dup');
    expect(err).toBeInstanceOf(ContractEventStoreError);
    expect(err).toBeInstanceOf(Error);
    expect((err as InstanceType<typeof ContractEventStoreError>).code).toBe('CONFLICT');
  });

  it('the module barrel re-exports the SAME class, so neither import misses', () => {
    expect(EventStoreError).toBe(ContractEventStoreError);
  });

  it('an error thrown by the real store is instanceof the contract class', () => {
    const store = memoryStore();
    let thrown: unknown;
    try {
      store.deletePod('ghost');
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(ContractEventStoreError);
    expect((thrown as InstanceType<typeof ContractEventStoreError>).code).toBe('NOT_FOUND');
  });
});
