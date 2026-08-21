/**
 * `PodSessionRemover` — the only thing this module does.
 *
 * IT HOLDS NO DELETION PRIMITIVE. There is no filesystem mutation call
 * anywhere under `src/main/pod-session/**`; the single way something can
 * disappear is the injected `TrashItem`, which is the application's one
 * deletion capability (`src/main/index.ts`, `contracts/panel-host.ts`) and
 * which moves a path to the OS recycle bin, recoverably.
 * `tests/unit/beachcomber/no-destructive-api.test.ts` asserts that by source
 * scan over this directory as well as over Beachcomber's, because "we only
 * call trashItem" is a claim a code review makes once and then stops making.
 *
 * IT IMPORTS NEITHER `electron`, NOR `../pod-manager`, NOR `../store`. Every
 * capability it has arrives on `PodSessionRemoverDeps`, which is what lets the
 * whole module be exercised against a synthetic tree under a temp directory.
 *
 * IT NEVER REJECTS. A `TrashItem` rejection becomes `{ outcome: 'failed' }`
 * carrying the platform message verbatim. Caught here rather than at the IPC
 * handler so the handler has no branch that could turn a failed bin into a
 * failed deletion: the Pod row really was deleted, and reporting otherwise
 * would leave the user believing the Pod is still there.
 */

import type { Pod } from '../../shared/contracts/events';
import type { PodSessionRemover } from '../../shared/contracts/ipc';
import type { TrashItem } from '../../shared/contracts/panel-host';

import { sessionFilePath } from './paths';

/** What this module needs from the outside world. Nothing else. */
export interface PodSessionRemoverDeps {
  /** Absolute path of `~/.claude`. The same `CLAUDE_HOME` Beachcomber gets. */
  claudeHome: string;
  /** The application's single deletion capability. See the header. */
  trashItem: TrashItem;
  /**
   * Existence probe, injected so the whole module is exercisable against a
   * synthetic tree. Resolves true when the path names an existing FILE. Never
   * throws; an unreadable parent resolves false, which becomes `'not-found'`.
   */
  fileExists: (absolutePath: string) => Promise<boolean>;
}

/** The platform's own message, verbatim, whatever was thrown. */
function messageOf(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return String(err);
}

export function createPodSessionRemover(deps: PodSessionRemoverDeps): PodSessionRemover {
  const { claudeHome, trashItem, fileExists } = deps;

  return async (pod: Pod) => {
    // Null before the Pod's first turn: there is nothing on disk to remove, and
    // that is not an error.
    const ccSessionId = pod.ccSessionId;
    if (ccSessionId === null || ccSessionId.length === 0) {
      return { outcome: 'no-session' as const, error: null };
    }

    const absolutePath = sessionFilePath(claudeHome, pod.cwd, ccSessionId);

    // Already binned by hand, or the CLI wrote it somewhere else. Also not an
    // error — and checking first is what keeps a missing file from becoming a
    // platform error message the user cannot act on.
    if (!(await fileExists(absolutePath))) {
      return { outcome: 'not-found' as const, error: null };
    }

    try {
      await trashItem(absolutePath);
      return { outcome: 'trashed' as const, error: null };
    } catch (err) {
      return { outcome: 'failed' as const, error: messageOf(err) };
    }
  };
}
