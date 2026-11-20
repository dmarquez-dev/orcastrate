/**
 * Migration 3 — widening `pods.status` to five states by adding `'closed'`.
 *
 * Four things are load-bearing here and every one of them is asserted rather
 * than inherited from migration 2's suite:
 *
 *  1. AN ALREADY-MIGRATED DATABASE IS NOT REWRITTEN. A v2 file with real rows
 *     gains version 3 and nothing else: versions 1 and 2 keep their ORIGINAL
 *     `applied_at` stamps, which is what proves they were not re-run.
 *
 *  2. THE FOREIGN-KEY CASCADE TRAP IS CLOSED FOR MIGRATION 3. `lanes.pod_id`
 *     and `events.pod_id` are `REFERENCES pods(id) ON DELETE CASCADE`, so with
 *     FK enforcement on the `DROP TABLE pods` step would empty the store and
 *     report success. Proved with lane and event COUNTS on a real database,
 *     not with a pods-table check and an assumption about the runner.
 *
 *  3. NOTHING IS BACKFILLED. Migration 3 widens a constraint; it changes no
 *     row's status. The `'idle'` -> `'closed'` correction belongs to the boot
 *     sweep, which also orphans the lanes and writes the durable `system`
 *     event that makes the change visible in the transcript.
 *
 *  4. THE CHECK REALLY WIDENED, IN BOTH DIRECTIONS. `'closed'` is accepted and
 *     `'sunk'` is still refused. The negative half is what distinguishes a
 *     rebuilt constraint from a quietly dropped one.
 *
 * Migration 1's byte-identity tripwire lives in `migration-frozen.test.ts` and is
 * deliberately not duplicated: that file renders migration 1 from the immutable
 * shipped blob, and it passing WITH `PodStatus` widened is the evidence that
 * `MIGRATION_1_POD_STATUSES` was pinned correctly.
 */

import { afterEach, describe, expect, it } from 'vitest';

import {
  CURRENT_SCHEMA_VERSION,
  MIGRATIONS,
  SCHEMA_VERSION_DDL,
} from '../../../src/main/store/schema';
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

interface V2Fixture extends Snapshot {
  path: string;
  /** `version -> applied_at`, captured before `migrate()` runs. */
  applied: Record<number, string>;
}

/** `version -> applied_at` for every row in `schema_version`. */
function appliedStamps(path: string): Record<number, string> {
  return Object.fromEntries(
    rawDb(path)
      .prepare<unknown[], { version: number; applied_at: string }>(
        'SELECT version, applied_at FROM schema_version ORDER BY version',
      )
      .all()
      .map((r) => [r.version, r.applied_at]),
  );
}

/** The `pods` DDL text as SQLite itself records it. */
function podsDdl(path: string): string {
  const row = rawDb(path)
    .prepare<unknown[], { sql: string | null }>("SELECT sql FROM sqlite_master WHERE name = 'pods'")
    .get();
  if (row?.sql == null) throw new Error('no pods table');
  return row.sql;
}

/**
 * A database at schema version 2 exactly as the previous build left it:
 * migrations 1 and 2's own SQL, their `schema_version` rows with distinctive
 * `applied_at` stamps, and real rows in all three tables. Written through a raw
 * connection so no current-build code path can quietly fix it up — in
 * particular so `pods.status` holds the FOUR-value vocabulary a v2 database
 * really holds.
 */
function makeV2Database(): V2Fixture {
  const path = tempDbPath('v2.db');
  const db = rawDb(path);
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA_VERSION_DDL);
  db.exec(migration(1));
  db.exec(migration(2));
  const insertVersion = db.prepare('INSERT INTO schema_version (version, applied_at) VALUES (?, ?)');
  insertVersion.run(1, '2026-08-18T09:00:00.000Z');
  insertVersion.run(2, '2026-08-19T09:00:00.000Z');

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
    'beached',
    '2026-08-18T09:00:02.000Z',
    '2026-08-18T09:06:00.000Z',
  );
  insertPod.run(
    'pod-c',
    'Quiet pod',
    'C:\\work\\quiet',
    null,
    'default',
    '{}',
    2,
    'idle',
    '2026-08-18T09:00:03.000Z',
    '2026-08-18T09:06:30.000Z',
  );
  insertPod.run(
    'pod-d',
    'Awaiting a decision',
    'C:\\work\\perm',
    'cc-session-d',
    'plan',
    '{}',
    3,
    'waiting',
    '2026-08-18T09:00:04.000Z',
    '2026-08-18T09:06:40.000Z',
  );

  const insertLane = db.prepare(
    `INSERT INTO lanes (${COLUMNS.lanes}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  insertLane.run('lane-a', 'pod-a', 'matriarch', null, null, null, 0, null, null, 'running', '2026-08-18T09:00:05.000Z', null);
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
  insertLane.run('lane-b', 'pod-b', 'matriarch', null, null, null, 0, null, null, 'orphaned', '2026-08-18T09:00:07.000Z', '2026-08-18T09:07:00.000Z');
  insertLane.run('lane-c', 'pod-c', 'matriarch', null, null, null, 0, null, null, 'running', '2026-08-18T09:00:08.000Z', null);
  insertLane.run('lane-d', 'pod-d', 'matriarch', null, null, null, 0, null, null, 'running', '2026-08-18T09:00:09.000Z', null);

  const insertEvent = db.prepare(
    'INSERT INTO events (pod_id, lane_id, seq, type, payload, raw, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  );
  insertEvent.run('pod-a', 'lane-a', 1, 'user_message', '{"text":"go"}', null, '2026-08-18T09:00:10.000Z');
  insertEvent.run('pod-a', 'lane-a-calf', 2, 'assistant_text', '{"text":"working"}', '{"raw":true}', '2026-08-18T09:00:11.000Z');
  insertEvent.run('pod-b', 'lane-b', 1, 'error', '{"message":"boom"}', null, '2026-08-18T09:00:12.000Z');
  insertEvent.run('pod-c', 'lane-c', 1, 'system', '{"subtype":"init"}', null, '2026-08-18T09:00:13.000Z');
  insertEvent.run('pod-d', 'lane-d', 1, 'permission_request', '{"toolName":"Bash"}', null, '2026-08-18T09:00:14.000Z');

  db.close();
  return { path, applied: appliedStamps(path), ...snapshot(path) };
}

// ---------------------------------------------------------------------------
// The fixture is genuinely a v2 database
// ---------------------------------------------------------------------------

describe('the v2 fixture', () => {
  it('is at version 2 and refuses the fifth status, which is why migration 3 exists', () => {
    const fixture = makeV2Database();

    expect(Object.keys(fixture.applied).map(Number)).toEqual([1, 2]);
    expect(fixture.pods).toHaveLength(4);
    expect(fixture.lanes).toHaveLength(5);
    expect(fixture.events).toHaveLength(5);

    expect(() =>
      rawDb(fixture.path).prepare('UPDATE pods SET status = ? WHERE id = ?').run('closed', 'pod-c'),
    ).toThrowError(/CHECK constraint failed/i);
  });
});

// ---------------------------------------------------------------------------
// Criterion 8 — an already-migrated database is not rewritten
// ---------------------------------------------------------------------------

describe('migration 3 does not rewrite an already-migrated database', () => {
  it('appends only version 3 and leaves versions 1 and 2 with their original applied_at', () => {
    const fixture = makeV2Database();

    const store = fileStore(fixture.path);
    store.migrate();
    store.close();

    const after = appliedStamps(fixture.path);
    expect(Object.keys(after).map(Number)).toEqual([1, 2, 3, 4, 5, 6]);
    // The proof that migrations 1 and 2 were NOT re-run: re-running them would
    // insert (or replace) their schema_version rows with a fresh stamp.
    expect(after[1]).toBe(fixture.applied[1]);
    expect(after[2]).toBe(fixture.applied[2]);
    expect(after[3]).not.toBe(fixture.applied[2]);
    expect(CURRENT_SCHEMA_VERSION).toBe(6);
  });

  it('carries every pod, lane and event across the rebuild byte-identically', () => {
    const fixture = makeV2Database();

    const store = fileStore(fixture.path);
    store.migrate();
    store.close();

    const after = snapshot(fixture.path);
    expect(after.pods).toEqual(fixture.pods);
    expect(after.lanes).toEqual(fixture.lanes);
    expect(after.events).toEqual(fixture.events);
  });

  it('is idempotent: a second and third migrate() append nothing and change nothing', () => {
    const fixture = makeV2Database();
    const store = fileStore(fixture.path);
    store.migrate();

    const schemaAfterFirst = rawDb(fixture.path)
      .prepare<unknown[], { name: string; sql: string | null }>('SELECT name, sql FROM sqlite_master ORDER BY name')
      .all();
    const dataAfterFirst = snapshot(fixture.path);
    const stampsAfterFirst = appliedStamps(fixture.path);

    store.migrate();
    store.migrate();
    store.close();

    expect(
      rawDb(fixture.path)
        .prepare<unknown[], { name: string; sql: string | null }>('SELECT name, sql FROM sqlite_master ORDER BY name')
        .all(),
    ).toEqual(schemaAfterFirst);
    expect(snapshot(fixture.path)).toEqual(dataAfterFirst);
    expect(appliedStamps(fixture.path)).toEqual(stampsAfterFirst);
  });

  it('rebuilds pods and nothing else in the schema', () => {
    const fixture = makeV2Database();

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
      // `lanes` joins `pods` here: migration 4 rebuilds it. Its four indexes
      // are recreated verbatim, so they stay in the equality loop.
      if (name === 'pods' || name === 'lanes') continue;
      expect(after[name]).toBe(before[name]);
    }
    expect(after['pods']).not.toBe(before['pods']);
    expect(after['lanes']).not.toBe(before['lanes']);
  });
});

// ---------------------------------------------------------------------------
// Criterion 5 — the foreign-key cascade trap, proved for migration 3
// ---------------------------------------------------------------------------

describe('migration 3 does not cascade the store away', () => {
  it('keeps the lane and event COUNTS across DROP TABLE pods', () => {
    const fixture = makeV2Database();
    const before = rawDb(fixture.path);
    const countBefore = (table: string): number =>
      before.prepare<unknown[], { n: number }>(`SELECT COUNT(*) AS n FROM ${table}`).get()?.n ?? -1;
    const lanesBefore = countBefore('lanes');
    const eventsBefore = countBefore('events');
    const podsBefore = countBefore('pods');
    expect([podsBefore, lanesBefore, eventsBefore]).toEqual([4, 5, 5]);

    const store = fileStore(fixture.path);
    store.migrate();
    store.close();

    const db = rawDb(fixture.path);
    const countAfter = (table: string): number =>
      db.prepare<unknown[], { n: number }>(`SELECT COUNT(*) AS n FROM ${table}`).get()?.n ?? -1;
    expect(countAfter('pods')).toBe(podsBefore);
    expect(countAfter('lanes')).toBe(lanesBefore);
    expect(countAfter('events')).toBe(eventsBefore);
  });

  it('leaves no orphaned rows: PRAGMA foreign_key_check is clean afterwards', () => {
    const fixture = makeV2Database();
    const store = fileStore(fixture.path);
    store.migrate();
    store.close();

    expect(rawDb(fixture.path).pragma('foreign_key_check')).toEqual([]);
  });

  it('re-arms foreign keys: lanes and events now reference the REBUILT pods table', () => {
    // If the rename had orphaned the REFERENCES clauses, deleting the parent
    // would leave the children behind instead of cascading.
    const fixture = makeV2Database();
    const store = fileStore(fixture.path);
    store.migrate();

    expect(store.listLanes('pod-a')).toHaveLength(2);
    store.deletePod('pod-a');
    store.close();

    const db = rawDb(fixture.path);
    expect(db.prepare<unknown[], { n: number }>('SELECT COUNT(*) AS n FROM pods').get()?.n).toBe(3);
    expect(db.prepare<unknown[], { n: number }>('SELECT COUNT(*) AS n FROM lanes').get()?.n).toBe(3);
    expect(db.prepare<unknown[], { n: number }>('SELECT COUNT(*) AS n FROM events').get()?.n).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Criterion 4 — migration 3 backfills nothing
// ---------------------------------------------------------------------------

describe('migration 3 backfills nothing', () => {
  it('leaves every pod status byte-identical, including the idle ones', () => {
    const fixture = makeV2Database();
    const statuses = (path: string): Record<string, unknown> =>
      Object.fromEntries(
        rawDb(path)
          .prepare<unknown[], { id: string; status: string }>('SELECT id, status FROM pods ORDER BY id')
          .all()
          .map((r) => [r.id, r.status]),
      );

    const before = statuses(fixture.path);
    expect(before).toEqual({ 'pod-a': 'running', 'pod-b': 'beached', 'pod-c': 'idle', 'pod-d': 'waiting' });

    const store = fileStore(fixture.path);
    store.migrate();
    store.close();

    // No row is touched. The 'idle' -> 'closed' correction is the boot sweep's
    // job, because the sweep also orphans the lanes and writes the durable
    // `system` event that records the change in the transcript.
    expect(statuses(fixture.path)).toEqual(before);
  });
});

// ---------------------------------------------------------------------------
// Criterion 9 — the CHECK actually widened, in BOTH directions
// ---------------------------------------------------------------------------

describe('the widened status CHECK', () => {
  it("accepts 'closed' and still refuses a value that was never in the set", () => {
    const fixture = makeV2Database();
    const store = fileStore(fixture.path);
    store.migrate();
    store.close();

    const db = rawDb(fixture.path);
    expect(() => db.prepare('UPDATE pods SET status = ? WHERE id = ?').run('closed', 'pod-c')).not.toThrow();
    expect(db.prepare<unknown[], { status: string }>('SELECT status FROM pods WHERE id = ?').get('pod-c')?.status).toBe(
      'closed',
    );

    // The NEGATIVE half: this is what proves the constraint was REBUILT rather
    // than quietly dropped by the rename.
    expect(() => db.prepare('UPDATE pods SET status = ? WHERE id = ?').run('sunk', 'pod-c')).toThrowError(
      /CHECK constraint failed/i,
    );
  });

  it('still refuses manual, which is no SDK permission mode', () => {
    const fixture = makeV2Database();
    const store = fileStore(fixture.path);
    store.migrate();
    store.close();

    const db = rawDb(fixture.path);
    expect(() =>
      db.prepare('UPDATE pods SET permission_mode = ? WHERE id = ?').run('manual', 'pod-a'),
    ).toThrowError(/CHECK constraint failed/i);
  });

  it('a store-created Pod is born closed and survives the round trip', () => {
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

    expect(pod.status).toBe('closed');
    expect(store.getPod('pod-new')?.status).toBe('closed');
  });
});

// ---------------------------------------------------------------------------
// Criterion 10 — fresh and upgraded databases converge
// ---------------------------------------------------------------------------

describe('fresh and upgraded databases converge', () => {
  it('produces the same pods DDL whether built 1->2->3 or upgraded from v2', () => {
    // This is the assertion that catches a MIS-pinned MIGRATION_1_POD_STATUSES:
    // a wrong pin makes the two paths diverge and nothing else would notice.
    const freshPath = tempDbPath('fresh.db');
    const fresh = fileStore(freshPath);
    fresh.migrate();
    fresh.close();

    const upgradedPath = makeV2Database().path;
    const upgraded = fileStore(upgradedPath);
    upgraded.migrate();
    upgraded.close();

    expect(podsDdl(upgradedPath)).toBe(podsDdl(freshPath));
    expect(podsDdl(freshPath)).toContain("CHECK (status IN ('closed', 'idle', 'running', 'waiting', 'beached'))");
  });

  it('produces the same DDL for every other object too', () => {
    const freshPath = tempDbPath('fresh.db');
    const fresh = fileStore(freshPath);
    fresh.migrate();
    fresh.close();

    const upgradedPath = makeV2Database().path;
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
});
