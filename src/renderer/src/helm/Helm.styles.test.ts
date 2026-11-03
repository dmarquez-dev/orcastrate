/**
 * The Helm stylesheet, read as TEXT — criterion 13.
 *
 * A DOM test cannot see any of this: Vitest does not apply CSS Modules to the
 * rendered tree, so a hardcoded colour or a bare `13px` would render exactly
 * like a token and pass every other suite in this directory. Reading the file
 * is the only way the rule can fire.
 *
 * THE RULES LIVE IN `rules.ts`, each with a counterexample, and
 * `discrimination.test.tsx` proves every one of them can fire. This file only
 * applies them. The split is not tidiness: this suite once shipped a rule that
 * matched nothing and passed anyway, and the sample matrix is what makes that
 * impossible to repeat.
 *
 * Default `node` environment on purpose: under jsdom the `#?raw` import
 * resolves to a class-name proxy instead of the file's text, which would make
 * every assertion below pass vacuously. The first test is there to prove it
 * did not.
 */

import { describe, expect, it } from 'vitest';

import helmCss from './Helm.module.css#?raw';
import { STYLE_RULES, stripCssComments } from './rules';

const css = stripCssComments(helmCss);

describe('Helm.module.css', () => {
  it('was read as text, not as a class-name proxy', () => {
    expect(typeof helmCss).toBe('string');
    expect(css.length).toBeGreaterThan(0);
    expect(css).toContain('.panel');
  });

  it('breaks none of the stylesheet rules', () => {
    const broken = STYLE_RULES.filter((rule) => rule.violates(css)).map((rule) => rule.name);
    expect(broken).toEqual([]);
  });

  it('references only tokens the frozen TOKENS map names', async () => {
    const { TOKENS } = await import('../contracts/renderer-theme');
    const known = new Set<string>(Object.values(TOKENS));
    const used = [...css.matchAll(/var\((--[\w-]+)/g)].map((match) => match[1] as string);

    expect(used.length).toBeGreaterThan(20);
    expect([...new Set(used)].filter((token) => !known.has(token))).toEqual([]);
  });

  it('rejects a token name the frozen map does not hold', async () => {
    // The rule above reports an empty list either way if the extraction is
    // broken. This proves the extraction, and the membership test, both work.
    const { TOKENS } = await import('../contracts/renderer-theme');
    const known = new Set<string>(Object.values(TOKENS));
    const sample = '.x { color: var(--oc-invented-token); }';
    const used = [...sample.matchAll(/var\((--[\w-]+)/g)].map((match) => match[1] as string);

    expect(used.filter((token) => !known.has(token))).toEqual(['--oc-invented-token']);
  });

  it('uses the tokens this session added, which is why they were added', () => {
    for (const token of [
      '--oc-border-hairline',
      '--oc-border-thick',
      '--oc-tracking-wide',
      '--oc-weight-regular',
      '--oc-weight-medium',
      '--oc-weight-bold',
    ]) {
      expect(css).toContain(`var(${token})`);
    }
  });
});
