/**
 * Regression for the Pod tab titles collapsing while the open-error or the
 * pods-error alert is shown (hand-run observations O19 and O22, base run
 * `chrome-alert-squeeze-base`). Both alerts were bare `.listError` paragraphs
 * in the `.chrome` flex row, and `.listError` sets no `flex`, so each kept the
 * default `0 1 auto` basis of its whole one-line message; when that basis and
 * the Pod bar panel's overflowed the row, both shrank in proportion to their
 * bases and the tab titles gave their width up first.
 *
 * The fix bounds them the way the fork-error alert is bounded: each alert now
 * sits inside an `.alertRow` wrapper (`PodsChrome.tsx`; the jsdom test
 * `../__tests__/chrome-alerts.e2e.test.tsx` pins that markup and the class
 * names), whose zero flex basis takes only the width the panel leaves over,
 * and the message is clamped to two lines inside the Pod-bar row.
 *
 * jsdom has no layout, so this is a stylesheet-text proof in the node
 * environment, after `PodsChrome.styles.test.ts` (same `#?raw` import) and
 * `fork-error-layout.styles.test.ts` (same exact-selector rule lookup).
 */

import { describe, expect, it } from 'vitest';

import podsChromeCss from './PodsChrome.module.css#?raw';

const strip = (source: string): string => source.replace(/\/\*[\s\S]*?\*\//g, '');

const chrome = strip(podsChromeCss);

interface Rule {
  readonly selectors: readonly string[];
  readonly body: string;
}

/** Every rule in `css`, its selector list split and trimmed, in source order. */
function rulesOf(css: string): Rule[] {
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({
    selectors: (match[1] ?? '').split(',').map((one) => one.trim()),
    body: match[2] ?? '',
  }));
}

/** The declaration body of the first rule in `css` carrying exactly `selector`, or `null`. */
function ruleIn(css: string, selector: string): string | null {
  return rulesOf(css).find((rule) => rule.selectors.includes(selector))?.body ?? null;
}

/** Every value `property` is given in `body`, in source order. */
function valuesOf(body: string, property: string): string[] {
  const pattern = new RegExp(`(?:^|[;{\\s])${property}\\s*:\\s*([^;]+)`, 'g');
  return [...body.matchAll(pattern)].map((m) => (m[1] ?? '').trim());
}

/**
 * The bodies of every rule with a selector whose SUBJECT (its last compound,
 * after the last combinator) carries `className`: the rules that can apply to
 * an element of that class. A selector that only mentions it as an ancestor
 * (`.alertRow > .listError`) is not one of them.
 */
function rulesWithSubject(css: string, className: string): string[] {
  const subject = new RegExp(`\\.${className}(?![\\w-])`);
  return rulesOf(css)
    .filter((rule) =>
      rule.selectors.some((selector) => {
        const compounds = selector.split(/\s*[>+~\s]\s*/);
        return subject.test(compounds[compounds.length - 1] ?? '');
      }),
    )
    .map((rule) => rule.body);
}

const ROW = '.alertRow';
const MESSAGE = '.alertRow > .listError';
const FORK_MESSAGE = '.dismissible > .listError';

const CLAMP = [
  'display',
  'max-height',
  'overflow',
  'overflow-wrap',
  '-webkit-box-orient',
  '-webkit-line-clamp',
] as const;

describe('the rule lookups read what they claim to', () => {
  const fixture = '.a > .b { overflow: hidden; }\n.a { flex: 1 1 0; }\n.a:hover { color: red; }';

  it('finds a rule by its exact selector and a declaration by its exact property', () => {
    expect(valuesOf(ruleIn(fixture, '.a > .b') ?? '', 'overflow')).toEqual(['hidden']);
    expect(valuesOf(ruleIn(fixture, '.a') ?? '', 'flex')).toEqual(['1 1 0']);
    expect(valuesOf('overflow-wrap: anywhere;', 'overflow')).toEqual([]);
    expect(ruleIn(fixture, '.b > .a')).toBeNull();
  });

  it('collects rules by subject, not by an ancestor mention or a longer class name', () => {
    expect(rulesWithSubject(fixture, 'a')).toHaveLength(2);
    expect(rulesWithSubject(fixture, 'b')).toHaveLength(1);
    expect(rulesWithSubject('.ab { flex: none; }', 'a')).toEqual([]);
  });
});

describe('the open-error and pods-error alerts take no width the Pod bar needs', () => {
  it('was read as text and carries the wrapper rule', () => {
    expect(typeof podsChromeCss).toBe('string');
    expect(ruleIn(chrome, ROW)).not.toBeNull();
  });

  it('gives the wrapper the fork-error row flex, a zero basis', () => {
    expect(valuesOf(ruleIn(chrome, ROW) ?? '', 'flex')).toEqual(['1 1 0']);
    expect(valuesOf(ruleIn(chrome, '.dismissible') ?? '', 'flex')).toEqual(['1 1 0']);
  });

  it('sets flex on the wrapper in that one rule only, and no longhand anywhere', () => {
    const bodies = rulesWithSubject(chrome, 'alertRow');
    expect(bodies.length).toBeGreaterThan(0);
    expect(bodies.flatMap((body) => valuesOf(body, 'flex'))).toEqual(['1 1 0']);
    for (const longhand of ['flex-basis', 'flex-grow', 'flex-shrink']) {
      expect(bodies.flatMap((body) => valuesOf(body, longhand))).toEqual([]);
    }
  });

  it('leaves the wrapper overflow visible, so its automatic minimum is its min-content width', () => {
    const bodies = rulesWithSubject(chrome, 'alertRow');
    for (const property of ['overflow', 'overflow-x', 'overflow-y']) {
      expect(bodies.flatMap((body) => valuesOf(body, property))).toEqual([]);
    }
  });

  it('gives the bare .listError rule no flex of its own', () => {
    const body = ruleIn(chrome, '.listError') ?? '';
    expect(body).not.toBe('');
    expect(valuesOf(body, 'flex')).toEqual([]);
  });
});

describe('the open-error and pods-error messages are painted inside the Pod-bar row', () => {
  const body = (): string => ruleIn(chrome, MESSAGE) ?? '';

  it('carries the clamp rule', () => {
    expect(ruleIn(chrome, MESSAGE)).not.toBeNull();
  });

  it('clamps to two whole lines, bounded to the row height, overflow hidden', () => {
    expect(valuesOf(body(), 'display')).toEqual(['-webkit-box']);
    expect(valuesOf(body(), '-webkit-box-orient')).toEqual(['vertical']);
    expect(valuesOf(body(), '-webkit-line-clamp')).toEqual(['2']);
    expect(valuesOf(body(), 'max-height')).toEqual(['var(--oc-pod-bar-height)']);
    expect(valuesOf(body(), 'overflow')).toEqual(['hidden']);
    expect(valuesOf(body(), 'overflow-wrap')).toEqual(['anywhere']);
  });

  it('matches the fork-error clamp declaration for declaration', () => {
    const fork = ruleIn(chrome, FORK_MESSAGE) ?? '';
    expect(fork).not.toBe('');
    for (const property of CLAMP) {
      expect(valuesOf(body(), property)).toEqual(valuesOf(fork, property));
    }
  });
});
