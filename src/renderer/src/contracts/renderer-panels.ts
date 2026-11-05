/**
 * CONTRACT — Renderer panel seams. Frozen at Gate 2.
 *
 * Lands verbatim at `src/renderer/src/contracts/renderer-panels.ts`.
 *
 * Boundary between the five renderer-side tasks of this session, which run
 * CONCURRENTLY and never read each other's markup:
 *
 *   T4  renderer contracts, tokens, test-utils  — writes THIS file
 *   T5  state layer additions                    — implements every hook below
 *   T6  Beachcomber panel                        — `src/renderer/src/beachcomber/**`
 *   T7  Helm panel                               — `src/renderer/src/helm/**`
 *   T9  shell integration                        — renders the panel region
 *   T10 the test suite                           — drives it all by PANEL_TEST_IDS
 *
 * It EXTENDS the two frozen files, it does not replace them: `renderer-state.ts`
 * still owns the workspace hooks, `renderer-view.ts` still owns the layout
 * slots. What is new lives here, so a reader can see this session's whole
 * renderer surface in one file.
 *
 * INHERITED AND NOT WEAKENED (`renderer-state.ts` header): no module under
 * `src/renderer/**` imports a `node:` builtin; every path is an opaque display
 * string; the renderer never composes, parses, joins, or types one; every
 * action resolves an `ActionResult` and NEVER rejects.
 *
 * ===========================================================================
 * WHERE THE PANELS SURFACE, AND WHAT IT COSTS
 * ===========================================================================
 *
 * `WorkspaceLayoutProps` (frozen `renderer-view.ts:46-58`) has six slots —
 * `podBar`, `laneRail`, `primary`, `split`, `composer`, `empty` — and none of
 * them is a panel. Beachcomber and Helm have literally nowhere to render.
 *
 * The three candidates were: a modal (rejected — design section 5.4 already
 * rejects modals in this window because they block work on unrelated Pods, and
 * Beachcomber's scan is slow enough that a modal would hold the app hostage); a
 * fourth Pod-bar tab (rejected — a panel is not a Pod, and the Pod bar's drag
 * reorder, close button and status dot are all meaningless for one); or a new
 * region. This contract takes the region.
 *
 * THE AMENDMENT (T4 makes it; T9 satisfies it):
 *
 *   export interface WorkspaceLayoutProps {
 *     … the six existing slots, unchanged …
 *     panelBar?: ReactNode;
 *     panel?: ReactNode | null;
 *   }
 *
 * `panelBar` renders as a strip directly beneath the Pod bar and is always
 * present. `panel`, when non-null, REPLACES the body — rail, transcript pane(s)
 * and composer — leaving the Pod bar and the strip in place, so the user can
 * see which Pod they will come back to.
 *
 * BOTH ARE OPTIONAL, AND THAT IS A CONCESSION, NOT A DESIGN. A required prop
 * would make `WorkspaceLayout.tsx` and `App.tsx` fail to compile the moment T4
 * lands and stay broken until T9 does — which is exactly the kind of
 * deliberately-red intermediate state that makes a task unreviewable. The
 * optionality is therefore compensated by T9's acceptance criteria and by T10's
 * suite, which assert that the region renders, that opening a panel hides the
 * transcript, and that closing it restores the previously selected lane. An
 * `undefined` panelBar in shipped code is a test failure, not a valid state.
 *
 * WHICH PANEL IS OPEN IS CLIENT INTERACTION STATE, not server data, so per the
 * frontend discipline it lives in `App.tsx` local state and NOT in the workspace
 * store. Nothing outside the shell needs to know.
 *
 * ===========================================================================
 * PROVENANCE
 * ===========================================================================
 *
 * Frozen 2026-08-19 by sub-session 3. AMENDED by session
 * `2026-08-31-orcastrate-helm-draft-safety` (approved at its Gate 2), because
 * this file was frozen carrying a promise it could not keep: the `HelmDraft`
 * docblock below says keeping `document` and `draft` apart is what makes "what
 * will the conflict banner compare against?" answerable, but the frozen
 * `HelmActions` offered only `reload()`, which discards the draft it would be
 * compared against. No action could fetch the fresh document without destroying
 * the other half of the comparison.
 *
 * The amendment adds `HelmActions.compare()` with `HelmView.incoming` and
 * `HelmView.comparing`, and adds `PanelCloseGuard`,
 * `useRegisterPanelCloseGuard` and `PanelCloseController` so a dirty draft is
 * not silently discarded when the panel is closed or switched away from.
 * Everything else here is unchanged from the 2026-08-19 freeze.
 */

import type { ReactNode } from 'react';

import type {
  BeachcomberEntry,
  BeachcomberEntryId,
  BeachcomberPreview,
  BeachcomberRootKey,
  BeachcomberScan,
  BeachcomberTrashResult,
} from '@shared/contracts/beachcomber';
import type {
  HelmDocument,
  HelmManagedFields,
  HelmSaveResult,
  HelmScope,
  HelmScopeId,
  HelmValidationIssue,
} from '@shared/contracts/helm';
import type { ActionResult, Loadable } from './renderer-state';

// ---------------------------------------------------------------------------
// The panel region (T9)
// ---------------------------------------------------------------------------

export type PanelKey = 'beachcomber' | 'helm';

export interface PanelBarProps {
  /** null when the workspace is showing. */
  open: PanelKey | null;
  onOpen(key: PanelKey): void;
  onClose(): void;
}

/**
 * Copy is contract, because T10 asserts it and because two panels named by two
 * tasks would otherwise disagree with each other and with the design.
 */
export const PANEL_LABELS: Readonly<Record<PanelKey, string>> = {
  beachcomber: 'Beachcomber',
  helm: 'Helm',
};

export const PANEL_DESCRIPTIONS: Readonly<Record<PanelKey, string>> = {
  beachcomber: "Review and clear Claude Code's on-disk state.",
  helm: 'Edit Claude Code settings for this machine and for each Pod.',
};

// ---------------------------------------------------------------------------
// The panel close guard
// ADDED by session `2026-08-31-orcastrate-helm-draft-safety`
// ---------------------------------------------------------------------------

/**
 * THE INVARIANT THIS MUST NOT BREAK, quoted from `App.tsx`:
 *
 *   "Mounting the connected panel is also what issues its first fetch — the
 *    hooks' own mount effects do that — so nothing here fetches, and neither
 *    panel's hook is mounted while its panel is closed."
 *
 * `App` cannot ask "is the draft dirty?" without calling `useHelm()`, whose
 * mount effect issues the scope fetch — making the shell a data fetcher and
 * fetching Helm's scopes even when the Helm panel is shut. ANY IMPLEMENTATION
 * THAT PUTS `useHelm()` OR `useHelmActions()` INTO `App.tsx` IS WRONG AND WILL
 * BE REJECTED AT REVIEW.
 *
 * The shapes below invert the dependency. The shell knows only that SOME panel
 * may object to being closed. The panel — already mounted, and already knowing
 * whether it is dirty — is the one that objects. The shell never learns what
 * "dirty" means, and Beachcomber never registers anything.
 *
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
   * `true` on the unexpected path — failing OPEN, because refusing to close is
   * the more trapping failure.
   *
   * THE GUARD OWNS ITS CONFIRMATION UI. The panel is what knows the word
   * "draft", so the panel renders the dialog and resolves this promise from the
   * dialog's outcome. The shell renders nothing and shows nothing.
   *
   * A guard with nothing to object to — the Helm draft is not dirty — resolves
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
 * A dirty draft must survive a panel SWITCH, not only a close. Both entry
 * points below are the same operation with a different destination — a switch
 * IS a close plus an open, and the draft has to survive the close half of it.
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
   * asked. No shell affordance issues that call — `PanelBar` routes a re-click
   * of the open panel's own button to `onClose` — so the no-op is a defence,
   * not a route.
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
 * THAT MEANS THE SWITCH DOES NOT HAPPEN AND THE ORIGINAL PANEL STAYS OPEN — the
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
 * RE-ENTRANCY, now that the transition is reachable from four affordances
 * (close button, Escape, the panel-switch buttons, and a re-click of the open
 * panel's own button):
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
 *   - THE GUARD IS THEREFORE ASKED EXACTLY ONCE PER TRANSITION, whatever the
 *     user clicks while it is pending.
 *
 * This is a distinct case from a guard that THROWS, which fails open (see
 * `PanelCloseGuard.beforeClose`). A dropped request is not a failure; nothing
 * went wrong and nothing is reported.
 *
 * ROUTING: every shell affordance that moves `openPanel` goes through the
 * controller — `PanelBar`'s close button and `PanelRegion`'s `onClose`
 * (including its Escape handler) call `requestClose()`; `PanelBar`'s
 * panel-switch buttons reach `requestOpen()`; and a click on the open panel's
 * own `PanelBar` button calls `onClose` and so reaches `requestClose()`, a
 * guarded close exactly like the close button's. `setOpenPanel` is called from
 * exactly one place, the controller's own resolution path.
 *
 * `PanelBarProps.onOpen` KEEPS ITS SYNCHRONOUS SIGNATURE, `(key: PanelKey) =>
 * void`, and is NOT widened to return a promise. `App` discards the
 * controller's promise explicitly at the call site — `(key) => { void
 * controller.requestOpen(key); }` — rather than handing a promise-returning
 * function to a void-returning prop. `PanelBar` has no use for the promise, and
 * the existing synchronous `onOpen` call sites in `PanelBar.test.tsx` must keep
 * compiling and passing UNCHANGED.
 */
export type PanelTransitionRules = never;

// ---------------------------------------------------------------------------
// Beachcomber view models (T5 produces, T6 renders)
// ---------------------------------------------------------------------------

export interface BeachcomberRowVm {
  entry: BeachcomberEntry;
  selected: boolean;
  /**
   * Non-null when the row cannot be selected. THE SENTENCE THE USER READS, and
   * it names the Pod: "Refactor the router uses this directory. Delete that Pod
   * first." Per the accessibility floor, the disabled state is carried by this
   * text and by `aria-disabled`, never by color alone.
   */
  blockedReason: string | null;
}

export interface BeachcomberGroupVm {
  root: BeachcomberRootKey;
  heading: string;
  /** The root's own `~/.claude/...` path. Display only. */
  displayPath: string;
  rows: BeachcomberRowVm[];
  totalBytes: number;
  /** Non-null when this root alone failed to read; other groups still render. */
  error: string | null;
}

export interface BeachcomberView extends Loadable<BeachcomberGroupVm[]> {
  scan: BeachcomberScan | null;
  selectedIds: BeachcomberEntryId[];
  selectedBytes: number;
  /** Present once the user has asked for one; cleared by any selection change. */
  preview: BeachcomberPreview | null;
  previewing: boolean;
  trashing: boolean;
  /** The outcome of the last trash, including partial failures. */
  lastResult: BeachcomberTrashResult | null;
  /**
   * The message from the last failed `beachcomber:*` call, or null. THIS FIELD
   * IS WHY NONE OF THE THREE CHANNELS JOINS THE SURFACELESS ALLOWLIST — it has
   * exactly one writer and T6 renders it unconditionally.
   *
   * AMENDED at escalation E5 (user-approved 2026-08-19), after T4 found the
   * frozen file did not typecheck. Renamed from `error` because `Loadable.error`
   * is `IpcError | null` and is documented non-null IF AND ONLY IF
   * `phase === 'error'`. This field is a different thing: the message from the
   * last failed ACTION, which is set while `phase` is still 'ready'. Same name,
   * two invariants, and the collision was a compile error rather than a subtle
   * bug only because `Loadable` types its own field. Consumers read
   * `actionError` for action failures and inherited `error` for load failures.
   */
  actionError: string | null;
}

export interface BeachcomberActions {
  rescan(): Promise<ActionResult<BeachcomberScan>>;
  toggle(id: BeachcomberEntryId): void;
  /** Selects every SELECTABLE row in the group. Blocked rows are skipped. */
  toggleGroup(root: BeachcomberRootKey): void;
  clearSelection(): void;
  requestPreview(): Promise<ActionResult<BeachcomberPreview>>;
  dismissPreview(): void;
  /**
   * Only ever called from the confirm step of a rendered preview. T6's
   * acceptance criteria forbid a path from a row straight to this call: design
   * section 6 requires "a preview of exactly what will be removed before any
   * action", and a one-click delete is that requirement's opposite.
   */
  trashPreviewed(): Promise<ActionResult<BeachcomberTrashResult>>;
}

export declare function useBeachcomber(): BeachcomberView;
export declare function useBeachcomberActions(): BeachcomberActions;

export interface BeachcomberPanelProps {
  view: BeachcomberView;
  actions: BeachcomberActions;
}

// ---------------------------------------------------------------------------
// Helm view models (T5 produces, T7 renders)
// ---------------------------------------------------------------------------

/**
 * The form's working copy. `HelmDocument` is what was LOADED and never changes
 * until a reload; this is what the user has typed. Keeping them apart is what
 * makes "has it changed?" and "what will the conflict banner compare against?"
 * answerable at all.
 */
export interface HelmDraft {
  managed: HelmManagedFields;
  hooksJson: string;
}

export interface HelmView extends Loadable<HelmScope[]> {
  selectedScopeId: HelmScopeId | null;
  document: HelmDocument | null;
  loadingDocument: boolean;
  draft: HelmDraft | null;
  dirty: boolean;
  saving: boolean;
  issues: HelmValidationIssue[];
  /** True when `issues` holds at least one `severity: 'error'`. Save is disabled. */
  blocked: boolean;
  /**
   * The loaded file changed underneath the form. Set by a rejected save
   * (CONFLICT) and, best-effort, by the `helmChanged` push. THE PUSH IS NOT
   * WHAT MAKES SAVING SAFE — see the `helm.ts` header.
   */
  stale: boolean;
  /** Set on CONFLICT. Says which file, and that nothing was written. */
  conflict: string | null;
  lastSave: HelmSaveResult | null;
  /**
   * The verbatim OS or IPC message from the last failure. One writer.
   *
   * AMENDED at escalation E5 (user-approved 2026-08-19), after T4 found the
   * frozen file did not typecheck. Renamed from `error` because `Loadable.error`
   * is `IpcError | null` and is documented non-null IF AND ONLY IF
   * `phase === 'error'`. This field is a different thing: the message from the
   * last failed ACTION, which is set while `phase` is still 'ready'. Same name,
   * two invariants, and the collision was a compile error rather than a subtle
   * bug only because `Loadable` types its own field. Consumers read
   * `actionError` for action failures and inherited `error` for load failures.
   */
  actionError: string | null;
  /**
   * ADDED by session `2026-08-31-orcastrate-helm-draft-safety`.
   *
   * The freshest on-disk document, fetched by `compare()` and NOT seeded into
   * `draft`. It is the "current contents" half of the side-by-side that
   * `helm.ts`'s `HELM_CONFLICT_CODE` docblock promises; `draft` is the "pending
   * edit" half. `null` means no comparison is available — none was requested,
   * or the last request failed, or one of the clearing events below fired.
   *
   * ONE WRITER: the store. Not derived, and not duplicated anywhere else.
   *
   * CLEARED TO NULL by every event that makes a comparison meaningless. This
   * list is EXHAUSTIVE — an event not named here leaves `incoming` alone:
   *
   *   - `selectScope()` — on entering the load, success or failure alike. The
   *     comparison belonged to the previously selected scope.
   *   - `reload()` — on entering the load, success or failure alike.
   *   - `discard()` — the pending edit is gone, so there is nothing to compare.
   *   - a SUCCESSFUL `save()` — the write resolved the divergence, and
   *     `HelmSaveResult.document` is the new truth.
   *   - a FAILED `compare()` — the "or the last request failed" case above:
   *     when the load `compare()` issues fails, any earlier read is cleared
   *     rather than left in place, since a comparison against contents no
   *     longer known to be current is worse than none. A `compare()` refused
   *     before it issues the load (no bridge, no selected scope) does not
   *     reach this and leaves `incoming` alone.
   *   - the PANEL-CLOSE WHOLE-STATE RESET.
   *     ADDED by session `2026-10-09-orcastrate-theme-contract-decisions`.
   *     When `helmMounts` reaches 0 AND Helm's `phase` is not `'idle'`,
   *     `resetHelmForReopen` replaces the WHOLE Helm state via
   *     `newHelmState(null)`, so `incoming` goes null alongside `document` and
   *     `draft`. When `phase` is `'idle'` the reset leaves the Helm state as it
   *     is. With no bridge it also leaves the Helm state as it is:
   *     `resetHelmForReopen` opens with `if (this.api === null) return;`, so
   *     `incoming` is not cleared when the store has no API. This one is not a targeted clear of `incoming` like the five
   *     above; it is wholesale replacement, and `incoming` falls with
   *     everything else. It is named here because the list claims to be
   *     exhaustive, and without it that claim was false.
   *
   * A FAILED `save()` DOES NOT CLEAR IT. A CONFLICT is exactly when the
   * comparison matters most: the draft survives — `save()`'s docblock
   * guarantees that — and a `compare()` the user then triggers is the entire
   * point of the feature.
   */
  incoming: HelmDocument | null;
  /**
   * ADDED by session `2026-08-31-orcastrate-helm-draft-safety`. True while a
   * `compare()` is in flight. Mirrors `loadingDocument`. One writer: the store.
   */
  comparing: boolean;
}

export interface HelmActions {
  selectScope(scopeId: HelmScopeId): Promise<ActionResult<HelmDocument>>;
  /** Re-reads from disk, discarding the draft. The answer to a stale banner. */
  reload(): Promise<ActionResult<HelmDocument>>;
  /**
   * ADDED by session `2026-08-31-orcastrate-helm-draft-safety`.
   *
   * Re-reads the selected scope from disk WITHOUT touching `document` or
   * `draft`. The result lands in `HelmView.incoming`. This is the ONLY action
   * that reads the file without replacing the working copy — `reload()` keeps
   * its documented meaning of re-read-and-discard, and its docblock above is
   * not amended.
   *
   * NEVER REJECTS, and NEVER touches `document` or `draft` ON ANY PATH,
   * success or failure. All three error cases surface as `{ ok: false }`:
   *
   *   - NO SCOPE SELECTED: refuses via the store's existing
   *     `reportHelmRefusal` with the existing `NO_SCOPE_MESSAGE`, exactly as
   *     `reload()` does. `incoming` is left unchanged.
   *   - PRELOAD API ABSENT: the store's existing `failClosed` path. `incoming`
   *     is left unchanged.
   *   - THE IPC LOAD FAILED (`EACCES`, `ENOENT`, anything else):
   *     `actionError` is set to the verbatim message AND `incoming` is set to
   *     `null`. It is not left holding an earlier read — a comparison against
   *     contents no longer known to be current is worse than no comparison.
   *
   * In every case `comparing` returns to `false`.
   *
   * CONCURRENCY: not de-duplicated, and it takes no in-flight lock beyond the
   * `comparing` flag. A second call while one is in flight is allowed; last
   * write wins. This differs deliberately from `refreshScopes`, which de-dupes
   * because a mount effect reaches it; `compare()` is reached only from an
   * explicit user action.
   */
  compare(): Promise<ActionResult<HelmDocument>>;
  edit(patch: Partial<HelmDraft>): void;
  discard(): void;
  /**
   * Never rejects. A CONFLICT arrives as `{ ok: false }` with the conflict
   * message, and the draft SURVIVES — losing a form's contents to a conflict
   * would make the safe path the expensive one.
   */
  save(): Promise<ActionResult<HelmSaveResult>>;
}

export declare function useHelm(): HelmView;
export declare function useHelmActions(): HelmActions;

export interface HelmPanelProps {
  view: HelmView;
  actions: HelmActions;
}

// ---------------------------------------------------------------------------
// Tokens this session adds to the frozen `renderer-theme.ts`
// ---------------------------------------------------------------------------

/**
 * The backlog predicted this exactly: "sub-session 3 will hit this the moment
 * it styles Beachcomber or Helm". Six renderer directories in sub-session 2
 * independently reached for bare `1px`, `0.04em` and `font-weight: 700` because
 * `TOKENS` had nothing to offer, and every reviewer called it a token-set gap
 * rather than a deviation.
 *
 * T4 ADDS these keys to the existing `TOKENS` object in `renderer-theme.ts` and
 * defines them in `styles/tokens.css`. It removes nothing and renames nothing,
 * so no sub-session 2 component is touched.
 *
 * A form-heavy panel needs all three groups: table rules and input borders
 * (border widths), column headings (tracking), and the weight contrast that
 * distinguishes a field label from its value.
 */
export const ADDED_TOKENS = {
  borderHairline: '--oc-border-hairline',
  borderThick: '--oc-border-thick',
  trackingTight: '--oc-tracking-tight',
  trackingWide: '--oc-tracking-wide',
  weightRegular: '--oc-weight-regular',
  weightMedium: '--oc-weight-medium',
  weightBold: '--oc-weight-bold',
} as const;

/**
 * Panel geometry, so the strip and the region agree without either task
 * measuring the other's markup — the same reason `podBarHeight` exists.
 */
export const ADDED_LAYOUT_TOKENS = {
  panelBarHeight: '--oc-panel-bar-height',
  panelMaxWidth: '--oc-panel-max-width',
} as const;

// ---------------------------------------------------------------------------
// Test ids
// ---------------------------------------------------------------------------

/**
 * The seam between T6/T7/T9 and T10, which writes the tests WITHOUT having seen
 * their markup. Suffix rules match `TEST_IDS` in `renderer-view.ts` and the
 * SAME `testId(base, suffix)` helper builds them.
 */
export const PANEL_TEST_IDS = {
  panelBar: 'panel-bar',
  /** One per panel: `panel-bar-open:beachcomber`. */
  panelBarOpen: 'panel-bar-open',
  panelBarClose: 'panel-bar-close',
  /** The region itself: `panel-region:helm`. */
  panelRegion: 'panel-region',

  beachcomberPanel: 'beachcomber-panel',
  beachcomberRescan: 'beachcomber-rescan',
  beachcomberError: 'beachcomber-error',
  /** `beachcomber-group:projects`. */
  beachcomberGroup: 'beachcomber-group',
  beachcomberGroupToggle: 'beachcomber-group-toggle',
  beachcomberGroupError: 'beachcomber-group-error',
  /** `beachcomber-row:<entryId>`. */
  beachcomberRow: 'beachcomber-row',
  beachcomberRowSelect: 'beachcomber-row-select',
  beachcomberRowBlocked: 'beachcomber-row-blocked',
  beachcomberRowOrphan: 'beachcomber-row-orphan',
  /** The "we could not read the real path, this is a guess" marker. */
  beachcomberRowUnverified: 'beachcomber-row-unverified',
  beachcomberPreviewButton: 'beachcomber-preview-button',
  beachcomberPreviewDialog: 'beachcomber-preview-dialog',
  /** `beachcomber-preview-item:<entryId>`. */
  beachcomberPreviewItem: 'beachcomber-preview-item',
  beachcomberPreviewRefused: 'beachcomber-preview-refused',
  beachcomberPreviewConfirm: 'beachcomber-preview-confirm',
  beachcomberPreviewCancel: 'beachcomber-preview-cancel',
  beachcomberResult: 'beachcomber-result',
  beachcomberResultFailure: 'beachcomber-result-failure',

  helmPanel: 'helm-panel',
  helmScopeSelect: 'helm-scope-select',
  /** `helm-scope-option:<scopeId>`. */
  helmScopeOption: 'helm-scope-option',
  helmScopePath: 'helm-scope-path',
  helmModel: 'helm-model',
  helmAllowList: 'helm-allow-list',
  helmAllowAdd: 'helm-allow-add',
  helmDenyList: 'helm-deny-list',
  helmDenyAdd: 'helm-deny-add',
  helmEnvList: 'helm-env-list',
  helmEnvAdd: 'helm-env-add',
  /** `helm-cross-session:<value>`. */
  helmCrossSession: 'helm-cross-session',
  helmHooksJson: 'helm-hooks-json',
  helmHooksError: 'helm-hooks-error',
  helmSave: 'helm-save',
  helmDiscard: 'helm-discard',
  helmReload: 'helm-reload',
  helmError: 'helm-error',
  helmConflict: 'helm-conflict',
  helmStale: 'helm-stale',
  helmBackupPath: 'helm-backup-path',
  helmReadOnly: 'helm-read-only',
} as const;

/**
 * Copy T10 asserts verbatim, for the statement a user could act on wrongly if
 * either task phrased it loosely.
 */
export const UNVERIFIED_PATH_NOTICE =
  "Orcastrate could not read this directory's real location, so the path below is a guess. It is not checked for orphan status.";

export const PANEL_SLOT_NAMES = ['panelBar', 'panel'] as const;

export type PanelSlotName = (typeof PANEL_SLOT_NAMES)[number];

/** Re-declared so T6/T7/T9 do not have to import from two contract files. */
export type PanelNode = ReactNode;
