/**
 * The ONE filesystem seam for `src/main/helm/**`.
 *
 * Every syscall Helm makes goes through this record. Nothing else under
 * `src/main/helm/` imports `node:fs` directly, which buys two things a direct
 * import does not:
 *
 *  1. A test can prove a NEGATIVE. Acceptance criterion 2 requires that a
 *     scopeId like `project:../../../etc` is answered `NOT_FOUND` **without
 *     touching the filesystem at all** — a scopeId is a key in a table, never a
 *     path fragment. "We do not build a path from it" is a claim a review makes
 *     once and then stops making; with this record a test spies on every member
 *     and asserts zero calls.
 *  2. `HelmServiceDeps` stays exactly as the frozen contract declares it. The
 *     service is constructed from those deps and nothing else (criterion 1), so
 *     the seam cannot be a constructor parameter.
 *
 * It is deliberately a plain mutable record rather than a class: `vi.spyOn`
 * needs a property it can replace. That is its whole reason for existing, and
 * production code only ever reads from it.
 */

import {
  copyFileSync,
  closeSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  watch,
  writeFileSync,
} from 'node:fs';

export interface HelmFsOps {
  statSync: typeof statSync;
  readFileSync: typeof readFileSync;
  writeFileSync: typeof writeFileSync;
  copyFileSync: typeof copyFileSync;
  renameSync: typeof renameSync;
  mkdirSync: typeof mkdirSync;
  rmSync: typeof rmSync;
  openSync: typeof openSync;
  fsyncSync: typeof fsyncSync;
  closeSync: typeof closeSync;
  watch: typeof watch;
}

export const helmFs: HelmFsOps = {
  statSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
  renameSync,
  mkdirSync,
  rmSync,
  openSync,
  fsyncSync,
  closeSync,
  watch,
};

/** True for a Node `ErrnoException` reporting "no such file or directory". */
export function isNotFoundError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as NodeJS.ErrnoException).code === 'ENOENT'
  );
}
