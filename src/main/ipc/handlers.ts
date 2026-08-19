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
 */

import { INVOKE_CHANNELS, type IpcResult } from '../../shared/contracts/ipc';
import type { PodManagerApi } from '../pod-manager';

import { fail, IpcFailure, ok } from './errors';
import {
  requireCreatePodRequest,
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

  register(INVOKE_CHANNELS.podDelete, (podId) => manager.deletePod(requirePodId(podId)));

  register(INVOKE_CHANNELS.podOpen, (podId) => manager.openPod(requirePodId(podId)));

  register(INVOKE_CHANNELS.podClose, (podId) => manager.closePod(requirePodId(podId)));

  register(INVOKE_CHANNELS.podReconnect, (podId) => manager.reconnectPod(requirePodId(podId)));

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

  const expected = Object.values(INVOKE_CHANNELS) as string[];
  const missing = expected.filter((channel) => !registered.has(channel));
  if (missing.length > 0) {
    // A channel in the frozen contract with no handler is an invoke that hangs
    // in the renderer with no diagnostic. Fail at boot instead.
    throw new Error(`INVOKE_CHANNELS left unhandled: ${missing.join(', ')}`);
  }
  return [...registered];
}
