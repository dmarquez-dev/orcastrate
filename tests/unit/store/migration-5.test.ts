/**
 * Migration 5 — Pod ancestry: `pods.forked_from_pod_id` and
 * `pods.forked_from_cc_session_id`.
 *
 * Every assertion runs against a REAL database brought to version 4 by
 * migrations 1-4's own SQL and seeded through a raw connection, then migrated
 * by the store. Nothing is read out of migration 5's SQL string except the
 * one check that is about the string itself (no data statements).
 */

import { afterEach, describe, expect, it } from 'vitest';

import { CURRENT_SCHEMA_VERSION, MIGRATIONS, SCHEMA_VERSION_DDL } from '../../../src/main/store/schema';
import { cleanupStores, fileStore, rawDb, tempDbPath } from './helpers';

afterEach(cleanupStores);

const migration = (version: number): string => {
  const found = MIGRATIONS.find((m) => m.version === version);
  if (found === undefined) throw new Error(`no migration ${version}`);
  return found.sql;
};

const COLUMNS = {
  pods: 'id, title, cwd, cc_session_id, permission_mode, env_overrides, tab_order, status, created_at, last_active_at',
  lanes:
    'id, pod_id, kind, tool_use_id, agent_id, parent_lane_id, depth, subagent_type, description, status, started_at, ended_at',
  events: 'id, pod_id, lane_id, seq, type, payload, raw, created_at',
} as const;

interface Snapshot {
  pods: Record<string, unknown>[];
  lanes: Record<string, unknown>[];
  events: Record<string, unknown>[];
}

/** The PRE-EXISTING columns only, so a v4 and a v5 snapshot compare. */
function snapshot(path: string): Snapshot {
  const db = rawDb(path);
  const all = (table: keyof typeof COLUMNS): Record<string, unknown>[] =>
    db
      .prepare<unknown[], Record<string, unknown>>(`SELECT ${COLUMNS[table]} FROM ${table} ORDER BY id`)
      .all();
  return { pods: all('pods'), lanes: all('lanes'), events: all('events') };
}

/** `SELECT COUNT(*)`, executed. Never a literal. */
function count(path: string, table: string): number {
  const row = rawDb(path).prepare<unknown[], { n: number }>(`SELECT COUNT(*) AS n FROM ${table}`).get();
  if (row === undefined) throw new Error(`no count for ${table}`);
  return row.n;
}

function podsDdl(path: string): string {
  const row = rawDb(path)
    .prepare<unknown[], { sql: string | null }>("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'pods'")
    .get();
  if (row?.sql == null) throw new Error('no pods table');
  return row.sql;
}

interface V4Fixture extends Snapshot {
  path: string;
}

/**
 * A database at schema version 4 exactly as the previous build left it: two
 * Pods, a Matriarch and Calves (one with a non-null parent_lane_id), and events
 * on every lane, written through a raw connection.
 */
function makeV4Database(): V4Fixture {
  const path = tempDbPath('v4.db');
  const db = rawDb(path);
  db.exec(SCHEMA_VERSION_DDL);
  for (const v of [1, 2, 3, 4]) db.exec(migration(v));
  const insertVersion = db.prepare('INSERT INTO schema_version (version, applied_at) VALUES (?, ?)');
  insertVersion.run(1, '2026-08-18T09:00:00.000Z');
  insertVersion.run(2, '2026-08-19T09:00:00.000Z');
  insertVersion.run(3, '2026-08-20T09:00:00.000Z');
  insertVersion.run(4, '2026-08-21T09:00:00.000Z');

  const insertPod = db.prepare(`INSERT INTO pods (${COLUMNS.pods}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  insertPod.run('pod-a', 'Refactor the router', 'C:\\work\\repo', 'cc-session-a', 'acceptEdits', '{"FOO":"bar"}', 0, 'running', '2026-08-18T09:00:01.000Z', '2026-08-18T09:05:00.000Z');
  insertPod.run('pod-b', "Pod with an apostrophe ' and unicode 🐋", 'C:\\work\\other', null, 'bypassPermissions', '{}', 1, 'closed', '2026-08-18T09:00:02.000Z', '2026-08-18T09:06:00.000Z');

  const insertLane = db.prepare(`INSERT INTO lanes (${COLUMNS.lanes}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
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
  return { path, ...snapshot(path) };
}

function migrated(): V4Fixture {
  const fixture = makeV4Database();
  const store = fileStore(fixture.path);
  store.migrate();
  store.close();
  return fixture;
}

describe('the v4 fixture', () => {
  it('is at version 4 with two pods and no ancestry columns yet', () => {
    const fixture = makeV4Database();
    expect(
      rawDb(fixture.path).prepare<unknown[], { v: number }>('SELECT MAX(version) AS v FROM schema_version').get()?.v,
    ).toBe(4);
    expect(fixture.pods.length).toBeGreaterThanOrEqual(2);
    expect(podsDdl(fixture.path)).not.toContain('forked_from');
  });
});

describe('migration 5 is appended, not edited in', () => {
  it('is the single entry after version 4 and the schema head is 5', () => {
    expect(MIGRATIONS.map((m) => m.version)).toEqual([1, 2, 3, 4, 5]);
    expect(CURRENT_SCHEMA_VERSION).toBe(5);
  });

  it('appends only version 5 to schema_version on a v4 database', () => {
    const fixture = migrated();
    const versions = rawDb(fixture.path)
      .prepare<unknown[], { version: number; applied_at: string }>(
        'SELECT version, applied_at FROM schema_version ORDER BY version',
      )
      .all();
    expect(versions.map((r) => r.version)).toEqual([1, 2, 3, 4, 5]);
    expect(versions[3]?.applied_at).toBe('2026-08-21T09:00:00.000Z');
  });

  it('changes shape only: its SQL carries no INSERT, UPDATE or DELETE statement', () => {
    // Statement-level, because the foreign key's `ON DELETE SET NULL` action
    // clause legitimately contains the word DELETE.
    const dataStatements = (sql: string): string[] =>
      sql
        .replace(/--[^\n]*/g, '')
        .split(';')
        .map((s) => s.trim())
        .filter((s) => /^(INSERT|UPDATE|DELETE|REPLACE)\b/i.test(s));

    // The predicate itself: it catches a data statement and passes the action clause.
    expect(dataStatements("ALTER TABLE t ADD COLUMN c TEXT REFERENCES t(id) ON DELETE SET NULL;\nDELETE FROM t;")).toHaveLength(1);
    expect(dataStatements('ALTER TABLE t ADD COLUMN c TEXT REFERENCES t(id) ON DELETE SET NULL;')).toEqual([]);

    expect(migration(5)).toMatch(/\S/);
    expect(dataStatements(migration(5))).toEqual([]);
  });
});

describe('migration 5 preserves every pre-existing row', () => {
  it('keeps the pods, lanes and events row counts', () => {
    const fixture = makeV4Database();
    const before = { pods: count(fixture.path, 'pods'), lanes: count(fixture.path, 'lanes'), events: count(fixture.path, 'events') };
    const store = fileStore(fixture.path);
    store.migrate();
    store.close();
    expect({ pods: count(fixture.path, 'pods'), lanes: count(fixture.path, 'lanes'), events: count(fixture.path, 'events') }).toEqual(before);
  });

  it('keeps every pre-existing column value byte-identical', () => {
    const fixture = migrated();
    const after = snapshot(fixture.path);
    expect(after.pods).toEqual(fixture.pods);
    expect(after.lanes).toEqual(fixture.lanes);
    expect(after.events).toEqual(fixture.events);
  });

  it('reads both new columns as NULL for every pre-existing pod', () => {
    const fixture = migrated();
    const rows = rawDb(fixture.path)
      .prepare<unknown[], { id: string; forked_from_pod_id: unknown; forked_from_cc_session_id: unknown }>(
        'SELECT id, forked_from_pod_id, forked_from_cc_session_id FROM pods ORDER BY id',
      )
      .all();
    expect(rows).toEqual(
      fixture.pods.map((p) => ({ id: p['id'], forked_from_pod_id: null, forked_from_cc_session_id: null })),
    );
  });

  it('leaves PRAGMA foreign_key_check clean', () => {
    const fixture = migrated();
    expect(rawDb(fixture.path).pragma('foreign_key_check')).toEqual([]);
  });
});

describe('the ancestry columns as SQLite reports them', () => {
  it('pods has exactly one foreign key: forked_from_pod_id -> pods(id) ON DELETE SET NULL', () => {
    const fixture = migrated();
    const fks = rawDb(fixture.path)
      .prepare<unknown[], { table: string; from: string; to: string; on_delete: string }>(
        "PRAGMA foreign_key_list('pods')",
      )
      .all()
      .map((r) => ({ table: r.table, from: r.from, to: r.to, on_delete: r.on_delete }));
    expect(fks).toEqual([{ table: 'pods', from: 'forked_from_pod_id', to: 'id', on_delete: 'SET NULL' }]);
  });

  it('forked_from_cc_session_id is a nullable TEXT column defaulting to NULL', () => {
    const fixture = migrated();
    const col = rawDb(fixture.path)
      .prepare<unknown[], { name: string; type: string; notnull: number; dflt_value: unknown }>(
        "PRAGMA table_info('pods')",
      )
      .all()
      .find((c) => c.name === 'forked_from_cc_session_id');
    expect(col).toBeDefined();
    expect({ type: col?.type, notnull: col?.notnull, dflt_value: col?.dflt_value }).toEqual({
      type: 'TEXT',
      notnull: 0,
      dflt_value: null,
    });
  });

  it('names the forked_from_pod_id foreign key with an explicit CONSTRAINT', () => {
    const fixture = migrated();
    expect(podsDdl(fixture.path)).toMatch(
      /forked_from_pod_id\s+TEXT\s+CONSTRAINT\s+\w+\s+REFERENCES\s+pods\s*\(\s*id\s*\)\s+ON\s+DELETE\s+SET\s+NULL/i,
    );
  });

  it('indexes pods(forked_from_pod_id)', () => {
    const fixture = migrated();
    const db = rawDb(fixture.path);
    const indexed = db
      .prepare<unknown[], { name: string }>("PRAGMA index_list('pods')")
      .all()
      .filter((ix) =>
        db
          .prepare<unknown[], { name: string }>(`PRAGMA index_info('${ix.name}')`)
          .all()
          .map((c) => c.name)
          .join(',') === 'forked_from_pod_id',
      );
    expect(indexed).toHaveLength(1);
    const inMaster = db
      .prepare<unknown[], { n: number }>(
        "SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'index' AND tbl_name = 'pods' AND name = ?",
      )
      .get(indexed[0]?.name)?.n;
    expect(inMaster).toBe(1);
  });

  it('deleting a parent pod sets the child forked_from_pod_id to NULL and keeps the child', () => {
    const fixture = migrated();
    const db = rawDb(fixture.path); // foreign_keys = ON
    db.prepare("UPDATE pods SET forked_from_pod_id = 'pod-a', forked_from_cc_session_id = 'cc-session-a' WHERE id = 'pod-b'").run();
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

describe('fresh and upgraded databases converge at version 5', () => {
  it('produces the same DDL for every object whether built fresh or upgraded from v4', () => {
    const freshPath = tempDbPath('fresh.db');
    const fresh = fileStore(freshPath);
    fresh.migrate();
    fresh.close();

    const upgradedPath = migrated().path;

    const ddl = (path: string): Record<string, string | null> =>
      Object.fromEntries(
        rawDb(path)
          .prepare<unknown[], { name: string; sql: string | null }>(
            "SELECT name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name",
          )
          .all()
          .map((r) => [r.name, r.sql]),
      );
    expect(ddl(upgradedPath)).toEqual(ddl(freshPath));
  });
});
