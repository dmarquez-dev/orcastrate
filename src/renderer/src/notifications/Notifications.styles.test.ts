/**
 * `Notifications.module.css`, read as TEXT.
 *
 * Under jsdom Vitest resolves `*.module.css` to a blanked module, so these are
 * DECLARATION-LEVEL proofs: they assert what the stylesheet says, not what a
 * browser paints. Default `node` environment and the `#?raw` spelling on
 * purpose — see the note on `*.css#?raw` in `../styles/css.d.ts`. Modelled on
 * `../pods/PodsChrome.styles.test.ts`.
 */

import { describe, expect, it } from 'vitest';

import { TOKENS } from '../contracts/renderer-theme';
import notificationsCss from './Notifications.module.css#?raw';

const strip = (source: string): string => source.replace(/\/\*[\s\S]*?\*\//g, '');

const css = strip(notificationsCss);

/** The declaration body of the one rule whose selector list holds `selector`, or `null`. */
function ruleFor(selector: string): string | null {
  for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = (match[1] ?? '').split(',').map((one) => one.trim());
    if (selectors.includes(selector)) return match[2] ?? '';
  }
  return null;
}

/** Every `--oc-*` name the text references through `var(`. */
function tokensUsed(text: string): string[] {
  return [...text.matchAll(/var\(\s*(--[\w-]+)/g)].map((m) => m[1] ?? '');
}

const KNOWN = new Set<string>(Object.values(TOKENS));

describe('Notifications.module.css', () => {
  it('was read as text, not as a class-name proxy', () => {
    expect(typeof notificationsCss).toBe('string');
    expect(css).toContain('.viewport');
    expect(css).toContain('.item');
  });

  it('references only tokens that the frozen TOKENS map names (C21)', () => {
    const used = tokensUsed(css);
    expect(used.length).toBeGreaterThan(0);
    expect(used.filter((name) => !KNOWN.has(name))).toEqual([]);
  });

  it('the token check fails on a name TOKENS does not hold, and passes a real one', () => {
    const offenders = (text: string): string[] =>
      tokensUsed(text).filter((name) => !KNOWN.has(name));
    expect(offenders('.a { color: var(--oc-fg-primry); }')).toEqual(['--oc-fg-primry']);
    expect(offenders('.a { color: var(--oc-fg-primary); }')).toEqual([]);
  });

  it('hardcodes no colour — tokens only', () => {
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(css).not.toMatch(/\brgba?\(/);
    expect(css).not.toMatch(/\bhsla?\(/);
  });

  it('never fights the cascade and never removes the focus ring', () => {
    expect(css).not.toContain('!important');
    expect(css).not.toMatch(/outline:\s*(none|0)\b/);
  });
});

describe('the viewport sits at one corner and is not a full-window overlay', () => {
  it('is fixed, pinned bottom and right, and pins no inset shorthand', () => {
    const body = ruleFor('.viewport');
    expect(body).not.toBeNull();
    expect(body).toMatch(/(^|[;\s])position:\s*fixed\s*;/);
    expect(body).toMatch(/(^|[;\s])right:\s*var\(--oc-space-4\)\s*;/);
    expect(body).toMatch(/(^|[;\s])bottom:\s*var\(--oc-space-4\)\s*;/);
    expect(body).not.toMatch(/(^|[;\s])(inset|top|left)\s*:/);
    expect(body).not.toMatch(/(^|[;\s])background(-color)?\s*:/);
  });

  it('stacks above the dialog scrims (z-index 1) and Helm’s confirm scrim (z-index 2)', () => {
    expect(ruleFor('.viewport')).toMatch(/(^|[;\s])z-index:\s*3\s*;/);
  });
});

describe('focus rings', () => {
  for (const selector of ['.viewport:focus-visible', '.dismiss:focus-visible']) {
    it(`draws a thick focus-ring outline under ${selector}`, () => {
      expect(ruleFor(selector)).toMatch(
        /outline:\s*var\(--oc-border-thick\)\s+solid\s+var\(--oc-focus-ring\)\s*(;|$)/,
      );
    });
  }
});
