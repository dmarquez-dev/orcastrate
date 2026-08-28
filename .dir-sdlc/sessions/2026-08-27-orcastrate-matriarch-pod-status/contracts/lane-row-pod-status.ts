/**
 * CONTRACT — the Matriarch lane row reports the POD's status.
 * Session 2026-08-27-orcastrate-matriarch-pod-status. Frozen at Gate 2.
 *
 * Boundary between:
 *   - T1  AMENDS the frozen `src/renderer/src/contracts/renderer-state.ts`.
 *         It is the only task that writes that file.
 *   - T3  PRODUCER. `state/workspace-provider.tsx` populates the new field.
 *   - T4  CONSUMER. `lanes/LaneRow.tsx` + `lanes/LaneRail.module.css` render it.
 *   - T5  asserts the joined behaviour end to end.
 *
 * ------------------------------------------------------------------------
 * 0. THE DEFECT, AND WHAT IT IS NOT
 * ------------------------------------------------------------------------
 * Two unions spell one word differently.
 *
 *   `PodStatus.running`  — an ACTIVITY flag. `main/pod/pod-runner.ts:426` sets
 *                          it on `send()` (turn start); `:272` clears it to
 *                          `idle`, or to `waiting` when permissions are
 *                          pending, at turn end.
 *   `LaneStatus.running` — a LIFETIME flag, ENFORCED BY THE DATABASE.
 *                          `main/store/schema.ts:355` states
 *                          `CHECK ((status = 'running') = (ended_at IS NULL))`.
 *                          A lane is `running` iff it has not ended.
 *
 * The Matriarch lane is created `running` at session start
 * (`main/lane/lane-router.ts:142`) and ends only when the Pod stops, so its row
 * has read `running` — and, since the indicator collapse, PULSED — for the
 * Pod's entire life.
 *
 * `LaneStatus` DOES NOT CHANGE IN THIS SESSION, and neither does the `CHECK`,
 * nor anything in `src/main/**`. Making the lifetime flag mean "working right
 * now" would rewrite a schema invariant and every consumer of it. This is a
 * renderer-side presentation change and nothing else.
 *
 * NOT A REGRESSION. `git show 595247d^:src/renderer/src/lanes/LaneRow.tsx`
 * line 129 reads `<WorkingIndicator active={row.status === 'running'} …/>` —
 * the retired bar carried the identical condition. No task may be framed as
 * fixing a recent breakage.
 *
 * ------------------------------------------------------------------------
 * 1. THE SHAPE — A DISTINCT NULLABLE FIELD, NOT A WIDENED `status`
 * ------------------------------------------------------------------------
 * `LaneRowVm` (`contracts/renderer-state.ts:293`) gains ONE field:
 *
 *     /** … *\/
 *     podStatus: PodStatus | null;
 *
 * `status: LaneStatus` KEEPS ITS EXACT TYPE AND MEANING. It is not widened, not
 * renamed, not made optional.
 *
 * WHY NOT A WIDENED UNION (`status: LaneStatus | PodStatus`). The row's status
 * span carries its value into an HTML attribute that BOTH the stylesheet and
 * the suites key off (`LaneRail.module.css` `.status[data-status='…']`;
 * `row.querySelector('[data-status]')` in `LaneRail.test.tsx:479`,
 * `stopped-lane.test.tsx:129`, `orphaned-lane.test.tsx:110`). A widened union
 * puts two vocabularies into one attribute, and they COLLIDE on the literal
 * `'running'` — the one value where the two unions disagree about what they
 * mean. `.status[data-status='running'] .dot` would then match both a Pod that
 * is streaming and a lane that merely has not ended, which is the defect
 * itself, re-encoded in CSS. A distinct field keeps the collision impossible by
 * construction and leaves every existing lane-status rule and query untouched.
 *
 * `null` is not "unknown". It means: THIS ROW REPORTS ITS LANE STATUS. Every
 * row for which the state layer has not decided otherwise carries `null`, and
 * that is the whole of today's behaviour, preserved.
 *
 * `PodStatus` is already imported by `renderer-state.ts` (its import block
 * names it for `PodTabVm`), so T1 adds a field and its doc-comment and nothing
 * else. T1 MUST NOT touch any other member of any other interface in that file.
 *
 * ------------------------------------------------------------------------
 * 2. WHO DECIDES — THE DERIVATION RULE (T3)
 * ------------------------------------------------------------------------
 * The decision lives in `deriveLaneRail`, in ONE place, so no consumer can
 * forget it. `deriveSession` (`workspace-provider.tsx:189`) already holds
 * `pod?.status` and already passes it to `deriveComposer` at `:207` with the
 * fallback `?? 'closed'`. It gains a second reader:
 *
 *     lanes: deriveLaneRail(runtime, nowMs, pod?.status ?? 'closed'),
 *
 * and `deriveLaneRail(runtime, nowMs, podStatus: PodStatus)` sets, per row:
 *
 *     podStatus: isMatriarch && lane.endedAt === null ? podStatus : null,
 *
 * THE THREE CLAUSES, each load-bearing:
 *
 *   `isMatriarch`          — CALVES ARE UNTOUCHED. A Calf is created when
 *                            dispatched and ends when its subagent finishes,
 *                            and a subagent never waits on user input, so a
 *                            `running` Calf genuinely is working. Every Calf
 *                            row carries `podStatus: null`, always, whatever
 *                            the Pod is doing.
 *
 *   `lane.endedAt === null` — TERMINAL LANE STATUS WINS. Once the Matriarch's
 *                            lane has ended, `Stopped` / `Done` / `Orphaned`
 *                            render with today's hue, today's word and today's
 *                            frozen `elapsedMs`, unchanged. A terminal lane
 *                            state is a real fact with an `endedAt` behind it
 *                            and must not be overwritten by the Pod's status.
 *                            The user settled this explicitly at Gate 1.
 *                            `endedAt === null` is used rather than
 *                            `status === 'running'` because the schema `CHECK`
 *                            makes them the same predicate and `endedAt` is the
 *                            one that says WHY.
 *
 *   `?? 'closed'`          — the same fallback `deriveComposer` already takes.
 *                            A Pod the state layer cannot find is not open. If
 *                            the Pod reads `closed` or `beached` while the
 *                            Matriarch's lane is still open, the row reports
 *                            that: the Pod's status governs an open lane
 *                            unconditionally, and a row reading `Closed` beside
 *                            a Pod tab reading `Closed` is the agreement this
 *                            session exists to produce.
 *
 * NO NEW PLUMBING. No new IPC channel, no new push, no change to
 * `PodRuntimeState`, no second clock. `useElapsedClock` is untouched.
 *
 * ------------------------------------------------------------------------
 * 3. HOW IT RENDERS — TWO MUTUALLY EXCLUSIVE ATTRIBUTES (T4)
 * ------------------------------------------------------------------------
 * `LaneRow.tsx` renders ONE status span, exactly as today, carrying EXACTLY ONE
 * of two attributes — never both, never neither:
 *
 *   `podStatus === null`  ->  `data-status={row.status}`      (lane vocabulary)
 *   otherwise             ->  `data-pod-status={row.podStatus}` (pod vocabulary)
 *
 * `[data-status]` therefore continues to select exactly one element per row and
 * continues to hold only `LaneStatus` values, so every existing query and every
 * existing CSS rule keeps working with no edit. A row governed by the Pod
 * carries no `data-status` at all, which is what stops the two vocabularies
 * cascading onto one dot.
 *
 * THE WORD. No new status vocabulary may be invented. The label is
 * `LANE_STATUS_LABEL[row.status]` on the lane branch — the literal
 * `LANE_STATUS_LABEL[row.status]` MUST survive in the source, because
 * `LaneRow.source.test.ts:65` asserts it as text — and `POD_STATUS_LABEL[…]`
 * on the Pod branch, imported from the module `pod-status-label.ts` defines.
 *
 * THE HUE. Reuse, do not duplicate. The Pod branch sets the inline custom
 * property the Pod tab already uses:
 *
 *     style={{ '--pod-status-color': `var(${statusToken(podStatus)})` }}
 *
 * `statusToken` is `shell/contract-runtime.ts`'s, whose `AnyStatus` already
 * covers both unions, and it resolves to the same `--oc-status-*` token the Pod
 * tab paints with. No `--oc-status-*` token is recoloured and no new token is
 * introduced. The lane branch keeps its existing static hue rules verbatim.
 *
 * THE SHAPE, reusing `PodBar.module.css`'s vocabulary value for value — same
 * shape, same meaning, on the same five `PodStatus` values:
 *
 *     [data-pod-status]           filled circle at `--pod-status-color`,
 *                                 hairline border in the same colour (base)
 *     [data-pod-status='running'] pulses: `ocStatusPulse 1.4s ease-in-out
 *                                 infinite` — the sheet's OWN keyframe
 *     [data-pod-status='idle']    hollow ring: `background: transparent`,
 *                                 `border-width: var(--oc-border-thick)`
 *     [data-pod-status='waiting'] filled, plus the halo
 *                                 `0 0 0 2px var(--oc-bg-panel),
 *                                  0 0 0 3px var(--pod-status-color)`
 *     [data-pod-status='beached'] square: `border-radius: 0`
 *     [data-pod-status='closed']  flat bar: `height: var(--oc-border-thick)`,
 *                                 `align-self: center`, `border-radius: 0`
 *
 * `'running'` ALONE ANIMATES, and NOT `'waiting'`: that state means the Pod is
 * blocked on the USER, it already carries the busiest shape in the set, and
 * animating there would tell the user to wait for a machine that is waiting for
 * them. The base `[data-pod-status]` rule declares NO `animation`, so a
 * non-running dot inherits no motion it would have to cancel.
 *
 * REDUCED MOTION. `.status[data-pod-status='running'] .dot` gets
 * `animation: none` INSIDE the sheet's existing
 * `@media (prefers-reduced-motion: reduce)` block. A stated preference wins
 * over the MOTION, never over the SIGNAL: the dot keeps its size, its shape and
 * its hue. No `display: none`, no `visibility: hidden`, no `opacity: 0`.
 *
 * THE ACCESSIBILITY FLOOR IS UNCHANGED AND NON-NEGOTIABLE: colour is never the
 * only carrier. The word is in the same render, the shape is the second
 * carrier, the pulse is the third. The dot stays `aria-hidden` and textless.
 *
 * `LaneRow` STAYS PRESENTATIONAL AND CLOCKLESS. It takes data and callbacks and
 * nothing else. `LaneRow.source.test.ts` forbids `setInterval`, `setTimeout`,
 * `requestAnimationFrame`, `Date.now`, `useState`, `useEffect` and `useRef` in
 * this file; none of them is needed and none may be added.
 *
 * ------------------------------------------------------------------------
 * 4. THE KEYFRAME RULE, WHICH IS A MEASUREMENT AND NOT A PREFERENCE
 * ------------------------------------------------------------------------
 * A `*.module.css` CANNOT reference a `@keyframes` declared in a global
 * stylesheet. Vite hashes the animation name inside the module even when no
 * local keyframe of that name exists, so the reference resolves to nothing and
 * the animation SILENTLY NEVER RUNS. jsdom applies no stylesheet and Vitest
 * blanks `*.module.css`, so no suite in this repository can observe it.
 *
 * `LaneRail.module.css` already declares its own `@keyframes ocStatusPulse`.
 * T4 REFERENCES that existing local keyframe from the new selector and DOES NOT
 * ADD A SECOND ONE — `LaneRail.styles.test.ts` asserts the sheet declares
 * exactly one keyframe, and the drift guard
 * `styles/status-motion.styles.test.ts` pins its body and its
 * `1.4s ease-in-out infinite` tail against `PodBar.module.css`'s copy.
 *
 * THE DRIFT GUARD IS EXPECTED TO PASS UNMODIFIED, and that expectation is
 * stated here so it can be falsified rather than assumed: its keyframe-body and
 * animation-tail regexes match the first occurrence, and its `blockBody` helper
 * tolerates further nested rules inside the reduced-motion block. T4 runs it
 * and reports the observed result either way; if it fails, T4 updates it in the
 * same task, because a guard changed apart from the sheet it guards is not a
 * guard.
 *
 * ------------------------------------------------------------------------
 * 5. THE THREE EXISTING ASSERTIONS THIS CHANGE BREAKS (T4 must fix all three)
 * ------------------------------------------------------------------------
 * Each was read out of the worktree, not predicted:
 *
 *   a. `LaneRail.styles.test.ts:274` —
 *      `expect(selectorsDeclaring(outsideReducedMotion, /animation:/))
 *         .toEqual([PULSE_SELECTOR])`
 *      pins the animating selector list to exactly one entry. The new
 *      `[data-pod-status='running']` rule is a second. The list is EXTENDED to
 *      both selectors; it is NOT relaxed to a `toContain`, because the point of
 *      the assertion is that nothing else animates.
 *
 *   b. `LaneRail.styles.test.ts:65-71` — `references only tokens that the
 *      frozen TOKENS map names` runs `tokensIn` over the WHOLE sheet.
 *      `--pod-status-color` is an inline custom property, not a theme token, so
 *      it is not in `TOKENS` and the test fails. It is allow-listed EXACTLY as
 *      `PodBar.styles.test.ts:292` already allow-lists it there, with the same
 *      stated reason: set inline from `statusToken(status)`, never a token.
 *
 *   c. `lanes/test-fixtures.ts` `makeRow` builds a `LaneRowVm` literal and
 *      stops compiling when the interface gains a required field. It gains
 *      `podStatus: null` as its DEFAULT — which is what keeps every existing
 *      suite green and unedited, and makes the new field opt-in per test.
 *
 * `LaneRail.test.tsx`, `stopped-lane.test.tsx` and `orphaned-lane.test.tsx`
 * pass unmodified under that default. If any does not, T4 owns them and fixes
 * them, and says which and why.
 *
 * ------------------------------------------------------------------------
 * 6. OUT OF SCOPE — do not widen the change
 * ------------------------------------------------------------------------
 *   - `LaneStatus`, the schema `CHECK`, and everything under `src/main/**`.
 *   - Calf row rendering.
 *   - The `--oc-status-stopped` vs `--oc-status-waiting` hue measurement, which
 *     stays with the deferred palette-wide pass.
 *   - The row's separate "Awaiting permission" line, which is driven by
 *     `awaitingPermission` and is NOT touched here even when the Pod reads
 *     `waiting`. Whether the two marks should merge is a design question this
 *     session did not ask.
 *   - The two `2026-08-27` advisories in `.dir-sdlc/backlog.md`.
 */

export {};
