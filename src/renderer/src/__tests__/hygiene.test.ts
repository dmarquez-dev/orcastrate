// @vitest-environment jsdom
/**
 * Security and token hygiene, as executable assertions over the renderer
 * source tree (acceptance criteria 9 and 11). Modelled on
 * `tests/router/hygiene.test.ts`, which does the same job for the replay suite.
 *
 * WHAT IS CHECKED, and nothing wider:
 *   - no file under `src/renderer/**` imports a `node:` builtin, `electron`,
 *     or `better-sqlite3`;
 *   - no file outside `src/renderer/src/state/**` references the preload
 *     bridge;
 *   - no file under `src/renderer/**` outside `styles/` carries a hex colour,
 *     an `rgb(`/`hsl(` literal, a px font-size, or a hardcoded font stack.
 *
 * WHAT IS DELIBERATELY NOT CHECKED: raw lengths in general. `1px` hairlines,
 * the screen-reader clip recipe and em letter-spacing appear across six
 * component directories because `TOKENS` has no border-width, tracking or
 * font-weight token. That is a known gap in the token set, not a deviation by
 * any of those tasks, and a rule that failed on it would be asserting a
 * decision nobody made. See T8's report.
 *
 * HOW THE FILESYSTEM IS REACHED: exactly as `state/isolation.test.ts` reaches
 * it. `tsconfig.web.json` sets `"types": []`, so a static `node:` import in
 * this tree would not typecheck — and the first rule above forbids one anyway.
 * A dynamic import with a non-literal specifier is untyped, stays out of the
 * module graph, and lives only in this file.
 *
 * EVERY NEEDLE BELOW IS ASSEMBLED FROM FRAGMENTS so this file is not its own
 * violation, and every matcher is proved against a synthetic sample first —
 * a hygiene rule that cannot fire is worse than no rule.
 */

import { describe, expect, it } from 'vitest';

declare const process: { cwd(): string };

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

const ROOT = process.cwd().replace(/\\/g, '/');
const RENDERER_ROOT = `${ROOT}/src/renderer`;
const STATE_ROOT = `${RENDERER_ROOT}/src/state`;
const STYLES_ROOT = `${RENDERER_ROOT}/src/styles`;
const TESTS_ROOT = `${RENDERER_ROOT}/src/__tests__`;
const CONTRACT_STATE = `${RENDERER_ROOT}/src/contracts/renderer-state.ts`;

async function filesUnder(root: string, extensions: RegExp): Promise<string[]> {
  const io = await fs();
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of io.readdirSync(dir, { withFileTypes: true })) {
      const full = `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (extensions.test(entry.name)) out.push(full);
    }
  };
  walk(root);
  return out;
}

async function read(file: string): Promise<string> {
  return (await fs()).readFileSync(file, 'utf-8');
}

function relative(file: string): string {
  return file.slice(ROOT.length + 1);
}

/** Comments are prose. A rule that cannot tell them from code fails on docs. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** CSS has only block comments; the `//` rule above would eat `url(//…)`. */
function stripCssComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '');
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

/** The value of every `prop: …` declaration, CSS or JSX-style alike. */
function declaredValues(text: string, prop: string): string[] {
  const out: string[] = [];
  for (const match of text.matchAll(new RegExp(`${prop}\\s*:\\s*([^;\\n}]*)`, 'gi'))) {
    if (match[1] !== undefined) out.push(match[1].trim());
  }
  return out;
}

// --- needles, assembled ------------------------------------------------------

const BRIDGE = 'window' + '.orcastrate';
const FONT_SIZE_CSS = 'font-' + 'size';
const FONT_SIZE_JS = 'font' + 'Size';
const FONT_FAMILY_CSS = 'font-' + 'family';
const FONT_FAMILY_JS = 'font' + 'Family';

const HEX_COLOUR = new RegExp('#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})(?![-\\w])');
const FUNCTIONAL_COLOUR = /\b(?:rgba?|hsla?)\(/;
const PX_LENGTH = /\b\d+(?:\.\d+)?(?:px|pt)\b/;

const FORBIDDEN_MODULES = ['electron', 'better-sqlite3', '@anthropic-ai/claude-agent-sdk'];

/** Assembled so this file does not trip its own criterion-11 rule. */
const IO_TOKENS = [
  'spawn' + 'Sync',
  'exec' + 'Sync',
  'child' + '_process',
  'ANTHROPIC' + '_API_KEY',
  'CLAUDE' + '_CODE_OAUTH_TOKEN',
  'http' + '://',
  'https' + '://',
  'local' + 'host',
  'new ' + 'Database',
  'write' + 'FileSync',
  'mkdir' + 'Sync',
  'rm' + 'Sync',
];

// ---------------------------------------------------------------------------
// The matchers can fire
// ---------------------------------------------------------------------------

describe('the hygiene matchers themselves', () => {
  it('catch a synthetic violation of every rule they enforce', () => {
    expect(HEX_COLOUR.test('color: ' + '#' + '1a2b3c;')).toBe(true);
    expect(HEX_COLOUR.test('color: var(--oc-fg);')).toBe(false);
    // An element id that merely starts with hex-looking letters is not a colour.
    expect(HEX_COLOUR.test('#' + 'ab-cd')).toBe(false);

    expect(FUNCTIONAL_COLOUR.test('background: ' + 'rgb' + '(1, 2, 3);')).toBe(true);
    expect(FUNCTIONAL_COLOUR.test('background: ' + 'hsl' + '(1, 2%, 3%);')).toBe(true);

    expect(declaredValues(`${FONT_SIZE_CSS}: 13` + 'px;', FONT_SIZE_CSS)).toEqual(['13' + 'px']);
    expect(PX_LENGTH.test('13' + 'px')).toBe(true);
    expect(PX_LENGTH.test('var(--oc-text-sm)')).toBe(false);

    expect(declaredValues(`${FONT_FAMILY_CSS}: Helvetica, sans-serif;`, FONT_FAMILY_CSS)).toEqual([
      'Helvetica, sans-serif',
    ]);
  });
});

// ---------------------------------------------------------------------------
// Criterion 9
// ---------------------------------------------------------------------------

describe('renderer security hygiene (criterion 9)', () => {
  it('finds a renderer tree to scan at all', async () => {
    const sources = await filesUnder(RENDERER_ROOT, /\.(ts|tsx)$/);
    const styled = await filesUnder(RENDERER_ROOT, /\.(css|html)$/);
    expect(sources.length).toBeGreaterThan(30);
    expect(styled.length).toBeGreaterThan(10);
  });

  it('imports no node: builtin, no electron, and no better-sqlite3', async () => {
    const offenders: string[] = [];
    for (const file of await filesUnder(RENDERER_ROOT, /\.(ts|tsx)$/)) {
      const text = stripComments(await read(file));
      for (const specifier of importSpecifiers(text)) {
        if (specifier.startsWith('node:') || FORBIDDEN_MODULES.includes(specifier)) {
          offenders.push(`${relative(file)} imports ${specifier}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('reaches the preload bridge only from the state layer', async () => {
    const offenders: string[] = [];
    for (const file of await filesUnder(RENDERER_ROOT, /\.(ts|tsx)$/)) {
      if (file.startsWith(`${STATE_ROOT}/`)) continue;
      const text = stripComments(await read(file));
      if (!text.includes(BRIDGE)) continue;
      // The FROZEN contract names the bridge in a type position
      // (`api?: typeof <bridge>`). It declares the seam; it does not call it,
      // and it is not this task's to edit.
      if (file === CONTRACT_STATE) {
        const uses = [...text.matchAll(new RegExp(`(\\w+\\s+)?${BRIDGE.replace('.', '\\.')}`, 'g'))];
        expect(uses.length, 'contract reference count').toBe(1);
        expect(uses[0]?.[1]?.trim(), 'the contract reference is a type position').toBe('typeof');
        continue;
      }
      offenders.push(relative(file));
    }
    expect(offenders).toEqual([]);
  });
});

/**
 * The token rules scan everything that STYLES something: components and their
 * stylesheets, plus the HTML shell. Test files are excluded, and only from
 * these three rules — a test that asserts "this stylesheet contains no hex
 * colour" has to be able to write the pattern for one, and
 * `Composer.styles.test.ts` and `PermissionCards.styles.test.ts` both do. The
 * import and bridge rules above still cover every file, tests included.
 */
function isTestFile(file: string): boolean {
  return /\.test\.(ts|tsx)$/.test(file);
}

describe('renderer token hygiene (criterion 9)', () => {
  it('hardcodes no colour outside styles/', async () => {
    const offenders: string[] = [];
    for (const file of await filesUnder(RENDERER_ROOT, /\.(ts|tsx|css|html)$/)) {
      if (file.startsWith(`${STYLES_ROOT}/`) || isTestFile(file)) continue;
      const raw = await read(file);
      const text = /\.css$/.test(file) ? stripCssComments(raw) : stripComments(raw);
      if (HEX_COLOUR.test(text)) offenders.push(`${relative(file)}: hex colour`);
      if (FUNCTIONAL_COLOUR.test(text)) offenders.push(`${relative(file)}: functional colour`);
    }
    expect(offenders).toEqual([]);
  });

  it('sizes no text in px and hardcodes no font stack outside styles/', async () => {
    const offenders: string[] = [];
    for (const file of await filesUnder(RENDERER_ROOT, /\.(ts|tsx|css|html)$/)) {
      if (file.startsWith(`${STYLES_ROOT}/`) || isTestFile(file)) continue;
      const raw = await read(file);
      const text = /\.css$/.test(file) ? stripCssComments(raw) : stripComments(raw);

      for (const prop of [FONT_SIZE_CSS, FONT_SIZE_JS]) {
        for (const value of declaredValues(text, prop)) {
          if (PX_LENGTH.test(value)) offenders.push(`${relative(file)}: ${prop}: ${value}`);
        }
      }
      for (const prop of [FONT_FAMILY_CSS, FONT_FAMILY_JS]) {
        for (const value of declaredValues(text, prop)) {
          // A token reference is the only permitted font stack.
          if (!/^['"`]?var\(/.test(value)) offenders.push(`${relative(file)}: ${prop}: ${value}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Criterion 11
// ---------------------------------------------------------------------------

describe('this suite has no live dependencies (criterion 11)', () => {
  it('is more than this one file', async () => {
    const files = await filesUnder(TESTS_ROOT, /\.test\.(ts|tsx)$/);
    expect(files.length).toBeGreaterThanOrEqual(4);
  });

  it('names no process, socket, credential or SQLite handle', async () => {
    const offenders: string[] = [];
    for (const file of await filesUnder(TESTS_ROOT, /\.(ts|tsx)$/)) {
      const text = stripComments(await read(file));
      for (const token of IO_TOKENS) {
        if (text.includes(token)) offenders.push(`${relative(file)} contains ${token}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('imports only the frozen contracts, the renderer, and the test libraries', async () => {
    const allowed = new Set([
      'vitest',
      'react',
      '@testing-library/react',
      '@testing-library/user-event',
    ]);
    const offenders: string[] = [];
    for (const file of await filesUnder(TESTS_ROOT, /\.(ts|tsx)$/)) {
      for (const specifier of importSpecifiers(stripComments(await read(file)))) {
        if (specifier.startsWith('.')) continue;
        if (specifier.startsWith('@shared/contracts/')) continue;
        if (allowed.has(specifier)) continue;
        offenders.push(`${relative(file)} imports ${specifier}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
