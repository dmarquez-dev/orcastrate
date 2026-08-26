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
 *   - no file under `src/renderer/**` reaches `src/main/**` through a RELATIVE
 *     specifier, apart from one named exception;
 *   - no file under `src/renderer/**` outside `styles/` carries a hex colour,
 *     an `rgb(`/`hsl(` literal, a px font-size, or a hardcoded font stack;
 *   - no `*.module.css` under `beachcomber/`, `helm/` or `shell/` sets a
 *     border width, a letter-spacing or a font weight to anything but a token.
 *
 * THE LAST RULE IS NEW, AND THIS PARAGRAPH USED TO SAY THE OPPOSITE. It said
 * those three properties were deliberately unchecked "because `TOKENS` has no
 * border-width, tracking or font-weight token". That was true when it was
 * written and stopped being true the moment `renderer-theme.ts` gained
 * `--oc-border-hairline`, `--oc-border-thick`, `--oc-tracking-tight`,
 * `--oc-tracking-wide` and the three `--oc-weight-*` keys. The rule that used
 * to have nothing to point at now has seven tokens to point at, so it is
 * enforced — and the rationale for not enforcing it is deleted rather than
 * left standing, because a stale rationale is what a later reader treats as
 * the current decision.
 *
 * WHAT IS STILL DELIBERATELY NOT CHECKED: raw lengths in general. The
 * screen-reader clip recipe (`width: 1px; height: 1px`) is the recipe itself
 * and not a spacing decision; there is no token for it and inventing one
 * would be a contract change. Spacing, radius and layout lengths outside the
 * three panel directories are also out of scope here — `Helm.styles.test.ts`
 * and the two Beachcomber style suites cover their own directories in full.
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
const SRC_ROOT = `${ROOT}/src`;
const RENDERER_ROOT = `${ROOT}/src/renderer`;
const STATE_ROOT = `${RENDERER_ROOT}/src/state`;
const STYLES_ROOT = `${RENDERER_ROOT}/src/styles`;
const TESTS_ROOT = `${RENDERER_ROOT}/src/__tests__`;
const CONTRACT_STATE = `${RENDERER_ROOT}/src/contracts/renderer-state.ts`;
const MAIN_ROOT = `${ROOT}/src/main`;

/**
 * THE FILES ALLOWED TO REACH MAIN, AND WHY EACH ONE IS ALLOWED.
 *
 * `relaunch.e2e.test.tsx` reproduces a DISAGREEMENT between main and the
 * renderer about what `status: 'idle'` means across a process restart. A stub
 * `pods.list` cannot reproduce a disagreement, because the stub is written by
 * the same hand as the assertion — seed the fixture with `'closed'` and the
 * renderer dutifully shows Open, having proved only that the fixture was typed
 * correctly. So that suite runs a real `EventStore`, a real `PodManager` and
 * its real `reconcileStartup()`, and its own header says so at length.
 *
 * `pod-stop.e2e.test.tsx` is here on the same argument made about a different
 * defect. It proves END TO END what stopping a Pod does: that the stopped Pod's
 * Matriarch row reads `Stopped`, and that the duration beside it no longer
 * ticks. What it guards against is a DISAGREEMENT as well — between what main
 * persisted when the Pod stopped and what the renderer went on displaying for
 * it — and a disagreement is exactly what a stub cannot stage. A fixture seeded
 * with `status: 'stopped'` would prove only that the fixture was typed
 * correctly, and would keep passing through any change to what main actually
 * writes. So this suite drives the real `PodManager` over a real store too.
 *
 * THEY ARE NAMED HERE RATHER THAN TOLERATED SILENTLY, which is the whole point
 * of this rule. Before it existed the ban on reaching main was STATED in
 * `transcript/startup-reconciliation.test.tsx` and enforced nowhere: the
 * criterion-11 import rule below exempts every relative specifier, so a
 * `../../../../src/main/...` import passed it without being seen. A rule that
 * is stated and not enforced teaches a later reader to trust a line that is
 * not held, and the exception it hid was a deliberate one nobody had recorded.
 *
 * THE EXTENSION POINT IS THIS LIST, AND NOTHING ELSE. A further exception is
 * added by naming the file and writing down the argument for it, never by
 * relaxing the rule to a glob or a `*.e2e.` pattern — a pattern would exempt
 * every suite written afterwards without anyone deciding to, which is the
 * silently-tolerated state described in the paragraph above, restored.
 */
const MAIN_REACHING_FILES: readonly string[] = [
  'src/renderer/src/__tests__/pod-stop.e2e.test.tsx',
  'src/renderer/src/__tests__/relaunch.e2e.test.tsx',
];

/**
 * Resolves a relative import against the importing file's directory.
 *
 * Deliberately does no extension guessing and no `index` resolution: the
 * question is which DIRECTORY the specifier escapes into, and a prefix test
 * over the normalized path answers it without a module resolver.
 */
function resolveRelative(fromFile: string, specifier: string): string {
  const parts = fromFile.split('/').slice(0, -1);
  for (const segment of specifier.split('/')) {
    if (segment === '.' || segment === '') continue;
    if (segment === '..') parts.pop();
    else parts.push(segment);
  }
  return parts.join('/');
}

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

  it('resolves a relative specifier that escapes the renderer into the main tree, and one that does not', () => {
    const from = `${TESTS_ROOT}/relaunch.e2e.test.tsx`;
    // The exact shape `relaunch.e2e.test.tsx` uses. If this did not resolve
    // into `src/main`, the rule below would be vacuous and would report every
    // file as clean.
    expect(resolveRelative(from, '../../../../src/main/pod-manager')).toBe(
      `${MAIN_ROOT}/pod-manager`,
    );
    expect(resolveRelative(from, '../../../../src/main/store')).toBe(`${MAIN_ROOT}/store`);
    // ...and a specifier that stays inside the renderer does not.
    expect(resolveRelative(from, './harness').startsWith(MAIN_ROOT)).toBe(false);
    expect(resolveRelative(from, '../pods/PodTab').startsWith(MAIN_ROOT)).toBe(false);
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

  it('reaches src/main/** from exactly the files named as exceptions, and no others', async () => {
    const reaching: string[] = [];
    for (const file of await filesUnder(RENDERER_ROOT, /\.(ts|tsx)$/)) {
      const text = stripComments(await read(file));
      const escapes = importSpecifiers(text)
        .filter((specifier) => specifier.startsWith('.'))
        .some((specifier) => resolveRelative(file, specifier).startsWith(`${MAIN_ROOT}/`));
      if (escapes) reaching.push(relative(file));
    }

    // TWO-SIDED, exactly as `SURFACELESS_CHANNELS` is in `failure-paths`. A
    // file that starts reaching main fails as loudly as one that stops — the
    // second half is what keeps the exception from outliving its reason, and
    // is why this is `toEqual` and not a subset check.
    expect(reaching.sort()).toEqual([...MAIN_REACHING_FILES].sort());
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
// Status token VALUES, not just names
// ---------------------------------------------------------------------------

/**
 * `WorkspaceLayout.test.tsx` proves every status maps to its own token NAME.
 * That is one half of the guarantee and it is the half a shared value slips
 * through: `--oc-status-closed: #7c8598` would satisfy it while painting a
 * closed Pod exactly like an idle one.
 *
 * This asserts the other half — the DECLARED VALUES in `tokens.css` are
 * distinct too — which is what the widening in this session actually needed.
 * It is an addition; nothing above is relaxed to make room for it.
 */
const TOKENS_CSS = `${STYLES_ROOT}/tokens.css`;
const STATUS_VARIABLE = /--oc-status-([a-z]+)\s*:\s*([^;]+);/g;

const THEME_CONTRACT = `${RENDERER_ROOT}/src/contracts/renderer-theme.ts`;
const CONTRACT_RUNTIME = `${RENDERER_ROOT}/src/shell/contract-runtime.ts`;

/** The members of a hand-written string-literal union, in source order. */
function unionMembers(source: string): string[] {
  return [...source.matchAll(/'([a-z]+)'/g)].map((match) => match[1] ?? '');
}

describe('status token values in tokens.css', () => {
  it('declares one distinct value per status, idle and closed included', async () => {
    const text = stripCssComments(await read(TOKENS_CSS));
    const declared = new Map<string, string>();
    for (const match of text.matchAll(STATUS_VARIABLE)) {
      const name = match[1];
      const value = match[2];
      if (name === undefined || value === undefined) continue;
      // A second definition of one token would make "distinct" meaningless.
      expect(declared.has(name), `--oc-status-${name} declared twice`).toBe(false);
      declared.set(name, value.trim().toLowerCase());
    }

    // Both status unions, exhaustively: Pod plus Lane, eight names.
    expect([...declared.keys()].sort()).toEqual([
      'beached',
      'closed',
      'done',
      'idle',
      'orphaned',
      'running',
      'stopped',
      'waiting',
    ]);

    const values = [...declared.values()];
    expect(new Set(values).size, 'every status colour is its own').toBe(values.length);
    // Named on its own, because aliasing idle is the specific shortcut the
    // widening had available and did not take.
    expect(declared.get('closed')).not.toBe(declared.get('idle'));
    // `stopped` is the fourth LaneStatus and sits nearest the two quiet
    // neutrals. Named for the same reason `closed` is: aliasing either of them
    // was the shortcut available, and the distinctness assertion above was NOT
    // relaxed to make room.
    expect(declared.get('stopped')).not.toBe(declared.get('idle'));
    expect(declared.get('stopped')).not.toBe(declared.get('closed'));
  });

  /**
   * `renderer-theme.ts` DECLARES `statusToken`'s parameter union by hand and
   * `contract-runtime.ts` IMPLEMENTS it against `AnyStatus`. They are a
   * declare/implement pair, and nothing in the type system connects them: the
   * declared union is a duplicate, so widening one without the other does not
   * break the build — it breaks the CALL SITES, somewhere else, later.
   *
   * `Readonly<Record<AnyStatus, string>>` guards the map against `AnyStatus`.
   * This guards `AnyStatus` against the declaration, which is the half that
   * had no guard at all.
   */
  it('keeps statusToken declared and implemented over the same union', async () => {
    const declared = (await read(THEME_CONTRACT)).match(
      /declare function statusToken\(\s*status:([^)]*)\)/,
    )?.[1];
    const implemented = (await read(CONTRACT_RUNTIME)).match(
      /export type AnyStatus =([^;]*);/,
    )?.[1];

    expect(declared, 'the declaration in renderer-theme.ts').toBeDefined();
    expect(implemented, 'AnyStatus in contract-runtime.ts').toBeDefined();
    expect([...unionMembers(declared ?? '')].sort()).toEqual(
      [...unionMembers(implemented ?? '')].sort(),
    );
    // Both must actually carry the fifth PodStatus and the fourth LaneStatus,
    // or the pair agrees by being equally wrong.
    expect(unionMembers(declared ?? '')).toContain('closed');
    expect(unionMembers(declared ?? '')).toContain('stopped');
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

  /**
   * BARE SPECIFIERS ONLY, AND THAT IS NOW SAID OUT LOUD.
   *
   * `specifier.startsWith('.')` skips every relative import, so this rule has
   * never had anything to say about where a relative path LEADS. That silence
   * used to be invisible, and a suite reaching four levels up into
   * `src/main/**` passed it untouched while a different file's header claimed
   * the renderer may not import main at all.
   *
   * The relative half is now covered by "reaches src/main/** from exactly the
   * files named as exceptions" above. This rule keeps its own, narrower job:
   * which PACKAGES the suite is allowed to depend on.
   */
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

// ---------------------------------------------------------------------------
// The widened rule: border widths, tracking and weights (criterion 10)
// ---------------------------------------------------------------------------

/**
 * The three directories the widened rule covers, and why exactly these three.
 *
 * `beachcomber/` and `helm/` are the panels this session added; `shell/` is
 * where the panel strip and the panel region landed. They are the directories
 * whose stylesheets were written AFTER the tokens existed, so they are the
 * ones the rule can hold to without asking anyone to redecide a shipped
 * design. The backlog item this closes named six sub-session 2 directories
 * that reached for bare `1px`, `0.04em` and `font-weight: 700`; widening the
 * rule over those as well is a change to their pixels, not to a test, and is
 * reported rather than made here.
 */
const TOKENISED_STYLE_ROOTS: readonly string[] = [
  `${RENDERER_ROOT}/src/beachcomber`,
  `${RENDERER_ROOT}/src/helm`,
  `${RENDERER_ROOT}/src/shell`,
];

/** Assembled from fragments, like every other needle in this file. */
const LETTER_SPACING = 'letter-' + 'spacing';
const FONT_WEIGHT = 'font-' + 'weight';

/**
 * Every property that declares a border WIDTH, including the shorthands.
 *
 * `border-radius` is deliberately absent and cannot be reached by accident:
 * `declaredValues` anchors on `<prop>:`, and `border-radius:` does not match
 * `border:`. A radius is a length, not a border width, and it has its own
 * `--oc-radius-*` tokens.
 */
const BORDER_PROPERTIES: readonly string[] = [
  'border',
  'border-top',
  'border-right',
  'border-bottom',
  'border-left',
  'border-width',
  'outline',
];

/**
 * A raw physical length. `0` is NOT one: a zero border has no unit to
 * tokenise and `border: 0` is how a reset is spelled in every stylesheet in
 * this tree.
 */
const RAW_LENGTH = /\b\d+(?:\.\d+)?(?:px|rem|em|pt|ch)\b/;

/** A value that defers to the token set. The only permitted one. */
function isTokenValue(value: string): boolean {
  return value.trim().startsWith('var(');
}

/**
 * WHY THIS CHECKS THE VALUE INSTEAD OF PATTERN-MATCHING THE DECLARATION.
 *
 * The obvious form, `prop:\s*(?!var\()`, is broken in a way that is hard to
 * see and harder to notice: `\s*` can match zero characters, so on the CLEAN
 * `font-weight: var(--oc-weight-bold)` the engine backtracks to zero, the
 * lookahead sees a space rather than `var(`, and the rule fires on a
 * perfectly tokenised declaration. `helm/rules.ts` hit this and fixed it by
 * moving the whitespace inside the lookahead (`prop:(?!\s*var\()`), which is
 * correct — its own header describes the symptom in the opposite direction,
 * but the pattern it ships discriminates.
 *
 * Reading the declared VALUE avoids the class of bug entirely, and it also
 * lets an offender say what it actually found instead of only where.
 */
function tokenOffenders(text: string, properties: readonly string[]): string[] {
  const found: string[] = [];
  for (const prop of properties) {
    for (const value of declaredValues(text, prop)) {
      if (!isTokenValue(value)) found.push(`${prop}: ${value}`);
    }
  }
  return found;
}

/** Border widths are the one group where a non-token value can still be fine. */
function borderOffenders(text: string): string[] {
  const found: string[] = [];
  for (const prop of BORDER_PROPERTIES) {
    for (const value of declaredValues(text, prop)) {
      if (RAW_LENGTH.test(value)) found.push(`${prop}: ${value}`);
    }
  }
  return found;
}

/**
 * THE DECLARATIONS THIS RULE FINDS THAT THIS TASK DOES NOT FIX, EXHAUSTIVELY.
 *
 * Two `shell/` stylesheets predate the tokens: they are sub-session 2 files
 * that landed when `TOKENS` had nothing to offer, and both live outside this
 * task's ownership (`src/renderer/src/__tests__/**`). Fixing them is a change
 * to shipped pixels — `font-weight: 600` in particular has NO token, since the
 * set offers 400/500/700 — and belongs to whoever owns `shell/`, with the
 * weight decision made deliberately rather than rounded by a test author.
 *
 * The assertion below compares against this list EXACTLY, in both directions.
 * A seventh raw declaration anywhere in the three directories fails. So does
 * FIXING one of these six without deleting its line here — which is the point:
 * the exception list shrinks under review rather than quietly outliving the
 * problem, exactly as `SURFACELESS_CHANNELS` does in the failure-path suite.
 */
const PRE_TOKEN_SHELL_DECLARATIONS: readonly string[] = [
  'src/renderer/src/shell/EmptyWorkspace.module.css: border: 1px solid var(--oc-border-strong)',
  'src/renderer/src/shell/EmptyWorkspace.module.css: font-weight: 600',
  'src/renderer/src/shell/WorkspaceLayout.module.css: border-bottom: 1px solid var(--oc-border)',
  'src/renderer/src/shell/WorkspaceLayout.module.css: border-left: 1px solid var(--oc-border)',
  'src/renderer/src/shell/WorkspaceLayout.module.css: border-right: 1px solid var(--oc-border)',
  'src/renderer/src/shell/WorkspaceLayout.module.css: border-top: 1px solid var(--oc-border)',
];

async function panelStylesheets(): Promise<string[]> {
  const sheets: string[] = [];
  for (const root of TOKENISED_STYLE_ROOTS) {
    for (const file of await filesUnder(root, /\.module\.css$/)) sheets.push(file);
  }
  return sheets.sort();
}

describe('the widened matchers themselves', () => {
  it('catches a synthetic violation of each new rule and passes its tokenised twin', () => {
    // Border widths: a raw length is the violation, a token and a bare `0`
    // are not.
    expect(borderOffenders('border: 1' + 'px solid var(--oc-border);')).toEqual([
      'border: 1' + 'px solid var(--oc-border)',
    ]);
    expect(borderOffenders('border: var(--oc-border-hairline) solid var(--oc-border);')).toEqual([]);
    expect(borderOffenders('border: 0;')).toEqual([]);
    expect(borderOffenders('border-bottom: 2' + 'px solid var(--oc-border);')).toHaveLength(1);
    // A radius is a length but not a border width, and must not be caught.
    expect(borderOffenders('border-radius: 4' + 'px;')).toEqual([]);

    // Tracking and weight: anything but a token is the violation.
    expect(tokenOffenders(`${FONT_WEIGHT}: 700;`, [FONT_WEIGHT])).toEqual([
      `${FONT_WEIGHT}: 700`,
    ]);
    expect(tokenOffenders(`${FONT_WEIGHT}: var(--oc-weight-bold);`, [FONT_WEIGHT])).toEqual([]);
    expect(tokenOffenders(`${LETTER_SPACING}: 0.04` + 'em;', [LETTER_SPACING])).toHaveLength(1);
    expect(tokenOffenders(`${LETTER_SPACING}: var(--oc-tracking-wide);`, [LETTER_SPACING])).toEqual(
      [],
    );
  });

  it('does not use the lookahead form that fires on a tokenised declaration', () => {
    // Kept as an executable warning rather than a comment. The left-hand
    // pattern is the one `helm/rules.ts` had to replace: it fires on CLEAN
    // code, because `\s*` backtracks to zero and the lookahead then sees a
    // space instead of `var(`. The right-hand one is the corrected form.
    const broken = new RegExp(`${FONT_WEIGHT}:\\s*(?!var\\()`);
    const fixed = new RegExp(`${FONT_WEIGHT}:(?!\\s*var\\()`);
    const clean = `${FONT_WEIGHT}: var(--oc-weight-bold);`;
    expect(broken.test(clean)).toBe(true);
    expect(fixed.test(clean)).toBe(false);
    // And the rule this file actually enforces agrees with the fixed form.
    expect(tokenOffenders(clean, [FONT_WEIGHT])).toEqual([]);
  });
});

describe('panel token hygiene: border widths, tracking and weights (criterion 10)', () => {
  it('finds the panel stylesheets to scan at all', async () => {
    const sheets = await panelStylesheets();
    // Beachcomber has two, Helm one, the shell four. A rule that scanned an
    // empty list would report as a pass.
    expect(sheets.length).toBeGreaterThanOrEqual(7);
    expect(sheets.map(relative)).toContain('src/renderer/src/helm/Helm.module.css');
    expect(sheets.map(relative)).toContain(
      'src/renderer/src/beachcomber/Beachcomber.module.css',
    );
    expect(sheets.map(relative)).toContain('src/renderer/src/shell/PanelBar.module.css');
  });

  it('sets every border width, letter-spacing and font weight from a token', async () => {
    const offenders: string[] = [];
    for (const file of await panelStylesheets()) {
      const text = stripCssComments(await read(file));
      for (const offender of borderOffenders(text)) {
        offenders.push(`${relative(file)}: ${offender}`);
      }
      for (const offender of tokenOffenders(text, [LETTER_SPACING, FONT_WEIGHT])) {
        offenders.push(`${relative(file)}: ${offender}`);
      }
    }
    // Exactly the six pre-token `shell/` declarations, and nothing else. Both
    // directions fail loudly: see `PRE_TOKEN_SHELL_DECLARATIONS`.
    expect(offenders.sort()).toEqual([...PRE_TOKEN_SHELL_DECLARATIONS]);
  });

  it('leaves the two panel directories with no exception at all', async () => {
    // Stated separately from the assertion above so the exception list can
    // never be read as covering Beachcomber or Helm. Those two directories are
    // clean, and this is what says so on its own.
    const offenders: string[] = [];
    for (const file of await panelStylesheets()) {
      if (file.startsWith(`${RENDERER_ROOT}/src/shell/`)) continue;
      const text = stripCssComments(await read(file));
      offenders.push(
        ...borderOffenders(text).map((offender) => `${relative(file)}: ${offender}`),
        ...tokenOffenders(text, [LETTER_SPACING, FONT_WEIGHT]).map(
          (offender) => `${relative(file)}: ${offender}`,
        ),
      );
    }
    expect(offenders).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Two rules added this session, for two failure modes that had NO detector
// ---------------------------------------------------------------------------

/**
 * RULE 1 — NO STRAY CONTROL BYTE IN A SOURCE FILE.
 *
 * WHY THIS EXISTS, WRITTEN DOWN BECAUSE THE INCIDENT IS THE ARGUMENT. During
 * this session a scripted edit wrote a LITERAL 0x08 backspace byte into a
 * source file where the two characters backslash-`b` were meant. Inside a
 * regular-expression literal the two forms are nearly interchangeable, so the
 * regex still behaved correctly, EVERY TEST STAYED GREEN, and nothing in this
 * repository would ever have flagged it. It took an `od -c` to see it, and it
 * was found by luck rather than by anything that would find it again.
 *
 * That is the whole case for this rule: the failure mode is silent, it is
 * introduced by tooling rather than by typing, and the check is a few lines in
 * a walk that already exists.
 *
 * WHAT COUNTS AS A CONTROL BYTE. Everything below U+0020 except the three that
 * legitimately appear in text files — newline, tab and carriage return — plus
 * U+007F. Deliberately NOT a ban on non-ASCII: this tree contains '└', '▸',
 * '▾', '…' and '—' on purpose, and a rule that flagged them would be turned
 * off within a day.
 *
 * SCOPE IS ALL OF `src/`, not just the renderer. The byte landed in the
 * renderer this time; nothing about the mechanism is renderer-specific, and a
 * rule scoped to where the last incident happened only ever catches the last
 * incident.
 */
const CONTROL_BYTE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

/** Names the offender precisely enough to fix without a hex editor. */
function controlByteReport(text: string): string | null {
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (!CONTROL_BYTE.test(text[i] ?? '')) continue;
    const line = text.slice(0, i).split('\n').length;
    const hex = code.toString(16).padStart(2, '0');
    return `line ${String(line)}: 0x${hex}`;
  }
  return null;
}

/**
 * RULE 2 — A DELETED TEST ID STAYS DELETED, INCLUDING ITS RAW LITERAL.
 *
 * The lane rail's pin id — the one named by the constant immediately below,
 * and spelled nowhere else in this file — was deleted from
 * `contracts/renderer-view.ts` this session. `tsc` catches every attempt to
 * reference it THROUGH the `TEST_IDS` object, because the key is gone. What
 * `tsc` cannot catch is the RAW STRING: a `getByTestId` call typed out by hand
 * compiles perfectly and asserts about a control that no longer exists, and
 * the `queryByTestId(...)` form returning null passes forever against a page
 * that renders nothing at all.
 *
 * T2's reviewer flagged that the only thing stopping that reintroduction was a
 * PROSE COMMENT asking the next reader not to do it. This is that comment,
 * enforced.
 *
 * THE ONE ALLOWED OCCURRENCE, ratified by the user at review (escalation E1):
 * `lanes/LaneRail.test.tsx` asserts that querying every element with that id
 * yields none, which is the PROOF the control is gone. Deleting that line to
 * satisfy a grep would delete the proof, so the file is named below instead —
 * the same shape as `MAIN_REACHING_FILES` above, and for the same reason: an
 * exception that is recorded is an exception a later reader can weigh.
 *
 * EVERY MENTION HERE IS DELIBERATELY INDIRECT, needle-assembly discipline
 * applied to prose as well as to code: T4's acceptance criterion 1 requires a
 * grep for the id under `src/renderer/src/__tests__/**` to come back empty,
 * and a rule that had to name its own subject would be the only thing left
 * standing in the way of that.
 */
const RETIRED_TEST_ID_LITERALS: readonly string[] = ['lane-row' + '-pin'];

const RETIRED_LITERAL_EXEMPT_FILES: readonly string[] = [
  'src/renderer/src/lanes/LaneRail.test.tsx',
];

describe('the two rules added for previously undetectable failure modes', () => {
  it('catch a synthetic violation of each, and clear the legitimate near-misses', () => {
    // The exact byte that shipped, and the two characters that were meant.
    expect(CONTROL_BYTE.test(String.fromCharCode(0x5c) + 'b')).toBe(false);
    expect(CONTROL_BYTE.test(String.fromCharCode(0x08))).toBe(true);
    expect(controlByteReport(`ok\nok\n${String.fromCharCode(0x08)}`)).toBe('line 3: 0x08');
    expect(controlByteReport('a\tb\r\nc\n')).toBeNull();
    // The glyphs this tree uses on purpose are NOT control bytes.
    expect(CONTROL_BYTE.test('└ ▸ ▾ … — 🐋')).toBe(false);

    /*
     * And the retired literal is matched as the literal, not as a prefix of
     * some longer id that merely starts the same way. The needle is assembled
     * from fragments, exactly as every other needle in this file is, so this
     * file is not its own violation — which is also why the rule below has to
     * be watched failing against a PLANTED occurrence rather than trusted to
     * be firing because it is written down.
     */
    const retired = RETIRED_TEST_ID_LITERALS[0] as string;
    expect(retired).toBe('lane-row' + '-pin');
    expect(`getByTestId('${retired}')`).toContain(retired);
    expect('lane-row-select:lane-1').not.toContain(retired);
    expect('lane-row-unread').not.toContain(retired);
  });

  it('finds no stray control byte anywhere under src/', async () => {
    const files = await filesUnder(SRC_ROOT, /\.(ts|tsx|css|html)$/);
    // The walk found a tree. Without this the rule below reports "clean" for a
    // path that does not exist, which is the vacuity this whole file is about.
    expect(files.length).toBeGreaterThan(100);

    const offenders: string[] = [];
    for (const file of files) {
      const found = controlByteReport(await read(file));
      if (found !== null) offenders.push(`${relative(file)}: ${found}`);
    }
    expect(offenders).toEqual([]);
  });

  it('finds no reference to a retired test id outside the one ratified proof', async () => {
    const files = await filesUnder(SRC_ROOT, /\.(ts|tsx|css|html)$/);
    expect(files.length).toBeGreaterThan(100);

    // The exemption names a file that EXISTS and that really does carry the
    // literal. A stale exemption is how a deny-list quietly stops covering
    // anything, so it is checked rather than trusted.
    for (const exempt of RETIRED_LITERAL_EXEMPT_FILES) {
      const match = files.find((file) => relative(file) === exempt);
      expect(match, `${exempt} is exempted but not present`).toBeDefined();
      const text = stripComments(await read(match as string));
      expect(
        RETIRED_TEST_ID_LITERALS.some((literal) => text.includes(literal)),
        `${exempt} is exempted but carries no retired literal in CODE`,
      ).toBe(true);
    }

    /*
     * CODE ONLY, comments stripped — the same distinction every other rule in
     * this file draws, and for the same reason. A docblock explaining that the
     * pin was deleted has to be able to NAME it; only a live reference to it
     * is the defect. That is not a loophole worth closing: a test id can only
     * do harm from a selector, and a selector is code.
     */
    const offenders: string[] = [];
    for (const file of files) {
      if (RETIRED_LITERAL_EXEMPT_FILES.includes(relative(file))) continue;
      const text = stripComments(await read(file));
      for (const literal of RETIRED_TEST_ID_LITERALS) {
        if (text.includes(literal)) offenders.push(`${relative(file)}: ${literal}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
