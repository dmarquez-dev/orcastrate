/**
 * Regression for the Pod tab titles collapsing while the fork-error alert is
 * shown. In the `.chrome` flex row the Pod bar panel is `flex: 1 1 auto`, and
 * the fork-error row `.dismissible` kept the default `flex: 0 1 auto`, so its
 * flex basis was the message's whole one-line width. When the two bases
 * overflowed the row they shrank in proportion to those bases, a long message
 * took width from the bar, and the bar's `overflow: hidden` `.title` spans
 * (inside `min-width: 0` tabs) gave it up first.
 *
 * jsdom has no layout, so this is a stylesheet-text proof in the node
 * environment, after `PodsChrome.styles.test.ts` (same `#?raw` import) and
 * `fork-ui-regression.styles.test.ts` (same exact-selector rule lookup). It
 * asserts the declarations the fix rests on:
 *
 * - the alert row's flex basis is ZERO, so it takes only the width the bar's
 *   content basis leaves over, and the bar keeps the content basis it has with
 *   no alert;
 * - the message, which then wraps onto more lines, is clamped to a whole
 *   number of lines that fits in the Pod-bar row, and hard-bounded to the row
 *   height, with its overflow hidden.
 */

import { describe, expect, it } from 'vitest';

import globalCss from '../styles/global.css#?raw';
import tokensCss from '../styles/tokens.css#?raw';

import podsChromeCss from './PodsChrome.module.css#?raw';

const strip = (source: string): string => source.replace(/\/\*[\s\S]*?\*\//g, '');

const chrome = strip(podsChromeCss);

/** The declaration bodies of every rule in `css` carrying exactly `selector`, in source order. */
function rulesIn(css: string, selector: string): string[] {
  const bodies: string[] = [];
  for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = (match[1] ?? '').split(',').map((one) => one.trim());
    if (selectors.includes(selector)) bodies.push(match[2] ?? '');
  }
  return bodies;
}

/** The declaration body of the first rule in `css` carrying exactly `selector`, or `null`. */
function ruleIn(css: string, selector: string): string | null {
  return rulesIn(css, selector)[0] ?? null;
}

/** Every value `property` is given in `body`, in source order. */
function valuesOf(body: string, property: string): string[] {
  const pattern = new RegExp(`(?:^|[;{\\s])${property}\\s*:\\s*([^;]+)`, 'g');
  return [...body.matchAll(pattern)].map((m) => (m[1] ?? '').trim());
}

/** The one `px` value `token` is given in `tokens.css`; throws when it is not exactly one. */
function tokenPx(token: string): number {
  const values = valuesOf(strip(tokensCss), token);
  const [only] = values;
  if (values.length !== 1 || only === undefined) {
    throw new Error(`expected exactly one declaration of ${token} in tokens.css, found ${values.length}`);
  }
  const px = /^(\d+(?:\.\d+)?)px$/.exec(only);
  if (px === null || px[1] === undefined) throw new Error(`${token} is not a px length: ${only}`);
  return Number(px[1]);
}

const ROW = '.dismissible';
const MESSAGE = '.dismissible > .listError';
const PANEL = '.chrome > :first-child';

describe('the rule lookup reads what it claims to', () => {
  const fixture = '.a > .b { overflow: hidden; overflow-wrap: anywhere; }\n.a { flex: 1 1 0; }';

  it('finds a rule by its exact selector and a declaration by its exact property', () => {
    expect(valuesOf(ruleIn(fixture, '.a > .b') ?? '', 'overflow')).toEqual(['hidden']);
    expect(valuesOf(ruleIn(fixture, '.a') ?? '', 'flex')).toEqual(['1 1 0']);
  });

  it('does not match a longer property or a selector it only contains', () => {
    expect(valuesOf('overflow-wrap: anywhere;', 'overflow')).toEqual([]);
    expect(valuesOf('flex-basis: 0;', 'flex')).toEqual([]);
    expect(ruleIn(fixture, '.b')).toBeNull();
  });
});

describe('the fork-error alert takes no width the Pod bar needs', () => {
  it('was read as text and carries the three rules', () => {
    expect(typeof podsChromeCss).toBe('string');
    expect(ruleIn(chrome, ROW)).not.toBeNull();
    expect(ruleIn(chrome, MESSAGE)).not.toBeNull();
    expect(ruleIn(chrome, PANEL)).not.toBeNull();
  });

  it('gives the alert row a zero flex basis, so it only takes width left over', () => {
    const body = ruleIn(chrome, ROW) ?? '';
    expect(valuesOf(body, 'flex')).toEqual(['1 1 0']);
    expect(valuesOf(body, 'flex-basis')).toEqual([]);
    expect(valuesOf(body, 'flex-shrink')).toEqual([]);
  });

  it('keeps the Pod bar panel on its content basis, as it is with no alert', () => {
    const body = ruleIn(chrome, PANEL) ?? '';
    expect(valuesOf(body, 'flex')).toEqual(['1 1 auto']);
    expect(valuesOf(body, 'min-width')).toEqual(['0']);
  });
});

describe('the fork-error message is painted inside the Pod-bar row', () => {
  const body = (): string => ruleIn(chrome, MESSAGE) ?? '';

  it('hides what does not fit and bounds the box to the row height', () => {
    expect(valuesOf(body(), 'overflow')).toEqual(['hidden']);
    expect(valuesOf(body(), 'max-height')).toEqual(['var(--oc-pod-bar-height)']);
  });

  it('clamps the visible text to whole lines, and wraps an unbroken run', () => {
    expect(valuesOf(body(), 'display')).toEqual(['-webkit-box']);
    expect(valuesOf(body(), '-webkit-box-orient')).toEqual(['vertical']);
    expect(valuesOf(body(), 'overflow-wrap')).toEqual(['anywhere']);
    expect(valuesOf(body(), '-webkit-line-clamp')).toHaveLength(1);
  });

  it('clamps to a line count whose line boxes fit in the Pod-bar row', () => {
    const [clamp] = valuesOf(body(), '-webkit-line-clamp');
    const lines = Number(clamp);
    expect(Number.isInteger(lines) && lines >= 1).toBe(true);

    // The message's type: `.listError`'s font size, the body's line height,
    // and nothing in this sheet overriding either.
    expect(valuesOf(ruleIn(chrome, '.listError') ?? '', 'font-size')).toEqual(['var(--oc-text-xs)']);
    expect(valuesOf(chrome, 'line-height')).toEqual([]);
    // `body` is in two rules of `global.css` (`html, body` and `body`); exactly
    // one of them gives it a line height.
    const lineHeights = rulesIn(strip(globalCss), 'body').flatMap((rule) => valuesOf(rule, 'line-height'));
    expect(lineHeights).toHaveLength(1);
    const ratio = Number(lineHeights[0]);
    expect(ratio).toBeGreaterThan(0);

    const lineBox = ratio * tokenPx('--oc-text-xs');
    expect(lines * lineBox).toBeLessThanOrEqual(tokenPx('--oc-pod-bar-height'));
  });
});
