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
  // `events.ts`: Pod `idle|running|waiting|beached|closed`,
  // Lane `running|done|orphaned`.
  statusIdle: '--oc-status-idle',
  statusRunning: '--oc-status-running',
  /** Waiting on the user — including waiting on a permission decision. */
  statusWaiting: '--oc-status-waiting',
  statusDone: '--oc-status-done',
  /** Beached (dead process) and Orphaned (lane open at a turn boundary). */
  statusBeached: '--oc-status-beached',
  statusOrphaned: '--oc-status-orphaned',
  /**
   * AMENDMENT (this session) — the fifth `PodStatus`. Main holds no runner for
   * this Pod. DISTINCT from `statusIdle` by requirement, not by taste:
   * `WorkspaceLayout.test.tsx` asserts every status maps to its own token, so
   * aliasing idle is not available. The value is quiet and inactive and
   * separates from idle by LIGHTNESS as well as hue; the `Closed` label and the
   * `Open` control carry the meaning, and the dot only has to not lie.
   */
  statusClosed: '--oc-status-closed',

  // AMENDMENT (sub-session 2026-08-25-orcastrate-pod-status-and-chrome, T3) —
  // ADDITIONS ONLY, the five `ADDED_TOKENS` of
  // `contracts/renderer-theme-amendment.ts`. Nothing above is renamed,
  // revalued or removed, so no existing component's appearance changes as a
  // side effect.

  /**
   * The fourth `LaneStatus`: the Pod that owns this lane was stopped. It joins
   * the seven `--oc-status-*` tokens above and is covered by the same
   * exhaustiveness and distinctness rules — its value separates from both
   * `statusIdle` and `statusClosed` by hue AND by lightness, so a stopped lane
   * survives greyscale and the distinctness assertion needed no relaxing.
   */
  statusStopped: '--oc-status-stopped',

  /**
   * A NEW FAMILY, deliberately NOT `--oc-status-*`. These name what a CONTROL
   * does; `--oc-status-*` names what a Pod IS. Keeping the families apart is
   * what stops `run` from being read as a status hue and what keeps the
   * `--oc-status-*` distinctness rule meaning what it means. `danger` /
   * `dangerBg` is the same shape one family over and the delete control
   * already consumes exactly that pair, so the three controls end up described
   * the same way. Colour stays the THIRD carrier: the accessible name and the
   * `data-icon` shape carry the meaning, and a consumer must not make hue the
   * only difference between two controls.
   */
  /** Foreground of the run control (Open / Reconnect). Green. */
  actionRun: '--oc-action-run',
  /** Hover surface behind the run control. */
  actionRunBg: '--oc-action-run-bg',
  /** Foreground of the stop control. Yellow. */
  actionStop: '--oc-action-stop',
  /** Hover surface behind the stop control. */
  actionStopBg: '--oc-action-stop-bg',

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

  // AMENDMENT (sub-session 3, T4) — ADDITIONS ONLY. These are the seven
  // `ADDED_TOKENS` of `renderer-panels.ts`. The sub-session 2 backlog predicted
  // them exactly: six renderer directories independently reached for bare
  // `1px`, `0.04em` and `font-weight: 700` because `TOKENS` had nothing to
  // offer, and every reviewer called it a token-set gap rather than a
  // deviation. A form-heavy panel needs all three groups — table rules and
  // input borders, column headings, and the weight contrast that distinguishes
  // a field label from its value. Nothing above is renamed or removed, so no
  // sub-session 2 component is touched by this change.
  borderHairline: '--oc-border-hairline',
  borderThick: '--oc-border-thick',
  trackingTight: '--oc-tracking-tight',
  trackingWide: '--oc-tracking-wide',
  weightRegular: '--oc-weight-regular',
  weightMedium: '--oc-weight-medium',
  weightBold: '--oc-weight-bold',

  // Layout, so the four regions of spec 5.1 agree on their own geometry
  // without any task measuring another's markup.
  podBarHeight: '--oc-pod-bar-height',
  laneRailWidth: '--oc-lane-rail-width',
  composerMinHeight: '--oc-composer-min-height',

  // AMENDMENT (sub-session 3, T4) — the two `ADDED_LAYOUT_TOKENS`. Panel
  // geometry, so the strip and the region agree without either task measuring
  // the other's markup, for the same reason `podBarHeight` exists.
  panelBarHeight: '--oc-panel-bar-height',
  panelMaxWidth: '--oc-panel-max-width',

  // AMENDMENT (sub-session 2026-10-09-orcastrate-theme-contract-decisions, T3)
  // — ADDITIONS ONLY. Nothing above is renamed, revalued, removed or
  // reordered, so no existing component's appearance changes as a side effect.
  //
  // BOTH KEYS CLOSE A TOKEN-SET GAP OF THE EXACT SHAPE THE SUB-SESSION 3
  // AMENDMENT RECORDED ABOVE (`:140-148`): a value that six directories
  // reached for independently because `TOKENS` had nothing to offer, which
  // every reviewer called a gap rather than a deviation. Measured in this
  // session rather than assumed, by
  // `grep -rn "font-weight: *600" src/renderer --include="*.module.css"`.

  /**
   * The weight between `medium` and `bold`, so the ramp reads 400/500/600/700.
   *
   * TEN declarations across FIVE FILES in FOUR DIRECTORIES — `lanes`, `pods`,
   * `shell` and `transcript` — independently wrote a bare `600` because the set
   * offered 400/500/700 and NOTHING BETWEEN, the one step a heading or an
   * emphatic label actually wants. All ten are headings or emphatic labels,
   * which is why one token serves them all rather than two.
   *
   * The decision to add it rather than round those ten to `medium` or `bold`
   * was made deliberately by the user (escalation E1), not rounded by a test
   * author: rounding would have changed shipped pixels in all five files.
   */
  weightSemibold: '--oc-weight-semibold',

  /**
   * A NEW FAMILY, deliberately NOT an `--oc-bg-*`.
   *
   * The `--oc-bg-*` ramp is five surfaces BACK TO FRONT: each one BACKS the
   * content drawn on it. A scrim sits ABOVE all five and VEILS what is behind
   * it. Those are different jobs, and the `--oc-action-*` versus
   * `--oc-status-*` argument at `:97-107` is the precedent — families are kept
   * apart when they mean different things, because collapsing them is what
   * makes a ramp's own rules stop meaning anything.
   *
   * It carries the ALPHA, which is the whole point. Four full-window scrims
   * were `background: var(--oc-bg-app)` — fully opaque, so a dialog HID the
   * window instead of veiling it. `BeachcomberPreviewDialog.module.css`
   * recorded the reason in prose: "the token set has no alpha layer, and
   * inventing one would be a color literal". Correct at the time, and this key
   * is the answer to it. The value derives its hue from `--oc-bg-app` through
   * `color-mix` and adds only the alpha, so NO NEW COLOUR LITERAL enters the
   * token set — see `tokens.css`.
   */
  overlayScrim: '--oc-overlay-scrim',
} as const;

/** `cssVar(TOKENS.bgPanel)` -> `"var(--oc-bg-panel)"`. */
export declare function cssVar(token: string): string;

/**
 * The status token for a Pod or Lane status. Defined once so the Pod tab dot
 * and the lane rail row cannot drift into different colors for one state.
 */
export declare function statusToken(
  status:
    | 'idle'
    | 'running'
    | 'waiting'
    | 'beached'
    | 'closed'
    | 'done'
    | 'orphaned'
    | 'stopped',
): string;
