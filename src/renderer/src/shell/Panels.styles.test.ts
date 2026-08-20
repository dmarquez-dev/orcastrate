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
 * Only the files this task ADDED are covered. `WorkspaceLayout.module.css`
 * predates the border-width token and carries a bare `1px` from sub-session 1;
 * that is the known token-set gap `__tests__/hygiene.test.ts` documents, and
 * rewriting a sibling task's stylesheet to satisfy a rule this task invented
 * would be churn, not hygiene.
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
