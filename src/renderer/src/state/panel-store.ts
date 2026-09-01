/**
 * The panel store — RAW Beachcomber and Helm state, and the only module that
 * reaches `beachcomber.*` and `helm.*` on the bridge.
 *
 * It mirrors `store.ts` deliberately: a plain external store outside the render
 * tree, holding nothing derived, reached only from an explicit lifecycle
 * (`retainBeachcomber` / `retainHelm`, called from a mount effect) or an
 * explicit event (an action). `panel-provider.tsx` derives every view model on
 * read, so `selectedBytes`, `dirty`, `blocked` and the group list cannot go
 * stale.
 *
 * WHY IT IS NOT PART OF `WorkspaceStateStore`: the frozen `renderer-state.ts`
 * types `WorkspaceStore` exactly, and panel state is not on it. Server data for
 * two panels the user may never open does not belong in the workspace's
 * context value, and merging them would put a Beachcomber scan behind every
 * Pod-bar re-render.
 *
 * ERROR DISCIPLINE: every IPC call goes through `safeInvoke`, so no action
 * rejects and no action throws — including with no bridge at all, where every
 * action fails closed with a message and both views report phase `'error'`.
 *
 * PATHS: `displayPath` is an opaque display string. This module renders it
 * outward and never composes, parses, joins or resolves one, and imports no
 * `node:` builtin.
 */

import type {
  BeachcomberEntryId,
  BeachcomberPreview,
  BeachcomberScan,
  BeachcomberTrashResult,
} from '@shared/contracts/beachcomber';
import type {
  HelmChangedPush,
  HelmDocument,
  HelmManagedFields,
  HelmSaveResult,
  HelmScope,
  HelmScopeId,
  HelmValidationIssue,
} from '@shared/contracts/helm';
import { CROSS_SESSION_INBOUND_CONFIRMED } from '@shared/contracts/helm';
import type { IpcError, OrcastrateApi, Unsubscribe } from '@shared/contracts/ipc';

import type { ActionResult, LoadPhase } from '../contracts/renderer-state';
import type {
  BeachcomberActions,
  HelmActions,
  HelmDraft,
} from '../contracts/renderer-panels';
import { CROSS_SESSION_HOLD_CAVEAT } from '../contracts/renderer-panels';

import { NO_BRIDGE_MESSAGE, internalError, safeInvoke } from './store';

// ---------------------------------------------------------------------------
// Messages. Named constants because two of them are the difference between a
// user rescanning and a user filing a bug.
// ---------------------------------------------------------------------------

export const NO_SCAN_MESSAGE =
  'There is nothing to act on yet. Run a scan first.';

export const NO_SELECTION_MESSAGE =
  'Nothing is selected. Choose at least one row to preview.';

/**
 * `trashPreviewed` with no preview never reaches the bridge. Design section 6
 * requires "a preview of exactly what will be removed before any action", so a
 * trash with nothing previewed is a bug in the caller, not a request to send.
 */
export const NO_PREVIEW_MESSAGE =
  'Nothing was previewed. Preview the selection before clearing it.';

export const NOTHING_TO_TRASH_MESSAGE =
  'The preview refused every selected entry, so there is nothing to clear.';

export const NO_SCOPE_MESSAGE = 'No settings file is selected.';

export const READ_ONLY_MESSAGE =
  'This file could not be parsed, so Helm will not write over it.';

export const BLOCKED_SAVE_MESSAGE =
  'Fix the errors on this form before saving.';

// ---------------------------------------------------------------------------
// Raw state
// ---------------------------------------------------------------------------

export interface BeachcomberPanelState {
  phase: LoadPhase;
  scan: BeachcomberScan | null;
  error: IpcError | null;
  /**
   * Ids the user has picked. Genuine state, not a derivation — but pruned
   * against every scan that lands, so an id the new scan did not mint can
   * never survive into a preview or a trash.
   */
  selection: readonly BeachcomberEntryId[];
  preview: BeachcomberPreview | null;
  previewing: boolean;
  trashing: boolean;
  lastResult: BeachcomberTrashResult | null;
  actionError: string | null;
}

export interface HelmPanelState {
  phase: LoadPhase;
  scopes: HelmScope[];
  error: IpcError | null;
  selectedScopeId: HelmScopeId | null;
  document: HelmDocument | null;
  loadingDocument: boolean;
  draft: HelmDraft | null;
  saving: boolean;
  stale: boolean;
  conflict: string | null;
  lastSave: HelmSaveResult | null;
  actionError: string | null;
  /**
   * The freshest on-disk document, fetched by `compare()` and NEVER seeded into
   * `draft`. One writer: this store. Cleared by exactly four events — entering
   * `loadDocument` (which is `selectScope` and `reload` both), `discard`, and a
   * SUCCESSFUL `save`. A FAILED save leaves it alone: a conflict is the case
   * the comparison exists for.
   */
  incoming: HelmDocument | null;
  /** True while a `compare()` is in flight. Mirrors `loadingDocument`. */
  comparing: boolean;
}

export interface PanelState {
  beachcomber: BeachcomberPanelState;
  helm: HelmPanelState;
}

function newBeachcomberState(error: IpcError | null): BeachcomberPanelState {
  return {
    phase: error === null ? 'idle' : 'error',
    scan: null,
    error,
    selection: [],
    preview: null,
    previewing: false,
    trashing: false,
    lastResult: null,
    actionError: error === null ? null : error.message,
  };
}

function newHelmState(error: IpcError | null): HelmPanelState {
  return {
    phase: error === null ? 'idle' : 'error',
    scopes: [],
    error,
    selectedScopeId: null,
    document: null,
    loadingDocument: false,
    draft: null,
    saving: false,
    stale: false,
    conflict: null,
    lastSave: null,
    actionError: error === null ? null : error.message,
    incoming: null,
    comparing: false,
  };
}

// ---------------------------------------------------------------------------
// The store
// ---------------------------------------------------------------------------

export class PanelStateStore {
  private state: PanelState;
  private readonly listeners = new Set<() => void>();
  private readonly api: OrcastrateApi | null;
  private unsubscribes: Unsubscribe[] = [];
  private started = false;

  /** How many mounted `useBeachcomber` / `useHelm` consumers exist. */
  private beachcomberMounts = 0;
  private helmMounts = 0;

  /** In-flight de-duplication, so a double click cannot issue two scans. */
  private scanning: Promise<ActionResult<BeachcomberScan>> | null = null;
  private loadingScopes: Promise<ActionResult<HelmScope[]>> | null = null;

  readonly beachcomberActions: BeachcomberActions;
  readonly helmActions: HelmActions;

  constructor(api: OrcastrateApi | null) {
    this.api = api;
    const bridgeError = api === null ? internalError(NO_BRIDGE_MESSAGE) : null;
    // With no bridge BOTH views must render in phase 'error' rather than the
    // provider throwing during init — a throw there blanks the window with no
    // diagnosis.
    this.state = {
      beachcomber: newBeachcomberState(bridgeError),
      helm: newHelmState(bridgeError),
    };
    this.beachcomberActions = this.buildBeachcomberActions();
    this.helmActions = this.buildHelmActions();
  }

  get hasBridge(): boolean {
    return this.api !== null;
  }

  // --- subscription surface (useSyncExternalStore) -------------------------

  readonly getState = (): PanelState => this.state;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private commit(next: PanelState): void {
    if (next === this.state) return;
    this.state = next;
    for (const listener of [...this.listeners]) listener();
  }

  private patchBeachcomber(
    fn: (current: BeachcomberPanelState) => BeachcomberPanelState,
  ): void {
    const next = fn(this.state.beachcomber);
    if (next === this.state.beachcomber) return;
    this.commit({ ...this.state, beachcomber: next });
  }

  private patchHelm(fn: (current: HelmPanelState) => HelmPanelState): void {
    const next = fn(this.state.helm);
    if (next === this.state.helm) return;
    this.commit({ ...this.state, helm: next });
  }

  // --- lifecycle -----------------------------------------------------------

  /**
   * Mount. Subscribes to `helmChanged` exactly once — the sixth push channel,
   * and the only one this store owns. Idempotent while started, so React's
   * double-invoke cannot double-subscribe.
   */
  start(): void {
    if (this.started) return;
    this.started = true;
    const api = this.api;
    if (api === null) return;
    this.unsubscribes = [api.on.helmChanged((push) => this.onHelmChanged(push))];
  }

  /** Unmount. Every `Unsubscribe` returned on mount is called exactly once. */
  stop(): void {
    if (!this.started) return;
    this.started = false;
    const subs = this.unsubscribes;
    this.unsubscribes = [];
    for (const unsubscribe of subs) unsubscribe();
  }

  /**
   * ADVISORY ONLY (see the `helm.ts` header): the push makes the form say it is
   * stale, it never makes a save safe. Applied only when it names the scope the
   * form actually has open — a write to some other Pod's settings file is not
   * this form's problem, and saying it was would train the user to ignore the
   * banner.
   */
  private onHelmChanged(push: HelmChangedPush): void {
    this.patchHelm((current) => {
      if (current.selectedScopeId === null) return current;
      if (push.scopeId !== current.selectedScopeId) return current;
      if (current.stale) return current;
      return { ...current, stale: true };
    });
  }

  // --- panel-open lifecycle ------------------------------------------------

  /**
   * Called from `useBeachcomber`'s mount effect. THE PANEL OPENING IS THE
   * EVENT, not the render: the first mount issues exactly one scan, every
   * re-render issues none, and a later reopen scans again because the disk has
   * moved on in between.
   */
  retainBeachcomber(): () => void {
    this.beachcomberMounts += 1;
    if (this.beachcomberMounts === 1 && this.state.beachcomber.phase === 'idle') {
      void this.beachcomberActions.rescan();
    }
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.beachcomberMounts -= 1;
      if (this.beachcomberMounts === 0) this.resetBeachcomberForReopen();
    };
  }

  /** Called from `useHelm`'s mount effect. Same rule, one `listScopes`. */
  retainHelm(): () => void {
    this.helmMounts += 1;
    if (this.helmMounts === 1 && this.state.helm.phase === 'idle') {
      void this.refreshScopes();
    }
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.helmMounts -= 1;
      if (this.helmMounts === 0) this.resetHelmForReopen();
    };
  }

  /**
   * Closing the panel drops the SCAN, because its ids are scan-scoped and a
   * stale id answers NOT_FOUND. It keeps nothing that could be acted on later.
   */
  private resetBeachcomberForReopen(): void {
    if (this.api === null) return;
    this.patchBeachcomber((current) =>
      current.phase === 'idle' ? current : { ...newBeachcomberState(null), lastResult: current.lastResult },
    );
  }

  /** Closing Helm drops the loaded document and any unsaved draft with it. */
  private resetHelmForReopen(): void {
    if (this.api === null) return;
    this.patchHelm((current) => (current.phase === 'idle' ? current : newHelmState(null)));
  }

  // --- Beachcomber actions -------------------------------------------------

  private failClosed<T>(message = NO_BRIDGE_MESSAGE): ActionResult<T> {
    return { ok: false, error: internalError(message) };
  }

  private buildBeachcomberActions(): BeachcomberActions {
    const store = this;

    return {
      async rescan(): Promise<ActionResult<BeachcomberScan>> {
        const api = store.api;
        if (api === null) return store.failClosed<BeachcomberScan>();
        // De-duplicated: a second click while a scan is in flight joins the
        // first rather than issuing another.
        const inflight = store.scanning;
        if (inflight !== null) return inflight;

        const run = (async (): Promise<ActionResult<BeachcomberScan>> => {
          // The existing rows stay visible while loading — `Loadable.value` is
          // always renderable, so a rescan never blanks the panel.
          store.patchBeachcomber((current) => ({
            ...current,
            phase: 'loading',
            // `Loadable.error` is non-null IF AND ONLY IF phase is 'error'.
            error: null,
            preview: null,
            actionError: null,
          }));
          const result = await safeInvoke(() => api.beachcomber.scan());
          if (!result.ok) {
            store.patchBeachcomber((current) => ({
              ...current,
              phase: 'error',
              error: result.error,
              actionError: result.error.message,
            }));
            return result;
          }
          store.applyScan(result.value);
          return result;
        })();

        store.scanning = run;
        try {
          return await run;
        } finally {
          store.scanning = null;
        }
      },

      /**
       * A BLOCKED ROW CAN NEVER BE SELECTED. The no-op is here rather than in
       * the panel because a second caller — a keyboard handler, a select-all —
       * would otherwise have to remember the rule too.
       */
      toggle(id: BeachcomberEntryId): void {
        store.patchBeachcomber((current) => {
          if (!isSelectable(current.scan, id)) return current;
          const has = current.selection.includes(id);
          const selection = has
            ? current.selection.filter((candidate) => candidate !== id)
            : [...current.selection, id];
          return clearPreview({ ...current, selection });
        });
      },

      toggleGroup(root): void {
        store.patchBeachcomber((current) => {
          const scan = current.scan;
          if (scan === null) return current;
          const selectable = scan.entries
            .filter((entry) => entry.root === root && entry.blocked === null)
            .map((entry) => entry.id);
          if (selectable.length === 0) return current;

          const every = selectable.every((id) => current.selection.includes(id));
          const selection = every
            ? current.selection.filter((id) => !selectable.includes(id))
            : [...current.selection, ...selectable.filter((id) => !current.selection.includes(id))];
          return clearPreview({ ...current, selection });
        });
      },

      clearSelection(): void {
        store.patchBeachcomber((current) => {
          if (current.selection.length === 0 && current.preview === null) return current;
          return clearPreview({ ...current, selection: [] });
        });
      },

      async requestPreview(): Promise<ActionResult<BeachcomberPreview>> {
        const api = store.api;
        if (api === null) return store.failClosed<BeachcomberPreview>();
        const { scan, selection } = store.state.beachcomber;
        if (scan === null) return store.reportBeachcomberRefusal<BeachcomberPreview>(NO_SCAN_MESSAGE);
        const ids = selection.filter((id) => isSelectable(scan, id));
        if (ids.length === 0) {
          return store.reportBeachcomberRefusal<BeachcomberPreview>(NO_SELECTION_MESSAGE);
        }

        store.patchBeachcomber((current) => ({ ...current, previewing: true, actionError: null }));
        const result = await safeInvoke(() =>
          api.beachcomber.preview({ scanId: scan.scanId, ids }),
        );
        store.patchBeachcomber((current) => ({
          ...current,
          previewing: false,
          preview: result.ok ? result.value : null,
          actionError: result.ok ? null : result.error.message,
        }));
        return result;
      },

      dismissPreview(): void {
        store.patchBeachcomber((current) =>
          current.preview === null ? current : { ...current, preview: null },
        );
      },

      async trashPreviewed(): Promise<ActionResult<BeachcomberTrashResult>> {
        const api = store.api;
        if (api === null) return store.failClosed<BeachcomberTrashResult>();
        const { scan, preview } = store.state.beachcomber;
        // NEVER reaches the bridge without a preview. This is the guard design
        // section 6 asks for, and it is checked before the api is touched.
        if (preview === null) {
          return store.reportBeachcomberRefusal<BeachcomberTrashResult>(NO_PREVIEW_MESSAGE);
        }
        if (scan === null) {
          return store.reportBeachcomberRefusal<BeachcomberTrashResult>(NO_SCAN_MESSAGE);
        }
        // Only what the preview ACCEPTED. A refused id is one main already said
        // no to; sending it back would be asking the same question twice.
        const ids = preview.items.map((item) => item.id);
        if (ids.length === 0) {
          return store.reportBeachcomberRefusal<BeachcomberTrashResult>(NOTHING_TO_TRASH_MESSAGE);
        }

        store.patchBeachcomber((current) => ({ ...current, trashing: true, actionError: null }));
        const result = await safeInvoke(() =>
          api.beachcomber.trash({ scanId: scan.scanId, ids }),
        );
        if (!result.ok) {
          store.patchBeachcomber((current) => ({
            ...current,
            trashing: false,
            actionError: result.error.message,
          }));
          return result;
        }
        // The result carries a FRESH scan, so the panel never renders rows that
        // are now in the recycle bin, and the ids change underneath us.
        store.patchBeachcomber((current) => ({
          ...pruneSelection({ ...current, scan: result.value.scan }),
          phase: 'ready',
          error: null,
          trashing: false,
          preview: null,
          lastResult: result.value,
          actionError:
            result.value.failed.length === 0 ? null : result.value.failed[0]?.message ?? null,
        }));
        return result;
      },
    };
  }

  private reportBeachcomberRefusal<T>(message: string): ActionResult<T> {
    this.patchBeachcomber((current) => ({ ...current, actionError: message }));
    return { ok: false, error: internalError(message) };
  }

  private applyScan(scan: BeachcomberScan): void {
    this.patchBeachcomber((current) => ({
      ...pruneSelection({ ...current, scan }),
      phase: 'ready',
      error: null,
      // A scan mints a fresh id namespace, so a preview taken against the old
      // one is not merely stale — its ids no longer exist.
      preview: null,
      actionError: null,
    }));
  }

  // --- Helm actions --------------------------------------------------------

  /**
   * The scope list. Reached from `retainHelm` — opening the panel — and never
   * from a render. Public because it is the whole of `helmScopes`' error path
   * and the completeness sweep in `store.test.ts` has to be able to drive it.
   */
  async refreshScopes(): Promise<ActionResult<HelmScope[]>> {
    const api = this.api;
    if (api === null) return this.failClosed<HelmScope[]>();
    const inflight = this.loadingScopes;
    if (inflight !== null) return inflight;

    const run = (async (): Promise<ActionResult<HelmScope[]>> => {
      this.patchHelm((current) => ({
        ...current,
        phase: 'loading',
        // `Loadable.error` is non-null IF AND ONLY IF phase is 'error'.
        error: null,
        actionError: null,
      }));
      const result = await safeInvoke(() => api.helm.listScopes());
      if (!result.ok) {
        this.patchHelm((current) => ({
          ...current,
          phase: 'error',
          error: result.error,
          actionError: result.error.message,
        }));
        return result;
      }
      this.patchHelm((current) => ({
        ...current,
        phase: 'ready',
        error: null,
        scopes: result.value,
        actionError: null,
      }));
      return result;
    })();

    this.loadingScopes = run;
    try {
      return await run;
    } finally {
      this.loadingScopes = null;
    }
  }

  private async loadDocument(scopeId: HelmScopeId): Promise<ActionResult<HelmDocument>> {
    const api = this.api;
    if (api === null) return this.failClosed<HelmDocument>();

    // CAPTURED BEFORE THE PRE-AWAIT PATCH. That patch overwrites
    // `selectedScopeId` with `scopeId`, so a comparison made in the failure
    // branch below against `state.helm.selectedScopeId` would report "same
    // scope" every single time — including across a real scope change, where
    // retaining the draft would show scope A's typed values under scope B's
    // name.
    const previousScopeId = this.state.helm.selectedScopeId;

    this.patchHelm((current) => ({
      ...current,
      selectedScopeId: scopeId,
      loadingDocument: true,
      // A fresh load answers the stale banner and the conflict banner both.
      stale: false,
      conflict: null,
      // Both entry points into this method — `selectScope` and `reload` — are
      // clearing events for the comparison, success or failure alike.
      incoming: null,
      actionError: null,
    }));

    const result = await safeInvoke(() => api.helm.load(scopeId));
    if (!result.ok) {
      // SAME SCOPE (`reload`, or re-selecting the current scope): the read
      // wrote nothing, so the draft is not stale against anything and BOTH
      // `document` and `draft` are retained. A SCOPE CHANGE still clears both.
      const retainDraft = previousScopeId === scopeId;
      this.patchHelm((current) => ({
        ...current,
        loadingDocument: false,
        document: retainDraft ? current.document : null,
        draft: retainDraft ? current.draft : null,
        actionError: result.error.message,
      }));
      return result;
    }
    this.patchHelm((current) => ({
      ...current,
      loadingDocument: false,
      document: result.value,
      draft: seedDraft(result.value),
      stale: false,
      conflict: null,
      actionError: null,
    }));
    return result;
  }

  private buildHelmActions(): HelmActions {
    const store = this;

    return {
      async selectScope(scopeId: HelmScopeId): Promise<ActionResult<HelmDocument>> {
        return store.loadDocument(scopeId);
      },

      async reload(): Promise<ActionResult<HelmDocument>> {
        const scopeId = store.state.helm.selectedScopeId;
        if (scopeId === null) return store.reportHelmRefusal<HelmDocument>(NO_SCOPE_MESSAGE);
        return store.loadDocument(scopeId);
      },

      /**
       * Re-reads the selected scope WITHOUT touching `document` or `draft` on
       * any path. The result lands in `incoming`, the "current contents" half
       * of the side-by-side; `draft` is the "pending edit" half.
       *
       * NOT de-duplicated and takes no in-flight lock beyond `comparing`: last
       * write wins. Unlike `refreshScopes`, no mount effect reaches this — it
       * is called only from an explicit user action.
       */
      async compare(): Promise<ActionResult<HelmDocument>> {
        const api = store.api;
        if (api === null) return store.failClosed<HelmDocument>();
        const scopeId = store.state.helm.selectedScopeId;
        if (scopeId === null) return store.reportHelmRefusal<HelmDocument>(NO_SCOPE_MESSAGE);

        store.patchHelm((current) => ({ ...current, comparing: true, actionError: null }));
        const result = await safeInvoke(() => api.helm.load(scopeId));
        if (!result.ok) {
          // `incoming` is NOT left holding an earlier read: a comparison
          // against contents no longer known to be current is worse than none.
          store.patchHelm((current) => ({
            ...current,
            comparing: false,
            incoming: null,
            actionError: result.error.message,
          }));
          return result;
        }
        store.patchHelm((current) => ({
          ...current,
          comparing: false,
          incoming: result.value,
          actionError: null,
        }));
        return result;
      },

      /**
       * The draft is the working copy; `document` is what was LOADED and does
       * not move until a reload or a successful save. Keeping them apart is
       * what makes `dirty` answerable at all.
       */
      edit(patch: Partial<HelmDraft>): void {
        store.patchHelm((current) => {
          if (current.draft === null) return current;
          const draft: HelmDraft = {
            managed: patch.managed ?? current.draft.managed,
            hooksJson: patch.hooksJson ?? current.draft.hooksJson,
          };
          return { ...current, draft };
        });
      },

      discard(): void {
        store.patchHelm((current) => {
          // The pending edit is gone either way, so the comparison it was half
          // of is meaningless either way.
          if (current.document === null) {
            return current.incoming === null ? current : { ...current, incoming: null };
          }
          return {
            ...current,
            draft: seedDraft(current.document),
            conflict: null,
            incoming: null,
          };
        });
      },

      async save(): Promise<ActionResult<HelmSaveResult>> {
        const api = store.api;
        if (api === null) return store.failClosed<HelmSaveResult>();
        const { document, draft, selectedScopeId } = store.state.helm;
        if (document === null || draft === null || selectedScopeId === null) {
          return store.reportHelmRefusal<HelmSaveResult>(NO_SCOPE_MESSAGE);
        }
        // Helm must never "fix" a file it could not read: the atomic write
        // would destroy hand-written content it never understood.
        if (document.parseError !== null) {
          return store.reportHelmRefusal<HelmSaveResult>(READ_ONLY_MESSAGE);
        }
        if (validateDraft(draft, document).some((issue) => issue.severity === 'error')) {
          return store.reportHelmRefusal<HelmSaveResult>(BLOCKED_SAVE_MESSAGE);
        }

        store.patchHelm((current) => ({ ...current, saving: true, actionError: null }));
        const result = await safeInvoke(() =>
          api.helm.save({
            scopeId: selectedScopeId,
            // Echoed exactly as `load` returned it, never constructed.
            revision: document.revision,
            managed: draft.managed,
            // Every top-level key Helm does not manage, handed back verbatim.
            unmanaged: document.unmanaged,
            hooksJson: draft.hooksJson,
          }),
        );

        if (!result.ok) {
          const conflicted = result.error.code === 'CONFLICT';
          // THE DRAFT SURVIVES. Losing a form's contents to a conflict would
          // make the safe path the expensive one, and `document` is untouched
          // so `dirty` stays true on its own.
          store.patchHelm((current) => ({
            ...current,
            saving: false,
            stale: conflicted ? true : current.stale,
            conflict: conflicted ? result.error.message : current.conflict,
            actionError: result.error.message,
          }));
          return result;
        }

        store.patchHelm((current) => ({
          ...current,
          saving: false,
          document: result.value.document,
          draft: seedDraft(result.value.document),
          stale: false,
          conflict: null,
          lastSave: result.value,
          actionError: null,
          // The write resolved the divergence; the returned document is the
          // new truth. (The FAILED branch above deliberately leaves `incoming`
          // alone — a conflict is when the comparison matters most.)
          incoming: null,
        }));
        return result;
      },
    };
  }

  private reportHelmRefusal<T>(message: string): ActionResult<T> {
    this.patchHelm((current) => ({ ...current, actionError: message }));
    return { ok: false, error: internalError(message) };
  }
}

// ---------------------------------------------------------------------------
// Free helpers — pure, and shared with the derivation in `panel-provider.tsx`
// ---------------------------------------------------------------------------

function clearPreview(current: BeachcomberPanelState): BeachcomberPanelState {
  // ANY SELECTION CHANGE CLEARS THE PREVIEW, so a confirm can never act on a
  // preview computed for a different set.
  return current.preview === null ? current : { ...current, preview: null };
}

function pruneSelection(current: BeachcomberPanelState): BeachcomberPanelState {
  const scan = current.scan;
  const kept = current.selection.filter((id) => isSelectable(scan, id));
  if (kept.length === current.selection.length) return current;
  return { ...current, selection: kept };
}

/** True only for an id THIS scan minted for a row nothing is blocking. */
export function isSelectable(scan: BeachcomberScan | null, id: BeachcomberEntryId): boolean {
  if (scan === null) return false;
  const entry = scan.entries.find((candidate) => candidate.id === id);
  return entry !== undefined && entry.blocked === null;
}

export function seedDraft(document: HelmDocument): HelmDraft {
  return {
    managed: {
      model: document.managed.model,
      permissionsAllow: [...document.managed.permissionsAllow],
      permissionsDeny: [...document.managed.permissionsDeny],
      env: { ...document.managed.env },
      crossSessionInbound: document.managed.crossSessionInbound,
    },
    hooksJson: document.hooksJson,
  };
}

function sameStrings(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function sameEnv(a: Record<string, string>, b: Record<string, string>): boolean {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((key) => Object.hasOwn(b, key) && a[key] === b[key]);
}

function sameManaged(a: HelmManagedFields, b: HelmManagedFields): boolean {
  return (
    a.model === b.model &&
    a.crossSessionInbound === b.crossSessionInbound &&
    sameStrings(a.permissionsAllow, b.permissionsAllow) &&
    sameStrings(a.permissionsDeny, b.permissionsDeny) &&
    sameEnv(a.env, b.env)
  );
}

/** DERIVED, never stored: the draft is compared against what was loaded. */
export function isDirty(document: HelmDocument | null, draft: HelmDraft | null): boolean {
  if (document === null || draft === null) return false;
  return !(sameManaged(document.managed, draft.managed) && document.hooksJson === draft.hooksJson);
}

/**
 * DERIVED, never stored. `error` blocks the save; `warning` does not — an
 * unverified-but-plausible `crossSessionInbound: 'hold'` is the user's call to
 * make, and refusing it would make Helm less capable than a text editor.
 *
 * Main validates again at save time and is the authority; this exists so the
 * form can say what is wrong while the user is still typing.
 */
export function validateDraft(
  draft: HelmDraft | null,
  document: HelmDocument | null,
): HelmValidationIssue[] {
  const issues: HelmValidationIssue[] = [];
  if (document !== null && document.parseError !== null) {
    issues.push({ field: 'parseError', severity: 'error', message: document.parseError });
  }
  if (draft === null) return issues;

  const model = draft.managed.model;
  if (model !== null && model.trim() === '') {
    issues.push({
      field: 'model',
      severity: 'error',
      message: 'Model cannot be blank. Clear the field to use the default model.',
    });
  }

  for (const [field, rules] of [
    ['permissionsAllow', draft.managed.permissionsAllow],
    ['permissionsDeny', draft.managed.permissionsDeny],
  ] as const) {
    if (rules.some((rule) => rule.trim() === '')) {
      issues.push({
        field,
        severity: 'error',
        message: 'A permission rule cannot be empty. Remove the blank row or fill it in.',
      });
    }
  }

  if (Object.keys(draft.managed.env).some((key) => key.trim() === '')) {
    issues.push({
      field: 'env',
      severity: 'error',
      message: 'An environment variable name cannot be empty.',
    });
  }

  const inbound = draft.managed.crossSessionInbound;
  if (inbound !== null && !CROSS_SESSION_INBOUND_CONFIRMED.includes(inbound)) {
    issues.push({
      field: 'crossSessionInbound',
      severity: 'warning',
      message: CROSS_SESSION_HOLD_CAVEAT,
    });
  }

  const hooks = draft.hooksJson.trim();
  if (hooks !== '') {
    let parsed: unknown;
    try {
      parsed = JSON.parse(hooks);
    } catch (cause) {
      issues.push({
        field: 'hooksJson',
        severity: 'error',
        message: cause instanceof Error ? cause.message : 'Hooks must be valid JSON.',
      });
      return issues;
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      issues.push({
        field: 'hooksJson',
        severity: 'error',
        message: 'Hooks must be a JSON object.',
      });
    }
  }

  return issues;
}
