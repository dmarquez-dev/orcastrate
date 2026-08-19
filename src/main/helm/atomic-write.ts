/**
 * Write safety, rules 1 and 2 of the frozen contract's four.
 *
 *  1. ATOMIC — the temp file is created IN THE TARGET'S OWN DIRECTORY, fsynced,
 *     and renamed over the target. Same directory because `rename` is only
 *     atomic within one filesystem, and the OS temp directory is routinely on
 *     another volume. A crash anywhere before the rename leaves the original
 *     byte-identical; there is no window in which the target is half-written.
 *  2. BACKUP FIRST — a timestamped copy beside the file BEFORE the rename. If
 *     the backup cannot be written, THE WRITE DOES NOT HAPPEN. A write that
 *     proceeded without its backup is precisely the failure the rule exists to
 *     prevent, so `backupBeforeWrite` throws and `save` never reaches the
 *     rename.
 *
 * Rule 4 — verbatim OS errors — is upheld by NOT CATCHING. Every `ErrnoException`
 * from this module propagates with its own `.message` untouched, which is what
 * reaches the user through `toIpcError`. The one `catch` here is the best-effort
 * removal of an orphaned temp file, and it says why at the catch site.
 *
 * Both names are DETERMINISTIC in `now`, which `HelmServiceDeps.now` injects:
 * no test depends on the wall clock, and a test can compute either path and
 * block it to prove the abort.
 */

import { dirname, join } from 'node:path';

import { helmFs, isNotFoundError } from './fs-ops';

/** `2026-08-19T14:03:05.123Z` -> `2026-08-19T14-03-05-123Z`, filename-safe on Windows. */
export function backupStamp(now: Date): string {
  return now.toISOString().replace(/[:.]/g, '-');
}

/** `settings.json` -> `settings.json.2026-08-19T14-03-05-123Z.bak`, beside the file. */
export function backupPathFor(targetPath: string, now: Date): string {
  return `${targetPath}.${backupStamp(now)}.bak`;
}

/**
 * The temp file, in the TARGET'S OWN DIRECTORY. Dot-prefixed so a directory
 * listing does not show it as a settings file if a crash strands it.
 */
export function tempPathFor(targetPath: string, now: Date): string {
  const dir = dirname(targetPath);
  const base = targetPath.slice(dir.length + 1);
  return join(dir, `.${base}.${backupStamp(now)}.tmp`);
}

/**
 * Copies the current contents aside and returns the backup path, or null when
 * the target does not exist yet — there is nothing to lose, and inventing an
 * empty backup would tell the user a lie about what was there.
 *
 * THROWS on a failed copy. The caller must not write.
 */
export function backupBeforeWrite(targetPath: string, now: Date): string | null {
  try {
    helmFs.copyFileSync(targetPath, backupPathFor(targetPath, now));
  } catch (err) {
    // Only "the file was not there" is benign: the target is being created, so
    // there is no prior content a backup could hold. Anything else — EACCES,
    // EPERM, EROFS, EISDIR — means the backup did not happen, and rule 2 says
    // the write then does not happen either.
    if (isNotFoundError(err)) return null;
    throw err;
  }
  return backupPathFor(targetPath, now);
}

export interface AtomicWriteHooks {
  /**
   * Runs after the temp file is durable and BEFORE the rename. Exists so a test
   * can inject a crash into the one window the atomicity claim is about; the
   * service never passes it.
   */
  beforeRename?: (tempPath: string) => void;
}

/**
 * Writes `content` to `targetPath` atomically. Returns the temp path it used so
 * a test can assert it was a sibling of the target.
 */
export function writeAtomic(
  targetPath: string,
  content: string,
  now: Date,
  hooks?: AtomicWriteHooks,
): { tempPath: string } {
  const tempPath = tempPathFor(targetPath, now);

  helmFs.writeFileSync(tempPath, content, 'utf8');
  try {
    const fd = helmFs.openSync(tempPath, 'r+');
    try {
      helmFs.fsyncSync(fd);
    } finally {
      helmFs.closeSync(fd);
    }

    hooks?.beforeRename?.(tempPath);

    helmFs.renameSync(tempPath, targetPath);
  } catch (err) {
    // The temp file is ours and orphaned; removing it keeps the promise that a
    // failed write creates no file anywhere. Its own removal failing tells the
    // caller nothing they can act on and must not mask the real error.
    try {
      helmFs.rmSync(tempPath, { force: true });
    } catch {
      /* the real failure is `err`; a stranded temp file is not worth losing it */
    }
    throw err;
  }

  return { tempPath };
}

/** `mkdir -p` for the target's directory. Needed for a project with no `.claude/`. */
export function ensureDirectory(targetPath: string): void {
  helmFs.mkdirSync(dirname(targetPath), { recursive: true });
}
