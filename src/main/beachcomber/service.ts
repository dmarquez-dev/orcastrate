/**
 * Beachcomber — the main-process scanner behind `~/.claude` cleanup.
 *
 * ===========================================================================
 * THERE IS EXACTLY ONE WAY THIS MODULE REMOVES ANYTHING: `deps.trashItem`.
 * ===========================================================================
 *
 * No filesystem mutation call appears anywhere in this directory. The single
 * capability that can make something disappear arrives as an injected port and
 * moves the target to the OS recycle bin, which is recoverable. That is not a
 * convention held up by review — `tests/unit/beachcomber/no-destructive-api.test.ts`
 * scans every source file here and fails the build if one shows up.
 *
 * Likewise, this directory imports neither `electron` nor `../pod-manager`. The
 * two dangerous capabilities — "move this to the bin" and "which directories
 * does Orcastrate have a stake in" — arrive only as `deps.trashItem` and
 * `deps.pods`, which is what makes the whole service exercisable against a
 * synthetic tree in a temp directory.
 *
 * ===========================================================================
 * WHERE `displayPath` COMES FROM, AND WHY IT DECIDES `orphan`
 * ===========================================================================
 *
 * A `~/.claude/projects/<dir>` name is a LOSSY encoding of a working directory:
 * `:`, `\`, `/`, `.` and a literal `-` all collapse onto `-`, so decoding is
 * ambiguous. `C--Users-x-Repos-dir-ect` is `…\Repos\dir-ect` and `…\Repos\dir\ect`
 * with equal justification. The truth is inside the directory instead: the first
 * `cwd`-bearing record of a session transcript states it verbatim.
 *
 * So `pathSource` is not decoration. It is the flag that decides whether this
 * service is allowed to call a directory an orphan at all:
 *
 *   'session-record' — recorded, authoritative, and `orphan` may be true.
 *   'decoded-name'   — a guess, and `orphan` is FORCED false, because "this
 *                      path does not exist" is unfalsifiable about a path that
 *                      was never known. A false orphan is an invitation to
 *                      delete live state, and this is the line that makes one
 *                      impossible rather than unlikely.
 *
 *   'absolute-path'  — the entry's own location under `~/.claude`. Every entry
 *                      of the other three roots, whose state is not keyed by a
 *                      working directory at all. Not a guess, so it carries no
 *                      "not verified" caveat; and not a working directory, so
 *                      `orphan` is FORCED false here too.
 */

import { lstat, readdir } from 'node:fs/promises';
import { join } from 'node:path';

import type {
  BeachcomberEntry,
  BeachcomberEntryId,
  BeachcomberPreview,
  BeachcomberPreviewItem,
  BeachcomberPreviewRefusal,
  BeachcomberPreviewRequest,
  BeachcomberRootKey,
  BeachcomberRootSummary,
  BeachcomberScan,
  BeachcomberService,
  BeachcomberServiceDeps,
  BeachcomberTrashFailure,
  BeachcomberTrashRequest,
  BeachcomberTrashResult,
} from '../../shared/contracts/beachcomber';
import { BEACHCOMBER_ROOTS } from '../../shared/contracts/beachcomber';
import type { PodDirectory } from '../../shared/contracts/panel-host';
import { IpcFailure } from '../ipc/failure';

import { decodeDirectoryName, podBlockerFor } from './paths';
import { readFirstCwd, sessionFileNames } from './session-record';
import { measureTree, sampleFileNames } from './walk';

/** On-disk directory name for each contract root key. */
const ROOT_DIRECTORY_NAMES: Record<BeachcomberRootKey, string> = {
  projects: 'projects',
  shellSnapshots: 'shell-snapshots',
  fileHistory: 'file-history',
  pasteCache: 'paste-cache',
};

/** `BeachcomberPreviewItem.sampleNames` is capped by the contract at 20. */
const SAMPLE_LIMIT = 20;

/**
 * The id -> location mapping the renderer never sees. This is the whole reason
 * the no-paths rule survives a panel whose subject is paths: an id is a token
 * minted here, and only this map turns one back into somewhere on disk.
 */
interface EntryRecord {
  entry: BeachcomberEntry;
  /** Absolute location UNDER `~/.claude` — what `trashItem` is given. */
  absolutePath: string;
}

interface ScanNamespace {
  scanId: string;
  byId: Map<BeachcomberEntryId, EntryRecord>;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch {
    return false;
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function errorCode(err: unknown): string | null {
  if (typeof err === 'object' && err !== null && 'code' in err) {
    const code = (err as { code?: unknown }).code;
    if (typeof code === 'string') return code;
  }
  return null;
}

export function createBeachcomberService(deps: BeachcomberServiceDeps): BeachcomberService {
  const { claudeHome, pods, trashItem, now, newId } = deps;

  /**
   * Only the most recent scan's ids are live. A rescan mints a fresh namespace
   * and the previous one is dropped whole, so a row the user selected before a
   * rescan can never resolve to a directory that has since taken its place.
   */
  let current: ScanNamespace | null = null;

  async function assertClaudeHomeReadable(): Promise<void> {
    try {
      await readdir(claudeHome);
    } catch (err) {
      // A missing `~/.claude` is a user who has not run Claude Code yet: every
      // root is simply absent. Anything else — a permission fault, a broken
      // mount — is the one condition the contract raises `IO` for.
      if (errorCode(err) === 'ENOENT') return;
      throw new IpcFailure('IO', `cannot read ${claudeHome}: ${errorMessage(err)}`, { cause: err });
    }
  }

  /**
   * Resolves a `projects/<dir>` entry's working directory.
   *
   * Reads session transcripts in name order and takes the first `cwd` any of
   * them records. Falls back to the decoded name, LABELLED as the guess it is.
   */
  async function resolveProjectPath(
    absolutePath: string,
    name: string,
  ): Promise<{ displayPath: string; recorded: boolean }> {
    for (const fileName of await sessionFileNames(absolutePath)) {
      const { cwd } = await readFirstCwd(join(absolutePath, fileName));
      if (cwd !== null) return { displayPath: cwd, recorded: true };
    }
    return { displayPath: decodeDirectoryName(name), recorded: false };
  }

  async function buildEntry(
    root: BeachcomberRootKey,
    rootPath: string,
    name: string,
    podDirectories: readonly PodDirectory[],
  ): Promise<EntryRecord> {
    const absolutePath = join(rootPath, name);
    const measurement = await measureTree(absolutePath);

    const resolved =
      root === 'projects'
        ? await resolveProjectPath(absolutePath, name)
        : { displayPath: absolutePath, recorded: false };

    // THE INVARIANT: only a recorded path may ever be called missing.
    const orphan = resolved.recorded ? !(await pathExists(resolved.displayPath)) : false;

    const pathSource: BeachcomberEntry['pathSource'] =
      root !== 'projects' ? 'absolute-path' : resolved.recorded ? 'session-record' : 'decoded-name';

    // The blocking rule is a pure function of these fields — see
    // `podBlockerFor` in `./paths`, where the argument for comparing a decoded
    // `projects` name by ENCODING the Pod's cwd is written out in full.
    const blocker = podBlockerFor({
      root,
      name,
      pathSource,
      displayPath: resolved.displayPath,
      pods: podDirectories,
    });

    const entry: BeachcomberEntry = {
      id: newId(),
      root,
      name,
      displayPath: resolved.displayPath,
      pathSource,
      sizeBytes: measurement.sizeBytes,
      fileCount: measurement.fileCount,
      lastModified: new Date(measurement.lastModifiedMs).toISOString(),
      sessionCount: root === 'projects' ? measurement.jsonlCount : null,
      orphan,
      blocked: blocker === null ? null : 'pod-cwd',
      blockedBy: blocker === null ? null : { podId: blocker.podId, title: blocker.title },
    };

    return { entry, absolutePath };
  }

  async function scanRoot(
    root: BeachcomberRootKey,
    podDirectories: readonly PodDirectory[],
  ): Promise<{ summary: BeachcomberRootSummary; records: EntryRecord[] }> {
    const rootPath = join(claudeHome, ROOT_DIRECTORY_NAMES[root]);
    const summary: BeachcomberRootSummary = {
      key: root,
      displayPath: rootPath,
      present: false,
      entryCount: 0,
      totalBytes: 0,
      error: null,
    };

    let names: string[];
    try {
      names = await readdir(rootPath);
      summary.present = true;
    } catch (err) {
      if (errorCode(err) === 'ENOENT') {
        // Absence is normal, not an error: a user who has never pasted an image
        // has no `paste-cache`.
        return { summary, records: [] };
      }
      // The directory is there and unreadable. Say so on this root and let the
      // other three populate — one unreadable root must not cost the panel.
      summary.present = true;
      summary.error = errorMessage(err);
      return { summary, records: [] };
    }

    const records: EntryRecord[] = [];
    for (const name of names.sort()) {
      records.push(await buildEntry(root, rootPath, name, podDirectories));
    }

    summary.entryCount = records.length;
    summary.totalBytes = records.reduce((total, record) => total + record.entry.sizeBytes, 0);
    return { summary, records };
  }

  async function scan(): Promise<BeachcomberScan> {
    await assertClaudeHomeReadable();

    const podDirectories = pods();
    const scanId = newId();
    const roots: BeachcomberRootSummary[] = [];
    const byId = new Map<BeachcomberEntryId, EntryRecord>();
    const entries: BeachcomberEntry[] = [];

    // Sequential by root so entry ids are minted in a stable order, which is
    // what makes an injected `newId` counter assertable.
    for (const root of BEACHCOMBER_ROOTS) {
      const { summary, records } = await scanRoot(root, podDirectories);
      roots.push(summary);
      for (const record of records) {
        byId.set(record.entry.id, record);
        entries.push(record.entry);
      }
    }

    const rootOrder = new Map(BEACHCOMBER_ROOTS.map((key, index) => [key, index] as const));
    entries.sort((a, b) => {
      const rootDelta = (rootOrder.get(a.root) ?? 0) - (rootOrder.get(b.root) ?? 0);
      if (rootDelta !== 0) return rootDelta;
      return b.sizeBytes - a.sizeBytes;
    });

    current = { scanId, byId };

    return { scanId, scannedAt: now().toISOString(), roots, entries };
  }

  /**
   * Resolves a request against the LIVE namespace.
   *
   * A stale `scanId`, or an id the live namespace does not hold, is
   * `NOT_FOUND`. Never a silent no-op, and never a rematch by path — matching a
   * stale id back onto a path would be exactly the substitution the scan-scoped
   * id exists to prevent.
   */
  function resolveRequest(scanId: string, ids: readonly BeachcomberEntryId[]): EntryRecord[] {
    if (current === null || current.scanId !== scanId) {
      throw new IpcFailure('NOT_FOUND', `scan ${scanId} is no longer current; rescan and retry`);
    }
    const namespace = current;
    return ids.map((id) => {
      const record = namespace.byId.get(id);
      if (record === undefined) {
        throw new IpcFailure('NOT_FOUND', `entry ${id} is not part of scan ${scanId}`);
      }
      return record;
    });
  }

  function refusalFor(entry: BeachcomberEntry): BeachcomberPreviewRefusal {
    const pod = entry.blockedBy;
    const who = pod === null ? 'a Pod' : `the Pod "${pod.title}" (${pod.podId})`;
    return {
      id: entry.id,
      displayPath: entry.displayPath,
      reason: `${who} still uses this directory, so Orcastrate will not move it to the recycle bin. Delete that Pod in Orcastrate first, then rescan.`,
    };
  }

  async function preview(req: BeachcomberPreviewRequest): Promise<BeachcomberPreview> {
    const records = resolveRequest(req.scanId, req.ids);

    const items: BeachcomberPreviewItem[] = [];
    const refused: BeachcomberPreviewRefusal[] = [];

    for (const record of records) {
      const { entry, absolutePath } = record;
      if (entry.blocked !== null) {
        refused.push(refusalFor(entry));
        continue;
      }
      const stale = !(await pathExists(absolutePath));
      items.push({
        id: entry.id,
        displayPath: entry.displayPath,
        root: entry.root,
        sizeBytes: entry.sizeBytes,
        fileCount: entry.fileCount,
        sampleNames: stale ? [] : await sampleFileNames(absolutePath, SAMPLE_LIMIT),
        stale,
      });
    }

    return {
      items,
      refused,
      totalBytes: items.reduce((total, item) => total + item.sizeBytes, 0),
      totalFiles: items.reduce((total, item) => total + item.fileCount, 0),
    };
  }

  async function trash(req: BeachcomberTrashRequest): Promise<BeachcomberTrashResult> {
    const records = resolveRequest(req.scanId, req.ids);

    const trashed: BeachcomberEntryId[] = [];
    const failed: BeachcomberTrashFailure[] = [];
    const refused: BeachcomberPreviewRefusal[] = [];

    // Sequentially, so a failure part-way through leaves an unambiguous record
    // of what did and did not move.
    for (const record of records) {
      const { entry, absolutePath } = record;
      if (entry.blocked !== null) {
        refused.push(refusalFor(entry));
        continue;
      }
      try {
        await trashItem(absolutePath);
        trashed.push(entry.id);
      } catch (err) {
        // PARTIAL SUCCESS IS A VALUE. One locked directory does not turn eleven
        // successful moves into a failed operation; the caller is told which.
        failed.push({ id: entry.id, displayPath: entry.displayPath, message: errorMessage(err) });
      }
    }

    return { trashed, failed, refused, scan: await scan() };
  }

  return { scan, preview, trash };
}
