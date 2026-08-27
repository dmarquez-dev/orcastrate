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

/**
 * Every selector whose rule body declares `property`, deduplicated.
 *
 * The innermost-braces walk `ruleFor` uses reaches INSIDE an `@media` block —
 * the outer `@media (...) { ... }` never matches, because its body contains
 * braces, so the nested rule is what the scan sees. That is exactly what is
 * wanted here: a selector that animates only inside a media query still counts
 * as a selector that animates.
 */
function selectorsDeclaring(property: RegExp): string[] {
  const found = new Set<string>();
  for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!property.test(match[2] as string)) continue;
    for (const one of (match[1] as string).split(',')) found.add(one.trim());
  }
  return [...found];
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

/**
 * The collapsed status dot's motion, pinned by `contracts/status-dot-motion.ts`.
 *
 * WHY THE KEYFRAMES LIVE IN THIS FILE and not in `styles/global.css`: Vite
 * hashes an animation NAME used inside a `*.module.css` even when no local
 * `@keyframes` of that name exists, so a module referencing a global keyframe
 * points at a name that does not exist and the animation SILENTLY NEVER RUNS.
 * The contract therefore mandates per-module keyframes, and T3's drift guard
 * stands in for the shared file that cannot exist.
 *
 * These are DECLARATION-LEVEL proofs, and they are all this suite can be. Under
 * Vitest `*.module.css` resolves to a blanked module and jsdom applies no
 * stylesheet, so no assertion here — and none in `PodTab.test.tsx` — can
 * observe motion. That the emitted animation name RESOLVES is proved by the
 * build, against `out/renderer/assets/`, which is T3's criterion.
 */
describe('the status dot carries the motion itself', () => {
  const RUNNING_DOT = ".statusDot[data-status='running']";

  it('declares the pulse keyframes in THIS module, under the contract name', () => {
    // A `@keyframes` in any other file would emit a hashed name this module
    // cannot reach.
    expect(css).toMatch(/@keyframes\s+ocStatusPulse\b/);
  });

  it('pins the keyframe body to the one the retired indicator used', () => {
    const block = /@keyframes\s+ocStatusPulse\s*\{([\s\S]*?\n\})\s*\n/.exec(css);
    expect(block).not.toBeNull();
    const normalise = (text: string): string => text.replace(/\s+/g, ' ').trim();
    expect(normalise(block?.[1] as string)).toBe(
      normalise(`
        0%,
        100% {
          opacity: 0.35;
        }

        50% {
          opacity: 1;
        }
      }`),
    );
  });

  it('applies the animation to the running dot, at the pinned duration and easing', () => {
    expect(ruleFor(RUNNING_DOT)).toMatch(
      /animation:\s*ocStatusPulse\s+1\.4s\s+ease-in-out\s+infinite/,
    );
  });

  it('animates that selector and no other, so nothing else moves', () => {
    // The reduced-motion copy of the same selector is the only other hit, and
    // `selectorsDeclaring` deduplicates it away.
    expect(selectorsDeclaring(/animation:/)).toEqual([RUNNING_DOT]);
  });

  it('leaves the base dot rule unanimated, so a non-running dot has none to cancel', () => {
    expect(ruleFor('.statusDot')).not.toMatch(/animation/);
  });
});

/**
 * RE-HOMED from `activity/WorkingIndicator.styles.test.ts`, per
 * `contracts/activity-module-retirement.ts` section 4. A stated system
 * preference wins over the MOTION but never over the SIGNAL: a dot that
 * vanished here would take the affordance away from exactly the users most
 * likely to need it.
 */
describe('reduced motion stops the pulse and keeps the dot', () => {
  const RUNNING_DOT = ".statusDot[data-status='running']";
  const at = css.search(/@media\s*\(\s*prefers-reduced-motion:\s*reduce\s*\)/);
  const tail = at >= 0 ? css.slice(at) : '';

  it('carries a prefers-reduced-motion: reduce query', () => {
    expect(at).toBeGreaterThanOrEqual(0);
  });

  it('sets animation: none inside that query, on the same selector that animates', () => {
    expect(tail).toMatch(/animation:\s*none/);
    // ...and the `animation: none` belongs to the query, not to some later rule
    // that happens to sit below it.
    const nextQuery = tail.indexOf('@media', 1);
    expect(tail.indexOf('animation: none')).toBeLessThan(
      nextQuery === -1 ? tail.length : nextQuery,
    );
    expect(tail).toContain(RUNNING_DOT);
  });

  it('hides nothing: the dot keeps its size, its shape and its hue', () => {
    expect(tail).not.toMatch(/display:\s*none/);
    expect(tail).not.toMatch(/visibility:\s*hidden/);
    expect(tail).not.toMatch(/opacity:\s*0\s*;/);
  });
});

/**
 * The five dot SHAPES. Colour is never the only carrier, so each status is told
 * apart in greyscale as well as in hue — and the hue itself always arrives as
 * `--pod-status-color`, set inline from `statusToken(status)`, never as a token
 * named in this stylesheet.
 */
describe('each status has its own dot shape', () => {
  it('sharpens idle into a hollow ring, thick enough to read at 8px', () => {
    const body = ruleFor(".statusDot[data-status='idle']");
    expect(body).toMatch(/background:\s*transparent/);
    expect(body).toMatch(/border-width:\s*var\(--oc-border-thick\)/);
  });

  it('takes the idle hue from the inline custom property, naming no status token', () => {
    // `statusToken('idle')` already resolves to `--oc-status-idle`. Naming it
    // here would be a second source of truth for the same hue.
    expect(ruleFor(".statusDot[data-status='idle']")).not.toMatch(/--oc-status-/);
    expect(ruleFor('.statusDot')).toMatch(/background:\s*var\(--pod-status-color\)/);
  });

  it('leaves the waiting halo as it is', () => {
    expect(ruleFor(".statusDot[data-status='waiting']")).toMatch(
      /box-shadow:\s*0 0 0 2px var\(--oc-bg-panel\), 0 0 0 3px var\(--pod-status-color\)/,
    );
  });

  it('leaves the beached square as it is', () => {
    expect(ruleFor(".statusDot[data-status='beached']")).toMatch(/border-radius:\s*0/);
  });

  it('leaves the closed flat bar as it is', () => {
    const body = ruleFor(".statusDot[data-status='closed']");
    expect(body).toMatch(/height:\s*var\(--oc-border-thick\)/);
    expect(body).toMatch(/align-self:\s*center/);
    expect(body).toMatch(/border-radius:\s*0/);
  });
});
