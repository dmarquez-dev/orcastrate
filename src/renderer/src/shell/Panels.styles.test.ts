/**
 * The two panel-region stylesheets, read as TEXT (criterion 9).
 *
 * Default `node` environment on purpose: under jsdom, Vitest resolves
 * `*.module.css` to a class-name proxy and the raw text never arrives. The
 * `#?raw` spelling is the one that survives the `vitest:css-disable` plugin —
 * see the note on `*.css#?raw` in `../styles/css.d.ts` before touching it.
 *
 * Modelled on `composer/Composer.styles.test.ts`, which does the same job for
 * the composer, down to the vacuity guard.
 *
 * Only the two files this task ADDED are covered, and the sibling `shell/`
 * stylesheets are covered elsewhere rather than not at all:
 * `__tests__/hygiene.test.ts` holds every `*.module.css` under
 * `beachcomber/`, `helm/` and `shell/` to tokenised border widths,
 * letter-spacings and font weights, with nothing tolerated.
 */

import { describe, expect, it } from 'vitest';

import panelBarCss from './PanelBar.module.css#?raw';
import panelRegionCss from './PanelRegion.module.css#?raw';

const strip = (source: string): string => source.replace(/\/\*[\s\S]*?\*\//g, '');

const SHEETS: ReadonlyArray<readonly [string, string, string]> = [
  ['PanelBar.module.css', panelBarCss, '.panelBar'],
  ['PanelRegion.module.css', panelRegionCss, '.region'],
];

describe.each(SHEETS)('%s', (_name, raw, anchor) => {
  const css = strip(raw);

  it('was read as text, not as a class-name proxy', () => {
    expect(typeof raw).toBe('string');
    expect(css.length).toBeGreaterThan(0);
    expect(css).toContain(anchor);
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

describe('panel geometry comes from the two layout tokens', () => {
  it('sizes the strip with --oc-panel-bar-height', () => {
    expect(strip(panelBarCss)).toMatch(/height:\s*var\(--oc-panel-bar-height\)/);
  });

  it('caps the panel measure with --oc-panel-max-width', () => {
    expect(strip(panelRegionCss)).toMatch(/max-width:\s*var\(--oc-panel-max-width\)/);
  });
});

/**
 * Every innermost rule in a comment-stripped sheet, as its selector-list
 * entries and its declarations. Innermost-braces walk, the same one
 * `pods/PodBar.styles.test.ts` uses: a rule inside an `@media` block is read,
 * the `@media` wrapper itself is not.
 */
interface Rule {
  readonly selectors: readonly string[];
  readonly declarations: ReadonlyMap<string, string>;
}

function rulesOf(css: string): Rule[] {
  const found: Rule[] = [];
  for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = (match[1] as string)
      .split(',')
      .map((one) => one.trim().replace(/\s+/g, ' '));
    const declarations = new Map<string, string>();
    for (const declaration of (match[2] as string).split(';')) {
      const colon = declaration.indexOf(':');
      if (colon < 0) continue;
      const property = declaration.slice(0, colon).trim().toLowerCase();
      declarations.set(property, declaration.slice(colon + 1).trim());
    }
    found.push({ selectors, declarations });
  }
  return found;
}

/** The `background` of the rule carrying exactly `selector`, or undefined. */
function backgroundOf(rules: readonly Rule[], selector: string): string | undefined {
  return rules.find((rule) => rule.selectors.includes(selector))?.declarations.get('background');
}

/**
 * `.button` qualified by `aria-current` EQUAL to `true`, in any quoting. Not
 * the bare presence form, and not any other attribute operator: the presence
 * form is the trap, because `PanelBar.tsx` renders `aria-current={open === key}`
 * and React writes `"false"` on every CLOSED button, so a presence selector
 * paints them all open.
 */
const OPEN_BUTTON = /^\.button\[\s*aria-current\s*=\s*(?:'true'|"true"|true)\s*\]$/;

/** Any `.button` selector keyed to `aria-current`'s mere presence. */
const PRESENCE_ONLY = /^\.button\[\s*aria-current\s*\]/;

describe('the open panel button is painted from aria-current, and only when it is true', () => {
  const rules = rulesOf(strip(panelBarCss));
  const openRules = rules.filter((rule) => rule.selectors.some((one) => OPEN_BUTTON.test(one)));

  it('the selector matcher takes the equals-true forms and rejects presence, class and other-value forms', () => {
    expect(OPEN_BUTTON.test(".button[aria-current='true']")).toBe(true);
    expect(OPEN_BUTTON.test('.button[aria-current="true"]')).toBe(true);
    expect(OPEN_BUTTON.test('.button[aria-current=true]')).toBe(true);

    expect(OPEN_BUTTON.test('.button[aria-current]')).toBe(false);
    expect(OPEN_BUTTON.test('.buttonOpen')).toBe(false);
    expect(OPEN_BUTTON.test('.button.open')).toBe(false);
    expect(OPEN_BUTTON.test(".button[aria-current='false']")).toBe(false);
    expect(OPEN_BUTTON.test(".button[aria-current~='true']")).toBe(false);
    expect(OPEN_BUTTON.test(".button[aria-current='true']:hover")).toBe(false);

    expect(PRESENCE_ONLY.test('.button[aria-current]')).toBe(true);
    expect(PRESENCE_ONLY.test(".button[aria-current='true']")).toBe(false);
  });

  it("declares a rule on .button[aria-current='true']", () => {
    expect(
      openRules.length,
      'no rule selects .button by aria-current equal to true',
    ).toBeGreaterThan(0);
  });

  it('keys no .button rule to the presence of aria-current, which closed buttons carry as "false"', () => {
    const presence = rules
      .flatMap((rule) => rule.selectors)
      .filter((one) => PRESENCE_ONLY.test(one));
    expect(presence).toEqual([]);
  });

  it('gives the open button a background that differs from both the resting and the hover button', () => {
    const open = openRules[0]?.declarations.get('background');
    const resting = backgroundOf(rules, '.button');
    const hover = backgroundOf(rules, '.button:hover');

    // Non-vacuous: all three surfaces are declared, so the comparison below is
    // between three real values and never between two absences.
    expect(open, 'the open rule declares no background').toBeDefined();
    expect(resting, '.button declares no background').toBeDefined();
    expect(hover, '.button:hover declares no background').toBeDefined();

    expect(open).not.toBe(resting);
    expect(open).not.toBe(hover);
  });
});
