/**
 * `tokens.css` and the frozen `TOKENS` map must agree exactly.
 *
 * A component that uses a token `tokens.css` never defined renders with the
 * property unset — invisible in review, obvious to a user. A token defined in
 * CSS but absent from `TOKENS` is worse: it is a value no consumer is allowed
 * to reference, i.e. dead paint. Both directions are asserted here.
 *
 * The stylesheets are read as TEXT through Vite, not through `node:fs`: no file
 * under `src/renderer/**` may import a Node builtin (spec 3 security posture,
 * restated in `renderer-state.ts`), and a test file is no exception. The
 * `#?raw` spelling is deliberate and load-bearing — see the note on the
 * `*.css#?raw` declaration in `css.d.ts` before changing it to `?raw`.
 *
 * Default `node` environment — this parses text, it does not render.
 */

import { describe, expect, it } from 'vitest';

import { TOKENS } from '../contracts/renderer-theme';
import tokensCss from './tokens.css#?raw';
import globalCss from './global.css#?raw';

/** Strip `/* … *\/` comments so prose mentioning a token name is not counted. */
function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/**
 * The index of the `}` that closes the block whose `{` sits at `openIndex`,
 * found by MATCHING BRACES rather than by taking the first `}` after it. A
 * brace inside a quoted string (a `content`-style token value, say) is text,
 * not structure, so strings are skipped whole, backslash escapes included.
 * Returns -1 when the block never closes. Comments are the caller's to strip.
 */
function closingBraceIndex(text: string, openIndex: number): number {
  let depth = 0;
  for (let i = openIndex; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '"' || ch === "'") {
      for (i += 1; i < text.length && text[i] !== ch; i += 1) {
        if (text[i] === '\\') i += 1;
      }
      continue;
    }
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** The text between the `:root` block's braces, exclusive of both. */
function rootBody(text: string): string {
  const rootIndex = text.indexOf(':root');
  const openIndex = rootIndex < 0 ? -1 : text.indexOf('{', rootIndex);
  const closeIndex = openIndex < 0 ? -1 : closingBraceIndex(text, openIndex);
  if (closeIndex < 0) throw new Error('no closed :root block');
  return text.slice(openIndex + 1, closeIndex);
}

const source = stripComments(tokensCss);
const declaredNames = [...source.matchAll(/(^|[;{])\s*(--[\w-]+)\s*:/g)].map((m) => m[2] as string);
const expectedNames = Object.values(TOKENS) as string[];

describe('tokens.css', () => {
  it('defines every token named in the frozen TOKENS map, exactly once', () => {
    const counts = new Map<string, number>();
    for (const name of declaredNames) counts.set(name, (counts.get(name) ?? 0) + 1);

    const missing = expectedNames.filter((name) => (counts.get(name) ?? 0) === 0);
    const duplicated = expectedNames.filter((name) => (counts.get(name) ?? 0) > 1);

    expect(missing, 'tokens named in TOKENS but not defined in tokens.css').toEqual([]);
    expect(duplicated, 'tokens defined more than once in tokens.css').toEqual([]);
  });

  it('defines no custom property that TOKENS does not name', () => {
    const extra = declaredNames.filter((name) => !expectedNames.includes(name));
    expect(extra, 'custom properties in tokens.css with no TOKENS entry').toEqual([]);
  });

  it('declares them all inside a single :root block', () => {
    const rootBlocks = [...source.matchAll(/:root\s*\{/g)];
    expect(rootBlocks).toHaveLength(1);
    // Every declaration must sit inside that one block.
    const body = rootBody(source);
    for (const name of expectedNames) {
      expect(body.includes(`${name}:`), `${name} is not inside :root`).toBe(true);
    }
  });

  it('ends the :root body at its matching brace, not at a } inside a quoted token value', () => {
    const fixture = [
      ':root {',
      "  --fx-early: '}';",
      '  --fx-quoted: "a } b \\" }";',
      '  --fx-late: 1;',
      '}',
    ].join('\n');
    const body = rootBody(fixture);
    const missing = ['--fx-early', '--fx-quoted', '--fx-late'].filter(
      (name) => !body.includes(`${name}:`),
    );
    expect(missing, 'declarations that fell outside the :root body').toEqual([]);

    // The first-`}` reading this replaced, run on the same fixture: it stops
    // inside the first quoted value and loses every declaration after it.
    const openIndex = fixture.indexOf('{');
    const firstBrace = fixture.slice(openIndex, fixture.indexOf('}', openIndex));
    expect(firstBrace.includes('--fx-late:')).toBe(false);
  });

  it('never extends the :root body past its own close', () => {
    const fixture = [
      ':root {',
      '  --fx-inside: 1;',
      '}',
      '',
      '.after {',
      '  --fx-outside: 2;',
      '}',
    ].join('\n');
    const body = rootBody(fixture);
    expect(body.includes('--fx-inside:')).toBe(true);
    expect(body.includes('--fx-outside:'), '--fx-outside read as inside :root').toBe(false);
  });

  it('reports a :root block that never closes, rather than reading to end of file', () => {
    expect(() => rootBody(":root {\n  --fx-open: '}';\n")).toThrow(/no closed :root block/);
  });

  it('has no TOKENS entry that duplicates another token name', () => {
    expect(new Set(expectedNames).size).toBe(expectedNames.length);
  });
});

describe('global.css', () => {
  const global = stripComments(globalCss);

  it('sets the body background, UI font, and a visible focus ring from tokens', () => {
    expect(global).toMatch(/background:\s*var\(--oc-bg-app\)/);
    expect(global).toMatch(/font-family:\s*var\(--oc-font-ui\)/);
    expect(global).toMatch(/:focus-visible\s*\{[^}]*outline:[^;]*var\(--oc-focus-ring\)/);
  });

  it('never removes the focus outline', () => {
    expect(global).not.toMatch(/outline:\s*(none|0)\b/);
  });

  it('uses no !important — there is no cascade to fight (renderer-theme.ts rule 5)', () => {
    expect(global).not.toContain('!important');
    expect(source).not.toContain('!important');
  });

  it('hardcodes no color literal', () => {
    // `global.css` consumes tokens only; every literal colour lives in
    // `tokens.css`. A hex here would be invisible when the palette changes.
    expect(global).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it('carries no component-specific selector', () => {
    // Only the document, the mount root, form-control type inheritance, and
    // the focus ring. Anything class-based belongs in a CSS Module.
    expect(global).not.toMatch(/\.[a-zA-Z][\w-]*\s*[,{]/);
    expect(global).not.toMatch(/\[data-testid/);
  });
});
