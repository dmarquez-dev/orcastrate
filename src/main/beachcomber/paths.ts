/**
 * Path helpers for Beachcomber.
 *
 * Two jobs, both narrow:
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
 */

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
