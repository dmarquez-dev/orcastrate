/**
 * The `ipcMain.handle` registrations — the entire main-side surface the
 * renderer can reach.
 *
 * THE INVARIANT THIS FILE ENFORCES (criterion 3): no handler ever rejects.
 * Every one is wrapped by `envelope`, which resolves `{ ok: true, value }` or
 * `{ ok: false, error }` with a documented `IpcErrorCode`. An Electron IPC
 * rejection crosses the bridge as a stringified error and loses its type, so a
 * rejecting handler would hand the renderer something it cannot branch on.
 * That is why the wrapper is applied by `register` rather than by each handler
 * remembering to try/catch: forgetting is not possible.
 *
 * Channel names come from `INVOKE_CHANNELS`, never from string literals, and
 * `register` refuses a duplicate registration — so "exactly one handler per
 * channel, and no handler outside the contract" is a property of this module,
 * not of a review.
 *
 * `electron` is NOT imported here. `ipcMain` and the directory picker arrive as
 * narrow injected interfaces, which is what lets the whole surface be exercised
 * in a plain Node test.
 *
 * NEITHER IS `node:fs`, NOR `../beachcomber`, NOR `../helm`. Both panel
 * services arrive on `IpcHandlerDeps` as the interfaces their frozen contracts
 * declare, for the same reason `ipcMain` does: this module is a transport, and
 * a transport that could reach the filesystem would be one more place a path
 * could be composed. A source scan over `src/main/ipc/**` asserts all four
 * absences, because "we do not import that" is a claim a review makes once and
 * then stops making.
 */

import type { BeachcomberService } from '../../shared/contracts/beachcomber';
import type { HelmService } from '../../shared/contracts/helm';
import {
  INVOKE_CHANNELS,
  type IpcResult,
  type PodDeletionResult,
  type PodSessionRemover,
} from '../../shared/contracts/ipc';
import type { PodManagerApi } from '../pod-manager';

import { fail, IpcFailure, ok } from './errors';
import {
  requireBeachcomberPreviewRequest,
  requireBeachcomberTrashRequest,
  requireCreatePodRequest,
  requireDeletePodRequest,
  requireHelmSaveRequest,
  requireHelmScopeId,
  requirePermissionMode,
  requirePermissionRespondRequest,
  requirePodId,
  requireReadEventsRequest,
  requireText,
  requireUpdatePodRequest,
} from './validate';

/** The slice of Electron's `ipcMain` this module uses. */
export interface IpcMainLike {
  handle(
    channel: string,
    listener: (event: unknown, ...args: unknown[]) => Promise<unknown> | unknown,
  ): void;
}

export interface IpcHandlerDeps {
  ipcMain: IpcMainLike;
  manager: PodManagerApi;
  /**
   * Opens the OS directory chooser. Resolves the chosen absolute path, or null
   * when the user cancelled. Criterion 5: this is the ONLY source of a new
   * filesystem path in the whole application.
   */
  pickDirectory: () => Promise<string | null>;
  /**
   * The Beachcomber and Helm ports, INJECTED — never resolved from a module
   * global or imported from `../beachcomber` / `../helm`. This module knows
   * both services only as the interfaces the frozen contracts declare, which
   * is what keeps the whole IPC surface exercisable against a fake that does
   * not touch a disk. `src/main/index.ts` (T8) is the only place the real
   * implementations are constructed, and the only place their own dangerous
   * capabilities (`shell.trashItem`, the Pod list) are supplied.
   */
  beachcomber: BeachcomberService;
  helm: HelmService;
  /**
   * Moves ONE Pod's Claude Code session file to the recycle bin. INJECTED for
   * exactly the reason the two panel services are: this module composes no
   * path and reaches no filesystem. `src/main/index.ts` is the only place it is
   * constructed, from the `CLAUDE_HOME` and the single `TrashItem` that already
   * live there — there is no second deletion capability anywhere.
   *
   * RESOLVES ALWAYS, including when the trash rejects. See its declaration.
   */
  deletePodSession: PodSessionRemover;
}

/** Every channel `registerIpcHandlers` installed, in registration order. */
export function registerIpcHandlers(deps: IpcHandlerDeps): string[] {
  const registered = new Set<string>();
  const { manager } = deps;

  function register(
    channel: string,
    handler: (...args: unknown[]) => unknown,
  ): void {
    if (registered.has(channel)) {
      throw new Error(`ipc channel ${channel} already has a handler`);
    }
    registered.add(channel);
    deps.ipcMain.handle(channel, async (_event, ...args): Promise<IpcResult<unknown>> => {
      try {
        return ok(await handler(...args));
      } catch (err) {
        return fail(err);
      }
    });
  }

  // -- pods -----------------------------------------------------------------

  register(INVOKE_CHANNELS.podList, () => manager.listPods());

  register(INVOKE_CHANNELS.podCreate, (req) => manager.createPod(requireCreatePodRequest(req)));

  register(INVOKE_CHANNELS.podUpdate, (req) => manager.updatePod(requireUpdatePodRequest(req)));

  /**
   * THE ORDER IS LOAD-BEARING, and it is the whole of this handler's logic:
   *
   *   1. READ THE ROW. `ccSessionId` and `cwd` live on it and nowhere else, so
   *      once the row is gone the session file can no longer be named.
   *   2. DELETE THE ROW (`manager.deletePod`, which also disposes any live
   *      runner). Unknown Pod -> NOT_FOUND, exactly as today.
   *   3. ONLY THEN hand the captured row to the session port, which is what
   *      reaches the trash capability.
   *
   * Trashing LAST means a rejection cannot leave a Pod row pointing at a file
   * that is already in the recycle bin. It also means a failed `deletePod`
   * never bins anything.
   *
   * NO PATH IS COMPOSED HERE. This module is a transport; `deletePodSession` is
   * a port for the same reason `beachcomber` and `pickDirectory` are.
   */
  register(INVOKE_CHANNELS.podDelete, async (payload): Promise<PodDeletionResult> => {
    const req = requireDeletePodRequest(payload);
    const pod = manager.listPods().find((row) => row.id === req.podId);

    await manager.deletePod(req.podId);

    // `pod === undefined` is unreachable in practice — `deletePod` would have
    // answered NOT_FOUND above — but it is not worth a non-null assertion.
    if (!req.deleteSession || pod === undefined) {
      return {
        podId: req.podId,
        podDeleted: true,
        session: 'not-requested',
        sessionError: null,
      };
    }

    // Resolves always: a trash rejection arrives as `'failed'`, never as a
    // throw, so there is no branch here that could turn a failed bin into a
    // failed deletion.
    const removal = await deps.deletePodSession(pod);
    return {
      podId: req.podId,
      podDeleted: true,
      session: removal.outcome,
      sessionError: removal.error,
    };
  });

  register(INVOKE_CHANNELS.podOpen, (podId) => manager.openPod(requirePodId(podId)));

  register(INVOKE_CHANNELS.podClose, (podId) => manager.closePod(requirePodId(podId)));

  register(INVOKE_CHANNELS.podReconnect, (podId) => manager.reconnectPod(requirePodId(podId)));

  // The manager owns eligibility, the SDK call and the store write; this
  // boundary only proves the PodId is a non-empty string.
  register(INVOKE_CHANNELS.podFork, (podId) => manager.forkPod(requirePodId(podId)));

  // A read of the live session's list; the manager answers `[]` for a Pod with
  // no live session and NOT_FOUND for no Pod row.
  register(INVOKE_CHANNELS.podCommands, (podId) => manager.listSlashCommands(requirePodId(podId)));

  register(INVOKE_CHANNELS.podSend, async (podId, text) => {
    const id = requirePodId(podId);
    await manager.send(id, requireText(text, 'text'));
  });

  register(INVOKE_CHANNELS.podInterrupt, (podId) => manager.interrupt(requirePodId(podId)));

  register(INVOKE_CHANNELS.podSetPermissionMode, async (podId, mode) => {
    const id = requirePodId(podId);
    await manager.setPermissionMode(id, requirePermissionMode(mode));
  });

  // -- lanes / events -------------------------------------------------------

  register(INVOKE_CHANNELS.laneList, (podId) => manager.listLanes(requirePodId(podId)));

  register(INVOKE_CHANNELS.eventsRead, (req) => manager.readEvents(requireReadEventsRequest(req)));

  // -- permissions ----------------------------------------------------------

  // The manager's return value is RETURNED, not discarded. `respondPermission`
  // is synchronous today, but a block-bodied arrow would swallow a promise if it
  // ever stopped being — turning a rejection into a silent `{ ok: true }` and an
  // unhandled rejection in main.
  register(INVOKE_CHANNELS.permissionRespond, (req) =>
    manager.respondPermission(requirePermissionRespondRequest(req)),
  );

  // -- dialog ---------------------------------------------------------------

  /**
   * Criterion 5: cancellation is NOT an error. The contract is explicit —
   * `{ ok: true, value: { path: null } }` — because a cancelled picker is a
   * normal outcome the renderer branches on, and modelling it as a failure
   * would make every call site treat "the user changed their mind" as a fault.
   */
  register(INVOKE_CHANNELS.dialogPickDirectory, async () => {
    const path = await deps.pickDirectory();
    if (path === null || path === undefined) return { path: null };
    if (typeof path !== 'string' || path.length === 0) {
      throw new IpcFailure('IO', 'the directory picker returned an unusable path');
    }
    return { path };
  });

  // -- app ------------------------------------------------------------------

  /**
   * Criterion 11: read off the LIVE PodManager, which is the same value every
   * `LaneRouter` it builds was constructed with. Not a second literal that
   * could drift from the router's actual mode.
   */
  register(INVOKE_CHANNELS.appRoutingMode, () => manager.routingMode);

  // -- beachcomber ----------------------------------------------------------

  /**
   * No try/catch here, and none in the five below it. `register` already
   * wraps every handler in `envelope`, so a `NOT_FOUND` `IpcFailure` from the
   * service crosses as its own code and anything else becomes `INTERNAL` with
   * a safe message. A local catch could only make that worse — either by
   * swallowing the code the service chose, or by putting a stack in a string
   * the renderer shows a user.
   *
   * Note also what does NOT happen: no path is composed, resolved or checked.
   * The validators prove shape; `BeachcomberService` owns every question that
   * needs the disk, including whether an id belongs to this scan.
   */
  register(INVOKE_CHANNELS.beachcomberScan, () => deps.beachcomber.scan());

  register(INVOKE_CHANNELS.beachcomberPreview, (req) =>
    deps.beachcomber.preview(requireBeachcomberPreviewRequest(req)),
  );

  register(INVOKE_CHANNELS.beachcomberTrash, (req) =>
    deps.beachcomber.trash(requireBeachcomberTrashRequest(req)),
  );

  // -- helm -----------------------------------------------------------------

  register(INVOKE_CHANNELS.helmScopes, () => deps.helm.listScopes());

  /**
   * ARMING THE WATCHER IS THIS HANDLER'S JOB, and nothing else does it.
   *
   * `HelmService.watch` is the only path that starts the `fs.watch` behind
   * `HelmChangedPush`, and until this call existed nothing in the application
   * invoked it: there is no `helmWatch` channel, and neither `load` nor `save`
   * arms it. The watcher was therefore dead code in the shipped app — the
   * "This file changed on disk" notice could never render, and `save`'s
   * `acknowledgeOwnWrite` guarded a push path that never ran. Found by the
   * 2026-10-07 driven hand-run, which observed zero pushes across two external
   * writes; see `.dir-sdlc/handruns/2026-09-30-electron-handrun/FINDINGS.md`.
   *
   * Arming HERE rather than inside `load` keeps the service's documented
   * behaviour unchanged and puts the call where "the user chose a scope" is
   * actually known. A scope switch and a reload both route through `load`, and
   * `HelmWatcher` holds at most one watch and releases the previous one, so
   * re-arming on every load is correct rather than merely harmless.
   *
   * THE ARMING MUST NOT BE ABLE TO FAIL THE LOAD. The frozen contract calls the
   * watch advisory and says it is NEVER A GUARD. `watch` re-reads the file to
   * seed its hash and resolves the scope again, and `readSnapshot` rethrows
   * anything that is not ENOENT — so an unreadable-but-present settings file
   * would otherwise turn a load the user can see succeed into a failed invoke.
   * A best-effort signal that can break the thing it annotates is worse than
   * no signal, so the failure is swallowed deliberately.
   */
  register(INVOKE_CHANNELS.helmLoad, async (scopeId) => {
    const id = requireHelmScopeId(scopeId);
    const document = await deps.helm.load(id);
    try {
      deps.helm.watch(id);
    } catch {
      /* advisory only: a watch that cannot start must not fail the load */
    }
    return document;
  });

  /**
   * `save` is the one call in this file that can destroy a developer's
   * settings, and every guarantee about that lives in `HelmService`: backup,
   * re-read-and-compare, atomic rename. The boundary's only job is to refuse a
   * malformed payload and to let `CONFLICT` through unmodified — a conflict is
   * a value the form branches on, not a fault.
   */
  register(INVOKE_CHANNELS.helmSave, (req) => deps.helm.save(requireHelmSaveRequest(req)));

  const expected = Object.values(INVOKE_CHANNELS) as string[];
  const missing = expected.filter((channel) => !registered.has(channel));
  if (missing.length > 0) {
    // A channel in the frozen contract with no handler is an invoke that hangs
    // in the renderer with no diagnostic. Fail at boot instead.
    throw new Error(`INVOKE_CHANNELS left unhandled: ${missing.join(', ')}`);
  }
  return [...registered];
}
