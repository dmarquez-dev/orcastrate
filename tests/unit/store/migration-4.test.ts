/**
 * Migration 4 — widening `lanes.status` to four states by adding `'stopped'`.
 *
 * This is the FIRST migration to rebuild `lanes`, and it is materially harder
 * than migrations 2 and 3. Both of those rebuilt `pods`, and both docblocks say
 * steps 7 and 8 of SQLite's 12-step rebuild "reduce to nothing" because `pods`
 * carries no index of its own. That is FALSE of `lanes`, which carries four —
 * two of them UNIQUE, three of them partial. Copying migration 3's shape
 * verbatim drops all four silently and nothing else in the suite would notice.
 *
 * So every one of these is asserted against a REAL migrated database rather
 * than against migration 4's SQL string, which would only prove the string says
 * what it says:
 *
 *  1. ALL FOUR INDEXES SURVIVE, by name, by uniqueness, and by partial
 *     predicate, compared against the PRE-migration schema. `idx_lanes_tool_use`
 *     is not a performance index — migration 1's comment says a second lane
 *     claiming one `tool_use_id` is a router bug that must surface as CONFLICT
 *     rather than as a silent ambiguous lookup — so losing it turns a loud
 *     failure into a quiet one.
 *
 *  2. NO DATA IS LOST. `DROP TABLE lanes` with FK enforcement ON would cascade
 *     EVERY EVENT out of the store and report success on an emptied database.
 *     Proved with `SELECT COUNT(*)` on both sides, never with a literal, plus a
 *     clean `PRAGMA foreign_key_check`.
 *
 *  3. THE SELF-REFERENCE POINTS AT `lanes`, NOT `lanes_new`. With
 *     `PRAGMA foreign_keys` OFF — the state `SqliteEventStore.migrate()`
 *     establishes — `ALTER TABLE ... RENAME TO` does not rewrite REFERENCES
 *     clauses, which is exactly why `REFERENCES lanes(id)` is the correct text
 *     to write inside `lanes_new`. Proved by the Calf cascade still firing with
 *     foreign keys back ON.
 *
 *  4. NOTHING IS BACKFILLED. Every lane's `status` and `ended_at` are identical
 *     row by row, not merely in aggregate. Shape changes and data changes stay
 *     in separate migrations.
 *
 *  5. THE CHECK WIDENED IN BOTH DIRECTIONS, and the terminality CHECK survived:
 *     a `'stopped'` lane with a null `ended_at` is still refused.
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

interface IndexFact {
  name: string;
  unique: boolean;
  partial: boolean;
  /** The `WHERE ...` predicate as SQLite records it, or null for a full index. */
  where: string | null;
  /** The indexed column list as SQLite records it. */
  columns: string;
}

/**
 * What SQLite ITSELF says about every index on `lanes`, read out of
 * `sqlite_master` and `PRAGMA index_list`. Deliberately not parsed out of
 * migration 4's SQL string — that would prove only that the string says what
 * the string says.
 */
function laneIndexes(path: string): IndexFact[] {
  const db = rawDb(path);
  const ddl = new Map(
    db
      .prepare<unknown[], { name: string; sql: string | null }>(
        "SELECT name, sql FROM sqlite_master WHERE type = 'index' AND tbl_name = 'lanes'",
      )
      .all()
      .map((r) => [r.name, r.sql]),
  );

  return db
    .prepare<unknown[], { name: string; unique: number; partial: number; origin: string }>(
      "PRAGMA index_list('lanes')",
    )
    .all()
    // `origin === 'c'` is "created by CREATE INDEX". The implicit
    // `sqlite_autoindex_lanes_1` behind the PRIMARY KEY has no row in
    // `sqlite_master` and is covered by `laneIndexNames` instead.
    .filter((r) => r.origin === 'c')
    .map((r): IndexFact => {
      const sql = ddl.get(r.name);
      if (sql == null) throw new Error(`index ${r.name} has no DDL in sqlite_master`);
      const where = /\sWHERE\s([\s\S]+)$/i.exec(sql);
      const columns = /\(([^)]*)\)/.exec(sql);
      return {
        name: r.name,
        unique: r.unique === 1,
        partial: r.partial === 1,
        where: where?.[1]?.trim().replace(/\s+/g, ' ') ?? null,
        columns: columns?.[1]?.trim().replace(/\s+/g, ' ') ?? '',
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * EVERY index SQLite reports on `lanes`, implicit ones included — this is what
 * catches the PRIMARY KEY's autoindex disappearing as well as the four named
 * ones.
 */
function laneIndexNames(path: string): string[] {
  return rawDb(path)
    .prepare<unknown[], { name: string }>("PRAGMA index_list('lanes')")
    .all()
    .map((r) => r.name)
    .sort();
}

/** The `lanes` DDL text as SQLite itself records it. */
function lanesDdl(path: string): string {
  const row = rawDb(path)
    .prepare<unknown[], { sql: string | null }>("SELECT sql FROM sqlite_master WHERE name = 'lanes'")
    .get();
  if (row?.sql == null) throw new Error('no lanes table');
  return row.sql;
}

interface V3Fixture extends Snapshot {
  path: string;
}

/**
 * A database at schema version 3 exactly as the previous build left it:
 * migrations 1, 2 and 3's own SQL, their `schema_version` rows, TWO Pods,
 * several lanes including a Calf with a non-null `parent_lane_id`, and events on
 * EVERY lane. Written through a raw connection so no current-build code path
 * can quietly fix it up — in particular so `lanes.status` holds the
 * THREE-value vocabulary a v3 database really holds.
 */
function makeV3Database(): V3Fixture {
  const path = tempDbPath('v3.db');
  const db = rawDb(path);
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA_VERSION_DDL);
  db.exec(migration(1));
  db.exec(migration(2));
  db.exec(migration(3));
  const insertVersion = db.prepare('INSERT INTO schema_version (version, applied_at) VALUES (?, ?)');
  insertVersion.run(1, '2026-08-18T09:00:00.000Z');
  insertVersion.run(2, '2026-08-19T09:00:00.000Z');
  insertVersion.run(3, '2026-08-20T09:00:00.000Z');

  const insertPod = db.prepare(`INSERT INTO pods (${COLUMNS.pods}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  insertPod.run(
    'pod-a',
    'Refactor the router',
    'C:\\work\\repo',
    'cc-session-a',
    'acceptEdits',
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
    'closed',
    '2026-08-18T09:00:02.000Z',
    '2026-08-18T09:06:00.000Z',
  );

  const insertLane = db.prepare(
    `INSERT INTO lanes (${COLUMNS.lanes}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  // Matriarch, running, no end stamp.
  insertLane.run('lane-a', 'pod-a', 'matriarch', null, null, null, 0, null, null, 'running', '2026-08-18T09:00:05.000Z', null);
  // Calf with a NON-NULL parent_lane_id — the self-reference migration 4 must
  // carry across, and the row `idx_lanes_parent` and `idx_lanes_tool_use` cover.
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
    '2026-08-18T09:00:06.000Z',
    '2026-08-18T09:04:00.000Z',
  );
  // A second Calf under the same Matriarch, still running.
  insertLane.run(
    'lane-a-calf-2',
    'pod-a',
    'calf',
    'toolu_02',
    null,
    'lane-a',
    1,
    'dir-reviewer',
    'review the diff',
    'running',
    '2026-08-18T09:00:07.000Z',
    null,
  );
  insertLane.run('lane-b', 'pod-b', 'matriarch', null, null, null, 0, null, null, 'orphaned', '2026-08-18T09:00:08.000Z', '2026-08-18T09:07:00.000Z');

  const insertEvent = db.prepare(
    'INSERT INTO events (pod_id, lane_id, seq, type, payload, raw, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  );
  insertEvent.run('pod-a', 'lane-a', 1, 'user_message', '{"text":"go"}', null, '2026-08-18T09:00:10.000Z');
  insertEvent.run('pod-a', 'lane-a-calf', 2, 'assistant_text', '{"text":"working"}', '{"raw":true}', '2026-08-18T09:00:11.000Z');
  insertEvent.run('pod-a', 'lane-a-calf', 3, 'tool_result', '{"toolUseId":"toolu_01"}', null, '2026-08-18T09:00:12.000Z');
  insertEvent.run('pod-a', 'lane-a-calf-2', 4, 'tool_use', '{"toolUseId":"toolu_02"}', null, '2026-08-18T09:00:13.000Z');
  insertEvent.run('pod-b', 'lane-b', 1, 'error', '{"message":"boom"}', null, '2026-08-18T09:00:14.000Z');

  db.close();
  return { path, ...snapshot(path) };
}

// ---------------------------------------------------------------------------
// The fixture really is a v3 database
// ---------------------------------------------------------------------------

describe('the v3 fixture', () => {
  it("is at version 3 and refuses 'stopped', which is why migration 4 exists", () => {
    const fixture = makeV3Database();

    expect(
      rawDb(fixture.path).prepare<unknown[], { v: number }>('SELECT MAX(version) AS v FROM schema_version').get()?.v,
    ).toBe(3);
    expect(count(fixture.path, 'pods')).toBe(fixture.pods.length);
    expect(count(fixture.path, 'lanes')).toBe(fixture.lanes.length);
    expect(count(fixture.path, 'events')).toBe(fixture.events.length);

    expect(() =>
      rawDb(fixture.path)
        .prepare("UPDATE lanes SET status = ?, ended_at = '2026-08-18T09:09:00.000Z' WHERE id = ?")
        .run('stopped', 'lane-a'),
    ).toThrowError(/CHECK constraint failed/i);
  });
});

// ---------------------------------------------------------------------------
// Criterion 5 — all four indexes survive the rebuild
// ---------------------------------------------------------------------------

describe('migration 4 recreates every index on lanes', () => {
  it('keeps all four by name, uniqueness, columns and partial predicate', () => {
    const fixture = makeV3Database();
    const before = laneIndexes(fixture.path);
    const beforeNames = laneIndexNames(fixture.path);

    // The pre-migration schema really carries the four this migration is at
    // risk of dropping, two of them UNIQUE and three of them partial.
    expect(before.map((i) => i.name)).toEqual([
      'idx_lanes_matriarch',
      'idx_lanes_parent',
      'idx_lanes_pod',
      'idx_lanes_tool_use',
    ]);

    const store = fileStore(fixture.path);
    store.migrate();
    store.close();

    // Compared against the PRE-migration schema, not against a hand-written
    // expectation: a wrong expectation and a dropped index look the same.
    expect(laneIndexes(fixture.path)).toEqual(before);
    // Implicit indexes too: the PRIMARY KEY's autoindex must come back as well.
    expect(laneIndexNames(fixture.path)).toEqual(beforeNames);
  });

  it('keeps the UNIQUE ones actually enforcing uniqueness, not merely named', () => {
    const fixture = makeV3Database();
    const store = fileStore(fixture.path);
    store.migrate();
    store.close();

    const db = rawDb(fixture.path);

    // idx_lanes_tool_use: a second lane claiming one tool_use_id is a router
    // bug and must surface as CONFLICT, not as an ambiguous lookup.
    expect(() =>
      db
        .prepare(`INSERT INTO lanes (${COLUMNS.lanes}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run('lane-dupe', 'pod-a', 'calf', 'toolu_01', null, 'lane-a', 1, null, null, 'running', '2026-08-18T09:10:00.000Z', null),
    ).toThrowError(/UNIQUE constraint failed/i);

    // idx_lanes_matriarch: exactly one Matriarch per Pod.
    expect(() =>
      db
        .prepare(`INSERT INTO lanes (${COLUMNS.lanes}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run('lane-a2', 'pod-a', 'matriarch', null, null, null, 0, null, null, 'running', '2026-08-18T09:10:01.000Z', null),
    ).toThrowError(/UNIQUE constraint failed/i);
  });
});

// ---------------------------------------------------------------------------
// Criterion 6 — migration 4 loses no data
// ---------------------------------------------------------------------------

describe('migration 4 does not cascade the store away', () => {
  it('keeps the lane and event COUNTS across DROP TABLE lanes', () => {
    const fixture = makeV3Database();
    const lanesBefore = count(fixture.path, 'lanes');
    const eventsBefore = count(fixture.path, 'events');
    const podsBefore = count(fixture.path, 'pods');

    const store = fileStore(fixture.path);
    store.migrate();
    store.close();

    expect(count(fixture.path, 'lanes')).toBe(lanesBefore);
    expect(count(fixture.path, 'events')).toBe(eventsBefore);
    expect(count(fixture.path, 'pods')).toBe(podsBefore);
  });

  it('carries every lane and event row across the rebuild byte-identically', () => {
    const fixture = makeV3Database();

    const store = fileStore(fixture.path);
    store.migrate();
    store.close();

    const after = snapshot(fixture.path);
    expect(after.lanes).toEqual(fixture.lanes);
    expect(after.events).toEqual(fixture.events);
    expect(after.pods).toEqual(fixture.pods);
  });

  it('leaves no orphaned rows: PRAGMA foreign_key_check is clean afterwards', () => {
    const fixture = makeV3Database();
    const store = fileStore(fixture.path);
    store.migrate();
    store.close();

    expect(rawDb(fixture.path).pragma('foreign_key_check')).toEqual([]);
  });

  it('appends only version 4', () => {
    const fixture = makeV3Database();
    const store = fileStore(fixture.path);
    store.migrate();
    store.close();

    expect(
      rawDb(fixture.path)
        .prepare<unknown[], { versions: string }>(
          "SELECT group_concat(version, ',') AS versions FROM (SELECT version FROM schema_version ORDER BY version)",
        )
        .get()?.versions,
    ).toBe('1,2,3,4');
    expect(CURRENT_SCHEMA_VERSION).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// Criterion 7 — the self-reference points at `lanes`, not `lanes_new`
// ---------------------------------------------------------------------------

describe('the rebuilt lanes table self-references lanes', () => {
  it("records REFERENCES lanes(id) in sqlite_master and never mentions lanes_new", () => {
    const fixture = makeV3Database();
    const store = fileStore(fixture.path);
    store.migrate();
    store.close();

    const ddl = lanesDdl(fixture.path);
    expect(ddl).toContain('parent_lane_id TEXT    REFERENCES lanes(id) ON DELETE CASCADE');
    expect(ddl).not.toContain('lanes_new');
    expect(
      rawDb(fixture.path)
        .prepare<unknown[], { n: number }>("SELECT COUNT(*) AS n FROM sqlite_master WHERE name LIKE '%lanes_new%'")
        .get()?.n,
    ).toBe(0);
  });

  it('a Calf survives the migration and still cascades when its parent lane is deleted', () => {
    const fixture = makeV3Database();
    const store = fileStore(fixture.path);
    store.migrate();
    store.close();

    const db = rawDb(fixture.path); // opens with PRAGMA foreign_keys = ON
    const calvesBefore = db
      .prepare<unknown[], { n: number }>("SELECT COUNT(*) AS n FROM lanes WHERE parent_lane_id = 'lane-a'")
      .get()?.n;
    expect(calvesBefore).toBe(2);

    db.prepare('DELETE FROM lanes WHERE id = ?').run('lane-a');

    // Both Calves went with the Matriarch: the self-reference survived the
    // rename intact rather than dangling at a table that no longer exists.
    expect(count(fixture.path, 'lanes')).toBe(1);
    expect(
      db.prepare<unknown[], { n: number }>("SELECT COUNT(*) AS n FROM lanes WHERE pod_id = 'pod-a'").get()?.n,
    ).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Criterion 8 — migration 4 backfills nothing
// ---------------------------------------------------------------------------

describe('migration 4 backfills nothing', () => {
  it('leaves every lane row status and ended_at byte-identical, row by row', () => {
    const fixture = makeV3Database();

    const statuses = (path: string): Record<string, { status: string; ended_at: string | null }> =>
      Object.fromEntries(
        rawDb(path)
          .prepare<unknown[], { id: string; status: string; ended_at: string | null }>(
            'SELECT id, status, ended_at FROM lanes ORDER BY id',
          )
          .all()
          .map((r) => [r.id, { status: r.status, ended_at: r.ended_at }]),
      );

    const before = statuses(fixture.path);
    // Named row by row, not in aggregate: an aggregate that happened to match
    // would hide a swap between two rows.
    expect(before).toEqual({
      'lane-a': { status: 'running', ended_at: null },
      'lane-a-calf': { status: 'done', ended_at: '2026-08-18T09:04:00.000Z' },
      'lane-a-calf-2': { status: 'running', ended_at: null },
      'lane-b': { status: 'orphaned', ended_at: '2026-08-18T09:07:00.000Z' },
    });

    const store = fileStore(fixture.path);
    store.migrate();
    store.close();

    // Not one row is touched. Widening the constraint and changing rows are
    // separate migrations so a failure is possible to isolate; the boot sweep
    // still orphans what it orphans.
    expect(statuses(fixture.path)).toEqual(before);
  });
});

// ---------------------------------------------------------------------------
// Criterion 4 — the widened CHECK, and the terminality CHECK it carried forward
// ---------------------------------------------------------------------------

describe('the widened lane-status CHECK', () => {
  it("accepts 'stopped' with an ended_at and still refuses a value that was never in the set", () => {
    const fixture = makeV3Database();
    const store = fileStore(fixture.path);
    store.migrate();
    store.close();

    const db = rawDb(fixture.path);
    expect(() =>
      db
        .prepare("UPDATE lanes SET status = ?, ended_at = '2026-08-18T09:09:00.000Z' WHERE id = ?")
        .run('stopped', 'lane-a'),
    ).not.toThrow();
    expect(db.prepare<unknown[], { status: string }>('SELECT status FROM lanes WHERE id = ?').get('lane-a')?.status).toBe(
      'stopped',
    );

    // The NEGATIVE half: this is what proves the constraint was REBUILT rather
    // than quietly dropped by the rename.
    expect(() =>
      db
        .prepare("UPDATE lanes SET status = ?, ended_at = '2026-08-18T09:09:00.000Z' WHERE id = ?")
        .run('adrift', 'lane-a'),
    ).toThrowError(/CHECK constraint failed/i);
  });

  it("refuses a 'stopped' lane with a null ended_at: terminality survived the rebuild", () => {
    const fixture = makeV3Database();
    const store = fileStore(fixture.path);
    store.migrate();
    store.close();

    const db = rawDb(fixture.path);
    // `CHECK ((status = 'running') = (ended_at IS NULL))`. A deliberately
    // stopped lane MUST carry an end stamp, or `elapsedMsOf` falls back to
    // `nowMs` and the rail shows a duration ticking up on a dead Pod.
    expect(() =>
      db.prepare('UPDATE lanes SET status = ?, ended_at = NULL WHERE id = ?').run('stopped', 'lane-a'),
    ).toThrowError(/CHECK constraint failed/i);

    expect(() =>
      db
        .prepare(`INSERT INTO lanes (${COLUMNS.lanes}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run('lane-no-end', 'pod-b', 'calf', null, null, 'lane-b', 1, null, null, 'stopped', '2026-08-18T09:11:00.000Z', null),
    ).toThrowError(/CHECK constraint failed/i);
  });

  it('a store-created lane can be set stopped through the API and gets an end stamp', () => {
    const store = fileStore(tempDbPath('fresh.db'));
    store.migrate();
    const pod = store.createPod({
      id: 'pod-new',
      title: 'Newborn',
      cwd: 'C:\\work\\new',
      permissionMode: 'default',
      envOverrides: {},
      tabOrder: 0,
    });
    const lane = store.createLane({
      id: 'lane-new',
      podId: pod.id,
      kind: 'matriarch',
      toolUseId: null,
      agentId: null,
      parentLaneId: null,
      depth: 0,
      subagentType: null,
      description: null,
    });

    const stopped = store.setLaneStatus(lane.id, 'stopped', '2026-08-25T09:00:00.000Z');
    expect(stopped.status).toBe('stopped');
    expect(stopped.endedAt).toBe('2026-08-25T09:00:00.000Z');
    expect(store.listLanes(pod.id)[0]?.status).toBe('stopped');
  });
});

// ---------------------------------------------------------------------------
// Fresh and upgraded databases converge
// ---------------------------------------------------------------------------

describe('fresh and upgraded databases converge at version 4', () => {
  it('produces the same lanes DDL whether built 1->4 or upgraded from v3', () => {
    // This is the assertion that catches a MIS-pinned MIGRATION_1_LANE_STATUSES:
    // a wrong pin makes the two paths diverge and nothing else would notice.
    const freshPath = tempDbPath('fresh.db');
    const fresh = fileStore(freshPath);
    fresh.migrate();
    fresh.close();

    const upgradedPath = makeV3Database().path;
    const upgraded = fileStore(upgradedPath);
    upgraded.migrate();
    upgraded.close();

    expect(lanesDdl(upgradedPath)).toBe(lanesDdl(freshPath));
    expect(lanesDdl(freshPath)).toContain(
      "CHECK (status IN ('running', 'done', 'orphaned', 'stopped'))",
    );
  });

  it('produces the same DDL for every other object too, indexes included', () => {
    const freshPath = tempDbPath('fresh.db');
    const fresh = fileStore(freshPath);
    fresh.migrate();
    fresh.close();

    const upgradedPath = makeV3Database().path;
    const upgraded = fileStore(upgradedPath);
    upgraded.migrate();
    upgraded.close();

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

  it('is idempotent: a second and third migrate() change nothing', () => {
    const fixture = makeV3Database();
    const store = fileStore(fixture.path);
    store.migrate();

    const schemaAfterFirst = rawDb(fixture.path)
      .prepare<unknown[], { name: string; sql: string | null }>('SELECT name, sql FROM sqlite_master ORDER BY name')
      .all();
    const dataAfterFirst = snapshot(fixture.path);

    store.migrate();
    store.migrate();
    store.close();

    expect(
      rawDb(fixture.path)
        .prepare<unknown[], { name: string; sql: string | null }>('SELECT name, sql FROM sqlite_master ORDER BY name')
        .all(),
    ).toEqual(schemaAfterFirst);
    expect(snapshot(fixture.path)).toEqual(dataAfterFirst);
  });
});
