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

// ---------------------------------------------------------------------------
// Pod deletion — AMENDED at Gate 2 of 2026-08-20-orcastrate-workspace-refinement
//
// `pods.delete` used to take a bare `PodId` and resolve `void`. It now takes a
// REQUEST and resolves a REPORT, because deletion can now also move the Pod's
// Claude Code session file to the OS recycle bin — and a caller has to say so
// explicitly, and has to be told what happened to the file.
//
// `INVOKE_CHANNELS.podDelete` keeps its name, `'pod:delete'`. Only the payload
// and the resolved value moved.
// ---------------------------------------------------------------------------

/**
 * A request object rather than a second positional boolean, because
 * `delete(podId, true)` at a call site says nothing about what `true` destroys.
 */
export interface DeletePodRequest {
  podId: PodId;
  /**
   * Also move this Pod's Claude Code session file to the OS recycle bin.
   *
   * REQUIRED, not optional and not defaulted. A caller that has not decided
   * must not be able to omit the field and get either behaviour by accident;
   * the renderer's confirmation dialog is what decides it, and that dialog
   * defaults the checkbox to FALSE.
   */
  deleteSession: boolean;
}

/**
 * What happened to the session file. Modelled as a VALUE for the same reason
 * `BeachcomberTrashResult` is: the Pod row really was deleted, and a failure to
 * also bin a file must not report as a failed deletion and leave the user
 * believing the Pod is still there.
 *
 *   'not-requested'  `deleteSession` was false. Nothing was attempted.
 *   'no-session'     `ccSessionId` was null — the Pod never reached its first
 *                    turn, so there is nothing on disk, or the CLI rejected a
 *                    resume of it and the fresh session has not yet reported
 *                    its own id. NOT an error.
 *   'not-found'      The file was not where it was expected. Already binned by
 *                    hand, or the CLI wrote it elsewhere. NOT an error.
 *   'trashed'        The trash port resolved. The file is in the recycle bin.
 *   'failed'         The trash port rejected. `sessionError` carries the
 *                    platform message VERBATIM.
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

/**
 * The main-process port that does the disk work, declared HERE rather than in
 * `src/main/pod-session/**` so `src/main/ipc/**` can name it without importing
 * an implementation module. Implemented in `src/main/pod-session/**`,
 * constructed in `src/main/index.ts` — the only place `CLAUDE_HOME` and the
 * application's single `TrashItem` are available — and injected onto
 * `IpcHandlerDeps` as `deletePodSession`.
 *
 * It takes the whole `Pod` rather than a `PodId` because it is called AFTER the
 * row has been read and deleted; a port that had to look the Pod up would need
 * the store.
 *
 * RESOLVES ALWAYS. It never rejects: a `TrashItem` rejection becomes
 * `{ outcome: 'failed', error }`. The rejection is caught THERE rather than in
 * the handler, so the handler has no branch that could turn a binned-file
 * failure into a failed deletion.
 */
export type PodSessionRemover = (
  pod: Pod,
) => Promise<{ outcome: PodSessionRemovalOutcome; error: string | null }>;

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
  /**
   * `Pod.status` IS THE SINGLE AUTHORITATIVE FIELD for whether main holds a
   * live `PodRunner` for a Pod. Nothing else on this surface reports it, and
   * NO METHOD HERE MAY EVER CARRY A PARALLEL OPENNESS FIELD — not on a reply,
   * not on a push, not on a request. This is a PROHIBITION, not a preference:
   * two fields describing one fact are two fields in a position to disagree,
   * which is the exact defect class this rule exists to prevent.
   *
   * OPENNESS IS DERIVED FROM `status`, by exactly one rule, written in the
   * POSITIVE form:
   *
   *     opened  <=>  status === 'idle' || status === 'running' || status === 'waiting'
   *
   * `'closed'` and `'beached'` are the not-open statuses. The positive form is
   * mandatory because it fails CLOSED: a status a future build does not
   * recognise reads as not-open, which shows a redundant run control rather
   * than enabling a composer over a process that is not there. The negative
   * spelling (`status !== 'closed' && status !== 'beached'`) must be
   * re-audited every time the union grows, and is forbidden here for that
   * reason.
   *
   * THERE IS EXACTLY ONE IMPLEMENTATION OF THAT RULE IN THE REPOSITORY, and it
   * lives in the renderer's `derivePodList`. Main does not need it: main knows
   * from its own session registry and simply writes the correct status. No
   * shared helper is exported from this file — `ipc.ts` would become a
   * dependency edge between otherwise independent consumers for a three-token
   * expression.
   *
   * WHAT THAT MEANS FOR THIS NAMESPACE, stated so a later patch cannot drift:
   * every method that returns a `Pod` returns a plain `Pod` — no wrapper type,
   * no projection, no added field. A `PodView`-shaped wrapper WAS PROPOSED and
   * was REJECTED at Gate 2 of DIR session 2026-08-20-orcastrate-pod-lifecycle;
   * it must not reappear. `PodStatusPush` likewise keeps its exact shape:
   * `podId`, `status`, and — for `'beached'` alone — `exitCode` and `detail`.
   *
   * `status` TRAVELS OUTWARD ONLY. No request payload on this surface carries
   * one, so `src/main/ipc/**` performs no status validation; the product's
   * only runtime enforcement of the status set is the SQLite CHECK constraint
   * at the schema head. Adding a status validator at this boundary would be a
   * design change, not a hardening.
   *
   * See `PodStatus` in `./events` for the meaning of each of the five values.
   */
  pods: {
    list(): Promise<IpcResult<Pod[]>>;
    create(req: CreatePodRequest): Promise<IpcResult<Pod>>;
    update(req: UpdatePodRequest): Promise<IpcResult<Pod>>;
    /**
     * Deletes the Pod row and its history, permanently, and — only when
     * `deleteSession` is true — moves this Pod's Claude Code session file to
     * the OS recycle bin. Answers `NOT_FOUND` for an unknown Pod and
     * `INVALID_ARGUMENT` for a payload that is not a `DeletePodRequest`. A
     * trash failure is NOT an error: it is `session: 'failed'` on an `ok`
     * result, because the Pod row really was deleted.
     */
    delete(req: DeletePodRequest): Promise<IpcResult<PodDeletionResult>>;
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
