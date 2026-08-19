/**
 * One provocation per documented error code, plus the "returns null" getters.
 * Acceptance criteria 8, 11.
 */

import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { EventStoreErrorCode } from '../../../src/shared/contracts/event-store';
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

describe('every documented error code is reachable (criterion 8)', () => {
  const provoked = new Set<EventStoreErrorCode>();

  function record(code: EventStoreErrorCode): void {
    provoked.add(code);
  }

  it('NOT_FOUND', () => {
    const store = memoryStore();
    const codes = [
      catchStoreError(() => store.updatePod('ghost', { title: 'x' })).code,
      catchStoreError(() => store.deletePod('ghost')).code,
      catchStoreError(() => store.createLane(laneInput('ghost-pod'))).code,
      catchStoreError(() => store.setLaneStatus('ghost', 'done')).code,
      catchStoreError(() => store.setLaneAgentId('ghost', 'agent')).code,
    ];
    expect(codes).toEqual(['NOT_FOUND', 'NOT_FOUND', 'NOT_FOUND', 'NOT_FOUND', 'NOT_FOUND']);
    record('NOT_FOUND');
  });

  it('CONFLICT', () => {
    const store = memoryStore();
    store.createPod(podInput({ id: 'dupe' }));
    const err = catchStoreError(() => store.createPod(podInput({ id: 'dupe' })));
    expect(err.code).toBe('CONFLICT');
    expect(err.message).toMatch(/SQLITE_CONSTRAINT/);
    record('CONFLICT');
  });

  it('IO when the database file cannot be opened', () => {
    const missingDir = join(tempDbPath('unused.db'), 'no', 'such', 'dir', 'store.db');
    const err = catchStoreError(() => openEventStore(missingDir));
    expect(err.code).toBe('IO');
    record('IO');
  });

  it('IO when a call is made after close()', () => {
    const { store, podId, laneId } = seededStore();
    store.close();

    expect(catchStoreError(() => store.getPod(podId)).code).toBe('IO');
    expect(catchStoreError(() => store.append(eventInput(podId, laneId))).code).toBe('IO');
    expect(catchStoreError(() => store.readEvents({ podId })).code).toBe('IO');
    record('IO');
  });

  it('IO when a JSON column on disk is corrupt', () => {
    const path = tempDbPath();
    const store = fileStore(path);
    store.migrate();
    const pod = store.createPod(podInput({ id: 'pod-corrupt' }));

    rawDb(path).prepare('UPDATE pods SET env_overrides = ? WHERE id = ?').run('{not json', pod.id);

    const err = catchStoreError(() => store.getPod(pod.id));
    expect(err.code).toBe('IO');
    expect(err.message).toMatch(/env_overrides/);
    record('IO');
  });

  it('SCHEMA_MISMATCH', () => {
    const path = tempDbPath();
    const first = fileStore(path);
    first.migrate();
    first.close();

    rawDb(path).prepare('INSERT INTO schema_version (version, applied_at) VALUES (?, ?)').run(
      9999,
      '2099-01-01T00:00:00.000Z',
    );

    const second = fileStore(path);
    expect(catchStoreError(() => second.migrate()).code).toBe('SCHEMA_MISMATCH');
    record('SCHEMA_MISMATCH');
  });

  it('covers all four documented codes', () => {
    // Runs last in this file; `provoked` is filled by the tests above.
    expect([...provoked].sort()).toEqual([...ALL_CODES].sort());
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
