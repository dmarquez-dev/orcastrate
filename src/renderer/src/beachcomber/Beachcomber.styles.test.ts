/**
 * Both Beachcomber stylesheets, read as TEXT (AC12).
 *
 * Default `node` environment on purpose: under jsdom, Vitest resolves
 * `*.module.css` to a class-name proxy and the raw text never arrives. The
 * `#?raw` spelling is the one that survives the `vitest:css-disable` plugin —
 * see the note on `*.css#?raw` in `../styles/css.d.ts` before touching it.
 *
 * This is the criterion-12 rule for this directory, and it is STRICTER than
 * `__tests__/hygiene.test.ts` is today: it forbids every bare length, not just
 * a px font-size, because this session added the border-width, tracking and
 * weight tokens that made the wider rule enforceable.
 */

import { describe, expect, it } from 'vitest';

import panelCss from './Beachcomber.module.css#?raw';
import dialogCss from './BeachcomberPreviewDialog.module.css#?raw';

const SHEETS: readonly [string, string][] = [
  ['Beachcomber.module.css', panelCss],
  ['BeachcomberPreviewDialog.module.css', dialogCss],
];

function strip(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

describe.each(SHEETS)('%s', (_name, raw) => {
  const css = strip(raw);

  it('was read as text, not as a class-name proxy', () => {
    expect(typeof raw).toBe('string');
    expect(css.length).toBeGreaterThan(0);
    expect(css).toMatch(/\.\w+\s*\{/);
  });

  it('hardcodes no colour, no font stack, and no length literal — tokens only', () => {
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(css).not.toMatch(/\brgba?\(/);
    expect(css).not.toMatch(/\bhsla?\(/);
    expect(css).not.toMatch(/\b\d+(?:\.\d+)?(px|rem|em|pt)\b/);
    expect(css).not.toMatch(/font-family:(?!\s*var\()/);
  });

  it('hardcodes no border width, letter-spacing or font weight', () => {
    // The three gaps sub-session 2 hit in six directories. All nine tokens
    // exist now, so a literal here is a deviation rather than a gap.
    expect(css).not.toMatch(/border(-\w+)?:(?!\s*var\()[^;]*\b\d/);
    expect(css).not.toMatch(/letter-spacing:(?!\s*var\()/);
    expect(css).not.toMatch(/font-weight:(?!\s*var\()/);
  });

  it('never fights the cascade and never removes the focus ring', () => {
    expect(css).not.toContain('!important');
    expect(css).not.toMatch(/outline:\s*(none|0)\b/);
  });

  it('references only tokens that the frozen TOKENS map names', async () => {
    const { TOKENS } = await import('../contracts/renderer-theme');
    const known = new Set<string>(Object.values(TOKENS));
    const used = [...css.matchAll(/var\((--[\w-]+)/g)].map((match) => match[1] as string);
    expect(used.length).toBeGreaterThan(0);
    expect(used.filter((name) => !known.has(name))).toEqual([]);
  });
});

describe('the matchers can fire', () => {
  it('catches a synthetic violation of each rule', () => {
    // A rule that cannot fire is worse than no rule.
    expect(/#[0-9a-fA-F]{3,8}\b/.test('color: ' + '#' + 'a1b2c3;')).toBe(true);
    expect(/\b\d+(?:\.\d+)?(px|rem|em|pt)\b/.test('padding: 4' + 'px;')).toBe(true);
    expect(/border(-\w+)?:(?!\s*var\()[^;]*\b\d/.test('border: 1' + 'px solid red;')).toBe(true);
    expect(/border(-\w+)?:(?!\s*var\()[^;]*\b\d/.test('border-radius: var(--oc-radius-sm);')).toBe(
      false,
    );
    expect(/letter-spacing:(?!\s*var\()/.test('letter-spacing: 0.04em;')).toBe(true);
    expect(/font-weight:(?!\s*var\()/.test('font-weight: 700;')).toBe(true);
  });
});
