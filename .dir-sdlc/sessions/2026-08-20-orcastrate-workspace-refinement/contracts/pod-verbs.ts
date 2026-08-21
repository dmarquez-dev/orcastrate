/**
 * CONTRACT — The Pod run-control verb, and whether Create starts a process.
 * Frozen at Gate 2.
 *
 * Items 6 and 7 of the session scope. They are one contract because they are
 * one surface: `PodsChrome`'s handlers and `PodTab`'s run control. The backlog
 * insisted these be decided together with item 3 rather than across three
 * sessions precisely so that component is touched once.
 *
 * Boundary between:
 *   - T1 (PRODUCER of `createPod`'s new behaviour) the renderer state layer.
 *   - T4 (PRODUCER of the chrome) `src/renderer/src/pods/**`.
 *   - T0 — NO CHANGE IS REQUIRED IN MAIN BY THIS CONTRACT. Stated positively
 *     so nobody goes looking for one. `openPod`, `reconnectPod` and
 *     `pods.create` keep their signatures and their behaviour exactly.
 *   - T5 (CONSUMER) the renderer suites.
 */

import type { Pod, PodId, PodStatus } from './events';
import type { CreatePodRequest } from './ipc';

// ===========================================================================
// PART A — ITEM 6: Open versus Reconnect
// ===========================================================================

/**
 * THE DECISION: BOTH VERBS SURVIVE, IN MAIN AND AT THE UI. The renderer keeps
 * one call site whose verb is chosen by `PodTabVm.status`, exactly as
 * `PodsChrome.handleOpen` does today. What changes is the comment, the
 * accessible name, and the reason the routing exists.
 *
 * THE COMMENT THAT MUST GO. `PodsChrome.tsx` currently asserts that a beached
 * Pod "answers `pods.open` with an error". Verified false, twice over:
 *
 *   1. No guard anywhere in `src/main/ipc/**` refuses `pods.open` for a beached
 *      Pod. The routing is a renderer-side convention, not an enforced rule.
 *   2. `PodManager.onBeached` deletes the session from `#sessions` before
 *      marking the Pod beached (`pod-manager.ts`), so a beached Pod has no live
 *      session. `openPod` therefore falls straight through its
 *      `#sessions.has(podId)` early return to `#start(pod, true)` — the
 *      IDENTICAL call `reconnectPod` makes once `#dispose` no-ops on an absent
 *      session. It would succeed, not error.
 *
 * SO WHY KEEP THE SPLIT. Not for a refusal that does not exist. For two
 * reasons that do:
 *
 *   - `reconnectPod` disposes before starting; `openPod` returns an already-
 *     live Pod untouched. Those differ for any Pod whose session entry
 *     OUTLIVES its process — the failed-`stop()` path, and anything future that
 *     beaches without going through `onBeached`. Routing beached to the verb
 *     that disposes first is defensive in the direction that costs nothing when
 *     the session is already gone.
 *   - Design section 8 requires a beached Pod to keep an affordance carrying
 *     its CAUSE. Collapsing to a single verb with a single label is the one
 *     answer this constraint forbids, and `podReconnect` is already on the
 *     backlog as an invoke channel with no affordance calling it. Collapsing
 *     would make that worse.
 *
 * A REJECTED ALTERNATIVE, recorded so it is not rediscovered: adding the
 * missing main-side guard so `pods.open` really does refuse a beached Pod. It
 * would make the comment true, and it would also make the renderer's routing
 * load-bearing for correctness rather than merely tidy — a renderer bug would
 * become an error dialog instead of a working Reconnect. Refusing an operation
 * that would have succeeded is not a safety improvement.
 */

/**
 * The run control's verb, derived from status and from nothing else. The
 * component decides WHETHER to offer the control and WHAT TO CALL IT; the
 * parent decides which action to call.
 *
 * `showRunControl` is UNCHANGED: `beached || !opened`.
 */
export interface RunControlVm {
  /** `'Reconnect'` when `status === 'beached'`, `'Open'` otherwise. */
  label: 'Open' | 'Reconnect';
  /**
   * The control's accessible name. MUST carry the cause for a beached Pod —
   * this is the design-section-8 requirement, expressed at the one affordance
   * the user can act on.
   *
   *   beached -> `Reconnect <title>, stopped with an error`
   *   closed  -> `Open <title>`
   *
   * The status line inside the tab already reads "Beached, process stopped"
   * and stays, so the word is never the only carrier — but a user reaching the
   * control by keyboard hears only the control's own name, which is why the
   * cause belongs here too.
   */
  accessibleName: string;
  /** Which action the parent invokes. `'reconnect'` for beached, else `'open'`. */
  verb: 'open' | 'reconnect';
}

export declare function runControlFor(status: PodStatus, title: string): RunControlVm;

// ===========================================================================
// PART B — ITEM 7: Create no longer starts the process
// ===========================================================================

/**
 * THE DECISION: `createPod` CREATES THE ROW AND STOPS. It no longer calls
 * `pods.open`.
 *
 * `WorkspaceActions.createPod` keeps its signature. Its docblock's sentence
 * "Creates the Pod row and opens its process" is DELETED, along with the
 * matching comment at `store.ts:473-476`. Nothing changes in main:
 * `pods.create` already returns a Pod born `'closed'`
 * (`sqlite-event-store.ts:175`).
 *
 * WHY THIS IS SAFE NOW AND WAS NOT WHEN THE AUTO-OPEN WAS WRITTEN. Three
 * things moved:
 *   - A Pod is born `'closed'` rather than in a status that implied a process.
 *   - The tab renders a working `Open` control for a closed Pod
 *     (`PodTab.tsx`, `showRunControl = beached || !opened`).
 *   - Reopening RESUMES since 2026-08-20-orcastrate-open-resumes, so nothing
 *     is lost by not starting immediately.
 * "Create without starting" is therefore a state the UI already knows how to
 * display and to recover from. Creating a Pod also spawns a real Claude Code
 * process with real token cost, so a user setting up several Pods currently
 * cannot do so without paying for all of them at once.
 *
 * THE OBJECTION, AND WHY THE SPLIT ANSWERS IT RATHER THAN INCURRING IT. The
 * dialog today folds create-failure and open-failure into one error path, and
 * the worry was what it should say when the row exists but the process does
 * not. Under this decision that state is not an error at all — it is the
 * NORMAL, INTENDED outcome of pressing Create. The dialog's error path narrows
 * to create-failure alone, which is strictly simpler than what it does now.
 */
export interface CreatePodBehaviour {
  /**
   * Creates the Pod row. `cwd` MUST have come from `pickDirectory()`.
   *
   * ON SUCCESS, in this order and observably:
   *   1. The Pod is added to the list and becomes the ACTIVE Pod.
   *   2. The dialog closes.
   *   3. The Pod's tab renders with `status: 'closed'`, `opened: false`, and
   *      therefore a visible `Open` control.
   *   4. NO `pods.open` call is made. This is the whole change, and it is
   *      observable: a stub API that records its invocations sees `pods.create`
   *      and no `pods.open`.
   *
   * ON FAILURE the dialog stays open, keeps the user's input, and shows main's
   * message verbatim (spec 7) — unchanged from today, minus the second branch.
   */
  createPod(req: CreatePodRequest): Promise<{ ok: true; value: Pod } | { ok: false; error: unknown }>;
}

/**
 * THE ONE THING THE NEW POD DIALOG MUST SAY THAT IT DOES NOT SAY TODAY.
 *
 * A user who presses Create and sees nothing start has to be told that is
 * deliberate, or the change reads as a regression against the behaviour they
 * had yesterday. The confirmation is not a dialog and not a toast: the newly
 * created Pod is active, its tab carries the `Open` control, and the EMPTY
 * TRANSCRIPT STATE for a closed Pod names the next step.
 *
 * The composer's `disabledReason: 'not-opened'` copy already exists and already
 * says "This Pod is not running. Open it before sending a message." That
 * sentence is now the primary onboarding line for a freshly created Pod rather
 * than a recovery message, so it must render for a newly created Pod without
 * the user having to click anything. It does so already — `disabled` derives
 * from `pod.status` — and T4's criteria assert it end to end rather than
 * assuming it.
 *
 * NO "Create and open" CHECKBOX. It would reintroduce the folded error path
 * this decision removes, and the Open control is one click away on the tab that
 * just appeared.
 */
export const CREATE_DOES_NOT_START = true;

// ===========================================================================
// PART C — what a caller may rely on across both parts
// ===========================================================================

/**
 * INVOCATION MAP after this contract. Every renderer path that starts or stops
 * a Claude Code process, and its single call site. `PodsChrome` is the only
 * component in the renderer that calls any of them.
 *
 *   New Pod dialog, Create      -> createPod                     (no open)
 *   Pod tab, run control, closed -> openPod
 *   Pod tab, run control, beached-> reconnectPod
 *   Pod tab, `x`, opened         -> closePod
 *   Pod tab, `x`, not opened     -> the delete confirmation      (pod-deletion.ts)
 *
 * `podReconnect` therefore has exactly one affordance calling it, which closes
 * one of the four no-affordance invoke channels the backlog records.
 * `podDelete` gets its first component caller from `pod-deletion.ts`, which
 * closes a second.
 */
export type PodVerbCallSite =
  | { affordance: 'new-pod-create'; action: 'createPod' }
  | { affordance: 'run-control'; status: 'closed'; action: 'openPod' }
  | { affordance: 'run-control'; status: 'beached'; action: 'reconnectPod' }
  | { affordance: 'tab-close'; opened: true; action: 'closePod' }
  | { affordance: 'tab-close'; opened: false; action: 'confirmDelete' };

/** Present so a suite can name the Pod whose verbs it is driving. */
export type PodVerbSubject = PodId;
