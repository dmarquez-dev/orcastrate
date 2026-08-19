/**
 * CONTRACT — Renderer styling seam. Frozen at Gate 2.
 *
 * Boundary between T3 (which writes the single global stylesheet defining
 * every token below) and T4, T6, T7 (which write CSS Modules that CONSUME
 * them). Four tasks styling one window concurrently, with no shared
 * stylesheet to edit, is the only reason this file exists.
 *
 * RESOLVED BEFORE DECOMPOSITION (resolved-unknowns U1): the repo has no
 * styling convention, no `.css` file, no CSS-in-JS dependency and no Tailwind.
 * This session picks PLAIN CSS MODULES — `electron-vite` supports them with no
 * config, and no runtime dependency is added. Adding a styling library is a
 * contract change.
 *
 * THE RULES, which is what a peer actually needs from this file:
 *
 * 1. T3 writes `src/renderer/src/styles/tokens.css` and
 *    `src/renderer/src/styles/global.css`, imported once from `main.tsx`.
 *    Nobody else writes a global stylesheet.
 * 2. Every other task writes `*.module.css` files INSIDE ITS OWN DIRECTORY,
 *    and styles nothing outside its own components.
 * 3. No component hardcodes a color, a font stack, or a spacing value. Every
 *    one comes from `var(--oc-…)`. This is enforceable by grep and T8 enforces
 *    it.
 * 4. No inline `style` objects except for genuinely dynamic values a CSS
 *    variable cannot carry (a computed split-pane width, a progress fraction).
 *    The placeholder `App.tsx` is inline-styled and is REPLACED, not extended.
 * 5. `!important` is not used anywhere. There is no cascade to fight; four
 *    module scopes cannot collide.
 *
 * These are CSS custom property names, not TypeScript values. This file
 * exports them as string constants so a component can reference one from
 * script when it truly must, and so T8 can assert `tokens.css` defines every
 * one of them.
 */

/**
 * Every token `tokens.css` must define on `:root`. A component may use any
 * token here and no other. A component needing a token that does not exist
 * STOPS AND ESCALATES rather than inventing a literal — an invented literal is
 * invisible until the theme changes and then it is everywhere.
 */
export const TOKENS = {
  // Surfaces, back to front.
  bgApp: '--oc-bg-app',
  bgPanel: '--oc-bg-panel',
  bgRaised: '--oc-bg-raised',
  bgHover: '--oc-bg-hover',
  bgSelected: '--oc-bg-selected',

  // Text.
  fgPrimary: '--oc-fg-primary',
  fgMuted: '--oc-fg-muted',
  fgInverse: '--oc-fg-inverse',

  // Lines.
  border: '--oc-border',
  borderStrong: '--oc-border-strong',
  focusRing: '--oc-focus-ring',

  // Status. These map to the lexicon (spec 2) and to the two status unions in
  // `events.ts`: Pod `idle|running|waiting|beached`, Lane `running|done|orphaned`.
  statusIdle: '--oc-status-idle',
  statusRunning: '--oc-status-running',
  /** Waiting on the user — including waiting on a permission decision. */
  statusWaiting: '--oc-status-waiting',
  statusDone: '--oc-status-done',
  /** Beached (dead process) and Orphaned (lane open at a turn boundary). */
  statusBeached: '--oc-status-beached',
  statusOrphaned: '--oc-status-orphaned',

  /** The `bypassPermissions` badge. Distinct from every routine status. */
  danger: '--oc-danger',
  dangerBg: '--oc-danger-bg',

  // Spacing scale. Nothing between these steps.
  space1: '--oc-space-1',
  space2: '--oc-space-2',
  space3: '--oc-space-3',
  space4: '--oc-space-4',
  space6: '--oc-space-6',
  space8: '--oc-space-8',

  // Type.
  fontUi: '--oc-font-ui',
  fontMono: '--oc-font-mono',
  textXs: '--oc-text-xs',
  textSm: '--oc-text-sm',
  textMd: '--oc-text-md',
  textLg: '--oc-text-lg',

  radiusSm: '--oc-radius-sm',
  radiusMd: '--oc-radius-md',

  // Layout, so the four regions of spec 5.1 agree on their own geometry
  // without any task measuring another's markup.
  podBarHeight: '--oc-pod-bar-height',
  laneRailWidth: '--oc-lane-rail-width',
  composerMinHeight: '--oc-composer-min-height',
} as const;

/** `cssVar(TOKENS.bgPanel)` -> `"var(--oc-bg-panel)"`. */
export declare function cssVar(token: string): string;

/**
 * The status token for a Pod or Lane status. Defined once so the Pod tab dot
 * and the lane rail row cannot drift into different colors for one state.
 */
export declare function statusToken(
  status: 'idle' | 'running' | 'waiting' | 'beached' | 'done' | 'orphaned',
): string;
