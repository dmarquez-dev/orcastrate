/**
 * The composer stylesheet, read as TEXT (criterion 13).
 *
 * Default `node` environment on purpose: under jsdom, Vitest resolves
 * `*.module.css` to a class-name proxy and the raw text never arrives. The
 * `#?raw` spelling is the one that survives the `vitest:css-disable` plugin —
 * see the note on `*.css#?raw` in `../styles/css.d.ts` before touching it.
 *
 * `expect(css.length).toBeGreaterThan(0)` is the vacuity guard: if the import
 * ever yields an empty string, this suite fails loudly instead of passing on
 * nothing.
 */

import { describe, expect, it } from 'vitest';

import composerCss from './Composer.module.css#?raw';

const css = composerCss.replace(/\/\*[\s\S]*?\*\//g, '');

describe('Composer.module.css', () => {
  it('was read as text, not as a class-name proxy', () => {
    expect(typeof composerCss).toBe('string');
    expect(css.length).toBeGreaterThan(0);
    expect(css).toContain('.composer');
  });

  it('hardcodes no colour, font stack, or spacing literal — tokens only', () => {
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(css).not.toMatch(/\brgba?\(/);
    expect(css).not.toMatch(/\bhsla?\(/);
    expect(css).not.toMatch(/\b\d+(?:\.\d+)?(px|rem|em|pt)\b/);
    expect(css).not.toMatch(/font-family:(?!\s*var\()/);
  });

  it('never fights the cascade and never removes the focus ring', () => {
    expect(css).not.toContain('!important');
    expect(css).not.toMatch(/outline:\s*(none|0)\b/);
  });

  it('references only tokens that the frozen TOKENS map names', async () => {
    const { TOKENS } = await import('../contracts/renderer-theme');
    const known = new Set<string>(Object.values(TOKENS));
    const used = [...css.matchAll(/var\((--[\w-]+)/g)].map((m) => m[1] as string);
    expect(used.length).toBeGreaterThan(0);
    expect(used.filter((name) => !known.has(name))).toEqual([]);
  });
});
