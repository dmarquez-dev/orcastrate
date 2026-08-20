/**
 * THE HYGIENE RULES OF THIS DIRECTORY, EACH CARRYING ITS OWN COUNTEREXAMPLE.
 *
 * WHY THIS FILE EXISTS. `no-paths.test.ts` and `Helm.styles.test.ts` assert
 * that the real source and the real stylesheet break none of these rules. That
 * is only worth something if the rules CAN break — and one of them could not:
 * the stylesheet suite shipped for one run with `font-weight:\s*(?!var\()`,
 * which matches nothing, because `\s*` consumes nothing and the lookahead then
 * sees a space. It passed against a file that would also have passed with a
 * hardcoded weight in it.
 *
 * So every rule below carries a `violation` that it MUST flag and a `clean`
 * that it MUST NOT, and `discrimination.test.ts` runs that matrix. A rule
 * whose pattern is weakened, or replaced by one that cannot fire, fails there
 * — against its own sample, with no reference to today's source. That is the
 * durable form of "this assertion discriminates": a later reader runs one
 * command instead of reconstructing a mutation round from a transcript.
 *
 * THE SAMPLES ARE ASSEMBLED FROM FRAGMENTS for the same reason
 * `__tests__/hygiene.test.ts` assembles its needles: a literal `#1a2b3c` or a
 * literal font stack in this file would make it a violation of the repo-wide
 * hygiene suite that scans every non-test renderer file.
 *
 * THIS FILE IS EXCLUDED FROM THE SOURCE SCAN, and `no-paths.test.ts` asserts
 * both that the exclusion list is exactly two names and that nothing excluded
 * contains markup. It has to be excluded: it names `resolve(` and holds a
 * sample path, so the scan would flag the rules for stating what they forbid.
 */

// ---------------------------------------------------------------------------
// The rule shape
// ---------------------------------------------------------------------------

export interface TextRule {
  /** Reads as the thing that is forbidden. */
  name: string;
  /** True when `text` BREAKS the rule. */
  violates(text: string): boolean;
  /** A sample this rule must flag. */
  violation: string;
  /** A sample this rule must pass. */
  clean: string;
}

// ---------------------------------------------------------------------------
// Preparing source text
// ---------------------------------------------------------------------------

/** Prose is not code. A rule that cannot tell them apart fails on doc comments. */
export function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** CSS has only block comments; the `//` rule above would eat `url(//…)`. */
export function stripCssComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** Module specifiers are paths BY DESIGN and are not user input. */
export function stripSpecifiers(source: string): string {
  return source
    .replace(/from\s*['"][^'"]*['"]/g, 'from MODULE')
    .replace(/import\s*\(\s*['"][^'"]*['"]\s*\)/g, 'import(MODULE)');
}

/** What the source rules below expect to be handed. */
export function prepareSource(source: string): string {
  return stripSpecifiers(stripComments(source));
}

export function literals(source: string): string[] {
  return [...source.matchAll(/'[^']*'|"[^"]*"|`[^`]*`/g)].map((match) => match[0]);
}

// ---------------------------------------------------------------------------
// Source rules (criterion 2)
// ---------------------------------------------------------------------------

const SEPARATOR = /[\\/]/;
const BRIDGE = 'window' + '.orcastrate';
const SAMPLE_PATH = "'..' + " + "'" + '/' + "' + 'etc'";

/**
 * `join(` is deliberately absent. There is no `path` module in the renderer to
 * import — the hygiene suite forbids every `node:` builtin — so the only `join`
 * reachable in this tree is `Array.prototype.join`, which `cx.ts` uses on class
 * names. A rule that fired on it would be asserting a decision nobody made and
 * would be switched off the first time it cried wolf. The separator rule is
 * what actually stops a path being composed, whatever the helper is called.
 */
const PATH_HELPERS = [
  'resolv' + 'e(',
  'normaliz' + 'e(',
  'basenam' + 'e(',
  'dirnam' + 'e(',
  'relativ' + 'e(',
];

const DISPLAY_PATH_BOUND = /\b(?:default)?[Vv]alue=\{[^}]*displayPath/;
const MARKUP_INPUT = /<(?:input|textarea)\b/;
const BARE_IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

export function selectScopeArguments(text: string): string[] {
  return [...text.matchAll(/selectScope\(([^)]*)\)/g)].map((match) => (match[1] ?? '').trim());
}

export const SOURCE_RULES: readonly TextRule[] = [
  {
    name: 'names the preload bridge',
    violates: (text) => text.includes(BRIDGE),
    violation: `const api = ${BRIDGE};`,
    clean: 'const view = useHelm();',
  },
  {
    name: 'offers an input or a textarea in the scope picker',
    violates: (text) => MARKUP_INPUT.test(text),
    violation: '<input type="text" />',
    clean: '<select><option>All projects</option></select>',
  },
  {
    name: 'binds displayPath to a control value',
    violates: (text) => DISPLAY_PATH_BOUND.test(text),
    violation: '<input value={scope.displayPath} />',
    clean: '<p>{scope.displayPath}</p>',
  },
  {
    name: 'holds a path separator in a string literal',
    violates: (text) => literals(text).some((literal) => SEPARATOR.test(literal)),
    violation: `const target = ${SAMPLE_PATH};`,
    clean: "const label = 'Choose a settings file';",
  },
  {
    name: 'passes something other than a bare identifier to selectScope',
    violates: (text) =>
      selectScopeArguments(text).some((argument) => !BARE_IDENTIFIER.test(argument)),
    violation: 'actions.selectScope(prefix + suffix);',
    clean: 'actions.selectScope(scopeId);',
  },
  {
    name: 'calls a path helper',
    violates: (text) => PATH_HELPERS.some((helper) => text.includes(helper)),
    violation: `const p = ${PATH_HELPERS[0] ?? ''}a, b);`,
    clean: 'const classes = parts.join(" ");',
  },
];

// ---------------------------------------------------------------------------
// Stylesheet rules (criterion 13)
// ---------------------------------------------------------------------------

const HEX = '#';
const FONT_FAMILY = 'font-' + 'family';

function declarationRule(property: string, sampleValue: string, cleanToken: string): TextRule {
  // The lookahead sits INSIDE the whitespace: `\s*(?!var\()` would match by
  // consuming nothing and finding a space. This is the bug that produced the
  // whole file.
  const pattern = new RegExp(`${property}:(?!\\s*var\\()`);
  return {
    name: `sets ${property} to something that is not a token`,
    violates: (text) => pattern.test(text),
    violation: `${property}: ${sampleValue};`,
    clean: `${property}: var(${cleanToken});`,
  };
}

export const STYLE_RULES: readonly TextRule[] = [
  {
    name: 'hardcodes a hex colour',
    violates: (text) => /#[0-9a-fA-F]{3,8}\b/.test(text),
    violation: `color: ${HEX}1a2b3c;`,
    clean: 'color: var(--oc-fg-primary);',
  },
  {
    // The names avoid writing `rgb` or `hsl` immediately followed by an open
    // paren: `__tests__/hygiene.test.ts` scans every non-test renderer file
    // for exactly that shape, and a rule that named itself in the forbidden
    // form would make this file a violation of the rule it states.
    name: 'hardcodes a colour through the rgb or rgba function',
    violates: (text) => /\brgba?\(/.test(text),
    violation: 'background: ' + 'rgb' + '(1, 2, 3);',
    clean: 'background: var(--oc-bg-panel);',
  },
  {
    name: 'hardcodes a colour through the hsl or hsla function',
    violates: (text) => /\bhsla?\(/.test(text),
    violation: 'background: ' + 'hsl' + '(1, 2%, 3%);',
    clean: 'background: var(--oc-bg-raised);',
  },
  {
    name: 'hardcodes a physical length',
    violates: (text) => /\b\d+(?:\.\d+)?(px|rem|em|pt|ch|vh|vw)\b/.test(text),
    violation: 'padding: 12' + 'px;',
    clean: 'padding: var(--oc-space-3);',
  },
  declarationRule(FONT_FAMILY, 'Helvetica, sans-serif', '--oc-font-ui'),
  declarationRule('font-weight', '700', '--oc-weight-bold'),
  declarationRule('letter-spacing', '0.04' + 'em', '--oc-tracking-wide'),
  {
    name: 'fights the cascade with !important',
    violates: (text) => text.includes('!important'),
    violation: 'color: var(--oc-danger) !important;',
    clean: 'color: var(--oc-danger);',
  },
  {
    name: 'removes the focus ring',
    violates: (text) => /outline:\s*(none|0)\b/.test(text),
    violation: 'outline: none;',
    clean: 'outline-offset: var(--oc-space-1);',
  },
];
