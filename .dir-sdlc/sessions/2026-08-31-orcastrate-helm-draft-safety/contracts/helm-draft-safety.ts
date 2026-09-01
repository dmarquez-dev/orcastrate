/**
 * FROZEN AT GATE 2 - session 2026-08-31-orcastrate-helm-draft-safety.
 *
 * THIS IS AN AMENDMENT TO TWO ALREADY-FROZEN FILES. That is the session's
 * product, not a deviation from it:
 *
 *   - `src/shared/contracts/helm.ts`                  (frozen 2026-08-19)
 *   - `src/renderer/src/contracts/renderer-panels.ts` (frozen 2026-08-19)
 *
 * Both were frozen carrying a promise they could not keep. `helm.ts`'s
 * `HELM_CONFLICT_CODE` docblock says a conflict "re-loads and shows the current
 * contents beside the pending edit", and `renderer-panels.ts`'s `HelmDraft`
 * docblock says keeping `document` and `draft` apart is "what makes ... 'what
 * will the conflict banner compare against?' answerable at all". But the frozen
 * `HelmActions` offers only `reload()`, documented as "Re-reads from disk,
 * discarding the draft". No action fetches the fresh document WITHOUT
 * destroying the thing it would be compared against, so the comparison both
 * files promise has never had data to draw.
 *
 * This amendment adds the missing action rather than retracting the promise.
 * The ranked alternative - narrowing the prose to match `reload()` - is in the
 * architect's Gate 2 report, with why it was not taken.
 *
 * Implementers build against THIS FILE. Nobody edits it after Gate 2; a task
 * that needs it changed stops and escalates.
 *
 * T1 lands sections 2, 3 and 4 into the two real contract files. T2, T3 and T4
 * implement against what T1 lands.
 */

import type { HelmDocument, HelmScopeId, HelmValidationIssue } from '@shared/contracts/helm';
import type { ActionResult, PanelKey } from '@renderer/contracts/renderer-panels';

// ---------------------------------------------------------------------------
// 1. Item 1 - a failed load must not discard a draft it did not replace
// ---------------------------------------------------------------------------

/**
 * BEHAVIOURAL AMENDMENT ONLY. No type in either frozen file changes for this
 * item; `panel-store.ts`'s private `loadDocument` changes.
 *
 * It currently patches `document: null, draft: null` on EVERY failed load
 * (`panel-store.ts:572-578`). That branch is shared by `selectScope` and
 * `reload`, and the two cases are not the same:
 *
 *   - SCOPE CHANGE (the requested scope differs from the one selected when the
 *     load began): clearing is CORRECT and is RETAINED unchanged. Showing scope
 *     A's typed values under scope B's name is worse than losing them.
 *
 *   - SAME SCOPE (`reload()`, or `selectScope` re-selecting the current scope):
 *     clearing is DATA LOSS. The operation wrote nothing - an `EACCES` on read
 *     leaves the file exactly as it was - so there is nothing for the draft to
 *     be stale against. `document` and `draft` are BOTH retained, unchanged.
 *
 * MECHANICAL TRAP, spelled out because it is invisible at the failure branch:
 * `loadDocument` patches `selectedScopeId: scopeId` BEFORE it awaits the load
 * (`panel-store.ts:558-568`). By the time the failure branch runs,
 * `state.helm.selectedScopeId` ALREADY EQUALS the incoming `scopeId`, so a
 * comparison made there always reports "same scope" and would wrongly retain
 * across a scope change too. The previously-selected id MUST be captured before
 * the pre-await patch and compared against that captured value.
 */
export interface FailedLoadRetentionRule {
  /** The scope selected at the instant `loadDocument` was entered, before any patch. */
  previousScopeId: HelmScopeId | null;
  /** The scope being loaded. */
  requestedScopeId: HelmScopeId;
  /**
   * `previousScopeId === requestedScopeId`. When true the failure branch leaves
   * `document` and `draft` untouched; when false it clears both, as today.
   */
  retainDraft: boolean;
}

/**
 * UNCHANGED, stated so no implementer "tidies" them while nearby: on a failed
 * load `loadingDocument` returns to `false` and `actionError` is set to the
 * verbatim failure message, in BOTH branches. `stale` and `conflict` were
 * already cleared by the pre-await patch and stay cleared in both branches.
 *
 * SUCCESS PATH UNCHANGED IN BOTH BRANCHES: a successful load still replaces
 * `document` and re-seeds `draft`. This item narrows the FAILURE branch only.
 */
export type FailedLoadInvariants = never;

// ---------------------------------------------------------------------------
// 2. Item 2 - the comparison-capable action
// ---------------------------------------------------------------------------

/**
 * ADDED to the frozen `HelmActions`.
 *
 * Re-reads the selected scope from disk WITHOUT touching `document` or `draft`.
 * The result lands in `HelmView.incoming` - the "current contents" half of the
 * side-by-side `helm.ts` promises. `draft` is the "pending edit" half.
 *
 * This is the ONLY action that reads the file without replacing the working
 * copy. `reload()` KEEPS ITS DOCUMENTED MEANING - re-read and discard - and is
 * still the answer to a stale banner when the user does not want their edit.
 * Its docblock is not amended.
 *
 * ERROR CASES. All surface as `{ ok: false }`; `compare()` NEVER rejects:
 *
 *   - No scope selected: refuses via the store's existing `reportHelmRefusal`
 *     with the existing `NO_SCOPE_MESSAGE`, exactly as `reload()` does.
 *     `incoming` is left unchanged.
 *   - Preload API absent: the store's existing `failClosed` path. `incoming` is
 *     left unchanged.
 *   - The IPC load fails (`EACCES`, `ENOENT`, anything else): `actionError` is
 *     set to the verbatim message AND `incoming` is set to `null`. It is not
 *     left holding an earlier read - a comparison against contents no longer
 *     known to be current is worse than no comparison at all.
 *
 * In every case `comparing` returns to `false`.
 *
 * CONCURRENCY: `compare()` is NOT de-duplicated and takes no in-flight lock
 * beyond the `comparing` flag. A second call while one is in flight is allowed;
 * last write wins. This differs deliberately from `refreshScopes`, which
 * de-dupes because a mount effect reaches it; `compare()` is reached only from
 * an explicit user action.
 */
export interface HelmCompareAction {
  compare(): Promise<ActionResult<HelmDocument>>;
}

/**
 * ADDED to the frozen `HelmView`. Both fields have exactly one writer: the
 * store. Neither is derived, and neither is duplicated anywhere else.
 */
export interface HelmComparisonView {
  /**
   * The freshest on-disk document, fetched by `compare()` and NOT seeded into
   * `draft`. `null` means no comparison is available - none was requested, or
   * the last request failed, or one of the clearing events below fired.
   */
  incoming: HelmDocument | null;
  /** True while a `compare()` is in flight. Mirrors `loadingDocument`. */
  comparing: boolean;
}

/**
 * `incoming` is CLEARED TO NULL by every event that makes a comparison
 * meaningless. This list is EXHAUSTIVE - an event not named here leaves
 * `incoming` alone:
 *
 *   - `selectScope()` - on entering `loadDocument`, success or failure alike.
 *     The comparison belonged to the previously selected scope.
 *   - `reload()` - on entering `loadDocument`, success or failure alike.
 *   - `discard()` - the pending edit is gone, so there is nothing to compare.
 *   - a SUCCESSFUL `save()` - the write resolved the divergence, and
 *     `HelmSaveResult.document` is the new truth.
 *
 * A FAILED `save()` DOES NOT CLEAR IT. A CONFLICT is exactly when the
 * comparison matters most: the draft survives - the frozen `save()` docblock
 * guarantees that - and a `compare()` the user then triggers is the entire
 * point of this feature.
 */
export type IncomingClearingEvents = never;

/**
 * `helm.ts`'s `HELM_CONFLICT_CODE` docblock is AMENDED to name the action that
 * makes its promise true. The sentence "The panel then re-loads and shows the
 * current contents beside the pending edit" becomes a statement that the panel
 * offers `compare()`, which fetches the current contents alongside the
 * surviving draft, and that `reload()` remains the discard-my-edit path.
 *
 * The "there is no save anyway" sentence that follows is UNCHANGED and still
 * binding: a second save against the fresh revision is the only override.
 */
export type ConflictDocblockAmendment = never;

// ---------------------------------------------------------------------------
// 3. Item 3 - closing a panel must not silently discard a draft
// ---------------------------------------------------------------------------

/**
 * THE INVARIANT THIS MUST NOT BREAK, quoted from `App.tsx:85-90`:
 *
 *   "Mounting the connected panel is also what issues its first fetch - the
 *    hooks' own mount effects do that - so nothing here fetches, and neither
 *    panel's hook is mounted while its panel is closed."
 *
 * T9 declined this item for exactly that reason: `App` cannot ask "is the draft
 * dirty?" without calling `useHelm()`, whose mount effect issues the scope
 * fetch - making the shell a data fetcher and fetching Helm's scopes even when
 * the Helm panel is shut.
 *
 * ANY IMPLEMENTATION THAT PUTS `useHelm()` OR `useHelmActions()` INTO `App.tsx`
 * IS WRONG AND WILL BE REJECTED AT REVIEW.
 *
 * The shape below inverts the dependency. The shell knows only that SOME panel
 * may object to being closed. The panel - already mounted, and already knowing
 * whether it is dirty - is the one that objects. The shell never learns what
 * "dirty" means, and Beachcomber never registers anything.
 */

/**
 * Registered by whichever panel is currently mounted. At most one is registered
 * at a time, because at most one panel is open at a time (`openPanel` is a
 * single nullable `PanelKey`).
 */
export interface PanelCloseGuard {
  /**
   * Asked once per close request, before the panel is unmounted.
   *
   * Resolves `true` to let the close proceed, `false` to cancel it. NEVER
   * rejects and never throws: a guard that threw would strand the panel open
   * with no way out, which is a worse failure than the draft loss it exists to
   * prevent. An implementation that could throw wraps itself and resolves
   * `true` on the unexpected path - failing OPEN, because refusing to close is
   * the more trapping failure.
   *
   * The guard OWNS ITS CONFIRMATION UI. The panel is what knows the word
   * "draft", so the panel renders the dialog and resolves this promise from the
   * dialog's outcome. The shell renders nothing and shows nothing.
   *
   * A guard with nothing to object to - the Helm draft is not dirty - resolves
   * `true` immediately, showing nothing.
   */
  beforeClose(): Promise<boolean>;
}

/**
 * The registration side, consumed by the panel.
 *
 * Passing a guard registers it; passing `null` clears the registration. The
 * hook MUST clear the registration on unmount, so a panel that unmounted for
 * any other reason cannot veto a later close of a different panel.
 *
 * THIS HOOK FETCHES NOTHING and subscribes to no store. That is what lets the
 * shell host its provider without becoming a data fetcher: it is `useHelm()`'s
 * mount effect, not registration, that the invariant above is about.
 */
export declare function useRegisterPanelCloseGuard(guard: PanelCloseGuard | null): void;

/**
 * The asking side, consumed by the shell (`App.tsx`).
 *
 * AMENDED AT GATE 2 (user-approved 2026-08-31), after decomposition surfaced
 * `PanelBar.onOpen` as an uncovered adjacency. A dirty draft must survive a
 * panel SWITCH, not only a close. Both entry points below are the same
 * operation with a different destination - a switch IS a close plus an open,
 * and the draft has to survive the close half of it.
 *
 * Both are implemented over ONE private guarded transition. They do not each
 * carry their own copy of the guard logic and their own in-flight flag; a
 * second flag is a second way to be wrong.
 */
export interface PanelCloseController {
  /** Destination `null`. Clears the open panel if the guard permits. */
  requestClose(): Promise<void>;
  /**
   * Destination `next`. Replaces the open panel if the guard permits.
   *
   * When `next` is ALREADY the open panel this is a no-op and the guard is NOT
   * asked - re-clicking the open panel's own button must not raise a dialog.
   */
  requestOpen(next: PanelKey): Promise<void>;
}

/**
 * The rules governing that single transition. They apply identically to
 * `requestClose()` and `requestOpen()`; wherever "the transition" appears
 * below, both are meant.
 *
 * GUARD DECLINED (`beforeClose()` resolved `false`): `openPanel` is left
 * EXACTLY as it was. For a close that means the panel stays open; FOR A SWITCH
 * THAT MEANS THE SWITCH DOES NOT HAPPEN AND THE ORIGINAL PANEL STAYS OPEN - the
 * shell does not close the old panel and then decline to open the new one,
 * which would discard the draft while also failing to honour the click. The
 * panel stays mounted and its draft is untouched.
 *
 * WITH NO GUARD REGISTERED the transition proceeds unconditionally and WITHOUT
 * an awaited turn inserted before `openPanel` moves. This is what keeps
 * Beachcomber bit-for-bit unchanged: it registers nothing, so every existing
 * `PanelBar` and `PanelRegion` test that opens, switches or closes it still
 * observes a synchronous transition.
 *
 * RE-ENTRANCY, now that the transition is reachable from three affordances
 * (close button, Escape, and the panel-switch buttons):
 *
 *   - AT MOST ONE transition is in flight at a time, across BOTH methods. The
 *     in-flight state is shared, not per-method.
 *   - While one is pending, ANY further `requestClose()` or `requestOpen()` is
 *     DROPPED. It resolves without asking the guard again and without changing
 *     the pending destination.
 *   - When the pending guard resolves `true`, the destination applied is THE
 *     PENDING REQUEST'S, never a later one. This is the whole reason later
 *     requests are dropped rather than queued or latest-wins: the user answered
 *     a dialog about leaving Helm, and the answer must land on the destination
 *     that dialog was raised for. Applying a destination they clicked while the
 *     dialog was up would honour a click with the consent of a different one.
 *   - The guard is therefore asked EXACTLY ONCE per transition, whatever the
 *     user clicks while it is pending.
 *
 * This is a distinct case from a guard that THROWS, which fails open (see
 * `PanelCloseGuard.beforeClose`). A dropped request is not a failure; nothing
 * went wrong and nothing is reported.
 */
export type PanelTransitionRules = never;

/**
 * Every shell affordance that moves `openPanel` routes through the controller:
 * `PanelBar`'s close button and `PanelRegion`'s `onClose` (including its Escape
 * handler) call `requestClose()`; `PanelBar`'s panel-switch buttons reach
 * `requestOpen()`. After this session `setOpenPanel` is called from exactly one
 * place - the controller's own resolution path.
 *
 * `PanelBar.onOpen` KEEPS ITS SYNCHRONOUS SIGNATURE, `(key: PanelKey) => void`.
 * It is NOT widened to return a promise. `App` discards the controller's
 * promise explicitly at the call site - `(key) => { void controller
 * .requestOpen(key); }` - rather than handing a promise-returning function to a
 * void-returning prop.
 *
 * Two reasons, and they both matter: `PanelBar` has no use for the promise, and
 * the existing synchronous `onOpen` call sites in `PanelBar.test.tsx` (the one
 * at :64 among them) must keep compiling and passing UNCHANGED. Widening the
 * prop would churn tests that pin behaviour this session does not alter, and
 * would hand a floating promise to a `void` prop - which `no-misused-promises`
 * exists to catch.
 */
export type ShellCloseRouting = never;

// ---------------------------------------------------------------------------
// 4. Item 4 - the authoritative `HelmValidationIssue.field` set
// ---------------------------------------------------------------------------

/**
 * `helm.ts:208` documents `HelmValidationIssue.field` as five names. VERIFIED
 * AGAINST THE SHIPPED VALIDATORS during this session's decomposition: there are
 * SEVEN, from two producers, both authoritative.
 *
 *   main process - `src/main/helm/validate.ts`, `validateSaveRequest`
 *     hooksJson            :57, :64
 *     env                  :75, :80
 *     model                :90
 *     permissionsAllow     tuple :95, pushed :99 and :103
 *     permissionsDeny      tuple :96, same pushes
 *     crossSessionInbound  :112 (error), :120 (warning)
 *
 *   renderer - `src/renderer/src/state/panel-store.ts`, `validateDraft` (:767)
 *     parseError           :773
 *     model                :780
 *     permissionsAllow     tuple :786-788, pushed :792
 *     permissionsDeny      same tuple
 *     env                  :801
 *     crossSessionInbound  :810 (warning)
 *     hooksJson            :823, :831
 *
 * The union is the seven below. The two the docblock omits are
 * `permissionsDeny` and `parseError`. Note `parseError` comes ONLY from the
 * renderer - main sets `document.parseError` instead of emitting an issue - and
 * the amended docblock says so, because a consumer reading only the main
 * validator would not find it.
 *
 * `field` STAYS TYPED `string`. This amendment corrects the DOC COMMENT only;
 * no type narrows to a union, and `HELM_VALIDATION_ISSUE_FIELDS` below is not
 * added to the shipped source. Narrowing would make a validator that emits an
 * eighth name a compile error, and would remove the pressure on consumers to
 * keep a catch-all - which is the very defence that already works.
 *
 * `src/renderer/src/helm/issues.ts` ALREADY HANDLES THE GAP CORRECTLY. Its
 * `unplacedIssues` catch-all covers any unlisted field, and its header already
 * names both omissions. IT NEEDS NO CHANGE, and changing it is outside this
 * amendment.
 */
export const HELM_VALIDATION_ISSUE_FIELDS = [
  'model',
  'permissionsAllow',
  'permissionsDeny',
  'env',
  'crossSessionInbound',
  'hooksJson',
  'parseError',
] as const;

/** Advisory. Not a constraint on the shipped `field`, which remains `string`. */
export type KnownHelmValidationField = (typeof HELM_VALIDATION_ISSUE_FIELDS)[number];

/** Holds only while the documented names stay assignable to the frozen field type. */
export type _FieldsAreStrings = KnownHelmValidationField extends HelmValidationIssue['field']
  ? true
  : never;
