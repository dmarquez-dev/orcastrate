/**
 * Shared machinery for the router fixture-replay ACCEPTANCE suite (T6).
 *
 * This suite is derived from `tests/fixtures/protocol/findings.json`, the frozen
 * `src/shared/contracts/fixture-corpus.md`, and design-spec section 9 — not from
 * reading `src/main/lane/lane-router.ts`. It is the durable coverage: it must
 * still catch a regression if T5's own co-located `lane-router.test.ts` were
 * deleted.
 *
 * NO I/O BEYOND READING THE FIXTURE FILES (criterion 7). Nothing here spawns
 * `claude`, opens a socket, needs an API key, or touches SQLite. The router is
 * pure by contract, so replay needs none of that.
 *
 * DETERMINISM (fixture-corpus.md §4). `newLaneId` and `now` are injected
 * counters, so two replays of one fixture are byte-identical and no assertion
 * anywhere in this suite depends on a wall clock or a generated uuid.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Lane, LaneId, NewEvent } from '../../src/shared/contracts/events';
import type { LaneRouter, RoutingMode } from '../../src/shared/contracts/lane-router';
import { createLaneRouter } from '../../src/main/lane';

export const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const FIXTURE_DIR = join(REPO_ROOT, 'tests/fixtures/protocol');
export const CONTRACT_PATH = join(REPO_ROOT, 'src/shared/contracts/fixture-corpus.md');
export const ROUTER_TEST_DIR = fileURLToPath(new URL('.', import.meta.url));

export const POD_ID = 'pod-acceptance';
export const MATRIARCH_LANE_ID = 'lane-matriarch';

// ---------------------------------------------------------------------------
// findings.json — the machine-readable half of the T2/T6 contract (§3)
// ---------------------------------------------------------------------------

export interface FixtureFinding {
  file: string;
  lines: number;
  turns: number;
  calvesOpened: number;
  maxDepth: number;
  orphanCondition?: string;
  notes?: string;
}

export interface Findings {
  schemaVersion: number;
  cliVersion: string;
  recommendedRoutingMode: RoutingMode;
  parentToolUseId: { correlates: boolean; fieldPath: string; messageTypesCarryingIt: string[] };
  nesting: {
    depth2Observed: boolean;
    parentAgentIdFieldPath: string | null;
    distinguishableFromDepth1: boolean;
  };
  agentId: { observed: boolean; fieldPath: string | null; availableForEveryCalf: boolean };
  fixtures: FixtureFinding[];
}

let cachedFindings: Findings | null = null;

export function findings(): Findings {
  if (cachedFindings === null) {
    cachedFindings = JSON.parse(
      readFileSync(join(FIXTURE_DIR, 'findings.json'), 'utf8'),
    ) as Findings;
  }
  return cachedFindings;
}

export function findingFor(file: string): FixtureFinding {
  const entry = findings().fixtures.find((candidate) => candidate.file === file);
  if (entry === undefined) {
    throw new Error(`findings.json has no fixtures[] entry for ${file}`);
  }
  return entry;
}

// ---------------------------------------------------------------------------
// The corpus itself
// ---------------------------------------------------------------------------

/**
 * The `.ndjson` names the frozen contract's §1 file layout NAMES. Read out of
 * the contract text rather than hardcoded, so adding a fixture to the contract
 * without capturing it fails criterion 1 loudly instead of being skipped.
 */
export function declaredFixtureFiles(): string[] {
  const contract = readFileSync(CONTRACT_PATH, 'utf8');
  const layout = /## 1\. File layout([\s\S]*?)\n## /.exec(contract);
  if (layout === null) throw new Error('fixture-corpus.md has no "## 1. File layout" section');
  const names = new Set<string>();
  for (const match of layout[1]!.matchAll(/([A-Za-z0-9._-]+\.ndjson)/g)) {
    names.add(match[1]!);
  }
  return [...names].sort();
}

/** Every `.ndjson` actually present in the corpus directory. */
export function discoveredFixtureFiles(): string[] {
  return readdirSync(FIXTURE_DIR)
    .filter((name) => name.endsWith('.ndjson'))
    .sort();
}

/**
 * Raw lines, as strings, exactly as they sit on disk. Blank lines (including
 * the mandated trailing newline, §2) are dropped; every other line — truncated,
 * non-JSON, unknown-type — is handed to the router verbatim so replay exercises
 * the PARSER as well as the router (criterion 1, spec 9).
 */
export function fixtureLines(file: string): string[] {
  return readFileSync(join(FIXTURE_DIR, file), 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);
}

/** Parsed lines, with unparseable ones as `null` so line numbers stay aligned. */
export function fixtureMessages(file: string): (Record<string, unknown> | null)[] {
  return fixtureLines(file).map((line) => {
    try {
      const parsed: unknown = JSON.parse(line);
      return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  });
}

// ---------------------------------------------------------------------------
// Router construction and replay
// ---------------------------------------------------------------------------

export interface RouterOptions {
  mode?: RoutingMode;
  maxLaneDepth?: number;
}

/**
 * A router with injected id and clock sources. Ids are `lane-1`, `lane-2`, …
 * in creation order and timestamps are a monotonic counter — so a replay is
 * reproducible, and the suite can name lanes by their ORDER OF CREATION without
 * ever asserting a literal uuid or a real timestamp (fixture-corpus.md §4).
 */
export function makeRouter(options: RouterOptions = {}): LaneRouter {
  let lane = 0;
  let tick = 0;
  return createLaneRouter({
    podId: POD_ID,
    matriarchLaneId: MATRIARCH_LANE_ID,
    mode: options.mode ?? 'lanes',
    newLaneId: () => `lane-${++lane}`,
    now: () => `2026-01-01T00:00:00.${String(tick++).padStart(4, '0')}Z`,
    ...(options.maxLaneDepth === undefined ? {} : { maxLaneDepth: options.maxLaneDepth }),
  });
}

export interface Replay {
  file: string;
  router: LaneRouter;
  /** Every event the fixture produced, in emission order, ingest excluded. */
  events: NewEvent[];
  /** `perLine[n]` holds the events produced by 1-based source line `n + 1`. */
  perLine: NewEvent[][];
  /** The 1-based source line that produced `events[i]`. */
  sourceLine: number[];
  /** Events returned by the single `onTurnBoundary()` call after the last line. */
  boundary: NewEvent[];
  lanes: Lane[];
}

/**
 * Replays one fixture through the parser and the router.
 *
 * `onTurnBoundary()` is called ONCE, after the last line, mirroring what a
 * PodRunner does at the SDK `result` message. Its events are kept separate from
 * the ingest stream so a test can tell "closed during the turn" from "closed as
 * an orphan at the boundary" — the distinction 04-orphaned-calf turns on.
 */
export function replay(file: string, options: RouterOptions = {}): Replay {
  const router = makeRouter(options);
  const events: NewEvent[] = [];
  const perLine: NewEvent[][] = [];
  const sourceLine: number[] = [];

  fixtureLines(file).forEach((line, index) => {
    const produced = router.ingest(line);
    perLine.push(produced);
    for (const event of produced) {
      events.push(event);
      sourceLine.push(index + 1);
    }
  });

  const boundary = router.onTurnBoundary();
  return { file, router, events, perLine, sourceLine, boundary, lanes: router.lanes() };
}

// ---------------------------------------------------------------------------
// Event queries
// ---------------------------------------------------------------------------

export function ofType(events: NewEvent[], type: NewEvent['type']): NewEvent[] {
  return events.filter((event) => event.type === type);
}

/** The lane each `lane_opened` announced, in announcement order. */
export function openedLanes(events: NewEvent[]): Lane[] {
  return ofType(events, 'lane_opened').map((event) => (event.payload as { lane: Lane }).lane);
}

export function closedLaneIds(events: NewEvent[]): { laneId: LaneId; status: string }[] {
  return ofType(events, 'lane_closed').map((event) => {
    const payload = event.payload as { laneId: LaneId; status: string };
    return { laneId: payload.laneId, status: payload.status };
  });
}

export function laneById(lanes: Lane[], id: LaneId): Lane {
  const lane = lanes.find((candidate) => candidate.id === id);
  if (lane === undefined) throw new Error(`no lane ${id} in ${lanes.map((l) => l.id).join(', ')}`);
  return lane;
}

export function calves(lanes: Lane[]): Lane[] {
  return lanes.filter((lane) => lane.kind === 'calf');
}

/** The lane a Calf-owned transcript event belongs to, ignoring Matriarch traffic. */
export function calfLaneSequence(replayed: Replay): LaneId[] {
  const calfIds = new Set(calves(replayed.lanes).map((lane) => lane.id));
  const transcript = new Set(['user_message', 'assistant_text', 'thinking', 'tool_use', 'tool_result']);
  return replayed.events
    .filter((event) => calfIds.has(event.laneId) && transcript.has(event.type))
    .map((event) => event.laneId);
}

/** Number of times consecutive entries differ — the "lane switch" count. */
export function switchCount(sequence: LaneId[]): number {
  let switches = 0;
  for (let i = 1; i < sequence.length; i += 1) {
    if (sequence[i] !== sequence[i - 1]) switches += 1;
  }
  return switches;
}
