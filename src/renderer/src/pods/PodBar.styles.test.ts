/**
 * `PodBar.module.css`, read as TEXT.
 *
 * WHY TEXT AND NOT A RENDERED BOX. Under jsdom Vitest resolves
 * `*.module.css` to a blanked module — no stylesheet is ever applied, class
 * names do not survive, and `getComputedStyle` reports the UA defaults for
 * every element in `PodTab.test.tsx`. So NOTHING in a component suite can
 * observe a padding, a hover surface or a glyph box. These are
 * DECLARATION-LEVEL proofs: they assert what the stylesheet says, not what a
 * browser would paint from it.
 *
 * Default `node` environment on purpose, and the `#?raw` spelling is the one
 * that survives the `vitest:css-disable` plugin — see the note on `*.css#?raw`
 * in `../styles/css.d.ts` before touching it.
 *
 * Modelled on `shell/Panels.styles.test.ts`, down to the vacuity guard, which
 * is what stops the whole suite passing against an empty module.
 */

import { describe, expect, it } from 'vitest';

import podBarCss from './PodBar.module.css#?raw';

const strip = (source: string): string => source.replace(/\/\*[\s\S]*?\*\//g, '');

const css = strip(podBarCss);

/**
 * The declaration body of ONE rule, found by an exact selector-list entry.
 * Returns `null` when no rule carries that selector, so a missing rule fails
 * as a missing rule rather than as a confusing substring miss.
 */
function ruleFor(selector: string): string | null {
  for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = (match[1] as string).split(',').map((one) => one.trim());
    if (selectors.includes(selector)) return match[2] as string;
  }
  return null;
}

/** Every selector-list entry that shares one rule body, in source order. */
function selectorsSharingRuleWith(selector: string): string[] {
  for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = (match[1] as string).split(',').map((one) => one.trim());
    if (selectors.includes(selector)) return selectors;
  }
  return [];
}

describe('PodBar.module.css', () => {
  it('was read as text, not as a class-name proxy', () => {
    expect(typeof podBarCss).toBe('string');
    expect(css.length).toBeGreaterThan(0);
    expect(css).toContain('.tabItem');
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

  it('never fights the cascade and never removes the focus ring', () => {
    expect(css).not.toContain('!important');
    expect(css).not.toMatch(/outline:\s*(none|0)\b/);
  });
});

describe('the run/stop control is ONE element whose MODE selects the colour', () => {
  it('paints the run mode from the run token and the stop mode from the stop token', () => {
    expect(ruleFor('.runControl')).toMatch(/color:\s*var\(--oc-action-run\)/);
    expect(ruleFor(".runControl[data-verb='stop']")).toMatch(
      /color:\s*var\(--oc-action-stop\)/,
    );
  });

  it('gives each mode its own hover surface', () => {
    expect(ruleFor('.runControl:hover')).toMatch(/background:\s*var\(--oc-action-run-bg\)/);
    expect(ruleFor(".runControl[data-verb='stop']:hover")).toMatch(
      /background:\s*var\(--oc-action-stop-bg\)/,
    );
  });

  it('selects the colour by the MODE attribute, so no second button exists to carry it', () => {
    // `data-verb` is the attribute `PodTab.test.tsx` already asserts on the one
    // button. A colour keyed to it cannot be satisfied by splitting the control
    // into two elements, which is what would strand keyboard focus.
    expect(css).toContain("[data-verb='stop']");
  });

  it('leaves the delete control on the danger pair, unchanged', () => {
    expect(ruleFor('.deleteControl')).toMatch(/color:\s*var\(--oc-danger\)/);
    expect(ruleFor('.deleteControl:hover')).toMatch(/background:\s*var\(--oc-danger-bg\)/);
  });
});

describe('the play/pause glyph and the delete cross are the same size', () => {
  /*
   * They are TEXT GLYPHS, not SVG, so per-character metrics differ at equal
   * `font-size`. Equal size therefore needs an explicit square box as well as
   * an equal font-size, with the glyph centred inside it.
   *
   * ONE rule covers both, hooked onto `data-icon` — the attribute that already
   * carries the icon SHAPE and that `PodTab.test.tsx` already asserts is
   * present inside each control. So the stylesheet-to-DOM link this rule
   * depends on is covered by assertions that predate this task.
   */
  const RUN_GLYPH = '.runControl [data-icon]';
  const DELETE_GLYPH = '.deleteControl [data-icon]';

  it('sizes both glyphs from one shared rule', () => {
    expect(selectorsSharingRuleWith(RUN_GLYPH)).toContain(DELETE_GLYPH);
  });

  it('declares the same font-size token and the same explicit square box', () => {
    const body = ruleFor(RUN_GLYPH);
    expect(body).toMatch(/font-size:\s*var\(--oc-text-sm\)/);
    expect(body).toMatch(/width:\s*var\(--oc-space-3\)/);
    expect(body).toMatch(/height:\s*var\(--oc-space-3\)/);
    expect(body).toMatch(/line-height:\s*var\(--oc-space-3\)/);
  });

  it('centres the glyph in that box, so equal boxes mean equal optical size', () => {
    const body = ruleFor(RUN_GLYPH) ?? '';
    expect(body).toMatch(/align-items:\s*center/);
    expect(body).toMatch(/justify-content:\s*center/);
  });

  it('states the box in tokens, with no bare length', () => {
    expect(ruleFor(RUN_GLYPH)).not.toMatch(/\b\d+(?:\.\d+)?(px|rem|em|pt)\b/);
  });
});

describe('the trailing edge of the tab is inset equally in both states', () => {
  it('insets the tab ITEM, so the inset survives the delete control unmounting', () => {
    // The delete control is present only for a Pod with no process. An inset
    // declared on the ITEM is carried by both states, so the tab does not
    // change width perceptibly as the control mounts and unmounts.
    expect(ruleFor('.tabItem')).toMatch(/padding-inline-end:\s*var\(--oc-space-1\)/);
  });

  it('separates the delete control from the run/stop control', () => {
    expect(ruleFor('.deleteControl')).toMatch(/margin-inline-start:\s*var\(--oc-space-1\)/);
  });

  it('spends only spacing tokens on both, with no bare length', () => {
    for (const selector of ['.tabItem', '.deleteControl']) {
      expect(ruleFor(selector)).not.toMatch(/\b\d+(?:\.\d+)?(px|rem|em|pt)\b/);
    }
  });
});

describe('the WHOLE tab highlights on hover, not just the name', () => {
  it('declares the hover highlight on the tab item', () => {
    // `.tabItem` is the `<li>` enclosing the tab button, the run/stop control
    // and the delete control, so the gaps between them highlight too.
    expect(ruleFor('.tabItem:hover')).toMatch(/background:\s*var\(--oc-bg-hover\)/);
  });

  it('no longer carries the highlight on the tab button alone', () => {
    expect(ruleFor('.tab:hover')).toBeNull();
  });

  it('keeps a selected tab reading as selected while hovered', () => {
    expect(ruleFor('.tabItemActive:hover')).toMatch(/background:\s*var\(--oc-bg-selected\)/);
  });
});
