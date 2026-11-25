/**
 * Migration 7 — add the nullable `lanes.resumed_at` column.
 *
 * Every assertion runs against a REAL database brought to version 6 by
 * migrations 1-6's own SQL and seeded through a raw connection, then migrated
 * by the store. Nothing is read out of migration 7's SQL string: the column
 * and the row values are read back out of SQLite.
 */

import { afterEach, describe, expect, it } from 'vitest';

import { MIGRATIONS, SCHEMA_VERSION_DDL } from '../../../src/main/store/schema';
import { cleanupStores, fileStore, rawDb, tempDbPath } from './helpers';

afterEach(cleanupStores);

const migration = (version: number): string => {
  const found = MIGRATIONS.find((m) => m.version === version);
  if (found === undefined) throw new Error(`no migration ${version}`);
  return found.sql;
};

const POD_COLUMNS =
  'id, title, cwd, cc_session_id, permission_mode, env_overrides, tab_order, status, created_at, last_active_at, forked_from_pod_id, forked_from_cc_session_id';
/** The lanes columns as migration 6 left them; migration 7 adds `resumed_at`. */
const V6_LANE_COLUMNS =
  'id, pod_id, kind, tool_use_id, agent_id, parent_lane_id, depth, subagent_type, description, status, started_at, ended_at';

const V6_APPLIED_AT: Record<number, string> = {
  1: '2026-08-18T09:00:00.000Z',
  2: '2026-08-19T09:00:00.000Z',
  3: '2026-08-20T09:00:00.000Z',
  4: '2026-08-21T09:00:00.000Z',
  5: '2026-08-22T09:00:00.000Z',
  6: '2026-08-23T09:00:00.000Z',
};

/** Every lanes column, every row — `SELECT *` so a dropped column shows up too. */
function laneRows(path: string): Record<string, unknown>[] {
  return rawDb(path).prepare<unknown[], Record<string, unknown>>('SELECT * FROM lanes ORDER BY id').all();
}

/** `SELECT COUNT(*)`, executed. Never a literal. */
function count(path: string, table: string): number {
  const row = rawDb(path).prepare<unknown[], { n: number }>(`SELECT COUNT(*) AS n FROM ${table}`).get();
  if (row === undefined) throw new Error(`no count for ${table}`);
  return row.n;
}

function versions(path: string): { version: number; applied_at: string }[] {
  return rawDb(path)
    .prepare<unknown[], { version: number; applied_at: string }>(
      'SELECT version, applied_at FROM schema_version ORDER BY version',
    )
    .all();
}

/**
 * A database at schema version 6 exactly as the previous build left it: one
 * Pod with a running Matriarch and a finished Calf (carrying an `ended_at`), a
 * second Pod with a stopped Matriarch, and events on every lane, written
 * through a raw connection.
 */
function makeV6Database(): string {
  const path = tempDbPath('v6.db');
  const db = rawDb(path);
  db.exec(SCHEMA_VERSION_DDL);
  for (const v of [1, 2, 3, 4, 5, 6]) db.exec(migration(v));
  const insertVersion = db.prepare('INSERT INTO schema_version (version, applied_at) VALUES (?, ?)');
  for (const v of [1, 2, 3, 4, 5, 6]) insertVersion.run(v, V6_APPLIED_AT[v]);

  const insertPod = db.prepare(`INSERT INTO pods (${POD_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  insertPod.run('pod-a', 'Refactor the router', 'C:\\work\\repo', 'cc-session-a', 'auto', '{"FOO":"bar"}', 0, 'running', '2026-08-18T09:00:01.000Z', '2026-08-18T09:05:00.000Z', null, null);
  insertPod.run('pod-b', 'A fork', 'C:\\work\\repo', 'cc-session-b', 'default', '{}', 1, 'closed', '2026-08-18T09:00:02.000Z', '2026-08-18T09:06:00.000Z', 'pod-a', 'cc-session-a');

  const insertLane = db.prepare(`INSERT INTO lanes (${V6_LANE_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  insertLane.run('lane-a', 'pod-a', 'matriarch', null, null, null, 0, null, null, 'running', '2026-08-18T09:00:05.000Z', null);
  insertLane.run('lane-a-calf', 'pod-a', 'calf', 'toolu_01', 'agent-7', 'lane-a', 1, 'reviewer', 'review it', 'done', '2026-08-18T09:00:06.000Z', '2026-08-18T09:04:00.000Z');
  insertLane.run('lane-b', 'pod-b', 'matriarch', null, null, null, 0, null, null, 'stopped', '2026-08-18T09:00:08.000Z', '2026-08-18T09:07:00.000Z');

  const insertEvent = db.prepare(
    'INSERT INTO events (pod_id, lane_id, seq, type, payload, raw, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  );
  insertEvent.run('pod-a', 'lane-a', 1, 'user_message', '{"text":"go"}', null, '2026-08-18T09:00:10.000Z');
  insertEvent.run('pod-a', 'lane-a-calf', 2, 'assistant_text', '{"text":"working"}', '{"raw":true}', '2026-08-18T09:00:11.000Z');
  insertEvent.run('pod-b', 'lane-b', 1, 'error', '{"message":"boom"}', null, '2026-08-18T09:00:14.000Z');

  db.close();
  return path;
}

function migrate(path: string): void {
  const store = fileStore(path);
  store.migrate();
  store.close();
}

describe('the v6 fixture', () => {
  it('is at version 6, has no resumed_at column, and holds a running and a terminal lane', () => {
    const path = makeV6Database();
    expect(versions(path).map((r) => r.version)).toEqual([1, 2, 3, 4, 5, 6]);
    const rows = laneRows(path);
    expect(rows.every((r) => !('resumed_at' in r))).toBe(true);
    expect(rows.map((r) => r['status']).sort()).toEqual(['done', 'running', 'stopped']);
    expect(rows.find((r) => r['id'] === 'lane-a-calf')?.['ended_at']).toBe('2026-08-18T09:04:00.000Z');
  });
});

describe('migration 7 preserves every lane row', () => {
  it('keeps every pre-existing column value of every lane row and reads resumed_at NULL on each', () => {
    const path = makeV6Database();
    const before = laneRows(path);
    expect(before.length).toBeGreaterThanOrEqual(3);

    migrate(path);

    const after = laneRows(path);
    expect(after.map((r) => r['resumed_at'])).toEqual(before.map(() => null));
    const withoutResumedAt = after.map((r) => {
      const { resumed_at: _resumedAt, ...rest } = r;
      return rest;
    });
    expect(withoutResumedAt).toEqual(before);
  });

  it('keeps the lanes, events and pods row counts', () => {
    const path = makeV6Database();
    const before = { pods: count(path, 'pods'), lanes: count(path, 'lanes'), events: count(path, 'events') };
    expect(before.lanes).toBeGreaterThan(0);
    expect(before.events).toBeGreaterThan(0);
    migrate(path);
    expect({ pods: count(path, 'pods'), lanes: count(path, 'lanes'), events: count(path, 'events') }).toEqual(before);
  });
});

describe('migration 7 is appended, not edited in', () => {
  it('adds exactly one schema_version row, version 7, and leaves the applied_at of 1-6 as it was', () => {
    const path = makeV6Database();
    migrate(path);
    const after = versions(path);
    expect(after.map((r) => r.version)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    for (const v of [1, 2, 3, 4, 5, 6]) {
      expect(after.find((r) => r.version === v)?.applied_at, `version ${v}`).toBe(V6_APPLIED_AT[v]);
    }
  });
});
