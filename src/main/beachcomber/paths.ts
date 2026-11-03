/**
 * Path helpers for Beachcomber.
 *
 * Three jobs, all narrow:
 *
 *  1. `decodeDirectoryName` — the design's decoding rule, implemented ONLY as a
 *     labelled fallback. Claude Code encodes a working directory into a
 *     `~/.claude/projects/<dir>` name by replacing every non-alphanumeric run
 *     with `-`, which means `:`, `\`, `/`, `.` and a literal `-` all collapse
 *     onto the same character. The inverse is therefore not a function. Every
 *     value this returns is a GUESS and is tagged `pathSource: 'decoded-name'`
 *     so nothing downstream can mistake it for the recorded truth.
 *
 *  2. `normalizeForCompare` — the comparison key used to decide whether an
 *     entry's directory is the same directory as a Pod's `cwd`. Windows paths
 *     compare case-insensitively, tolerate either separator, and ignore a
 *     trailing separator, so all three differences must be erased BEFORE the
 *     equality test rather than hoped away.
 *
 *  3. `podBlockerFor` — the rule that decides whether a Pod's working directory
 *     is the directory behind an entry, and therefore whether the entry may be
 *     moved to the recycle bin at all. It lives here, as a pure function of the
 *     entry's own fields and the Pod list, rather than inside the scan: a rule
 *     buried in an async walk can only be exercised by building a directory
 *     tree, and this is the rule that decides whether state gets deleted.
 */

import type { BeachcomberEntry, BeachcomberRootKey } from '../../shared/contracts/beachcomber';
import type { PodDirectory } from '../../shared/contracts/panel-host';
import { encodeCwdForProjects } from '../pod-session';

/**
 * Case-folded, separator-folded, trailing-separator-stripped comparison key.
 *
 * Case folding is applied unconditionally rather than by platform: this app is
 * Windows-first, and folding case on a case-sensitive filesystem can only make
 * the comparison refuse MORE entries, never fewer. For a function whose whole
 * purpose is to block deletion, the over-refusing direction is the safe one.
 */
export function normalizeForCompare(path: string): string {
  const unified = path.replace(/\\/g, '/').toLowerCase();
  const collapsed = unified.replace(/\/{2,}/g, '/');
  // Keep a bare root (`c:/`, `/`) intact; strip trailing separators otherwise.
  const trimmed = collapsed.replace(/(?!^)\/+$/, '');
  return trimmed.length === 0 ? '/' : trimmed;
}

/** True when the two paths name the same directory, modulo the differences above. */
export function samePath(a: string, b: string): boolean {
  return normalizeForCompare(a) === normalizeForCompare(b);
}

/**
 * Best-effort inverse of the directory-name encoding. AMBIGUOUS BY
 * CONSTRUCTION — `C--Users-x-Repos-dir-ect` reads equally well as
 * `C:\Users\x\Repos\dir-ect` and `C:\Users\x\Repos\dir\ect`, and this returns
 * whichever the heuristic happens to pick. Callers must label the result.
 */
/**
 * Everything `podBlockerFor` is allowed to look at. Deliberately the entry's
 * own fields and nothing else — no absolute path, no filesystem, no service.
 */
export interface PodBlockingSubject {
  root: BeachcomberRootKey;
  /** The on-disk directory name, `BeachcomberEntry.name`. Never decoded. */
  name: string;
  pathSource: BeachcomberEntry['pathSource'];
  displayPath: string;
  pods: readonly PodDirectory[];
}

/**
 * The Pod that blocks this entry, or `null`.
 *
 * TWO COMPARISONS, AND THE SECOND ASKS THE QUESTION IN THE DIRECTION THAT HAS
 * AN ANSWER.
 *
 * Only one of the two directions between a working directory and a
 * `projects/<dir>` name is a function. `encodeCwdForProjects` (cwd -> name) is
 * total and deterministic: every character outside `[A-Za-z0-9]` becomes `-`.
 * `decodeDirectoryName` (name -> cwd) is not a function at all — `:`, `\`, `/`,
 * `.` and a literal `-` all arrive as the same `-`, so `C--Users-x-Repos-dir-ect`
 * reads equally well as `…\Repos\dir-ect` and `…\Repos\dir\ect` and the decoder
 * returns whichever the heuristic picks.
 *
 * So when an entry's path is a decoded GUESS, comparing that guess against a
 * Pod's cwd asks the undecidable direction and answers "not blocked" whenever
 * the guess went the other way — which is a directory the user still has open
 * being offered for deletion. Encoding the Pod's cwd and comparing against the
 * NAME ON DISK asks the decidable one instead, and the answer is exact rather
 * than conservative: the directory name IS the encoding of the true cwd.
 *
 * THE TWO ARE A UNION, NEVER A REPLACEMENT. The normalized comparison still
 * runs for every entry. Blocking is a refusal, so a second way to refuse can
 * only ever refuse more; no entry that was blocked before this comparison
 * existed becomes unblocked by it. (It is load-bearing: a name outside
 * `[A-Za-z0-9-]`, such as `my_project`, is returned verbatim by the decoder and
 * matched by the normalized side, while the encoder would have produced
 * `my-project` and missed it.)
 *
 * WHICH POD IS NAMED: THE EXACT MATCH. When both comparisons could match, and
 * match DIFFERENT Pods, the encoding match is returned, whatever the list
 * order — it is exact, while the normalized side compared against a guess. The
 * normalized match is returned only when no Pod matches by encoding. This
 * changes which Pod the refusal names, never whether there is one: an entry is
 * blocked exactly when either comparison matches any Pod. When the encoding
 * comparison does not run, the normalized comparison is the only one and the
 * first matching Pod in list order is returned.
 *
 * BOTH HALVES OF THE `projects` CONDITION MATTER. A non-`projects` entry
 * carries `pathSource: 'absolute-path'`, so `pathSource` alone would already
 * keep it out today — but the root check is what guarantees a Pod's cwd is
 * never encoded and compared against a shell-snapshot file name, which means
 * nothing, whatever `pathSource` a caller passes.
 *
 * CASE IS FOLDED, for the reason `normalizeForCompare` above already gives:
 * this app is Windows-first, and for a guard whose whole purpose is to block a
 * deletion, over-refusing is the safe direction. Folding case can only block
 * more entries, never fewer.
 */
export function podBlockerFor(subject: PodBlockingSubject): PodDirectory | null {
  const pathKey = normalizeForCompare(subject.displayPath);
  const compareByEncoding = subject.root === 'projects' && subject.pathSource === 'decoded-name';
  const nameKey = subject.name.toLowerCase();

  let normalizedMatch: PodDirectory | null = null;
  for (const pod of subject.pods) {
    if (compareByEncoding && encodeCwdForProjects(pod.cwd).toLowerCase() === nameKey) return pod;
    if (normalizedMatch === null && normalizeForCompare(pod.cwd) === pathKey) {
      normalizedMatch = pod;
      if (!compareByEncoding) return pod;
    }
  }
  return normalizedMatch;
}

export function decodeDirectoryName(name: string): string {
  const windowsDrive = /^([A-Za-z])--(.*)$/.exec(name);
  if (windowsDrive) {
    const drive = windowsDrive[1] ?? '';
    const rest = windowsDrive[2] ?? '';
    return `${drive}:\\${rest.replace(/-/g, '\\')}`;
  }
  if (name.startsWith('-')) {
    return `/${name.slice(1).replace(/-/g, '/')}`;
  }
  return name;
}
