/**
 * Write safety, rule 3: RE-READ AND COMPARE.
 *
 * A `HelmRevision` is the identity of the bytes that were loaded. The renderer
 * treats it as opaque and hands it back on save; `save` re-reads the file
 * immediately before writing and refuses when the identity moved. That check
 * cannot be raced and cannot be skipped, which is why it — and not the watcher
 * — is the guarantee (frozen contract header).
 *
 * ABSENCE IS AN IDENTITY TOO. `null` means "there was no file when I loaded".
 * Saving with a null revision succeeds only if there is still no file; a file
 * that appeared in between is a CONFLICT like any other.
 *
 * `mtimeMs` TRAVELS BUT DOES NOT DECIDE. It is carried because the contract's
 * shape declares it and it is useful in a support log, but the comparison is on
 * content: a `touch`, a checkout that rewrites identical bytes, or a filesystem
 * with coarse timestamps must not manufacture a conflict the user cannot
 * explain. Content that differs is the thing the user would lose.
 */

import { createHash } from 'node:crypto';

import type { HelmRevision } from '../../shared/contracts/helm';

import { helmFs, isNotFoundError } from './fs-ops';

export interface FileSnapshot {
  /** null when the file does not exist — a normal state, not an error. */
  revision: HelmRevision | null;
  /** The bytes as UTF-8 text, or null when absent. */
  text: string | null;
}

export function sha256Of(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/**
 * Reads the file if it is there. ENOENT resolves to an absent snapshot; every
 * other `ErrnoException` propagates verbatim (rule 4).
 */
export function readSnapshot(path: string): FileSnapshot {
  let text: string;
  try {
    text = helmFs.readFileSync(path, 'utf8');
  } catch (err) {
    if (isNotFoundError(err)) return { revision: null, text: null };
    throw err;
  }

  const stat = helmFs.statSync(path);
  return {
    revision: {
      sha256: sha256Of(text),
      sizeBytes: Buffer.byteLength(text, 'utf8'),
      mtimeMs: stat.mtimeMs,
    },
    text,
  };
}

/** True when `fileExists(path)`. Never throws for a missing file. */
export function fileExists(path: string): boolean {
  try {
    helmFs.statSync(path);
    return true;
  } catch (err) {
    if (isNotFoundError(err)) return false;
    throw err;
  }
}

/** Same bytes? Absence matches only absence. See the header on `mtimeMs`. */
export function revisionsMatch(a: HelmRevision | null, b: HelmRevision | null): boolean {
  if (a === null || b === null) return a === b;
  return a.sha256 === b.sha256 && a.sizeBytes === b.sizeBytes;
}
