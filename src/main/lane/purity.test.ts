/**
 * Acceptance criterion 11 as an executable lint rule.
 *
 * The LaneRouter must perform no I/O: it takes SDK messages in and returns
 * normalized events out. That is the precondition for T6 replaying the protocol
 * fixtures without a SQLite file, an Electron main process, or a live CLI.
 *
 * The scan covers the module's SHIPPED files. `*.test.ts` under this directory
 * is excluded and is the one place `node:fs` may appear — reading the sources
 * is how the rule is enforced, and test files are never bundled into the app.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const LANE_DIR = fileURLToPath(new URL('.', import.meta.url));

/** Modules the router may never reach for, directly or transitively by name. */
const FORBIDDEN = [
  'better-sqlite3',
  'node:fs',
  'node:fs/promises',
  'fs',
  'fs/promises',
  'node:path',
  'path',
  'node:child_process',
  'child_process',
  'electron',
  '@anthropic-ai/claude-agent-sdk',
  '../store',
  '../store/index',
];

/** Non-deterministic sources: replay must be byte-identical, so these are out. */
const FORBIDDEN_GLOBALS = ['Date.now', 'new Date(', 'Math.random', 'randomUUID', 'process.hrtime'];

function shippedFiles(): string[] {
  return readdirSync(LANE_DIR)
    .filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))
    .sort();
}

/** Removes block and line comments so prose about a banned token isn't a hit. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function importSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  const patterns = [
    /\bfrom\s*['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const specifier = match[1];
      if (specifier !== undefined) specifiers.push(specifier);
    }
  }
  return specifiers;
}

describe('LaneRouter purity (criterion 11)', () => {
  it('ships at least the router, its readers, and the barrel', () => {
    expect(shippedFiles()).toEqual(['index.ts', 'lane-router.ts', 'messages.ts']);
  });

  it.each(shippedFiles())('%s imports nothing that performs I/O', (name) => {
    const source = stripComments(readFileSync(join(LANE_DIR, name), 'utf8'));
    const specifiers = importSpecifiers(source);

    for (const specifier of specifiers) {
      expect(FORBIDDEN, `${name} imports ${specifier}`).not.toContain(specifier);
    }

    // The only permitted imports are the frozen contracts and siblings.
    for (const specifier of specifiers) {
      expect(
        specifier.startsWith('./') || specifier.startsWith('../../shared/contracts/'),
        `${name} imports ${specifier}, which is neither a sibling nor a frozen contract`,
      ).toBe(true);
    }
  });

  it.each(shippedFiles())('%s reads no ambient clock or entropy source', (name) => {
    const source = stripComments(readFileSync(join(LANE_DIR, name), 'utf8'));
    for (const token of FORBIDDEN_GLOBALS) {
      expect(source, `${name} uses ${token}`).not.toContain(token);
    }
  });
});
