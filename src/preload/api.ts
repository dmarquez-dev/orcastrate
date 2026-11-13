/**
 * Builds the `OrcastrateApi` object that `index.ts` hands to `contextBridge`.
 *
 * Kept separate from `index.ts` so it can be unit tested against a fake IPC
 * transport without an Electron runtime. The shape is fixed by
 * `src/shared/contracts/ipc.ts` and the channel names come from
 * `INVOKE_CHANNELS` / `EVENT_CHANNELS` in that contract — never string
 * literals, so a contract rename cannot silently desync the bridge.
 */

import {
  EVENT_CHANNELS,
  INVOKE_CHANNELS,
  type CreatePodRequest,
  type DeletePodRequest,
  type IpcResult,
  type LaneChangedPush,
  type OrcastrateApi,
  type PermissionRequestedPush,
  type PermissionRespondRequest,
  type PermissionResolvedPush,
  type PickDirectoryResponse,
  type PodCommandsPush,
  type PodDeletionResult,
  type PodEventPush,
  type PodStatusPush,
  type ReadEventsRequest,
  type ReadEventsResponse,
  type Unsubscribe,
  type UpdatePodRequest,
} from '../shared/contracts/ipc';
import type {
  Lane,
  PermissionMode,
  Pod,
  PodId,
} from '../shared/contracts/events';
import type {
  BeachcomberPreview,
  BeachcomberPreviewRequest,
  BeachcomberScan,
  BeachcomberTrashRequest,
  BeachcomberTrashResult,
} from '../shared/contracts/beachcomber';
import type {
  HelmChangedPush,
  HelmDocument,
  HelmSaveRequest,
  HelmSaveResult,
  HelmScope,
  HelmScopeId,
} from '../shared/contracts/helm';
import type { RoutingMode } from '../shared/contracts/lane-router';

/** A push listener as Electron delivers it: an event object, then the payload. */
export type PushListener = (event: unknown, payload: unknown) => void;

/**
 * The slice of Electron's `ipcRenderer` this bridge uses. Narrowed to three
 * methods so nothing else can leak, and so tests can supply a fake.
 */
export interface PreloadIpc {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>;
  on(channel: string, listener: PushListener): unknown;
  removeListener(channel: string, listener: PushListener): unknown;
}

export function createOrcastrateApi(ipc: PreloadIpc): OrcastrateApi {
  function call<T>(channel: string, ...args: unknown[]): Promise<IpcResult<T>> {
    return ipc.invoke(channel, ...args) as Promise<IpcResult<T>>;
  }

  /**
   * Registers a push listener and returns an unsubscribe that removes exactly
   * the listener it registered. Calling it more than once is a no-op.
   */
  function subscribe<T>(channel: string, cb: (payload: T) => void): Unsubscribe {
    const listener: PushListener = (_event, payload) => {
      cb(payload as T);
    };
    ipc.on(channel, listener);

    let removed = false;
    return () => {
      if (removed) return;
      removed = true;
      ipc.removeListener(channel, listener);
    };
  }

  return {
    pods: {
      list: () => call<Pod[]>(INVOKE_CHANNELS.podList),
      create: (req: CreatePodRequest) => call<Pod>(INVOKE_CHANNELS.podCreate, req),
      update: (req: UpdatePodRequest) => call<Pod>(INVOKE_CHANNELS.podUpdate, req),
      // The REQUEST OBJECT is forwarded as-is, not unpacked into positional
      // arguments: `deleteSession` decides whether a file leaves the disk, and
      // a positional boolean at a call site says nothing about what it destroys.
      delete: (req: DeletePodRequest) =>
        call<PodDeletionResult>(INVOKE_CHANNELS.podDelete, req),
      open: (podId: PodId) => call<Pod>(INVOKE_CHANNELS.podOpen, podId),
      close: (podId: PodId) => call<void>(INVOKE_CHANNELS.podClose, podId),
      reconnect: (podId: PodId) => call<Pod>(INVOKE_CHANNELS.podReconnect, podId),
      fork: (podId: PodId) => call<Pod>(INVOKE_CHANNELS.podFork, podId),
      send: (podId: PodId, text: string) =>
        call<void>(INVOKE_CHANNELS.podSend, podId, text),
      interrupt: (podId: PodId) => call<void>(INVOKE_CHANNELS.podInterrupt, podId),
      setPermissionMode: (podId: PodId, mode: PermissionMode) =>
        call<void>(INVOKE_CHANNELS.podSetPermissionMode, podId, mode),
    },

    lanes: {
      list: (podId: PodId) => call<Lane[]>(INVOKE_CHANNELS.laneList, podId),
    },

    events: {
      read: (req: ReadEventsRequest) =>
        call<ReadEventsResponse>(INVOKE_CHANNELS.eventsRead, req),
    },

    permissions: {
      respond: (req: PermissionRespondRequest) =>
        call<void>(INVOKE_CHANNELS.permissionRespond, req),
    },

    dialog: {
      pickDirectory: () =>
        call<PickDirectoryResponse>(INVOKE_CHANNELS.dialogPickDirectory),
    },

    app: {
      routingMode: () => call<RoutingMode>(INVOKE_CHANNELS.appRoutingMode),
    },

    /**
     * Note what does not cross: no method here takes a path. `preview` and
     * `trash` forward `{ scanId, ids }` verbatim, and the ids are tokens main
     * minted — this bridge cannot construct one and neither can its caller.
     */
    beachcomber: {
      scan: () => call<BeachcomberScan>(INVOKE_CHANNELS.beachcomberScan),
      preview: (req: BeachcomberPreviewRequest) =>
        call<BeachcomberPreview>(INVOKE_CHANNELS.beachcomberPreview, req),
      trash: (req: BeachcomberTrashRequest) =>
        call<BeachcomberTrashResult>(INVOKE_CHANNELS.beachcomberTrash, req),
    },

    helm: {
      listScopes: () => call<HelmScope[]>(INVOKE_CHANNELS.helmScopes),
      load: (scopeId: HelmScopeId) => call<HelmDocument>(INVOKE_CHANNELS.helmLoad, scopeId),
      save: (req: HelmSaveRequest) => call<HelmSaveResult>(INVOKE_CHANNELS.helmSave, req),
    },

    on: {
      podEvent: (cb: (p: PodEventPush) => void) =>
        subscribe(EVENT_CHANNELS.podEvent, cb),
      podStatus: (cb: (p: PodStatusPush) => void) =>
        subscribe(EVENT_CHANNELS.podStatus, cb),
      laneChanged: (cb: (p: LaneChangedPush) => void) =>
        subscribe(EVENT_CHANNELS.laneChanged, cb),
      permissionRequested: (cb: (p: PermissionRequestedPush) => void) =>
        subscribe(EVENT_CHANNELS.permissionRequested, cb),
      permissionResolved: (cb: (p: PermissionResolvedPush) => void) =>
        subscribe(EVENT_CHANNELS.permissionResolved, cb),
      helmChanged: (cb: (p: HelmChangedPush) => void) =>
        subscribe(EVENT_CHANNELS.helmChanged, cb),
      podCommands: (cb: (p: PodCommandsPush) => void) =>
        subscribe(EVENT_CHANNELS.podCommands, cb),
    },
  };
}
