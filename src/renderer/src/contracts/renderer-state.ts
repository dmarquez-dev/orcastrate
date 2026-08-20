/**
 * CONTRACT — Renderer state layer. Frozen at Gate 2.
 *
 * Boundary between:
 *   - T5 (PRODUCER)  writes `src/renderer/src/state/**` and is the only task
 *                    that calls `window.orcastrate`.
 *   - T4 (Pod bar / New Pod dialog / shell), T6 (lane rail / transcript),
 *     T7 (composer / permission cards) — CONSUMERS. They render; they never
 *     touch `window.orcastrate` directly.
 *   - T8 (renderer test suite) asserts the guarantees stated here.
 *
 * This file deliberately does NOT restate `@shared/contracts/ipc`. It imports
 * from it. Anything reachable on `window.orcastrate` keeps its frozen shape;
 * what is defined here is the renderer's own view of that data.
 *
 * SECURITY POSTURE this file inherits and must not weaken (spec 3):
 * `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`. No
 * module under `src/renderer/**` may import a `node:` builtin. Every path is
 * an OPAQUE DISPLAY STRING: the renderer shows `Pod.cwd`, and obtains a new
 * one only from `dialog.pickDirectory()`. It never composes, parses, joins, or
 * types a path.
 *
 * ERROR DISCIPLINE, which is the single most-guessed-wrong part of this
 * boundary: every invoke channel resolves an `IpcResult<T>` and NEVER rejects.
 * Every action below mirrors that — it resolves an `ActionResult<T>` and never
 * rejects and never throws. A consumer that writes `try/catch` around an
 * action, or `.catch()` on its promise, has misread this contract; a consumer
 * that fails to branch on `ok` renders a success state for a failure.
 *
 * Everything here is JSON-serializable data plus functions. No Date objects.
 */

import type { ReactNode } from 'react';

import type {
  Lane,
  LaneId,
  LaneStatus,
  NormalizedEvent,
  PermissionMode,
  Pod,
  PodId,
  PodStatus,
  Seq,
  Timestamp,
} from '@shared/contracts/events';
import type {
  CreatePodRequest,
  IpcError,
  PermissionRespondRequest,
  UpdatePodRequest,
} from '@shared/contracts/ipc';
import type { RoutingMode } from '@shared/contracts/lane-router';

// ---------------------------------------------------------------------------
// Result envelope
// ---------------------------------------------------------------------------

/**
 * The renderer-side mirror of `IpcResult<T>`. Structurally identical on
 * purpose: an action that passes an IPC failure through hands back the SAME
 * `IpcError` object, unmodified, so the message the main process wrote is the
 * message the user reads (spec 7).
 *
 * An action MAY also produce an error that never crossed IPC — a locally
 * detected precondition failure. Those use `INVALID_ARGUMENT` with a
 * renderer-authored `message`, and are the only errors this layer invents.
 */
export type ActionResult<T = void> =
  | { ok: true; value: T }
  | { ok: false; error: IpcError };

/** Load lifecycle for anything fetched over IPC. */
export type LoadPhase = 'idle' | 'loading' | 'ready' | 'error';

/**
 * `value` is ALWAYS present and always renderable — an empty array or a null,
 * never `undefined`. Consumers render `value` regardless of `phase`, and use
 * `phase` only to decide whether to show a spinner or `error`. This is what
 * keeps a refetch from blanking a populated pane.
 */
export interface Loadable<T> {
  phase: LoadPhase;
  value: T;
  /** Non-null if and only if `phase === 'error'`. */
  error: IpcError | null;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export interface WorkspaceProviderProps {
  children: ReactNode;
  /**
   * Test seam. Omitted in the app, where the provider reads
   * `window.orcastrate`. Supplying a stub is how T8 drives the whole renderer
   * without Electron. When `window.orcastrate` is absent AND this is omitted,
   * the provider must render `children` with every `Loadable` in phase
   * `'error'` carrying code `INTERNAL` — it must NOT throw, because a throw
   * during module init blanks the window with no diagnosis.
   */
  api?: typeof window.orcastrate;
}

/**
 * SUBSCRIPTION GUARANTEE. The provider subscribes to all five push channels
 * exactly once on mount and calls every returned `Unsubscribe` on unmount. No
 * consumer subscribes; a component that calls `window.orcastrate.on.*` is
 * outside this contract and will double-count events.
 */
export declare function WorkspaceProvider(props: WorkspaceProviderProps): ReactNode;

/**
 * The whole state layer, as one context value. The hooks below are the
 * supported access path; this type exists so the provider and the tests can
 * name it.
 */
export interface WorkspaceStore {
  pods: PodListView;
  activePodId: PodId | null;
  /** Undefined when no Pod is active, or the active Pod has not been opened. */
  session: PodSessionView | undefined;
  /**
   * Resolved once at startup from `app.routingMode()`, then constant for the
   * app's lifetime (frozen contract, `ipc.ts`). `null` while unresolved.
   *
   * 'lanes'  -> render the lane rail and route events per lane.
   * 'inline' -> spec 4.3's fallback: every event carries the Matriarch's
   *             laneId, so the rail lists lanes for status only and the
   *             transcript renders dispatches inline.
   * A consumer MUST NOT hardcode either branch.
   */
  routingMode: RoutingMode | null;
  actions: WorkspaceActions;
}

export declare function useWorkspace(): WorkspaceStore;

// ---------------------------------------------------------------------------
// Pods
// ---------------------------------------------------------------------------

/**
 * ORDERING GUARANTEE: `value` is sorted by `Pod.tabOrder` ascending, ties
 * broken by `createdAt` ascending, then `id`. The order is stable across
 * re-renders and across refetches. The Pod bar renders this array in index
 * order and performs no sorting of its own.
 */
export interface PodListView extends Loadable<PodTabVm[]> {}

/** One Pod bar tab. Derived state only — no field here is stored server-side. */
export interface PodTabVm {
  pod: Pod;
  /** `pod.id === activePodId`. */
  active: boolean;
  /**
   * Main holds a live PodRunner for this Pod. DERIVED from `pod.status`: true
   * for `idle`, `running` and `waiting`; false for `closed` and `beached`.
   * Never stored, never latched, never defaulted, and never inferred from a
   * call the renderer made. `status` is the single authoritative field — see
   * `PodStatus` in `events.ts`. A Pod row can exist with no process; the tab
   * renders it dimmed.
   */
  opened: boolean;
  /**
   * Mirrors `pod.status`, restated so a consumer never re-derives it.
   * `opened` beside it IS that derivation, performed once, so a consumer never
   * repeats it either.
   */
  status: PodStatus;
  /**
   * TRUE when this Pod has at least one UNANSWERED permission request, in any
   * of its lanes. Spec 5.4: the badge exists so a BACKGROUNDED Pod waiting on
   * the user is visible without switching to it — so this must be true for
   * non-active Pods, which is exactly the case a naive implementation misses.
   * Cleared when the last pending request for the Pod resolves, including
   * resolution with outcome `'aborted'`.
   */
  awaitingPermission: boolean;
  /** Count of unanswered requests. >= 1 whenever `awaitingPermission`. */
  pendingPermissionCount: number;
  /**
   * Events arrived for this Pod since it was last active. Zero for the active
   * Pod at all times.
   */
  unreadEventCount: number;
}

// ---------------------------------------------------------------------------
// A Pod's session: lanes, transcripts, permissions, composer
// ---------------------------------------------------------------------------

export interface PodSessionView {
  podId: PodId;
  /** Snapshot-replaced wholesale on every `laneChanged` push (see below). */
  lanes: Loadable<LaneRowVm[]>;
  /**
   * The lane whose transcript occupies the primary pane. Never null once
   * `lanes.value` is non-empty: it defaults to the Matriarch.
   */
  selectedLaneId: LaneId | null;
  /**
   * The lane pinned into the split pane beside the primary transcript
   * (spec 5.2), or null when the view is unsplit.
   *
   * INVARIANT: `pinnedLaneId !== selectedLaneId`. Pinning the selected lane, or
   * selecting the pinned lane, resolves to the swap rules in `WorkspaceActions`
   * rather than producing two identical panes.
   */
  pinnedLaneId: LaneId | null;
  /** Per-lane transcript state, keyed by LaneId. Missing key === not yet read. */
  transcripts: Readonly<Record<LaneId, TranscriptView | undefined>>;
  /** Backfill paging cursor, per Pod (not per lane). See `TranscriptView`. */
  backfill: BackfillState;
  /** Unanswered permission requests for this Pod, oldest first. */
  pendingPermissions: PermissionCardVm[];
  /** The Pod-level composer. Bound to the Pod, never to a lane (spec 5.2). */
  composer: ComposerState;
}

/**
 * One lane rail row (spec 5.1). The rail is a LIST, not a tab row.
 *
 * ORDERING GUARANTEE: the Matriarch is index 0, always, even if the push
 * delivered it elsewhere. Calves follow, sorted by `lane.startedAt` ascending,
 * ties broken by `lane.id`. Stable across snapshots: a lane that changes only
 * its status does not move.
 */
export interface LaneRowVm {
  lane: Lane;
  /** `lane.kind === 'matriarch'`. Pinned to the top of the rail. */
  isMatriarch: boolean;
  selected: boolean;
  pinned: boolean;
  /** `lane.subagentType ?? 'matriarch'` — the rail's "agent type" column. */
  agentType: string;
  /** `lane.description`, or null for the Matriarch. */
  description: string | null;
  status: LaneStatus;
  /**
   * Milliseconds from `lane.startedAt` to `lane.endedAt`, or to now while the
   * lane is running. Recomputed on a timer owned by the state layer, NOT by
   * each row — a running lane's row re-renders about once a second, and a
   * finished lane's `elapsedMs` is frozen and stops re-rendering.
   */
  elapsedMs: number;
  /** Events appended to this lane since it was last selected. */
  unreadEventCount: number;
  /** This lane has an unanswered permission request. */
  awaitingPermission: boolean;
}

/**
 * One lane's transcript.
 *
 * ORDERING AND DEDUPE GUARANTEE — the part a consumer must be able to rely on
 * blindly: `events` is strictly ascending by `NormalizedEvent.seq`, contains no
 * duplicate `seq`, and is append-stable (an event, once at index i, stays at
 * index i for the life of the pane). Backfilled pages and live pushes are
 * merged by `seq`, so a live event that arrives mid-backfill is not duplicated
 * when the page carrying it lands, and is not dropped either.
 */
export interface TranscriptView {
  laneId: LaneId;
  events: NormalizedEvent[];
  phase: LoadPhase;
  error: IpcError | null;
  /** Highest `seq` present in `events`; 0 when empty. */
  highWaterSeq: Seq;
}

/**
 * Backfill from `events.read` (frozen `ipc.ts`): paged forward by `afterSeq`,
 * with `hasMore` on the response and `limit` clamped to 5000 BY MAIN. The
 * renderer may request any limit; it must read `hasMore` rather than inferring
 * exhaustion from a short page.
 *
 * Paging is forward-only and per Pod: one cursor fills every lane's transcript,
 * because `events.read` without `laneId` returns the Pod's whole stream in
 * `seq` order.
 */
export interface BackfillState {
  phase: LoadPhase;
  error: IpcError | null;
  /** `afterSeq` for the next page. 0 before the first page. */
  cursorSeq: Seq;
  /** Straight from the last `ReadEventsResponse`. False before the first read. */
  hasMore: boolean;
  /** Page size the renderer asks for. Main clamps above 5000 regardless. */
  pageSize: number;
}

// ---------------------------------------------------------------------------
// Permission cards (spec 5.4)
// ---------------------------------------------------------------------------

/**
 * One unanswered permission request, rendered INLINE IN THE LANE THAT ASKED —
 * never as a modal. `PermissionRequestedPush` carries `laneId`, so no join and
 * no contract change is needed to place it.
 */
export interface PermissionCardVm {
  podId: PodId;
  /** The lane that raised it. The card renders in THIS lane's transcript. */
  laneId: LaneId;
  requestId: string;
  toolName: string;
  /** Verbatim tool input. Display only; the renderer never interprets it. */
  input: unknown;
  /** When the push arrived, for ordering and for an "asked Ns ago" affordance. */
  receivedAt: Timestamp;
  /**
   * True while a `permissions.respond` call for this requestId is in flight.
   * The card must disable its buttons while true, so a double-click cannot
   * send two decisions for one request.
   */
  submitting: boolean;
  /**
   * Set when a `respond` call came back `{ ok: false }`. The card stays on
   * screen and shows this; it does NOT disappear, because the request is still
   * unanswered.
   */
  error: IpcError | null;
}

/**
 * REMOVAL RULE, which is the whole reason this is spelled out: a card is
 * removed from `pendingPermissions` when — and only when — a
 * `permissionResolved` push arrives for its `requestId`. That includes
 * outcome `'aborted'`, which means the turn was interrupted before the user
 * answered (frozen `ipc.ts`): the card must CLEAR ITSELF, silently, with no
 * error state. A card must not be removed optimistically on click, because a
 * failed `respond` leaves the request genuinely pending.
 *
 * IDEMPOTENCY: a `permissionResolved` for an unknown or already-removed
 * `requestId` is a no-op, not an error. Pushes may be replayed.
 */
export type PermissionOutcome = 'allow' | 'allow_always' | 'deny' | 'aborted';

// ---------------------------------------------------------------------------
// Composer (spec 5.2, 5.3)
// ---------------------------------------------------------------------------

/**
 * THE COMPOSER IS BOUND TO THE POD, NOT THE LANE. Calf lanes are read-only,
 * because Orcastrate cannot address a Calf directly — only the Matriarch can
 * (spec 5.2). There is exactly one `ComposerState` per Pod, and selecting a
 * different lane does not change its text.
 */
export interface ComposerState {
  podId: PodId;
  text: string;
  /** A `pods.send` is in flight. The send button is disabled while true. */
  sending: boolean;
  /** Last send failure, cleared on the next edit or send. */
  error: IpcError | null;
  /**
   * True when the Pod's process is not running, so the composer is disabled
   * with an explanation rather than silently swallowing the message.
   */
  disabled: boolean;
  /** Why it is disabled, for the composer's own inline text. */
  disabledReason: 'not-opened' | 'beached' | 'awaiting-permission' | null;
}

/**
 * The exact prefill Steer produces (spec 5.3). It is COMPOSER PREFILL AND
 * NOTHING ELSE — no new protocol, no direct send, no `SendMessage`. It writes
 * this string into `ComposerState.text` and focuses the composer; the user
 * edits and sends it, or does not.
 *
 * Consumers MUST call this rather than formatting the string themselves, so
 * the lane rail's Steer button and any future caller stay word-identical.
 *
 * Returns `null` when the lane has no `agentId` — the CLI did not surface one,
 * so there is nothing to address and the Steer affordance must not be offered.
 */
export declare function steerPrefill(lane: Lane): string | null;

/** The literal template `steerPrefill` fills. Asserted by T8 verbatim. */
export const STEER_PREFILL_PREFIX = 'send this to agent ';

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/**
 * Every method resolves and NEVER rejects (see the header). Every one that
 * mutates is safe to call twice; the state layer, not the component, is
 * responsible for suppressing a redundant in-flight duplicate.
 */
export interface WorkspaceActions {
  // --- Pods ---------------------------------------------------------------

  /** Refetch `pods.list`. Leaves the existing list visible while loading. */
  refreshPods(): Promise<ActionResult<Pod[]>>;

  /**
   * Creates the Pod row and opens its process. `cwd` MUST have come from
   * `pickDirectory()`; a renderer-composed path is a contract violation. Main
   * validates it regardless and answers `CWD_MISSING`.
   */
  createPod(req: CreatePodRequest): Promise<ActionResult<Pod>>;

  /**
   * Title, permission mode, env overrides, and `tabOrder`. Drag-to-reorder in
   * the Pod bar goes through here — see `reorderPods` for the multi-tab case.
   */
  updatePod(req: UpdatePodRequest): Promise<ActionResult<Pod>>;

  /**
   * Commits a drag: `orderedPodIds` is the FULL list in its new visual order.
   * The state layer assigns dense `tabOrder` values 0..n-1 and issues the
   * `pods.update` calls. On any failure it refetches and returns the error, so
   * the bar never keeps an order the main process rejected.
   */
  reorderPods(orderedPodIds: PodId[]): Promise<ActionResult<void>>;

  /** Deletes the row and its history. Does not touch anything on disk. */
  deletePod(podId: PodId): Promise<ActionResult<void>>;

  /** Starts or resumes the CLI process. */
  openPod(podId: PodId): Promise<ActionResult<Pod>>;

  /** Stops the process; the row and transcript survive. */
  closePod(podId: PodId): Promise<ActionResult<void>>;

  /** Re-resume after Beached (spec 8). */
  reconnectPod(podId: PodId): Promise<ActionResult<Pod>>;

  /**
   * Switches the active Pod. Clears that Pod's `unreadEventCount` and, on
   * first activation, triggers the backfill. Idempotent.
   */
  setActivePod(podId: PodId | null): void;

  // --- Composer / turn control -------------------------------------------

  /** Local edit. Clears `ComposerState.error`. */
  setComposerText(podId: PodId, text: string): void;

  /**
   * Sends `ComposerState.text` to the Pod and clears it on success. A send
   * with empty or whitespace-only text is a local `INVALID_ARGUMENT` and never
   * reaches IPC. Resolves on ENQUEUE, not on turn completion (frozen `ipc.ts`).
   */
  sendComposer(podId: PodId): Promise<ActionResult<void>>;

  /**
   * `Esc` interrupts the ACTIVE Pod's current turn (spec 5.4). Interrupting an
   * idle Pod is a resolving no-op, not an error. Any permission request
   * outstanding when the turn is interrupted resolves with outcome `'aborted'`
   * and its card clears itself.
   */
  interruptPod(podId: PodId): Promise<ActionResult<void>>;

  setPermissionMode(podId: PodId, mode: PermissionMode): Promise<ActionResult<void>>;

  /** Writes the Steer prefill into the Pod composer. No send, no protocol. */
  steerFromLane(podId: PodId, laneId: LaneId): void;

  // --- Lanes --------------------------------------------------------------

  /**
   * Selects the primary-pane lane and zeroes its `unreadEventCount`.
   * If `laneId` is currently pinned, the panes SWAP: the previously selected
   * lane becomes pinned, so the invariant `pinnedLaneId !== selectedLaneId`
   * holds without closing the split.
   */
  selectLane(podId: PodId, laneId: LaneId): void;

  /**
   * Opens `laneId` in the split pane beside the current transcript
   * (spec 5.2 "pin to split"). Pinning the SELECTED lane is a no-op — it would
   * render the same lane twice. Pinning while another lane is pinned replaces
   * the pin. At most one lane is pinned.
   */
  pinLane(podId: PodId, laneId: LaneId): void;

  /** Closes the split. No-op when nothing is pinned. */
  unpinLane(podId: PodId): void;

  /**
   * Jump target for the inline dispatch card (spec 5.2): selects the lane the
   * dispatch opened. A no-op when `laneId` names no known lane, which happens
   * legitimately in 'inline' routing mode and for a dispatch whose lane has
   * been deleted with its Pod.
   */
  jumpToLane(podId: PodId, laneId: LaneId): void;

  // --- Events -------------------------------------------------------------

  /**
   * Fetches the next backfill page for the active Pod. A no-op when
   * `backfill.hasMore` is false or a page is already in flight. Concurrent
   * calls coalesce into one request.
   */
  loadMoreEvents(podId: PodId): Promise<ActionResult<void>>;

  // --- Permissions --------------------------------------------------------

  /**
   * Answers one permission request. `reason` is REQUIRED when
   * `decision === 'deny'`; omitting it answers `INVALID_ARGUMENT` from main.
   * The state layer additionally rejects an empty or whitespace-only reason
   * LOCALLY as `INVALID_ARGUMENT`, so the user sees the message next to the
   * field instead of after a round trip.
   *
   * The card is NOT removed here. It is removed by the `permissionResolved`
   * push. See the removal rule above.
   */
  respondToPermission(req: PermissionRespondRequest): Promise<ActionResult<void>>;

  // --- Dialogs ------------------------------------------------------------

  /**
   * The ONLY way the renderer obtains a directory path. Cancellation resolves
   * `{ ok: true, value: { path: null } }` — cancelling is not an error, and a
   * consumer that treats a null path as a failure shows a spurious message.
   */
  pickDirectory(): Promise<ActionResult<{ path: string | null }>>;
}

// ---------------------------------------------------------------------------
// Focused hooks
// ---------------------------------------------------------------------------

/** The Pod bar's whole data dependency. */
export declare function usePods(): PodListView;

/** Undefined when no Pod is active. */
export declare function usePodSession(): PodSessionView | undefined;

/** Lane rail rows for the active Pod, in the guaranteed order. */
export declare function useLaneRail(): Loadable<LaneRowVm[]>;

/**
 * One lane's transcript. Returns an empty, `phase: 'idle'` view for a lane
 * that has no events yet, rather than undefined — so the transcript pane never
 * branches on existence.
 */
export declare function useTranscript(laneId: LaneId | null): TranscriptView;

/** The active Pod's composer. Undefined when no Pod is active. */
export declare function useComposer(): ComposerState | undefined;

/**
 * The unanswered permission cards FOR ONE LANE, oldest first. The transcript
 * renders these inline in that lane. Returns `[]` for any other lane.
 */
export declare function usePermissionCards(laneId: LaneId | null): PermissionCardVm[];

/** Actions are referentially stable for the provider's lifetime. */
export declare function useWorkspaceActions(): WorkspaceActions;
