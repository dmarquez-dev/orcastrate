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
 *     border width or a letter-spacing to anything but a token. OVER THIS
 *     TREE that rule is now a narrower restatement of the repo-wide censuses
 *     below, and is kept only because it also names Beachcomber and Helm on
 *     their own; it is no longer the thing holding either property. It is not
 *     narrower as a PREDICATE: it reads declarations unanchored, so it flags
 *     a custom property named `--oc-border` that the anchored census does not
 *     (both directions asserted at the foot of this file). It is narrower
 *     only because no `*.module.css` in this tree declares a custom property;
 *   - no `*.module.css` ANYWHERE under `src/renderer/src` sets a font weight
 *     to anything but a `var(--oc-weight-*)` token, sets a letter-spacing to
 *     anything but a `var(--oc-tracking-*)` token, gives any listed
 *     border-width property a raw length OR A BARE WIDTH KEYWORD, or leaves a
 *     `var(--oc-*)` reference in a property declaration unterminated — invalid
 *     CSS a browser discards whole, which no other rule in this repository
 *     detects; and every full-window overlay paints `var(--oc-overlay-scrim)`.
 *     These are repo-wide, carry no exception list of any kind, and are
 *     two-sided against the empty list; see the censuses at the foot of this
 *     file.
 *     A BARE WIDTH KEYWORD IS NOW AN OFFENDER IN BOTH BORDER PREDICATES, and
 *     this clause used to say the opposite. It said a keyword "is not a raw
 *     length and is outside the border census", which was a true description of
 *     the predicate and an accurate count of the survivors — and it pointed at
 *     a deferral that no longer holds. Both predicates read the keyword forms
 *     as of 2026-10-16-orcastrate-keyword-hairline-sweep; what each one flags
 *     and what it declines is asserted sample by sample rather than described,
 *     and the `TOKENISED_STYLE_ROOTS` docblock carries the correction in full.
 *
 * THE TOKEN RULES ARE NEWER THAN THIS FILE, AND THIS PARAGRAPH USED TO SAY THE
 * OPPOSITE. It said those properties were deliberately unchecked "because
 * `TOKENS` has no border-width, tracking or font-weight token". That was true
 * when it was written and stopped being true the moment `renderer-theme.ts`
 * gained `--oc-border-hairline`, `--oc-border-thick`, `--oc-tracking-tight`,
 * `--oc-tracking-wide` and its `--oc-weight-*` keys — of which there are now
 * four, `--oc-weight-semibold` having closed the 500-to-700 gap in
 * 2026-10-09-orcastrate-theme-contract-decisions. The rule that used to have
 * nothing to point at has tokens to point at, so it is enforced — and the
 * rationale for not enforcing it is deleted rather than left standing, because
 * a stale rationale is what a later reader treats as the current decision.
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
/** The two source trees outside `src/`. Not the renderer's `__tests__` above. */
const TEST_TREE_ROOT = `${ROOT}/tests`;
const PROBE_ROOT = `${ROOT}/probe`;

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
 * `beachcomber/` and `helm/` are the panels that introduced this rule;
 * `shell/` is where the panel strip and the panel region landed.
 *
 * THE RATIONALE THAT USED TO STAND HERE IS GONE, and it is replaced rather
 * than amended because it had become the opposite of the truth. It said these
 * three were the directories written AFTER the tokens existed, so the rule
 * could hold them without asking anyone to redecide a shipped design, and that
 * widening the rule over the remaining directories "is a change to their
 * pixels, not to a test, and is reported rather than made here". Neither half
 * survives. Two of the `shell/` sheets predated the tokens and were carried by
 * a pin, `PRE_TOKEN_SHELL_DECLARATIONS`, which is why that pin existed at all.
 * And the widening was in fact made: 2026-10-12-orcastrate-token-sweep
 * converted every remaining RAW-LENGTH border width in the renderer — 36
 * declarations, every one of them exactly `1px` — and every letter-spacing
 * literal, accepted the one visible change of tracking that required
 * (`lanes/LaneRail.module.css`'s `.railHeading`, 0.06em to 0.04em), deleted
 * the pin, and replaced the scope argument with the repo-wide censuses at the
 * foot of this file. The decision the old paragraph deferred was taken.
 *
 * WHAT THE WIDENING DID NOT REACH THEN, AND REACHES NOW. This paragraph used
 * to record six border widths declared with the KEYWORD `thin` — three in
 * `composer/Composer.module.css`, three in
 * `permissions/PermissionCards.module.css` — as untokenised widths that
 * survived because a keyword is not a raw length. That much was true. What it
 * went on to say was not: that widening the predicate to the keyword forms
 * "would change six shipped borders' pixels, which is a design decision and
 * not a test change, so it is reported and not made here".
 *
 * THAT DEFERRAL RESTED ON A PREMISE THAT WAS NEVER MEASURED, and measuring it
 * dissolved it. The driven hand-run harness — Playwright over the real Electron
 * app — put a border declaring `thin` and a border declaring `1px` in the SAME
 * window and read both used widths back out of the engine: they were equal,
 * twice, on two separate checkouts. No pixel literal is the reference in that
 * protocol and none could be: this display quantizes a declared `1px` to
 * `0.8px`, so the only thing that survives is the EQUALITY between two widths
 * measured in one window. So the conversion moved no pixels,
 * there was no design decision to defer to anyone, and the deferral was an
 * invented obstacle that had kept six declarations out of a census for one
 * session. The six were converted in that session and both border predicates
 * now read the keyword forms.
 *
 * THE EXACT STRENGTH OF THAT CLAIM, because it is easy to overstate and the
 * overstatement is what would mislead the next reader. It is AN ENGINE
 * MEASUREMENT ON ONE DISPLAY, not a standards claim. The CSS specification
 * fixes only the `thin < medium < thick` ordering and leaves the three widths
 * UA-defined; MDN records `thin` as equivalent to `1px`. Nothing here licenses
 * the belief that `thin` is `1px` by rule, and no test in this file asserts
 * that it is — the predicates reject a bare keyword because it defers to the
 * engine rather than to the token set, which is the reason that holds whatever
 * width the engine picks.
 *
 * SO THIS LIST IS NO LONGER A SCOPE DECISION. It is a narrower second look at
 * three directories, kept because the assertion below names Beachcomber and
 * Helm on their own; the properties themselves are held repo-wide and nothing
 * depends on this list to hold them.
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

/**
 * THE THREE CSS BORDER-WIDTH KEYWORDS, ALL THREE FLAGGED — not only the one
 * that ships.
 *
 * A rule named for the keyword forms that read `thin` alone would be narrower
 * than its own name, and the next `medium` anyone writes would walk past it.
 * So `medium` and `thick` are held here too, and they are covered by SYNTHETIC
 * samples only: as this predicate is written, no declaration in this tree
 * declares either one as a bare keyword. That is said out loud rather than left
 * to be inferred from an empty offender list, because an empty list is equally
 * consistent with a rule that cannot fire.
 */
const BORDER_WIDTH_KEYWORDS: readonly string[] = ['thin', 'medium', 'thick'];

/**
 * A BARE WIDTH KEYWORD — A TERM MATCH, NOT A SUBSTRING MATCH, and that
 * distinction is the whole of this predicate's difficulty.
 *
 * `var(--oc-border-thick)` is a TOKEN whose NAME ends in a width keyword, and
 * this tree ships references to it. A predicate that merely searched for
 * `thick` inside the value would flag every one of them and go red on a clean
 * tree — so a keyword counts only where it stands as a whole term, with `-`
 * treated as an identifier character on both sides. Both directions are
 * asserted sample by sample below; this paragraph is not the evidence.
 *
 * `_` IS TREATED AS AN IDENTIFIER CHARACTER TOO, via `\w`, so `_thin` is read
 * as one identifier and not as a bare keyword. That is a decision rather than
 * an accident of the character class: `_` is a valid CSS ident character, so
 * `_thin` is a single identifier to the parser, and reading it as a keyword
 * would be the substring failure one character to the left. It also keeps this
 * predicate identical to the two per-stylesheet predicates in
 * `composer/Composer.styles.test.ts` and
 * `permissions/PermissionCards.styles.test.ts`, which is worth more than
 * agreement with any one-off shell census: three readers that disagree about
 * what a border width is, is the defect shape this rule is the third
 * instalment of. No `*.module.css` in this tree contains `_` in a declaration
 * value today, so the case is unexercised and held synthetically below.
 */
const BARE_WIDTH_KEYWORD = new RegExp(
  `(?:^|[^-\\w])(?:${BORDER_WIDTH_KEYWORDS.join('|')})(?:[^-\\w]|$)`,
);

/**
 * A border width that defers to neither the token set nor a zero: a raw
 * physical length, or a bare keyword that defers to the engine instead.
 *
 * ONE PREDICATE SERVES BOTH RULES. The keyword test is a test of the declared
 * VALUE, so it is independent of which reader produced the value — the scoped
 * rule's unanchored `declaredValues` and the census's anchored `anchoredValues`
 * hand it the same kind of string. Two predicates for one property that
 * disagree about what a border width is, is exactly what this session's
 * subject was.
 */
function isOffendingBorderWidth(value: string): boolean {
  return RAW_LENGTH.test(value) || BARE_WIDTH_KEYWORD.test(value);
}

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

/**
 * Border widths are the one group where a non-token value can still be fine:
 * `border: 0` has no unit to tokenise.
 *
 * WIDENED TO THE KEYWORD FORMS, with the same term-match predicate the census
 * uses. Nothing in these three directories forced that — none of the six
 * keyword declarations this session converted was inside them. It is done for
 * the reason that is specific to this session: 5 of the border declarations in
 * these three roots name `var(--oc-border-thick)`, a token whose name ends in a
 * width keyword, so widening HERE is what exercises the term-boundary
 * requirement against real shipped declarations instead of against synthetic
 * samples alone. That 5 was measured for this change with
 * `grep -rnE '(^|[;{])[[:space:]]*(border(-top|-right|-bottom|-left|-width|-block|-inline)?|outline)[[:space:]]*:[^;}]*var\(--oc-border-thick\)' --include='*.module.css' src/renderer/src/beachcomber src/renderer/src/helm src/renderer/src/shell`,
 * which also declines `PanelBar.module.css`'s `outline-offset` reference to the
 * same token — the near-miss that tells the count apart from a plain text
 * search for the token name, which returns 6 lines over these three roots.
 * A scoped rule left un-widened would also be a second
 * predicate for the same property, disagreeing with the census about what a
 * border width is.
 */
function borderOffenders(text: string): string[] {
  const found: string[] = [];
  for (const prop of BORDER_PROPERTIES) {
    for (const value of declaredValues(text, prop)) {
      if (isOffendingBorderWidth(value)) found.push(`${prop}: ${value}`);
    }
  }
  return found;
}

/**
 * THIS RULE TOLERATES NO UNTOKENISED BORDER WIDTH AT ALL — raw length or bare
 * keyword — and that is the point rather than an omission.
 *
 * It used to pin an exhaustive list of raw `1px` border widths — five of them,
 * in two `shell/` stylesheets — on the grounds that converting them changed
 * shipped pixels and was a later owner of `shell/`'s decision to make.
 * 2026-10-12-orcastrate-token-sweep was that owner: those five declarations
 * now read `var(--oc-border-hairline)`, so the pin had nothing left to
 * tolerate and was deleted in the same change that converted them. The pin was
 * two-sided, so neither half could have landed alone.
 *
 * The assertion below compares the offender list against the EMPTY list, which
 * is strictly stronger than comparing it against a pin: a declaration that
 * stops being tokenised fails, and there is no tolerated entry left that could
 * absorb one. An exception list that shrinks to nothing under review, rather
 * than quietly outliving the problem it described, is the mechanism working.
 *
 * NOTE THE SCOPE, because nothing in the assertion states it: this rule walks
 * `TOKENISED_STYLE_ROOTS` only. Font weights are covered REPO-WIDE, by the
 * census at the foot of this file.
 */
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

    // A BARE WIDTH KEYWORD IS A VIOLATION HERE TOO, all three of them, and the
    // token whose NAME ends in one is not. These three roots hold no keyword
    // declaration and 5 border declarations naming `var(--oc-border-thick)`,
    // so the second half of this is the one the real tree exercises.
    expect(borderOffenders('border: thin solid var(--oc-border);')).toEqual([
      'border: thin solid var(--oc-border)',
    ]);
    expect(borderOffenders('border: medium solid var(--oc-border);')).toHaveLength(1);
    expect(borderOffenders('border-width: thick;')).toEqual(['border-width: thick']);
    expect(borderOffenders('border: var(--oc-border-thick) solid var(--oc-border);')).toEqual([]);
    expect(borderOffenders('outline: var(--oc-border-thick) solid var(--oc-focus-ring);')).toEqual(
      [],
    );

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

  it('gives no border width a raw length or a bare width keyword, and sets every letter-spacing and font weight from a token', async () => {
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
    // Nothing is tolerated: any raw border width, any bare width keyword, any
    // raw letter-spacing or font weight in the three directories fails loudly,
    // and no pinned list can absorb one. Still sorted, so a failure message is
    // stable and legible rather than ordered by directory walk.
    expect(offenders.sort()).toEqual([]);
  });

  it('leaves the two panel directories with no exception at all', async () => {
    // Stated separately from the assertion above so that if a tolerated-
    // declaration list is ever reintroduced there, it can never be read as
    // covering Beachcomber or Helm. Those two directories are clean, and this
    // is what says so on its own.
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
 * SCOPE IS EVERY SOURCE TREE IN THE REPOSITORY — `src/`, `tests/` AND
 * `probe/`. The byte landed in the renderer this time; nothing about the
 * mechanism is renderer-specific, and a rule scoped to where the last
 * incident happened only ever catches the last incident. That argument is the
 * reason the walk below takes all three roots: for one session this docblock
 * made the argument one level above a rule that walked `src/` alone, which is
 * exactly the shape it was arguing against.
 *
 * WHICH EXTENSIONS, DECIDED RATHER THAN INHERITED FROM THE OTHER RULES.
 * Measured in this session with
 * `find <root> -type f | sed 's/.*\.//' | sort | uniq -c`: `src/` holds 141
 * `.ts`, 106 `.tsx`, 19 `.css`, 1 `.md` and 1 `.html`; `tests/` holds 66
 * `.ts`, 6 `.ndjson`, 1 `.md` and 1 `.json`; `probe/` holds 4 `.md`, 4
 * `.ndjson`, 2 `.ts` and 2 `.json`. Neither new root contains a `.tsx`,
 * `.css` or `.html` file, so the filter inherited from the rules above would
 * have covered their `.ts` files and silently skipped the other 20. It is
 * therefore widened to `.md` and `.json` — hand-authored files edited by
 * precisely the scripted tooling that wrote the original byte, so they carry
 * the same failure mode — and `.ndjson` is excluded, which the anchored
 * `\.(…|json)$` alternation already declines to match because the dot it
 * requires is not there.
 *
 * THE `.ndjson` EXCLUSION IS A PROPERTY OF THOSE FILES, not of where the last
 * incident happened. All ten, under `tests/fixtures/protocol/` and
 * `probe/evidence/`, are byte-for-byte RECORDINGS of another process's
 * stream-json stdout, and their whole value is fidelity: a fixture that has
 * been tidied no longer reproduces the input the parser actually met. A
 * control byte inside a recording may be the DATA rather than a defect, and a
 * rule unable to tell those apart gets answered by editing the fixture, which
 * is the one repair a fixture must never invite.
 *
 * AND EVERY FILE UNDER BOTH ROOTS IS CLEAN TODAY, MEASURED WITH AN INSTRUMENT
 * THAT WAS WATCHED FINDING A PLANTED BYTE. 86 files — every path `find tests
 * probe -type f` returns, non-`.ndjson` and `.ndjson` alike — reported `86
 * swept []` from a Node sweep that reads each file as `latin1`, which is the
 * load-bearing detail: it maps every byte to its own code point, so no decoder
 * silently replaces the thing being looked for.
 *
 *   find tests probe -type f | node -e "const f=require('fs'),C=/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/,l=f.readFileSync(0,'utf8').split('\n').filter(Boolean);console.log(l.length+' swept',l.filter(p=>C.test(f.readFileSync(p,'latin1'))))"
 *
 * It takes its file list on stdin, and that is how it was proved able to
 * report rather than assumed to be: with one extra path appended carrying a
 * literal 0x08 it printed `87 swept` and named exactly that file.
 *
 * THE INSTRUMENT IS NAMED BECAUSE THE PREVIOUS ONE DID NOT WORK HERE. This
 * paragraph used to cite `grep -lP` for the control class over the same
 * `find`. That command reports nothing **in the environment this suite runs
 * in**, where `LANG` and `LC_ALL` are both unset: it exits 2 with
 * `grep: -P supports only unibyte and UTF-8 locales` and finds no match
 * whatever the files contain — confirmed against the same planted-byte file,
 * which it also failed to find.
 *
 * THE CONDITION IS NAMED ON PURPOSE, and the first draft of this very
 * paragraph got it wrong by omitting it. `grep -P` is not broken as such:
 * force a UTF-8 locale and it works, `LC_ALL=C.UTF-8 grep -lP '[\x00-\x08…]'`
 * exiting 1 and naming the planted file. So a later reader whose shell sets
 * `LANG` will find the old command behaving fine, and would reasonably
 * conclude this warning was wrong. It is not — it is scoped. What makes the
 * original measurement worthless is that it was taken with the locale unset,
 * where a clean result and an unrunnable command are indistinguishable.
 *
 * The conclusion survived re-measurement; only the evidence for it had to be
 * replaced — and that is this rule's own failure mode, silent and introduced
 * by tooling, arriving one level up in the docblock that argues for it. The
 * over-general first draft was the same failure a level up again, which is
 * why the condition is spelled out rather than trimmed for brevity.
 *
 * So the exclusion hides nothing that exists; it is there for the recording
 * that will one day legitimately carry one.
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

/** See the docblock above for why `.md` and `.json` are in and `.ndjson` is out. */
const CONTROL_BYTE_EXTENSIONS = /\.(ts|tsx|css|html|md|json)$/;

/**
 * ONE ENTRY PER WALKED ROOT, EACH WITH ITS OWN FLOOR. Per-root rather than one
 * threshold over a merged list, on purpose: a single
 * `expect(files.length).toBeGreaterThan(100)` across three roots stays green
 * when `probe/` is renamed, because `src/`'s 268 matches absorb the eight that
 * went missing, and the rule then reports `clean` over a tree it never opened.
 * That is the same vacuity shape the rest of this file exists to close, so the
 * roots are asserted one at a time and the failure names the one that came up
 * short. The counts in the comments were measured this session by
 * `find <root> -type f -regextype posix-extended -regex '.*\.(ts|tsx|css|html|md|json)$' | wc -l`.
 */
const CONTROL_BYTE_ROOTS: readonly { path: string; label: string; floor: number }[] = [
  { path: SRC_ROOT, label: 'src', floor: 200 }, // 268 matched
  { path: TEST_TREE_ROOT, label: 'tests', floor: 50 }, // 68 matched
  { path: PROBE_ROOT, label: 'probe', floor: 5 }, // 8 matched
];

/**
 * `filesUnder` lets ENOENT out of `readdirSync`, so a mistyped or renamed root
 * would fail this rule with a stack trace about a directory read rather than
 * with the name of the root that vanished. The floor above is the assertion
 * that should speak, so an absent root is turned into zero files and handed to
 * it. Only ENOENT: any other IO failure is a real fault and still throws.
 */
async function filesUnderIfPresent(root: string, extensions: RegExp): Promise<string[]> {
  try {
    return await filesUnder(root, extensions);
  } catch (error) {
    if ((error as { code?: string }).code === 'ENOENT') return [];
    throw error;
  }
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

  it('finds no stray control byte anywhere under src/, tests/ or probe/', async () => {
    const offenders: string[] = [];
    for (const { path, label, floor } of CONTROL_BYTE_ROOTS) {
      const files = await filesUnderIfPresent(path, CONTROL_BYTE_EXTENSIONS);
      // Each root proves it was really walked, separately, so a missing one
      // cannot hide behind another root's totals.
      expect(
        files.length,
        `${label}/ matched ${String(files.length)} files, at or below the floor of ${String(floor)} measured this session: the root is missing, renamed or newly empty, and a clean control-byte report over it would mean nothing`,
      ).toBeGreaterThan(floor);

      for (const file of files) {
        const found = controlByteReport(await read(file));
        if (found !== null) offenders.push(`${relative(file)}: ${found}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('finds no reference to a retired test id outside the one ratified proof', async () => {
    // Deliberately still `src/` only, and still on its own extension filter:
    // the retired id is a renderer `getByTestId` selector, and widening its
    // reach is a separate decision from widening the control-byte walk's.
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

// ---------------------------------------------------------------------------
// The two conversions of 2026-10-09-orcastrate-theme-contract-decisions
// ---------------------------------------------------------------------------

/**
 * THE SCOPE TRAP THIS SECTION EXISTS TO AVOID, and it is the reason the rules
 * here do not simply extend the ones above.
 *
 * `panelStylesheets()` walks `TOKENISED_STYLE_ROOTS` — `beachcomber/`, `helm/`
 * and `shell/`, three directories. That is why the five bare `font-weight`
 * literals in `lanes/`, `pods/` and `transcript/` were never offenders, never
 * appeared in the exception list the scoped rule pinned at the time, and
 * survived a session whose whole subject was font-weight tokens: the rule was
 * never looking at them. A narrow rule does not report that it is narrow,
 * which is the failure mode worth writing a second rule to close.
 *
 * So BOTH rules below walk EVERY `*.module.css` under `src/renderer/src`, and
 * both are two-sided.
 */
async function allModuleStylesheets(): Promise<string[]> {
  return (await filesUnder(`${RENDERER_ROOT}/src`, /\.module\.css$/)).sort();
}

/**
 * The value of every `prop: …` declaration, ANCHORED AT A DECLARATION
 * BOUNDARY — start of text, `;`, `{` or a newline.
 *
 * `declaredValues` above is deliberately unanchored and that is right for its
 * callers, but it cannot be reused here: it searches anywhere in the text, so
 * `declaredValues(text, 'position')` reads `background-position: center` as a
 * `position` of `center`, and `declaredValues(text, 'background')` would never
 * see `background-color` at all. The scrim rule below turns on exactly those
 * two properties, so it needs a reader that cannot confuse a longhand with the
 * shorthand it is spelled inside. Both directions are proved below.
 */
function anchoredValues(text: string, prop: string): string[] {
  const out: string[] = [];
  const pattern = new RegExp(`(?:^|[;{\\n])\\s*${prop}\\s*:\\s*([^;\\n}]*)`, 'gi');
  for (const match of text.matchAll(pattern)) {
    if (match[1] !== undefined) out.push(match[1].trim());
  }
  return out;
}

/**
 * Innermost `selector { … }` blocks. A nested at-rule yields the rules INSIDE
 * it rather than itself, which is what this needs: `LaneRail.module.css` and
 * `PodBar.module.css` both wrap rules in `@media (prefers-reduced-motion)`,
 * and a rule's properties must be read per rule and not per file — "this file
 * mentions `position: fixed` somewhere and `background` somewhere" is not the
 * question.
 */
interface CssRule {
  selector: string;
  body: string;
}

function cssRules(text: string): CssRule[] {
  const rules: CssRule[] = [];
  for (const match of text.matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
    rules.push({ selector: (match[1] ?? '').trim(), body: match[2] ?? '' });
  }
  return rules;
}

/**
 * All four edges pinned. `0 auto 0 auto` and `0 0 auto 0` are NOT this: they
 * pin some edges and leave others, so the rule covers a strip rather than the
 * window, and a strip is not a scrim.
 */
const ALL_EDGES_PINNED = /^0(?:px)?(?:\s+0(?:px)?){0,3}$/;

/** A full-window overlay: taken out of flow, and pinned to every edge. */
function isFullWindowRule(rule: CssRule): boolean {
  return (
    anchoredValues(rule.body, 'position').includes('fixed') &&
    anchoredValues(rule.body, 'inset').some((value) => ALL_EDGES_PINNED.test(value))
  );
}

/** Every background a full-window rule paints, `background-color` included. */
function fullWindowBackgrounds(text: string): { selector: string; background: string }[] {
  const out: { selector: string; background: string }[] = [];
  for (const rule of cssRules(text)) {
    if (!isFullWindowRule(rule)) continue;
    for (const prop of ['background', 'background-color']) {
      for (const background of anchoredValues(rule.body, prop)) {
        out.push({ selector: rule.selector, background });
      }
    }
  }
  return out;
}

const OVERLAY_SCRIM = 'var(--oc-overlay-scrim)';

/**
 * THE FOUR FULL-WINDOW SCRIMS, NAMED INDIVIDUALLY so the count cannot drift
 * silently in EITHER direction. A fifth scrim fails this; so does one of these
 * four ceasing to be a full-window overlay. All four were
 * `background: var(--oc-bg-app)` — fully opaque, so a dialog HID the window
 * instead of veiling it — until `--oc-overlay-scrim` existed to carry an alpha.
 */
const FULL_WINDOW_SCRIM_RULES: readonly string[] = [
  'src/renderer/src/beachcomber/BeachcomberPreviewDialog.module.css: .scrim',
  'src/renderer/src/helm/Helm.module.css: .confirmScrim',
  'src/renderer/src/pods/DeletePodDialog.module.css: .scrim',
  'src/renderer/src/pods/NewPodDialog.module.css: .scrim',
];

/**
 * A weight must be a `--oc-weight-*` token and not merely SOME token.
 * `tokenOffenders` accepts any `var(`, which is right for its callers but
 * would pass `font-weight: var(--oc-space-2)` — a token, wrong family, and
 * nonsense as a weight.
 */
const WEIGHT_TOKEN = /^var\(\s*--oc-weight-[\w-]+\s*\)$/;

function weightOffenders(text: string): string[] {
  return anchoredValues(text, FONT_WEIGHT)
    .filter((value) => !WEIGHT_TOKEN.test(value))
    .map((value) => `${FONT_WEIGHT}: ${value}`);
}

describe('the census matchers themselves', () => {
  it('reads a declaration without confusing a longhand for its shorthand', () => {
    // The case that MUST match, in the exact shape the four scrims are written.
    expect(anchoredValues('\n  position: fixed;\n', 'position')).toEqual(['fixed']);
    expect(anchoredValues('{ position: fixed; }', 'position')).toEqual(['fixed']);
    expect(anchoredValues('color: red; position: fixed;', 'position')).toEqual(['fixed']);

    // The NEAR-MISSES that must not. This is the whole reason the helper
    // exists: `declaredValues` reads both of these as a `position` and a
    // `background`, and is shown doing so here rather than described.
    expect(anchoredValues('\n  background-position: center;\n', 'position')).toEqual([]);
    expect(declaredValues('\n  background-position: center;\n', 'position')).toEqual(['center']);
    expect(anchoredValues('\n  background-color: red;\n', 'background')).toEqual([]);
    expect(anchoredValues('\n  background-color: red;\n', 'background-color')).toEqual(['red']);
  });

  it('splits rules so a property is read per rule and not per file', () => {
    // Two rules, each holding one half of the scrim recipe. A per-FILE check
    // would call this a full-window background; a per-RULE check must not.
    const split = '.a { position: fixed; }\n.b { inset: 0; background: red; }';
    expect(cssRules(split).map((rule) => rule.selector)).toEqual(['.a', '.b']);
    expect(fullWindowBackgrounds(split)).toEqual([]);

    // And a rule nested in an at-rule is still reached, which is how
    // `LaneRail.module.css` and `PodBar.module.css` are written.
    const nested = '@media (prefers-reduced-motion: reduce) {\n  .c { position: fixed; inset: 0; background: red; }\n}';
    expect(fullWindowBackgrounds(nested)).toEqual([{ selector: '.c', background: 'red' }]);
  });

  it('catches a full-window background that is not the scrim token, and passes its clean twin', () => {
    const dirty = '.scrim { position: fixed; inset: 0; background: var(--oc-bg-app); }';
    expect(fullWindowBackgrounds(dirty)).toEqual([
      { selector: '.scrim', background: 'var(--oc-bg-app)' },
    ]);
    const clean = `.scrim { position: fixed; inset: 0; background: ${OVERLAY_SCRIM}; }`;
    expect(fullWindowBackgrounds(clean)).toEqual([
      { selector: '.scrim', background: OVERLAY_SCRIM },
    ]);
    expect(fullWindowBackgrounds(clean).every((f) => f.background === OVERLAY_SCRIM)).toBe(true);
    expect(fullWindowBackgrounds(dirty).every((f) => f.background === OVERLAY_SCRIM)).toBe(false);

    // A STRIP IS NOT A SCRIM: pinned on three edges, so it covers a band and
    // is none of this rule's business.
    expect(ALL_EDGES_PINNED.test('0')).toBe(true);
    expect(ALL_EDGES_PINNED.test('0 0 0 0')).toBe(true);
    expect(ALL_EDGES_PINNED.test('0 0 auto 0')).toBe(false);
    expect(
      fullWindowBackgrounds('.d { position: fixed; inset: 0 0 auto 0; background: red; }'),
    ).toEqual([]);
    // Not taken out of flow at all.
    expect(
      fullWindowBackgrounds('.e { position: absolute; inset: 0; background: red; }'),
    ).toEqual([]);
  });

  it('catches a font weight that is not a --oc-weight-* token, and passes every twin that is', () => {
    // The ten-times-repeated violation this session converted, and the four
    // other bare literals the census also found.
    expect(weightOffenders(`.a { ${FONT_WEIGHT}: 600; }`)).toEqual([`${FONT_WEIGHT}: 600`]);
    expect(weightOffenders(`.a { ${FONT_WEIGHT}: 700; }`)).toEqual([`${FONT_WEIGHT}: 700`]);
    expect(weightOffenders(`.a { ${FONT_WEIGHT}: 400; }`)).toEqual([`${FONT_WEIGHT}: 400`]);
    // A KEYWORD is a literal too. The census found numerics only, so this is
    // the case the rule holds against rather than one it has met.
    expect(weightOffenders(`.a { ${FONT_WEIGHT}: bold; }`)).toEqual([`${FONT_WEIGHT}: bold`]);

    // Every weight token passes, the new one included.
    for (const weight of ['regular', 'medium', 'semibold', 'bold']) {
      expect(weightOffenders(`.a { ${FONT_WEIGHT}: var(--oc-weight-${weight}); }`)).toEqual([]);
    }

    // A token of the WRONG FAMILY is still an offender — this is what
    // `tokenOffenders` would wave through, shown rather than described.
    const wrongFamily = `.a { ${FONT_WEIGHT}: var(--oc-space-2); }`;
    expect(weightOffenders(wrongFamily)).toEqual([`${FONT_WEIGHT}: var(--oc-space-2)`]);
    expect(tokenOffenders(wrongFamily, [FONT_WEIGHT])).toEqual([]);

    // And the lookahead trap this file documents at length is not reintroduced
    // here: the clean declaration must not fire.
    expect(weightOffenders(`.a { ${FONT_WEIGHT}:var(--oc-weight-bold); }`)).toEqual([]);
  });
});

describe('the theme-contract conversions of this session', () => {
  it('censuses every module stylesheet in the renderer, well beyond the three panel roots', async () => {
    const sheets = await allModuleStylesheets();
    const names = sheets.map(relative);

    // A census that silently scanned nothing would otherwise report as a pass.
    expect(sheets.length).toBeGreaterThan(0);

    // And it must reach OUTSIDE `TOKENISED_STYLE_ROOTS`, which is the entire
    // point of this section: these three directories hold the five literals
    // the scoped rule could never see.
    expect(names).toContain('src/renderer/src/lanes/LaneRail.module.css');
    expect(names).toContain('src/renderer/src/pods/PodBar.module.css');
    expect(names).toContain('src/renderer/src/transcript/Transcript.module.css');
    for (const sheet of sheets) {
      expect(sheet.endsWith('.module.css')).toBe(true);
    }
    // Strictly wider than the scoped scan, so this is not a duplicate of it.
    expect(sheets.length).toBeGreaterThan((await panelStylesheets()).length);
  });

  it('sets every font weight from a --oc-weight-* token, everywhere, with no exception list', async () => {
    const offenders: string[] = [];
    for (const file of await allModuleStylesheets()) {
      const text = stripCssComments(await read(file));
      for (const offender of weightOffenders(text)) {
        offenders.push(`${relative(file)}: ${offender}`);
      }
    }
    // NO EXCEPTION LIST, deliberately. The alternative was a second list of
    // tolerated declarations — the kind of artifact the scoped rule above
    // carried until its last entry was converted away and the list deleted.
    expect(offenders).toEqual([]);
  });

  it('paints every full-window overlay with the scrim token, and there are exactly four', async () => {
    const found: string[] = [];
    const wrong: string[] = [];
    for (const file of await allModuleStylesheets()) {
      // COMMENTS MUST BE STRIPPED: `permissions/PermissionCards.module.css`
      // discusses `position: fixed` in prose to explain that it has none, and
      // a rule that read prose as code would call it a scrim.
      const text = stripCssComments(await read(file));
      for (const { selector, background } of fullWindowBackgrounds(text)) {
        found.push(`${relative(file)}: ${selector}`);
        if (background !== OVERLAY_SCRIM) {
          wrong.push(`${relative(file)}: ${selector} paints ${background}`);
        }
      }
    }
    expect(wrong).toEqual([]);
    // TWO-SIDED on the named list, like every other census in this file: a
    // fifth full-window scrim fails, and so does one of these four quietly
    // ceasing to be one.
    expect(found.sort()).toEqual([...FULL_WINDOW_SCRIM_RULES]);
  });
});

// ---------------------------------------------------------------------------
// The repo-wide census, widened to tracking, border widths and live syntax
// ---------------------------------------------------------------------------

/**
 * WHY THESE THREE RULES ARE HERE RATHER THAN BOLTED ONTO THE SCOPED RULE.
 *
 * The scoped rule above walks `TOKENISED_STYLE_ROOTS`, three directories. It
 * held border widths and letter-spacings there and nowhere else, and a narrow
 * rule does not report that it is narrow — the same failure mode that let five
 * bare `font-weight` literals outlive a session about font weights. So the two
 * properties join the font-weight census here: EVERY `*.module.css` under
 * `src/renderer/src`, via `allModuleStylesheets()`, with no exception list of
 * any kind and two-sided against the empty list.
 *
 * ALL THREE READ DECLARATIONS WITH `anchoredValues`, not `declaredValues`. The
 * anchored reader requires a declaration boundary before the property name, so
 * `border-radius` can never be read as a `border`, `outline-offset` can never
 * be read as an `outline`, and a custom property named `--oc-border` could
 * never be read as a `border` either. The unanchored reader happens to be safe
 * on today's tree only because no `*.module.css` in it declares a custom
 * property at all; the anchored one is safe by construction instead, and the
 * near-misses are asserted below rather than argued for here.
 */

/**
 * A tracking value must name the `--oc-tracking-*` family and not merely SOME
 * token, exactly as `WEIGHT_TOKEN` does for weights. `tokenOffenders` accepts
 * any `var(`, which would wave through `letter-spacing: var(--oc-space-2)` — a
 * real token, the wrong family, and nonsense as a tracking value. That sample
 * is asserted below in both directions.
 */
const TRACKING_TOKEN = /^var\(\s*--oc-tracking-[\w-]+\s*\)$/;

function trackingOffenders(text: string): string[] {
  return anchoredValues(text, LETTER_SPACING)
    .filter((value) => !TRACKING_TOKEN.test(value))
    .map((value) => `${LETTER_SPACING}: ${value}`);
}

/**
 * Every property that declares a border WIDTH, the logical forms included.
 *
 * WIDER THAN `BORDER_PROPERTIES` ABOVE, which omits `border-block` and
 * `border-inline`. The scoped rule's unanchored reader cannot see either one:
 * `declaredValues(text, 'border')` needs `border` then a colon, and
 * `border-block:` offers a hyphen, so a logical-form declaration was invisible
 * to it. That contrast is asserted below rather than described.
 *
 * AND THE LOGICAL LONGHANDS ARE LISTED INDIVIDUALLY, which is a correction to
 * this list rather than a flourish. `anchoredValues` builds
 * `(?:^|[;{\n])\s*<prop>\s*:`, so the property name must be followed by the
 * colon: `anchoredValues(text, 'border-block')` CANNOT reach
 * `border-block-start:`, because `-start` sits exactly where the colon has to
 * be. Listing the two shorthands therefore bought no coverage of the four
 * longhands at all, and this list repeated — one level deeper — the very
 * omission it was added to fix, since `border-block` and `border-inline` were
 * themselves added because the scoped reader could not see them.
 *
 * ALL FOUR LONGHANDS ARE COVERED BY SYNTHETIC SAMPLES ONLY. None ships: as
 * this list is written, `grep -rnE 'border-(block|inline)-(start|end)'
 * --include='*.module.css' src/renderer/src` returns nothing and exits 1, and
 * that command was watched matching a planted
 * `.a { border-block-start: thin solid red; }` before its empty result was
 * believed. So this is a rule held against a form the tree has not used yet,
 * said out loud rather than inferred from an empty offender list.
 *
 * `border-radius` is absent and unreachable: a radius is a length but not a
 * border width, and it has its own `--oc-radius-*` tokens. It is also the
 * near-miss that matters here by volume — 69 `border-radius` declarations
 * exist in this tree as this census is written, measured with
 * `grep -rhoE '(^|[;{])[[:space:]]*border-radius[[:space:]]*:' --include='*.module.css' src/renderer/src | wc -l`,
 * and not one of them may enter the offender set.
 *
 * `border-style` AND `border-color` ARE UNREACHABLE FOR THE SAME REASON THE
 * LONGHANDS WERE, and that is load-bearing in the other direction: this tree
 * declares `border-style: dashed` and `border-color: var(--oc-danger)`, and a
 * predicate that let a `border` entry consume a `-style` or `-color` suffix
 * would read a STYLE or a COLOUR as a width. An exact, enumerated alternation
 * is what prevents it; both are asserted below.
 */
const CENSUS_BORDER_PROPERTIES: readonly string[] = [
  'border',
  'border-top',
  'border-right',
  'border-bottom',
  'border-left',
  'border-width',
  'border-block',
  'border-inline',
  'border-block-start',
  'border-block-end',
  'border-inline-start',
  'border-inline-end',
  'outline',
];

/**
 * A raw length in a border width is an offender REGARDLESS of whether the rest
 * of the value names a token: `border: 1px solid var(--oc-border)` is one.
 * Counting only declarations that named no token at all is how a census of
 * this exact population once reported 2 where 36 existed.
 *
 * `0` is not a raw length — a zero border has no unit to tokenise, and
 * `border: 0` is how a reset is spelled throughout this tree.
 *
 * A BARE WIDTH KEYWORD IS AN OFFENDER ON THE SAME FOOTING, and for the same
 * reason rather than by analogy: `thin` defers the width to the engine instead
 * of to the token set, which is the property this census holds. It is not a raw
 * length, which is exactly why a predicate written only against raw lengths
 * reported this population clean while six keyword declarations shipped — a
 * census true of its predicate and blind to its subject, for the third time in
 * this area. `isOffendingBorderWidth` carries both halves.
 */
function censusBorderOffenders(text: string): string[] {
  const found: string[] = [];
  for (const prop of CENSUS_BORDER_PROPERTIES) {
    for (const value of anchoredValues(text, prop)) {
      if (isOffendingBorderWidth(value)) found.push(`${prop}: ${value}`);
    }
  }
  return found;
}

/**
 * RULE 3 — A TOKEN REFERENCE THAT RUNS STRAIGHT INTO THE NEXT TERM, which is
 * a defect class that had NO detector anywhere in this repository.
 *
 * WHY IT EXISTS, WRITTEN DOWN BECAUSE THE INCIDENT IS THE ARGUMENT. The first
 * pass of this session's `pods/` conversion emitted
 * `border: var(--oc-border-hairline)solid var(--oc-border)` on every line it
 * touched. That is not a border with a token width; it is invalid CSS, which a
 * browser discards as a whole declaration, so every one of those borders would
 * simply have vanished on screen. Nothing caught it. The raw-length census
 * passes it cleanly — there is no raw length in it — and so does the tracking
 * census, and so did the full `pods/` suite. `styles/tokens.test.ts` checks
 * that token NAMES match the frozen `TOKENS` map and never that a usage is
 * syntactically live, and there is no CSS parser anywhere under `src/` or
 * `tests/` to notice. A tokenised value can be dead, and every
 * presence-of-a-raw-length predicate in this repository is blind to that.
 *
 * WHAT TERMINATES A REFERENCE LEGALLY: whitespace, `,`, `)`, `;`, `}`, or the
 * end of the line. The last three need no help from the pattern —
 * `anchoredValues` truncates a value at exactly `;`, `}` and the newline, so a
 * reference terminated by one of them lands at the end of the extracted value
 * and the lookahead below has nothing to match. The pattern therefore handles
 * whitespace, `,` and `)`, and the `;`, `}` and end-of-line forms are asserted
 * below so the claim rests on a test rather than on this paragraph.
 *
 * SCOPE, NAMED RATHER THAN IMPLIED: `--oc-*` references only. A dead
 * `var(--pod-status-color)solid` would not be flagged, and that boundary is
 * asserted below too, so a later reader finds it stated rather than discovers
 * it.
 */
const DEAD_TOKEN_REFERENCE = /var\(\s*--oc-[\w-]+\s*\)(?=[^\s,)])/;

/**
 * Every property name declared in the text, found at a declaration boundary.
 *
 * The termination rule is about EVERY property, not a listed few, so it cannot
 * take a property list the way the two censuses above do — it has to discover
 * the names and then read each one with the same anchored reader. A name must
 * start with a letter, which is what keeps a custom property (`--oc-x: …`,
 * leading hyphens) from being read as a property, and it also makes every name
 * returned here safe to interpolate into `anchoredValues`'s pattern: `[\w-]`
 * contains no regex metacharacter.
 */
function declaredProperties(text: string): string[] {
  const names = new Set<string>();
  for (const match of text.matchAll(/(?:^|[;{\n])\s*([a-zA-Z][\w-]*)\s*:/g)) {
    if (match[1] !== undefined) names.add(match[1].toLowerCase());
  }
  return [...names].sort();
}

function unterminatedTokenOffenders(text: string): string[] {
  const found: string[] = [];
  const everyReference = new RegExp(DEAD_TOKEN_REFERENCE.source, 'g');
  for (const prop of declaredProperties(text)) {
    for (const value of anchoredValues(text, prop)) {
      // A bare element selector carrying a pseudo-class (`a:hover {`) is the
      // one shape the scan above can read as a property. Its "value" holds the
      // opening brace and no declaration's does, so this cannot discard one.
      if (value.includes('{')) continue;
      for (const _match of value.matchAll(everyReference)) {
        found.push(`${prop}: ${value}`);
      }
    }
  }
  return found;
}

describe('the widened census matchers themselves', () => {
  it('catches a letter-spacing that is not a --oc-tracking-* token, the wrong family included, and passes both shipped tracking tokens', () => {
    // MUST FLAG. The first two are the literals this session converted; the
    // third is a keyword, which is a literal too.
    expect(trackingOffenders(`.a { ${LETTER_SPACING}: 0.04` + 'em; }')).toEqual([
      `${LETTER_SPACING}: 0.04` + 'em',
    ]);
    expect(trackingOffenders(`.a { ${LETTER_SPACING}: 0.06` + 'em; }')).toEqual([
      `${LETTER_SPACING}: 0.06` + 'em',
    ]);
    expect(trackingOffenders(`.a { ${LETTER_SPACING}: normal; }`)).toEqual([
      `${LETTER_SPACING}: normal`,
    ]);

    // THE SAMPLE THAT MATTERS: a token of the WRONG FAMILY. A predicate that
    // merely tests for `var(` waves it through, and `tokenOffenders` is shown
    // doing exactly that here rather than being described as doing it.
    const wrongFamily = `.a { ${LETTER_SPACING}: var(--oc-space-2); }`;
    expect(trackingOffenders(wrongFamily)).toEqual([`${LETTER_SPACING}: var(--oc-space-2)`]);
    expect(tokenOffenders(wrongFamily, [LETTER_SPACING])).toEqual([]);

    // MUST NOT FLAG. Both shipped tracking tokens, and the no-space form that
    // the lookahead trap this file documents at length would fire on.
    expect(trackingOffenders(`.a { ${LETTER_SPACING}: var(--oc-tracking-wide); }`)).toEqual([]);
    expect(trackingOffenders(`.a { ${LETTER_SPACING}: var(--oc-tracking-tight); }`)).toEqual([]);
    expect(trackingOffenders(`.a { ${LETTER_SPACING}:var(--oc-tracking-wide); }`)).toEqual([]);
  });

  /**
   * THE FROZEN SAMPLE SETS, ASSERTED ONE AT A TIME.
   *
   * These are the `KEYWORD_MUST_FLAG` and `KEYWORD_MUST_PASS` declarations of
   * the frozen `keyword-hairline-sweep` contract, each named individually
   * rather than looped over a list, so a failure names the sample that broke
   * and not an index. A widened predicate is a NEW predicate and inherits no
   * guarantee from the one it replaced, which is why the near-misses the
   * raw-length census already held are re-asserted here against the keyword
   * half as well.
   */
  it('flags every must-flag keyword sample and clears every must-pass one in the census, and all but the custom property in the scoped rule', () => {
    // --- MUST FLAG -------------------------------------------------------
    // The two shipped shapes: the form all six converted declarations had.
    expect(censusBorderOffenders('border: thin solid var(--oc-border)')).toEqual([
      'border: thin solid var(--oc-border)',
    ]);
    expect(censusBorderOffenders('border-top: thin solid var(--oc-border)')).toEqual([
      'border-top: thin solid var(--oc-border)',
    ]);

    // THE TWO KEYWORDS THAT SHIP NOWHERE, held synthetically and said so. A
    // rule named for the keyword forms that read `thin` alone would be
    // narrower than its own name.
    expect(censusBorderOffenders('border: medium solid var(--oc-border)')).toEqual([
      'border: medium solid var(--oc-border)',
    ]);
    expect(censusBorderOffenders('border-width: thick')).toEqual(['border-width: thick']);

    // THE LOGICAL FORM, which the census property list reaches and the scoped
    // rule's unanchored reader cannot see at all. Both directions, because the
    // difference between the two lists is a deliberate property of this file.
    expect(censusBorderOffenders('border-block: thin solid var(--oc-border)')).toEqual([
      'border-block: thin solid var(--oc-border)',
    ]);
    expect(borderOffenders('border-block: thin solid var(--oc-border)')).toEqual([]);

    // AND THE LOGICAL LONGHANDS, the omission this session corrected. Listing
    // `border-block` bought none of these: the reader needs the colon directly
    // after the property name, and `-start` sits where the colon must be. All
    // four are synthetic — none ships.
    for (const prop of [
      'border-block-start',
      'border-block-end',
      'border-inline-start',
      'border-inline-end',
    ]) {
      expect(censusBorderOffenders(`${prop}: thin solid var(--oc-border)`)).toEqual([
        `${prop}: thin solid var(--oc-border)`,
      ]);
      expect(censusBorderOffenders(`${prop}: 1` + 'px solid var(--oc-border)')).toHaveLength(1);
      // And the shorthand entry really could not have reached it, which is the
      // claim the four entries above rest on.
      expect(anchoredValues(`${prop}: thin solid red`, 'border-block')).toEqual([]);
      expect(anchoredValues(`${prop}: thin solid red`, 'border-inline')).toEqual([]);
    }

    // --- MUST PASS -------------------------------------------------------
    // The converted form every one of the six became.
    const converted = 'border: var(--oc-border-hairline) solid var(--oc-border)';
    expect(censusBorderOffenders(converted)).toEqual([]);
    expect(borderOffenders(converted)).toEqual([]);

    /*
     * THE SAMPLE THAT MATTERS, and the reason this predicate is a term match.
     * `var(--oc-border-thick)` is a TOKEN whose NAME ends in a width keyword,
     * and this tree ships references to it — 5 of them in border declarations
     * inside the three scoped roots alone. A predicate that substring-matched
     * `thick` inside a value would flag every one and go red on a clean tree,
     * which is the difference between a term match and a substring match,
     * shown here rather than described.
     */
    const thickToken = 'border: var(--oc-border-thick) solid var(--oc-border)';
    expect(censusBorderOffenders(thickToken)).toEqual([]);
    expect(borderOffenders(thickToken)).toEqual([]);
    expect(censusBorderOffenders('border-width: var(--oc-border-thick)')).toEqual([]);
    expect(borderOffenders('border-width: var(--oc-border-thick)')).toEqual([]);
    // The substring reading, shown failing, so the near-miss is a measured
    // hazard and not a cautionary tale: this is what the rule would do without
    // its term anchors.
    expect(/thick/.test(thickToken)).toBe(true);
    expect(BARE_WIDTH_KEYWORD.test(thickToken)).toBe(false);

    // The near-misses carried forward from the token sweep's contract.
    expect(censusBorderOffenders('border: 0')).toEqual([]);
    expect(borderOffenders('border: 0')).toEqual([]);
    expect(censusBorderOffenders('border-radius: 4' + 'px')).toEqual([]);
    expect(borderOffenders('border-radius: 4' + 'px')).toEqual([]);
    expect(censusBorderOffenders('outline-offset: 2' + 'px')).toEqual([]);
    expect(borderOffenders('outline-offset: 2' + 'px')).toEqual([]);

    /*
     * THE ONE SAMPLE THE TWO PREDICATES DISAGREE ABOUT, asserted in both
     * directions rather than reconciled.
     *
     * `--oc-border: thin` is a CUSTOM PROPERTY whose name ends in `border`. The
     * anchored census cannot read it as a `border` at all and passes it. The
     * scoped rule's UNANCHORED reader does read it as a `border` of `thin` and
     * flags it — exactly as it already flags `--oc-border: 1px`, which this
     * file has asserted for a session and the header describes as a deliberate
     * property of the narrower rule rather than a defect in it. Making the
     * keyword half disagree with the raw-length half about the same sample
     * would be the inconsistency this session exists to remove, and the only
     * other repair would be changing the scoped reader, which the frozen
     * contract fixes as `declaredValues`. So the asymmetry is preserved,
     * deliberately, and it costs nothing: no `*.module.css` in this tree
     * declares a custom property at all.
     */
    expect(censusBorderOffenders('--oc-border: thin')).toEqual([]);
    expect(borderOffenders('--oc-border: thin')).toEqual(['border: thin']);
    expect(censusBorderOffenders('--oc-border: 1' + 'px')).toEqual([]);
    expect(borderOffenders('--oc-border: 1' + 'px')).toEqual(['border: 1' + 'px']);

    /*
     * `_` IS AN IDENTIFIER CHARACTER, so a keyword behind one is not bare.
     * Unexercised in this tree and held synthetically; the decision and its
     * reasoning sit on `BARE_WIDTH_KEYWORD`. Asserted so that a later reader
     * who widens the character class sees this fail rather than discovering
     * the change at a review.
     */
    expect(censusBorderOffenders('border-width: _thin')).toEqual([]);
    expect(censusBorderOffenders('border-width: thin_')).toEqual([]);

    /*
     * AND THE ALTERNATION REACHES NO STYLE AND NO COLOUR. `border-style` and
     * `border-color` ship in this tree, and a `border` entry that consumed a
     * `-style` or `-color` suffix would read a style term or a colour as a
     * width — `thick` is a legal nonsense value for neither, but `dashed` and a
     * token colour are what is actually there. The exact enumerated list is
     * what prevents it.
     */
    expect(censusBorderOffenders('border-style: thin')).toEqual([]);
    expect(censusBorderOffenders('border-color: thick')).toEqual([]);
    expect(censusBorderOffenders('border-style: dashed')).toEqual([]);
    expect(censusBorderOffenders('border-color: var(--oc-danger)')).toEqual([]);
    expect(anchoredValues('border-style: dashed', 'border')).toEqual([]);
    expect(anchoredValues('border-color: var(--oc-danger)', 'border')).toEqual([]);
  });

  it('catches a raw length or a bare width keyword in every listed border-width property, and passes a radius, a bare 0 and outline-offset', () => {
    // MUST FLAG. A raw length is an offender even when the colour beside it is
    // a token — the third sample is the one a token-presence count gets wrong.
    expect(censusBorderOffenders('.a { border: 1' + 'px solid var(--oc-border); }')).toEqual([
      'border: 1' + 'px solid var(--oc-border)',
    ]);
    expect(
      censusBorderOffenders('.a { border-bottom: 2' + 'px solid var(--oc-border); }'),
    ).toEqual(['border-bottom: 2' + 'px solid var(--oc-border)']);
    expect(censusBorderOffenders('.a { border: 1' + 'px solid red; }')).toEqual([
      'border: 1' + 'px solid red',
    ]);
    // And a bare keyword, in the rule-body shape the real stylesheets are
    // written in rather than the bare-declaration shape of the sample sets
    // above. A keyword is not a raw length, which is why this needed its own
    // half of the predicate.
    expect(censusBorderOffenders('.a { border: thin solid var(--oc-border); }')).toEqual([
      'border: thin solid var(--oc-border)',
    ]);
    expect(censusBorderOffenders('.a { border-width: medium; }')).toEqual([
      'border-width: medium',
    ]);
    expect(RAW_LENGTH.test('thin solid var(--oc-border)')).toBe(false);

    /*
     * EVERY LISTED PROPERTY, WHICH IS WHAT THIS TEST'S NAME CLAIMS.
     *
     * The samples above and below name the interesting shapes individually,
     * which is this file's habit and the right one — but between them they
     * exercised 9 of the 13 entries, leaving `border-right`, `border-left`,
     * `border-inline` and `outline` as list items that no sample ever showed
     * flagging anything. A property no sample exercises is not coverage, which
     * is the argument the four logical longhands were added on; a name reading
     * "every listed border-width property" over a list only two thirds
     * exercised is the same overclaim one level up.
     *
     * THE LOOP RUNS OVER `CENSUS_BORDER_PROPERTIES` ITSELF rather than over a
     * second list of thirteen names written out here. A hand-copied list is a
     * census of the real one, and it would have to be kept in step by hand: the
     * next entry added to the real list would be covered by this test's NAME
     * and by nothing else, which is precisely the state this block exists to
     * end. Looping the shipped constant cannot drift from it.
     *
     * WHAT THIS LOOP CANNOT CATCH, said plainly rather than left for a later
     * reader to find out: a property DELETED from the list. The loop shrinks
     * with it and stays green, because it takes its subject from the same
     * constant. That is why the hand-named samples above and below are not
     * redundant with it and must not be folded into it — they name `border`,
     * `border-top`, `border-bottom`, `border-width` and `border-block` as
     * literals, so deleting any of those five fails a test that spells it out.
     * What the loop adds is the other direction: a property that is listed and
     * never actually read. Watched failing for exactly that, with `outline` and
     * `border-inline` skipped inside `censusBorderOffenders`: this test failed
     * naming `border-inline` and all 36 other tests in this file stayed green,
     * which is the measurement that says no other assertion here covers it.
     *
     * Both halves of the predicate per property, and each expectation is the
     * offender string for that property, so a failure names the property that
     * stopped being read rather than an index.
     */
    for (const prop of CENSUS_BORDER_PROPERTIES) {
      expect(censusBorderOffenders(`.a { ${prop}: thin solid var(--oc-border); }`)).toEqual([
        `${prop}: thin solid var(--oc-border)`,
      ]);
      expect(censusBorderOffenders(`.a { ${prop}: 1` + `px solid var(--oc-border); }`)).toEqual([
        `${prop}: 1` + 'px solid var(--oc-border)',
      ]);
      // And the tokenised twin of the same declaration passes, per property:
      // a rule that flagged every value would satisfy the two lines above.
      expect(
        censusBorderOffenders(`.a { ${prop}: var(--oc-border-hairline) solid var(--oc-border); }`),
      ).toEqual([]);
    }

    // THE LOGICAL FORM, and why this list is wider than `BORDER_PROPERTIES`:
    // the scoped rule's unanchored reader cannot see `border-block` at all.
    const logical = '.a { border-block: 1' + 'px solid var(--oc-border); }';
    expect(censusBorderOffenders(logical)).toEqual([
      'border-block: 1' + 'px solid var(--oc-border)',
    ]);
    expect(borderOffenders(logical)).toEqual([]);

    // MUST NOT FLAG. A tokenised width; a bare `0`, which has no unit to
    // tokenise; and the two near-misses the anchored reader exists for.
    expect(
      censusBorderOffenders('.a { border: var(--oc-border-hairline) solid var(--oc-border); }'),
    ).toEqual([]);
    expect(censusBorderOffenders('.a { border: 0; }')).toEqual([]);
    // The token whose NAME ends in a width keyword, in the exact shape
    // `helm/Helm.module.css:430` ships it. A substring predicate fails here.
    expect(
      censusBorderOffenders('.a { border: var(--oc-border-thick) solid var(--oc-border-strong); }'),
    ).toEqual([]);
    expect(censusBorderOffenders('.a { border-width: var(--oc-border-thick); }')).toEqual([]);
    expect(censusBorderOffenders('.a { border-radius: 4' + 'px; }')).toEqual([]);
    expect(censusBorderOffenders('.a { outline-offset: 2' + 'px; }')).toEqual([]);
    // THE NEAR-MISS THE ANCHORED READER IS ACTUALLY FOR. `border-radius` and
    // `outline-offset` are safe in both readers — each offers a hyphen where a
    // colon is needed. A CUSTOM PROPERTY is not: `--oc-border: 1px` ends in
    // `border:`, so the unanchored reader reads it as a `border` of `1px` and
    // the scoped rule above would call it an offender. Shown in both
    // directions rather than argued for.
    const customProperty = '.a { --oc-border: 1' + 'px; }';
    expect(declaredValues(customProperty, 'border')).toEqual(['1' + 'px']);
    expect(borderOffenders(customProperty)).toEqual(['border: 1' + 'px']);
    expect(anchoredValues(customProperty, 'border')).toEqual([]);
    expect(censusBorderOffenders(customProperty)).toEqual([]);
  });

  it('catches a var(--oc-*) reference that runs straight into the next term, and passes every legal terminator', () => {
    // MUST FLAG — the exact shape this session's first `pods/` pass emitted on
    // every line it touched. Invalid CSS: the browser discards the whole
    // declaration, so the border disappears.
    const dead = '.a { border: var(--oc-border-hairline)solid red; }';
    expect(unterminatedTokenOffenders(dead)).toEqual([
      'border: var(--oc-border-hairline)solid red',
    ]);
    const deadDashed = '.a { border: var(--oc-border-hairline)dashed red; }';
    expect(unterminatedTokenOffenders(deadDashed)).toEqual([
      'border: var(--oc-border-hairline)dashed red',
    ]);

    // AND THE REASON THIS RULE HAD TO BE WRITTEN: every other predicate in
    // this file passes that declaration. Shown, not asserted in prose.
    expect(censusBorderOffenders(dead)).toEqual([]);
    expect(borderOffenders(dead)).toEqual([]);
    expect(trackingOffenders(dead)).toEqual([]);
    const deadHistorical = '.a { border: var(--oc-border-hairline)solid var(--oc-border); }';
    expect(unterminatedTokenOffenders(deadHistorical)).toHaveLength(1);
    expect(censusBorderOffenders(deadHistorical)).toEqual([]);

    // MUST NOT FLAG — a space, a comma, a `)`, a `;`, a `}` and end-of-line.
    expect(
      unterminatedTokenOffenders('.a { border: var(--oc-border-hairline) solid red; }'),
    ).toEqual([]);
    expect(
      unterminatedTokenOffenders(
        '.a { box-shadow: 0 0 0 var(--oc-space-1), 0 0 0 var(--oc-space-2); }',
      ),
    ).toEqual([]);
    expect(unterminatedTokenOffenders('.a { padding: var(--oc-space-2); }')).toEqual([]);
    expect(unterminatedTokenOffenders('.a { padding: var(--oc-space-2) }')).toEqual([]);
    expect(unterminatedTokenOffenders('.a {\n  padding: var(--oc-space-2)\n}')).toEqual([]);
    expect(
      unterminatedTokenOffenders('.a { grid-template-columns: var(--oc-a) var(--oc-b); }'),
    ).toEqual([]);
    // A reference nested inside another function is terminated by the `)`.
    expect(
      unterminatedTokenOffenders('.a { width: calc(var(--oc-space-2) + var(--oc-space-1)); }'),
    ).toEqual([]);

    // THE SCOPE BOUNDARY, asserted so it is stated rather than discovered: the
    // rule covers `--oc-*` references, and a dead reference to any other
    // custom property is outside it.
    expect(
      unterminatedTokenOffenders('.a { border: var(--pod-status-color)solid red; }'),
    ).toEqual([]);
  });

  it('discovers property names at a declaration boundary and never reads a custom property as one', () => {
    expect(declaredProperties('.a { border: 0; padding: 0; }')).toEqual(['border', 'padding']);
    // A custom-property declaration is not a property. No `*.module.css` in
    // this tree declares one today, which is why the UNANCHORED reader happens
    // to be safe; this reader is safe whether or not that stays true.
    expect(declaredProperties('.a { --oc-border: red; }')).toEqual([]);
    expect(anchoredValues('.a { --oc-border: red; }', 'border')).toEqual([]);
    // And a dead reference inside a declaration whose property name is
    // discovered this way is still reached.
    expect(
      unterminatedTokenOffenders('.a { box-shadow: inset 0 0 0 var(--oc-space-1)solid; }'),
    ).toHaveLength(1);
  });
});

describe('the repo-wide token census of this session', () => {
  it('scans the same list the census guard above covers: non-empty, and wider than the three legacy roots', async () => {
    const sheets = await allModuleStylesheets();
    const names = sheets.map(relative);
    // A census that silently scanned nothing would report as a pass. Stated
    // here as well as above so these three rules do not depend on another
    // describe block's guard to be non-vacuous.
    expect(sheets.length).toBeGreaterThan(0);
    expect(names).toContain('src/renderer/src/lanes/LaneRail.module.css');
    expect(names).toContain('src/renderer/src/pods/PodBar.module.css');
    expect(names).toContain('src/renderer/src/transcript/Transcript.module.css');
    expect(sheets.length).toBeGreaterThan((await panelStylesheets()).length);
  });

  it('sets every letter-spacing from a --oc-tracking-* token, everywhere, with no exception list', async () => {
    const offenders: string[] = [];
    for (const file of await allModuleStylesheets()) {
      const text = stripCssComments(await read(file));
      for (const offender of trackingOffenders(text)) {
        offenders.push(`${relative(file)}: ${offender}`);
      }
    }
    // NO EXCEPTION LIST, and two-sided against the empty list. The scoped rule
    // above held this property in three directories; this holds it in all of
    // them, and nothing is tolerated in either.
    expect(offenders.sort()).toEqual([]);
  });

  it('gives no listed border-width property a raw length or a bare width keyword, everywhere, with no exception list', async () => {
    const offenders: string[] = [];
    for (const file of await allModuleStylesheets()) {
      const text = stripCssComments(await read(file));
      for (const offender of censusBorderOffenders(text)) {
        offenders.push(`${relative(file)}: ${offender}`);
      }
    }
    // The pin that used to tolerate five raw `1px` widths in `shell/` was
    // deleted when they were converted. Nothing replaces it for any property,
    // and WIDENING THE PREDICATE DID NOT BRING ONE BACK: the six keyword
    // declarations this predicate newly reaches were converted rather than
    // tolerated, so this is still compared against the empty list. An exception
    // list that shrinks to nothing under review, rather than quietly outliving
    // the problem it described, is the mechanism working.
    expect(offenders.sort()).toEqual([]);
  });

  it('terminates every var(--oc-*) reference in every property declaration, everywhere, with no exception list', async () => {
    const offenders: string[] = [];
    for (const file of await allModuleStylesheets()) {
      const text = stripCssComments(await read(file));
      for (const offender of unterminatedTokenOffenders(text)) {
        offenders.push(`${relative(file)}: ${offender}`);
      }
    }
    expect(offenders.sort()).toEqual([]);
  });
});
