/**
 * `DeletePodDialog.module.css`, read as TEXT, held to its own docblock.
 *
 * The sheet's header (`:1-7`) makes two claims, and this file is what makes
 * them more than prose: no declaration carries a bare `px`, `rem` or `em`
 * length, and the only raw numeric values left are `z-index`, `opacity`, the
 * `100%` fills and the bare `0` resets.
 *
 * Default `node` environment on purpose, and the `#?raw` spelling is the one
 * that survives the `vitest:css-disable` plugin — see the note on `*.css#?raw`
 * in `../styles/css.d.ts` before touching it. Modelled on
 * `PodBar.styles.test.ts`, down to the vacuity guard.
 *
 * Fixture lengths below are assembled from fragments, the needle-assembly
 * convention `__tests__/hygiene.test.ts` follows, so no scanner reading this
 * file meets a bare length in it.
 */

import { describe, expect, it } from 'vitest';

import dialogCss from './DeletePodDialog.module.css#?raw';

const strip = (source: string): string => source.replace(/\/\*[\s\S]*?\*\//g, '');

const css = strip(dialogCss);

interface Declaration {
  readonly selector: string;
  readonly property: string;
  readonly value: string;
}

/**
 * Every declaration in the sheet, per rule, by the innermost-braces walk
 * `PodBar.styles.test.ts` uses. Comments are stripped first, so the docblock's
 * prose is never a declaration.
 */
function declarationsOf(text: string): Declaration[] {
  const found: Declaration[] = [];
  for (const match of text.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = (match[1] as string).trim().replace(/\s+/g, ' ');
    for (const one of (match[2] as string).split(';')) {
      const colon = one.indexOf(':');
      if (colon < 0) continue;
      found.push({
        selector,
        property: one.slice(0, colon).trim().toLowerCase(),
        value: one.slice(colon + 1).trim(),
      });
    }
  }
  return found;
}

/**
 * A bare `px`, `rem` or `em` length, negative ones included (`margin: -1px` is
 * a form this tree writes). A digit or hyphen inside an identifier
 * (`--oc-space-6`) never starts one, because the lookbehind rejects it; the
 * optional sign sits after the lookbehind, so a minus after whitespace is read
 * as a sign.
 */
const BARE_LENGTH = /(?<![\w.-])-?(?:\d+(?:\.\d+)?|\.\d+)(?:px|rem|em)\b/;

const bareLengthOffenders = (text: string): string[] =>
  declarationsOf(text)
    .filter((one) => BARE_LENGTH.test(one.value))
    .map((one) => `${one.selector} { ${one.property}: ${one.value} }`);

/** The value with every `var(...)` removed, innermost first, so nested fallbacks go too. */
function outsideVars(value: string): string {
  let rest = value;
  for (let previous = ''; previous !== rest; ) {
    previous = rest;
    rest = rest.replace(/var\([^()]*\)/g, ' ');
  }
  return rest;
}

/** A numeric literal, signed or not, with whatever unit or `%` it carries. */
const NUMERIC_LITERAL = /(?<![\w.#-])-?(?:\d+(?:\.\d+)?|\.\d+)(?:[a-zA-Z]+|%)?/g;

/** Every numeric literal outside a `var(...)`, as `selector { property: literal }`. */
function rawNumericValues(text: string): Declaration[] {
  return declarationsOf(text).flatMap((one) =>
    [...outsideVars(one.value).matchAll(NUMERIC_LITERAL)].map((literal) => ({
      ...one,
      value: literal[0],
    })),
  );
}

/** The docblock's allowance: a z-index, an opacity, a `100%`, or a bare `0`. */
const isPermittedRawValue = (one: Declaration): boolean =>
  one.property === 'z-index' ||
  one.property === 'opacity' ||
  one.value === '100%' ||
  one.value === '0';

const rawValueOffenders = (text: string): string[] =>
  rawNumericValues(text)
    .filter((one) => !isPermittedRawValue(one))
    .map((one) => `${one.selector} { ${one.property}: ${one.value} }`);

describe('DeletePodDialog.module.css', () => {
  it('was read as text, not as a class-name proxy', () => {
    expect(typeof dialogCss).toBe('string');
    expect(css.length).toBeGreaterThan(0);
    expect(css).toContain('.dialog');
    expect(declarationsOf(css).length).toBeGreaterThan(0);
  });
});

describe("the docblock's length claim: no bare px, rem or em", () => {
  it('the matcher catches each of the three units and skips a token digit and a comment', () => {
    expect(bareLengthOffenders('.a { padding: 4' + 'px; }')).toEqual(['.a { padding: 4' + 'px }']);
    expect(bareLengthOffenders('.a { margin: 1' + 'rem; }')).toEqual(['.a { margin: 1' + 'rem }']);
    expect(bareLengthOffenders('.a { gap: 0.5' + 'em; }')).toEqual(['.a { gap: 0.5' + 'em }']);
    // A negative length, which a sign-blind lookbehind would miss.
    expect(bareLengthOffenders('.a { margin: -1' + 'px; }')).toEqual([
      '.a { margin: -1' + 'px }',
    ]);

    expect(bareLengthOffenders('.a { padding: var(--oc-space-6); }')).toEqual([]);
    expect(bareLengthOffenders(strip('.a { /* 4' + 'px */ padding: 0; }'))).toEqual([]);
  });

  it('carries no bare length in any declaration', () => {
    expect(bareLengthOffenders(css)).toEqual([]);
  });
});

describe("the docblock's raw-value claim: only z-index, opacity, 100% and bare 0", () => {
  it('counts no digit inside a var(), and does count a literal beside one', () => {
    expect(rawNumericValues('.a { padding: var(--oc-space-6); }')).toEqual([]);
    expect(rawNumericValues('.a { padding: var(--oc-space-6, var(--oc-space-2)); }')).toEqual([]);
    expect(rawValueOffenders('.a { line-height: 1.4; }')).toEqual(['.a { line-height: 1.4 }']);
    expect(rawValueOffenders('.a { margin: -1' + 'px; }')).toEqual(['.a { margin: -1' + 'px }']);
    expect(rawValueOffenders('.a { margin: -1; }')).toEqual(['.a { margin: -1 }']);
    expect(rawValueOffenders('.a { padding: 2' + 'px var(--oc-space-6); }')).toEqual([
      '.a { padding: 2' + 'px }',
    ]);
  });

  it('permits a z-index, an opacity, a 100% fill and a bare 0, and nothing else numeric', () => {
    expect(rawValueOffenders('.a { z-index: 1; opacity: 0.6; width: 100%; margin: 0; }')).toEqual(
      [],
    );
    expect(rawValueOffenders('.a { width: 50%; }')).toEqual(['.a { width: 50% }']);
    expect(rawValueOffenders('.a { flex: 1; }')).toEqual(['.a { flex: 1 }']);
  });

  it('holds every raw numeric value in the sheet to that allowance', () => {
    // Non-vacuous: the walk reaches the sheet's own raw values.
    const seen = rawNumericValues(css).map((one) => `${one.property}: ${one.value}`);
    expect(seen).toContain('z-index: 1');
    expect(seen).toContain('opacity: 0.6');
    expect(seen).toContain('width: 100%');
    expect(seen).toContain('margin: 0');

    expect(rawValueOffenders(css)).toEqual([]);
  });
});
