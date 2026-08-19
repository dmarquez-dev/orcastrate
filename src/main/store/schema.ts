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

export const POD_STATUSES = ['idle', 'running', 'waiting', 'beached'] as const satisfies readonly PodStatus[];
export const LANE_STATUSES = ['running', 'done', 'orphaned'] as const satisfies readonly LaneStatus[];
export const LANE_KINDS = ['matriarch', 'calf'] as const satisfies readonly LaneKind[];
export const PERMISSION_MODES = [
  'default',
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

// Each of these resolves to `never` while the arrays above are exhaustive; if a
// union gains a member the corresponding line stops compiling.
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
function sqlIn(values: readonly string[]): string {
  return `(${values.map((v) => `'${v}'`).join(', ')})`;
}

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
  permission_mode TEXT    NOT NULL CHECK (permission_mode IN ${sqlIn(PERMISSION_MODES)}),
  env_overrides   TEXT    NOT NULL DEFAULT '{}',
  tab_order       INTEGER NOT NULL,
  status          TEXT    NOT NULL CHECK (status IN ${sqlIn(POD_STATUSES)}),
  created_at      TEXT    NOT NULL,
  last_active_at  TEXT    NOT NULL
) STRICT;

CREATE TABLE lanes (
  id             TEXT    PRIMARY KEY,
  pod_id         TEXT    NOT NULL REFERENCES pods(id) ON DELETE CASCADE,
  kind           TEXT    NOT NULL CHECK (kind IN ${sqlIn(LANE_KINDS)}),
  tool_use_id    TEXT,
  agent_id       TEXT,
  parent_lane_id TEXT    REFERENCES lanes(id) ON DELETE CASCADE,
  depth          INTEGER NOT NULL CHECK (depth >= 0),
  subagent_type  TEXT,
  description    TEXT,
  status         TEXT    NOT NULL CHECK (status IN ${sqlIn(LANE_STATUSES)}),
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
  type       TEXT    NOT NULL CHECK (type IN ${sqlIn(EVENT_TYPES)}),
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
 * Ordered, forward-only. Append new entries; never edit a shipped one.
 * `CURRENT_SCHEMA_VERSION` is the highest version this build understands.
 */
export const MIGRATIONS: readonly Migration[] = [{ version: 1, sql: MIGRATION_1 }];

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
