/**
 * CONTRACT — Host seams shared by Beachcomber and Helm. Frozen at Gate 2.
 *
 * Lands verbatim at `src/shared/contracts/panel-host.ts`.
 *
 * Boundary between:
 *   - T8 (PRODUCER of the implementations) wires `src/main/index.ts` and is the
 *     only place that reaches Electron's `shell` or the `PodManager`.
 *   - T2 (Beachcomber service) and T3 (Helm service) CONSUME these ports and
 *     must never import `electron` or `../pod-manager` themselves.
 *   - T1 declares them on `IpcHandlerDeps`.
 *
 * WHY THESE ARE PORTS AND NOT IMPORTS. Both new services do irreversible things
 * to a developer's disk. A service that reaches `shell.trashItem` directly can
 * only be tested by deleting something real, which the test discipline forbids
 * outright and which no reviewer can safely re-run. Injecting the two dangerous
 * capabilities — "move this to the recycle bin" and "which directories belong
 * to a Pod" — makes the whole of T2 and T3 exercisable against a synthetic tree
 * under `mkdtempSync(join(tmpdir(), …))`, which is the established pattern in
 * `tests/unit/store/helpers.ts`.
 */

import type { PodId } from './events';

/**
 * A directory Orcastrate itself has a stake in.
 *
 * Supplied by T8 from `PodManagerApi.listPods()`. `cwd` is an absolute path
 * that ORIGINALLY came from `dialog.pickDirectory` — it never came from the
 * renderer's keyboard, and it never goes back to the renderer as anything but
 * a display string.
 */
export interface PodDirectory {
  podId: PodId;
  /** The Pod's user-supplied title, so a refusal can name what blocked it. */
  title: string;
  /** Absolute. Main-side only. */
  cwd: string;
}

/**
 * Every Pod Orcastrate knows about, at the moment of the call.
 *
 * DELIBERATELY NOT "every OPEN Pod", which is what design section 6 says.
 * `PodManagerApi` exposes no "is this Pod's runner live" predicate, and
 * `Pod.status` cannot answer it — an `idle` Pod may be open and quiet or closed
 * entirely. The three ways out were: add a method to `PodManagerApi` (widens a
 * module nothing else in this session touches), infer liveness from status
 * (wrong, and wrong in the unsafe direction), or block every known Pod's
 * directory. This contract takes the third. It is STRICTLY STRONGER than the
 * design rule — it refuses a superset of what the design refuses — and the cost
 * is that a user cannot trash the `~/.claude/projects` entry for a Pod they
 * still have in Orcastrate without deleting the Pod first. That is stated in
 * the refusal message rather than left for the user to work out.
 */
export type PodDirectoryProvider = () => readonly PodDirectory[];

/**
 * Moves one absolute path to the OS recycle bin.
 *
 * T8 supplies Electron's `shell.trashItem`. Resolves on success; REJECTS with
 * the platform error on failure — this is the one port that rejects, because
 * `shell.trashItem` does, and translating at the injection site would hide
 * which failure the service is meant to report verbatim.
 *
 * THERE IS NO OTHER DELETION PRIMITIVE IN THIS SESSION. No `rm`, no `unlink`,
 * no `rmSync({ recursive: true })` appears in `src/main/beachcomber/**` at all;
 * T2's acceptance criteria assert that by source scan, because "we only call
 * trashItem" is a claim a code review makes and then stops making.
 */
export type TrashItem = (absolutePath: string) => Promise<void>;

/**
 * Wall-clock, injected so backup filenames and scan timestamps are assertable.
 * Test discipline: no test depends on the wall clock.
 */
export type PanelClock = () => Date;
