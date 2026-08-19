/**
 * Acceptance criteria 4 and 7, as executable lint rules over this suite itself.
 *
 * Criterion 7: no test in `tests/router/` may spawn the `claude` binary, open a
 * network connection, require an API key, or touch SQLite. The router is pure
 * by contract, so replay needs none of that — and this suite must stay runnable
 * on a machine with no credentials and no CLI installed.
 *
 * Criterion 4 (`fixture-corpus.md` §4): assertions are on STRUCTURE AND
 * CORRELATION only — lane assignment, ordering, open/close pairing, counts,
 * ids. Never on model prose, wall-clock timings, or token counts. Those fields
 * change on every re-run of the probe, so a test naming one is broken by
 * construction. The needles below are assembled from fragments so this file
 * does not trip its own rule.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { ROUTER_TEST_DIR } from './helpers';

function suiteFiles(): string[] {
  return readdirSync(ROUTER_TEST_DIR)
    .filter((name) => name.endsWith('.ts'))
    .sort();
}

function source(name: string): string {
  return readFileSync(join(ROUTER_TEST_DIR, name), 'utf8');
}

/** Strips comments so prose about a banned token is not a hit. */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function importSpecifiers(text: string): string[] {
  const specifiers: string[] = [];
  const patterns = [
    /\bfrom\s*['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      if (match[1] !== undefined) specifiers.push(match[1]);
    }
  }
  return specifiers;
}

/** Reading the fixtures needs fs/path/url; nothing else outside the repo. */
const ALLOWED_BARE_IMPORTS = new Set(['vitest', 'node:fs', 'node:path', 'node:url']);

const FORBIDDEN_IMPORTS = [
  'better-sqlite3',
  'node:sqlite',
  'node:child' + '_process',
  'child' + '_process',
  'node:net',
  'net',
  'node:http',
  'http',
  'node:https',
  'https',
  'node:tls',
  'node:dgram',
  'node:worker_threads',
  'electron',
  '@anthropic-ai/claude-agent-sdk',
];

/** Assembled from fragments so this file is not its own violation. */
const IO_TOKENS = [
  'spawn' + 'Sync',
  'exec' + 'Sync',
  'child' + '_process',
  'ANTHROPIC' + '_API_KEY',
  'CLAUDE' + '_CODE_OAUTH_TOKEN',
  'http' + '://',
  'https' + '://',
  'local' + 'host',
  'claude' + '.exe',
  'new ' + 'Database',
  'write' + 'FileSync',
  'mkdir' + 'Sync',
  'rm' + 'Sync',
];

/**
 * Fields that are real but non-reproducible: timings, token counts, cost. A
 * test naming one is asserting on something the next capture will change.
 */
const NON_DETERMINISTIC_FIELDS = [
  'total' + '_cost_usd',
  'input' + '_tokens',
  'output' + '_tokens',
  'cache' + '_read_' + 'input' + '_tokens',
  'duration' + '_ms',
  'duration' + '_api_ms',
  'num' + '_turns',
  'end' + '_time',
  'service' + '_tier',
  'Date' + '.now(',
  'Math' + '.random(',
];

describe('suite hygiene: no live dependencies (criterion 7)', () => {
  it('the suite is more than this one file', () => {
    expect(suiteFiles().length).toBeGreaterThanOrEqual(6);
    expect(suiteFiles()).toContain('helpers.ts');
  });

  it.each(suiteFiles())('%s imports nothing that reaches a process, a socket, or a database', (name) => {
    const text = stripComments(source(name));
    for (const specifier of importSpecifiers(text)) {
      expect(FORBIDDEN_IMPORTS, `${name} imports ${specifier}`).not.toContain(specifier);
      if (specifier.startsWith('.')) continue;
      expect(
        ALLOWED_BARE_IMPORTS.has(specifier),
        `${name} imports ${specifier}, which is not on the allow-list`,
      ).toBe(true);
    }
  });

  it.each(suiteFiles())('%s names no process, network, credential or SQLite handle', (name) => {
    const text = stripComments(source(name));
    for (const token of IO_TOKENS) {
      expect(text.includes(token), `${name} contains ${token}`).toBe(false);
    }
  });

  it.each(suiteFiles())('%s reaches only into the fixtures and the frozen contracts', (name) => {
    const text = stripComments(source(name));
    for (const specifier of importSpecifiers(text).filter((s) => s.startsWith('.'))) {
      const permitted =
        specifier.startsWith('./') ||
        specifier.startsWith('../../src/shared/contracts/') ||
        specifier === '../../src/main/lane';
      expect(permitted, `${name} imports ${specifier}`).toBe(true);
    }
  });
});

describe('suite hygiene: structure and correlation only (criterion 4)', () => {
  it.each(suiteFiles())('%s asserts on no timing, token-count or cost field', (name) => {
    const text = stripComments(source(name));
    for (const field of NON_DETERMINISTIC_FIELDS) {
      expect(
        text.includes(field),
        `${name} references ${field}, which changes on every capture (fixture-corpus.md §4)`,
      ).toBe(false);
    }
  });

  it.each(suiteFiles())('%s hardcodes no captured id, session id or model name', (name) => {
    const text = stripComments(source(name));
    // Captured ids are per-capture (README "Determinism"): compare them to each
    // other, never to a constant.
    expect(text, `${name} hardcodes a tool_use id`).not.toMatch(/toolu_[A-Za-z0-9]{6,}/);
    expect(text, `${name} hardcodes an SDK message id`).not.toMatch(/msg_[A-Za-z0-9]{6,}/);
    expect(text, `${name} hardcodes a model name`).not.toMatch(/claude-(sonnet|haiku|opus)-/);
    // Agent ids in this corpus are 17 lowercase hex characters.
    expect(text, `${name} hardcodes an agent id`).not.toMatch(/['"][0-9a-f]{17}['"]/);
  });
});
