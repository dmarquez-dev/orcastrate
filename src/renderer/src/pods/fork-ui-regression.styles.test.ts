/**
 * Regression for hand-run observation O10 (`FINDINGS-FORK-UI.md`): at a 1280 px
 * viewport the IO fork error wraps onto two lines, and `align-items: center` on
 * `.dismissible` centred the `Dismiss fork error` button on the two-line block,
 * so its vertical centre fell between the lines and inside neither.
 *
 * jsdom has no layout, so this is a stylesheet-text proof in the node
 * environment, after `PodsChrome.styles.test.ts` (same `#?raw` import and the
 * same exact-selector rule lookup). It asserts the two declarations the fix
 * rests on: the row aligns its items to the cross-start edge, so the button
 * sits beside the FIRST line however many lines the message wraps to; and the
 * button has no block padding or border, so its box is one line box tall and
 * its centre is that line's centre.
 */

import { describe, expect, it } from 'vitest';

import podsChromeCss from './PodsChrome.module.css#?raw';

const css = podsChromeCss.replace(/\/\*[\s\S]*?\*\//g, '');

/** The declaration body of the rule carrying exactly `selector`, or `null`. */
function ruleFor(selector: string): string | null {
  for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = (match[1] ?? '').split(',').map((one) => one.trim());
    if (selectors.includes(selector)) return match[2] ?? null;
  }
  return null;
}

/** Every value `property` is given in `body`, in source order. */
function valuesOf(body: string, property: string): string[] {
  const pattern = new RegExp(`(?:^|[;{\\s])${property}\\s*:\\s*([^;]+)`, 'g');
  return [...body.matchAll(pattern)].map((m) => (m[1] ?? '').trim());
}

describe('O10: the fork-error dismiss button sits on the first line of the error', () => {
  it('was read as text and carries both rules', () => {
    expect(typeof podsChromeCss).toBe('string');
    expect(ruleFor('.dismissible')).not.toBeNull();
    expect(ruleFor('.dismiss')).not.toBeNull();
  });

  it('aligns the row to cross-start, not to the centre of a wrapped block', () => {
    expect(valuesOf(ruleFor('.dismissible') ?? '', 'align-items')).toEqual(['flex-start']);
  });

  it('gives the button no block padding and no border, so it is one line box tall', () => {
    const body = ruleFor('.dismiss') ?? '';
    // `padding: 0 <inline>` — block padding is the first value, and it is 0.
    expect(valuesOf(body, 'padding').map((v) => v.split(/\s+/)[0])).toEqual(['0']);
    expect(valuesOf(body, 'padding-top')).toEqual([]);
    expect(valuesOf(body, 'padding-block')).toEqual([]);
    expect(valuesOf(body, 'padding-block-start')).toEqual([]);
    expect(valuesOf(body, 'border')).toEqual(['0']);
  });

  it('keeps the button on the alert text font, so its line box matches the alert line', () => {
    const body = ruleFor('.dismiss') ?? '';
    expect(valuesOf(body, 'font')).toEqual(['inherit']);
    expect(valuesOf(body, 'font-size')).toEqual(valuesOf(ruleFor('.listError') ?? '', 'font-size'));
    expect(valuesOf(body, 'line-height')).toEqual([]);
  });
});
