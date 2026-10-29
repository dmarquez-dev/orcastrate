/**
 * ONE SENTENCE THAT IS NOT TRUE, ASSERTED GONE.
 *
 * `PodsChrome.tsx` used to claim that `pods.open` REFUSES a beached Pod, and
 * `pod-lifecycle.test.tsx` repeated the claim in its header. The sentence is
 * not spelled out anywhere in this file — see `NEEDLE` — because a guard that
 * quotes what it forbids is its own violation. Both were false: no guard in
 * `src/main/ipc/**` refuses `pods.open` for a beached Pod,
 * and `PodManager.onBeached` deletes the session before marking the Pod
 * beached, so `openPod` falls through to the identical `#start(pod, true)` that
 * `reconnectPod` reaches. A comment that a reader trusts and that is wrong is
 * worse than no comment, and this is the only thing that stops it coming back.
 *
 * THE SUBSTRING ACCIDENT THIS FILE IS BUILT TO AVOID. A guard of the shape
 * `expect(source).not.toContain(needle)` passes for free if `needle` is
 * misassembled — a stray space, a missing backtick — because a string that is
 * not in the source is trivially absent. So `proves the needle can fire` below
 * runs the SAME matcher over a synthetic sample that does contain the sentence
 * and requires it to match. If the assembly is wrong, that test fails and this
 * file cannot be green while lying.
 *
 * THE NEEDLE IS ASSEMBLED FROM FRAGMENTS so this file is not its own violation.
 *
 * HOW THE FILESYSTEM IS REACHED: exactly as `__tests__/hygiene.test.ts` reaches
 * it. `tsconfig.web.json` sets `"types": []`, so a static `node:` import here
 * would not typecheck. A dynamic import with a non-literal specifier is
 * untyped, stays out of the module graph, and lives only in this file.
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
const RENDERER_ROOT = `${ROOT}/src/renderer`;

/**
 * The sentence, in three pieces. Deliberately never written out in one: this
 * file is scanned by its own rule.
 */
const NEEDLE = ['answers ', '`pods' + '.open`', ' with an error'].join('');

async function filesUnder(root: string): Promise<string[]> {
  const io = await fs();
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of io.readdirSync(dir, { withFileTypes: true })) {
      const full = `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (/\.(ts|tsx|css)$/.test(entry.name)) out.push(full);
    }
  };
  walk(root);
  return out;
}

describe('the scan root', () => {
  it('is the checkout this file lives in: the root implies exactly the path of this file', () => {
    const implied = `${ROOT}/src/renderer/src/pods/wording.test.ts`;
    expect(SELF, `root mismatch: scanning ${ROOT}, but this file is ${SELF}`).toBe(implied);
  });
});

describe('the false beached-Pod claim', () => {
  it('proves the needle can fire, against a sample that does contain the sentence', () => {
    // The sentence as it stood in `PodsChrome.tsx`, reproduced here in one
    // piece. If `NEEDLE` were misassembled this would fail, which is the whole
    // point: an absence test whose needle can never match proves nothing.
    const sample =
      '   * Pod needs `pods.reconnect` (spec 8) and answ' +
      'ers `pods.open` with an er' +
      'ror.';
    expect(sample).toContain(NEEDLE);
    expect(NEEDLE.length).toBeGreaterThan(30);
  });

  it('appears in no file under src/renderer/**', async () => {
    const io = await fs();
    const files = await filesUnder(RENDERER_ROOT);
    // The walk itself must not be vacuous: a scan of zero files is green.
    expect(files.length).toBeGreaterThan(20);

    const offenders = files.filter((file) => io.readFileSync(file, 'utf-8').includes(NEEDLE));
    // Named, not counted, so a failure says which file to open. This file is
    // excluded from nothing: the needle and the sample above are cut at
    // DIFFERENT points, so neither spells the sentence and a mistake in one
    // assembly is not mirrored in the other.
    expect(offenders.map((file) => file.slice(RENDERER_ROOT.length + 1))).toEqual([]);
  });
});
