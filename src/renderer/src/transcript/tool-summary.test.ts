/**
 * `summarizeToolCall` IS TOTAL, PROVED — not assumed.
 *
 * Default `node` environment: none of this touches the DOM, and the corpus
 * half reads six recorded protocol captures off disk.
 *
 * HOW THE FILESYSTEM IS REACHED: exactly as `__tests__/hygiene.test.ts` and
 * `pods/wording.test.ts` reach it. `tsconfig.web.json` sets `"types": []`, so a
 * static `node:` import in this tree would not typecheck — and the renderer-wide
 * hygiene rule forbids one anyway. A dynamic import with a non-literal
 * specifier is untyped, stays out of the module graph, and lives only here.
 */

import { describe, expect, it } from 'vitest';

import {
  PRIMARY_ARG_KEYS,
  TOOL_SUMMARY_MAX_CHARS,
  UNKNOWN_TOOL_NAME,
  summarizeToolCall,
  toolResultCharCount,
  toolResultSizeLabel,
} from './tool-summary';

interface Dirent {
  name: string;
  isDirectory(): boolean;
}

interface FsLike {
  readdirSync(path: string, options: { withFileTypes: true }): Dirent[];
  readFileSync(path: string, encoding: 'utf-8'): string;
}

const NODE_FS = 'node:' + 'fs';

async function fs(): Promise<FsLike> {
  return (await import(/* @vite-ignore */ NODE_FS)) as FsLike;
}

const NODE_URL = 'node:' + 'url';

interface UrlLike {
  fileURLToPath(url: URL): string;
}

const { fileURLToPath } = (await import(/* @vite-ignore */ NODE_URL)) as UrlLike;

/**
 * Found from this file's own location, never from the runner's working
 * directory: a run started in another checkout would otherwise scan that
 * checkout's tree, and pass while measuring the wrong commit. The relative
 * path is a constant rather than a literal, and that is load-bearing under
 * jsdom: Vite rewrites `new URL` over a string literal and `import.meta.url`
 * into a dev-server `http:` URL, which `fileURLToPath` rejects.
 */
const UP_TO_REPO = '../../../../';
const ROOT = fileURLToPath(new URL(UP_TO_REPO, import.meta.url))
  .replace(/\\/g, '/')
  .replace(/\/$/, '');
/** This file's own path, located from itself, for the root-mismatch guard. */
const SELF = fileURLToPath(new URL(import.meta.url)).replace(/\\/g, '/');
const PROTOCOL_DIR = `${ROOT}/tests/fixtures/protocol`;

/**
 * The ELIDED VALUE: what is between the brackets, with the quote pair that
 * decorates a shown value stripped. `TOOL_SUMMARY_MAX_CHARS` is "the elision
 * budget for the VALUE inside the brackets", so neither the two brackets nor
 * the two quotes is charged against it — and that reading is written down once,
 * here, rather than re-assumed at each call site.
 */
function brackets(summary: string, name: string): string {
  const inner = summary.slice(name.length);
  expect(inner.startsWith('(')).toBe(true);
  expect(inner.endsWith(')')).toBe(true);
  const content = inner.slice(1, -1);
  return content.length >= 2 && content.startsWith('"') && content.endsWith('"')
    ? content.slice(1, -1)
    : content;
}

/** A high or low surrogate with no partner — what a naive UTF-16 cut leaves. */
const LONE_SURROGATE = new RegExp(
  '[\\uD800-\\uDBFF](?![\\uDC00-\\uDFFF])|(?<![\\uD800-\\uDBFF])[\\uDC00-\\uDFFF]',
);

// ---------------------------------------------------------------------------
// (a) Generated input — every hostile shape, against three tool names
// ---------------------------------------------------------------------------

function circular(): unknown {
  const node: Record<string, unknown> = { label: 'root' };
  node.self = node;
  return node;
}

function throwingGetter(): unknown {
  return Object.defineProperty({}, 'boom', {
    enumerable: true,
    get() {
      throw new Error('this getter always throws');
    },
  });
}

function symbolKeyed(): unknown {
  return { [Symbol('hidden')]: 'value' };
}

const HOSTILE_INPUTS: readonly [string, unknown][] = [
  ['undefined', undefined],
  ['null', null],
  ['zero', 0],
  ['empty string', ''],
  ['empty array', []],
  ['empty object', {}],
  ['circular object', circular()],
  ['object whose only key throws on read', throwingGetter()],
  ['symbol-keyed object', symbolKeyed()],
  ['bigint', BigInt('9007199254740993')],
  ['100 KB string', 'x'.repeat(100 * 1024)],
  ['multi-line string', 'first line\nsecond line\r\nthird line'],
  // The elision boundary lands mid-string, and every code point is an
  // astral-plane emoji, so a cut on UTF-16 units would split a surrogate pair.
  ['emoji string that straddles the elision boundary', '🐋'.repeat(TOOL_SUMMARY_MAX_CHARS + 40)],
  ['array of values', [1, 2, 3]],
  ['function', () => undefined],
  ['boolean', true],
  ['symbol', Symbol('sym')],
  ['deeply nested object', { a: { b: { c: { d: 'e' } } } }],
  ['object with two unrecognised keys', { alpha: 1, beta: 2 }],
  ['object with one unrecognised key', { alpha: 'only' }],
];

const NAMES: readonly [string, string][] = [
  ['empty name', ''],
  ['normal name', 'WebFetch'],
  ['200-character name', 'N'.repeat(200)],
];

describe('the scan root', () => {
  it('is the checkout this file lives in: the root implies exactly the path of this file', () => {
    const implied = `${ROOT}/src/renderer/src/transcript/tool-summary.test.ts`;
    expect(SELF, `root mismatch: scanning ${ROOT}, but this file is ${SELF}`).toBe(implied);
  });
});

describe('summarizeToolCall is TOTAL over generated input', () => {
  for (const [nameLabel, name] of NAMES) {
    for (const [inputLabel, input] of HOSTILE_INPUTS) {
      it(`${nameLabel} × ${inputLabel}`, () => {
        let summary = '';
        expect(() => {
          summary = summarizeToolCall(name, input);
        }).not.toThrow();

        expect(typeof summary).toBe('string');
        expect(summary.length).toBeGreaterThan(0);
        expect(summary).not.toContain('\n');
        expect(summary).not.toContain('\r');
        expect(LONE_SURROGATE.test(summary)).toBe(false);

        const displayName = name.length === 0 ? UNKNOWN_TOOL_NAME : name;
        expect(summary.startsWith(displayName)).toBe(true);

        // At most `TOOL_SUMMARY_MAX_CHARS` CODE POINTS past the name.
        expect([...brackets(summary, displayName)].length).toBeLessThanOrEqual(
          TOOL_SUMMARY_MAX_CHARS,
        );
      });
    }
  }

  it('never splits a surrogate pair at the elision boundary', () => {
    // The matcher can fire — a rule that cannot is worse than no rule.
    expect(LONE_SURROGATE.test('\uD83D')).toBe(true);
    expect(LONE_SURROGATE.test('🐋')).toBe(false);

    const summary = summarizeToolCall('Read', '🐋'.repeat(TOOL_SUMMARY_MAX_CHARS + 40));
    expect(LONE_SURROGATE.test(summary)).toBe(false);
    // It really WAS elided — otherwise "no lone surrogate" is trivially true.
    expect(summary.endsWith('…")')).toBe(true);
    expect([...brackets(summary, 'Read')]).toHaveLength(TOOL_SUMMARY_MAX_CHARS);
  });
});

// ---------------------------------------------------------------------------
// The ladder, branch by branch, and BOTH halves of the stated fallback by name
// ---------------------------------------------------------------------------

describe('the summary ladder, in the order the contract declares', () => {
  it('1 — a non-empty string input is the whole argument', () => {
    expect(summarizeToolCall('Bash', 'ls -la')).toBe('Bash("ls -la")');
  });

  it('2 — a recognised ARGUMENT NAME wins, whatever the tool is called', () => {
    // The point of keying on arguments rather than tool names: a tool nobody
    // has ever heard of still summarises, because `url` is a name shared across
    // tools and a table of tool names is wrong the day a new tool ships.
    expect(
      summarizeToolCall('SomeToolShippedNextYear', { url: 'https://example.test/x', extra: 1 }),
    ).toBe('SomeToolShippedNextYear("https://example.test/x")');
    expect(summarizeToolCall('Read', { file_path: '/tmp/a.txt', limit: 20 })).toBe(
      'Read("/tmp/a.txt")',
    );
  });

  it('2 — ties break in the order PRIMARY_ARG_KEYS declares, not in key order', () => {
    // `command` is declared before `pattern`; the object lists them the other
    // way round, so an implementation walking `Object.keys` would disagree.
    expect(PRIMARY_ARG_KEYS.indexOf('command')).toBeLessThan(PRIMARY_ARG_KEYS.indexOf('pattern'));
    expect(summarizeToolCall('Odd', { pattern: 'p', command: 'c' })).toBe('Odd("c")');
  });

  it('3 — a lone unrecognised key is still shown', () => {
    expect(summarizeToolCall('Odd', { whatever: 'shown' })).toBe('Odd("shown")');
  });

  it('4 — THE STATED FALLBACK, both branches, by name, singular at one', () => {
    expect(summarizeToolCall('Odd', { alpha: 1, beta: 2 })).toBe('Odd(2 args)');
    expect(summarizeToolCall('Odd', {})).toBe('Odd(no args)');
    // A single key whose value is not showable falls through to the count —
    // `Odd("null")` would be worse than `Odd(1 arg)`.
    expect(summarizeToolCall('Odd', { alpha: { nested: true } })).toBe('Odd(1 arg)');
    expect(summarizeToolCall('Odd', { alpha: null })).toBe('Odd(1 arg)');
    // It is NEVER an empty string, NEVER "unknown", NEVER a raw JSON dump.
    for (const input of [{}, { a: 1, b: 2 }, { a: {} }]) {
      const summary = summarizeToolCall('Odd', input);
      expect(summary).not.toBe('Odd()');
      expect(summary).not.toContain('unknown');
      expect(summary).not.toContain('{');
    }
  });

  it('5 — anything else renders through JSON or String(), never empty', () => {
    expect(summarizeToolCall('Odd', 42)).toBe('Odd(42)');
    expect(summarizeToolCall('Odd', true)).toBe('Odd(true)');
    expect(summarizeToolCall('Odd', null)).toBe('Odd(null)');
    expect(summarizeToolCall('Odd', BigInt(7))).toBe('Odd(7)');
  });

  it('names an unnamed tool "unknown tool" rather than rendering nothing', () => {
    expect(summarizeToolCall('', { url: 'u' })).toBe('unknown tool("u")');
    expect(summarizeToolCall('   ', {})).toBe('unknown tool(no args)');
    // Not a string at all — the guarantee is over EVERY pair without exception.
    expect(summarizeToolCall(undefined as unknown as string, {})).toBe('unknown tool(no args)');
  });

  it('collapses a multi-line value to single spaces rather than cutting at the newline', () => {
    expect(summarizeToolCall('Bash', { command: 'one\ntwo\nthree' })).toBe('Bash("one two three")');
  });
});

// ---------------------------------------------------------------------------
// (b) Real recorded input — the six protocol captures
// ---------------------------------------------------------------------------

/** Every `tool_use` content block in the recorded NDJSON, name and input. */
async function recordedToolUseBlocks(): Promise<{ name: string; input: unknown }[]> {
  const io = await fs();
  const files = io
    .readdirSync(PROTOCOL_DIR, { withFileTypes: true })
    .filter((entry) => !entry.isDirectory() && entry.name.endsWith('.ndjson'))
    .map((entry) => `${PROTOCOL_DIR}/${entry.name}`);

  const blocks: { name: string; input: unknown }[] = [];
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const child of node) visit(child);
      return;
    }
    if (typeof node !== 'object' || node === null) return;
    const record = node as Record<string, unknown>;
    if (record.type === 'tool_use' && typeof record.name === 'string') {
      blocks.push({ name: record.name, input: record.input });
    }
    for (const value of Object.values(record)) visit(value);
  };

  for (const file of files) {
    for (const line of io.readFileSync(file, 'utf-8').split('\n')) {
      if (line.trim().length === 0) continue;
      try {
        visit(JSON.parse(line));
      } catch {
        // `05-malformed.ndjson` carries unparseable lines ON PURPOSE. They are
        // not tool calls; skipping them is the point of that capture.
      }
    }
  }
  return blocks;
}

describe('summarizeToolCall over REAL recorded tool calls', () => {
  it('finds the six captures and extracts tool_use blocks from them', async () => {
    const io = await fs();
    const files = io
      .readdirSync(PROTOCOL_DIR, { withFileTypes: true })
      .filter((entry) => entry.name.endsWith('.ndjson'));
    expect(files).toHaveLength(6);

    // THE VACUITY GUARD, BEFORE THE LOOP. A corpus that extracted nothing would
    // make every assertion below pass on an empty array.
    const blocks = await recordedToolUseBlocks();
    expect(blocks.length).toBeGreaterThan(0);
  });

  it('summarises every recorded call: non-empty, one line, starting with its name', async () => {
    const blocks = await recordedToolUseBlocks();
    expect(blocks.length).toBeGreaterThan(0);

    const summaries = new Set<string>();
    for (const block of blocks) {
      const summary = summarizeToolCall(block.name, block.input);
      expect(summary.length, `${block.name} summarised to nothing`).toBeGreaterThan(0);
      expect(summary.startsWith(block.name), `${block.name}: ${summary}`).toBe(true);
      expect(summary, `${block.name}: ${summary}`).not.toContain('\n');
      expect([...brackets(summary, block.name)].length).toBeLessThanOrEqual(TOOL_SUMMARY_MAX_CHARS);
      summaries.add(summary);
    }

    // And they are not all the same string — a summariser returning
    // `Name(no args)` for everything would satisfy every assertion above.
    expect(summaries.size).toBeGreaterThan(1);
  });

  it('the recorded corpus really does exercise more than one tool', async () => {
    const blocks = await recordedToolUseBlocks();
    expect(new Set(blocks.map((b) => b.name)).size).toBeGreaterThan(1);
  });
});

// ---------------------------------------------------------------------------
// The size, and its label
// ---------------------------------------------------------------------------

describe('toolResultCharCount is total and never throws', () => {
  it('reports a string by its length, and nothing by zero', () => {
    expect(toolResultCharCount('x'.repeat(312))).toBe(312);
    expect(toolResultCharCount('')).toBe(0);
    expect(toolResultCharCount(null)).toBe(0);
    expect(toolResultCharCount(undefined)).toBe(0);
  });

  it('falls back to JSON, then to String(), without throwing', () => {
    expect(toolResultCharCount({ ok: true })).toBe(JSON.stringify({ ok: true }).length);
    for (const hostile of [circular(), throwingGetter(), BigInt(1), Symbol('s'), () => 1]) {
      let count = -1;
      expect(() => {
        count = toolResultCharCount(hostile);
      }).not.toThrow();
      expect(count).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('toolResultSizeLabel is singular at one', () => {
  it('reads "1 char" at one and "N chars" otherwise', () => {
    expect(toolResultSizeLabel(0)).toBe('0 chars');
    expect(toolResultSizeLabel(1)).toBe('1 char');
    expect(toolResultSizeLabel(2)).toBe('2 chars');
    expect(toolResultSizeLabel(312)).toBe('312 chars');
  });
});
