/**
 * Migration 2 — widening `pods.permission_mode` to four modes.
 *
 * Two things are load-bearing here and both are asserted rather than assumed:
 *
 *  1. Migration 1 was NOT edited. Its `CHECK (permission_mode IN ...)` clause
 *     used to interpolate the live `PERMISSION_MODES` constant, so widening
 *     that constant would have silently rewritten DDL already applied to user
 *     databases. The list is now pinned. The proof that the pinning changed
 *     nothing — diffing migration 1's rendered SQL against the schema.ts blob of
 *     the immutable commit that shipped it — lives in `migration-frozen.test.ts`,
 *     which does that for every shipped migration. This file keeps only the
 *     narrower checks on migration 1's permission-mode clause.
 *
 *  2. Migration 2 rebuilds the `pods` table (SQLite cannot alter a CHECK
 *     constraint in place) and `lanes`/`events` reference `pods(id)` ON DELETE
 *     CASCADE. If foreign keys were enforced during the rebuild the `DROP TABLE
 *     pods` step would cascade the entire store away. That is exercised against
 *     a real v1 database holding pods, lanes and events, not reasoned about.
 */

import { afterEach, describe, expect, it } from 'vitest';

import {
  CURRENT_SCHEMA_VERSION,
  MIGRATIONS,
  SCHEMA_VERSION_DDL,
  sqlIn,
} from '../../../src/main/store/schema';
import { catchStoreError, cleanupStores, fileStore, rawDb, tempDbPath } from './helpers';

afterEach(cleanupStores);

const migration = (version: number): string => {
  const found = MIGRATIONS.find((m) => m.version === version);
  if (found === undefined) throw new Error(`no migration ${version}`);
  return found.sql;
};

// ---------------------------------------------------------------------------
// Criterion 4 — migration 1 is frozen. Its byte-identity against the shipped
// blob is asserted in `migration-frozen.test.ts`; these are the narrower checks.
// ---------------------------------------------------------------------------

describe('migration 1 is frozen (criterion 4)', () => {
  it('still names exactly the three modes it shipped with, not the four we now expose', () => {
    expect(migration(1)).toContain(
      `CHECK (permission_mode IN ${sqlIn(['default', 'plan', 'bypassPermissions'])})`,
    );
    expect(migration(1)).not.toContain('acceptEdits');
  });

  it('widening happens in migration 2, which is the head of the list', () => {
    expect(MIGRATIONS.map((m) => m.version)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(CURRENT_SCHEMA_VERSION).toBe(6);
    expect(migration(2)).toContain(
      `CHECK (permission_mode IN ${sqlIn(['default', 'acceptEdits', 'plan', 'bypassPermissions'])})`,
    );
  });
});

// ---------------------------------------------------------------------------
// Criterion 5 — migration 2 preserves data
// ---------------------------------------------------------------------------

interface V1Fixture {
  path: string;
  pods: Record<string, unknown>[];
  lanes: Record<string, unknown>[];
  events: Record<string, unknown>[];
}

const COLUMNS = {
  pods: 'id, title, cwd, cc_session_id, permission_mode, env_overrides, tab_order, status, created_at, last_active_at',
  lanes:
    'id, pod_id, kind, tool_use_id, agent_id, parent_lane_id, depth, subagent_type, description, status, started_at, ended_at',
  events: 'id, pod_id, lane_id, seq, type, payload, raw, created_at',
} as const;

function snapshot(path: string): Omit<V1Fixture, 'path'> {
  const db = rawDb(path);
  const all = (table: keyof typeof COLUMNS): Record<string, unknown>[] =>
    db
      .prepare<unknown[], Record<string, unknown>>(`SELECT ${COLUMNS[table]} FROM ${table} ORDER BY id`)
      .all();
  return { pods: all('pods'), lanes: all('lanes'), events: all('events') };
}

/**
 * A database at schema version 1 exactly as a previous build left it: migration
 * 1's own SQL, its `schema_version` row, and real rows in all three tables.
 * Written through a raw connection so no current-build code path can quietly
 * fix it up.
 */
function makeV1Database(): V1Fixture {
  const path = tempDbPath('v1.db');
  const db = rawDb(path);
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA_VERSION_DDL);
  db.exec(migration(1));
  db.prepare('INSERT INTO schema_version (version, applied_at) VALUES (?, ?)').run(
    1,
    '2026-08-18T09:00:00.000Z',
  );

  const insertPod = db.prepare(
    `INSERT INTO pods (${COLUMNS.pods}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  insertPod.run(
    'pod-a',
    'Refactor the router',
    'C:\\work\\repo',
    'cc-session-a',
    'plan',
    '{"FOO":"bar"}',
    0,
    'running',
    '2026-08-18T09:00:01.000Z',
    '2026-08-18T09:05:00.000Z',
  );
  insertPod.run(
    'pod-b',
    "Pod with an apostrophe ' and unicode 🐋",
    'C:\\work\\other',
    null,
    'bypassPermissions',
    '{}',
    1,
    'beached',
    '2026-08-18T09:00:02.000Z',
    '2026-08-18T09:06:00.000Z',
  );

  const insertLane = db.prepare(
    `INSERT INTO lanes (${COLUMNS.lanes}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  insertLane.run(
    'lane-a',
    'pod-a',
    'matriarch',
    null,
    null,
    null,
    0,
    null,
    null,
    'running',
    '2026-08-18T09:00:03.000Z',
    null,
  );
  insertLane.run(
    'lane-a-calf',
    'pod-a',
    'calf',
    'toolu_01',
    'agent-7',
    'lane-a',
    1,
    'dir-database-engineer',
    'widen the enum',
    'done',
    '2026-08-18T09:00:04.000Z',
    '2026-08-18T09:04:00.000Z',
  );
  insertLane.run(
    'lane-b',
    'pod-b',
    'matriarch',
    null,
    null,
    null,
    0,
    null,
    null,
    'orphaned',
    '2026-08-18T09:00:05.000Z',
    '2026-08-18T09:07:00.000Z',
  );

  const insertEvent = db.prepare(
    'INSERT INTO events (pod_id, lane_id, seq, type, payload, raw, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  );
  insertEvent.run('pod-a', 'lane-a', 1, 'user_message', '{"text":"go"}', null, '2026-08-18T09:00:06.000Z');
  insertEvent.run(
    'pod-a',
    'lane-a-calf',
    2,
    'assistant_text',
    '{"text":"working"}',
    '{"raw":true}',
    '2026-08-18T09:00:07.000Z',
  );
  insertEvent.run('pod-b', 'lane-b', 1, 'error', '{"message":"boom"}', null, '2026-08-18T09:00:08.000Z');

  db.close();
  return { path, ...snapshot(path) };
}

describe('migration 2 preserves data (criterion 5)', () => {
  it('carries every pod, lane and event across the table rebuild unchanged', () => {
    const before = makeV1Database();

    // Sanity: the fixture really is a v1 database that refuses acceptEdits.
    expect(
      rawDb(before.path)
        .prepare<unknown[], { v: number }>('SELECT MAX(version) AS v FROM schema_version')
        .get()?.v,
    ).toBe(1);
    expect(before.pods).toHaveLength(2);
    expect(before.lanes).toHaveLength(3);
    expect(before.events).toHaveLength(3);

    const store = fileStore(before.path);
    store.migrate();
    store.close();

    const after = snapshot(before.path);
    expect(after.pods).toEqual(before.pods);
    expect(after.lanes).toEqual(before.lanes);
    expect(after.events).toEqual(before.events);

    expect(
      rawDb(before.path)
        .prepare<unknown[], { v: number }>('SELECT MAX(version) AS v FROM schema_version')
        .get()?.v,
    ).toBe(CURRENT_SCHEMA_VERSION);
  });

  it('leaves no orphaned rows: PRAGMA foreign_key_check is clean afterwards', () => {
    const fixture = makeV1Database();
    const store = fileStore(fixture.path);
    store.migrate();
    store.close();

    expect(rawDb(fixture.path).pragma('foreign_key_check')).toEqual([]);
  });

  it('re-arms foreign keys after the rebuild: the parent cascade still fires', () => {
    // This is the proof that suspending `PRAGMA foreign_keys` for the migration
    // transaction is temporary AND that `lanes`/`events` now reference the
    // REBUILT `pods` table rather than a dropped one. If the rename had orphaned
    // the references, deleting the parent would leave the children behind.
    const fixture = makeV1Database();
    const store = fileStore(fixture.path);
    store.migrate();

    expect(store.listLanes('pod-a')).toHaveLength(2);
    store.deletePod('pod-a');
    store.close();

    const db = rawDb(fixture.path);
    expect(db.prepare<unknown[], { n: number }>('SELECT COUNT(*) AS n FROM lanes').get()?.n).toBe(1);
    expect(db.prepare<unknown[], { n: number }>('SELECT COUNT(*) AS n FROM events').get()?.n).toBe(1);
    expect(db.prepare<unknown[], { n: number }>('SELECT COUNT(*) AS n FROM pods').get()?.n).toBe(1);
  });

  it('the migrated table takes acceptEdits and still refuses manual, which is no SDK mode', () => {
    const fixture = makeV1Database();
    const store = fileStore(fixture.path);
    store.migrate();
    store.close();

    const db = rawDb(fixture.path);
    expect(() =>
      db.prepare('UPDATE pods SET permission_mode = ? WHERE id = ?').run('acceptEdits', 'pod-a'),
    ).not.toThrow();
    expect(() =>
      db.prepare('UPDATE pods SET permission_mode = ? WHERE id = ?').run('manual', 'pod-a'),
    ).toThrowError(/CHECK constraint failed/i);
  });

  it('does not disturb the rest of the schema: only pods is rebuilt', () => {
    const fixture = makeV1Database();

    const ddl = (path: string): Record<string, string | null> =>
      Object.fromEntries(
        rawDb(path)
          .prepare<unknown[], { name: string; sql: string | null }>(
            "SELECT name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name",
          )
          .all()
          .map((r) => [r.name, r.sql]),
      );

    const before = ddl(fixture.path);
    const store = fileStore(fixture.path);
    store.migrate();
    store.close();
    const after = ddl(fixture.path);

    // Migration 5 adds the one new object: the index on pods.forked_from_pod_id.
    expect(Object.keys(after)).toEqual([...Object.keys(before), 'idx_pods_forked_from'].sort());
    for (const name of Object.keys(before)) {
      // `pods` is rebuilt by migrations 2, 3 and 6, `lanes` by migration 4. The
      // four lane indexes are dropped with the old table and recreated
      // verbatim, so their DDL text must still compare equal — which is what
      // makes leaving them out of this skip list load-bearing.
      if (name === 'pods' || name === 'lanes') continue;
      expect(after[name]).toBe(before[name]);
    }
    expect(after['pods']).not.toBe(before['pods']);
    expect(after['lanes']).not.toBe(before['lanes']);
  });
});

// ---------------------------------------------------------------------------
// Criterion 6 — migrate() is still idempotent, and still gates on version
// ---------------------------------------------------------------------------

describe('migrate() at version 2 (criterion 6)', () => {
  it('is idempotent on an already-migrated v2 file', () => {
    const fixture = makeV1Database();
    const store = fileStore(fixture.path);
    store.migrate();

    const schemaAfterFirst = rawDb(fixture.path)
      .prepare<unknown[], { name: string; sql: string | null }>(
        'SELECT name, sql FROM sqlite_master ORDER BY name',
      )
      .all();
    const dataAfterFirst = snapshot(fixture.path);

    store.migrate();
    store.migrate();
    store.close();

    expect(
      rawDb(fixture.path)
        .prepare<unknown[], { name: string; sql: string | null }>(
          'SELECT name, sql FROM sqlite_master ORDER BY name',
        )
        .all(),
    ).toEqual(schemaAfterFirst);
    expect(snapshot(fixture.path)).toEqual(dataAfterFirst);
    expect(
      rawDb(fixture.path)
        .prepare<unknown[], { versions: string }>(
          "SELECT group_concat(version, ',') AS versions FROM (SELECT version FROM schema_version ORDER BY version)",
        )
        .get()?.versions,
    ).toBe('1,2,3,4,5,6');
  });

  it('is idempotent on a fresh file migrated straight to 2', () => {
    const path = tempDbPath();
    const first = fileStore(path);
    first.migrate();
    first.migrate();
    first.close();

    const second = fileStore(path);
    second.migrate();
    expect(
      rawDb(path)
        .prepare<unknown[], { n: number }>('SELECT COUNT(*) AS n FROM schema_version')
        .get()?.n,
    ).toBe(CURRENT_SCHEMA_VERSION);
  });

  it('still throws SCHEMA_MISMATCH above CURRENT_SCHEMA_VERSION', () => {
    const path = tempDbPath();
    const first = fileStore(path);
    first.migrate();
    first.close();

    rawDb(path)
      .prepare('INSERT INTO schema_version (version, applied_at) VALUES (?, ?)')
      .run(CURRENT_SCHEMA_VERSION + 1, '2099-01-01T00:00:00.000Z');

    const second = fileStore(path);
    const err = catchStoreError(() => second.migrate());
    expect(err.code).toBe('SCHEMA_MISMATCH');
    expect(err.message).toMatch(/newer than this build/i);
  });
});
