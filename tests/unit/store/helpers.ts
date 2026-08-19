/**
 * Shared fixtures for the EventStore suite.
 *
 * Every database these helpers make is either ':memory:' or a file inside a
 * freshly created OS temp directory. Nothing here touches Electron `userData`
 * or any path belonging to the developer.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import Database from 'better-sqlite3';

import type { CreateLaneInput, CreatePodInput, EventStore } from '../../../src/shared/contracts/event-store';
import type { LaneId, NewEvent, PodId } from '../../../src/shared/contracts/events';
import { EventStoreError, openEventStore } from '../../../src/main/store';

const tempDirs: string[] = [];
const openStores: EventStore[] = [];
const openRawDbs: Database.Database[] = [];

/** A migrated in-memory store. Closed automatically by `cleanupStores`. */
export function memoryStore(): EventStore {
  const store = openEventStore(':memory:');
  store.migrate();
  openStores.push(store);
  return store;
}

/** An absolute path to a not-yet-created db file in a fresh temp directory. */
export function tempDbPath(name = 'store.db'): string {
  const dir = mkdtempSync(join(tmpdir(), 'orcastrate-store-'));
  tempDirs.push(dir);
  return join(dir, name);
}

/** An unmigrated file-backed store at `path`. */
export function fileStore(path: string): EventStore {
  const store = openEventStore(path);
  openStores.push(store);
  return store;
}

/**
 * A direct connection used only for introspection and for provoking
 * database-level constraint failures that the store's API would not allow.
 */
export function rawDb(path: string): Database.Database {
  const db = new Database(path);
  db.pragma('foreign_keys = ON');
  openRawDbs.push(db);
  return db;
}

/** Tears down everything opened by this module. Call from `afterEach`. */
export function cleanupStores(): void {
  for (const store of openStores.splice(0)) {
    try {
      store.close();
    } catch {
      /* already closed by the test */
    }
  }
  for (const db of openRawDbs.splice(0)) {
    try {
      db.close();
    } catch {
      /* already closed */
    }
  }
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// Input factories
// ---------------------------------------------------------------------------

let counter = 0;
export function uid(prefix: string): string {
  counter += 1;
  return `${prefix}-${String(counter).padStart(6, '0')}`;
}

export function podInput(overrides: Partial<CreatePodInput> = {}): CreatePodInput {
  return {
    id: uid('pod'),
    title: 'Refactor the router',
    cwd: 'C:\\work\\repo',
    permissionMode: 'default',
    envOverrides: {},
    tabOrder: 0,
    ...overrides,
  };
}

export function laneInput(podId: PodId, overrides: Partial<CreateLaneInput> = {}): CreateLaneInput {
  return {
    id: uid('lane'),
    podId,
    kind: 'matriarch',
    toolUseId: null,
    agentId: null,
    parentLaneId: null,
    depth: 0,
    subagentType: null,
    description: null,
    ...overrides,
  };
}

export function eventInput(podId: PodId, laneId: LaneId, overrides: Partial<NewEvent> = {}): NewEvent {
  return {
    podId,
    laneId,
    type: 'assistant_text',
    payload: { type: 'assistant_text', text: 'hello' },
    createdAt: '2026-08-18T18:00:00.000Z',
    ...overrides,
  };
}

/** Creates a migrated in-memory store with one Pod and its Matriarch lane. */
export function seededStore(): { store: EventStore; podId: PodId; laneId: LaneId } {
  const store = memoryStore();
  const pod = store.createPod(podInput());
  const lane = store.createLane(laneInput(pod.id));
  return { store, podId: pod.id, laneId: lane.id };
}

// ---------------------------------------------------------------------------
// Error assertions
// ---------------------------------------------------------------------------

/**
 * Runs `fn`, requiring it to throw an `EventStoreError`, and hands the error
 * back so the test can assert on `.code`. Anything else propagates unchanged,
 * so a genuine bug is never swallowed as "the expected failure".
 */
export function catchStoreError(fn: () => unknown): EventStoreError {
  try {
    fn();
  } catch (err) {
    if (err instanceof EventStoreError) return err;
    throw err;
  }
  throw new Error('expected an EventStoreError, but the call returned normally');
}
