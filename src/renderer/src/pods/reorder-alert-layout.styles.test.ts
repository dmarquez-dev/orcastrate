/**
 * Regression for the Pod tab titles collapsing while `PodBarPanel`'s reorder
 * alert is shown (hand-run observation O25, base run
 * `chrome-alert-width-base`). The alert was a bare `.reorderError` paragraph
 * in the `.panel` flex row, and `.reorderError` set no `flex`, so it kept the
 * default `0 1 auto` basis of its whole one-line message; with the Pod bar's
 * content basis the two overflowed the row, both shrank in proportion to their
 * bases, and the tab titles gave their width up first.
 *
 * The fix bounds it the way `PodsChrome.module.css` bounds the open-error and
 * pods-error alerts: the alert sits inside a `.reorderRow` wrapper
 * (`PodBarPanel.tsx`) with a zero flex basis and no `overflow`, the message
 * is clamped to two lines inside the Pod-bar row, and while the row is shown
 * the Pod bar stops growing, so it keeps its content width and the row takes
 * the rest.
 *
 * jsdom has no layout, so this is a stylesheet-text proof in the node
 * environment, after `chrome-alert-layout.styles.test.ts` (same `#?raw`
 * import, same exact-selector and by-subject rule lookups).
 */

import { describe, expect, it } from 'vitest';

import tokensCss from '../styles/tokens.css#?raw';

import podBarPanelCss from './PodBarPanel.module.css#?raw';
import podsChromeCss from './PodsChrome.module.css#?raw';

const strip = (source: string): string => source.replace(/\/\*[\s\S]*?\*\//g, '');

const panel = strip(podBarPanelCss);
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

/** `body`'s declarations, trimmed, empty ones dropped, in source order. */
function declarationsOf(body: string): string[] {
  return body
    .split(';')
    .map((one) => one.trim().replace(/\s+/g, ' '))
    .filter((one) => one !== '');
}

/**
 * The bodies of every rule with a selector whose SUBJECT (its last compound,
 * after the last combinator) carries `className`: the rules that can apply to
 * an element of that class. A selector that only mentions it as an ancestor
 * (`.reorderRow > .reorderError` for `reorderRow`) is not one of them.
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

const ROW = '.reorderRow';
const BAR = '.panel > :first-child';
const BAR_BESIDE_ROW = '.panel:has(> .reorderRow) > :first-child';
const OPEN_ERROR_MESSAGE = '.alertRow > .listError';
const FLEX_PROPERTIES = ['flex', 'flex-grow', 'flex-shrink', 'flex-basis'] as const;

/** The declarations the reorder alert takes from `.alertRow > .listError`, and the value each must have. */
const CLAMP = {
  display: '-webkit-box',
  '-webkit-box-orient': 'vertical',
  '-webkit-line-clamp': '2',
  'max-height': 'var(--oc-pod-bar-height)',
  overflow: 'hidden',
  'overflow-wrap': 'anywhere',
} as const;

describe('the rule lookups read what they claim to', () => {
  const fixture =
    '.p > :first-child { min-width: 0; flex: 1 1 auto; }\n.p:has(> .r) > :first-child { flex-grow: 0; }\n.r { flex: 1 1 0; }\n.r > .e { overflow: hidden; }';

  it('finds a rule by its exact selector, a :has() rule apart from the plain one', () => {
    expect(declarationsOf(ruleIn(fixture, '.p:has(> .r) > :first-child') ?? '')).toEqual(['flex-grow: 0']);
    expect(declarationsOf(ruleIn(fixture, '.p > :first-child') ?? '')).toEqual(['min-width: 0', 'flex: 1 1 auto']);
    expect(valuesOf('overflow-wrap: anywhere;', 'overflow')).toEqual([]);
    expect(valuesOf('flex-grow: 0;', 'flex')).toEqual([]);
  });

  it('collects rules by subject, not by an ancestor or a :has() mention', () => {
    expect(rulesWithSubject(fixture, 'r')).toEqual([' flex: 1 1 0; ']);
    expect(rulesWithSubject(fixture, 'e')).toHaveLength(1);
  });
});

describe('the reorder alert sits in a zero-basis row that keeps its min-content width', () => {
  it('was read as text and carries the row rule', () => {
    expect(typeof podBarPanelCss).toBe('string');
    expect(ruleIn(panel, ROW)).not.toBeNull();
  });

  it('gives the row a zero basis, as the open-error and pods-error row has', () => {
    expect(valuesOf(ruleIn(panel, ROW) ?? '', 'flex')).toEqual(['1 1 0']);
    expect(valuesOf(ruleIn(chrome, '.alertRow') ?? '', 'flex')).toEqual(['1 1 0']);
  });

  it('sets flex on the row in that one rule only, and no longhand anywhere', () => {
    const bodies = rulesWithSubject(panel, 'reorderRow');
    expect(bodies.length).toBeGreaterThan(0);
    expect(bodies.flatMap((body) => valuesOf(body, 'flex'))).toEqual(['1 1 0']);
    for (const longhand of ['flex-basis', 'flex-grow', 'flex-shrink']) {
      expect(bodies.flatMap((body) => valuesOf(body, longhand))).toEqual([]);
    }
  });

  it('leaves the row overflow visible, so its automatic minimum is its min-content width', () => {
    const bodies = rulesWithSubject(panel, 'reorderRow');
    for (const property of ['overflow', 'overflow-x', 'overflow-y']) {
      expect(bodies.flatMap((body) => valuesOf(body, property))).toEqual([]);
    }
  });
});

describe('the reorder message is painted inside the Pod-bar row', () => {
  const bodies = (): string[] => rulesWithSubject(panel, 'reorderError');

  it('applies the open-error clamp, declaration for declaration', () => {
    const open = ruleIn(chrome, OPEN_ERROR_MESSAGE) ?? '';
    expect(open).not.toBe('');
    for (const [property, value] of Object.entries(CLAMP)) {
      expect(bodies().flatMap((body) => valuesOf(body, property))).toEqual([value]);
      expect(valuesOf(open, property)).toEqual([value]);
    }
  });

  it('zeroes the paragraph margins, as .listError does for the open-error paragraph', () => {
    expect(bodies().flatMap((body) => valuesOf(body, 'margin'))).toEqual(['0']);
    expect(valuesOf(ruleIn(chrome, '.listError') ?? '', 'margin')).toEqual(['0']);
  });
});

describe('while the reorder row is shown, the Pod bar keeps its content width', () => {
  it('stops the Pod bar growing while a .reorderRow is a child of the panel', () => {
    const body = ruleIn(panel, BAR_BESIDE_ROW);
    expect(body).not.toBeNull();
    expect(declarationsOf(body ?? '')).toEqual(['flex-grow: 0']);
  });

  it('leaves the Pod bar exactly as it is with no reorder row', () => {
    expect(declarationsOf(ruleIn(panel, BAR) ?? '')).toEqual(['min-width: 0', 'flex: 1 1 auto']);
  });

  it('sets flex on the Pod bar in those two rules only', () => {
    const others = rulesOf(panel).filter(
      (rule) =>
        !rule.selectors.includes(BAR) &&
        !rule.selectors.includes(BAR_BESIDE_ROW) &&
        rule.selectors.some((selector) => /:first-child$/.test(selector)),
    );
    for (const property of FLEX_PROPERTIES) {
      expect(others.flatMap((rule) => valuesOf(rule.body, property))).toEqual([]);
    }
  });
});

describe('the stylesheet uses only declared tokens', () => {
  it('names every var(--oc-*) it uses in tokens.css', () => {
    const declared = new Set(
      [...strip(tokensCss).matchAll(/(?:^|[;{\s])(--oc-[\w-]+)\s*:/g)].map((m) => m[1] ?? ''),
    );
    const used = [...panel.matchAll(/var\((--oc-[\w-]+)/g)].map((m) => m[1] ?? '');
    expect(used.length).toBeGreaterThan(0);
    expect(used.filter((name) => !declared.has(name))).toEqual([]);
  });
});
