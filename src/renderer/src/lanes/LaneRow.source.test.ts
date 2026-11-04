/**
 * `LaneRow.tsx`, read as TEXT (T6 criterion 8).
 *
 * NO TIMER, NO CLOCK — the rule `LaneRow.tsx`'s own docblock states, and the
 * one `activity-module-retirement.ts` section 3 re-homes onto this file now
 * that the mark it governed lives on the row itself. `elapsedMs` arrives
 * pre-computed on the view model; the provider's
 * `useElapsedClock(hasRunningLane)` stays the renderer's only clock, and it
 * stops when no lane is running. A row that scheduled its own frame would
 * re-render every finished lane forever.
 *
 * `LaneRail.test.tsx` asserts the BEHAVIOUR (`vi.getTimerCount()` is zero, the
 * Profiler records no re-render). This suite asserts the MECHANISM, because a
 * behavioural check only covers the code paths the fixture happened to take —
 * a timer on a branch no test exercised would slip past it. The text can see
 * it.
 *
 * A Vite `?raw` text import rather than `node:fs`: no file under
 * `src/renderer/**` may import a `node:` builtin, and `tsconfig.web.json` sets
 * `"types": []` so that it cannot. `styles/raw.d.ts` declares the form.
 */

import { describe, expect, it } from 'vitest';

import laneRowSource from './LaneRow.tsx?raw';

/**
 * The React hooks through which a row could hold, tick or subscribe to its own
 * elapsed value — state (`useState`, `useReducer`), an external store
 * (`useSyncExternalStore`) or an effect that schedules (`useEffect`,
 * `useLayoutEffect`) — each matched as a whole identifier. Hooks that hold no
 * clock (`useRef`, `useMemo`, `useId`) are not barred: the rule is "no timer
 * and no clock", not "no hooks".
 */
const BARRED_HOOK =
  /\b(?:useState|useReducer|useSyncExternalStore|useEffect|useLayoutEffect)\b/g;

/** Every barred-hook identifier the source names, in order. */
const barredHookUses = (source: string): string[] =>
  [...source.matchAll(BARRED_HOOK)].map((match) => match[0]);

describe('the barred-hook predicate', () => {
  it.each([
    ['useState', 'const [now, setNow] = useState(0);'],
    ['useReducer', 'const [tick, bump] = useReducer((n: number) => n + 1, 0);'],
    ['useSyncExternalStore', 'const now = useSyncExternalStore(subscribe, getSnapshot);'],
    ['useEffect', 'useEffect(() => { schedule(); }, []);'],
    ['useLayoutEffect', 'React.useLayoutEffect(() => { schedule(); });'],
  ])('flags %s', (hook, fixture) => {
    expect(barredHookUses(fixture)).toEqual([hook]);
  });

  it.each([
    ['useRef', 'const ref = useRef<HTMLButtonElement>(null);'],
    ['useMemo', 'const label = useMemo(() => formatElapsed(ms), [ms]);'],
    ['useId', 'const id = useId();'],
  ])('does not flag %s, which holds no clock', (_hook, fixture) => {
    expect(barredHookUses(fixture)).toEqual([]);
  });

  it('matches a barred hook only as a whole identifier, not as the prefix of a longer one', () => {
    expect(barredHookUses('const machine = useStateMachine(config);')).toEqual([]);
  });
});

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
    expect(barredHookUses(laneRowSource)).toEqual([]);
  });
});

/**
 * The retired `activity/` directory (`activity-module-retirement.ts` sections 2
 * and 3). The status dot absorbed the pulse, so the row mounts no separate
 * working indicator and imports nothing from the directory T3 deletes. Asserted
 * as text because a dangling import is a compile-time fact, and because this is
 * the guard that keeps the mark from creeping back as a second element.
 */
describe('LaneRow no longer names the retired activity module', () => {
  it('imports nothing from ../activity and names neither the component nor its test id', () => {
    for (const forbidden of ['../activity', 'WorkingIndicator', 'WORKING_INDICATOR_TEST_ID']) {
      expect(laneRowSource).not.toContain(forbidden);
    }
  });

  it('still renders the status dot and its word, which is the mark that remains', () => {
    expect(laneRowSource).toContain('styles.dot');
    expect(laneRowSource).toContain('LANE_STATUS_LABEL[row.status]');
  });
});
