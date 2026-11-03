/**
 * THE RENDERER STILL CANNOT NAME A FILE — as a source scan over this whole
 * directory (criterion 2).
 *
 * A DOM test can only prove that TODAY'S markup has no path input. This scan
 * proves the property of the SOURCE, so a later edit that adds a text field
 * and wires it to a scope fails here rather than shipping. It is the same
 * shape of rule as `state/isolation.test.ts`, aimed at a different invariant.
 *
 * THE RULES THEMSELVES LIVE IN `rules.ts`, each with a counterexample, and
 * `discrimination.test.tsx` proves every one of them can fire. This file is
 * only the sweep: it applies them to the real files. Splitting the two is what
 * stops a rule that silently matches nothing from passing here forever.
 *
 * HOW THE FILESYSTEM IS REACHED: exactly as `__tests__/hygiene.test.ts` and
 * `state/isolation.test.ts` reach it. A static `node:` import in this tree
 * would not typecheck (`tsconfig.web.json` sets `"types": []`) and the hygiene
 * suite forbids one anyway; a dynamic import with a non-literal specifier
 * stays out of the module graph and lives only in this file.
 */

import { describe, expect, it } from 'vitest';

import {
  SOURCE_RULES,
  prepareSource,
  selectScopeArguments,
  stripComments,
} from './rules';

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
const HELM_ROOT = `${ROOT}${'/src/renderer/src/helm'}`;

/**
 * The two non-test files the sweep skips, and why each has to be skipped:
 *
 *   - `rules.ts` STATES what is forbidden, so it necessarily contains a sample
 *     path and the name of a path helper.
 *   - `test-fixtures.ts` is scaffolding for the suites, not shipped markup.
 *
 * An exclusion list is a hole, so two tests below close it: the list is
 * asserted to be exactly these two names, and both are asserted to contain no
 * markup at all — nothing excluded here can be hiding a control.
 */
const EXCLUDED = ['rules.ts', 'test-fixtures.ts'];

function isTest(name: string): boolean {
  return /\.test\.(ts|tsx)$/.test(name);
}

async function allFiles(): Promise<{ name: string; text: string }[]> {
  const io = await fs();
  const out: { name: string; text: string }[] = [];
  for (const entry of io.readdirSync(HELM_ROOT, { withFileTypes: true })) {
    if (entry.isDirectory()) continue;
    if (!/\.(ts|tsx)$/.test(entry.name)) continue;
    out.push({ name: entry.name, text: io.readFileSync(`${HELM_ROOT}/${entry.name}`, 'utf-8') });
  }
  return out;
}

async function sources(): Promise<{ name: string; text: string }[]> {
  return (await allFiles()).filter(
    (file) => !isTest(file.name) && !EXCLUDED.includes(file.name),
  );
}

describe('the scan root', () => {
  it('is the checkout this file lives in: the root implies exactly the path of this file', () => {
    const implied = `${ROOT}/src/renderer/src/helm/no-paths.test.ts`;
    expect(SELF, `root mismatch: scanning ${ROOT}, but this file is ${SELF}`).toBe(implied);
  });
});

describe('the Helm panel cannot name a file (criterion 2)', () => {
  it('finds the directory it is supposed to be scanning', async () => {
    const files = await sources();
    expect(files.length).toBeGreaterThan(8);
    expect(files.map((file) => file.name)).toContain('HelmScopePicker.tsx');
  });

  it('skips exactly two non-test files, and no more', async () => {
    const skipped = (await allFiles())
      .filter((file) => !isTest(file.name) && EXCLUDED.includes(file.name))
      .map((file) => file.name)
      .sort();

    expect(skipped).toEqual(EXCLUDED);
  });

  it('lets nothing hide in the skipped files: neither contains markup', async () => {
    const offenders: string[] = [];
    for (const file of await allFiles()) {
      if (!EXCLUDED.includes(file.name)) continue;
      // No JSX at all, so an input cannot be parked where the sweep cannot see
      // it. `rules.ts` names `<input` only inside its own sample strings, which
      // is why the needle is the OPENING of a real element in JSX position.
      if (/^\s*<(?:input|textarea)\b/m.test(stripComments(file.text))) {
        offenders.push(file.name);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('breaks none of the source rules, in any shipped file', async () => {
    const offenders: string[] = [];
    for (const file of await sources()) {
      const prepared = prepareSource(file.text);
      for (const rule of SOURCE_RULES) {
        // The scope picker is the only component that ever sees a path, and is
        // the only one the "no input here" rule is aimed at; every other rule
        // applies everywhere.
        const scoped =
          rule.name === 'offers an input or a textarea in the scope picker'
            ? file.name === 'HelmScopePicker.tsx'
            : true;
        if (scoped && rule.violates(prepared)) offenders.push(`${file.name}: ${rule.name}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('reaches the state layer from exactly one component', async () => {
    const reaching: string[] = [];
    for (const file of await sources()) {
      if (/from\s*['"]\.\.\/state['"]/.test(stripComments(file.text))) reaching.push(file.name);
    }
    expect(reaching).toEqual(['ConnectedHelmPanel.tsx']);
  });

  it('calls selectScope at all, so the bare-identifier rule is not vacuous here', async () => {
    const calls: string[] = [];
    for (const file of await sources()) {
      calls.push(...selectScopeArguments(prepareSource(file.text)));
    }
    expect(calls.length).toBeGreaterThan(0);
  });
});
