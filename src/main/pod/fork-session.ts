/**
 * The fork port: the one place main reaches the SDK's standalone
 * `forkSession`.
 *
 * `PodManager` takes a `ForkSession` on `PodManagerDeps` and falls back to
 * `defaultForkSession` when none is supplied, the way it falls back to its own
 * `isDirectory` probe. A test injects a fake; `src/main/index.ts` supplies
 * nothing and gets this adapter.
 *
 * The SDK copies the source session's transcript into a new session file under
 * the project directory `dir` and returns the new session's id, which is
 * resumable through the ordinary `resume` option. No CLI process is spawned.
 */

import { forkSession as sdkForkSession } from '@anthropic-ai/claude-agent-sdk';

/**
 * Forks Claude Code session `sourceSessionId`, found under the project
 * directory `options.dir`, and resolves the NEW session's id. Rejects when the
 * SDK rejects, with the SDK's own error.
 */
export type ForkSession = (
  sourceSessionId: string,
  options: { dir: string },
) => Promise<string>;

/**
 * The real port. Passes exactly `{ dir }` — no `upToMessageId`, because the
 * fork is always taken at the session's current end, and no `title`, because
 * the Pod's title lives on the Pod row rather than in the session file.
 */
export const defaultForkSession: ForkSession = async (sourceSessionId, { dir }) => {
  const { sessionId } = await sdkForkSession(sourceSessionId, { dir });
  return sessionId;
};
