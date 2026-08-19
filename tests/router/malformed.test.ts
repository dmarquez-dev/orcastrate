/**
 * Design-spec section 9 — MALFORMED-LINE TOLERANCE, and spec 8: "logged with
 * the raw line and skipped; the stream is not torn down."
 *
 * `05-malformed.ndjson` is the one file `fixture-corpus.md` §2 exempts from
 * "verbatim": it is `03-tool-result-close.ndjson` with line 11 truncated, line
 * 13 non-JSON, and line 15 a syntactically valid object of unknown `type`, with
 * valid lines on both sides of every corruption. The corruption sites are
 * LOCATED by scanning, so a re-derivation that moves them does not silently
 * disarm this suite.
 */

import { describe, expect, it } from 'vitest';

import { calves, fixtureLines, makeRouter, replay } from './helpers';

const MALFORMED = '05-malformed.ndjson';
const BASELINE = '03-tool-result-close.ndjson';

interface Corruption {
  /** 1-based line. */
  line: number;
  kind: 'unparseable' | 'unknown-type';
}

function corruptions(file: string): Corruption[] {
  const found: Corruption[] = [];
  fixtureLines(file).forEach((line, index) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      found.push({ line: index + 1, kind: 'unparseable' });
      return;
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      found.push({ line: index + 1, kind: 'unparseable' });
      return;
    }
    const type = (parsed as Record<string, unknown>)['type'];
    const known = ['assistant', 'user', 'result', 'system', 'rate_limit_event'];
    if (typeof type !== 'string' || !known.includes(type)) {
      found.push({ line: index + 1, kind: 'unknown-type' });
    }
  });
  return found;
}

describe('malformed-line tolerance (spec 9 / spec 8)', () => {
  it('05 carries the three corruption kinds the contract requires', () => {
    const found = corruptions(MALFORMED);
    // §2: at least one truncated JSON line, one non-JSON line, one valid object
    // of unknown type.
    expect(found.filter((entry) => entry.kind === 'unparseable').length).toBeGreaterThanOrEqual(2);
    expect(found.filter((entry) => entry.kind === 'unknown-type').length).toBeGreaterThanOrEqual(1);
    expect(found).toHaveLength(3);
  });

  it('05 surrounds every corruption with valid lines on both sides', () => {
    const lines = fixtureLines(MALFORMED);
    const broken = new Set(corruptions(MALFORMED).map((entry) => entry.line));

    for (const line of broken) {
      expect(line, 'a corruption on the first line would not prove survival').toBeGreaterThan(1);
      expect(line).toBeLessThan(lines.length);
      expect(broken.has(line - 1) && broken.has(line + 1)).toBe(false);
    }
  });

  it('05: each corrupted line yields exactly one malformed event and nothing else', () => {
    const replayed = replay(MALFORMED);
    const broken = corruptions(MALFORMED).map((entry) => entry.line);

    for (const line of broken) {
      const produced = replayed.perLine[line - 1]!;
      expect(produced.map((event) => event.type), `line ${line}`).toEqual(['malformed']);
    }
    expect(replayed.events.filter((event) => event.type === 'malformed')).toHaveLength(broken.length);
  });

  it('05: a malformed event carries the raw line and a reason, on the Matriarch lane', () => {
    const replayed = replay(MALFORMED);
    const sourceLines = fixtureLines(MALFORMED);
    const broken = corruptions(MALFORMED).map((entry) => entry.line);

    for (const line of broken) {
      const event = replayed.perLine[line - 1]![0]!;
      const payload = event.payload as { rawLine: string; parseError: string };

      expect(event.laneId).toBe(replayed.lanes[0]!.id);
      expect(typeof payload.parseError).toBe('string');
      expect(payload.parseError.length).toBeGreaterThan(0);
      expect(payload.rawLine.length).toBeGreaterThan(0);
      // The raw line is preserved well enough to identify the source line —
      // compared to the capture, never to a literal.
      expect(sourceLines[line - 1]!.includes(payload.rawLine.slice(0, 24))).toBe(true);
    }
  });

  it('05: the stream survives — valid lines around every corruption still produce events', () => {
    const replayed = replay(MALFORMED);
    const broken = new Set(corruptions(MALFORMED).map((entry) => entry.line));

    for (const line of broken) {
      expect(replayed.perLine[line - 2]!.length, `line ${line - 1} before corruption`).toBeGreaterThan(0);
      expect(replayed.perLine[line]!.length, `line ${line + 1} after corruption`).toBeGreaterThan(0);
    }

    // And it survives all the way to the end of the turn.
    const subtypes = replayed.events
      .filter((event) => event.type === 'system')
      .map((event) => (event.payload as { subtype: string }).subtype);
    expect(subtypes.some((subtype) => subtype.startsWith('result:'))).toBe(true);
  });

  it('05: corruption changes nothing about the lane the underlying capture produced', () => {
    // 05 is derived from 03. Every structural fact about the Calf must be
    // identical; only the malformed events differ.
    const corrupted = replay(MALFORMED);
    const baseline = replay(BASELINE);

    const corruptedCalf = calves(corrupted.lanes)[0]!;
    const baselineCalf = calves(baseline.lanes)[0]!;

    expect(corruptedCalf.toolUseId).toBe(baselineCalf.toolUseId);
    expect(corruptedCalf.agentId).toBe(baselineCalf.agentId);
    expect(corruptedCalf.depth).toBe(baselineCalf.depth);
    expect(corruptedCalf.status).toBe('done');
    expect(corrupted.boundary).toHaveLength(0);
  });

  it('05: no malformed line ever opens or closes a lane', () => {
    const replayed = replay(MALFORMED);
    for (const line of corruptions(MALFORMED).map((entry) => entry.line)) {
      const types = replayed.perLine[line - 1]!.map((event) => event.type);
      expect(types).not.toContain('lane_opened');
      expect(types).not.toContain('lane_closed');
    }
  });

  it('ingest survives inputs no capture contains, without throwing', () => {
    // The contract: "ingest must not throw on any input." Spec 8 is about the
    // stream staying up, so the adversarial cases matter as much as the planted
    // ones.
    const router = makeRouter();
    const nasty: unknown[] = [
      '',
      '   ',
      '{',
      '[]',
      'null',
      '"a string"',
      '{"no_type":true}',
      '{"type":42}',
      null,
      undefined,
      42,
      [],
      {},
      { type: 'assistant' },
      { type: 'assistant', message: { content: 'plain text' } },
      { type: 'assistant', message: { content: [{ type: 'tool_use' }] } },
      { type: 'user', message: { content: [{ type: 'tool_result' }] } },
      { type: 'system', subtype: 'task_updated' },
      { type: 'system', subtype: 'task_updated', patch: { status: 'in_progress' } },
    ];

    for (const input of nasty) {
      expect(() => router.ingest(input), `ingest threw on ${String(input)}`).not.toThrow();
    }
    // Blank lines are not events; nothing has been invented out of noise.
    expect(router.ingest('')).toHaveLength(0);
    expect(calves(router.lanes())).toHaveLength(0);
  });
});
