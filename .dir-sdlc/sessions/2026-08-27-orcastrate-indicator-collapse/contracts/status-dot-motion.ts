/**
 * CONTRACT — The collapsed status dot's motion. Frozen at Gate 2.
 *
 * Boundary between T1 (Pod tab: `pods/PodBar.module.css`) and T2 (lane rail:
 * `lanes/LaneRail.module.css`), which run CONCURRENTLY and must produce the
 * same motion without a shared file to edit, and between both of them and T3,
 * which asserts after the fact that they did not drift.
 *
 * WHY THERE IS NO SHARED STYLESHEET — this is the design decision of the
 * session, and it is settled by measurement, not by preference.
 *
 *   The brief's original shape was one `@keyframes` in `styles/global.css`
 *   applied from both CSS Modules. The orchestrator PROBED that before
 *   decomposition (session log, 2026-08-27T12:40Z): `global.css` emitted the
 *   plain `@keyframes ocProbePulse`, while the module rule emitted
 *   `animation: _ocProbePulse_ijqny_1`. Vite hashes an animation name used
 *   inside a `*.module.css` even when no local `@keyframes` of that name
 *   exists, so a module referencing a global keyframe points at a name that
 *   does not exist and the animation SILENTLY NEVER RUNS. jsdom applies no
 *   stylesheet, so no suite in this repository can catch that.
 *
 *   The case that DOES work is the one already shipping: a `@keyframes`
 *   defined in the same `*.module.css` that references it — which is exactly
 *   what `activity/WorkingIndicator.module.css` does today, and its animation
 *   demonstrably runs. This contract therefore mandates PER-MODULE keyframes,
 *   pinned to identical text, with T3's drift test standing in for the shared
 *   file that cannot exist.
 *
 * WHY NOT A GLOBAL UTILITY CLASS. `styles/global.css` carries a frozen scope
 * rule — its own header comment and `contracts/renderer-theme.ts` rules 1 and
 * 2 — that it holds NO component-specific selector and styles the document,
 * the mount root and the cross-cutting focus affordance and nothing else. A
 * motion utility applied to two named component elements is a fourth,
 * component-specific thing; admitting it is a contract change. It also loses
 * on mechanics: an unhashed global class is invisible to the `*.module.css`
 * ambient declaration in `styles/css.d.ts`, so a component would have to spell
 * the literal string in TSX. Declined on both grounds. See the architect's
 * Gate 2 report for the ranked options if the user wishes to overrule.
 *
 * These are CSS declarations, not TypeScript values. This file exports them as
 * string constants so the three tasks have ONE written spelling to agree on
 * without a channel between them.
 *
 * THIS FILE IS NOT COPIED INTO `src/`. Unlike `renderer-theme.ts` it names no
 * runtime value any component imports, and T3's drift test RE-TYPES the pinned
 * strings rather than importing them — deliberately, and for the reason
 * `PodTab.test.tsx` already states about `STATUS_WORD`: "a test that imported
 * the map would pass even if the map itself went blank". A drift test that
 * imported its own expectations could not detect drift.
 */

/**
 * 1. THE KEYFRAME NAME.
 *
 * Both modules declare `@keyframes` under THIS name. Vite hashes it per file,
 * so the two emitted names differ (`_ocStatusPulse_<hashA>_n` and
 * `_ocStatusPulse_<hashB>_n`) and cannot collide. Differing hashes are
 * EXPECTED and are not drift; the declaration text is what must match.
 *
 * Renamed from `ocWorkingPulse` because the mark it drives is no longer a
 * separate "working indicator" — it is the status dot itself.
 */
export const PULSE_KEYFRAME_NAME = 'ocStatusPulse';

/**
 * 2. THE KEYFRAME BODY, pinned verbatim.
 *
 * Carried forward unchanged from `activity/WorkingIndicator.module.css`, so
 * the collapse changes WHERE the motion is drawn and nothing about HOW it
 * moves. Opacity only: no transform, no scale, no colour, so the rule can
 * never override a consumer's hue or shape.
 *
 * T3 compares both files' keyframe bodies against this string after
 * whitespace normalisation (collapse runs of whitespace to one space, trim).
 */
export const PULSE_KEYFRAME_BODY = `
  0%,
  100% {
    opacity: 0.35;
  }

  50% {
    opacity: 1;
  }
`;

/**
 * 3. THE ANIMATION SHORTHAND TAIL, pinned verbatim.
 *
 * Each module writes `animation: <PULSE_KEYFRAME_NAME> <PULSE_ANIMATION_TAIL>`
 * on its running selector. Duration, easing and iteration count are carried
 * forward unchanged from `WorkingIndicator.module.css`.
 *
 * `1.4s` is a bare time, not a bare length. The existing styles tests forbid
 * bare `px|rem|em|pt` and no `--oc-motion-*` duration token exists in
 * `styles/tokens.css` (checked by grep for `motion|duration`: no match), so a
 * literal is the only available spelling and inventing a token would be a
 * `renderer-theme.ts` change.
 */
export const PULSE_ANIMATION_TAIL = '1.4s ease-in-out infinite';

/**
 * 4. THE SELECTOR THAT CARRIES THE ANIMATION, per surface.
 *
 * The two selectors DIFFER, and that is deliberate: each surface already keys
 * its dot's hue off `data-status` in its own way, and the motion rides the
 * same attribute rather than introducing a new one. No new markup, no new
 * class, no new test id on either surface.
 *
 * THE ATTRIBUTE IS THE SEAM, NOT A CLASS. Under Vitest, `*.module.css`
 * resolves to a blanked module and class names do not survive — the docblocks
 * of `pods/PodBar.styles.test.ts` and `activity/WorkingIndicator.styles.test.ts`
 * both state this, and every existing dot assertion in `PodTab.test.tsx` and
 * `LaneRail.test.tsx` reaches the element by `querySelector('[data-status]')`
 * rather than by class. A jsdom suite can therefore observe the ATTRIBUTE and
 * never the class, which is why the animation is keyed to the attribute and
 * why the animation's existence is proved by the stylesheet and the build
 * rather than by jsdom.
 */
export const PULSE_SELECTOR = {
  /** `pods/PodBar.module.css` — the dot itself carries `data-status`. */
  podTab: ".statusDot[data-status='running']",
  /** `lanes/LaneRail.module.css` — the enclosing `.status` carries it. */
  laneRow: ".status[data-status='running'] .dot",
} as const;

/**
 * 5. THE REDUCED-MOTION GUARANTEE — re-homed from
 * `activity/WorkingIndicator.styles.test.ts`, which is deleted by T3.
 *
 * Each module carries a `@media (prefers-reduced-motion: reduce)` block that
 * sets `animation: none` ON THE SAME SELECTOR that carries the animation, and
 * changes NOTHING ELSE.
 *
 * A stated system preference wins over the MOTION but never over the SIGNAL.
 * The dot keeps its size, its shape and its status hue; only the animation
 * stops. The guard may not introduce `display: none`, `visibility: hidden` or
 * `opacity: 0` — a dot that vanished here would take the affordance away from
 * exactly the users most likely to need it.
 *
 * Both T1 and T2 own a copy of this guard, and each proves it in its OWN
 * styles test. T3 proves the two copies agree.
 */
export const REDUCED_MOTION_QUERY = '@media (prefers-reduced-motion: reduce)';
export const REDUCED_MOTION_DECLARATION = 'animation: none';

/**
 * 6. WHAT A CONSUMER MAY NOT DO.
 *
 * - It may NOT reference a `@keyframes` declared in any other file. That is
 *   the falsified shape; it emits a hashed name that resolves to nothing.
 * - It may NOT set `animation` on the dot's BASE rule. Only the running
 *   selector animates, so a non-running dot inherits no motion to cancel.
 * - It may NOT hardcode a colour, and it may use only tokens named in the
 *   frozen `TOKENS` map of `contracts/renderer-theme.ts`. Both files' styles
 *   tests already assert this and neither assertion is relaxed.
 * - It may NOT use `!important` and may NOT remove the focus ring.
 * - It may NOT add an `aria-live` region, an accessible name, or any text to
 *   the dot. The dot stays `aria-hidden`/textless on both surfaces; motion is
 *   the THIRD carrier of meaning, after the status word and the status shape.
 *   The Pod tab's `srOnly` sentence still opens with `STATUS_LABEL[status]`;
 *   the lane row still renders `LANE_STATUS_LABEL[row.status]`.
 *
 * ERROR CASE — what happens when this contract is violated, and how it
 * surfaces. There is exactly one failure mode that no jsdom suite can see: the
 * animation name failing to resolve, leaving a dead animation and a dot that
 * never moves. It surfaces ONLY in the emitted bundle. The proof is therefore
 * a build, not an assertion:
 *
 *     node "C:/Users/dmarq/Development/Repos/orcastrate/node_modules/electron-vite/bin/electron-vite.js" build
 *
 * and then reading the emitted renderer CSS under `out/renderer/assets/`. The
 * check that must pass, for EACH of the two modules independently: the file
 * contains `@keyframes _ocStatusPulse_<hash>` and an `animation:` declaration
 * naming THAT SAME `_ocStatusPulse_<hash>` string. A hash present on one side
 * and absent on the other is the falsified shape and is a BLOCKING failure —
 * stop and escalate rather than improvising a second mechanism.
 *
 * A consumer needing any of the above changed STOPS AND ESCALATES. Editing
 * this file unilaterally desyncs the peer that is styling the other surface
 * right now.
 */
export type StatusDotMotionSurface = keyof typeof PULSE_SELECTOR;
