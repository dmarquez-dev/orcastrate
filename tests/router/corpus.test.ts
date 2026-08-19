/**
 * Acceptance criteria 1 and 6 — the corpus is COMPLETE and the routing mode has
 * not drifted.
 *
 * Criterion 1: every `.ndjson` in `tests/fixtures/protocol/` is replayed, and a
 * fixture that `fixture-corpus.md` §1 names but the directory does not contain
 * fails LOUDLY here rather than being silently skipped by a glob that matched
 * nothing.
 *
 * Criterion 6: `findings.json` is the T2/T6 contract's machine-readable half
 * (§3). The router's `mode` is asserted against `recommendedRoutingMode` read
 * from the file AT TEST TIME, so a re-probe that flips the answer breaks the
 * build instead of leaving the router quietly routing the wrong way.
 */

import { describe, expect, it } from 'vitest';

import {
  FIXTURE_DIR,
  calves,
  declaredFixtureFiles,
  discoveredFixtureFiles,
  findingFor,
  findings,
  fixtureLines,
  makeRouter,
  replay,
} from './helpers';

const declared = declaredFixtureFiles();
const discovered = discoveredFixtureFiles();

describe('fixture corpus completeness (criterion 1)', () => {
  it('fixture-corpus.md §1 names at least the six contracted captures', () => {
    expect(declared.length).toBeGreaterThanOrEqual(6);
  });

  it.each(declared)('%s, named by the frozen contract, exists on disk', (file) => {
    expect(
      discovered,
      `${file} is named in fixture-corpus.md §1 but is absent from ${FIXTURE_DIR}. ` +
        'The acceptance suite must not silently skip a contracted capture — either ' +
        're-capture it or amend the contract.',
    ).toContain(file);
  });

  it('every capture on disk is one the contract names', () => {
    expect(discovered).toEqual(declared);
  });

  it('every capture on disk has a findings.json fixtures[] entry', () => {
    const described = findings().fixtures.map((entry) => entry.file).sort();
    expect(described).toEqual(discovered);
  });

  it.each(discovered)('%s replays end to end without ingest ever throwing', (file) => {
    const router = makeRouter();
    for (const line of fixtureLines(file)) {
      expect(() => router.ingest(line)).not.toThrow();
    }
    expect(() => router.onTurnBoundary()).not.toThrow();
    // A capture that produced nothing would pass every other assertion in this
    // suite vacuously.
    expect(router.lanes().length).toBeGreaterThan(0);
  });

  it.each(discovered)('%s matches the line count findings.json records', (file) => {
    expect(fixtureLines(file).length).toBe(findingFor(file).lines);
  });

  it.each(discovered)('%s opens the number of Calves findings.json records', (file) => {
    expect(calves(replay(file).lanes).length).toBe(findingFor(file).calvesOpened);
  });

  it.each(discovered)('%s reaches the max lane depth findings.json records', (file) => {
    const depths = calves(replay(file).lanes).map((lane) => lane.depth);
    expect(Math.max(...depths)).toBe(findingFor(file).maxDepth);
  });

  it('each capture contains a complete turn: system init through the result', () => {
    for (const file of discovered) {
      const events = replay(file).events;
      const systems = events.filter((event) => event.type === 'system');
      const subtypes = systems.map((event) => (event.payload as { subtype: string }).subtype);
      expect(subtypes[0], `${file} does not open with a system init (§2)`).toBe('init');
      expect(
        subtypes.some((subtype) => subtype.startsWith('result:')),
        `${file} has no terminal result message (§2)`,
      ).toBe(true);
    }
  });
});

describe('routing mode anti-drift (criterion 6)', () => {
  it('findings.json is the schema version the contract froze', () => {
    expect(findings().schemaVersion).toBe(1);
  });

  it('the router reports the mode findings.json recommends', () => {
    const recommended = findings().recommendedRoutingMode;
    expect(makeRouter({ mode: recommended }).mode).toBe(recommended);
  });

  it('recommendedRoutingMode is derived from parentToolUseId.correlates, per §3', () => {
    const { recommendedRoutingMode, parentToolUseId } = findings();
    expect(recommendedRoutingMode).toBe(parentToolUseId.correlates ? 'lanes' : 'inline');
  });

  it('the recorded answer is still "lanes" — a flip is a build break, not a silent divergence', () => {
    expect(
      findings().recommendedRoutingMode,
      'findings.json now recommends a routing mode other than "lanes". The router ' +
        'ships both branches, but the acceptance expectations in this suite (per-Calf ' +
        'lane assignment, interleaving, nesting) describe "lanes" only. Re-derive them ' +
        'before changing this assertion.',
    ).toBe('lanes');
  });

  it('behaviour under the recommended mode matches what that mode means', () => {
    const recommended = findings().recommendedRoutingMode;
    const events = replay('01-parallel-dispatch.ndjson', { mode: recommended }).events;
    const distinctLanes = new Set(events.map((event) => event.laneId));

    if (recommended === 'lanes') {
      // Two Calves plus the Matriarch: correlation is actually being applied,
      // not merely declared.
      expect(distinctLanes.size).toBe(3);
    } else {
      expect(distinctLanes.size).toBe(1);
    }
  });

  it('nesting is representable, so the depth assertions below are meaningful', () => {
    // §3, "T5's obligation": if this were false the router could not build a
    // tree at all and the nesting suite would be asserting a fiction.
    expect(findings().nesting.distinguishableFromDepth1).toBe(true);
    expect(findings().nesting.depth2Observed).toBe(true);
    // Measured: the field does not exist on the wire; depth comes from chaining
    // parent_tool_use_id instead.
    expect(findings().nesting.parentAgentIdFieldPath).toBeNull();
  });

  it('an agent id is available for every Calf, as the lane records claim', () => {
    expect(findings().agentId.availableForEveryCalf).toBe(true);

    for (const file of discovered) {
      const replayed = replay(file);
      for (const lane of calves(replayed.lanes)) {
        expect(lane.agentId, `${file}: Calf ${lane.id} has no agentId`).not.toBeNull();
        expect(replayed.router.agentIds().get(lane.id)).toBe(lane.agentId);
      }
    }
  });
});
