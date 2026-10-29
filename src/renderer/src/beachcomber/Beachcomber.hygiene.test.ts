/**
 * This directory, read as SOURCE. Three of its acceptance criteria are claims
 * about the code rather than about the rendered output, and a claim nobody
 * checks is a claim that decays:
 *
 *   AC1  nothing here names the preload bridge, and nothing here fetches.
 *   AC6  THERE IS NO PATH FROM A ROW TO A DELETION — `trashPreviewed` is named
 *        in exactly one file, and handed to exactly one child: the preview
 *        dialog, whose confirm button is the only element wired to it.
 *   AC13 no component file has to be scrolled to be understood, and every
 *        stylesheet this directory imports belongs to it.
 *
 * HOW THE FILESYSTEM IS REACHED: exactly as `state/isolation.test.ts` and
 * `__tests__/hygiene.test.ts` reach it. `tsconfig.web.json` sets `"types": []`,
 * so a static `node:` import here would not typecheck, and the renderer-wide
 * hygiene rule forbids one in any case. A dynamic import with a non-literal
 * specifier is untyped, stays out of the module graph, and lives only here.
 *
 * EVERY NEEDLE IS ASSEMBLED FROM FRAGMENTS so this file is not its own
 * violation.
 */

import { describe, expect, it } from 'vitest';

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
const DIR = `${ROOT}/src/renderer/src/beachcomber`;

async function filesIn(extensions: RegExp): Promise<string[]> {
  const io = await fs();
  return io
    .readdirSync(DIR, { withFileTypes: true })
    .filter((entry) => !entry.isDirectory() && extensions.test(entry.name))
    .map((entry) => `${DIR}/${entry.name}`);
}

/** Comments are prose. A rule that cannot tell them from code fails on the
 * documentation that explains the rule — exactly as `__tests__/hygiene.test.ts`
 * found. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

async function read(file: string): Promise<string> {
  return stripComments(await readRaw(file));
}

/** Comments included — the length rule is about what a reader scrolls past. */
async function readRaw(file: string): Promise<string> {
  return (await fs()).readFileSync(file, 'utf-8');
}

function name(file: string): string {
  return file.slice(DIR.length + 1);
}

function isTest(file: string): boolean {
  return /\.test\.tsx?$/.test(file);
}

const BRIDGE = 'window' + '.orcastrate';
const TRASH = 'trash' + 'Previewed';

describe('the scan root', () => {
  it('is the checkout this file lives in: the root implies exactly the path of this file', () => {
    const implied = `${ROOT}/src/renderer/src/beachcomber/Beachcomber.hygiene.test.ts`;
    expect(SELF, `root mismatch: scanning ${ROOT}, but this file is ${SELF}`).toBe(implied);
  });
});

describe('the panel renders from props and hooks alone (AC1)', () => {
  it('finds a directory to scan at all', async () => {
    const files = await filesIn(/\.tsx?$/);
    expect(files.length).toBeGreaterThanOrEqual(10);
  });

  it('never names the preload bridge', async () => {
    const offenders: string[] = [];
    for (const file of await filesIn(/\.tsx?$/)) {
      if ((await read(file)).includes(BRIDGE)) offenders.push(name(file));
    }
    expect(offenders).toEqual([]);
  });

  it('imports nothing from the state layer except the two hooks, and only in the wrapper', async () => {
    const offenders: string[] = [];
    for (const file of await filesIn(/\.tsx?$/)) {
      const text = await read(file);
      if (!/from '\.\.\/state'/.test(text)) continue;
      // One file knows where the data comes from. Every other component takes
      // it as props, which is what lets these tests run without a provider.
      if (name(file) !== 'BeachcomberPanelConnected.tsx') offenders.push(name(file));
    }
    expect(offenders).toEqual([]);
  });

  it('fetches nothing itself — no timer, no subscription, no direct invoke', async () => {
    const needles = ['set' + 'Interval', 'set' + 'Timeout', 'window.' + 'fetch', '.on.' + 'podEvent'];
    const offenders: string[] = [];
    for (const file of await filesIn(/\.tsx?$/)) {
      if (isTest(file)) continue;
      const text = await read(file);
      for (const needle of needles) {
        if (text.includes(needle)) offenders.push(`${name(file)} contains ${needle}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('there is no path from a row to a deletion (AC6)', () => {
  it('names trashPreviewed in exactly one file', async () => {
    const naming: string[] = [];
    for (const file of await filesIn(/\.tsx?$/)) {
      // The fixtures name it because they RECORD it; that is how the panel
      // tests prove it was never called.
      if (isTest(file) || name(file) === 'test-fixtures.ts') continue;
      if ((await read(file)).includes(TRASH)) naming.push(name(file));
    }
    expect(naming).toEqual(['BeachcomberPanel.tsx']);
  });

  it('passes it to the preview dialog and to nothing else', async () => {
    const panel = await read(`${DIR}/BeachcomberPanel.tsx`);
    const at = panel.indexOf('<BeachcomberPreviewDialog');
    expect(at).toBeGreaterThan(0);

    // Everything the panel renders before the dialog — the toolbar, the error
    // surface, every group and every row — is handed no way to call it.
    expect(panel.slice(0, at)).not.toContain(TRASH);
    expect(panel.slice(at)).toContain(TRASH);
    // And it is handed over exactly once.
    expect(panel.split(TRASH)).toHaveLength(2);
  });

  it('has no row, group, toolbar or result component that could reach it', async () => {
    for (const file of [
      'BeachcomberRow.tsx',
      'BeachcomberGroup.tsx',
      'BeachcomberGroupHeader.tsx',
      'BeachcomberToolbar.tsx',
      'BeachcomberResult.tsx',
      'BeachcomberPreviewItem.tsx',
    ]) {
      expect(await read(`${DIR}/${file}`)).not.toContain(TRASH);
    }
  });
});

describe('component boundaries (AC13)', () => {
  it('has no component file long enough to need scrolling', async () => {
    const long: string[] = [];
    for (const file of await filesIn(/\.tsx$/)) {
      if (isTest(file)) continue;
      const lines = (await read(file)).split('\n').length;
      if (lines > 140) long.push(`${name(file)} is ${String(lines)} lines`);
    }
    expect(long).toEqual([]);
  });

  it('imports only its own stylesheets, and only from this directory', async () => {
    const offenders: string[] = [];
    for (const file of await filesIn(/\.tsx?$/)) {
      for (const match of (await read(file)).matchAll(/from '([^']*\.css[^']*)'/g)) {
        const specifier = match[1] ?? '';
        if (!specifier.startsWith('./')) offenders.push(`${name(file)} imports ${specifier}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('keeps its stylesheets inside this directory', async () => {
    const sheets = (await filesIn(/\.module\.css$/)).map(name);
    expect(sheets.sort()).toEqual([
      'Beachcomber.module.css',
      'BeachcomberPreviewDialog.module.css',
    ]);
  });
});
