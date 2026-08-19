/**
 * CONTRACT — Preload IPC surface. Frozen at Gate 2.
 *
 * Boundary between: T1 (writes the preload bridge), T7 (writes the main-process
 * handlers), and ALL of sub-sessions 2 and 3 (the renderer's only capability).
 *
 * Security posture (spec 3): renderer runs with `contextIsolation: true`,
 * `nodeIntegration: false`, `sandbox: true`. This file is the complete,
 * explicitly enumerated capability list. Anything not here is not reachable
 * from the renderer.
 *
 * HARD RULE the renderer depends on: no method here accepts or returns a
 * filesystem path the renderer can act on directly. Paths are opaque display
 * strings; every operation on one is named by id or performed by main.
 *
 * Sub-sessions 2/3 will add Beachcomber and Helm channels. Those namespaces are
 * RESERVED below but intentionally left unpopulated — adding to them is a
 * contract change and requires an escalation.
 */

import type {
  Lane,
  LaneId,
  NormalizedEvent,
  PermissionMode,
  Pod,
  PodId,
  Seq,
} from './events';
import type { RoutingMode } from './lane-router';

// ---------------------------------------------------------------------------
// Error envelope
// ---------------------------------------------------------------------------

/**
 * EVERY invoke channel resolves with this envelope and NEVER rejects. An
 * Electron IPC rejection loses the error's type across the bridge, so failures
 * are modelled as data. The renderer must branch on `ok`.
 */
export type IpcResult<T> = { ok: true; value: T } | { ok: false; error: IpcError };

export interface IpcError {
  code: IpcErrorCode;
  /** Safe to show the user. For FS errors this is the OS message verbatim (spec 7). */
  message: string;
  /** Present only in development builds. */
  detail?: string;
}

export type IpcErrorCode =
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'INVALID_ARGUMENT'
  | 'CWD_MISSING'
  | 'SPAWN_FAILED'
  | 'NOT_RUNNING'
  | 'IO'
  | 'UNSUPPORTED'
  | 'INTERNAL';

// ---------------------------------------------------------------------------
// Channel names
// ---------------------------------------------------------------------------

/** Request/response channels, invoked via `ipcRenderer.invoke`. */
export const INVOKE_CHANNELS = {
  podList: 'pod:list',
  podCreate: 'pod:create',
  podUpdate: 'pod:update',
  podDelete: 'pod:delete',
  podOpen: 'pod:open',
  podClose: 'pod:close',
  podSend: 'pod:send',
  podInterrupt: 'pod:interrupt',
  podSetPermissionMode: 'pod:setPermissionMode',
  podReconnect: 'pod:reconnect',
  laneList: 'lane:list',
  eventsRead: 'events:read',
  permissionRespond: 'permission:respond',
  dialogPickDirectory: 'dialog:pickDirectory',
  appRoutingMode: 'app:routingMode',
} as const;

/** Push channels, main -> renderer, delivered via `ipcRenderer.on`. */
export const EVENT_CHANNELS = {
  podEvent: 'push:podEvent',
  podStatus: 'push:podStatus',
  laneChanged: 'push:laneChanged',
  permissionRequested: 'push:permissionRequested',
  permissionResolved: 'push:permissionResolved',
} as const;

// ---------------------------------------------------------------------------
// Request / response payloads
// ---------------------------------------------------------------------------

export interface CreatePodRequest {
  title: string;
  /**
   * Absolute path, obtained ONLY from `dialog.pickDirectory`. The renderer
   * never types one: main validates that it exists and is a directory, and
   * answers CWD_MISSING otherwise.
   */
  cwd: string;
  permissionMode: PermissionMode;
  envOverrides?: Record<string, string>;
}

export interface UpdatePodRequest {
  podId: PodId;
  title?: string;
  tabOrder?: number;
  permissionMode?: PermissionMode;
  envOverrides?: Record<string, string>;
}

export interface ReadEventsRequest {
  podId: PodId;
  laneId?: LaneId;
  afterSeq?: Seq;
  /** Clamped to 5000 by main. */
  limit?: number;
}

export interface ReadEventsResponse {
  events: NormalizedEvent[];
  /** True when more rows exist past the last returned `seq`. */
  hasMore: boolean;
}

export interface PermissionRespondRequest {
  podId: PodId;
  requestId: string;
  decision: 'allow' | 'allow_always' | 'deny';
  /** Required when decision === 'deny'; INVALID_ARGUMENT otherwise. */
  reason?: string;
}

export interface PickDirectoryResponse {
  /** null when the user cancelled — cancellation is NOT an error. */
  path: string | null;
}

// ---------------------------------------------------------------------------
// Push payloads
// ---------------------------------------------------------------------------

export interface PodEventPush {
  podId: PodId;
  /** Batched in `seq` order. Never empty. */
  events: NormalizedEvent[];
}

export interface PodStatusPush {
  podId: PodId;
  status: Pod['status'];
  /** Present when status === 'beached'. */
  exitCode?: number | null;
  detail?: string;
}

export interface LaneChangedPush {
  podId: PodId;
  /** Full current lane list for the Pod — a snapshot, not a delta. */
  lanes: Lane[];
}

export interface PermissionRequestedPush {
  podId: PodId;
  laneId: LaneId;
  requestId: string;
  toolName: string;
  input: unknown;
}

export interface PermissionResolvedPush {
  podId: PodId;
  requestId: string;
  /** 'aborted' when the turn was interrupted before the user answered. */
  outcome: 'allow' | 'allow_always' | 'deny' | 'aborted';
}

// ---------------------------------------------------------------------------
// The object exposed on `window.orcastrate`
// ---------------------------------------------------------------------------

/** Every `on*` returns an unsubscribe function. Renderer MUST call it on unmount. */
export type Unsubscribe = () => void;

export interface OrcastrateApi {
  pods: {
    list(): Promise<IpcResult<Pod[]>>;
    create(req: CreatePodRequest): Promise<IpcResult<Pod>>;
    update(req: UpdatePodRequest): Promise<IpcResult<Pod>>;
    /** Deletes the Pod row and its history. Does not touch anything on disk. */
    delete(podId: PodId): Promise<IpcResult<void>>;
    /** Starts (or resumes) the CLI process for a Pod. */
    open(podId: PodId): Promise<IpcResult<Pod>>;
    /** Stops the process; the Pod row and transcript survive. */
    close(podId: PodId): Promise<IpcResult<void>>;
    /** Re-resume after Beached (spec 8). */
    reconnect(podId: PodId): Promise<IpcResult<Pod>>;
    /** Enqueues a user message. Resolves on enqueue, not on turn completion. */
    send(podId: PodId, text: string): Promise<IpcResult<void>>;
    interrupt(podId: PodId): Promise<IpcResult<void>>;
    setPermissionMode(podId: PodId, mode: PermissionMode): Promise<IpcResult<void>>;
  };

  lanes: {
    list(podId: PodId): Promise<IpcResult<Lane[]>>;
  };

  events: {
    read(req: ReadEventsRequest): Promise<IpcResult<ReadEventsResponse>>;
  };

  permissions: {
    respond(req: PermissionRespondRequest): Promise<IpcResult<void>>;
  };

  dialog: {
    pickDirectory(): Promise<IpcResult<PickDirectoryResponse>>;
  };

  app: {
    /**
     * Which routing mode the build was compiled against, decided by the T2
     * probe findings. The renderer uses it to choose lane rail vs inline
     * dispatch rendering (spec 4.3 fallback). Constant for the app's lifetime.
     */
    routingMode(): Promise<IpcResult<RoutingMode>>;
  };

  on: {
    podEvent(cb: (p: PodEventPush) => void): Unsubscribe;
    podStatus(cb: (p: PodStatusPush) => void): Unsubscribe;
    laneChanged(cb: (p: LaneChangedPush) => void): Unsubscribe;
    permissionRequested(cb: (p: PermissionRequestedPush) => void): Unsubscribe;
    permissionResolved(cb: (p: PermissionResolvedPush) => void): Unsubscribe;
  };

  /**
   * RESERVED for sub-session 3. Declared so the renderer's global type is
   * stable, and deliberately optional so sub-session 1 ships without it.
   * Populating these is a contract change requiring an escalation.
   */
  beachcomber?: never;
  helm?: never;
}

declare global {
  interface Window {
    orcastrate: OrcastrateApi;
  }
}
