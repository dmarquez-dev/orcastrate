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
 * NAMES AND THE CLOCK. `tempPathFor` is DETERMINISTIC in `now`. `backupPathFor`
 * is deterministic in `now` too, in the narrowed form that is all the rule
 * needs: it names the FIRST backup taken at that stamp. A test computes it from
 * the injected clock and compares, or blocks it to prove the abort, exactly as
 * before.
 *
 * WHY ONLY THE FIRST. `deps.now()` has millisecond resolution and two saves of
 * the same scope can land inside one millisecond. When both backups carried the
 * one name, `copyFileSync` clobbered — the second save destroyed the first
 * save's backup, which is the content rule 2 exists to preserve. So a backup
 * beyond the first at a given (path, stamp) carries a sequence suffix and the
 * two are distinct files.
 *
 * THE SEQUENCE IS HELD IN MEMORY AND THE DISK IS NEVER CONSULTED TO CHOOSE A
 * NAME (`BackupSequence` below). That is not an optimisation, it is rule 2: an
 * entry already sitting at the backup path cannot be told apart from an
 * obstruction — a directory, an `EACCES` — so anything that probed disk and
 * stepped onto the next free name would step past an obstruction too, and let
 * the write proceed without its backup. Counting in memory means an obstruction
 * can only ever produce the abort.
 */

import { dirname, join } from 'node:path';

import { helmFs, isNotFoundError } from './fs-ops';

/** `2026-08-19T14:03:05.123Z` -> `2026-08-19T14-03-05-123Z`, filename-safe on Windows. */
export function backupStamp(now: Date): string {
  return now.toISOString().replace(/[:.]/g, '-');
}

/**
 * `settings.json` -> `settings.json.2026-08-19T14-03-05-123Z.bak`, beside the
 * file. The FIRST backup taken at this stamp; see `backupPathForSequence`.
 */
export function backupPathFor(targetPath: string, now: Date): string {
  return backupPathForSequence(targetPath, now, 0);
}

/**
 * Sequence 0 is `backupPathFor`'s string, unchanged. Sequence 1 and up insert
 * the ordinal before `.bak`, so two backups taken inside one millisecond are
 * two files: `…-123Z.bak`, `…-123Z.1.bak`, `…-123Z.2.bak`.
 */
export function backupPathForSequence(targetPath: string, now: Date, sequence: number): string {
  const stamp = backupStamp(now);
  return sequence === 0 ? `${targetPath}.${stamp}.bak` : `${targetPath}.${stamp}.${sequence}.bak`;
}

/**
 * How many backups this process has already taken at the CURRENT stamp, per
 * target path. The ONLY input to the sequence suffix, and it never reads the
 * filesystem — see the header on why probing disk would weaken rule 2.
 *
 * Bounded by construction: the map holds one millisecond's worth of paths and
 * is cleared the moment the stamp moves, which it does on every save that is
 * not in a dead heat with the one before it.
 */
export class BackupSequence {
  private stamp: string | null = null;
  private readonly taken = new Map<string, number>();

  /** The sequence the next backup of `targetPath` at `now` should carry. */
  next(targetPath: string, now: Date): number {
    const stamp = backupStamp(now);
    if (stamp !== this.stamp) {
      this.stamp = stamp;
      this.taken.clear();
    }
    return this.taken.get(targetPath) ?? 0;
  }

  /**
   * Records a backup that WAS WRITTEN. Not called when the target was absent
   * (no file was created, so the deterministic name is still free) and not
   * called when the copy threw (the save is aborting and nothing was written).
   */
  record(targetPath: string, sequence: number): void {
    this.taken.set(targetPath, sequence + 1);
  }
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
 *
 * `sequence` supplies the name (and records the one it used on success), so two
 * saves inside one millisecond do not land on the same path. It is NOT consulted
 * about whether the copy may proceed: the destination is chosen before the
 * syscall and whatever the syscall says about it is final.
 */
export function backupBeforeWrite(
  targetPath: string,
  now: Date,
  sequence: BackupSequence,
): string | null {
  const ordinal = sequence.next(targetPath, now);
  const backupPath = backupPathForSequence(targetPath, now, ordinal);
  try {
    helmFs.copyFileSync(targetPath, backupPath);
  } catch (err) {
    // Only "the file was not there" is benign: the target is being created, so
    // there is no prior content a backup could hold. Anything else — EACCES,
    // EPERM, EROFS, EISDIR — means the backup did not happen, and rule 2 says
    // the write then does not happen either.
    if (isNotFoundError(err)) return null;
    throw err;
  }
  sequence.record(targetPath, ordinal);
  return backupPath;
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
