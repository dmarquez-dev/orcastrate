/**
 * The ADVISORY watcher. It is never a guard.
 *
 * Its whole job is courtesy: when the CLI rewrites project `settings.json`
 * because the user clicked "Allow always" one panel away, the open form should
 * say so IMMEDIATELY rather than at save. The guarantee that nothing is lost is
 * the re-read-and-compare in `save` (see `revision.ts`), which is why every
 * conflict test runs with `watchEnabled: false`.
 *
 * TWO IMPLEMENTATION CHOICES, BOTH FORCED BY WHAT `fs.watch` ACTUALLY DOES:
 *
 *  1. IT WATCHES THE DIRECTORY, NOT THE FILE. An atomic write renames a new
 *     inode over the target, which silently orphans a file watch on every
 *     platform — the watcher would then be watching bytes nobody can see again.
 *     It also lets the watcher see the file APPEAR, which matters because an
 *     absent settings file is the normal starting state.
 *  2. IT COALESCES ON CONTENT, NOT ON A TIMER. One write commonly raises two
 *     `rename`/`change` events. Debouncing would mean a timer, and a timer means
 *     a test that waits on the wall clock; hashing the file instead and emitting
 *     only when the hash actually moved is deterministic, and it also suppresses
 *     the event Helm's own save raises.
 *
 * Every failure here is swallowed on purpose and the reason is at each catch:
 * an advisory notification that cannot be delivered must never become an error
 * in a caller who asked to edit a settings file.
 */

import type { FSWatcher } from 'node:fs';
import { basename, dirname } from 'node:path';

import type { HelmChangedPush, HelmScopeId } from '../../shared/contracts/helm';
import type { PanelClock } from '../../shared/contracts/panel-host';

import { helmFs } from './fs-ops';
import { readSnapshot } from './revision';

export interface WatchTarget {
  scopeId: HelmScopeId;
  path: string;
}

export interface HelmWatcherDeps {
  now: PanelClock;
  emitChanged: (push: HelmChangedPush) => void;
}

/**
 * Holds AT MOST ONE watch. `watch(next)` releases the previous one first, and
 * `dispose()` releases whatever is left, so the service can never accumulate
 * handles no matter how the user clicks around the scope list.
 */
export class HelmWatcher {
  private watcher: FSWatcher | null = null;
  private target: WatchTarget | null = null;
  private lastHash: string | null = null;
  private flushScheduled = false;
  private disposed = false;

  constructor(private readonly deps: HelmWatcherDeps) {}

  /** Idempotent. `null` releases the current watch and starts none. */
  watch(target: WatchTarget | null): void {
    this.release();
    if (this.disposed || target === null) return;

    this.target = target;
    this.lastHash = readSnapshot(target.path).revision?.sha256 ?? null;

    const directory = dirname(target.path);
    const name = basename(target.path);

    try {
      const watcher = helmFs.watch(directory, { persistent: false }, (_event, changed) => {
        // `changed` is null on platforms that do not report a filename; taking
        // the event then is the conservative choice for an advisory signal.
        if (changed !== null && basename(String(changed)) !== name) return;
        this.schedule();
      });
      watcher.on('error', () => {
        // fs.watch surfaces platform faults (a watched directory removed, an
        // exhausted handle table) as an 'error' event. Unhandled, it would
        // throw out of the event loop and take down a main process whose user
        // only asked to look at a settings file. The watch is advisory, so the
        // right answer is to stop watching, silently.
        this.release();
      });
      this.watcher = watcher;
    } catch {
      // The directory may not exist yet — a project with no `.claude/` is the
      // normal case. There is nothing to watch and nothing to report.
      this.watcher = null;
    }
  }

  dispose(): void {
    this.disposed = true;
    this.release();
  }

  /** Coalesces a burst of raw events into one hash check on the next turn. */
  private schedule(): void {
    if (this.flushScheduled) return;
    this.flushScheduled = true;
    setImmediate(() => {
      this.flushScheduled = false;
      this.flush();
    });
  }

  private flush(): void {
    const target = this.target;
    if (target === null || this.watcher === null) return;

    let hash: string | null;
    try {
      hash = readSnapshot(target.path).revision?.sha256 ?? null;
    } catch {
      // A transient read failure mid-write. The save-time re-read is the
      // authority; an advisory push is not worth a thrown error here.
      return;
    }

    if (hash === this.lastHash) return;
    this.lastHash = hash;

    this.deps.emitChanged({
      scopeId: target.scopeId,
      displayPath: target.path,
      changedAt: this.deps.now().toISOString(),
    });
  }

  /**
   * Helm's own write must not come back as "someone changed your file".
   * Called by `save` immediately after the rename.
   */
  acknowledgeOwnWrite(path: string, sha256: string | null): void {
    if (this.target !== null && this.target.path === path) this.lastHash = sha256;
  }

  private release(): void {
    const watcher = this.watcher;
    this.watcher = null;
    this.target = null;
    this.lastHash = null;
    if (watcher === null) return;
    try {
      watcher.close();
    } catch {
      /* already closed by the platform; there is no handle left to leak */
    }
  }
}
