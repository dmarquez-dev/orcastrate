/**
 * Recursive measurement of one Beachcomber entry.
 *
 * READ-ONLY BY CONSTRUCTION. This module opens nothing for writing and calls no
 * filesystem mutation of any kind; it uses `lstat` and `readdir` and nothing
 * else. Symlinks are measured as links rather than followed, so a link pointing
 * at a developer's source tree contributes its own tiny size and never drags
 * that tree into a size total or a sample list.
 */

import { lstat, readdir } from 'node:fs/promises';
import { join } from 'node:path';

export interface TreeMeasurement {
  sizeBytes: number;
  fileCount: number;
  /**
   * Epoch millis of the newest FILE mtime beneath the entry, falling back to
   * the entry's own mtime when it contains no files. See `measureTree`.
   */
  lastModifiedMs: number;
  /** `*.jsonl` files anywhere beneath the entry. */
  jsonlCount: number;
}

const EMPTY: TreeMeasurement = { sizeBytes: 0, fileCount: 0, lastModifiedMs: 0, jsonlCount: 0 };

/**
 * Measures `path`, which may be a file or a directory.
 *
 * A subtree that cannot be read contributes what was readable rather than
 * aborting: one locked directory inside a project must not cost the user the
 * whole row. The caller surfaces unreadability at the ROOT level, where it is
 * actionable, via `BeachcomberRootSummary.error`.
 */
export async function measureTree(path: string): Promise<TreeMeasurement> {
  let stats;
  try {
    stats = await lstat(path);
  } catch {
    return { ...EMPTY };
  }

  const mtimeMs = Math.floor(stats.mtimeMs);

  if (!stats.isDirectory()) {
    return {
      sizeBytes: stats.size,
      fileCount: 1,
      lastModifiedMs: mtimeMs,
      jsonlCount: path.toLowerCase().endsWith('.jsonl') ? 1 : 0,
    };
  }

  let names: string[];
  try {
    names = await readdir(path);
  } catch {
    return { sizeBytes: 0, fileCount: 0, lastModifiedMs: mtimeMs, jsonlCount: 0 };
  }

  const children = await Promise.all(names.map((name) => measureTree(join(path, name))));

  const total: TreeMeasurement = {
    sizeBytes: 0,
    fileCount: 0,
    lastModifiedMs: 0,
    jsonlCount: 0,
  };
  for (const child of children) {
    total.sizeBytes += child.sizeBytes;
    total.fileCount += child.fileCount;
    total.jsonlCount += child.jsonlCount;
    if (child.lastModifiedMs > total.lastModifiedMs) total.lastModifiedMs = child.lastModifiedMs;
  }
  // A directory's OWN mtime answers a different question — it changes whenever
  // a child is added or renamed, so on a freshly copied tree every directory
  // reads as "just now" while the content is years old. The newest FILE is what
  // "when was this state last touched" means. An empty directory has no files
  // to speak for it, so there its own mtime is the only answer available.
  if (total.fileCount === 0) total.lastModifiedMs = mtimeMs;
  return total;
}

/**
 * Up to `limit` BARE FILE NAMES from within `path`, sorted for determinism.
 *
 * Names only — never a path, never a fragment containing a separator. The
 * preview shows the user something concrete about what is about to move to the
 * recycle bin, and `panel-host.ts`'s no-paths rule means it may show only the
 * leaf.
 */
export async function sampleFileNames(path: string, limit: number): Promise<string[]> {
  const collected: string[] = [];

  async function visit(current: string): Promise<void> {
    if (collected.length >= limit) return;
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    const sorted = [...entries].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const entry of sorted) {
      if (collected.length >= limit) return;
      if (entry.isDirectory()) {
        await visit(join(current, entry.name));
      } else {
        collected.push(entry.name);
      }
    }
  }

  let stats;
  try {
    stats = await lstat(path);
  } catch {
    return [];
  }
  if (!stats.isDirectory()) {
    const parts = path.replace(/\\/g, '/').split('/');
    const leaf = parts[parts.length - 1] ?? '';
    return leaf.length > 0 ? [leaf] : [];
  }
  await visit(path);
  return collected.slice(0, limit);
}
