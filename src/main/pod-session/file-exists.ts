/**
 * The real existence probe, supplied by `src/main/index.ts` and by nothing
 * else. Kept in its own file so the remover itself names no `node:fs` symbol at
 * all, and so every test drives the port through an injected probe.
 *
 * READ-ONLY BY CONSTRUCTION. `stat` is the only filesystem call in this module.
 */

import { stat } from 'node:fs/promises';

/**
 * True only for an existing regular FILE. A directory answers false: the unit
 * of deletion here is one `.jsonl`, and a probe that said yes to its parent
 * would be the one mistake this whole feature is written to avoid.
 *
 * Never throws. A missing path, an unreadable parent, or a permission refusal
 * all answer false, which the caller reports as `'not-found'`.
 */
export async function fileExists(absolutePath: string): Promise<boolean> {
  try {
    const stats = await stat(absolutePath);
    return stats.isFile();
  } catch {
    return false;
  }
}
