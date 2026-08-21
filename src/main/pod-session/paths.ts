/**
 * Where Claude Code keeps one Pod's transcript, and how that location is
 * derived.
 *
 * ONE DIRECTION ONLY: cwd -> directory name. That direction is a total,
 * deterministic function. The INVERSE is ambiguous by construction — see
 * `decodeDirectoryName` in `src/main/beachcomber/paths.ts`, whose docblock
 * spells out that `C--Users-x-Repos-dir-ect` reads equally well as
 * `C:\Users\x\Repos\dir-ect` and `C:\Users\x\Repos\dir\ect`. Nothing in this
 * module decodes a directory name, and nothing here compares a decoded one.
 * A wrong guess here would name the wrong file to a deletion primitive.
 */

import { join } from 'node:path';

/**
 * Claude Code's own encoding: every character that is not `[A-Za-z0-9]` becomes
 * `-`, CHARACTER FOR CHARACTER rather than run for run.
 *
 * Evidence for the per-character reading, since the two differ on every Windows
 * path: `C:\Users\dmarq\Development\Repos\orcastrate` exists on disk as
 * `C--Users-dmarq-Development-Repos-orcastrate` — the `:` and the `\` each
 * produced their own `-`. Collapsing the run would give `C-Users-…`, which
 * Beachcomber's `decodeDirectoryName` would not even recognise as a drive
 * (`/^([A-Za-z])--(.*)$/`). The two functions are inverses of each other in the
 * direction that is defined, and that is the check that keeps them honest.
 */
export function encodeCwdForProjects(cwd: string): string {
  return cwd.replace(/[^A-Za-z0-9]/g, '-');
}

/**
 * `<claudeHome>/projects/<encoded cwd>/<sessionId>.jsonl`.
 *
 * ONE FILE, never the parent directory. `~/.claude/projects/<encoded-cwd>/` is
 * keyed by WORKING DIRECTORY, not by Pod: it holds one `<sessionId>.jsonl` per
 * Claude Code session ever run in that directory — this Pod's, every other Pod
 * pointed at the same directory, and every session the user ran from the CLI by
 * hand. Reclaiming the directory is Beachcomber's job, where the user sees its
 * size before agreeing.
 */
export function sessionFilePath(
  claudeHome: string,
  cwd: string,
  ccSessionId: string,
): string {
  return join(claudeHome, 'projects', encodeCwdForProjects(cwd), `${ccSessionId}.jsonl`);
}
