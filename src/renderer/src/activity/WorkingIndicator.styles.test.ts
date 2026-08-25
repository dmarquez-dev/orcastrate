/**
 * `WorkingIndicator.module.css`, read as TEXT.
 *
 * The `#?raw` pattern of `shell/Panels.styles.test.ts` and
 * `composer/Composer.styles.test.ts`, down to the vacuity guard: under jsdom
 * Vitest resolves `*.module.css` to a class-name proxy and the raw text never
 * arrives, and the `#?raw` fragment is the spelling that survives the
 * `vitest:css-disable` plugin. See the note on `*.css#?raw` in
 * `../styles/css.d.ts` before touching it. Default `node` environment on
 * purpose.
 *
 * This sheet uses ONLY tokens that exist today — `--oc-status-running`, the
 * spacing scale, `--oc-radius-sm` — and none of the five the renderer-theme
 * amendment adds, which is what lets this task run before that one.
 */

import { describe, expect, it } from 'vitest';

import raw from './WorkingIndicator.module.css#?raw';

const css = raw.replace(/\/\*[\s\S]*?\*\//g, '');

describe('WorkingIndicator.module.css', () => {
  it('was read as text, not as a class-name proxy', () => {
    expect(typeof raw).toBe('string');
    expect(css.length).toBeGreaterThan(0);
    expect(css).toContain('.indicator');
  });

  it('hardcodes no colour and no bare length — tokens only', () => {
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(css).not.toMatch(/\brgba?\(/);
    expect(css).not.toMatch(/\bhsla?\(/);
    expect(css).not.toMatch(/\b\d+(?:\.\d+)?(px|rem|em|pt)\b/);
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

  it('uses no token the renderer-theme amendment has yet to add', () => {
    const used = new Set([...css.matchAll(/var\((--[\w-]+)/g)].map((m) => m[1] as string));
    for (const pending of ['--oc-status-closed', '--oc-motion-pulse']) {
      expect(used.has(pending)).toBe(false);
    }
  });
});

/**
 * The animation itself. CSS drives every frame — the contract forbids JS from
 * driving any — and `prefers-reduced-motion` turns the motion off without
 * turning the SIGNAL off. An indicator that vanishes under reduced motion takes
 * the affordance away from the users most likely to need it.
 */
describe('the animation is CSS, and reduced motion keeps the mark', () => {
  it('declares a @keyframes rule and applies it by class', () => {
    const declared = [...css.matchAll(/@keyframes\s+([\w-]+)/g)].map((m) => m[1] as string);
    expect(declared.length).toBeGreaterThan(0);
    const name = declared[0] as string;
    expect(css).toMatch(new RegExp(`\\.indicator[^}]*animation:[^;]*\\b${name}\\b`));
  });

  it('disables the animation under prefers-reduced-motion: reduce', () => {
    const at = css.search(/@media\s*\(\s*prefers-reduced-motion:\s*reduce\s*\)/);
    expect(at).toBeGreaterThanOrEqual(0);
    const tail = css.slice(at);
    expect(tail).toMatch(/animation:\s*none/);
    // ...and the `animation: none` belongs to the query, not to some later rule
    // that happens to sit below it.
    expect(tail.indexOf('animation: none')).toBeLessThan(tail.indexOf('@media', 1) === -1
      ? tail.length
      : tail.indexOf('@media', 1));
  });

  it('leaves a still-visible mark in BOTH branches', () => {
    // Neither the animated branch nor the reduced-motion branch may hide it.
    expect(css).not.toMatch(/display:\s*none/);
    expect(css).not.toMatch(/visibility:\s*hidden/);
    expect(css).not.toMatch(/opacity:\s*0\s*;/);
    // The indicator carries a background colour, so it is a mark even with the
    // animation switched off.
    expect(css).toMatch(/\.indicator[^}]*background:\s*var\(--oc-status-running\)/);
  });
});
