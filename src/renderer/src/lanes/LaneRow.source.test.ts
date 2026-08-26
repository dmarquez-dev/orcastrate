/**
 * `LaneRow.tsx`, read as TEXT (T6 criterion 8).
 *
 * NO TIMER, NO CLOCK — the rule `LaneRow.tsx`'s own docblock states and that
 * `contracts/activity-indicator.ts` section 2 restates for the indicator this
 * task mounts inside it. `elapsedMs` arrives pre-computed on the view model;
 * the provider's `useElapsedClock(hasRunningLane)` stays the renderer's only
 * clock, and it stops when no lane is running. A row that scheduled its own
 * frame would re-render every finished lane forever.
 *
 * `LaneRail.test.tsx` asserts the BEHAVIOUR (`vi.getTimerCount()` is zero, the
 * Profiler records no re-render). This suite asserts the MECHANISM, because a
 * behavioural check only covers the code paths the fixture happened to take —
 * an indicator mounted behind a condition no test exercised would slip past it.
 *
 * A Vite `?raw` text import rather than `node:fs`: no file under
 * `src/renderer/**` may import a `node:` builtin, and `tsconfig.web.json` sets
 * `"types": []` so that it cannot. `activity/raw.d.ts` declares the form.
 */

import { describe, expect, it } from 'vitest';

import laneRowSource from './LaneRow.tsx?raw';

describe('LaneRow holds no timer and no clock (criterion 8)', () => {
  it('was read as text, not as a module proxy', () => {
    expect(typeof laneRowSource).toBe('string');
    expect(laneRowSource).toContain('function LaneRowImpl');
    expect(laneRowSource).toContain('formatElapsed(row.elapsedMs)');
  });

  it('names none of the four scheduling primitives', () => {
    for (const name of ['setInterval', 'setTimeout', 'requestAnimationFrame', 'Date.now']) {
      expect(laneRowSource).not.toContain(name);
    }
  });

  it('still exports LaneRow memo-wrapped', () => {
    expect(laneRowSource).toMatch(/export const LaneRow = memo\(LaneRowImpl\)/);
  });

  it('takes elapsedMs pre-computed off the view model and only formats it', () => {
    expect(laneRowSource).not.toMatch(/useState|useEffect|useRef/);
  });
});
