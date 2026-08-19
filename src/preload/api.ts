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
  type IpcResult,
  type LaneChangedPush,
  type OrcastrateApi,
  type PermissionRequestedPush,
  type PermissionRespondRequest,
  type PermissionResolvedPush,
  type PickDirectoryResponse,
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
      delete: (podId: PodId) => call<void>(INVOKE_CHANNELS.podDelete, podId),
      open: (podId: PodId) => call<Pod>(INVOKE_CHANNELS.podOpen, podId),
      close: (podId: PodId) => call<void>(INVOKE_CHANNELS.podClose, podId),
      reconnect: (podId: PodId) => call<Pod>(INVOKE_CHANNELS.podReconnect, podId),
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
    },
  };
}
