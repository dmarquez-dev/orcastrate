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
 * THE HARD RULE, RESTATED FOR BEACHCOMBER AND HELM — because both panels are
 * path-shaped by nature and "we obviously would not do that" is not a rule.
 * Beachcomber rows carry `displayPath` as an OPAQUE DISPLAY STRING: the
 * renderer prints it and never parses, joins, splits, resolves or sends it
 * back. Every mutating call on either namespace names a `BeachcomberEntryId`
 * or a `HelmScopeId` instead — `beachcomber.preview`/`beachcomber.trash` take
 * `{ scanId, ids }` and nothing else, and `helm.load`/`helm.save` take a
 * scopeId-keyed payload and nothing else. Those ids are MAIN-MINTED TOKENS the
 * renderer cannot forge: main alone holds the id -> absolute-path map, so a
 * renderer that wanted to trash or overwrite an arbitrary path on disk has no
 * way to name one. `HelmScope.displayPath` and `BeachcomberEntry.displayPath`
 * travel outward only; neither is ever accepted inward.
 *
 * BEACHCOMBER AND HELM ARE NOW POPULATED. They were held as optional
 * unpopulatable members reserved for sub-sessions 2/3; DIR session
 * 2026-08-19-orcastrate-beachcomber-helm escalated that reservation, had the
 * change approved at Gate 2, and filled both namespaces from the frozen
 * `./beachcomber` and `./helm` contracts. They are non-optional members: every
 * constructor of an `OrcastrateApi` — `src/preload/api.ts` and
 * `src/renderer/src/test-utils/stub-api.ts`, the only two in the tree — must
 * supply them. Changing either namespace's shape is still a contract change
 * and still requires an escalation.
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
// Type-only, and DELIBERATELY CIRCULAR: `./beachcomber` and `./helm` each
// import `IpcResult` from here. Both directions are `import type`, so nothing
// exists at runtime to cycle. The alternative — declaring those signatures
// inline — would split each panel's contract across two files.
import type { BeachcomberApi } from './beachcomber';
import type { HelmApi } from './helm';
import type { HelmChangedPush } from './helm';

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
  beachcomberScan: 'beachcomber:scan',
  beachcomberPreview: 'beachcomber:preview',
  beachcomberTrash: 'beachcomber:trash',
  helmScopes: 'helm:scopes',
  helmLoad: 'helm:load',
  helmSave: 'helm:save',
} as const;

/** Push channels, main -> renderer, delivered via `ipcRenderer.on`. */
export const EVENT_CHANNELS = {
  podEvent: 'push:podEvent',
  podStatus: 'push:podStatus',
  laneChanged: 'push:laneChanged',
  permissionRequested: 'push:permissionRequested',
  permissionResolved: 'push:permissionResolved',
  /** Advisory only. See the `helm.ts` header: the watch is never a guard. */
  helmChanged: 'push:helmChanged',
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
    /** Advisory. The form goes stale; it does NOT become safe to save. */
    helmChanged(cb: (p: HelmChangedPush) => void): Unsubscribe;
  };

  /**
   * POPULATED by DIR session 2026-08-19-orcastrate-beachcomber-helm, from the
   * frozen `./beachcomber` and `./helm` contracts. Non-optional: both
   * constructors of this type must supply them.
   */
  beachcomber: BeachcomberApi;
  helm: HelmApi;
}

declare global {
  interface Window {
    orcastrate: OrcastrateApi;
  }
}
