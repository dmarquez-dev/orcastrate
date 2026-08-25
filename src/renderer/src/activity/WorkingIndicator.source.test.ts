/**
 * The component's OWN SOURCE, read as TEXT.
 *
 * Criterion 2 of this task and section 2 of `contracts/activity-indicator.ts`
 * ("NO TIMER. NO CLOCK. NO JS ANIMATION.") are mechanically checkable, and the
 * contract says so in as many words: "the component's source, read as text,
 * contains none of those four names". A behavioural test cannot see a timer
 * that only fires on an unmounted branch; the text can.
 *
 * Default `node` environment: nothing here needs a DOM.
 *
 * Why `?raw` and not `node:fs` — no file under `src/renderer/**` may import a
 * `node:` builtin (`styles/css.d.ts` states the posture, and
 * `tsconfig.web.json` sets `"types": []` so that it cannot). The ambient
 * declaration for this import lives in `./raw.d.ts`, next to the code it
 * serves, because `styles/css.d.ts` is another task's file.
 */

import { describe, expect, it } from 'vitest';

import source from './WorkingIndicator.tsx?raw';

/** Comments are not code. A doc-comment naming `setInterval` is not a timer. */
const strip = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const code = strip(source);

describe('WorkingIndicator.tsx — read as text', () => {
  it('was read as text, not as a module object', () => {
    expect(typeof source).toBe('string');
    expect(code.length).toBeGreaterThan(0);
    expect(code).toContain('WorkingIndicator');
  });

  it.each(['setInterval', 'setTimeout', 'requestAnimationFrame', 'Date.now'])(
    'schedules no work: contains no %s',
    (name) => {
      expect(code).not.toContain(name);
    },
  );

  it('holds no useEffect — nothing in this subtree runs after render', () => {
    expect(code).not.toContain('useEffect');
  });

  it('is purely presentational: no store, no hook, no context, no @shared', () => {
    expect(code).not.toMatch(/from\s+'\.\.\/state/);
    expect(code).not.toMatch(/from\s+'@shared/);
    expect(code).not.toContain('useWorkspace');
    expect(code).not.toContain('useContext');
    expect(code).not.toContain('createContext');
    expect(code).not.toContain('useState');
    expect(code).not.toContain('useReducer');
  });

  it('imports nothing but React and its own stylesheet', () => {
    const specifiers = [...code.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1] as string);
    expect(specifiers.length).toBeGreaterThan(0);
    expect(specifiers.filter((s) => s !== 'react' && s !== './WorkingIndicator.module.css')).toEqual(
      [],
    );
  });

  it('spells the test id literally, with no suffix', () => {
    expect(code).toMatch(/WORKING_INDICATOR_TEST_ID = 'working-indicator'/);
    expect(code).not.toMatch(/testId\(/);
  });
});
