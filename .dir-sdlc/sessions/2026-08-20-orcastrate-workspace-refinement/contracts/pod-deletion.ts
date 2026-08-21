/**
 * CONTRACT — Deleting a Pod, and optionally its Claude Code session on disk.
 * Frozen at Gate 2.
 *
 * This is an AMENDMENT to the frozen `ipc.ts` (`podDelete`), to the frozen
 * `renderer-state.ts` (`WorkspaceActions.deletePod`), and to `IpcHandlerDeps`.
 * Everything else on all three surfaces is unchanged.
 *
 * Boundary between:
 *   - T0 (PRODUCER) `src/shared/contracts/ipc.ts`, `src/main/pod-session/**`,
 *     `src/main/ipc/**`, `src/main/index.ts`, `src/preload/**`.
 *   - T1 (CONSUMER) the renderer state layer — the only caller of the bridge.
 *   - T4 (CONSUMER) `src/renderer/src/pods/**` — the confirmation dialog.
 *   - T5 (CONSUMER) the renderer suites, including `failure-paths.e2e`.
 *
 * ===========================================================================
 * THE INVARIANT THIS CONTRACT EXISTS TO PROTECT
 * ===========================================================================
 *
 * `src/main/index.ts` declares `shell.trashItem` as "the application's single
 * deletion capability", and `panel-host.ts` states it outright: THERE IS NO
 * OTHER DELETION PRIMITIVE. `tests/unit/beachcomber/no-destructive-api.test.ts`
 * asserts it by source scan, because "we only call trashItem" is a claim a code
 * review makes once and then stops making.
 *
 * This feature deletes a directory entry under `~/.claude/projects/`, which is
 * squarely Beachcomber's territory. It therefore adds NO new deletion
 * primitive: no `rm`, no `unlink`, no `rmSync({ recursive: true })` appears
 * anywhere in `src/main/pod-session/**`, and the same source scan is widened to
 * cover that directory. The one `TrashItem` in `src/main/index.ts` is injected
 * into the new port exactly as it is injected into Beachcomber.
 *
 * ===========================================================================
 * WHAT GETS DELETED, AND WHY IT IS NOT THE DIRECTORY
 * ===========================================================================
 *
 * `~/.claude/projects/<encoded-cwd>/` is keyed by WORKING DIRECTORY, not by
 * Pod. It holds one `<sessionId>.jsonl` per Claude Code session ever run in
 * that directory — this Pod's, every other Orcastrate Pod pointed at the same
 * directory, and every session the user ran from the CLI by hand. Trashing the
 * directory to delete one Pod's session destroys all of them.
 *
 * So the unit of deletion here is ONE FILE: `<pod.ccSessionId>.jsonl` inside
 * that directory. `TrashItem` takes an absolute path and `shell.trashItem`
 * accepts a file as readily as a directory, so this costs nothing structurally
 * and is the only version of the feature that does what its confirmation says.
 * The directory itself is left in place even when the file was its last
 * occupant; reclaiming an empty directory is Beachcomber's job, it is where the
 * user can see the size before agreeing, and it is already reachable — the
 * `PodDirectoryProvider` block that refuses it lifts the moment the Pod row is
 * gone (`panel-host.ts`).
 *
 * THE ENCODING DIRECTION MATTERS AND IS THE SAFE ONE. `paths.ts` warns that
 * DECODING a directory name is ambiguous by construction. This contract only
 * ever ENCODES — cwd to directory name — which is a total, deterministic
 * function. Nothing here decodes, and nothing here guesses.
 */

import type { Pod, PodId } from './events';
import type { IpcResult } from './ipc';
import type { TrashItem } from './panel-host';

// ---------------------------------------------------------------------------
// 1. The request — REPLACES `podDelete`'s bare `PodId`
// ---------------------------------------------------------------------------

/**
 * REPLACES the `delete(podId: PodId)` signature on `OrcastrateApi.pods`. A
 * request object rather than a second positional boolean, because
 * `delete(podId, true)` at a call site says nothing about what `true` destroys.
 */
export interface DeletePodRequest {
  podId: PodId;
  /**
   * Also move this Pod's Claude Code session file to the OS recycle bin.
   *
   * REQUIRED, not optional and not defaulted. A caller that has not decided
   * must not be able to omit the field and get either behaviour by accident;
   * the renderer's confirmation dialog is what decides it, and the dialog
   * defaults the checkbox to FALSE (see section 4).
   */
  deleteSession: boolean;
}

// ---------------------------------------------------------------------------
// 2. The result — PARTIAL SUCCESS IS A VALUE, NOT AN ERROR
// ---------------------------------------------------------------------------

/**
 * What happened to the session file. Modelled as a value for the same reason
 * `BeachcomberTrashResult` is: the Pod row really was deleted, and a failure to
 * also bin a file must not report as a failed deletion and leave the user
 * believing the Pod is still there.
 *
 *   'not-requested'  `deleteSession` was false. Nothing was attempted.
 *   'no-session'     `pod.ccSessionId` was null — the Pod never reached its
 *                    first turn, so there is nothing on disk to remove. NOT an
 *                    error, and the dialog must not offer the checkbox at all
 *                    in this case (section 4).
 *   'not-found'      The file was not where it was expected. Already binned by
 *                    hand, or the CLI wrote it elsewhere. NOT an error.
 *   'trashed'        `TrashItem` resolved. The file is in the recycle bin.
 *   'failed'         `TrashItem` rejected. `sessionError` carries the platform
 *                    message VERBATIM (`ipc.ts` IpcError.message rule,
 *                    design 7).
 */
export type PodSessionRemovalOutcome =
  | 'not-requested'
  | 'no-session'
  | 'not-found'
  | 'trashed'
  | 'failed';

export interface PodDeletionResult {
  podId: PodId;
  /**
   * ALWAYS TRUE on a resolved result. The Pod row and its history are gone.
   * The field exists so the shape reads as a report rather than a bare enum,
   * and so a future soft-delete has somewhere to land without another
   * amendment.
   */
  podDeleted: true;
  session: PodSessionRemovalOutcome;
  /** Non-null if and only if `session === 'failed'`. The OS message verbatim. */
  sessionError: string | null;
}

// ---------------------------------------------------------------------------
// 3. The channel and the port
// ---------------------------------------------------------------------------

/**
 * `INVOKE_CHANNELS.podDelete` KEEPS ITS NAME, `'pod:delete'`. Only its payload
 * and its resolved value change. `OrcastrateApi.pods.delete` becomes:
 */
export interface PodDeleteApi {
  delete(req: DeletePodRequest): Promise<IpcResult<PodDeletionResult>>;
}

/**
 * ERROR CASES, which are the part implementers guess differently. The channel
 * resolves an `IpcResult` and never rejects, as every channel does. It answers
 * `{ ok: false }` for exactly two conditions:
 *
 *   NOT_FOUND         no Pod with that id. From `manager.deletePod`, unchanged.
 *   INVALID_ARGUMENT  the payload is not a `DeletePodRequest` — a missing or
 *                     non-boolean `deleteSession`, or a `podId` that is not a
 *                     string. Validated in `src/main/ipc/validate.ts` beside
 *                     the existing `requireUpdatePodRequest`.
 *
 * A `TrashItem` rejection is NOT one of them. It is `session: 'failed'` on a
 * successful result, per section 2.
 *
 * ORDERING, and it is load-bearing: the session path is RESOLVED FROM THE POD
 * ROW BEFORE the row is deleted, because `ccSessionId` and `cwd` live on that
 * row and nowhere else. The order is: read the Pod, resolve the path, call
 * `manager.deletePod` (which disposes any live runner and deletes the row),
 * then call `TrashItem`. Trashing last means a rejection cannot leave a Pod row
 * pointing at a session that is already in the bin.
 *
 * IDEMPOTENCY: deleting an already-deleted Pod answers `NOT_FOUND`, exactly as
 * it does today. Trashing an already-trashed file answers `'not-found'`.
 */

/**
 * The main-process port. Implemented in `src/main/pod-session/**`, constructed
 * in `src/main/index.ts` — the ONLY place `CLAUDE_HOME` and `trashItem` are
 * available — and injected onto `IpcHandlerDeps` as `deletePodSession`.
 *
 * WHY A PORT AND NOT AN IMPORT, and this is not stylistic: `handlers.ts` states
 * that a source scan asserts `src/main/ipc/**` reaches neither the filesystem
 * nor Electron, "because a transport that could reach the filesystem would be
 * one more place a path could be composed". That scan must keep passing. The
 * handler calls a port; it composes nothing. This is the identical shape
 * `pickDirectory`, `beachcomber` and `helm` already take on the same interface.
 *
 * It takes the whole `Pod` rather than a `PodId` because it is called AFTER the
 * row is read and BEFORE it is deleted — see the ordering rule above — and
 * because a port that had to look the Pod up would need the store.
 *
 * RESOLVES ALWAYS. It never rejects: a `TrashItem` rejection becomes
 * `{ outcome: 'failed', error }`. The rejection is caught HERE rather than in
 * the handler, so the handler has no branch that could turn a binned-file
 * failure into a failed deletion.
 */
export type PodSessionRemover = (
  pod: Pod,
) => Promise<{ outcome: PodSessionRemovalOutcome; error: string | null }>;

/** What `src/main/pod-session/**` needs from the outside world. Nothing else. */
export interface PodSessionRemoverDeps {
  /** Absolute path of `~/.claude`. The same `CLAUDE_HOME` Beachcomber gets. */
  claudeHome: string;
  /** The application's single deletion capability. See the header. */
  trashItem: TrashItem;
  /**
   * Existence probe, injected so the whole module is exercisable against a
   * synthetic tree under `mkdtempSync(join(tmpdir(), …))` — the established
   * pattern in `tests/unit/store/helpers.ts`. Resolves true when the path names
   * an existing FILE. Never throws; an unreadable parent resolves false, which
   * becomes `'not-found'`.
   */
  fileExists: (absolutePath: string) => Promise<boolean>;
}

// ---------------------------------------------------------------------------
// 4. The renderer surface
// ---------------------------------------------------------------------------

/**
 * REPLACES `WorkspaceActions.deletePod(podId)`. Its docblock's current sentence
 * — "Does not touch anything on disk" — is DELETED, because it is exactly what
 * this amendment stops being true.
 *
 * Still resolves and never rejects. Still safe to call twice: the second call
 * answers `NOT_FOUND`, which the dialog reports as the Pod already being gone
 * rather than as a failure.
 *
 * ON SUCCESS the state layer removes the Pod's row, its runtime, and clears
 * `activePodId` if it named this Pod — unchanged from today. It does this
 * whenever `podDeleted` is true, INDEPENDENTLY of `session`: a Pod whose file
 * could not be binned is still a deleted Pod.
 */
export interface DeletePodAction {
  deletePod(req: DeletePodRequest): Promise<PodDeletionActionResult>;
}

/** `ActionResult<PodDeletionResult>`, named so the dialog can hold it. */
export type PodDeletionActionResult =
  | { ok: true; value: PodDeletionResult }
  | { ok: false; error: { code: string; message: string } };

/**
 * THE CONFIRMATION, which is the affordance item 3 is actually about.
 *
 * WHEN THE `x` CONFIRMS RATHER THAN STOPS. The Pod tab's `x` keeps its current
 * meaning — stop the process — for a Pod with a live one. For a Pod that is
 * already stopped (`status` is `'closed'` or `'beached'`, i.e. `opened` is
 * false) there is no process to stop and `x` today answers with a not-running
 * error, which is the dead end the first run hit. In that state, and only in
 * that state, `x` opens this confirmation.
 *
 * That gives `x` two meanings by status, so the control's ACCESSIBLE NAME must
 * say which one it currently has — "Close <title>" versus "Delete <title>" —
 * rather than leaving the user to infer it from the Pod's state.
 *
 * WHAT THE CONFIRMATION MUST STATE, and none of it is optional:
 *   - That deleting the Pod removes its transcript history, permanently. That
 *     is what `pods.delete` has always done and no dialog has ever said it.
 *   - The Pod's title, so a mis-click on the wrong tab is visible.
 *   - The session checkbox, DEFAULTED OFF, described in terms of what it
 *     removes: this Pod's Claude Code conversation file, moved to the recycle
 *     bin, recoverable from there. Not "delete the session directory" — that is
 *     not what happens (see the header).
 *   - The checkbox is ABSENT, not disabled, when `pod.ccSessionId` is null.
 *     There is nothing on disk and an unchecked box implying otherwise is a
 *     lie about state.
 *
 * WHAT IT REPORTS AFTERWARDS. A `session: 'failed'` result MUST surface its
 * `sessionError` — the Pod is gone, the file is not, and the user has to be
 * told which. This dialog may NOT be added to `SURFACELESS_CHANNELS` in
 * `failure-paths.e2e.test.tsx`, for the reason Beachcomber's three channels may
 * not be: a delete that silently does nothing is the worst failure this feature
 * has.
 */
export interface DeletePodDialogProps {
  /** Null when closed. The Pod being deleted, so the copy can name it. */
  pod: Pod | null;
  /** True while the `pods.delete` call is in flight. Both buttons disable. */
  submitting: boolean;
  /**
   * Rendered inside the dialog, which STAYS OPEN. Covers both a failed delete
   * and a successful delete whose session file could not be binned — in the
   * second case the Pod is already gone, so the copy says so and the only
   * remaining button is Dismiss.
   */
  error: string | null;
  onCancel(): void;
  onConfirm(deleteSession: boolean): void;
}
