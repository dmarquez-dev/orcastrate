/**
 * `PodsChrome.module.css`, read as TEXT.
 *
 * Under jsdom Vitest resolves `*.module.css` to a blanked module, so no
 * component suite can observe a focus ring. These are DECLARATION-LEVEL
 * proofs: they assert what the stylesheet says, not what a browser paints.
 *
 * Default `node` environment on purpose, and the `#?raw` spelling is the one
 * that survives the `vitest:css-disable` plugin — see the note on `*.css#?raw`
 * in `../styles/css.d.ts` before touching it. Modelled on
 * `PodBar.styles.test.ts`, vacuity guard included.
 */

import { describe, expect, it } from 'vitest';

import podsChromeCss from './PodsChrome.module.css#?raw';

const strip = (source: string): string => source.replace(/\/\*[\s\S]*?\*\//g, '');

const css = strip(podsChromeCss);

/**
 * The declaration body of ONE rule, found by an exact selector-list entry.
 * Returns `null` when no rule carries that selector, so a missing rule fails
 * as a missing rule rather than as a substring miss elsewhere in the sheet.
 */
function ruleFor(selector: string): string | null {
  for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = (match[1] as string).split(',').map((one) => one.trim());
    if (selectors.includes(selector)) return match[2] as string;
  }
  return null;
}

describe('PodsChrome.module.css', () => {
  it('was read as text, not as a class-name proxy', () => {
    expect(typeof podsChromeCss).toBe('string');
    expect(css.length).toBeGreaterThan(0);
    expect(css).toContain('.chrome');
  });

  it('hardcodes no colour — tokens only', () => {
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(css).not.toMatch(/\brgba?\(/);
    expect(css).not.toMatch(/\bhsla?\(/);
  });

  it('references only tokens that the frozen TOKENS map names', async () => {
    const { TOKENS } = await import('../contracts/renderer-theme');
    const known = new Set<string>(Object.values(TOKENS));
    const used = [...css.matchAll(/var\((--oc-[\w-]+)/g)].map((m) => m[1] as string);
    expect(used.length).toBeGreaterThan(0);
    expect(used.filter((name) => !known.has(name))).toEqual([]);
  });

  it('declares no custom property of its own inside any rule body', () => {
    const bodies = [...css.matchAll(/[^{}]+\{([^{}]*)\}/g)].map((m) => m[1] as string);
    expect(bodies.length).toBeGreaterThan(0);
    expect(bodies.filter((body) => /(?:^|[;{\s])--[\w-]+\s*:/.test(body))).toEqual([]);
  });

  it('never fights the cascade and never removes the focus ring', () => {
    expect(css).not.toContain('!important');
    expect(css).not.toMatch(/outline:\s*(none|0)\b/);
  });
});

describe('the container shows an inset focus ring when keyboard-focused', () => {
  const FOCUSED = '.chrome:focus-visible';

  it('has a rule under the exact selector .chrome:focus-visible', () => {
    expect(ruleFor(FOCUSED)).not.toBeNull();
  });

  it('draws the ring at the thick border width in the focus-ring colour', () => {
    expect(ruleFor(FOCUSED)).toMatch(
      /outline:\s*var\(--oc-border-thick\)\s+solid\s+var\(--oc-focus-ring\)\s*(;|$)/,
    );
  });

  it('insets the ring by its own width, the PanelBar.module.css idiom', () => {
    expect(ruleFor(FOCUSED)).toMatch(
      /outline-offset:\s*calc\(\s*var\(--oc-border-thick\)\s*\*\s*-1\s*\)\s*(;|$)/,
    );
  });
});
