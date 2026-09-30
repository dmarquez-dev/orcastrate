/**
 * `HelmService` — the whole of Helm's main-process behaviour.
 *
 * Constructed from `HelmServiceDeps` AND NOTHING ELSE. It imports neither
 * `electron` nor `../pod-manager`: the two capabilities it would otherwise
 * reach for — "which directories belong to a Pod" and "what time is it" —
 * arrive as ports (`panel-host.ts`), which is what makes every path through
 * this file exercisable against a synthetic tree under `mkdtemp`.
 *
 * THE FOUR WRITE-SAFETY RULES, and where each one lives:
 *
 *   1. ATOMIC          `atomic-write.ts` — temp file in the target's own
 *                      directory, fsync, rename.
 *   2. BACKUP FIRST    `atomic-write.ts` — and a failed backup THROWS, so
 *                      `save` below never reaches the rename.
 *   3. RE-READ+COMPARE `revision.ts`, applied in `save` before anything is
 *                      written. This is the guarantee. It runs whether or not
 *                      the watcher is on, and it is what stops the CLI's own
 *                      "Allow always" rewrite from being silently overwritten.
 *   4. VERBATIM ERRORS an `ErrnoException` is re-raised as `IpcFailure('IO', …)`
 *                      carrying `err.message` CHARACTER FOR CHARACTER, with the
 *                      original as `cause`. The code is added so the renderer
 *                      can branch; not one word of what the OS said is
 *                      rewritten, because a rewritten `EPERM` is a support
 *                      ticket nobody can answer.
 *
 * Failures are raised as `IpcFailure`, the code the transport already knows how
 * to classify. That is a deliberate exception to "the domain does not know the
 * transport's vocabulary": the alternative — a `HelmError` with its own code
 * enum — would need `toIpcError` to grow a branch for it, and `toIpcError`
 * belongs to another task's files.
 *
 * THE EXCEPTION COSTS NOTHING, AND NOW THAT IS TRUE OF THE MODULE GRAPH AS WELL
 * AS OF THE TYPE. The import is `../ipc/failure`, the leaf: `IpcFailure` is a
 * plain `Error` subclass carrying an `IpcErrorCode`, and the module it lives in
 * imports nothing but a type. Importing `../ipc/errors` instead would have
 * pulled `../pod` and `../store` in behind it — `toIpcError` needs those
 * constructors for its `instanceof` checks — so the old wording's claim that
 * "nothing about importing it reaches Electron or the renderer" was true of the
 * class and false of its module. A re-export would not have fixed that; only
 * importing the leaf does.
 */

import type {
  HelmDocument,
  HelmSaveRequest,
  HelmSaveResult,
  HelmScope,
  HelmScopeId,
  HelmService,
  HelmServiceDeps,
  HelmValidation,
} from '../../shared/contracts/helm';
import { HELM_CONFLICT_CODE } from '../../shared/contracts/helm';
import { IpcFailure } from '../ipc/failure';

import { BackupSequence, backupBeforeWrite, ensureDirectory, writeAtomic } from './atomic-write';
import { emptyManaged, parseSettings, serializeSettings } from './document';
import { fileExists, readSnapshot, revisionsMatch, sha256Of, type FileSnapshot } from './revision';
import { buildScopeTable, toScope, type ScopeEntry } from './scopes';
import { blockingIssues, validateSaveRequest, warningIssues } from './validate';
import { HelmWatcher } from './watcher';

/**
 * Rule 4. The OS message travels UNMODIFIED; only a code is attached, so the
 * renderer can render it as a failure instead of a crash. An `IpcFailure` that
 * is already classified passes through untouched — a CONFLICT that has already
 * decided what it is must not be downgraded to IO on its way out.
 */
function asIoFailure(err: unknown): unknown {
  if (err instanceof IpcFailure) return err;
  if (err instanceof Error) return new IpcFailure('IO', err.message, { cause: err });
  return err;
}

class Helm implements HelmService {
  private readonly watcher: HelmWatcher;

  /**
   * Distinctness for two backups of the same file inside one millisecond. Held
   * per service instance and never read off the disk (`atomic-write.ts`).
   */
  private readonly backups = new BackupSequence();

  constructor(private readonly deps: HelmServiceDeps) {
    this.watcher = new HelmWatcher({ now: deps.now, emitChanged: deps.emitChanged });
  }

  listScopes(): HelmScope[] {
    const table = buildScopeTable(this.deps.pods(), this.deps.claudeHome);
    // Stats only, never a parse: the scope list is drawn before the user has
    // chosen anything, and a malformed file must not stop the list rendering.
    return [...table.values()].map((entry) => toScope(entry, fileExists(entry.path)));
  }

  async load(scopeId: HelmScopeId): Promise<HelmDocument> {
    const entry = this.resolve(scopeId);
    let snapshot: FileSnapshot;
    try {
      snapshot = readSnapshot(entry.path);
    } catch (err) {
      throw asIoFailure(err);
    }

    const scope = toScope(entry, snapshot.revision !== null);

    // ABSENT IS NORMAL. This repo has no `.claude/` at all and the machine's
    // user-scope file has no `permissions` key; a Helm that reported either as
    // a failure would be wrong about the world it ships into.
    if (snapshot.text === null) {
      return {
        scope,
        revision: null,
        managed: emptyManaged(),
        unmanaged: {},
        hooksJson: '',
        parseError: null,
      };
    }

    let root: unknown;
    try {
      root = JSON.parse(snapshot.text);
    } catch (err) {
      // READ-ONLY, and Helm says why. The atomic write would otherwise destroy
      // hand-written content it never understood.
      return {
        scope,
        revision: snapshot.revision,
        managed: emptyManaged(),
        unmanaged: {},
        hooksJson: '',
        parseError: err instanceof Error ? err.message : String(err),
      };
    }

    if (typeof root !== 'object' || root === null || Array.isArray(root)) {
      return {
        scope,
        revision: snapshot.revision,
        managed: emptyManaged(),
        unmanaged: {},
        hooksJson: '',
        parseError: 'Settings must be a JSON object.',
      };
    }

    const parsed = parseSettings(root as Record<string, unknown>);
    return {
      scope,
      revision: snapshot.revision,
      managed: parsed.managed,
      unmanaged: parsed.unmanaged,
      hooksJson: parsed.hooksJson,
      parseError: null,
    };
  }

  validate(req: HelmSaveRequest): HelmValidation {
    return validateSaveRequest(req);
  }

  async save(req: HelmSaveRequest): Promise<HelmSaveResult> {
    const entry = this.resolve(req.scopeId);

    const validation = validateSaveRequest(req);
    const blocking = blockingIssues(validation);
    if (blocking.length > 0) {
      throw new IpcFailure(
        'INVALID_ARGUMENT',
        `${entry.path} was not written: ${blocking.map((issue) => issue.message).join(' ')}`,
      );
    }

    // ---- rule 3, and it happens BEFORE a single byte is written -----------
    let current: FileSnapshot;
    try {
      current = readSnapshot(entry.path);
    } catch (err) {
      throw asIoFailure(err);
    }
    if (!revisionsMatch(current.revision, req.revision)) {
      throw new IpcFailure(
        HELM_CONFLICT_CODE,
        `${entry.path} changed on disk since it was loaded. Nothing was written. ` +
          'Reload to see the current contents beside your edits, then save again.',
      );
    }

    // Helm never overwrites a file it could not read. The check is against what
    // is on disk RIGHT NOW rather than against the loaded draft, because that is
    // the content the atomic write is about to replace.
    if (current.text !== null) {
      try {
        JSON.parse(current.text);
      } catch (err) {
        throw new IpcFailure(
          'INVALID_ARGUMENT',
          `${entry.path} is not valid JSON and was not written: ` +
            `${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    const content = serializeSettings({
      managed: req.managed,
      unmanaged: req.unmanaged,
      hooksJson: req.hooksJson,
    });

    let backupPath: string | null;
    try {
      // A project with no `.claude/` is the normal starting state.
      ensureDirectory(entry.path);

      // ---- rule 2: if this throws, nothing below it runs ------------------
      backupPath = backupBeforeWrite(entry.path, this.deps.now(), this.backups);

      // ---- rule 1 ----------------------------------------------------------
      writeAtomic(entry.path, content, this.deps.now());
    } catch (err) {
      throw asIoFailure(err);
    }

    // THE SHA OF WHAT HELM WROTE, never a re-read of the disk. A foreign writer
    // landing between the rename and this line would otherwise have its bytes
    // adopted as Helm's own, and the one push telling the user someone else
    // changed their file is exactly the push that would be swallowed. A disk
    // state differing from `content` does not match, and the watcher pushes —
    // which is right, because the disk genuinely does not hold what Helm wrote.
    this.watcher.acknowledgeOwnWrite(entry.path, sha256Of(content));

    return {
      document: await this.load(req.scopeId),
      backupDisplayPath: backupPath ?? '',
      warnings: warningIssues(validation),
    };
  }

  watch(scopeId: HelmScopeId | null): void {
    if (!this.deps.watchEnabled) return;
    if (scopeId === null) {
      this.watcher.watch(null);
      return;
    }
    const entry = this.resolve(scopeId);
    this.watcher.watch({ scopeId: entry.id, path: entry.path });
  }

  dispose(): void {
    this.watcher.dispose();
  }

  /**
   * A TABLE LOOKUP. The caller's string is a key and is never joined, resolved
   * or normalized into a path — which is why `project:../../../etc` is a miss
   * that never touches the filesystem, rather than a traversal.
   */
  private resolve(scopeId: HelmScopeId): ScopeEntry {
    const entry = buildScopeTable(this.deps.pods(), this.deps.claudeHome).get(scopeId);
    if (entry === undefined) {
      throw new IpcFailure('NOT_FOUND', `no settings scope with id ${JSON.stringify(scopeId)}`);
    }
    return entry;
  }
}

export function createHelmService(deps: HelmServiceDeps): HelmService {
  return new Helm(deps);
}
