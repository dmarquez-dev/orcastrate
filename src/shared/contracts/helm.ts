/**
 * CONTRACT — Helm (design section 7). Frozen at Gate 2.
 *
 * Lands verbatim at `src/shared/contracts/helm.ts`.
 *
 * Boundary between:
 *   - T3 (PRODUCER)  `src/main/helm/**` — implements `HelmService`.
 *   - T1             puts `HelmApi` on `window.orcastrate`, registers the three
 *                    invoke channels and the one push channel.
 *   - T5             the renderer state layer.
 *   - T7             the settings form.
 *   - T10            the failure-path suite.
 *
 * ===========================================================================
 * THE NO-PATHS RULE, HELD BY NAMING SCOPES INSTEAD OF FILES
 * ===========================================================================
 *
 * The renderer never says WHICH FILE to load. It says WHICH SCOPE: the user
 * scope, or one of a Pod's two project files. Main resolves a scope to a path
 * — `~/.claude/settings.json`, or `<pod.cwd>/.claude/settings.json`, or
 * `settings.local.json` — from the Pod row it already holds. A renderer that
 * wanted Helm to write an arbitrary file on disk has no way to name one.
 * `HelmScope.displayPath` travels outward for the user to read and is never
 * accepted inward.
 *
 * ===========================================================================
 * WRITE SAFETY (design section 7). ALL FOUR, EVERY WRITE, NO EXCEPTIONS.
 * ===========================================================================
 *
 *  1. ATOMIC. Write to a temp file IN THE SAME DIRECTORY, fsync, then rename
 *     over the target. Same directory because rename is only atomic within one
 *     filesystem, and a temp directory may be on another volume.
 *  2. BACKUP FIRST. A timestamped copy beside the file before the rename. If
 *     the backup cannot be written, THE WRITE DOES NOT HAPPEN.
 *  3. RE-READ AND COMPARE. Immediately before writing, re-read the file and
 *     compare it against the copy that was loaded. Different means CONFLICT and
 *     a warning — never a silent overwrite.
 *  4. VERBATIM OS ERRORS. An `EACCES`/`EPERM`/`EROFS` message reaches the user
 *     unmodified. A rewritten error is a support ticket nobody can answer.
 *
 * ===========================================================================
 * HELM IS NOT THE ONLY WRITER, AND THE OTHER ONE IS INSIDE THIS APP
 * ===========================================================================
 *
 * `alwaysAllowUpdates` (`src/main/pod/options.ts:170-185`) returns an
 * `addRules` update with `destination: 'projectSettings'`, so every time the
 * user clicks "Allow always" on a permission card THE CLI REWRITES the very
 * `settings.json` a Helm form may have open. This is not the hypothetical
 * external-editor case; it is one click away, in the same window, and the user
 * will not connect the two events.
 *
 * The answer is TWO MECHANISMS, and they are not redundant:
 *
 *   - AUTHORITATIVE: rule 3 above. The re-read-and-compare at save time cannot
 *     be raced and cannot be skipped, so no in-app write is ever lost. This is
 *     the guarantee.
 *   - ADVISORY: `HelmService.watch` — a best-effort `fs.watch` on the loaded
 *     file that emits `HelmChangedPush`, so the form goes stale IMMEDIATELY
 *     rather than at save. This is a courtesy.
 *
 * A watcher was chosen over having `PodManager` announce its own `allow_always`
 * decisions because one mechanism then covers both writers — the CLI and an
 * external editor — and because the alternative would have meant this session
 * editing `src/main/pod-manager/**`, which nothing else here touches.
 *
 * THE WATCH IS NEVER A GUARD. `fs.watch` misses events on some platforms and
 * coalesces on others. T3's acceptance criteria require the conflict path to be
 * proven WITH THE WATCHER DISABLED, so a passing watcher can never be what
 * makes the safety test green.
 *
 * ===========================================================================
 * PROVENANCE
 * ===========================================================================
 *
 * Frozen 2026-08-19 by sub-session 3. AMENDED by session
 * `2026-08-31-orcastrate-helm-draft-safety` (approved at its Gate 2), because
 * this file was frozen carrying a promise it could not keep: the
 * `HELM_CONFLICT_CODE` docblock promised the panel would show "the current
 * contents beside the pending edit", while the only action that re-read the
 * file — `reload()` — destroyed the draft it would have been compared against.
 * The amendment adds `compare()` (declared in
 * `src/renderer/src/contracts/renderer-panels.ts`) rather than retracting the
 * promise, and corrects `HelmValidationIssue.field`, which documented five of
 * the seven names the shipped validators emit. Everything else here is
 * unchanged from the 2026-08-19 freeze.
 */

import type { PodId, Timestamp } from './events';
import type { IpcResult } from './ipc';
import type { PanelClock, PodDirectoryProvider } from './panel-host';

// ---------------------------------------------------------------------------
// Scopes
// ---------------------------------------------------------------------------

/**
 * Which settings file. `settingsLocal` is `settings.local.json`, the
 * gitignored per-developer overlay.
 */
export type HelmScopeKind = 'user' | 'project' | 'projectLocal';

/**
 * Opaque, stable for the lifetime of the app: `'user'`,
 * `'project:<podId>'`, `'projectLocal:<podId>'`. The renderer treats it as a
 * key and never constructs one — it picks one out of `listScopes()`.
 */
export type HelmScopeId = string;

export interface HelmScope {
  id: HelmScopeId;
  kind: HelmScopeKind;
  /** null for `user`. */
  podId: PodId | null;
  /** The Pod's title, or 'All projects' for the user scope. */
  label: string;
  /** DISPLAY ONLY. Never accepted inward. */
  displayPath: string;
  /**
   * False is the NORMAL case, not an error case: this repo has no `.claude/`
   * at all, and the machine's `~/.claude/settings.json` has no `permissions`
   * key. A Helm that treats absence as a failure is wrong about the world.
   */
  exists: boolean;
}

// ---------------------------------------------------------------------------
// Managed fields
// ---------------------------------------------------------------------------

/**
 * The policy governing messages sent from another Claude Code session (design
 * section 7). Surfaced because it is a real security control that is otherwise
 * only reachable by hand-editing JSON.
 *
 * CONFIRMED against CLI 2.1.318 (`claude --version` → `2.1.318 (Claude
 * Code)`): its binary declares `["accept","hold","refuse"]` as the value set of
 * the `crossSessionInbound` setting, and describes `hold` as parking
 * cross-session messages for review without letting Claude act on them.
 *
 * So all three are accepted settings values, the form offers them alike, and
 * this list is the only declaration of the value set.
 */
export const CROSS_SESSION_INBOUND_VALUES = ['accept', 'hold', 'refuse'] as const;
export type CrossSessionInbound = (typeof CROSS_SESSION_INBOUND_VALUES)[number];

/**
 * The fields Helm edits as a FORM. Everything else in the file is `unmanaged`
 * and survives a round trip untouched (design section 9).
 *
 * `null` and `[]` and `{}` mean THE KEY IS ABSENT, which is different from the
 * key being present and empty only in ways no consumer of these files cares
 * about — and collapsing them is what lets an absent-key file round-trip
 * without Helm inventing keys the user never asked for.
 */
export interface HelmManagedFields {
  model: string | null;
  permissionsAllow: string[];
  permissionsDeny: string[];
  env: Record<string, string>;
  crossSessionInbound: CrossSessionInbound | null;
}

// ---------------------------------------------------------------------------
// Documents and revisions
// ---------------------------------------------------------------------------

/**
 * The identity of the bytes that were loaded. OPAQUE — the renderer stores it
 * and hands it back on save, and reads nothing out of it.
 *
 * `null` means "the file did not exist when I loaded it". Saving with a null
 * revision succeeds only if the file STILL does not exist; if something created
 * it in between, that is a CONFLICT like any other. Absence is a state that can
 * be raced too.
 */
export interface HelmRevision {
  sha256: string;
  sizeBytes: number;
  mtimeMs: number;
}

export interface HelmDocument {
  scope: HelmScope;
  revision: HelmRevision | null;
  managed: HelmManagedFields;
  /**
   * Every top-level key Helm does not manage, verbatim as parsed. Handed back
   * unchanged on save. This is how "preserves unmanaged keys" is achieved
   * without Helm having to know what they mean.
   *
   * `hooks` is NOT here — it is `hooksJson` below, because the form edits it.
   */
  unmanaged: Record<string, unknown>;
  /**
   * The `hooks` value, pretty-printed as raw JSON text, or `''` when the key is
   * absent. A validated raw-JSON pane, NOT a builder: a partial builder would
   * misrepresent what hooks can express (design section 7).
   */
  hooksJson: string;
  /**
   * Non-null when the file exists but is not parseable JSON. The form goes
   * READ-ONLY and shows this — Helm must never "fix" a file it could not read,
   * because the atomic write would then destroy hand-written content.
   */
  parseError: string | null;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export type HelmValidationSeverity = 'error';

export interface HelmValidationIssue {
  /**
   * The field the issue is about. Exactly these SEVEN names are emitted by the
   * shipped validators, verified against them 2026-08-31:
   *
   *   `'model'`, `'permissionsAllow'`, `'permissionsDeny'`, `'env'`,
   *   `'crossSessionInbound'`, `'hooksJson'`, `'parseError'`
   *
   * `'parseError'` is emitted ONLY by the renderer's `validateDraft`
   * (`src/renderer/src/state/panel-store.ts`). The main-process validator
   * (`src/main/helm/validate.ts`) never emits it — main reports an unparseable
   * file as `HelmDocument.parseError` instead — so a reader of the main
   * validator alone must not conclude the name is wrong. The other six come
   * from both producers.
   *
   * THE TYPE STAYS `string` AND MUST NOT BE NARROWED to a union or a const
   * array. A validator that later emits an eighth name has to remain legal
   * rather than becoming a compile error; the catch-all in
   * `src/renderer/src/helm/issues.ts` is the defence, and it only stays in
   * place while this type stays open.
   */
  field: string;
  severity: HelmValidationSeverity;
  message: string;
}

/**
 * Every validation issue blocks the save: a save whose validation reports any
 * issue writes nothing.
 */
export interface HelmValidation {
  issues: HelmValidationIssue[];
}

// ---------------------------------------------------------------------------
// Save
// ---------------------------------------------------------------------------

export interface HelmSaveRequest {
  scopeId: HelmScopeId;
  /** Exactly what `load` returned. Echoed, never constructed. */
  revision: HelmRevision | null;
  managed: HelmManagedFields;
  unmanaged: Record<string, unknown>;
  hooksJson: string;
}

export interface HelmSaveResult {
  /** Freshly re-read after the rename, so the form's revision is current. */
  document: HelmDocument;
  /** Display only. Named so the user can find the backup that was just taken. */
  backupDisplayPath: string;
}

/**
 * The file changed between load and save.
 *
 * Delivered as `IpcResult` failure with `code: 'CONFLICT'` and a message that
 * says WHICH file and that nothing was written. The draft SURVIVES the
 * conflict; the panel then offers `compare()` (declared on `HelmActions` in
 * `src/renderer/src/contracts/renderer-panels.ts`), the action that fetches the
 * current contents alongside the surviving draft without replacing it, so the
 * side-by-side has both halves. `reload()` remains the discard-my-edit path —
 * it re-reads and throws the draft away, and is the answer only when the user
 * does not want their edit. There is no "save
 * anyway" that skips step 3 — a second save against the FRESH revision is the
 * override, and it is an override the user made after seeing what they were
 * about to overwrite.
 */
export const HELM_CONFLICT_CODE = 'CONFLICT';

// ---------------------------------------------------------------------------
// Push
// ---------------------------------------------------------------------------

/**
 * Channel key T1 adds to `EVENT_CHANNELS`: `helmChanged -> 'push:helmChanged'`.
 * Advisory only. See the header.
 */
export interface HelmChangedPush {
  scopeId: HelmScopeId;
  displayPath: string;
  changedAt: Timestamp;
}

// ---------------------------------------------------------------------------
// The renderer-facing surface (T1 hangs this on `window.orcastrate.helm`)
// ---------------------------------------------------------------------------

/**
 * Channel keys T1 adds to `INVOKE_CHANNELS`, exactly these names:
 *   helmScopes -> 'helm:scopes'
 *   helmLoad   -> 'helm:load'
 *   helmSave   -> 'helm:save'
 *
 * All three MUST render an error. `helmSave` above all: a settings editor whose
 * save silently fails is worse than no settings editor. None of the three may
 * join `SURFACELESS_CHANNELS`.
 */
export interface HelmApi {
  /** The user scope plus two per Pod. Cheap: stats only, never parses. */
  listScopes(): Promise<IpcResult<HelmScope[]>>;
  load(scopeId: HelmScopeId): Promise<IpcResult<HelmDocument>>;
  /** Validates, backs up, writes atomically. CONFLICT means nothing was written. */
  save(req: HelmSaveRequest): Promise<IpcResult<HelmSaveResult>>;
}

// ---------------------------------------------------------------------------
// The main-process port (T3 implements; T1 declares it on IpcHandlerDeps)
// ---------------------------------------------------------------------------

export interface HelmServiceDeps {
  /** Absolute path of `~/.claude`. */
  claudeHome: string;
  pods: PodDirectoryProvider;
  now: PanelClock;
  /**
   * Emits a push to every renderer. T8 supplies the same `sendToRenderers`
   * `src/main/index.ts` already uses for Pod pushes.
   */
  emitChanged: (push: HelmChangedPush) => void;
  /**
   * OFF BY DEFAULT IN TESTS. When false, `watch` is a no-op and every conflict
   * test proves the authoritative path rather than the courtesy one.
   */
  watchEnabled: boolean;
}

export interface HelmService {
  listScopes(): HelmScope[];
  load(scopeId: HelmScopeId): Promise<HelmDocument>;
  validate(req: HelmSaveRequest): HelmValidation;
  save(req: HelmSaveRequest): Promise<HelmSaveResult>;
  /** Idempotent. Watching a second scope releases the first. */
  watch(scopeId: HelmScopeId | null): void;
  dispose(): void;
}
