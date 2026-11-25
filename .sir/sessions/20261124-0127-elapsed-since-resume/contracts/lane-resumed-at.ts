// frozen at Gate 2: 20261124-0127-elapsed-since-resume
//
// CONTRACT — when a lane's current run began, between T1 (owner of every
// source home below: the shared lane contract, the EventStore contract, the
// store and migration 7), T2 (which calls the resume stamp from PodManager),
// T3 (which derives the rail's elapsed readout from it) and T4 (which records
// migration 7 in the frozen-migration tripwire).
//
// Declarations only. Each declaration's SOURCE HOME is named beside it; the
// product imports the source home, never this file. Types named here
// (`LaneId`, `LaneStatus`, `Timestamp`) are the ones
// src/shared/contracts/events.ts already exports.

import type { LaneId, LaneStatus, Timestamp } from '../../../../src/shared/contracts/events';

// ---------------------------------------------------------------------------
// 1. The field. Source home: `interface Lane` in
//    src/shared/contracts/events.ts (T1), appended after `endedAt`.
// ---------------------------------------------------------------------------

export interface LaneResumedAtField {
  /**
   * When this lane last went from a terminal status ('done' | 'orphaned' |
   * 'stopped') back to 'running'. null for a lane that has never done so.
   *
   * - A new lane (`createLane`) reads null.
   * - `startedAt` is NEVER restamped: Calf ordering and `listLanes` sort on it.
   * - It is NOT cleared when the lane ends again: a lane stopped after a resume
   *   keeps the `resumedAt` of the run that just ended.
   * - The lane's CURRENT RUN began at `resumedAt ?? startedAt`. That is the
   *   one rule every reader uses; nothing else in the product says when a run
   *   began.
   * - The `lane` inside a stored `lane_opened` payload is a snapshot taken when
   *   the lane opened. It reads null when written after this change and may
   *   lack the key entirely when written before it. No reader may derive a
   *   lane's run from that payload; the store's lane row is the source.
   */
  resumedAt: Timestamp | null;
}

// ---------------------------------------------------------------------------
// 2. The resume stamp. Source home: `EventStore.setLaneStatus` in
//    src/shared/contracts/event-store.ts (T1), implemented by
//    `SqliteEventStore.setLaneStatus` in src/main/store/sqlite-event-store.ts
//    (T1). The third parameter is renamed `at`; its type and optionality do
//    not change, and no other EventStore member changes.
// ---------------------------------------------------------------------------

export interface SetLaneStatusWithResumeStamp {
  /**
   * Sets `status`.
   *
   * Terminal status ('done' | 'orphaned' | 'stopped'): stamps
   *   `endedAt = at ?? <store's now>`. `resumedAt` is left as it was.
   *
   * 'running', from a lane whose stored status is terminal (a RESUME): clears
   *   `endedAt` and stamps `resumedAt = at ?? <store's now>`.
   *
   * 'running', from a lane whose stored status is already 'running': no
   *   change to `endedAt` (null) or `resumedAt`; `at` is ignored.
   *
   * The returned Lane is the row as stored after the update, `resumedAt`
   * included.
   *
   * ERRORS (unchanged):
   *   NOT_FOUND  no lane with id `id`; nothing is written
   *   CONFLICT   `status` outside the lane-status CHECK; nothing is written
   *   IO         the underlying SQLite call failed
   */
  setLaneStatus(id: LaneId, status: LaneStatus, at?: string): import('../../../../src/shared/contracts/events').Lane;
}

// ---------------------------------------------------------------------------
// 3. The column. Source home: `MIGRATION_7` in src/main/store/schema.ts (T1),
//    appended to `MIGRATIONS` as `{ version: 7, sql: MIGRATION_7 }`.
// ---------------------------------------------------------------------------

/**
 * Migration 7 adds one nullable TEXT column, `lanes.resumed_at`, and nothing
 * else: no table rebuild, no index, no CHECK, no INSERT/UPDATE/DELETE. Every
 * existing lane row keeps every value it had and reads `resumed_at` NULL,
 * so every lane that existed before the upgrade reads as never resumed.
 * The `(status = 'running') = (ended_at IS NULL)` CHECK is unchanged.
 * Not reversible, consistent with schema.ts's file docblock: a downgrade
 * discards the database file.
 *
 * `forkPod` copies `resumed_at` verbatim from each parent lane to the fork's
 * lane, alongside `started_at`.
 *
 * T4 consumes this as the migration whose shipped blob it records: the
 * template literal is declared `const MIGRATION_7 = \`` in schema.ts, the form
 * `tests/unit/store/migration-frozen.test.ts`'s `shippedMigration` reads.
 */
export declare const MIGRATION_7_VERSION: 7;
