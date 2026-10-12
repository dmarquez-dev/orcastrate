/**
 * The transcript stylesheet, read as TEXT — the same technique
 * `Composer.styles.test.ts` uses, and for the same reason: under jsdom, Vitest
 * resolves `*.module.css` to a class-name proxy and the raw text never arrives.
 * The `#?raw` spelling is the one that survives the `vitest:css-disable`
 * plugin; see the note on `*.css#?raw` in `../styles/css.d.ts` before touching
 * it.
 *
 * `expect(css.length).toBeGreaterThan(0)` is the vacuity guard: an import that
 * yields an empty string fails loudly here instead of passing every rule below
 * on nothing.
 */

import { describe, expect, it } from 'vitest';

import transcriptCss from './Transcript.module.css#?raw';

const css = transcriptCss.replace(/\/\*[\s\S]*?\*\//g, '');

/** The declaration block of a rule, by its exact selector. */
function ruleBody(selector: string): string {
  const start = css.indexOf(selector);
  expect(start, `${selector} not found`).toBeGreaterThanOrEqual(0);
  const open = css.indexOf('{', start);
  const close = css.indexOf('}', open);
  expect(open).toBeGreaterThan(start);
  expect(close).toBeGreaterThan(open);
  return css.slice(open + 1, close);
}

describe('Transcript.module.css', () => {
  it('was read as text, not as a class-name proxy', () => {
    expect(typeof transcriptCss).toBe('string');
    expect(css.length).toBeGreaterThan(0);
    expect(css).toContain('.event');
  });
});

/** A `margin-inline-end` set to anything but zero — a trailing inset. */
const NON_ZERO_TRAILING_MARGIN = /margin-inline-end:\s*(?!0\b)\S/;

describe("the user's turn is distinguished without colour and without alignment alone", () => {
  const body = () => ruleBody(".event[data-turn-role='user']");

  it('pushes the row to the trailing edge with a LOGICAL property', () => {
    expect(body()).toMatch(/margin-inline-start:\s*auto/);
    // `margin-left` would be wrong under RTL, which is the whole reason the
    // contract names the logical property.
    expect(body()).not.toMatch(/margin-left:/);
  });

  it('caps the measure, and the cap is the ONLY measure constraint', () => {
    expect(body()).toMatch(/max-width:\s*\S+/);
    // Stacking a cap AND an inset over-constrains the half-width follower pane.
    expect(body()).not.toMatch(/padding-inline-start:/);

    /*
     * `\s*(?!0)` WOULD NOT MEAN WHAT IT SAYS. `\s*` backtracks to zero width, so
     * the lookahead lands on the SPACE, which is not `0`, and the pattern fires
     * on `margin-inline-end: 0` as well as on a real inset. Forcing a non-space
     * character after the run removes the zero-width escape.
     */
    expect(NON_ZERO_TRAILING_MARGIN.test('margin-inline-end: 4px')).toBe(true);
    expect(NON_ZERO_TRAILING_MARGIN.test('margin-inline-end: 0')).toBe(false);
    expect(NON_ZERO_TRAILING_MARGIN.test('margin-inline-end:0;')).toBe(false);

    expect(body()).not.toMatch(NON_ZERO_TRAILING_MARGIN);
  });

  it('carries a background AND a border, both from tokens', () => {
    expect(body()).toMatch(/background:\s*var\(--oc-bg-raised\)/);
    /*
     * THE WIDTH IS A TOKEN TOO. This read `1px solid` until the token sweep;
     * a raw length here is what the repo-wide border-width census now flags,
     * so the assertion names the token rather than the literal.
     */
    expect(
      body(),
      ".event[data-turn-role='user'] must carry its border width as a token",
    ).toMatch(/border:\s*var\(--oc-border-hairline\) solid var\(--oc-border-strong\)/);
  });

  it('moves ONLY the user — no other role gets a position rule', () => {
    for (const role of ['assistant', 'system']) {
      expect(css).not.toContain(`data-turn-role='${role}'`);
      expect(css).not.toContain(`data-turn-role="${role}"`);
    }
  });
});

describe('the stylesheet introduces no raw colour, font size, or font stack', () => {
  it('references only tokens that the frozen TOKENS map names', async () => {
    const { TOKENS } = await import('../contracts/renderer-theme');
    const known = new Set<string>(Object.values(TOKENS));
    const used = [...css.matchAll(/var\((--[\w-]+)/g)].map((m) => m[1] as string);
    expect(used.length).toBeGreaterThan(0);
    expect(used.filter((name) => !known.has(name))).toEqual([]);
  });

  it('hardcodes no colour and sizes no text in px', () => {
    // The matchers can fire — a rule that cannot is worse than no rule.
    expect(/#[0-9a-fA-F]{3,8}\b/.test('color: ' + '#' + '1a2b3c')).toBe(true);
    expect(/font-size:\s*\d+px/.test('font-size: 13px')).toBe(true);

    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(css).not.toMatch(/\brgba?\(/);
    expect(css).not.toMatch(/\bhsla?\(/);
    expect(css).not.toMatch(/font-size:\s*\d/);
    expect(css).not.toMatch(/font-family:(?!\s*var\()/);
  });

  it('never fights the cascade and never removes the focus ring', () => {
    expect(css).not.toContain('!important');
    expect(css).not.toMatch(/outline:\s*(none|0)\b/);
  });
});
