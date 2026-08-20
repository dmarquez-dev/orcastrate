/**
 * CONTRACT — Renderer lifecycle state after a restart. AMENDED at Gate 2, then
 * frozen.
 *
 * ---------------------------------------------------------------------------
 * AMENDMENT NOTICE
 * ---------------------------------------------------------------------------
 * Escalation E1 resolved as OPTION 3: `PodStatus` gains `'closed'` and `status`
 * alone is authoritative. There is no `PodView` and no `opened` field on the
 * IPC surface.
 *
 * THIS FILE GOT SMALLER, NOT BIGGER. The first draft's tri-state
 * `OpenedKnowledge = boolean | null` — invented to express "main has not
 * answered yet" — IS DELETED OUTRIGHT. It existed only because openness
 * travelled on a separate field that could arrive later than the Pod row.
 * Under Option 3 openness IS the Pod row: any reply that gives the renderer a
 * Pod gives it the answer in the same object, in the same field, at the same
 * instant. There is no window in which a Pod is known and its openness is not,
 * so there is no third state to represent.
 *
 * That is the compensating simplification for section 6 of
 * `pod-lifecycle.ts`. The cost of Option 3 lands in the schema; the saving
 * lands here.
 *
 * READ `contracts/pod-lifecycle.ts` FIRST, especially its sections 5 and 6.
 * This file is its renderer half and assumes the widened `PodStatus`.
 *
 * Boundary between: T4 (writes the state layer — `store.ts`,
 * `workspace-provider.tsx`, and the amendments to the frozen
 * `renderer-state.ts`), T5 (writes the views, the status tokens and the
 * theme/CSS half of the widening), and T6 (writes the relaunch regression suite
 * that judges both).
 *
 * ---------------------------------------------------------------------------
 * THE SINGLE RULE
 * ---------------------------------------------------------------------------
 * Frontend discipline: "Every piece of state has exactly one owner. Two
 * components holding the same fact will disagree." `opened` has two owners
 * today — main's `#sessions` map and a renderer boolean initialised `false` —
 * and they disagree on every fresh renderer.
 *
 * The first draft removed the renderer's copy as an ORIGIN and kept it as a
 * MIRROR. Option 3 goes one step further and removes it as a FIELD: the
 * renderer stores nothing, and computes `opened` from `pod.status` at
 * derivation time.
 *
 * The discipline's next line — "Derived values are computed, never stored" —
 * used NOT to apply, because openness was genuinely not derivable: an open Pod
 * between turns and a closed Pod both read `status: 'idle'`. Option 3 removes
 * that ambiguity at the source, which is what turns `opened` into an ordinary
 * derived value and lets the ordinary rule govern it.
 */

import type {
  ComposerState,
  LaneRowVm,
  PodTabVm,
} from '../../../../src/renderer/src/contracts/renderer-state';
import type { PodStatus } from '../../../../src/shared/contracts/events';

// ---------------------------------------------------------------------------
// 1. `opened` is derived, never stored
// ---------------------------------------------------------------------------

/**
 * `PodRuntimeState.opened` (`store.ts:102`) IS DELETED. Not retyped, not
 * defaulted differently, not made nullable — REMOVED from the runtime record.
 * A test asserts the property name does not appear on the runtime shape, so the
 * deletion cannot silently regress into a re-added convenience field.
 *
 * THE FOUR ORIGINS DIE WITH IT, and each is named so a reviewer can check the
 * diff line by line:
 *   - `store.ts:161`      — the runtime initialiser's `opened: false`.
 *   - `store.ts:473`      — optimistic `opened: true` after `pods.open`.
 *   - `store.ts:533`      — optimistic `opened: true` after `pods.reconnect`.
 *   - `store.ts:552`      — optimistic `opened: true`, third patch site.
 *   - `store.ts:542`      — `opened: false` after a successful `pods.close`.
 *   - `store.ts:357-360`  — the `beached` push's reset.
 *
 * NONE OF THEM IS REPLACED BY AN EQUIVALENT WRITE. `pods.open`,
 * `pods.reconnect` and `pods.close` already return, or already trigger a
 * `podStatus` push carrying, the Pod's new status; that status IS the answer.
 * The optimistic patches were compensating for a fact the reply did not carry,
 * and the reply now carries it.
 *
 * A DELIBERATE BEHAVIOUR CHANGE HIDES IN THAT PARAGRAPH AND MUST BE STATED
 * RATHER THAN DISCOVERED. The three optimistic `opened: true` patches made the
 * composer enable INSTANTLY on click, before main answered. Deriving from
 * `status` means the composer enables when main's reply or push lands. That is
 * the correct trade — an enabled composer over a process that failed to start
 * is a worse error than a few tens of milliseconds of a disabled one — and the
 * `pods.open` call already has a pending state (`store.ts`'s open-in-flight
 * tracking) to render meanwhile. A test asserts the composer does not enable
 * until a reply or push reports an open status.
 */
export type OpenedIsDerived = never;

/**
 * THE ONE DERIVATION, and the ONLY place in the renderer that decides openness.
 * It lives in `derivePodList` (`workspace-provider.tsx:159`), replacing
 * `opened: runtime?.opened ?? false`.
 *
 * Written in the POSITIVE form, per `pod-lifecycle.ts` section 5: an
 * unrecognised future status must read as NOT open, because offering to type
 * into a Pod that may not be running is the worse error.
 */
export type IsPodOpen = (status: PodStatus) => boolean;

/**
 * REQUIRED SHAPE, reproduced so two implementers cannot produce two spellings:
 *
 *     // Openness is a fact about main's session registry, and `status` is the
 *     // only field that reports it. Positive form on purpose: a status this
 *     // build does not recognise reads as not-open, which shows a redundant
 *     // run control rather than enabling a composer over a dead process.
 *     const isPodOpen = (status: PodStatus): boolean =>
 *       status === 'idle' || status === 'running' || status === 'waiting';
 *
 * `PodTabVm.opened` stays `boolean` and stays in its current position in the
 * interface. No view branches three ways, because there is no third state.
 *
 * `runtime` IS NO LONGER CONSULTED FOR OPENNESS AT ALL. The old expression's
 * `?? false` silently manufactured "not open" for a Pod whose runtime record
 * was merely missing — a different fact wearing the same answer. That failure
 * mode is gone with the field.
 */
export type OpenedDerivationShape = never;

/**
 * AMENDMENT to `PodTabVm.opened` in the frozen `renderer-state.ts:157-161`. The
 * FIELD IS UNCHANGED — same name, same type, same position. Its SOURCE changes,
 * and the docblock must say so, because the current wording ("`pods.open`
 * succeeded and no `close`/beach has followed") describes exactly the
 * renderer-local latch that is the bug.
 *
 * NEW WORDING, in substance:
 *
 *   Main holds a live PodRunner for this Pod. DERIVED from `pod.status`:
 *   true for `idle`, `running` and `waiting`; false for `closed` and
 *   `beached`. Never stored, never latched, never inferred from a call the
 *   renderer made. `status` is the single authoritative field —
 *   see `PodStatus` in `events.ts`.
 *
 * `PodTabVm.status` is already `PodStatus` (`renderer-state.ts:163`) and
 * therefore widens automatically. Its docblock — "Mirrors `pod.status`,
 * restated so a consumer never re-derives it" — gains a sentence saying that
 * `opened` beside it is that derivation, performed once, so a consumer never
 * repeats it either.
 *
 * `ComposerState`, `LaneRowVm` and `WorkspaceActions` are NOT touched.
 * `ComposerState['disabledReason']` in particular does NOT gain a `'closed'`
 * member — see `pod-lifecycle.ts` section 5.
 */
export type PodTabVmAmendment = never;

// ---------------------------------------------------------------------------
// 2. Hydration: one round trip, and now trivially so
// ---------------------------------------------------------------------------

/**
 * `refreshPods` (`store.ts:430-459`) already calls `api.pods.list()` and assigns
 * the result to `state.pods`. Under Option 3 THAT IS THE ENTIRE HYDRATION OF
 * OPENNESS. There is no seeding step, no second field to copy across, and
 * nothing for `refreshPods` to do that it does not already do.
 *
 * The first draft needed a rule here ("seed each Pod's runtime `opened` from
 * the same reply, in the same update") because openness was a separate field
 * with a separate resting place. It has no separate resting place now. The
 * requirement survives only as a NEGATIVE:
 *
 *   NO SECOND FETCH, and no new state to hold openness. Frontend discipline:
 *   "Requests whose results are independent are issued together. A dependent
 *   chain is a waterfall and is justified explicitly or removed." A separate
 *   openness fetch would be a waterfall with nothing to justify it. Under
 *   Option 3 it would also be absurd, since the answer is already in hand.
 *
 * A Pod that disappears from a later `pods.list` has its runtime dropped, as
 * today. A Pod that appears needs no openness seeding at all.
 *
 * `onPodStatus` (`store.ts:346-361`) already writes `push.status` onto the Pod
 * row. That single existing line is what makes invariant I5 hold, and it needs
 * no change. What it LOSES is the `if (push.status === 'beached')` branch that
 * cleared `runtime.opened` — deleted with the field, not rewritten.
 */
export type HydrationRule = never;

// ---------------------------------------------------------------------------
// 3. What the user sees after a relaunch
// ---------------------------------------------------------------------------

/**
 * THE THREE SYMPTOMS, and what each must read as once this session lands. These
 * are the acceptance surface for T5 and the scenario T6 drives. UNCHANGED by
 * the E1 amendment in every user-visible respect — which is itself the point:
 * the option changed how the answer is computed, not what the user sees.
 *
 * SYMPTOM 1 — "the rail shows the Matriarch lane as Running with a duration
 * ticking from the original started_at".
 *   AFTER: the row reads `Orphaned`, via the existing `LANE_STATUS_LABEL`
 *   (`lane-status.ts:14`) and `TOKENS.statusOrphaned`. `LaneRowVm.elapsedMs`
 *   FREEZES, because `lane.endedAt` is now stamped and the existing rule ("or to
 *   now while the lane is running", `renderer-state.ts:233-238`) already stops
 *   the timer for a terminal lane. NO renderer change is needed for this symptom
 *   beyond receiving the reconciled row — which is the strongest argument for
 *   having reused `orphaned` rather than adding a LANE status, and it holds
 *   exactly as it did before. T5 VERIFIES it rather than implementing it.
 *
 * SYMPTOM 2 — "the composer is disabled with 'This Pod is not running. Open it
 * before sending a message.'"
 *   AFTER: still disabled, and still that sentence, which is CORRECT and already
 *   names the way out. `deriveComposer` (`workspace-provider.tsx:241-252`) keeps
 *   its most-specific-first ladder unchanged: `beached` before `not-opened`
 *   before `awaiting-permission`. A `'closed'` Pod reaches `not-opened`, which
 *   is the right rung and the right copy. What changes is that `not-opened` is
 *   now computed from main's `status` instead of from a renderer default, so an
 *   HMR reload of a LIVE Pod no longer shows it at all.
 *   THE COPY IS NOT TO BE REWRITTEN; `wording.e2e.test.tsx` pins it.
 *   TWO MECHANICAL CHANGES accompany this and nothing else:
 *   `deriveComposer`'s third parameter is retyped from `string` to `PodStatus`,
 *   and its call site's fallback `pod?.status ?? 'idle'` becomes
 *   `pod?.status ?? 'closed'` — a Pod the state layer cannot find is not open.
 *
 * SYMPTOM 3 — "the tab's x refuses with a not-running error".
 *   NOT REPRODUCED FROM THE CODE, and T5 must not invent a fix for a path it
 *   cannot find. `PodsChrome.tsx:41` calls `actions.closePod`, which invokes
 *   `pod:close`, which reaches `PodManager.closePod` — and that method throws
 *   only `NOT_FOUND` from `#requirePod`; `#dispose` is a no-op with no session
 *   and `NOT_RUNNING` appears nowhere on the path.
 *   REQUIRED INSTEAD: a regression guard proving the benign behaviour —
 *   `pods.close` against a Pod with no live runner answers `{ ok: true }`,
 *   leaves the Pod row and its transcript intact, and surfaces no error to the
 *   user. Under Option 3 it additionally leaves the Pod reading `'closed'`
 *   rather than `'idle'`. If the symptom still reproduces against the built app
 *   after this session, that is a REPORTED FINDING with the observed error text,
 *   not a speculative patch.
 */
export type RelaunchSymptoms = never;

// ---------------------------------------------------------------------------
// 4. The status-token widening (T5's half of `pod-lifecycle.ts` section 5)
// ---------------------------------------------------------------------------

/**
 * `'closed'` NEEDS A LABEL, A TOKEN AND A CSS VARIABLE, and each has exactly
 * one home. This is the frozen-file reach the user accepted at Gate 2.
 *
 *  1. LABEL — `src/renderer/src/pods/PodTab.tsx:11-16`,
 *     `Readonly<Record<PodStatus, string>> STATUS_LABEL`. Gains
 *     `closed: 'Closed'`. This map is exhaustive over `PodStatus` and therefore
 *     STOPS COMPILING until it is fixed; that is the intended alarm. The word is
 *     literal, per design §2's rule that routine statuses are not themed, and it
 *     reads correctly beside the existing `Idle`.
 *
 *  2. TOKEN NAME — `src/renderer/src/contracts/renderer-theme.ts`. `TOKENS`
 *     gains `statusClosed: '--oc-status-closed'` beside the six existing
 *     `status*` entries at `:61-70`, and the frozen
 *     `export declare function statusToken(...)` at `:130-134` gains `'closed'`
 *     to its hand-written parameter union. That union is a DUPLICATE of the two
 *     status unions rather than derived from them, so it does NOT break the
 *     build on its own — every `statusToken(pod.status)` CALL SITE breaks
 *     instead. Both halves must land in the same commit or the file is
 *     internally inconsistent.
 *
 *  3. TOKEN MAP — `src/renderer/src/shell/contract-runtime.ts:27-36`.
 *     `AnyStatus` gains `'closed'` and `STATUS_TOKENS` gains
 *     `closed: TOKENS.statusClosed`. `STATUS_TOKENS` is
 *     `Readonly<Record<AnyStatus, string>>`, so widening `AnyStatus` without the
 *     entry does not compile — the one place in this group with a real guard.
 *
 *  4. CSS VARIABLE — `src/renderer/src/styles/tokens.css:42-50` gains
 *     `--oc-status-closed`. REUSING `--oc-status-idle` WAS CONSIDERED AND IS NOT
 *     AVAILABLE: `WorkspaceLayout.test.tsx:182-186` asserts that every status
 *     maps to a DISTINCT token, so a shared value fails an existing test. Pick a
 *     value that reads as quiet and inactive and that is distinguishable from
 *     `--oc-status-idle` without relying on hue alone; the `Closed` label and
 *     the `Open` control carry the meaning, and the dot only has to not lie.
 *
 *  5. DOT SELECTOR — `src/renderer/src/pods/PodBar.module.css:100,106,111`
 *     gains a `.statusDot[data-status='closed']` rule. Without it a closed Pod's
 *     dot silently falls through to the base rule.
 *
 *  6. THE SWEEP THAT PROVES IT — `WorkspaceLayout.test.tsx:182-186` adds
 *     `'closed'` to its status array. The assertion that the token set is
 *     DISTINCT is not weakened to accommodate it.
 *
 * `src/renderer/src/shell/**` and `src/renderer/src/styles/**` were declared
 * frozen and unowned in the first draft's spec. EXACTLY THREE FILES ARE NOW IN
 * SCOPE ACROSS THOSE TWO TREES — `shell/contract-runtime.ts`,
 * `shell/WorkspaceLayout.test.tsx` and `styles/tokens.css` — and everything else
 * under them stays frozen. A diff touching a fourth file in either tree is out
 * of bounds.
 */
export type StatusTokenWidening = never;

// ---------------------------------------------------------------------------
// 5. The reconciliation is legible in the transcript  (UNCHANGED)
// ---------------------------------------------------------------------------

/**
 * The `system` event carrying `subtype: 'startup_reconciliation'` is rendered by
 * the EXISTING `system` renderer in `TranscriptEventItem.tsx`. Spec 5.2 requires
 * every `EventType` to stay renderable, and this adds no type — so there is
 * nothing new to render and no new component.
 *
 * WHAT T5 MUST NOT DO: add a modal, a toast, a dismissible banner or any other
 * surface for this. The durable transcript row plus the already-correct composer
 * sentence plus the already-present Open control are the whole of the
 * user-facing story. The session's scope is the defect cluster; new chrome is
 * sub-session B.
 *
 * WHAT T5 MUST DO: confirm, with a test, that a `system` event with this subtype
 * renders its reason text and does not fall through to an unknown-type branch or
 * an empty row.
 *
 * NOTE THE NEW NARROWING FROM `pod-lifecycle.ts` SECTION 2(b): this event is
 * written only for Pods whose LANES were reconciled. A Pod that merely went
 * `'idle'` -> `'closed'` at boot gets NO transcript row, deliberately, so that
 * a reconciliation notice does not appear in every Pod on every relaunch. A test
 * asserts that absence as well as the presence, because a notice that always
 * fires carries no information.
 */
export type ReconciliationLegibility = never;

// ---------------------------------------------------------------------------
// 6. Invariants a test pins
// ---------------------------------------------------------------------------

/**
 *  I1. NO POD'S OPENNESS IS EVER UNKNOWN. `PodRuntimeState` has no `opened`
 *      property, and `PodTabVm.opened` is a pure function of `pod.status` for
 *      every Pod in `state.pods` at every point in the lifecycle — including
 *      while `podsPhase` is `'loading'`. (This REPLACES the first draft's I1,
 *      which asserted no runtime `opened` was still `null` after hydration. That
 *      invariant is unrepresentable now, which is the improvement.)
 *
 *  I2. A Pod whose `pods.list` reply carried `status: 'idle'`, `'running'` or
 *      `'waiting'` has an ENABLED composer and NO run control, with no
 *      `pods.open` ever invoked. This is the HMR case, and it FAILS ON TODAY'S
 *      CODE. It must be seen red before it is made green.
 *
 *  I3. A Pod whose reply carried `status: 'closed'` has a disabled composer with
 *      `disabledReason: 'not-opened'` and a visible `Open` control. This is the
 *      relaunch case, and it passes today for the WRONG REASON — the renderer
 *      says not-open about everything. The test must therefore also assert the
 *      value came from the reply, by driving a SECOND Pod with an open status in
 *      the SAME fixture, so neither result can come from guessing one constant.
 *
 *  I4. `status: 'beached'` always yields `disabledReason: 'beached'` and the
 *      label `Reconnect`, and is never confused with `'closed'`, which yields
 *      `not-opened` and `Open`. The ladder's ORDER is the thing under test:
 *      `beached` is checked first precisely because a beached Pod is also not
 *      open, and saying "not opened" there would send the user to the wrong
 *      affordance.
 *
 *  I5. A `podStatus` push updates the tab without a refetch — including a push
 *      that carries `'closed'`, which must disable the composer and reveal the
 *      `Open` control with no `pods.list` call in between.
 *
 *  I6. A lane row whose lane is `orphaned` renders the word `Orphaned` and a
 *      FROZEN `elapsedMs` — asserted by advancing the fake clock and observing
 *      no change.
 *
 *  I7. NEW, AND IT IS THE INVARIANT THAT REPLACES THE DELETED TRI-STATE.
 *      `PodTabVm.opened` and `PodTabVm.status` never disagree: for every tab in
 *      every fixture, `opened === isPodOpen(status)`. A test sweeps ALL FIVE
 *      statuses through one derivation and asserts the pair, which is what makes
 *      a sixth status added by a later session fail loudly here instead of
 *      quietly rendering as open.
 */
export type PinnedInvariants = never;

/** Re-exported so a consumer need not re-import them. */
export type { ComposerState, LaneRowVm, PodStatus, PodTabVm };
