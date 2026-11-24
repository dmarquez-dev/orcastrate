/**
 * Schema shape, migration idempotency, and the version gate.
 * Acceptance criteria 1, 2, 3, 7, 11.
 */

import { afterEach, describe, expect, it } from 'vitest';

import { SCHEMA_TABLES } from '../../../src/shared/contracts/event-store';
import { CURRENT_SCHEMA_VERSION, openEventStore } from '../../../src/main/store';
import { catchStoreError, cleanupStores, fileStore, podInput, rawDb, tempDbPath } from './helpers';

afterEach(cleanupStores);

const STORE_METHODS = [
  'migrate',
  'createPod',
  'getPod',
  'listPods',
  'updatePod',
  'deletePod',
  'createLane',
  'getLane',
  'getLaneByToolUseId',
  'getMatriarchLane',
  'listLanes',
  'setLaneStatus',
  'setLaneAgentId',
  'append',
  'appendMany',
  'readEvents',
  'latestSeq',
  'close',
] as const;

function tableNames(path: string): string[] {
  return rawDb(path)
    .prepare<unknown[], { name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
    )
    .all()
    .map((r) => r.name);
}

function columnNames(path: string, table: string): string[] {
  return rawDb(path)
    .prepare<unknown[], { name: string }>(`PRAGMA table_info(${table})`)
    .all()
    .map((r) => r.name);
}

describe('EventStore surface (criterion 1)', () => {
  it('exposes exactly the contract methods, all synchronous', () => {
    const path = tempDbPath();
    const store = fileStore(path);

    const own = Object.getOwnPropertyNames(Object.getPrototypeOf(store)).filter(
      (n) => n !== 'constructor' && !n.startsWith('#'),
    );
    // Private helpers are allowed; every contract method must be present and
    // no contract method may be missing.
    for (const method of STORE_METHODS) {
      expect(typeof (store as unknown as Record<string, unknown>)[method]).toBe('function');
    }
    expect(own).toEqual(expect.arrayContaining([...STORE_METHODS]));

    // Synchronous: migrate returns undefined, not a thenable.
    const result: unknown = store.migrate();
    expect(result).toBeUndefined();
    expect(store.listPods()).toEqual([]);
  });

  it('openEventStore does not migrate (the caller does)', () => {
    const path = tempDbPath();
    const store = fileStore(path);
    // No tables before migrate(): the very first query fails at the SQL layer.
    expect(() => store.listPods()).toThrowError(/no such table/i);
    store.migrate();
    expect(store.listPods()).toEqual([]);
  });
});

describe('schema shape (criteria 2, 3)', () => {
  it('creates exactly the tables named in SCHEMA_TABLES', () => {
    const path = tempDbPath();
    fileStore(path).migrate();
    expect(tableNames(path)).toEqual([...SCHEMA_TABLES].sort());
  });

  it('lanes carries agent_id, parent_lane_id and depth from the first migration', () => {
    const path = tempDbPath();
    fileStore(path).migrate();

    expect(columnNames(path, 'lanes')).toEqual(
      expect.arrayContaining(['agent_id', 'parent_lane_id', 'depth']),
    );

    // ...and every shipped migration has run, in order.
    const applied = rawDb(path)
      .prepare<unknown[], { version: number }>('SELECT version FROM schema_version ORDER BY version')
      .all()
      .map((r) => r.version);
    expect(applied).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(CURRENT_SCHEMA_VERSION).toBe(7);
  });

  it('constrains pods.status to closed|idle|running|waiting|beached at the database level', () => {
    const path = tempDbPath();
    const store = fileStore(path);
    store.migrate();
    const pod = store.createPod(podInput());

    const db = rawDb(path);
    for (const valid of ['closed', 'idle', 'running', 'waiting', 'beached']) {
      expect(() => db.prepare('UPDATE pods SET status = ? WHERE id = ?').run(valid, pod.id)).not.toThrow();
    }
    expect(() => db.prepare('UPDATE pods SET status = ? WHERE id = ?').run('sunk', pod.id)).toThrowError(
      /CHECK constraint failed/i,
    );
  });

  it('constrains lanes.status to running|done|orphaned at the database level', () => {
    const path = tempDbPath();
    const store = fileStore(path);
    store.migrate();
    const pod = store.createPod(podInput());
    const lane = store.createLane({
      id: 'lane-status-check',
      podId: pod.id,
      kind: 'matriarch',
      toolUseId: null,
      agentId: null,
      parentLaneId: null,
      depth: 0,
      subagentType: null,
      description: null,
    });

    const db = rawDb(path);
    expect(() =>
      db.prepare("UPDATE lanes SET status = ?, ended_at = '2026-08-18T18:00:00.000Z' WHERE id = ?").run('done', lane.id),
    ).not.toThrow();
    expect(() => db.prepare('UPDATE lanes SET status = ? WHERE id = ?').run('adrift', lane.id)).toThrowError(
      /CHECK constraint failed/i,
    );
  });

  it('constrains pods.permission_mode to the six SDK permission modes', () => {
    const path = tempDbPath();
    const store = fileStore(path);
    store.migrate();
    const pod = store.createPod(podInput());
    const db = rawDb(path);

    // Every SDK mode is accepted at the schema head; migration 6 widened the
    // constraint to the six the SDK declares.
    for (const valid of ['default', 'acceptEdits', 'plan', 'bypassPermissions', 'dontAsk', 'auto']) {
      expect(() =>
        db.prepare('UPDATE pods SET permission_mode = ? WHERE id = ?').run(valid, pod.id),
      ).not.toThrow();
    }

    // The negative case keeps a named mode behind it: CLI 2.1.235 accepts
    // `manual`, and the SDK's union does not declare it.
    expect(() =>
      db.prepare('UPDATE pods SET permission_mode = ? WHERE id = ?').run('manual', pod.id),
    ).toThrowError(/CHECK constraint failed/i);
  });

  it('accepts an acceptEdits Pod through the store API after migration', () => {
    const path = tempDbPath();
    const store = fileStore(path);
    store.migrate();
    const pod = store.createPod(podInput({ permissionMode: 'acceptEdits' }));
    expect(store.getPod(pod.id)?.permissionMode).toBe('acceptEdits');
  });
});

describe('migrate() (criterion 7)', () => {
  it('is idempotent: a second call changes neither schema nor data', () => {
    const path = tempDbPath();
    const store = fileStore(path);
    store.migrate();
    const pod = store.createPod(podInput({ title: 'keep me' }));

    const schemaBefore = rawDb(path)
      .prepare<unknown[], { sql: string | null }>('SELECT sql FROM sqlite_master ORDER BY name')
      .all();

    store.migrate();
    store.migrate();

    const schemaAfter = rawDb(path)
      .prepare<unknown[], { sql: string | null }>('SELECT sql FROM sqlite_master ORDER BY name')
      .all();

    expect(schemaAfter).toEqual(schemaBefore);
    expect(store.listPods()).toHaveLength(1);
    expect(store.getPod(pod.id)?.title).toBe('keep me');
    expect(
      rawDb(path).prepare<unknown[], { n: number }>('SELECT COUNT(*) AS n FROM schema_version').get()?.n,
    ).toBe(CURRENT_SCHEMA_VERSION);
  });

  it('is idempotent across a close and reopen of the same file', () => {
    const path = tempDbPath();
    const first = fileStore(path);
    first.migrate();
    const pod = first.createPod(podInput({ title: 'survivor' }));
    first.close();

    const second = fileStore(path);
    second.migrate();
    expect(second.getPod(pod.id)?.title).toBe('survivor');
  });

  it('throws SCHEMA_MISMATCH when the on-disk version exceeds this build', () => {
    const path = tempDbPath();
    const first = fileStore(path);
    first.migrate();
    first.close();

    rawDb(path)
      .prepare('INSERT INTO schema_version (version, applied_at) VALUES (?, ?)')
      .run(CURRENT_SCHEMA_VERSION + 1, '2099-01-01T00:00:00.000Z');

    const second = openEventStore(path);
    try {
      const err = catchStoreError(() => second.migrate());
      expect(err.code).toBe('SCHEMA_MISMATCH');
      expect(err.message).toMatch(/newer than this build/i);
    } finally {
      second.close();
    }
  });
});
