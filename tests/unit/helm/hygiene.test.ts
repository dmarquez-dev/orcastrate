/**
 * Source scans. Criterion 1 (the service's boundaries) and criterion 16 (no
 * test may touch a real developer path).
 *
 * "We do not import that" and "no test writes to your settings file" are claims
 * a code review makes once and then stops making. Here they are assertions that
 * run on every commit.
 *
 * The forbidden identifiers are ASSEMBLED FROM PIECES rather than written out,
 * because this file is itself inside the directory being scanned and a literal
 * would make the scan match itself.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const HELM_SRC = fileURLToPath(new URL('../../../src/main/helm/', import.meta.url));
const HELM_TESTS = fileURLToPath(new URL('.', import.meta.url));

function filesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...filesUnder(full));
    else if (full.endsWith('.ts')) out.push(full);
  }
  return out.sort();
}

function read(file: string): string {
  return readFileSync(file, 'utf8');
}

describe('src/main/helm boundaries (criterion 1)', () => {
  const sources = filesUnder(HELM_SRC);

  it('has sources to scan', () => {
    expect(sources.length).toBeGreaterThan(0);
  });

  it('imports electron nowhere', () => {
    for (const file of sources) {
      expect(read(file), file).not.toMatch(/from\s+['"]electron['"]/);
      expect(read(file), file).not.toMatch(/require\(\s*['"]electron['"]\s*\)/);
    }
  });

  it('imports nothing from pod-manager', () => {
    for (const file of sources) {
      expect(read(file), file).not.toMatch(/from\s+['"][^'"]*pod-manager[^'"]*['"]/);
    }
  });

  it('reaches the filesystem only through the one seam', () => {
    for (const file of sources) {
      if (file.endsWith('fs-ops.ts')) continue;
      // `node:fs` types are fine; its functions are not.
      expect(read(file), file).not.toMatch(/^import\s+\{[^}]*\}\s+from\s+['"]node:fs['"]/m);
    }
  });
});

describe('tests/unit/helm hygiene (criterion 16)', () => {
  const tests = filesUnder(HELM_TESTS);

  // Assembled so the scan does not match this file's own source.
  const HOME_DIR = ['home', 'dir'].join('');
  const USER_PROFILE = ['USER', 'PROFILE'].join('');
  const WINDOWS_USERS = ['C:', '\\', 'Users'].join('');
  const POSIX_USERS = ['/', 'Users', '/'].join('');
  const POSIX_HOME = ['/', 'home', '/'].join('');

  it('has tests to scan', () => {
    expect(tests.length).toBeGreaterThan(1);
  });

  it('references no home directory and no developer path', () => {
    for (const file of tests) {
      const text = read(file);
      for (const forbidden of [HOME_DIR, USER_PROFILE, WINDOWS_USERS, POSIX_USERS, POSIX_HOME]) {
        expect(text.includes(forbidden), `${file} references ${forbidden}`).toBe(false);
      }
    }
  });

  it('creates every temp tree in exactly one tracked place, with the agreed prefix', () => {
    // Assembled, like the tokens above, so this file is not its own match.
    const MKDTEMP = ['mkdtemp', 'Sync'].join('');
    const creators = tests.filter((file) => read(file).includes(MKDTEMP));
    expect(creators).toEqual([join(HELM_TESTS, 'helpers.ts')]);
    expect(read(creators[0] as string)).toContain(
      `${MKDTEMP}(join(tmpdir(), 'orcastrate-helm-'))`,
    );
  });

  it('never sleeps or reads the wall clock', () => {
    for (const file of tests) {
      const text = read(file);
      expect(text, file).not.toMatch(/setTimeout\s*\(/);
      expect(text, file).not.toMatch(/Date\.now\s*\(/);
      expect(text, file).not.toMatch(/new Date\(\s*\)/);
    }
  });
});
