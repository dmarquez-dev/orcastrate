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
    expect(used.filter((name) => !known.has(name))).toEqual([]);
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
    expect(selectorsDeclaring(outsideReducedMotion, /animation:/)).toEqual([PULSE_SELECTOR]);
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
    expect(selectorsDeclaring(reduced.body, /animation:\s*none/)).toEqual([PULSE_SELECTOR]);
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
    expect(properties).toEqual(['animation']);
  });
});
