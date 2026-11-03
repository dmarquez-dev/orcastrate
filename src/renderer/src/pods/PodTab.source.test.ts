/**
 * `PodTab.tsx`, read as TEXT.
 *
 * RE-HOMED from `activity/WorkingIndicator.source.test.ts`, per
 * `contracts/activity-module-retirement.ts` section 3. The working indicator is
 * gone and its status dot carries the motion now, so the file that must not
 * acquire a clock is THIS one: the rule is unchanged — `elapsedMs` arrives
 * pre-computed, the provider's single `useElapsedClock(hasRunningLane)` stays
 * the renderer's only clock, and a tab holding a finished Pod schedules
 * nothing.
 *
 * WHY A TEXT GUARD AND NOT A BEHAVIOURAL ONE: a behavioural check only covers
 * the code paths the fixture happened to take, and cannot see a timer on a
 * branch no test exercised. The text can.
 *
 * NOTE, deliberately NOT copied from `lanes/LaneRow.source.test.ts`: that file
 * also forbids `useState|useEffect|useRef`. That assertion is specific to the
 * lane row. `PodTab.tsx` legitimately uses `useEffect` and `useRef` for the
 * delete-control focus rescue, which is an accessibility obligation, not a
 * clock.
 *
 * Default `node` environment: nothing here needs a DOM. A Vite `?raw` text
 * import rather than `node:fs` — no file under `src/renderer/**` may import a
 * `node:` builtin, and `tsconfig.web.json` sets `"types": []` so that it
 * cannot. `styles/raw.d.ts` declares the form. This file adds no second
 * declaration — two ambient `declare module '*.tsx?raw'` blocks in one
 * program is a duplicate declaration.
 */

import { describe, expect, it } from 'vitest';

import source from './PodTab.tsx?raw';

/** Comments are not code. A doc-comment naming `setInterval` is not a timer. */
const strip = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const code = strip(source);

describe('PodTab.tsx — read as text', () => {
  it('was read as text, not as a module object', () => {
    // The vacuity guard. Without it every negative below passes against a
    // blank read.
    expect(typeof source).toBe('string');
    expect(code.length).toBeGreaterThan(0);
    expect(code).toContain('function PodTab');
  });

  it.each(['setInterval', 'setTimeout', 'requestAnimationFrame', 'Date.now'])(
    'schedules no work, so a finished Pod leaves nothing ticking: contains no %s',
    (name) => {
      expect(code).not.toContain(name);
    },
  );

  it.each(['../activity', 'WorkingIndicator', 'WORKING_INDICATOR_TEST_ID'])(
    'no longer reaches for the retired indicator: contains no %s',
    (name) => {
      expect(code).not.toContain(name);
    },
  );
});
