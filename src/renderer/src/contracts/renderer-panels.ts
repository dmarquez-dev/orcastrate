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
}

export interface HelmActions {
  selectScope(scopeId: HelmScopeId): Promise<ActionResult<HelmDocument>>;
  /** Re-reads from disk, discarding the draft. The answer to a stale banner. */
  reload(): Promise<ActionResult<HelmDocument>>;
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
  helmCrossSessionCaveat: 'helm-cross-session-caveat',
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
 * Copy T10 asserts verbatim, for the two statements a user could act on wrongly
 * if either task phrased them loosely.
 */
export const UNVERIFIED_PATH_NOTICE =
  "Orcastrate could not read this directory's real location, so the path below is a guess. It is not checked for orphan status.";

export const CROSS_SESSION_HOLD_CAVEAT =
  'Not confirmed against Claude Code 2.1.235. Only "accept" and "refuse" were observed in the CLI.';

export const PANEL_SLOT_NAMES = ['panelBar', 'panel'] as const;

export type PanelSlotName = (typeof PANEL_SLOT_NAMES)[number];

/** Re-declared so T6/T7/T9 do not have to import from two contract files. */
export type PanelNode = ReactNode;
