/**
 * The status dot's pulse, asserted across BOTH stylesheets that declare it.
 *
 * WHY THIS FILE EXISTS. `contracts/status-dot-motion.ts` mandates PER-MODULE
 * `@keyframes` rather than one shared block, and that is settled by
 * measurement, not preference: Vite hashes an animation name used inside a
 * `*.module.css` even when no local `@keyframes` of that name exists, so a
 * module referencing a keyframe declared in `global.css` points at a name that
 * does not exist and the animation SILENTLY NEVER RUNS. jsdom applies no
 * stylesheet, so no suite in this repository can observe that failure.
 *
 * The cost of the mandated shape is exactly one duplication, and duplication
 * with no guard drifts. This is that guard. It belongs to neither surface — it
 * lives here because `pods/` and `lanes/` are each owned exclusively by the
 * task that styles them, and a test that reads both belongs above both.
 *
 * WHAT IT CANNOT PROVE, so nobody mistakes a green run for the whole story:
 * that the emitted animation NAME resolves. That is visible only in a built
 * bundle, and the proof is the build plus a read of `out/renderer/assets/`,
 * recorded against `status-dot-motion.ts` section 6. This file proves the two
 * DECLARATIONS still agree; the build proves each one resolves.
 *
 * Default `node` environment on purpose, and the `#?raw` spelling is the one
 * that survives the `vitest:css-disable` plugin — see the note on `*.css#?raw`
 * in `./css.d.ts` before "tidying" it to `?raw`, which blanks both reads.
 *
 * THE EXPECTATIONS BELOW ARE RE-TYPED, NOT IMPORTED — not from either
 * stylesheet, and not from the session contract. This is the reason
 * `PodTab.test.tsx` already states for duplicating `STATUS_WORD`: a test that
 * derived its expectation from the thing under test would pass while both
 * files drifted together, which is precisely the failure this file exists to
 * catch. Each sheet is compared to the literal, never to the other alone.
 */

import { describe, expect, it } from 'vitest';

import railCss from '../lanes/LaneRail.module.css#?raw';
import podBarCss from '../pods/PodBar.module.css#?raw';

const strip = (source: string): string => source.replace(/\/\*[\s\S]*?\*\//g, '');

/** Collapse every run of whitespace to one space and trim, per contract. */
const normalise = (text: string): string => text.replace(/\s+/g, ' ').trim();

/** The keyframe name both modules declare under their own hash. */
const KEYFRAME_NAME = 'ocStatusPulse';

/**
 * The pinned keyframe body, RE-TYPED from the contract rather than imported.
 * Opacity only: no transform, no scale, no colour, so the rule can never
 * override a consumer's hue or shape.
 */
const EXPECTED_KEYFRAME_BODY = normalise(`
  0%,
  100% {
    opacity: 0.35;
  }

  50% {
    opacity: 1;
  }
`);

/** The pinned duration, easing and iteration count, likewise re-typed. */
const EXPECTED_ANIMATION_TAIL = '1.4s ease-in-out infinite';

/** The two sheets under guard, each with a selector proving it was read. */
const SHEETS = [
  { name: 'pods/PodBar.module.css', css: strip(podBarCss), raw: podBarCss, marker: '.statusDot' },
  { name: 'lanes/LaneRail.module.css', css: strip(railCss), raw: railCss, marker: '.dot' },
] as const;

/**
 * The body of a block whose contents may themselves contain one level of
 * braces — which both an `@keyframes` and an `@media` block do.
 */
function blockBody(css: string, header: RegExp, sheet: string): string {
  const re = new RegExp(`${header.source}\\s*\\{((?:[^{}]*\\{[^{}]*\\})*[^{}]*)\\}`);
  const match = re.exec(css);
  if (match === null) throw new Error(`no \`${header.source}\` block in ${sheet}`);
  return match[1] as string;
}

describe('the status dot pulse, duplicated across two CSS modules by contract', () => {
  it('read both stylesheets as text rather than as class-name proxies', () => {
    for (const sheet of SHEETS) {
      expect(typeof sheet.raw, sheet.name).toBe('string');
      expect(sheet.css.length, sheet.name).toBeGreaterThan(0);
      expect(sheet.css, sheet.name).toContain(sheet.marker);
    }
  });

  it('declares the keyframe in each module itself, so neither points at another file', () => {
    for (const sheet of SHEETS) {
      expect(sheet.css, sheet.name).toMatch(new RegExp(`@keyframes\\s+${KEYFRAME_NAME}\\s*\\{`));
    }
  });

  it('carries a keyframe body in each module matching the re-typed expectation', () => {
    for (const sheet of SHEETS) {
      const body = normalise(blockBody(sheet.css, new RegExp(`@keyframes\\s+${KEYFRAME_NAME}`), sheet.name));
      expect(body, sheet.name).toBe(EXPECTED_KEYFRAME_BODY);
    }
  });

  it('applies the same duration, easing and iteration count in each module', () => {
    for (const sheet of SHEETS) {
      const match = new RegExp(`animation:\\s*${KEYFRAME_NAME}\\s+([^;]+);`).exec(sheet.css);
      if (match === null) throw new Error(`no \`animation: ${KEYFRAME_NAME} …\` in ${sheet.name}`);
      expect(normalise(match[1] as string), sheet.name).toBe(EXPECTED_ANIMATION_TAIL);
    }
  });

  it('stops the animation in each module under a stated reduced-motion preference', () => {
    for (const sheet of SHEETS) {
      const body = blockBody(sheet.css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/, sheet.name);
      expect(normalise(body), sheet.name).toContain('animation: none');
    }
  });

  it('takes only the motion away under reduced motion, never the dot itself', () => {
    for (const sheet of SHEETS) {
      const body = normalise(
        blockBody(sheet.css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/, sheet.name),
      );
      expect(body, sheet.name).not.toMatch(/display:\s*none/);
      expect(body, sheet.name).not.toMatch(/visibility:\s*hidden/);
      expect(body, sheet.name).not.toMatch(/opacity:\s*0\b/);
    }
  });
});
