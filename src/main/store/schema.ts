/**
 * SQLite schema and forward-only migrations for the EventStore.
 *
 * Migration rules for this file:
 *  - Migrations are forward-only and are NEVER edited once shipped. Add a new
 *    entry to `MIGRATIONS` instead.
 *  - Every migration is reversible only by discarding the database file. There
 *    is no `down` path: the store holds derived transcript data that is rebuilt
 *    by re-running Claude Code, and a half-applied downgrade is worse than a
 *    fresh file. This is a deliberate, documented decision (spec 4.4).
 *  - `agent_id`, `parent_lane_id` and `depth` are present in migration 1 by
 *    design (spec 4.4: "Capturing it later would require a schema migration and
 *    a re-parse of stored events").
 */

import type { EventType, LaneKind, LaneStatus, PermissionMode, PodStatus } from '../../shared/contracts/events';

// ---------------------------------------------------------------------------
// Enumerations mirrored into CHECK constraints
// ---------------------------------------------------------------------------

/*
 * These arrays are the runtime half of the frozen type unions in
 * `contracts/events.ts`, which exports types only. The `satisfies` clauses plus
 * the `Exclude<>` emptiness checks below fail the build if either side drifts,
 * so an added enum member cannot silently skip its CHECK constraint.
 */

/**
 * The Pod statuses the CURRENT schema head admits. Widened to five by
 * migration 3.
 *
 * This constant tracks the contract union and therefore CHANGES over time. It
 * is NOT interpolated into any migration any more — see
 * `MIGRATION_1_POD_STATUSES` and `MIGRATION_3_POD_STATUSES`, which are pinned
 * per migration precisely so that widening this array cannot rewrite DDL that
 * has already been applied to a user's database. Migration 1 used to
 * interpolate it, which was the latent bug that widening the union exposed.
 */
export const POD_STATUSES = [
  'closed',
  'idle',
  'running',
  'waiting',
  'beached',
] as const satisfies readonly PodStatus[];
/**
 * The lane statuses the CURRENT schema head admits. Widened to four by
 * migration 4.
 *
 * This constant tracks the contract union and therefore CHANGES over time. It
 * is NOT interpolated into any migration any more — see
 * `MIGRATION_1_LANE_STATUSES` and `MIGRATION_4_LANE_STATUSES`, which are pinned
 * per migration precisely so that widening this array cannot rewrite DDL that
 * has already been applied to a user's database. Migration 1 used to
 * interpolate it, which was the latent bug that appending `'stopped'` exposed.
 */
export const LANE_STATUSES = [
  'running',
  'done',
  'orphaned',
  'stopped',
] as const satisfies readonly LaneStatus[];
export const LANE_KINDS = ['matriarch', 'calf'] as const satisfies readonly LaneKind[];
/**
 * The permission modes the CURRENT schema head admits. Widened to four by
 * migration 2.
 *
 * This constant tracks the contract union and therefore CHANGES over time. It
 * must never be interpolated into a shipped migration — see
 * `MIGRATION_1_PERMISSION_MODES` and `MIGRATION_2_PERMISSION_MODES`, which are
 * pinned per migration precisely so that widening this array cannot rewrite
 * DDL that has already been applied to a user's database.
 */
export const PERMISSION_MODES = [
  'default',
  'acceptEdits',
  'plan',
  'bypassPermissions',
] as const satisfies readonly PermissionMode[];
export const EVENT_TYPES = [
  'user_message',
  'assistant_text',
  'thinking',
  'tool_use',
  'tool_result',
  'lane_opened',
  'lane_closed',
  'permission_request',
  'permission_decision',
  'system',
  'error',
  'malformed',
] as const satisfies readonly EventType[];

// Each of these resolves to `never` while the arrays above are exhaustive.
//
// CAUTION — THIS BLOCK IS WEAKER THAN IT LOOKS AND MUST NOT BE CITED AS
// PROTECTION. `_exhaustive` is initialised with empty array literals, and an
// empty array literal is assignable to ANY array type. So a union that gains a
// member one of these arrays lacks does NOT break the build here. What this
// block still catches is the other direction: a BOGUS member in one of the
// arrays, rejected by the `satisfies` clauses above. The real tripwires for a
// missing member are the schema-head guards below (`_UncoveredAtSchemaHead`,
// `_PodStatusCoveredAtSchemaHead`, `_LaneStatusCoveredAtSchemaHead`), which
// assert `never` through a generic CONSTRAINT rather than through an empty
// array literal, plus the tests in `tests/unit/store/`.
type _UncoveredPodStatus = Exclude<PodStatus, (typeof POD_STATUSES)[number]>;
type _UncoveredLaneStatus = Exclude<LaneStatus, (typeof LANE_STATUSES)[number]>;
type _UncoveredLaneKind = Exclude<LaneKind, (typeof LANE_KINDS)[number]>;
type _UncoveredPermissionMode = Exclude<PermissionMode, (typeof PERMISSION_MODES)[number]>;
type _UncoveredEventType = Exclude<EventType, (typeof EVENT_TYPES)[number]>;

const _exhaustive: [
  _UncoveredPodStatus[],
  _UncoveredLaneStatus[],
  _UncoveredLaneKind[],
  _UncoveredPermissionMode[],
  _UncoveredEventType[],
] = [[], [], [], [], []];
void _exhaustive;

/** Renders `('a','b')` for use inside a CHECK ... IN (...) clause. */
export function sqlIn(values: readonly string[]): string {
  return `(${values.map((v) => `'${v}'`).join(', ')})`;
}

// ---------------------------------------------------------------------------
// Per-migration permission-mode lists (pinned, never derived)
// ---------------------------------------------------------------------------

/**
 * FROZEN. The exact permission-mode list migration 1 shipped with, in the exact
 * order it shipped in.
 *
 * Migration 1 originally interpolated `PERMISSION_MODES`. That was a latent
 * bug: widening the union would have silently rewritten DDL already applied to
 * user databases, which the `MIGRATIONS` docblock below forbids. Pinning the
 * literal is the fix. NEVER edit this array — a change to the exposed mode set
 * is a NEW migration.
 *
 * `tests/unit/store/schema.test.ts` asserts migration 1's rendered SQL is
 * byte-identical to the text in `git show main:src/main/store/schema.ts`.
 */
const MIGRATION_1_PERMISSION_MODES = ['default', 'plan', 'bypassPermissions'] as const;

/**
 * FROZEN. The exact pod-status list migration 1 shipped with, in the exact
 * order it shipped in.
 *
 * Identical story to `MIGRATION_1_PERMISSION_MODES` above, one enum later.
 * Migration 1 interpolated the live `POD_STATUSES`, which was harmless only
 * for as long as nobody widened the union. Adding `'closed'` would have
 * rewritten migration 1's TEXT for every future fresh database while leaving
 * every already-migrated database on the old text — two structurally different
 * v1 schemas both claiming `schema_version = 1`. Pinning the literal is the
 * fix. NEVER edit this array — a change to the status set is a NEW migration
 * (see `MIGRATION_3_POD_STATUSES`).
 *
 * It deliberately carries NO `satisfies readonly PodStatus[]` clause: the
 * whole point is that it must NOT track the contract union.
 * `MIGRATION_1_PERMISSION_MODES` is bare for the same reason.
 *
 * `tests/unit/store/migration-frozen.test.ts` asserts migration 1's rendered SQL is
 * byte-identical to the text of the immutable blob that shipped it, which is
 * what proves this pin is correct.
 */
const MIGRATION_1_POD_STATUSES = ['idle', 'running', 'waiting', 'beached'] as const;

/**
 * FROZEN. The exact lane-status list migration 1 shipped with, in the exact
 * order it shipped in.
 *
 * The third instance of the same story, one enum later. Migration 1
 * interpolated the live `LANE_STATUSES`, which was harmless only for as long as
 * nobody widened the union. Appending `'stopped'` rewrote migration 1's TEXT
 * for every future FRESH database while leaving every already-migrated database
 * on the old text — two structurally different v1 schemas both claiming
 * `schema_version = 1`. Pinning the literal is the fix. NEVER edit this array —
 * a change to the status set is a NEW migration (see
 * `MIGRATION_4_LANE_STATUSES`).
 *
 * It deliberately carries NO `satisfies readonly LaneStatus[]` clause: the
 * whole point is that it must NOT track the contract union.
 * `MIGRATION_1_PERMISSION_MODES` and `MIGRATION_1_POD_STATUSES` are bare for
 * the same reason.
 *
 * `tests/unit/store/migration-frozen.test.ts` asserts migration 1's rendered
 * SQL is byte-identical to the text of the immutable blob that shipped it,
 * which is what proves this pin is correct. That test was seen FAILING on this
 * exact clause before the pin landed.
 *
 * `LANE_KINDS` and `EVENT_TYPES` were left interpolated into migration 1 by
 * that change, deliberately, so that a byte-identity failure would stay
 * attributable to one pin at a time. They carried the identical latent bug and
 * are now pinned too: see `MIGRATION_1_LANE_KINDS` and
 * `MIGRATION_1_EVENT_TYPES` below.
 */
const MIGRATION_1_LANE_STATUSES = ['running', 'done', 'orphaned'] as const;

/**
 * FROZEN. The exact lane-kind list migration 1 shipped with, in the exact order
 * it shipped in.
 *
 * The fourth instance of the same story. Migration 1 interpolated the live
 * `LANE_KINDS`, so appending a kind would have rewritten migration 1's TEXT for
 * every future fresh database while leaving every already-migrated database on
 * the old text. Pinning the literal is the fix. NEVER edit this array — a
 * change to the kind set is a NEW migration (migration 4 already writes its own
 * lane-kind list out literally).
 *
 * Bare `as const`, with NO `satisfies readonly LaneKind[]` clause, for the
 * reason `MIGRATION_1_POD_STATUSES` gives: it must NOT track the contract
 * union.
 *
 * `tests/unit/store/migration-frozen.test.ts` asserts migration 1's rendered
 * SQL is byte-identical to the shipped blob. That test was seen FAILING with
 * `'whale'` appended to the live `LANE_KINDS` before this pin landed, and
 * passing with it after.
 */
const MIGRATION_1_LANE_KINDS = ['matriarch', 'calf'] as const;

/**
 * FROZEN. The exact event-type list migration 1 shipped with, in the exact
 * order it shipped in.
 *
 * Same story as `MIGRATION_1_LANE_KINDS`, for `events.type`. Migration 1
 * interpolated the live `EVENT_TYPES`; it now interpolates this pin. NEVER
 * edit this array — a thirteenth event type the store must persist is a NEW
 * migration that rebuilds `events`.
 *
 * Bare `as const`, with NO `satisfies readonly EventType[]` clause, for the
 * same reason as the other migration-1 pins.
 *
 * `tests/unit/store/migration-frozen.test.ts` was seen FAILING with
 * `'whale_song'` appended to the live `EVENT_TYPES` before this pin landed,
 * and passing with it after.
 */
const MIGRATION_1_EVENT_TYPES = [
  'user_message',
  'assistant_text',
  'thinking',
  'tool_use',
  'tool_result',
  'lane_opened',
  'lane_closed',
  'permission_request',
  'permission_decision',
  'system',
  'error',
  'malformed',
] as const;

/**
 * FROZEN once shipped. The permission-mode list migration 2 widens the CHECK
 * constraint to. Same rule as above: a new mode is a new migration, not an
 * edit here.
 *
 * This is NOT the permission-mode schema head any more: migration 3 rebuilt
 * `pods` with `MIGRATION_3_PERMISSION_MODES`, and `_UncoveredAtSchemaHead`
 * below is keyed to that list, not to this one.
 */
const MIGRATION_2_PERMISSION_MODES = [
  'default',
  'acceptEdits',
  'plan',
  'bypassPermissions',
] as const satisfies readonly PermissionMode[];

/**
 * FROZEN once shipped. The permission-mode list migration 3 rebuilds the
 * `pods` table with.
 *
 * It repeats migration 2's four modes VERBATIM and deliberately does NOT reuse
 * `MIGRATION_2_PERMISSION_MODES`. Sharing that constant would recreate exactly
 * the coupling the per-migration pinning exists to break: a fifth mode belongs
 * in migration 4, and migration 2's list must keep rendering what migration 2
 * shipped whatever migration 3 does.
 */
const MIGRATION_3_PERMISSION_MODES = [
  'default',
  'acceptEdits',
  'plan',
  'bypassPermissions',
] as const satisfies readonly PermissionMode[];

/**
 * FROZEN once shipped. The pod-status list migration 3 rebuilds the `pods`
 * table with — the four migrations 1 and 2 shipped, plus `'closed'`.
 *
 * Unlike `MIGRATION_1_POD_STATUSES` this one DOES carry
 * `satisfies readonly PodStatus[]`, because it is the SCHEMA HEAD and must
 * stay exhaustive over the contract union. `_PodStatusCoveredAtSchemaHead`
 * below is what enforces that. A sixth status is migration 4, not an edit
 * here.
 */
const MIGRATION_3_POD_STATUSES = [
  'closed',
  'idle',
  'running',
  'waiting',
  'beached',
] as const satisfies readonly PodStatus[];

/**
 * Fails the build unless `T` is `never`.
 *
 * The schema-head guards below route their `Exclude` through this generic
 * CONSTRAINT rather than assigning `[]` to an `Uncovered[]`. An empty array
 * literal is assignable to any array type, so the array form never fails when
 * the union gains an uncovered member; a non-`never` type ARGUMENT is rejected
 * at the type level with no value to be vacuously empty.
 */
type _AssertNever<T extends never> = T;

/**
 * Resolves to `never` while the permission-mode schema head — migration 3,
 * which rebuilt `pods` with `MIGRATION_3_PERMISSION_MODES` — still covers every
 * member of the contract union. A fifth `PermissionMode` breaks the build HERE
 * and demands a new migration that rebuilds `pods`; do not edit
 * `MIGRATION_3_PERMISSION_MODES`.
 *
 * HISTORY. This guard was once `Exclude<...>` keyed to migration 2's list and
 * enforced by `const x: _UncoveredAtSchemaHead[] = []` alone, which is the
 * vacuous empty-array form described on `_AssertNever`: a fifth mode did NOT
 * fail it. It was re-keyed to migration 3 and routed through `_AssertNever`.
 * Verified by experiment — a temporary `| 'dontAsk'` on the contract's
 * `PermissionMode` fails `typecheck:node` with TS2344 AT THIS DECLARATION, and
 * at the old spelling raised no error in this file at all.
 */
type _UncoveredAtSchemaHead = _AssertNever<
  Exclude<PermissionMode, (typeof MIGRATION_3_PERMISSION_MODES)[number]>
>;
const _schemaHeadExhaustive: _UncoveredAtSchemaHead[] = [];
void _schemaHeadExhaustive;

/**
 * The same guard for pod status, against migration 3's pinned list, so that a
 * SIXTH `PodStatus` breaks the BUILD here and demands migration 4 rather than
 * failing as a `CHECK constraint failed` on a user's machine. SQLite's CHECK
 * is the only runtime enforcement of the status set in the entire product
 * (`rows.ts` casts `row.status as PodStatus` unchecked), so this is the last
 * line of defence before shipping.
 */
type _PodStatusCoveredAtSchemaHead = _AssertNever<
  Exclude<PodStatus, (typeof MIGRATION_3_POD_STATUSES)[number]>
>;
const _podStatusSchemaHead: _PodStatusCoveredAtSchemaHead[] = [];
void _podStatusSchemaHead;

/**
 * FROZEN once shipped. The lane-status list migration 4 rebuilds the `lanes`
 * table with — the three migration 1 shipped, plus `'stopped'`.
 *
 * Unlike `MIGRATION_1_LANE_STATUSES` this one DOES carry
 * `satisfies readonly LaneStatus[]`, because it is the SCHEMA HEAD and must
 * stay exhaustive over the contract union. `_LaneStatusCoveredAtSchemaHead`
 * below is what enforces that. A fifth status is migration 5, not an edit here.
 */
const MIGRATION_4_LANE_STATUSES = [
  'running',
  'done',
  'orphaned',
  'stopped',
] as const satisfies readonly LaneStatus[];

/**
 * The same guard for lane status, against migration 4's pinned list, so that a
 * FIFTH `LaneStatus` breaks the BUILD here and demands migration 5 rather than
 * failing as a `CHECK constraint failed` on a user's machine. SQLite's CHECK is
 * the only runtime enforcement of the lane-status set in the entire product
 * (`rows.ts` casts `row.status as LaneStatus` unchecked), so this is the last
 * line of defence before shipping.
 *
 * It uses the `_AssertNever<T extends never>` spelling, NOT a bare empty-array
 * assignment, for the reason `_AssertNever`'s docblock gives. This one was
 * verified by experiment — a temporary fifth `LaneStatus` member fails
 * `typecheck:node` AT THIS LINE.
 */
type _LaneStatusCoveredAtSchemaHead = _AssertNever<
  Exclude<LaneStatus, (typeof MIGRATION_4_LANE_STATUSES)[number]>
>;
const _laneStatusSchemaHead: _LaneStatusCoveredAtSchemaHead[] = [];
void _laneStatusSchemaHead;

// ---------------------------------------------------------------------------
// Migrations
// ---------------------------------------------------------------------------

export interface Migration {
  readonly version: number;
  readonly sql: string;
}

const MIGRATION_1 = `
CREATE TABLE pods (
  id              TEXT    PRIMARY KEY,
  title           TEXT    NOT NULL,
  cwd             TEXT    NOT NULL,
  cc_session_id   TEXT,
  permission_mode TEXT    NOT NULL CHECK (permission_mode IN ${sqlIn(MIGRATION_1_PERMISSION_MODES)}),
  env_overrides   TEXT    NOT NULL DEFAULT '{}',
  tab_order       INTEGER NOT NULL,
  status          TEXT    NOT NULL CHECK (status IN ${sqlIn(MIGRATION_1_POD_STATUSES)}),
  created_at      TEXT    NOT NULL,
  last_active_at  TEXT    NOT NULL
) STRICT;

CREATE TABLE lanes (
  id             TEXT    PRIMARY KEY,
  pod_id         TEXT    NOT NULL REFERENCES pods(id) ON DELETE CASCADE,
  kind           TEXT    NOT NULL CHECK (kind IN ${sqlIn(MIGRATION_1_LANE_KINDS)}),
  tool_use_id    TEXT,
  agent_id       TEXT,
  parent_lane_id TEXT    REFERENCES lanes(id) ON DELETE CASCADE,
  depth          INTEGER NOT NULL CHECK (depth >= 0),
  subagent_type  TEXT,
  description    TEXT,
  status         TEXT    NOT NULL CHECK (status IN ${sqlIn(MIGRATION_1_LANE_STATUSES)}),
  started_at     TEXT    NOT NULL,
  ended_at       TEXT,
  -- A terminal lane always carries an end stamp; a running lane never does.
  CHECK ((status = 'running') = (ended_at IS NULL))
) STRICT;

-- listLanes(): Matriarch first, then Calves by started_at.
CREATE INDEX idx_lanes_pod ON lanes (pod_id, started_at);

-- getLaneByToolUseId(): the hot path for spec 4.3 routing. UNIQUE because one
-- Task dispatch opens exactly one Calf; a second lane claiming the same
-- correlation id is a router bug and must surface as CONFLICT, not as a silent
-- ambiguous lookup.
CREATE UNIQUE INDEX idx_lanes_tool_use ON lanes (pod_id, tool_use_id)
  WHERE tool_use_id IS NOT NULL;

-- getMatriarchLane(): exactly one Matriarch per Pod.
CREATE UNIQUE INDEX idx_lanes_matriarch ON lanes (pod_id) WHERE kind = 'matriarch';

CREATE INDEX idx_lanes_parent ON lanes (parent_lane_id) WHERE parent_lane_id IS NOT NULL;

CREATE TABLE events (
  -- Plain rowid alias, deliberately not AUTOINCREMENT: AUTOINCREMENT would add
  -- an internal sqlite_sequence table, and the contract's SCHEMA_TABLES is the
  -- exact set of tables this schema is allowed to create. Ordering is carried
  -- by the seq column, not by id.
  id         INTEGER PRIMARY KEY,
  pod_id     TEXT    NOT NULL REFERENCES pods(id) ON DELETE CASCADE,
  lane_id    TEXT    NOT NULL REFERENCES lanes(id) ON DELETE CASCADE,
  seq        INTEGER NOT NULL CHECK (seq > 0),
  type       TEXT    NOT NULL CHECK (type IN ${sqlIn(MIGRATION_1_EVENT_TYPES)}),
  payload    TEXT    NOT NULL,
  raw        TEXT,
  created_at TEXT    NOT NULL,
  -- Enforces the gap-free per-Pod sequence at the database level and doubles as
  -- the covering index for readEvents(podId, afterSeq) ordered by seq.
  UNIQUE (pod_id, seq)
) STRICT;

CREATE INDEX idx_events_lane_seq ON events (lane_id, seq);
`;

/**
 * Migration 2 — widen `pods.permission_mode` from three modes to four by adding
 * `acceptEdits`.
 *
 * WHY A TABLE REBUILD. SQLite has no `ALTER TABLE ... ALTER CONSTRAINT`; a
 * CHECK constraint can only be changed by the 12-step rebuild the SQLite docs
 * prescribe (create new, copy, drop old, rename). `pods` carries no indexes and
 * no triggers of its own, so steps 7 and 8 of that procedure reduce to nothing:
 * every index in the schema hangs off `lanes` or `events`, which this migration
 * does not touch.
 *
 * WHY FOREIGN KEYS MUST BE OFF AROUND IT. `lanes.pod_id` and `events.pod_id`
 * are `REFERENCES pods(id) ON DELETE CASCADE`. With `PRAGMA foreign_keys = ON`
 * — which `SqliteEventStore`'s constructor sets — `DROP TABLE pods` would
 * cascade every lane and every event out of the database and the migration
 * would report success on an emptied store. `SqliteEventStore.migrate()`
 * therefore suspends FK enforcement for the migration transaction and runs
 * `PRAGMA foreign_key_check` before committing. With FK enforcement off the
 * rename also leaves the `REFERENCES pods` clauses in `lanes` and `events`
 * untouched, which is what re-points them at the rebuilt table.
 *
 * NOT REVERSIBLE. Consistent with the file docblock, there is no `down` path.
 * A downgrade discards the database file. A row already carrying `acceptEdits`
 * could not satisfy migration 1's constraint anyway.
 *
 * The mode list is PINNED, not derived from `PERMISSION_MODES`: the moment a
 * fifth mode is exposed, this SQL must keep rendering the four it shipped with.
 * The `status` CHECK is written out literally for the same reason.
 */
const MIGRATION_2 = `
CREATE TABLE pods_new (
  id              TEXT    PRIMARY KEY,
  title           TEXT    NOT NULL,
  cwd             TEXT    NOT NULL,
  cc_session_id   TEXT,
  permission_mode TEXT    NOT NULL CHECK (permission_mode IN ${sqlIn(MIGRATION_2_PERMISSION_MODES)}),
  env_overrides   TEXT    NOT NULL DEFAULT '{}',
  tab_order       INTEGER NOT NULL,
  status          TEXT    NOT NULL CHECK (status IN ('idle', 'running', 'waiting', 'beached')),
  created_at      TEXT    NOT NULL,
  last_active_at  TEXT    NOT NULL
) STRICT;

INSERT INTO pods_new (id, title, cwd, cc_session_id, permission_mode, env_overrides,
                      tab_order, status, created_at, last_active_at)
  SELECT id, title, cwd, cc_session_id, permission_mode, env_overrides,
         tab_order, status, created_at, last_active_at
  FROM pods;

DROP TABLE pods;

ALTER TABLE pods_new RENAME TO pods;
`;

/**
 * Migration 3 — widen `pods.status` from four states to five by adding
 * `'closed'`.
 *
 * WHY THE STATUS SET GREW. `'idle'` meant two different things: main holds a
 * live runner and it is between turns, AND main holds no runner at all. The
 * second meaning is now `'closed'`, so `status` alone answers "is this Pod
 * open". A Pod that has never been opened is born `'closed'`, `closePod`
 * writes `'closed'`, and the boot sweep converges every non-`'beached'` Pod to
 * `'closed'`.
 *
 * WHY A TABLE REBUILD, again. Identical to migration 2 and for the identical
 * reason: SQLite has no `ALTER TABLE ... ALTER CONSTRAINT`, so a CHECK can
 * only be changed by the 12-step rebuild the SQLite docs prescribe (create
 * new, copy, drop old, rename). `pods` still carries no indexes and no
 * triggers of its own — every index in the schema hangs off `lanes` or
 * `events` — so steps 7 and 8 of that procedure reduce to nothing.
 *
 * THE FOREIGN-KEY TRAP APPLIES AGAIN AND IT IS THE ONE WAY TO LOSE DATA HERE.
 * `lanes.pod_id` and `events.pod_id` are `REFERENCES pods(id) ON DELETE
 * CASCADE`. With `PRAGMA foreign_keys = ON` — which `SqliteEventStore`'s
 * constructor sets — `DROP TABLE pods` would cascade every lane and every
 * event out of the database and this migration would report SUCCESS on an
 * emptied store. `SqliteEventStore.migrate()` suspends FK enforcement for the
 * migration transaction and runs `PRAGMA foreign_key_check` before committing,
 * so migration 3 inherits migration 2's protection — but
 * `tests/unit/store/migration-3.test.ts` PROVES it for migration 3 with lane
 * and event counts rather than inheriting the assumption, because "the runner
 * already handles it" is exactly the assumption that loses a user's
 * transcripts.
 *
 * IT BACKFILLS NOTHING. This migration widens the constraint and changes no
 * row's status; every existing row keeps the value it had. The
 * `'idle'` -> `'closed'` correction is the BOOT SWEEP's job, which runs moments
 * later in the same startup. That division is deliberate: the sweep also
 * orphans the lanes and writes a durable `system` event naming what changed,
 * and doing half the state change in silent SQL would leave rows that changed
 * with no transcript record.
 *
 * NOT REVERSIBLE. Consistent with the file docblock, there is no `down` path;
 * a downgrade discards the database file. A row already carrying `'closed'`
 * could not satisfy migration 2's constraint anyway.
 *
 * Both constraint lists are PINNED per migration, not derived from the live
 * `POD_STATUSES` / `PERMISSION_MODES`: the moment a sixth status or a fifth
 * mode is exposed, this SQL must keep rendering what it shipped with.
 */
const MIGRATION_3 = `
CREATE TABLE pods_new (
  id              TEXT    PRIMARY KEY,
  title           TEXT    NOT NULL,
  cwd             TEXT    NOT NULL,
  cc_session_id   TEXT,
  permission_mode TEXT    NOT NULL CHECK (permission_mode IN ${sqlIn(MIGRATION_3_PERMISSION_MODES)}),
  env_overrides   TEXT    NOT NULL DEFAULT '{}',
  tab_order       INTEGER NOT NULL,
  status          TEXT    NOT NULL CHECK (status IN ${sqlIn(MIGRATION_3_POD_STATUSES)}),
  created_at      TEXT    NOT NULL,
  last_active_at  TEXT    NOT NULL
) STRICT;

INSERT INTO pods_new (id, title, cwd, cc_session_id, permission_mode, env_overrides,
                      tab_order, status, created_at, last_active_at)
  SELECT id, title, cwd, cc_session_id, permission_mode, env_overrides,
         tab_order, status, created_at, last_active_at
  FROM pods;

DROP TABLE pods;

ALTER TABLE pods_new RENAME TO pods;
`;

/**
 * Migration 4 — widen `lanes.status` from three states to four by adding
 * `'stopped'`.
 *
 * WHY THE STATUS SET GREW. Neither existing terminal state is true of a lane
 * whose Pod the user stopped on purpose: `'done'` asserts the lane finished ITS
 * OWN work and returned a `tool_result`, and `'orphaned'` asserts the lane was
 * FOUND open with no runner — a recovery state that owes the user an
 * explanation. Closing a Pod is neither. Without a fourth member `closePod`
 * left the Matriarch lane `'running'` with a null `ended_at`, and the rail kept
 * showing a duration ticking up on a Pod that has no process.
 *
 * WHY A TABLE REBUILD, again. SQLite has no `ALTER TABLE ... ALTER CONSTRAINT`;
 * a CHECK can only be changed by the 12-step rebuild the SQLite docs prescribe
 * (create new, copy, drop old, rename).
 *
 * WHERE THIS DIFFERS FROM MIGRATIONS 2 AND 3, AND IT IS NOT A DETAIL. Both of
 * those rebuilt `pods`, and both docblocks say steps 7 and 8 of the rebuild
 * "reduce to nothing" because `pods` carries no index and no trigger of its
 * own. THAT IS FALSE OF `lanes`. Every index in the schema hangs off `lanes` or
 * `events`, and `DROP TABLE lanes` takes four of them with it. They are
 * recreated below on the renamed table with identical names and definitions:
 *
 *   idx_lanes_pod        (pod_id, started_at)
 *   idx_lanes_tool_use   UNIQUE (pod_id, tool_use_id) WHERE tool_use_id IS NOT NULL
 *   idx_lanes_matriarch  UNIQUE (pod_id) WHERE kind = 'matriarch'
 *   idx_lanes_parent     (parent_lane_id) WHERE parent_lane_id IS NOT NULL
 *
 * `idx_lanes_tool_use` is not a performance index. Migration 1's own comment
 * says a second lane claiming one `tool_use_id` is a router bug that must
 * surface as CONFLICT rather than as a silent ambiguous lookup; dropping it
 * turns a loud failure into a quiet one. `tests/unit/store/migration-4.test.ts`
 * compares name, uniqueness and partial predicate out of `sqlite_master` on a
 * real migrated database, not out of this string.
 *
 * THE SELF-REFERENCE. `parent_lane_id` is `REFERENCES lanes(id) ON DELETE
 * CASCADE` — the name the table will have AFTER the rename, NOT `lanes_new`.
 * With `PRAGMA foreign_keys` OFF, which is the state
 * `SqliteEventStore.migrate()` establishes, `ALTER TABLE ... RENAME TO` does
 * not rewrite REFERENCES clauses; that is the same property migrations 2 and 3
 * rely on to keep `lanes.pod_id` and `events.pod_id` pointing at the rebuilt
 * `pods`. It is what makes `REFERENCES lanes(id)` correct here and
 * `REFERENCES lanes_new(id)` a permanently dangling reference.
 *
 * THE INBOUND REFERENCE, WHICH IS THE ONE WAY TO LOSE DATA HERE.
 * `events.lane_id` is `REFERENCES lanes(id) ON DELETE CASCADE`. With FK
 * enforcement ON, `DROP TABLE lanes` would cascade EVERY EVENT out of the
 * database and this migration would report SUCCESS on an emptied store.
 * `SqliteEventStore.migrate()` suspends FK enforcement for the migration
 * transaction and runs `PRAGMA foreign_key_check` before committing, so
 * migration 4 inherits that protection — but the test suite PROVES it with row
 * counts rather than inheriting the assumption, because "the runner already
 * handles it" is exactly the assumption that loses a user's transcripts.
 *
 * THE TERMINALITY CHECK IS CARRIED FORWARD VERBATIM.
 * `CHECK ((status = 'running') = (ended_at IS NULL))` means a `'stopped'` row
 * MUST arrive with a non-null `ended_at` or the write fails as a CHECK
 * violation. `setLaneStatus` already stamps `endedAt ?? now()` for any status
 * other than `'running'`, so it needs no change.
 *
 * IT BACKFILLS NOTHING. This migration widens a constraint and changes no row's
 * status or `ended_at`; every existing lane keeps the values it had, and the
 * boot sweep still orphans what it orphans. Shape changes and data changes stay
 * in separate migrations so a failure is possible to isolate.
 *
 * NOT REVERSIBLE. Consistent with the file docblock, there is no `down` path; a
 * downgrade discards the database file. A row already carrying `'stopped'`
 * could not satisfy migration 1's constraint anyway.
 *
 * The lane-kind list is written out LITERALLY rather than interpolating the
 * live `LANE_KINDS`, exactly as migration 2 wrote out its `status` CHECK: this
 * SQL must keep rendering what it shipped with whatever the live constant does
 * later.
 */
const MIGRATION_4 = `
CREATE TABLE lanes_new (
  id             TEXT    PRIMARY KEY,
  pod_id         TEXT    NOT NULL REFERENCES pods(id) ON DELETE CASCADE,
  kind           TEXT    NOT NULL CHECK (kind IN ('matriarch', 'calf')),
  tool_use_id    TEXT,
  agent_id       TEXT,
  parent_lane_id TEXT    REFERENCES lanes(id) ON DELETE CASCADE,
  depth          INTEGER NOT NULL CHECK (depth >= 0),
  subagent_type  TEXT,
  description    TEXT,
  status         TEXT    NOT NULL CHECK (status IN ${sqlIn(MIGRATION_4_LANE_STATUSES)}),
  started_at     TEXT    NOT NULL,
  ended_at       TEXT,
  -- A terminal lane always carries an end stamp; a running lane never does.
  CHECK ((status = 'running') = (ended_at IS NULL))
) STRICT;

INSERT INTO lanes_new (id, pod_id, kind, tool_use_id, agent_id, parent_lane_id, depth,
                       subagent_type, description, status, started_at, ended_at)
  SELECT id, pod_id, kind, tool_use_id, agent_id, parent_lane_id, depth,
         subagent_type, description, status, started_at, ended_at
  FROM lanes;

DROP TABLE lanes;

ALTER TABLE lanes_new RENAME TO lanes;

-- Steps 7-8 of the rebuild, which did NOT reduce to nothing this time: all four
-- indexes went with DROP TABLE lanes and are restored here verbatim.

-- listLanes(): Matriarch first, then Calves by started_at.
CREATE INDEX idx_lanes_pod ON lanes (pod_id, started_at);

-- getLaneByToolUseId(): the hot path for spec 4.3 routing. UNIQUE because one
-- Task dispatch opens exactly one Calf; a second lane claiming the same
-- correlation id is a router bug and must surface as CONFLICT, not as a silent
-- ambiguous lookup.
CREATE UNIQUE INDEX idx_lanes_tool_use ON lanes (pod_id, tool_use_id)
  WHERE tool_use_id IS NOT NULL;

-- getMatriarchLane(): exactly one Matriarch per Pod.
CREATE UNIQUE INDEX idx_lanes_matriarch ON lanes (pod_id) WHERE kind = 'matriarch';

CREATE INDEX idx_lanes_parent ON lanes (parent_lane_id) WHERE parent_lane_id IS NOT NULL;
`;

/**
 * Migration 5 — Pod ancestry: add `pods.forked_from_pod_id` and
 * `pods.forked_from_cc_session_id`.
 *
 * WHAT THEY MEAN. `forked_from_pod_id` names the Pod this one was forked from;
 * `forked_from_cc_session_id` names the Claude Code session that was forked to
 * make it. Both are NULL for a Pod that was never forked, which is every Pod
 * that exists when this migration runs. Deleting the parent sets
 * `forked_from_pod_id` to NULL (`ON DELETE SET NULL`) and leaves
 * `forked_from_cc_session_id` alone, so a fork whose parent is gone is still
 * distinguishable from a Pod that was never forked.
 *
 * WHY ADD COLUMN AND NOT A REBUILD. Migrations 2 and 3 rebuilt `pods` because a
 * CHECK cannot be altered in place. Adding a nullable column can: SQLite's
 * `ALTER TABLE ... ADD COLUMN` accepts a `REFERENCES` clause on a column whose
 * default is NULL, and it touches no existing row. The foreign key is named
 * with an explicit `CONSTRAINT` so a failure message identifies it.
 *
 * `pods` NOW CARRIES AN INDEX OF ITS OWN. The docblocks of migrations 2 and 3
 * say `pods` carries no index, so steps 7 and 8 of SQLite's 12-step rebuild
 * reduce to nothing for it. THAT STOPS BEING TRUE HERE. `idx_pods_forked_from`
 * below hangs off `pods`, so any FUTURE migration that rebuilds `pods` (create
 * new, copy, drop old, rename) drops it with the old table and MUST recreate
 * it, exactly as migration 4 recreates the four `lanes` indexes. The rebuild
 * must also carry both ancestry columns and the named self-referencing foreign
 * key across.
 *
 * WHY THE INDEX. Every foreign key is indexed. The query it serves exists: on
 * `DELETE FROM pods`, SQLite's `ON DELETE SET NULL` action looks up the child
 * rows `WHERE forked_from_pod_id = ?`, which without an index is a full scan of
 * `pods` on every Pod deletion. It is partial (`IS NOT NULL`) on the precedent
 * of `idx_lanes_parent`: the overwhelming majority of Pods were never forked,
 * and an equality lookup implies the predicate, so the planner can still use it.
 *
 * IT BACKFILLS NOTHING. No `INSERT`, `UPDATE` or `DELETE`: every existing row
 * keeps every value it had and reads NULL in both new columns. Shape changes
 * and data changes stay in separate migrations so a failure is possible to
 * isolate.
 *
 * NOT REVERSIBLE. Consistent with the file docblock, there is no `down` path; a
 * downgrade discards the database file. Dropping the columns again would need
 * a `pods` rebuild that throws away every fork's ancestry, and once a fork
 * exists an older build's `pods` has nowhere to record what it was forked
 * from — the data this migration makes room for cannot be carried backwards.
 */
const MIGRATION_5 = `
ALTER TABLE pods ADD COLUMN forked_from_pod_id TEXT
  CONSTRAINT fk_pods_forked_from_pod_id REFERENCES pods(id) ON DELETE SET NULL;

ALTER TABLE pods ADD COLUMN forked_from_cc_session_id TEXT;

-- ON DELETE SET NULL's child lookup when a parent Pod is deleted.
CREATE INDEX idx_pods_forked_from ON pods (forked_from_pod_id) WHERE forked_from_pod_id IS NOT NULL;
`;

/**
 * Ordered, forward-only. Append new entries; never edit a shipped one.
 * `CURRENT_SCHEMA_VERSION` is the highest version this build understands.
 */
export const MIGRATIONS: readonly Migration[] = [
  { version: 1, sql: MIGRATION_1 },
  { version: 2, sql: MIGRATION_2 },
  { version: 3, sql: MIGRATION_3 },
  { version: 4, sql: MIGRATION_4 },
  { version: 5, sql: MIGRATION_5 },
];

export const CURRENT_SCHEMA_VERSION: number = MIGRATIONS.reduce(
  (max, m) => (m.version > max ? m.version : max),
  0,
);

/**
 * Bootstrap table, created outside the migration list because the migration
 * runner has to read it before it can decide what to apply.
 */
export const SCHEMA_VERSION_DDL = `
CREATE TABLE IF NOT EXISTS schema_version (
  version    INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
) STRICT;
`;
