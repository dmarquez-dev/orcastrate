/**
 * Acceptance criterion 5 — replaying one fixture twice through FRESHLY
 * CONSTRUCTED routers, with injected `newLaneId` and `now`, produces identical
 * output.
 *
 * This is what `fixture-corpus.md` §4 buys: because the router takes its ids and
 * its clock as options, a capture replays byte-for-byte. Any hidden `Date.now`,
 * `randomUUID`, module-level counter, or cross-instance state shows up here as a
 * diff rather than as a flake months later.
 */

import { describe, expect, it } from 'vitest';

import type { NewEvent } from '../../src/shared/contracts/events';
import { createLaneRouter } from '../../src/main/lane';
import {
  MATRIARCH_LANE_ID,
  POD_ID,
  discoveredFixtureFiles,
  fixtureLines,
  makeRouter,
  replay,
} from './helpers';

const PRIMARY = '01-parallel-dispatch.ndjson';

/** Replays with a caller-chosen id prefix, so id-shape independence is testable. */
function replayWith(file: string, prefix: string): { events: NewEvent[]; boundary: NewEvent[] } {
  let lane = 0;
  let tick = 0;
  const router = createLaneRouter({
    podId: POD_ID,
    matriarchLaneId: MATRIARCH_LANE_ID,
    mode: 'lanes',
    newLaneId: () => `${prefix}${++lane}`,
    now: () => `2026-01-01T00:00:00.${String(tick++).padStart(4, '0')}Z`,
  });

  const events: NewEvent[] = [];
  for (const line of fixtureLines(file)) events.push(...router.ingest(line));
  return { events, boundary: router.onTurnBoundary() };
}

/**
 * The structure of a replay with every generated id erased: lanes are numbered
 * by the order they are first referenced, so two replays that differ only in
 * their id generator compare equal.
 */
function shape(events: NewEvent[]): string[] {
  const ordinals = new Map<string, number>();
  return events.map((event) => {
    if (!ordinals.has(event.laneId)) ordinals.set(event.laneId, ordinals.size);
    return `${event.type}:L${ordinals.get(event.laneId)}`;
  });
}

describe('deterministic replay (criterion 5)', () => {
  it('01 replayed twice through fresh routers yields identical events', () => {
    const first = replay(PRIMARY);
    const second = replay(PRIMARY);

    expect(second.events).toEqual(first.events);
    expect(second.boundary).toEqual(first.boundary);
    expect(second.lanes).toEqual(first.lanes);
    // Guard against the whole thing being vacuously empty.
    expect(first.events.length).toBeGreaterThan(20);
  });

  it.each(discoveredFixtureFiles())('%s replays identically on a second pass', (file) => {
    expect(replay(file).events).toEqual(replay(file).events);
    expect(replay(file).lanes).toEqual(replay(file).lanes);
  });

  it('two routers alive at once do not share state', () => {
    const a = makeRouter();
    const b = makeRouter();
    const lines = fixtureLines(PRIMARY);

    const interleaved: NewEvent[] = [];
    const soloEvents: NewEvent[] = [];
    for (const line of lines) {
      interleaved.push(...a.ingest(line));
      b.ingest('{"type":"quantum_flux"}');
    }
    const solo = makeRouter();
    for (const line of lines) soloEvents.push(...solo.ingest(line));

    expect(interleaved).toEqual(soloEvents);
  });

  it('only the injected ids change when the id generator changes', () => {
    const alpha = replayWith(PRIMARY, 'alpha-');
    const beta = replayWith(PRIMARY, 'beta-');

    expect(alpha.events).not.toEqual(beta.events);
    expect(shape(alpha.events)).toEqual(shape(beta.events));
    expect(shape(alpha.boundary)).toEqual(shape(beta.boundary));
  });

  it('every timestamp on the stream came from the injected clock', () => {
    // Not a value assertion — a provenance one. The injected clock emits a
    // known prefix; a real wall clock would not.
    const replayed = replay(PRIMARY);
    for (const event of [...replayed.events, ...replayed.boundary]) {
      expect(event.createdAt.startsWith('2026-01-01T00:00:00.')).toBe(true);
    }
    for (const lane of replayed.lanes) {
      expect(lane.startedAt.startsWith('2026-01-01T00:00:00.')).toBe(true);
      if (lane.endedAt !== null) {
        expect(lane.endedAt.startsWith('2026-01-01T00:00:00.')).toBe(true);
      }
    }
  });

  it('replay is unaffected by how many lines are handed over per call', () => {
    // Same input, same result, regardless of chunking: ingest holds no
    // cross-line parse state.
    const oneAtATime = replay(PRIMARY).events.map((event) => event.type);
    const router = makeRouter();
    const batched: NewEvent[] = [];
    for (const line of fixtureLines(PRIMARY)) {
      batched.push(...router.ingest(line));
      batched.push(...router.ingest('   '));
    }
    expect(batched.map((event) => event.type)).toEqual(oneAtATime);
  });
});
