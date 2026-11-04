/**
 * `LaneRail.module.css`, read as TEXT (T6 criteria 2-5).
 *
 * Default `node` environment on purpose: under jsdom, Vitest resolves
 * `*.module.css` to a class-name proxy and the raw text never arrives. The
 * `#?raw` spelling is the one that survives the `vitest:css-disable` plugin —
 * see the note on `*.css#?raw` in `../styles/css.d.ts` before touching it.
 *
 * Modelled on `shell/Panels.styles.test.ts`, down to the vacuity guard, which
 * is what stops the suite passing against a proxy with no text in it.
 *
 * WHY A STYLESHEET IS ASSERTED AT ALL. The defect this task closes is that the
 * selection highlight sat on `.rowMain` — the inner select `<button>` — which
 * cannot cover its own sibling `Steer` action, so a selected lane read as a
 * highlighted button with a gap beside it rather than as a highlighted
 * swimlane. Which ELEMENT carries the background is the whole fix, and jsdom
 * computes no CSS Module cascade, so the text is the only place to assert it.
 */

import { describe, expect, it } from 'vitest';

import railCss from './LaneRail.module.css#?raw';

const strip = (source: string): string => source.replace(/\/\*[\s\S]*?\*\//g, '');

const css = strip(railCss);

/**
 * The declaration body of the FIRST rule whose selector list contains
 * `selector` as a whole token. Comments are already stripped.
 */
function block(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(^|[},])\\s*${escaped}\\s*\\{([^}]*)\\}`, 'm');
  const match = re.exec(css);
  if (match === null) throw new Error(`no rule for \`${selector}\` in LaneRail.module.css`);
  return match[2] as string;
}

/** Every `var(--token)` named in a declaration body. */
function tokensIn(body: string): string[] {
  return [...body.matchAll(/var\((--[\w-]+)/g)].map((m) => m[1] as string);
}

/**
 * Custom properties that are NOT theme tokens and therefore are not in the
 * frozen `TOKENS` map. `PodBar.styles.test.ts:292` already states the reason
 * for this one, and it is the same reason here: `--pod-status-color` is set
 * INLINE on the status span from `statusToken(status)`, never declared in a
 * stylesheet, so it names no colour a theme change could miss. It resolves to
 * an `--oc-status-*` token at the point it is set, which is exactly why naming
 * a status token in the sheet would be a second source of truth for one hue.
 */
const NOT_A_THEME_TOKEN = new Set<string>(['--pod-status-color']);

describe('LaneRail.module.css — the sheet itself', () => {
  it('was read as text, not as a class-name proxy', () => {
    expect(typeof railCss).toBe('string');
    expect(css.length).toBeGreaterThan(0);
    expect(css).toContain('.row');
    expect(css).toContain('.rowMain');
    expect(css).toContain('.rowAction');
  });

  it('hardcodes no colour — tokens only', () => {
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(css).not.toMatch(/\brgba?\(/);
    expect(css).not.toMatch(/\bhsla?\(/);
  });

  it('never fights the cascade and never removes the focus ring', () => {
    expect(css).not.toContain('!important');
    expect(css).not.toMatch(/outline:\s*(none|0)\b/);
  });

  it('references only tokens that the frozen TOKENS map names', async () => {
    const { TOKENS } = await import('../contracts/renderer-theme');
    const known = new Set<string>(Object.values(TOKENS));
    const used = tokensIn(css);
    expect(used.length).toBeGreaterThan(0);
    expect(used.filter((name) => !known.has(name) && !NOT_A_THEME_TOKEN.has(name))).toEqual([]);
  });
});

/** Criterion 2. */
describe('the stopped status dot (criterion 2)', () => {
  it('colours the stopped dot from --oc-status-stopped', () => {
    expect(css).toMatch(
      /\.status\[data-status='stopped'\]\s+\.dot\s*\{[^}]*background:\s*var\(--oc-status-stopped\)/,
    );
  });

  it('gives every one of the four lane statuses its own dot rule', () => {
    for (const status of ['running', 'done', 'orphaned', 'stopped'] as const) {
      expect(css).toContain(`.status[data-status='${status}'] .dot`);
    }
  });
});

/** Criterion 3 — WHICH ELEMENT carries the highlight. */
describe('the whole swimlane highlights on selection (criterion 3)', () => {
  const PRIMARY = ".row[data-in-primary-pane='true']";
  const FOLLOWER = ".row[data-in-follower-pane='true']";

  it('declares the selection background on the row CONTAINER', () => {
    // The `<li>`, which encloses BOTH the select button and the Steer action.
    expect(css).toMatch(
      new RegExp(
        `\\.row\\[data-in-primary-pane='true'\\][^{]*\\{[^}]*background:\\s*var\\(--oc-bg-`,
      ),
    );
    expect(tokensIn(block(PRIMARY)).some((t) => t.startsWith('--oc-bg-'))).toBe(true);
    expect(tokensIn(block(FOLLOWER)).some((t) => t.startsWith('--oc-bg-'))).toBe(true);
  });

  it('does NOT declare the selection background on .rowMain, the inner button', () => {
    // `.rowMain` is a `<button>`; a background on it stops at its own box and
    // leaves the sibling Steer action outside the highlight.
    const main = block('.rowMain');
    expect(main).toMatch(/background:\s*transparent/);
    expect(main).not.toContain('--oc-bg-selected');
    expect(css).not.toMatch(/\.rowMain\[data-in-(primary|follower)-pane/);
  });

  it('spans the full row width — no horizontal inset on the highlighted element', () => {
    const row = block('.row');
    expect(row).not.toMatch(/padding-inline/);
    expect(row).not.toMatch(/margin-inline/);
    expect(row).not.toMatch(/(^|;)\s*margin\s*:/);
    // A padding shorthand, if present at all, has a ZERO horizontal component.
    const padding = /(^|;)\s*padding\s*:\s*([^;]+)/.exec(row);
    if (padding !== null) {
      const parts = (padding[2] as string).trim().split(/\s+/);
      const horizontal = parts.length === 1 ? parts[0] : parts[1];
      expect(horizontal).toBe('0');
    }
  });
});

/** Criterion 4 — three distinct surfaces, Matriarch darker than Calf. */
describe('Matriarch and Calf highlights are distinct surfaces (criterion 4)', () => {
  const MATRIARCH_SELECTED = ".row[data-matriarch='true'][data-in-primary-pane='true']";

  it('uses three distinct token values: unselected, Calf highlight, Matriarch highlight', () => {
    const unselected = tokensIn(block('.rail')).filter((t) => t.startsWith('--oc-bg-'));
    const calf = tokensIn(block(".row[data-in-primary-pane='true']"));
    const matriarch = tokensIn(block(MATRIARCH_SELECTED));

    expect(unselected).toEqual(['--oc-bg-panel']);
    expect(calf).toEqual(['--oc-bg-selected']);
    expect(matriarch).toEqual(['--oc-bg-hover']);

    expect(new Set([...unselected, ...calf, ...matriarch]).size).toBe(3);
  });

  it("makes the Matriarch's highlight DARKER than a Calf's, measured in tokens.css", async () => {
    const tokensCss = (await import('../styles/tokens.css#?raw')).default;
    const valueOf = (name: string): string => {
      const m = new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`).exec(tokensCss);
      if (m === null) throw new Error(`tokens.css declares no ${name}`);
      return m[1] as string;
    };
    // Relative luminance is not needed: these are the same neutral ramp, so
    // the sum of the channels orders them.
    const brightness = (hex: string): number =>
      parseInt(hex.slice(1, 3), 16) + parseInt(hex.slice(3, 5), 16) + parseInt(hex.slice(5, 7), 16);

    const panel = brightness(valueOf('--oc-bg-panel'));
    const matriarch = brightness(valueOf('--oc-bg-hover'));
    const calf = brightness(valueOf('--oc-bg-selected'));

    expect(matriarch).toBeLessThan(calf);
    expect(matriarch).toBeGreaterThan(panel);
    expect(calf).toBeGreaterThan(panel);
  });

  it('covers the follower pane too, so the visual tracks aria-current exactly', () => {
    expect(css).toContain(".row[data-matriarch='true'][data-in-follower-pane='true']");
    expect(css).toContain(".row[data-in-follower-pane='true']");
  });
});

/** Criterion 5 — Steer stays darker, and the highlight goes AROUND it. */
describe('the Steer action against the highlight (criterion 5)', () => {
  it('resolves to a different declared background token than the highlighted row', () => {
    const action = tokensIn(block('.rowAction')).filter((t) => t.startsWith('--oc-bg-'));
    const calf = tokensIn(block(".row[data-in-primary-pane='true']"));
    const matriarch = tokensIn(block(".row[data-matriarch='true'][data-in-primary-pane='true']"));

    expect(action).toEqual(['--oc-bg-raised']);
    expect(action).not.toEqual(calf);
    expect(action).not.toEqual(matriarch);
  });

  it('keeps Steer DARKER than either highlight', async () => {
    const tokensCss = (await import('../styles/tokens.css#?raw')).default;
    const valueOf = (name: string): string => {
      const m = new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`).exec(tokensCss);
      if (m === null) throw new Error(`tokens.css declares no ${name}`);
      return m[1] as string;
    };
    const brightness = (hex: string): number =>
      parseInt(hex.slice(1, 3), 16) + parseInt(hex.slice(3, 5), 16) + parseInt(hex.slice(5, 7), 16);

    expect(brightness(valueOf('--oc-bg-raised'))).toBeLessThan(
      brightness(valueOf('--oc-bg-hover')),
    );
    expect(brightness(valueOf('--oc-bg-raised'))).toBeLessThan(
      brightness(valueOf('--oc-bg-selected')),
    );
  });
});

/**
 * The collapsed status dot's motion (`contracts/status-dot-motion.ts`).
 *
 * The working indicator left the row; the dot absorbed its pulse. The keyframe
 * is declared IN THIS FILE and referenced from this file, because Vite hashes
 * an animation name used inside a `*.module.css` even when no local
 * `@keyframes` of that name exists — a module referencing a keyframe declared
 * elsewhere points at a name that does not exist and the animation silently
 * never runs. That failure is invisible to jsdom, which applies no stylesheet,
 * so the declaration is asserted here as text and the RESOLUTION of the emitted
 * name is proved by the build in T3.
 */
const PULSE_KEYFRAME_NAME = 'ocStatusPulse';
const PULSE_SELECTOR = ".status[data-status='running'] .dot";
/**
 * The SECOND animating selector (`contracts/lane-row-pod-status.ts` section 3).
 * A Matriarch row governed by the Pod carries `data-pod-status` instead of
 * `data-status`, and only there does `running` mean "streaming right now" —
 * the lane vocabulary's `running` only means the lane has not ended.
 */
const POD_PULSE_SELECTOR = ".status[data-pod-status='running'] .dot";
const norm = (source: string): string => source.replace(/\s+/g, ' ').trim();

/** The body pinned verbatim by `status-dot-motion.ts` section 2. */
const PINNED_KEYFRAME_BODY = norm(`
  0%,
  100% {
    opacity: 0.35;
  }

  50% {
    opacity: 1;
  }
`);

/** The brace-balanced body of the at-rule whose prelude matches `prelude`. */
function atRule(prelude: RegExp): { body: string; start: number; end: number } {
  const at = css.search(prelude);
  if (at < 0) throw new Error(`no at-rule matching ${String(prelude)} in LaneRail.module.css`);
  const open = css.indexOf('{', at);
  let depth = 0;
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === '{') depth += 1;
    else if (css[i] === '}') {
      depth -= 1;
      if (depth === 0) return { body: css.slice(open + 1, i), start: at, end: i };
    }
  }
  throw new Error(`unbalanced braces after ${String(prelude)} in LaneRail.module.css`);
}

/** Every selector whose own declaration body matches `prop`. */
function selectorsDeclaring(source: string, prop: RegExp): string[] {
  return [...source.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter((m) => prop.test(m[2] as string))
    .map((m) => norm(m[1] as string));
}

describe('the status dot carries the pulse (contract status-dot-motion)', () => {
  it('declares the keyframe locally, under the contract name, exactly once', () => {
    const declared = [...css.matchAll(/@keyframes\s+([\w-]+)/g)].map((m) => m[1] as string);
    expect(declared).toEqual([PULSE_KEYFRAME_NAME]);
  });

  it('pins the keyframe body to the text the contract froze', () => {
    const { body } = atRule(new RegExp(`@keyframes\\s+${PULSE_KEYFRAME_NAME}\\b`));
    expect(norm(body)).toBe(PINNED_KEYFRAME_BODY);
  });

  it('applies the animation on the running dot selector and on no other', () => {
    const reduced = atRule(/@media\s*\(\s*prefers-reduced-motion:\s*reduce\s*\)/);
    const outsideReducedMotion = css.slice(0, reduced.start) + css.slice(reduced.end + 1);

    expect(outsideReducedMotion).toMatch(
      /\.status\[data-status='running'\]\s+\.dot\s*\{[^}]*animation:\s*ocStatusPulse 1\.4s ease-in-out infinite;/,
    );
    expect(outsideReducedMotion).toMatch(
      /\.status\[data-pod-status='running'\]\s+\.dot\s*\{[^}]*animation:\s*ocStatusPulse 1\.4s ease-in-out infinite;/,
    );
    // EXTENDED to both animating selectors, not relaxed to a `toContain`: the
    // whole point of this assertion is that NOTHING ELSE animates. `waiting`
    // in particular must not appear here — that state means the Pod is blocked
    // on the user.
    expect(selectorsDeclaring(outsideReducedMotion, /animation:/)).toEqual([
      PULSE_SELECTOR,
      POD_PULSE_SELECTOR,
    ]);
  });

  it('leaves the base .dot rule with no animation to cancel', () => {
    expect(block('.dot')).not.toContain('animation');
  });

  it('leaves all four status hue rules unchanged', () => {
    for (const status of ['running', 'done', 'orphaned', 'stopped'] as const) {
      expect(css).toMatch(
        new RegExp(
          `\\.status\\[data-status='${status}'\\]\\s+\\.dot\\s*\\{\\s*background:\\s*var\\(--oc-status-${status}\\);\\s*\\}`,
        ),
      );
    }
  });
});

/**
 * The reduced-motion guard, re-homed from the deleted
 * `activity/WorkingIndicator.styles.test.ts` (`activity-module-retirement.ts`
 * section 4). A stated system preference wins over the MOTION but never over
 * the SIGNAL: the dot keeps its size, its shape and its status hue, and only
 * the animation stops.
 */
describe('reduced motion stops the pulse and keeps the dot (contract section 5)', () => {
  it('turns the animation off inside the query, not in some later rule', () => {
    const reduced = atRule(/@media\s*\(\s*prefers-reduced-motion:\s*reduce\s*\)/);
    expect(reduced.body).toMatch(/animation:\s*none/);
    // Both animating selectors are cancelled, and only those two.
    expect(selectorsDeclaring(reduced.body, /animation:\s*none/)).toEqual([
      PULSE_SELECTOR,
      POD_PULSE_SELECTOR,
    ]);
    // ...and nowhere outside it, which is what "inside the query" means.
    const outside = css.slice(0, reduced.start) + css.slice(reduced.end + 1);
    expect(outside).not.toMatch(/animation:\s*none/);
  });

  it('hides nothing in the reduced-motion branch', () => {
    const reduced = atRule(/@media\s*\(\s*prefers-reduced-motion:\s*reduce\s*\)/);
    expect(reduced.body).not.toMatch(/display:\s*none/);
    expect(reduced.body).not.toMatch(/visibility:\s*hidden/);
    expect(reduced.body).not.toMatch(/opacity:\s*0\s*[;}]/);
  });

  it('changes nothing else — animation is the only property it touches', () => {
    const reduced = atRule(/@media\s*\(\s*prefers-reduced-motion:\s*reduce\s*\)/);
    const properties = [...reduced.body.matchAll(/([-\w]+)\s*:/g)].map((m) => m[1] as string);
    // One `animation: none` per animating selector and NOTHING else: no
    // `display`, no `visibility`, no `opacity`, no size, no hue. A stated
    // preference wins over the motion, never over the signal.
    expect(properties).toEqual(['animation', 'animation']);
  });
});

/**
 * THE POD-GOVERNED DOT (`contracts/lane-row-pod-status.ts` section 3).
 *
 * The Matriarch's lane is `running` for the Pod's entire life — the schema's
 * `CHECK ((status = 'running') = (ended_at IS NULL))` makes that a LIFETIME
 * flag — so a row keyed off `data-status` pulsed forever. A row governed by the
 * Pod carries `data-pod-status` instead, whose `running` is the ACTIVITY flag.
 *
 * Every selector below is asserted BY EXACT TEXT through `block()`, because
 * jsdom computes no CSS Module cascade: which selector carries which
 * declaration is the whole change, and the text is the only place to see it.
 *
 * The five shapes are `PodBar.module.css`'s, value for value.
 */
describe('the Pod-governed status dot draws the Pod tab’s five shapes', () => {
  it('fills the base dot from the inline hue, naming no status token of its own', () => {
    const base = block(".status[data-pod-status] .dot");
    expect(base).toMatch(/background:\s*var\(--pod-status-color\)/);
    expect(base).toMatch(
      /border:\s*var\(--oc-border-hairline\) solid var\(--pod-status-color\)/,
    );
    // `statusToken(podStatus)` already resolves to the right `--oc-status-*`.
    // Naming one here would be a second source of truth for one colour.
    expect(base).not.toMatch(/--oc-status-/);
    // No motion on the base rule, so a non-running dot inherits none to cancel.
    expect(base).not.toContain('animation');
  });

  it('sharpens idle into a hollow ring, thick enough to read at 8px', () => {
    const body = block(".status[data-pod-status='idle'] .dot");
    expect(body).toMatch(/background:\s*transparent/);
    expect(body).toMatch(/border-width:\s*var\(--oc-border-thick\)/);
  });

  it('gives waiting the halo — and no animation, because it waits on the USER', () => {
    const body = block(".status[data-pod-status='waiting'] .dot");
    expect(body).toMatch(
      /box-shadow:\s*0 0 0 2px var\(--oc-bg-panel\), 0 0 0 3px var\(--pod-status-color\)/,
    );
    expect(body).not.toContain('animation');
  });

  it('squares off beached', () => {
    expect(block(".status[data-pod-status='beached'] .dot")).toMatch(/border-radius:\s*0/);
  });

  it('flattens closed into a bar, so it never falls through to the filled circle', () => {
    const body = block(".status[data-pod-status='closed'] .dot");
    expect(body).toMatch(/height:\s*var\(--oc-border-thick\)/);
    expect(body).toMatch(/align-self:\s*center/);
    expect(body).toMatch(/border-radius:\s*0/);
  });

  it('animates running against the keyframe THIS sheet declares, and adds no second one', () => {
    expect(block(".status[data-pod-status='running'] .dot")).toMatch(
      /animation:\s*ocStatusPulse 1\.4s ease-in-out infinite/,
    );
    // Unchanged from the assertion above: exactly one keyframe in this module.
    // A `*.module.css` referencing a keyframe declared elsewhere points at a
    // hashed name that does not exist, and the animation silently never runs.
    const declared = [...css.matchAll(/@keyframes\s+([\w-]+)/g)].map((m) => m[1] as string);
    expect(declared).toEqual([PULSE_KEYFRAME_NAME]);
  });

  it('gives each of the five PodStatus values its own rule, and no sixth', () => {
    const keyed = [...css.matchAll(/\.status\[data-pod-status='([\w-]+)'\]/g)].map(
      (m) => m[1] as string,
    );
    // `running` twice: the animating rule plus its reduced-motion cancellation.
    expect([...new Set(keyed)].sort()).toEqual([
      'beached',
      'closed',
      'idle',
      'running',
      'waiting',
    ]);
  });
});

/**
 * WHICH `background` A ROW STATE ENDS UP WITH (session 20261103-2240, C6/C7).
 *
 * jsdom computes no CSS Module cascade (see the docblock at the top of this
 * file), so the winner is resolved here from the sheet's TEXT: of every rule
 * whose subject matches the stated row state and that declares `background`,
 * the highest specificity wins, and among equals the LATER one in source order.
 *
 * Scope, deliberately narrow: top-level rules only (at-rule blocks are skipped
 * — the one at-rule body that holds rules here is the reduced-motion query,
 * which declares `animation` only), and a selector is matched against ONE
 * element. A selector with a combinator whose subject compound would otherwise
 * match throws, rather than being silently treated as matching or not: this
 * resolver does not model ancestors, so it refuses to guess about one.
 */
interface RowState {
  readonly classes: readonly string[];
  readonly attrs: Readonly<Record<string, string>>;
  readonly hover: boolean;
}

interface Compound {
  readonly classes: string[];
  readonly attrs: { name: string; value: string | null }[];
  readonly pseudos: string[];
}

/** Top-level `{ selectorList, body, index }` rules, at-rule blocks removed. */
function topLevelRules(source: string): { selectors: string[]; body: string; index: number }[] {
  const text = strip(source);
  const rules: { selectors: string[]; body: string; index: number }[] = [];
  let i = 0;
  let index = 0;
  while (i < text.length) {
    const open = text.indexOf('{', i);
    if (open < 0) break;
    const prelude = text.slice(i, open).trim();
    // Brace-balanced end of this block.
    let depth = 0;
    let close = open;
    for (; close < text.length; close += 1) {
      if (text[close] === '{') depth += 1;
      else if (text[close] === '}') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    if (!prelude.startsWith('@')) {
      rules.push({
        selectors: prelude.split(',').map((s) => s.trim()),
        body: text.slice(open + 1, close),
        index,
      });
      index += 1;
    }
    i = close + 1;
  }
  return rules;
}

function parseCompound(compound: string): Compound {
  const out: Compound = { classes: [], attrs: [], pseudos: [] };
  const token = /\.([\w-]+)|\[([\w-]+)(?:=(['"])(.*?)\3)?\]|:([\w-]+)/y;
  let at = 0;
  while (at < compound.length) {
    token.lastIndex = at;
    const m = token.exec(compound);
    if (m === null) {
      throw new Error(`resolver cannot parse \`${compound}\` at offset ${at}`);
    }
    if (m[1] !== undefined) out.classes.push(m[1]);
    else if (m[2] !== undefined) out.attrs.push({ name: m[2], value: m[4] ?? null });
    else out.pseudos.push(m[5] as string);
    at = token.lastIndex;
  }
  return out;
}

/** Specificity of one compound as a single comparable number (no ids, no types here). */
const specificityOf = (c: Compound): number => c.classes.length + c.attrs.length + c.pseudos.length;

function subjectMatches(c: Compound, state: RowState): boolean {
  for (const pseudo of c.pseudos) {
    if (pseudo !== 'hover') throw new Error(`resolver does not model :${pseudo}`);
  }
  return (
    c.classes.every((cls) => state.classes.includes(cls)) &&
    c.attrs.every((a) =>
      a.value === null ? a.name in state.attrs : state.attrs[a.name] === a.value,
    ) &&
    (!c.pseudos.includes('hover') || state.hover)
  );
}

/** The winning `background` value for `state`, or null when no rule paints one. */
function resolveBackground(source: string, state: RowState): string | null {
  let winner: { value: string; specificity: number; index: number } | null = null;
  for (const rule of topLevelRules(source)) {
    const decl = /(^|;)\s*background\s*:\s*([^;]+?)\s*(;|$)/.exec(rule.body);
    if (decl === null) continue;
    for (const selector of rule.selectors) {
      const compounds = selector.split(/\s*[\s>+~]\s*/).filter((s) => s !== '');
      const subject = parseCompound(compounds[compounds.length - 1] as string);
      if (!subjectMatches(subject, state)) continue;
      if (compounds.length > 1) {
        throw new Error(`resolver does not model the combinator in \`${selector}\``);
      }
      const specificity = specificityOf(subject);
      if (
        winner === null ||
        specificity > winner.specificity ||
        (specificity === winner.specificity && rule.index >= winner.index)
      ) {
        winner = { value: decl[2] as string, specificity, index: rule.index };
      }
    }
  }
  return winner?.value ?? null;
}

const rowState = (attrs: Record<string, string>, hover: boolean): RowState => ({
  classes: ['row'],
  attrs,
  hover,
});

describe('the background resolver (C67-resolver) — positive controls on inline fixtures', () => {
  it('(1) of two equal-specificity rules, the LATER one wins', () => {
    const sheet = `
      .row[data-a='1'] { background: var(--earlier); }
      .row[data-b='1'] { background: var(--later); }
    `;
    // Predicted winner: var(--later). Both are (0,2,0); source order decides.
    expect(resolveBackground(sheet, rowState({ 'data-a': '1', 'data-b': '1' }, false))).toBe(
      'var(--later)',
    );
  });

  it('(2) a higher-specificity EARLIER rule beats a lower-specificity later one', () => {
    const sheet = `
      .row[data-a='1'][data-b='1'] { background: var(--specific-earlier); }
      .row { background: var(--plain-later); }
    `;
    // Predicted winner: var(--specific-earlier). (0,3,0) beats (0,1,0) despite order.
    expect(resolveBackground(sheet, rowState({ 'data-a': '1', 'data-b': '1' }, false))).toBe(
      'var(--specific-earlier)',
    );
  });

  it('(3) a :hover rule does not apply to an UNHOVERED state', () => {
    const sheet = `
      .row { background: var(--rest); }
      .row:hover { background: var(--hovered); }
    `;
    // Predicted winners: var(--rest) unhovered, var(--hovered) hovered.
    expect(resolveBackground(sheet, rowState({}, false))).toBe('var(--rest)');
    expect(resolveBackground(sheet, rowState({}, true))).toBe('var(--hovered)');
    // ...and with only the hover rule, an unhovered row is painted by nothing.
    expect(resolveBackground('.row:hover { background: var(--hovered); }', rowState({}, false))).toBe(
      null,
    );
  });

  it('(4) the near-miss `.rowMain:hover` is NOT treated as matching the `.row` element', () => {
    const sheet = `
      .row { background: var(--row); }
      .rowMain:hover { background: var(--inner-button); }
    `;
    // Predicted winner: var(--row). A substring match on `.row` would pick the
    // later `.rowMain:hover` and report var(--inner-button).
    expect(resolveBackground(sheet, rowState({}, true))).toBe('var(--row)');
  });
});

describe('a hovered row paints the swimlane, not the inner button (C7)', () => {
  const HOVER = 'var(--oc-bg-hover)';
  const SELECTED = 'var(--oc-bg-selected)';

  it('C7-inner: no hover background on `.rowMain`', () => {
    const rules = topLevelRules(railCss);
    const innerHover = rules.filter((r) =>
      r.selectors.some((s) => /\.rowMain(?![\w-])/.test(s) && s.includes(':hover')),
    );
    expect(rules.some((r) => r.selectors.includes('.rowMain:hover'))).toBe(false);
    expect(innerHover.filter((r) => /(^|;)\s*background\s*:/.test(r.body))).toEqual([]);
  });

  it('C7-calf: an unselected Calf, hovered, resolves to --oc-bg-hover', () => {
    expect(resolveBackground(railCss, rowState({}, true))).toBe(HOVER);
    // Unhovered it is still painted by no `.row` rule — the rail shows through.
    expect(resolveBackground(railCss, rowState({}, false))).toBe(null);
  });

  it('C7-matriarch: an unselected Matriarch, hovered, resolves to --oc-bg-hover', () => {
    expect(resolveBackground(railCss, rowState({ 'data-matriarch': 'true' }, true))).toBe(HOVER);
    expect(resolveBackground(railCss, rowState({ 'data-matriarch': 'true' }, false))).toBe(
      'var(--oc-bg-raised)',
    );
  });

  it('C7-selected-primary: a primary-pane Calf stays selected while hovered', () => {
    expect(resolveBackground(railCss, rowState({ 'data-in-primary-pane': 'true' }, true))).toBe(
      SELECTED,
    );
  });

  it('C7-selected-follower: a follower-pane Calf stays selected while hovered', () => {
    expect(resolveBackground(railCss, rowState({ 'data-in-follower-pane': 'true' }, true))).toBe(
      SELECTED,
    );
  });
});

describe("a hovered selected Matriarch moves to its own surface (C6)", () => {
  it('C6-primary: a primary-pane Matriarch, hovered, resolves to --oc-bg-selected', () => {
    const attrs = { 'data-matriarch': 'true', 'data-in-primary-pane': 'true' };
    expect(resolveBackground(railCss, rowState(attrs, true))).toBe('var(--oc-bg-selected)');
    // Unhovered it is unchanged (criterion 4 above): --oc-bg-hover.
    expect(resolveBackground(railCss, rowState(attrs, false))).toBe('var(--oc-bg-hover)');
  });

  it('C6-follower: a follower-pane Matriarch, hovered, resolves to --oc-bg-selected', () => {
    const attrs = { 'data-matriarch': 'true', 'data-in-follower-pane': 'true' };
    expect(resolveBackground(railCss, rowState(attrs, true))).toBe('var(--oc-bg-selected)');
    expect(resolveBackground(railCss, rowState(attrs, false))).toBe('var(--oc-bg-hover)');
  });
});

describe('row hover rules set background and nothing else (C67-background-only)', () => {
  /** A selector targeting the `.row` element itself (not `.rowMain`, `.rowAction`) with `:hover`. */
  const isRowHover = (selector: string): boolean =>
    /\.row(?![\w-])/.test(selector) && selector.includes(':hover');

  it('validates its predicate: `.row:hover` matches, `.rowAction:hover` does not', () => {
    expect(isRowHover(".row[data-in-primary-pane='true']:hover")).toBe(true);
    expect(isRowHover('.row:hover')).toBe(true);
    expect(isRowHover('.rowAction:hover')).toBe(false);
    expect(isRowHover('.rowMain:hover')).toBe(false);
  });

  it('every `.row` hover rule declares `background` only, so it cannot overpaint a box-shadow edge or ring', () => {
    const hoverRules = topLevelRules(railCss).filter((r) => r.selectors.some(isRowHover));
    // Plain hover, two selected-Calf holds, two selected-Matriarch surfaces.
    expect(hoverRules.length).toBe(5);
    for (const rule of hoverRules) {
      const properties = [...rule.body.matchAll(/([-\w]+)\s*:/g)].map((m) => m[1] as string);
      expect({ selectors: rule.selectors, properties }).toEqual({
        selectors: rule.selectors,
        properties: ['background'],
      });
    }
  });
});

describe('the lane status dot never shrinks in its flex row (C8)', () => {
  it('declares `flex: none` on `.dot`, as `.statusDot` does in PodBar.module.css', () => {
    expect(block('.dot')).toMatch(/flex:\s*none/);
  });
});
