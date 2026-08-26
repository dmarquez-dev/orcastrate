/**
 * CONTRACT — the working/thinking status affordance. Frozen at Gate 2.
 *
 * Boundary between T4 (writes the component and its stylesheet, and owns
 * `src/renderer/src/activity/**` alone) and T5 / T6, which MOUNT it on the Pod
 * tab and on the lane rail row respectively. Two mount sites in two tasks
 * importing one component is the reason this file exists.
 *
 * THE FINDING, in the user's words: "the only way that I can tell the session
 * isn't stalled is if something visual like a new subagent spawning occurs."
 *
 * THE HALF THAT IS SELF-INFLICTED, stated plainly because the fix turns on it:
 * `thinking` is a member of `PLUMBING_EVENT_TYPES`
 * (`renderer/src/transcript/transcript-filter.ts`) and has been hidden by
 * default since `2026-08-21-orcastrate-transcript-readability`. That filter was
 * the right call for the 53-of-109-events noise problem it was built for, but
 * `thinking` was the one plumbing type carrying LIVENESS, and hiding it removed
 * the only in-transcript signal that work was happening.
 */

// ===========================================================================
// 1. What this is NOT
// ===========================================================================

/**
 * DO NOT FIX THIS BY MOVING `thinking` OUT OF `PLUMBING_EVENT_TYPES`. Ruled out
 * at Gate 1. It reintroduces exactly the noise the filter exists to remove, and
 * thinking blocks are long.
 *
 * `transcript-filter.ts`, `CONVERSATION`, `PLUMBING`, `DIAGNOSTIC` and the
 * partition guard over them are OUT OF SCOPE for this session and are in no
 * task's ownership set. The wanted thing is a STATUS AFFORDANCE, not a
 * transcript row.
 *
 * It is also not a new push, a new event type, a new store field, or a new
 * piece of state. Everything it needs is already on the view models:
 * `LaneRowVm` carries `status`, `elapsedMs` and `unreadEventCount`;
 * `PodTabVm` carries `status`. `PodStatus`' own contract says `'running'` means
 * "main holds a live runner and a turn is streaming", and `LaneStatus`'
 * `'running'` means the lane is open — those are the liveness facts, already
 * derived, already pushed.
 */
export const OUT_OF_SCOPE = ['src/renderer/src/transcript/transcript-filter.ts'] as const;

// ===========================================================================
// 2. NO TIMER. NO CLOCK. NO JS ANIMATION.
// ===========================================================================

/**
 * THE HARD CONSTRAINT, and the one an animated indicator most easily violates.
 *
 * `LaneRow.tsx:30` states it: "NO TIMER, NO CLOCK. `elapsedMs` arrives on the
 * view model already computed by the state layer, and this component only
 * formats it. That is what makes a `done` lane's row stop re-rendering: nothing
 * in this subtree schedules work."
 *
 * The provider's one clock is `useElapsedClock(hasRunningLane)`
 * (`state/workspace-provider.tsx:108,134-145`) — a single interval that ticks
 * ONLY while some lane is running and stops when none is. An indicator that
 * schedules its own `setInterval`, `requestAnimationFrame` loop, or
 * `useState` tick would re-render every finished row forever and would keep
 * running after the last lane ended.
 *
 * THEREFORE:
 *   - The animation is CSS. A `@keyframes` rule in the component's own
 *     `*.module.css`, applied by a class. No JS drives a frame, ever.
 *   - The component contains NO `setInterval`, NO `setTimeout`, NO
 *     `requestAnimationFrame`, NO `Date.now()`, NO `useEffect` that schedules
 *     anything.
 *   - It is a pure function of its props. It renders `null` when not active,
 *     so an inactive row mounts nothing that could animate.
 *
 * This is mechanically checkable and must be asserted, not asserted-about: the
 * component's source, read as text, contains none of those four names.
 */
export const NO_TIMER_NO_CLOCK = true;

/**
 * `prefers-reduced-motion: reduce` MUST disable the animation and leave a
 * static, still-visible mark. An indicator that vanishes under reduced motion
 * takes the signal away from the users most likely to need it; one that keeps
 * animating ignores a stated system preference.
 */
export const REDUCED_MOTION_FALLBACK = 'static mark, no animation';

// ===========================================================================
// 3. The component
// ===========================================================================

/**
 * `src/renderer/src/activity/WorkingIndicator.tsx`.
 *
 * PRESENTATIONAL. It takes data and nothing else — no store, no hook, no
 * context, no `useWorkspace()`. It does not know whether it is on a tab or in a
 * rail row, which is what lets two tasks mount it without coordinating.
 */
export interface WorkingIndicatorProps {
  /**
   * Whether work is in flight. The MOUNT SITE decides this from state it
   * already has; the component never derives it. `false` renders `null`.
   */
  active: boolean;
  /**
   * Visual weight. `'dot'` is the compact form for a dense surface (a Pod tab
   * beside a status dot); `'bar'` is the wider form for a surface with room (a
   * rail row's meta line). Two named sizes, not a free length, so the two mount
   * sites cannot drift into two bespoke indicators.
   */
  size: 'dot' | 'bar';
}

/**
 * ACCESSIBILITY: THE ANIMATION CARRIES NOTHING BY ITSELF.
 *
 * The rendered element is `aria-hidden="true"` and contributes NO accessible
 * text. It is the third carrier, after the status word and the status shape —
 * the same rule colour answers to everywhere else in this app.
 *
 * The consequence is a REQUIREMENT ON THE MOUNT SITE, not a nicety: a site may
 * only mount this where the same state is ALREADY carried in text. Both sites
 * qualify today and neither may lose it:
 *   - `LaneRow` renders `LANE_STATUS_LABEL[row.status]` beside the status dot.
 *   - `PodTab` renders an `a11y.srOnly` sentence beginning `STATUS_LABEL[status]`.
 *
 * IT ADDS NO LIVE REGION. An `aria-live` announcement that fires every time a
 * turn starts would narrate the entire session. The status word is already in
 * the accessible name; a screen-reader user reaches it on demand.
 */
export const INDICATOR_IS_ARIA_HIDDEN = true;

/**
 * A test id so both mount sites' suites can assert presence and absence without
 * matching a class name. NOT in the frozen `TEST_IDS`: that object's own note
 * permits an id a component adds for its own use as long as it does not
 * collide, and this one collides with nothing.
 *
 * Rendered LITERALLY, with no suffix. The enclosing row or tab disambiguates
 * it, which is the pattern `laneRowUnread` and `laneRowSteer` already use.
 */
export const WORKING_INDICATOR_TEST_ID = 'working-indicator';

// ===========================================================================
// 4. The two mount sites
// ===========================================================================

/**
 * LANE RAIL ROW — `renderer/src/lanes/LaneRow.tsx`, inside the `.meta` line,
 * adjacent to the status word.
 *
 *     <WorkingIndicator active={row.status === 'running'} size="bar" />
 *
 * `row.status === 'running'` and nothing else. A `done`, `orphaned` or
 * `stopped` lane renders no indicator, which is what makes the presence of one
 * mean something.
 */
export const LANE_ROW_MOUNT = {
  file: 'src/renderer/src/lanes/LaneRow.tsx',
  activeWhen: "row.status === 'running'",
  size: 'bar',
} as const;

/**
 * POD TAB — `renderer/src/pods/PodTab.tsx`, inside the tab button, adjacent to
 * the status dot.
 *
 *     <WorkingIndicator active={status === 'running'} size="dot" />
 *
 * `status === 'running'` — a turn is streaming — and NOT `'waiting'`, which
 * means the Pod is blocked on the user and is the opposite of "it is still
 * working". `'waiting'` already has the busiest dot shape in the set and the
 * permission badge; adding motion there would tell the user to wait for a
 * machine that is waiting for them.
 */
export const POD_TAB_MOUNT = {
  file: 'src/renderer/src/pods/PodTab.tsx',
  activeWhen: "status === 'running'",
  size: 'dot',
} as const;

// ===========================================================================
// 5. Styling
// ===========================================================================

/**
 * `src/renderer/src/activity/WorkingIndicator.module.css`, and no other
 * stylesheet. Every colour, length, radius and font size comes from a
 * `var(--oc-…)` token named in the frozen `TOKENS` map; no hex, no `rgb()`, no
 * bare `px`, no `!important`, no `outline: none`.
 *
 * It uses ONLY tokens that exist TODAY — `--oc-status-running`, the spacing
 * scale, `--oc-radius-sm`. It requires none of the five tokens
 * `contracts/renderer-theme-amendment.ts` adds, which is why this task depends
 * on nothing and can run first.
 *
 * Cover it with a `WorkingIndicator.styles.test.ts` in the `#?raw` pattern
 * `shell/Panels.styles.test.ts` and `composer/Composer.styles.test.ts` already
 * establish — including their vacuity guard, which is what stops the suite
 * passing against a class-name proxy with no text in it.
 */
export const STYLESHEET = 'src/renderer/src/activity/WorkingIndicator.module.css';
