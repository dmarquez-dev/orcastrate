/**
 * The structural guarantees — the ones no unit test can catch because they are
 * about which file contains which text.
 *
 *   - `state/` is the ONLY place in `src/renderer/**` that reaches for
 *     `window.orcastrate` (criterion 2).
 *   - the state layer imports no `node:` builtin and composes no filesystem
 *     path (criterion 13).
 *   - the state layer contains no branch that assumes a routing mode
 *     (criterion 12).
 *
 * WHY `fs` IS REACHED THIS WAY: `tsconfig.web.json` sets `"types": []`, so a
 * static `import … from 'node:fs'` would not typecheck — and criterion 13
 * forbids one in this tree anyway. A dynamic import with a non-literal
 * specifier is untyped, stays out of the module graph, and exists only in this
 * test file, never in shipped renderer code.
 */

import { describe, expect, it } from 'vitest';

interface FsLike {
  readdirSync(path: string, options: { withFileTypes: true }): {
    name: string;
    isDirectory(): boolean;
  }[];
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
const RENDERER_ROOT = `${ROOT}/src/renderer/src`;
const STATE_ROOT = `${RENDERER_ROOT}/state`;

async function sourceFiles(root: string): Promise<string[]> {
  const io = await fs();
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of io.readdirSync(dir, { withFileTypes: true })) {
      const full = `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
    }
  };
  walk(root);
  return out;
}

async function read(file: string): Promise<string> {
  return (await fs()).readFileSync(file, 'utf-8');
}

/**
 * Comments are not code. `test-utils/stub-api.ts` legitimately NAMES
 * `window.orcastrate` in prose while touching only its type, and a grep that
 * could not tell the difference would fail on documentation.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('the scan root', () => {
  it('is the checkout this file lives in: the root implies exactly the path of this file', () => {
    const implied = `${RENDERER_ROOT}/state/isolation.test.ts`;
    expect(SELF, `root mismatch: scanning ${RENDERER_ROOT}, but this file is ${SELF}`).toBe(
      implied,
    );
  });
});

describe('renderer isolation (criterion 2)', () => {
  it('finds renderer sources to scan at all', async () => {
    expect((await sourceFiles(RENDERER_ROOT)).length).toBeGreaterThan(5);
  });

  it('is the only place in src/renderer that references window.orcastrate', async () => {
    const offenders: string[] = [];
    for (const file of await sourceFiles(RENDERER_ROOT)) {
      if (file.startsWith(STATE_ROOT)) continue;
      // The frozen contract NAMES the bridge in a type position
      // (`api?: typeof window.orcastrate`). It declares the seam; it does not
      // call it, and it is not this task's to edit.
      if (file.startsWith(`${RENDERER_ROOT}/contracts/`)) continue;
      if (stripComments(await read(file)).includes('window.orcastrate')) {
        offenders.push(file.slice(RENDERER_ROOT.length + 1));
      }
    }
    expect(offenders).toEqual([]);
  });

  it('references window.orcastrate exactly once inside the state layer', async () => {
    let references = 0;
    for (const file of await sourceFiles(STATE_ROOT)) {
      if (/\.test\.(ts|tsx)$/.test(file)) continue;
      const matches = stripComments(await read(file)).match(/window\.orcastrate/g);
      references += matches?.length ?? 0;
    }
    expect(references).toBe(1);
  });
});

describe('security posture (criterion 13)', () => {
  it('imports no node: builtin and composes no filesystem path', async () => {
    for (const file of await sourceFiles(STATE_ROOT)) {
      if (/\.test\.(ts|tsx)$/.test(file)) continue;
      const source = await read(file);
      expect(source, `${file} must not import a node: builtin`).not.toMatch(/from '\s*node:/);
      expect(source, `${file} must not import a node: builtin`).not.toMatch(/import\('node:/);
      expect(source, `${file} must not require()`).not.toMatch(/\brequire\(/);
      // `cwd` is an opaque display string: no joining, splitting or resolving.
      expect(source, `${file} must not manipulate paths`).not.toMatch(
        /\b(path|join|resolve|dirname|basename|normalize)\s*\(/,
      );
    }
  });
});

describe('routing mode is not assumed (criterion 12)', () => {
  it('contains no branch comparing routingMode against a literal', async () => {
    for (const file of await sourceFiles(STATE_ROOT)) {
      if (/\.test\.(ts|tsx)$/.test(file)) continue;
      const source = stripComments(await read(file));
      expect(source, `${file} must not branch on a routing mode literal`).not.toMatch(
        /(===|!==)\s*['"](lanes|inline)['"]/,
      );
      expect(source, `${file} must not branch on a routing mode literal`).not.toMatch(
        /['"](lanes|inline)['"]\s*(===|!==)/,
      );
    }
  });
});
