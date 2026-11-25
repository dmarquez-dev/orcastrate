/**
 * Migration 6 — widen `pods.permission_mode` to the six SDK modes by
 * rebuilding `pods`.
 *
 * Every assertion runs against a REAL database brought to version 5 by
 * migrations 1-5's own SQL and seeded through a raw connection — including a
 * fork carrying both ancestry columns — then migrated by the store. Nothing is
 * read out of migration 6's SQL string: the constraint, the foreign key and the
 * index are all read back out of SQLite.
 */

import { afterEach, describe, expect, it } from 'vitest';

import { CURRENT_SCHEMA_VERSION, MIGRATIONS, SCHEMA_VERSION_DDL } from '../../../src/main/store/schema';
import { cleanupStores, fileStore, podInput, rawDb, tempDbPath } from './helpers';

afterEach(cleanupStores);

const migration = (version: number): string => {
  const found = MIGRATIONS.find((m) => m.version === version);
  if (found === undefined) throw new Error(`no migration ${version}`);
  return found.sql;
};

const SIX_MODES = ['default', 'acceptEdits', 'plan', 'bypassPermissions', 'dontAsk', 'auto'] as const;

const POD_COLUMNS =
  'id, title, cwd, cc_session_id, permission_mode, env_overrides, tab_order, status, created_at, last_active_at, forked_from_pod_id, forked_from_cc_session_id';
const LANE_COLUMNS =
  'id, pod_id, kind, tool_use_id, agent_id, parent_lane_id, depth, subagent_type, description, status, started_at, ended_at';

/** Every pods column, every row — `SELECT *` so a dropped column shows up too. */
function podRows(path: string): Record<string, unknown>[] {
  return rawDb(path).prepare<unknown[], Record<string, unknown>>('SELECT * FROM pods ORDER BY id').all();
}

/** `SELECT COUNT(*)`, executed. Never a literal. */
function count(path: string, table: string, podId?: string): number {
  const db = rawDb(path);
  const row =
    podId === undefined
      ? db.prepare<unknown[], { n: number }>(`SELECT COUNT(*) AS n FROM ${table}`).get()
      : db.prepare<unknown[], { n: number }>(`SELECT COUNT(*) AS n FROM ${table} WHERE pod_id = ?`).get(podId);
  if (row === undefined) throw new Error(`no count for ${table}`);
  return row.n;
}

function masterSql(path: string, type: 'table' | 'index', name: string): string | null {
  const row = rawDb(path)
    .prepare<unknown[], { sql: string | null }>('SELECT sql FROM sqlite_master WHERE type = ? AND name = ?')
    .get(type, name);
  return row === undefined ? null : row.sql;
}

/**
 * A database at schema version 5 exactly as the previous build left it: two
 * Pods, the second a fork of the first carrying both ancestry columns, a
 * Matriarch and a Calf, and events on every lane, written through a raw
 * connection.
 */
function makeV5Database(): string {
  const path = tempDbPath('v5.db');
  const db = rawDb(path);
  db.exec(SCHEMA_VERSION_DDL);
  for (const v of [1, 2, 3, 4, 5]) db.exec(migration(v));
  const insertVersion = db.prepare('INSERT INTO schema_version (version, applied_at) VALUES (?, ?)');
  insertVersion.run(1, '2026-08-18T09:00:00.000Z');
  insertVersion.run(2, '2026-08-19T09:00:00.000Z');
  insertVersion.run(3, '2026-08-20T09:00:00.000Z');
  insertVersion.run(4, '2026-08-21T09:00:00.000Z');
  insertVersion.run(5, '2026-08-22T09:00:00.000Z');

  const insertPod = db.prepare(`INSERT INTO pods (${POD_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  insertPod.run('pod-a', 'Refactor the router', 'C:\\work\\repo', 'cc-session-a', 'acceptEdits', '{"FOO":"bar"}', 0, 'running', '2026-08-18T09:00:01.000Z', '2026-08-18T09:05:00.000Z', null, null);
  insertPod.run('pod-b', "Fork with an apostrophe ' and unicode 🐋", 'C:\\work\\repo', 'cc-session-b', 'bypassPermissions', '{}', 1, 'closed', '2026-08-18T09:00:02.000Z', '2026-08-18T09:06:00.000Z', 'pod-a', 'cc-session-a');

  const insertLane = db.prepare(`INSERT INTO lanes (${LANE_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
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

describe('the v5 fixture', () => {
  it('is at version 5, holds a fork, and refuses auto, which is why migration 6 exists', () => {
    const path = makeV5Database();
    expect(rawDb(path).prepare<unknown[], { v: number }>('SELECT MAX(version) AS v FROM schema_version').get()?.v).toBe(5);
    const fork = podRows(path).find((p) => p['id'] === 'pod-b');
    expect(fork).toMatchObject({ forked_from_pod_id: 'pod-a', forked_from_cc_session_id: 'cc-session-a' });
    expect(() =>
      rawDb(path).prepare('UPDATE pods SET permission_mode = ? WHERE id = ?').run('auto', 'pod-a'),
    ).toThrowError(/CHECK constraint failed/i);
  });
});

describe('migration 6 is appended, not edited in', () => {
  it('is the single entry after version 5, and migration 7 follows it', () => {
    expect(MIGRATIONS.map((m) => m.version)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(CURRENT_SCHEMA_VERSION).toBe(7);
  });

  it('appends versions 6 and 7 to schema_version on a v5 database, keeping 5 stamped as it was', () => {
    const path = makeV5Database();
    migrate(path);
    const versions = rawDb(path)
      .prepare<unknown[], { version: number; applied_at: string }>('SELECT version, applied_at FROM schema_version ORDER BY version')
      .all();
    expect(versions.map((r) => r.version)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(versions[4]?.applied_at).toBe('2026-08-22T09:00:00.000Z');
  });
});

describe('migration 6 preserves every row', () => {
  it('keeps the pods, lanes and events row counts', () => {
    const path = makeV5Database();
    const before = { pods: count(path, 'pods'), lanes: count(path, 'lanes'), events: count(path, 'events') };
    migrate(path);
    expect({ pods: count(path, 'pods'), lanes: count(path, 'lanes'), events: count(path, 'events') }).toEqual(before);
  });

  it('keeps every pods column value identical, ancestry columns included', () => {
    const path = makeV5Database();
    const before = podRows(path);
    expect(before.length).toBeGreaterThanOrEqual(2);
    migrate(path);
    expect(podRows(path)).toEqual(before);
  });
});

describe('the widened permission_mode CHECK', () => {
  it('accepts each of the six SDK modes and refuses manual', () => {
    const path = makeV5Database();
    migrate(path);
    const db = rawDb(path);
    for (const mode of SIX_MODES) {
      expect(() => db.prepare('UPDATE pods SET permission_mode = ? WHERE id = ?').run(mode, 'pod-a'), mode).not.toThrow();
    }
    expect(() =>
      db.prepare('UPDATE pods SET permission_mode = ? WHERE id = ?').run('manual', 'pod-a'),
    ).toThrowError(/CHECK constraint failed/i);
  });

  it('round-trips an auto Pod and a dontAsk Pod through the store API', () => {
    const store = fileStore(tempDbPath('fresh.db'));
    store.migrate();
    const auto = store.createPod(podInput({ permissionMode: 'auto' }));
    const dontAsk = store.createPod(podInput({ permissionMode: 'dontAsk', tabOrder: 1 }));
    expect(store.getPod(auto.id)?.permissionMode).toBe('auto');
    expect(store.getPod(dontAsk.id)?.permissionMode).toBe('dontAsk');
  });
});

describe('the ancestry foreign key survives the rebuild', () => {
  it('is still named fk_pods_forked_from_pod_id in the rebuilt pods DDL', () => {
    const path = makeV5Database();
    migrate(path);
    expect(masterSql(path, 'table', 'pods')).toContain(
      'CONSTRAINT fk_pods_forked_from_pod_id REFERENCES pods(id) ON DELETE SET NULL',
    );
  });

  it("deleting the fork's parent nulls forked_from_pod_id and keeps forked_from_cc_session_id", () => {
    const path = makeV5Database();
    migrate(path);
    const db = rawDb(path); // foreign_keys = ON
    db.prepare("DELETE FROM pods WHERE id = 'pod-a'").run();
    expect(
      db
        .prepare<unknown[], { forked_from_pod_id: unknown; forked_from_cc_session_id: unknown }>(
          "SELECT forked_from_pod_id, forked_from_cc_session_id FROM pods WHERE id = 'pod-b'",
        )
        .get(),
    ).toEqual({ forked_from_pod_id: null, forked_from_cc_session_id: 'cc-session-a' });
  });
});

describe('the ancestry index survives the rebuild', () => {
  it('recreates idx_pods_forked_from on pods with the definition it had before migrate()', () => {
    const path = makeV5Database();
    const before = masterSql(path, 'index', 'idx_pods_forked_from');
    expect(before).not.toBeNull();
    migrate(path);
    const db = rawDb(path);
    expect(
      db
        .prepare<unknown[], { tbl_name: string }>("SELECT tbl_name FROM sqlite_master WHERE type = 'index' AND name = 'idx_pods_forked_from'")
        .get()?.tbl_name,
    ).toBe('pods');
    expect(masterSql(path, 'index', 'idx_pods_forked_from')).toBe(before);
  });
});

describe('migration 6 does not cascade the store away', () => {
  it('leaves PRAGMA foreign_key_check clean', () => {
    const path = makeV5Database();
    migrate(path);
    expect(rawDb(path).pragma('foreign_key_check')).toEqual([]);
  });

  it("deleting one migrated Pod removes exactly that Pod's lanes and events", () => {
    const path = makeV5Database();
    migrate(path);
    const keptLanes = count(path, 'lanes', 'pod-a');
    const keptEvents = count(path, 'events', 'pod-a');
    expect(count(path, 'lanes', 'pod-b')).toBeGreaterThan(0);
    expect(count(path, 'events', 'pod-b')).toBeGreaterThan(0);

    rawDb(path).prepare("DELETE FROM pods WHERE id = 'pod-b'").run(); // foreign_keys = ON

    expect(count(path, 'lanes', 'pod-b')).toBe(0);
    expect(count(path, 'events', 'pod-b')).toBe(0);
    expect(count(path, 'lanes', 'pod-a')).toBe(keptLanes);
    expect(count(path, 'events', 'pod-a')).toBe(keptEvents);
  });
});
