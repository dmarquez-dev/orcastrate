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

/**
 * Every border-width-bearing declaration in this file, as `prop:value`.
 * `border-style` and `border-radius` are deliberately out of the property
 * list: neither declares a width, and `border-radius` is the highest-volume
 * near-miss in the repo-wide census this mirrors.
 *
 * NOT THE CENSUS PREDICATE, and not a substitute for it. The repo-wide census
 * also reads `outline`, which this omits because no `outline` declaration
 * exists in this file; the census owns that property list, this one is scoped
 * to the borders this stylesheet actually declares. A width keyword reaching
 * an `outline` here would be caught by the census, not by this file.
 */
const BORDER_WIDTH_DECL =
  /(?:^|[;{])\s*(border(?:-top|-right|-bottom|-left|-width|-block|-inline)?)\s*:([^;}]*)/g;

/**
 * A bare CSS width keyword, matched as a WHOLE TERM: `-` counts as an
 * identifier character on both sides, so `var(--oc-border-thick)` — a token
 * whose name ends in a width keyword — is not a hit. That boundary is the
 * whole of the difference between this predicate and a substring search.
 */
const BARE_WIDTH_KEYWORD = /(?:^|[^-\w])(?:thin|medium|thick)(?:[^-\w]|$)/;

/*
 * `as string` on both groups, which is this repository's idiom for a capture
 * `matchAll` types as `string | undefined` — see `borderValues` in
 * `../permissions/PermissionCards.styles.test.ts` for the identical two-group
 * case, and the `used` binding in the token test below for the single-group
 * form. Cited by binding name rather than by line, because a line number here
 * is a stored derivation that the next edit to either file falsifies silently.
 *
 * NEITHER GROUP CAN BE `undefined` HERE: both are unconditional in
 * `BORDER_WIDTH_DECL` — neither sits inside an optional group or on one side
 * of an alternation — so any match at all carries both. `matchAll` widens
 * every group to `string | undefined` regardless of the pattern, so the
 * guarantee has to be asserted rather than inferred. It is asserted, and not
 * defended with a `?? ''` fallback: the fallback would turn an `undefined`
 * capture into an empty string, which would silently become the declaration
 * `"border: "` and read as a non-offender, turning the impossible case — an
 * `undefined` capture, not an empty one — into a quiet pass in the one test
 * that is meant to catch untokenised widths.
 *
 * AN EMPTY CAPTURE IS A DIFFERENT CASE, AND IT IS REACHABLE: `[^;}]*` may
 * match nothing, so the second group can be the empty string even though it
 * can never be `undefined`. `.a{border:;}` captures `['border', '']` and
 * yields the declaration `"border: "`, which the bare-keyword test reads as a
 * non-offender. The assertion above rules out `undefined` only; it does not,
 * and is not meant to, reject an empty value.
 */
const borderWidthDeclarations = (): string[] =>
  [...css.matchAll(BORDER_WIDTH_DECL)].map(
    (m) => `${m[1] as string}: ${(m[2] as string).trim()}`,
  );

describe('Composer.module.css', () => {
  it('was read as text, not as a class-name proxy', () => {
    expect(typeof composerCss).toBe('string');
    expect(css.length).toBeGreaterThan(0);
    expect(css).toContain('.composer');
  });

  /*
   * Named for the forms it matches and nothing more: a hex colour, `rgb(`/
   * `rgba(`, `hsl(`/`hsla(`, a number carrying `px`/`rem`/`em`/`pt`, and a
   * `font-family` whose value is not a `var()`. It used to end "— tokens
   * only", which is a claim about EVERY value in the file, whereas this test
   * matches those forms and its sibling below only checks that the `var()`
   * refs it finds are known token names. Nothing asserted that a value IS a
   * token, so a bare CSS width keyword satisfied the old name while being
   * exactly what it suggested could not be here. The two keyword tests at the
   * foot of this suite are what actually covers that.
   */
  it('hardcodes no colour, font stack, or length literal', () => {
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

  /*
   * The three widths below were `thin` until this session. `thin` is not a
   * standards-fixed length: CSS fixes only the `thin < medium < thick`
   * ordering and leaves the three widths UA-defined, so what the conversion
   * rests on is an engine measurement on one display — the converted border
   * measuring equal to a declared `1px` reference in the same window — and
   * not a guarantee the specification gives.
   *
   * `border: 0` is why the name says NON-ZERO. A zero width needs no token —
   * there is no hairline to be consistent about — and `BORDER_WIDTH_DECL`
   * extracts it along with the rest, so the expected list below holds one
   * literal. The name has to exclude it or it asserts a universal this very
   * array refutes.
   *
   * THE EQUALITY IS A DELIBERATE PIN, not an incidental shape. It is wider
   * than the name: it fails if any border declaration in this file is added,
   * removed or reordered, even when every value in it is a correct token. If
   * you are here because of such a failure, UPDATE THE LIST — do not relax it
   * to a subset or swap it for a `some`/`filter` check. The sibling test
   * below is the token invariant; this one is the population, and the two
   * together are what the three keyword sites of 2026-10-16 walked past.
   */
  it('states every non-zero border width in this file through a token', () => {
    const declared = borderWidthDeclarations();
    expect(declared).toEqual([
      'border-top: var(--oc-border-hairline) solid var(--oc-border)',
      'border: 0',
      'border: var(--oc-border-hairline) solid var(--oc-border)',
      'border: var(--oc-border-hairline) solid var(--oc-border-strong)',
      'border: var(--oc-border-hairline) solid var(--oc-border-strong)',
    ]);
  });

  it('uses no bare thin, medium or thick as a border-width term', () => {
    const declared = borderWidthDeclarations();
    expect(declared.length).toBeGreaterThan(0);
    expect(declared.filter((decl) => BARE_WIDTH_KEYWORD.test(decl))).toEqual([]);
  });
});
