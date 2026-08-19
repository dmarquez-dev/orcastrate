/**
 * Row shapes as they exist in SQLite, and the mappers between them and the
 * frozen contract shapes in `contracts/events.ts`.
 *
 * The database uses snake_case; the contract uses camelCase. Nothing outside
 * this module should see a raw row.
 */

import type {
  EventPayload,
  EventType,
  Lane,
  LaneKind,
  LaneStatus,
  NormalizedEvent,
  PermissionMode,
  Pod,
  PodStatus,
} from '../../shared/contracts/events';
import { EventStoreError } from './errors';

export interface PodRow {
  id: string;
  title: string;
  cwd: string;
  cc_session_id: string | null;
  permission_mode: string;
  env_overrides: string;
  tab_order: number;
  status: string;
  created_at: string;
  last_active_at: string;
}

export interface LaneRow {
  id: string;
  pod_id: string;
  kind: string;
  tool_use_id: string | null;
  agent_id: string | null;
  parent_lane_id: string | null;
  depth: number;
  subagent_type: string | null;
  description: string | null;
  status: string;
  started_at: string;
  ended_at: string | null;
}

export interface EventRow {
  id: number;
  pod_id: string;
  lane_id: string;
  seq: number;
  type: string;
  payload: string;
  raw: string | null;
  created_at: string;
}

/**
 * Parses a JSON column. A parse failure means the file is corrupt or was
 * written by something other than this store, which is an IO condition rather
 * than a caller mistake.
 */
function parseJson(column: string, text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new EventStoreError('IO', `corrupt JSON in column "${column}"`, { cause: err });
  }
}

export function toPod(row: PodRow): Pod {
  const env = parseJson('env_overrides', row.env_overrides);
  return {
    id: row.id,
    title: row.title,
    cwd: row.cwd,
    ccSessionId: row.cc_session_id,
    // The CHECK constraint on permission_mode guarantees the narrowing; SQLite
    // has no enum type to express it to TypeScript.
    permissionMode: row.permission_mode as PermissionMode,
    envOverrides: (env ?? {}) as Record<string, string>,
    tabOrder: row.tab_order,
    status: row.status as PodStatus,
    createdAt: row.created_at,
    lastActiveAt: row.last_active_at,
  };
}

export function toLane(row: LaneRow): Lane {
  return {
    id: row.id,
    podId: row.pod_id,
    kind: row.kind as LaneKind,
    toolUseId: row.tool_use_id,
    agentId: row.agent_id,
    parentLaneId: row.parent_lane_id,
    depth: row.depth,
    subagentType: row.subagent_type,
    description: row.description,
    status: row.status as LaneStatus,
    startedAt: row.started_at,
    endedAt: row.ended_at,
  };
}

export function toEvent(row: EventRow): NormalizedEvent {
  const event: NormalizedEvent = {
    id: row.id,
    podId: row.pod_id,
    laneId: row.lane_id,
    seq: row.seq,
    type: row.type as EventType,
    payload: parseJson('payload', row.payload) as EventPayload,
    createdAt: row.created_at,
  };
  // `raw` is optional on the contract. A NULL column means "the event had no
  // raw"; a stored 'null' string means "raw was present and was null". Only the
  // second case sets the key, so a round-trip is key-for-key identical.
  if (row.raw !== null) {
    event.raw = parseJson('raw', row.raw);
  }
  return event;
}

/** Encodes an optional `raw` for storage. Returns null when the key is absent. */
export function encodeRaw(event: { raw?: unknown }): string | null {
  if (!('raw' in event) || event.raw === undefined) return null;
  return JSON.stringify(event.raw) ?? null;
}
