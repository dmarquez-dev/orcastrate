/**
 * SQLite-backed `EventStore` (spec 4.4), implementing the frozen contract in
 * `src/shared/contracts/event-store.ts`.
 *
 * Every method is synchronous because better-sqlite3 is synchronous. Do not
 * wrap these in promises: the contract's consumers (PodRunner, LaneRouter, the
 * IPC handlers) call them inline on the main process event loop.
 */

import Database from 'better-sqlite3';

import type {
  CreateLaneInput,
  CreatePodInput,
  EventStore,
  OpenEventStore,
  ReadEventsQuery,
} from '../../shared/contracts/event-store';
import type {
  AgentId,
  Lane,
  LaneId,
  LaneStatus,
  NewEvent,
  NormalizedEvent,
  Pod,
  PodId,
  Seq,
  ToolUseId,
} from '../../shared/contracts/events';
import { EventStoreError, guard } from './errors';
import { encodeRaw, toEvent, toLane, toPod } from './rows';
import type { EventRow, LaneRow, PodRow } from './rows';
import { CURRENT_SCHEMA_VERSION, MIGRATIONS, SCHEMA_VERSION_DDL } from './schema';

const DEFAULT_READ_LIMIT = 500;
const MAX_READ_LIMIT = 5000;

const POD_COLUMNS = `
  id, title, cwd, cc_session_id, permission_mode, env_overrides,
  tab_order, status, created_at, last_active_at
`;
const LANE_COLUMNS = `
  id, pod_id, kind, tool_use_id, agent_id, parent_lane_id, depth,
  subagent_type, description, status, started_at, ended_at
`;
const EVENT_COLUMNS = `id, pod_id, lane_id, seq, type, payload, raw, created_at`;

/** ISO-8601 UTC with milliseconds, as the contract's `Timestamp` requires. */
function now(): string {
  return new Date().toISOString();
}

/** The columns `updatePod` may set, and the patch key each comes from. */
const POD_PATCH_COLUMNS = {
  title: 'title',
  ccSessionId: 'cc_session_id',
  permissionMode: 'permission_mode',
  envOverrides: 'env_overrides',
  tabOrder: 'tab_order',
  status: 'status',
  lastActiveAt: 'last_active_at',
} as const;

type PodPatchKey = keyof typeof POD_PATCH_COLUMNS;

class SqliteEventStore implements EventStore {
  private readonly db: Database.Database;
  private readonly stmts = new Map<string, Database.Statement<unknown[], unknown>>();

  constructor(filename: string) {
    this.db = guard(`open ${filename}`, () => {
      const db = new Database(filename);
      db.pragma('journal_mode = WAL');
      db.pragma('foreign_keys = ON');
      db.pragma('busy_timeout = 5000');
      return db;
    });
  }

  /**
   * Prepared-statement cache. better-sqlite3 does not cache internally, and
   * `prepare` is the expensive half of a query.
   *
   * The single cast is the price of one heterogeneous cache: `prepare` is
   * generic in its row type, so the map has to be keyed on the erased
   * `unknown` row and re-narrowed here. It is not a workaround for the stale
   * `@types` package.
   */
  private stmt<R>(sql: string): Database.Statement<unknown[], R> {
    const cached = this.stmts.get(sql);
    if (cached !== undefined) return cached as Database.Statement<unknown[], R>;
    const prepared = this.db.prepare(sql);
    this.stmts.set(sql, prepared);
    return prepared as Database.Statement<unknown[], R>;
  }

  // -- migrations ----------------------------------------------------------

  migrate(): void {
    guard('migrate', () => {
      this.db.exec(SCHEMA_VERSION_DDL);

      const row = this.db
        .prepare<unknown[], { v: number | null }>('SELECT MAX(version) AS v FROM schema_version')
        .get();
      const onDisk = row?.v ?? 0;

      if (onDisk > CURRENT_SCHEMA_VERSION) {
        throw new EventStoreError(
          'SCHEMA_MISMATCH',
          `database schema version ${onDisk} is newer than this build understands ` +
            `(${CURRENT_SCHEMA_VERSION}); upgrade Orcastrate to open this file`,
        );
      }

      const pending = MIGRATIONS.filter((m) => m.version > onDisk);
      if (pending.length === 0) return;

      // FOREIGN KEYS ARE SUSPENDED FOR THE MIGRATION TRANSACTION.
      //
      // Changing a CHECK constraint in SQLite requires the documented 12-step
      // table rebuild: create, copy, DROP, rename (migration 2 does exactly
      // this to `pods`). `lanes` and `events` reference `pods(id)` ON DELETE
      // CASCADE, so with enforcement ON that DROP would quietly delete every
      // lane and event and the migration would "succeed" against an emptied
      // store. Enforcement off, the DROP is inert and the rename leaves the
      // other tables' REFERENCES clauses pointing at the rebuilt table.
      //
      // `PRAGMA foreign_keys` is a NO-OP inside a transaction, so the toggle
      // has to happen out here, and `foreign_key_check` runs inside the
      // transaction so a migration that really did orphan a row rolls back
      // rather than committing the damage.
      const fkWasOn = this.db.pragma('foreign_keys', { simple: true }) === 1;
      if (fkWasOn) this.db.pragma('foreign_keys = OFF');

      try {
        // Idempotency comes from the version gate above plus the transaction: a
        // second call finds nothing pending and touches neither schema nor data.
        const apply = this.db.transaction(() => {
          const record = this.db.prepare('INSERT INTO schema_version (version, applied_at) VALUES (?, ?)');
          for (const migration of pending) {
            this.db.exec(migration.sql);
            record.run(migration.version, now());
          }

          const violations = this.db.pragma('foreign_key_check') as unknown[];
          if (violations.length > 0) {
            throw new EventStoreError(
              'IO',
              `migration left ${violations.length} orphaned row(s); rolled back ` +
                `(versions ${pending.map((m) => m.version).join(', ')})`,
            );
          }
        });
        apply.immediate();
      } finally {
        if (fkWasOn) this.db.pragma('foreign_keys = ON');
      }
    });
  }

  // -- pods ----------------------------------------------------------------

  createPod(input: CreatePodInput): Pod {
    return guard('createPod', () => {
      const timestamp = now();
      const row = this.stmt<PodRow>(
        `INSERT INTO pods (id, title, cwd, cc_session_id, permission_mode, env_overrides,
                           tab_order, status, created_at, last_active_at)
         VALUES (?, ?, ?, NULL, ?, ?, ?, 'idle', ?, ?)
         RETURNING ${POD_COLUMNS}`,
      ).get(
        input.id,
        input.title,
        input.cwd,
        input.permissionMode,
        JSON.stringify(input.envOverrides ?? {}),
        input.tabOrder,
        timestamp,
        timestamp,
      );
      if (row === undefined) throw new EventStoreError('IO', 'createPod: insert returned no row');
      return toPod(row);
    });
  }

  getPod(id: PodId): Pod | null {
    return guard('getPod', () => {
      const row = this.stmt<PodRow>(`SELECT ${POD_COLUMNS} FROM pods WHERE id = ?`).get(id);
      return row === undefined ? null : toPod(row);
    });
  }

  listPods(): Pod[] {
    return guard('listPods', () =>
      this.stmt<PodRow>(`SELECT ${POD_COLUMNS} FROM pods ORDER BY tab_order ASC, created_at ASC, id ASC`)
        .all()
        .map(toPod),
    );
  }

  updatePod(id: PodId, patch: Parameters<EventStore['updatePod']>[1]): Pod {
    return guard('updatePod', () => {
      const assignments: string[] = [];
      const values: unknown[] = [];

      for (const key of Object.keys(POD_PATCH_COLUMNS) as PodPatchKey[]) {
        if (!Object.prototype.hasOwnProperty.call(patch, key)) continue;
        const value = patch[key];
        if (value === undefined) continue;
        assignments.push(`${POD_PATCH_COLUMNS[key]} = ?`);
        values.push(key === 'envOverrides' ? JSON.stringify(value) : value);
      }

      // "Also refreshes lastActiveAt to now unless lastActiveAt is supplied."
      if (!assignments.some((a) => a.startsWith('last_active_at'))) {
        assignments.push('last_active_at = ?');
        values.push(now());
      }

      const row = this.stmt<PodRow>(
        `UPDATE pods SET ${assignments.join(', ')} WHERE id = ? RETURNING ${POD_COLUMNS}`,
      ).get(...values, id);
      if (row === undefined) throw new EventStoreError('NOT_FOUND', `updatePod: no pod with id ${id}`);
      return toPod(row);
    });
  }

  deletePod(id: PodId): void {
    guard('deletePod', () => {
      // ON DELETE CASCADE on lanes.pod_id and events.pod_id does the rest; it
      // is armed by `PRAGMA foreign_keys = ON` in the constructor.
      const result = this.stmt('DELETE FROM pods WHERE id = ?').run(id);
      if (result.changes === 0) throw new EventStoreError('NOT_FOUND', `deletePod: no pod with id ${id}`);
    });
  }

  // -- lanes ---------------------------------------------------------------

  createLane(input: CreateLaneInput): Lane {
    return guard('createLane', () => {
      // Pre-checked so a missing Pod reports NOT_FOUND rather than the
      // foreign-key CONFLICT the database would otherwise raise.
      const pod = this.stmt<{ id: string }>('SELECT id FROM pods WHERE id = ?').get(input.podId);
      if (pod === undefined) throw new EventStoreError('NOT_FOUND', `createLane: no pod with id ${input.podId}`);

      const row = this.stmt<LaneRow>(
        `INSERT INTO lanes (id, pod_id, kind, tool_use_id, agent_id, parent_lane_id, depth,
                            subagent_type, description, status, started_at, ended_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'running', ?, NULL)
         RETURNING ${LANE_COLUMNS}`,
      ).get(
        input.id,
        input.podId,
        input.kind,
        input.toolUseId,
        input.agentId,
        input.parentLaneId,
        input.depth,
        input.subagentType,
        input.description,
        now(),
      );
      if (row === undefined) throw new EventStoreError('IO', 'createLane: insert returned no row');
      return toLane(row);
    });
  }

  getLane(id: LaneId): Lane | null {
    return guard('getLane', () => {
      const row = this.stmt<LaneRow>(`SELECT ${LANE_COLUMNS} FROM lanes WHERE id = ?`).get(id);
      return row === undefined ? null : toLane(row);
    });
  }

  getLaneByToolUseId(podId: PodId, toolUseId: ToolUseId): Lane | null {
    return guard('getLaneByToolUseId', () => {
      const row = this.stmt<LaneRow>(
        `SELECT ${LANE_COLUMNS} FROM lanes WHERE pod_id = ? AND tool_use_id = ?`,
      ).get(podId, toolUseId);
      return row === undefined ? null : toLane(row);
    });
  }

  getMatriarchLane(podId: PodId): Lane | null {
    return guard('getMatriarchLane', () => {
      const row = this.stmt<LaneRow>(
        `SELECT ${LANE_COLUMNS} FROM lanes WHERE pod_id = ? AND kind = 'matriarch'`,
      ).get(podId);
      return row === undefined ? null : toLane(row);
    });
  }

  listLanes(podId: PodId): Lane[] {
    return guard('listLanes', () =>
      this.stmt<LaneRow>(
        `SELECT ${LANE_COLUMNS} FROM lanes WHERE pod_id = ?
         ORDER BY CASE kind WHEN 'matriarch' THEN 0 ELSE 1 END, started_at ASC, id ASC`,
      )
        .all(podId)
        .map(toLane),
    );
  }

  setLaneStatus(id: LaneId, status: LaneStatus, endedAt?: string): Lane {
    return guard('setLaneStatus', () => {
      // The lanes CHECK constraint ties these two together: terminal implies a
      // stamp, 'running' implies none.
      const stamp = status === 'running' ? null : (endedAt ?? now());
      const row = this.stmt<LaneRow>(
        `UPDATE lanes SET status = ?, ended_at = ? WHERE id = ? RETURNING ${LANE_COLUMNS}`,
      ).get(status, stamp, id);
      if (row === undefined) throw new EventStoreError('NOT_FOUND', `setLaneStatus: no lane with id ${id}`);
      return toLane(row);
    });
  }

  setLaneAgentId(id: LaneId, agentId: AgentId): Lane {
    return guard('setLaneAgentId', () => {
      const row = this.stmt<LaneRow>(
        `UPDATE lanes SET agent_id = ? WHERE id = ? RETURNING ${LANE_COLUMNS}`,
      ).get(agentId, id);
      if (row === undefined) throw new EventStoreError('NOT_FOUND', `setLaneAgentId: no lane with id ${id}`);
      return toLane(row);
    });
  }

  // -- events --------------------------------------------------------------

  /**
   * Assigns the seq and inserts in ONE statement: the `MAX(seq) + 1` subquery
   * is evaluated by SQLite inside the insert, so no read-modify-write window
   * exists in which a concurrent writer could claim the same number. The
   * UNIQUE (pod_id, seq) index is the backstop.
   */
  private insertOne(event: NewEvent): NormalizedEvent {
    const row = this.stmt<{ id: number; seq: number }>(
      `INSERT INTO events (pod_id, lane_id, seq, type, payload, raw, created_at)
       VALUES (?, ?, (SELECT COALESCE(MAX(seq), 0) + 1 FROM events WHERE pod_id = ?), ?, ?, ?, ?)
       RETURNING id, seq`,
    ).get(
      event.podId,
      event.laneId,
      event.podId,
      event.type,
      JSON.stringify(event.payload),
      encodeRaw(event),
      event.createdAt,
    );
    if (row === undefined) throw new EventStoreError('IO', 'append: insert returned no row');
    return { ...event, id: row.id, seq: row.seq };
  }

  append(event: NewEvent): NormalizedEvent {
    return guard('append', () => {
      const tx = this.db.transaction((e: NewEvent) => this.insertOne(e));
      return tx.immediate(event);
    });
  }

  appendMany(events: NewEvent[]): NormalizedEvent[] {
    return guard('appendMany', () => {
      // One transaction for the whole batch: any throw rolls back every insert,
      // including the ones that already succeeded.
      const tx = this.db.transaction((batch: NewEvent[]) => batch.map((e) => this.insertOne(e)));
      return tx.immediate(events);
    });
  }

  readEvents(query: ReadEventsQuery): NormalizedEvent[] {
    return guard('readEvents', () => {
      const clauses = ['pod_id = ?'];
      const values: unknown[] = [query.podId];

      if (query.laneId !== undefined) {
        clauses.push('lane_id = ?');
        values.push(query.laneId);
      }
      if (query.afterSeq !== undefined) {
        clauses.push('seq > ?');
        values.push(query.afterSeq);
      }
      values.push(clampLimit(query.limit));

      return this.stmt<EventRow>(
        `SELECT ${EVENT_COLUMNS} FROM events WHERE ${clauses.join(' AND ')} ORDER BY seq ASC LIMIT ?`,
      )
        .all(...values)
        .map(toEvent);
    });
  }

  latestSeq(podId: PodId): Seq {
    return guard('latestSeq', () => {
      const row = this.stmt<{ seq: number }>(
        'SELECT COALESCE(MAX(seq), 0) AS seq FROM events WHERE pod_id = ?',
      ).get(podId);
      return row?.seq ?? 0;
    });
  }

  // -- lifecycle -----------------------------------------------------------

  close(): void {
    guard('close', () => {
      this.stmts.clear();
      if (this.db.open) this.db.close();
    });
  }
}

/**
 * Default 500, hard maximum 5000. A non-finite or non-positive limit falls back
 * to the default rather than returning an empty page, which would look like
 * "no more events" to a paginating caller. (Judgment: the contract specifies
 * only the default and the clamp.)
 */
function clampLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit)) return DEFAULT_READ_LIMIT;
  const floored = Math.floor(limit);
  if (floored < 1) return DEFAULT_READ_LIMIT;
  return Math.min(floored, MAX_READ_LIMIT);
}

/**
 * Factory. `filename` is an absolute path, or ':memory:' for tests.
 * Deliberately does NOT call migrate() — see the contract.
 */
export const openEventStore: OpenEventStore = (filename: string) => new SqliteEventStore(filename);
