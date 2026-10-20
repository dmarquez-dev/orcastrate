/**
 * The permission-card stylesheet, read as TEXT.
 *
 * Two criteria live here. Criterion 13: tokens only. Criterion 6: the cards
 * are INLINE — this is where "not a modal" is enforced against the paint,
 * which a DOM test cannot see, because Vitest does not apply CSS Modules to
 * the rendered tree. `position: fixed`, a z-index, or a backdrop would make
 * this suite fail.
 *
 * Default `node` environment: under jsdom the `#?raw` import resolves to a
 * class-name proxy instead of the file's text.
 */

import { describe, expect, it } from 'vitest';

import cardsCss from './PermissionCards.module.css#?raw';

const css = cardsCss.replace(/\/\*[\s\S]*?\*\//g, '');

/**
 * Every border/outline declaration's value, read with the term anchors the
 * frozen `keyword-hairline-sweep` contract declares: a width keyword counts
 * only as a WHOLE TERM, with `-` treated as an identifier character on both
 * sides. That is the whole difference between flagging a bare `thin` and
 * flagging `var(--oc-border-thick)`, a token whose NAME ends in a keyword.
 */
const borderValues = [
  ...css.matchAll(
    /(?:^|[;{])\s*(border(?:-top|-right|-bottom|-left|-width|-block|-inline)?|outline)\s*:([^;}]*)/g,
  ),
].map((m) => ({ property: m[1] as string, value: (m[2] as string).trim() }));

describe('PermissionCards.module.css', () => {
  it('was read as text, not as a class-name proxy', () => {
    expect(typeof cardsCss).toBe('string');
    expect(css.length).toBeGreaterThan(0);
    expect(css).toContain('.card');
  });

  it('paints nothing modal: no fixed position, no stacking, no backdrop', () => {
    expect(css).not.toMatch(/position:\s*fixed/);
    expect(css).not.toMatch(/position:\s*sticky/);
    expect(css).not.toMatch(/\bz-index\b/);
    expect(css).not.toMatch(/backdrop/i);
    expect(css).not.toMatch(/\binset:\s/);
    // `inset(50%)` in a clip-path is not the `inset` box property; there is no
    // visually hidden helper here anyway, so nothing should match at all.
    expect(css).not.toMatch(/\boverlay\b/i);
  });

  it('hardcodes no colour, font stack, or spacing literal — tokens only', () => {
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(css).not.toMatch(/\brgba?\(/);
    expect(css).not.toMatch(/\bhsla?\(/);
    expect(css).not.toMatch(/\b\d+(?:\.\d+)?(px|rem|em|pt)\b/);
    expect(css).not.toMatch(/font-family:(?!\s*var\()/);
  });

  it('names the hairline token in all three border widths, and no bare width keyword anywhere', () => {
    expect(css).toContain('border: var(--oc-border-hairline) solid var(--oc-status-waiting);');
    expect(css).toContain('border: var(--oc-border-hairline) solid var(--oc-border);');
    expect(css).toContain('border: var(--oc-border-hairline) solid var(--oc-border-strong);');
    expect([...css.matchAll(/var\(--oc-border-hairline\)/g)]).toHaveLength(3);

    // The instrument reaches declarations at all; a census that silently scans
    // nothing reports as a pass.
    expect(borderValues.length).toBeGreaterThan(0);
    const keyworded = borderValues.filter((d) =>
      /(?:^|[^-\w])(?:thin|medium|thick)(?:[^-\w]|$)/.test(d.value),
    );
    expect(keyworded).toEqual([]);
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
