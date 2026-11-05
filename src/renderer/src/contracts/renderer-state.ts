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
  Pod,
  PodId,
  PodStatus,
  Seq,
  Timestamp,
} from '@shared/contracts/events';
import type {
  CreatePodRequest,
  DeletePodRequest,
  IpcError,
  PermissionRespondRequest,
  PodDeletionResult,
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

/**
 * `ActionResult<PodDeletionResult>`, named so the confirmation dialog can hold
 * one (`contracts/pod-deletion.ts` section 4).
 */
export type PodDeletionActionResult = ActionResult<PodDeletionResult>;

/**
 * TODAY'S CAP ON FOLLOWER PANES, and the only place it is written down.
 *
 * The behaviour adopted at Gate 1 is Matriarch-always-primary with ONE
 * follower steered from the rail. That is a CAP on a list, not a different
 * shape: growing to two Calves later is a change to this number plus the
 * layout, and costs neither a further contract amendment nor a rewrite of the
 * pane model's tests. See `contracts/renderer-panes.ts`.
 */
export const MAX_FOLLOWER_PANES = 1;

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
   * AMENDMENT (`contracts/renderer-panes.ts` section 1). The three fields below
   * REPLACE the deleted `selectedLaneId` and `pinnedLaneId`.
   *
   * The lane in the primary pane. NON-NULL once `lanes.value` is non-empty.
   *
   * TODAY'S POLICY, ASSERTED RATHER THAN ENCODED: this is ALWAYS the Matriarch.
   * `primaryLaneId === matriarchOf(lanes).id` holds after every action and
   * after every `laneChanged` snapshot. Nothing in `WorkspaceActions` can move
   * another lane into it — THERE IS NO ACTION THAT WRITES THIS FIELD, which is
   * what makes "the Matriarch is never displaced" a property of the action
   * surface rather than a rule someone has to remember.
   *
   * `null` ONLY while the lane list is empty (before `lanes.list` answers, or
   * for a Pod that has never opened). A consumer renders "No lane selected" for
   * null exactly as it did for `selectedLaneId`.
   */
  primaryLaneId: LaneId | null;
  /**
   * Lanes in follower panes, in DISPLAY ORDER, left to right after the primary.
   *
   * TODAY'S POLICY, ASSERTED RATHER THAN ENCODED: `followerLaneIds.length <= 1`
   * (`MAX_FOLLOWER_PANES`). `WorkspaceLayoutProps.split` is fed
   * `followerLaneIds[0] ?? null`, so an empty array is the unsplit view and a
   * one-element array is today's split.
   *
   * INVARIANT — UNIQUENESS. This replaces the deleted
   * `pinnedLaneId !== selectedLaneId` invariant, and it is one rule at any N:
   *   - `primaryLaneId` is never a member of `followerLaneIds`;
   *   - `followerLaneIds` contains no duplicates;
   *   - every member names a lane in `lanes.value`.
   * The state layer restores all three after every `laneChanged` snapshot.
   *
   * DELETED WITH THE OLD SHAPE: swap-on-pin. Showing a lane that is already in
   * a follower pane no longer exchanges the two panes — see `showLane`.
   */
  followerLaneIds: readonly LaneId[];
  /**
   * Index into `followerLaneIds` naming the pane a rail selection replaces.
   * `null` when `followerLaneIds` is empty.
   *
   * At today's cap of one follower this is always `0` when a follower exists,
   * and the focus rule degenerates to "clicking a Calf updates the Calf pane,
   * always" — which is the whole user-visible point of the change.
   */
  focusedFollowerIndex: number | null;
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
 *
 * A FIELD WAS DELETED FROM THIS INTERFACE — the boolean that gated the lane
 * rail's pin control (`contracts/lane-pin-removal.ts` sections 1 and 2). The
 * rail no longer renders that control, so the field had no reader left. The
 * contract is the one place its name still appears, deliberately: reproducing
 * a dead symbol here is how a later reader mistakes a tombstone for a field.
 *
 * NEITHER RULE IT CARRIED WAS DROPPED. The Matriarch's undisplaceability was
 * already a property of `showLane` (branch 2 opens no follower for the
 * primary), and the 'inline'-mode suppression MOVED INTO `showLane` as step 0
 * — into the action, so `jumpToLane` inherits it by delegating, rather than
 * onto a view model every consumer must remember to consult.
 */
export interface LaneRowVm {
  lane: Lane;
  /** `lane.kind === 'matriarch'`. Pinned to the top of the rail. */
  isMatriarch: boolean;
  /**
   * AMENDMENT (`contracts/renderer-panes.ts` section 3). The three fields below
   * REPLACE the deleted `selected` and `pinned`.
   *
   * `lane.id === primaryLaneId`. True for exactly one row, and today that row
   * is always the Matriarch.
   */
  inPrimaryPane: boolean;
  /** `followerLaneIds.includes(lane.id)`. */
  inFollowerPane: boolean;
  /**
   * True when this row's lane is the one a rail click would REPLACE — i.e.
   * `followerLaneIds[focusedFollowerIndex] === lane.id`. Present so the rail
   * can mark the pane it is about to overwrite; a consumer that ignores it is
   * still correct at today's cap of one.
   */
  focusedFollower: boolean;
  /** `lane.subagentType ?? 'matriarch'` — the rail's "agent type" column. */
  agentType: string;
  /** `lane.description`, or null for the Matriarch. */
  description: string | null;
  status: LaneStatus;
  /**
   * The POD's status, when this row reports it INSTEAD OF its lane's — `null`
   * otherwise.
   *
   * `null` is not "unknown". It means: THIS ROW REPORTS ITS LANE STATUS. It is
   * the DEFAULT for every row, and that default is the whole of the
   * pre-amendment behaviour, preserved.
   *
   * THE FOUR RULES (`contracts/lane-row-pod-status.ts` section 2):
   *   1. `null` is the default. Every row for which the state layer has not
   *      decided otherwise carries it, and renders `status` above.
   *   2. Non-null ONLY for the Matriarch, and only while `lane.endedAt === null`.
   *   3. Every Calf row is `null` UNCONDITIONALLY, whatever the Pod is doing. A
   *      Calf is created when dispatched and ends when its subagent finishes,
   *      and a subagent never waits on user input, so a `running` Calf genuinely
   *      is working.
   *   4. Once the Matriarch's lane has ENDED, the terminal `LaneStatus` WINS:
   *      `Stopped` / `Done` / `Orphaned` keep today's word, hue and frozen
   *      `elapsedMs`. A terminal lane state is a real fact with an `endedAt`
   *      behind it, and must not be overwritten by the Pod's status.
   *
   * WHY A DISTINCT FIELD AND NOT A WIDENED `status: LaneStatus | PodStatus`.
   * The two unions COLLIDE on the literal `'running'` — the one value where they
   * disagree about what they mean. `LaneStatus.running` is a LIFETIME flag (a
   * lane is `running` iff it has not ended); `PodStatus.running` is an ACTIVITY
   * flag (the Pod is streaming a turn). `status` is carried into the
   * `data-status` HTML attribute, which is consumed by CSS selectors
   * (`LaneRail.module.css` `.status[data-status='running'] .dot`) and by
   * `row.querySelector('[data-status]')` in three suites (`LaneRail.test.tsx`,
   * `stopped-lane.test.tsx`, `orphaned-lane.test.tsx`). A widened union would put
   * both vocabularies into that one attribute, so the pulse rule would match a
   * streaming Pod and a merely-unended lane alike — which is this defect itself,
   * re-encoded in CSS. A distinct field makes the collision impossible by
   * construction and leaves every existing rule and query untouched.
   */
  podStatus: PodStatus | null;
  /**
   * Milliseconds from `lane.startedAt` to `lane.endedAt`, or to now while the
   * lane is running. Recomputed on a timer owned by the state layer, NOT by
   * each row — a running lane's row re-renders about once a second, and a
   * finished lane's `elapsedMs` is frozen and stops re-rendering.
   */
  elapsedMs: number;
  /** Events appended to this lane since it was last shown in a pane. */
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
   * Creates the Pod ROW. IT DOES NOT OPEN THE PROCESS: `pods.open` is the one
   * channel that starts a CLI, and a create that also opened made "the row
   * exists" and "a process is running" a single indivisible outcome no caller
   * could ask for separately — and reported a spawn failure as a failed
   * create, for a Pod that had in fact been created.
   *
   * `cwd` MUST have come from `pickDirectory()`; a renderer-composed path is a
   * contract violation. Main validates it regardless and answers `CWD_MISSING`.
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

  /**
   * AMENDMENT (`contracts/pod-deletion.ts` section 4). Deletes the Pod row and
   * its transcript history, permanently, and — when `req.deleteSession` is
   * true — also moves this Pod's Claude Code session file to the OS recycle
   * bin.
   *
   * Still resolves and never rejects. Still safe to call twice: the second
   * call answers `NOT_FOUND`, which the dialog reports as the Pod already
   * being gone rather than as a failure.
   *
   * ON SUCCESS the state layer removes the Pod's row, its runtime, and clears
   * `activePodId` if it named this Pod. It does this whenever `podDeleted` is
   * true, INDEPENDENTLY of `session`: a Pod whose session file could not be
   * binned is still a deleted Pod, and `session: 'failed'` is a value the
   * dialog reports, not a failed deletion.
   */
  deletePod(req: DeletePodRequest): Promise<PodDeletionActionResult>;

  /** Starts or resumes the CLI process. */
  openPod(podId: PodId): Promise<ActionResult<Pod>>;

  /** Stops the process; the row and transcript survive. */
  closePod(podId: PodId): Promise<ActionResult<void>>;

  /** Re-resume after Beached (spec 8). */
  reconnectPod(podId: PodId): Promise<ActionResult<Pod>>;

  /**
   * Forks the Pod `podId` into a NEW Pod through `pods.fork`, and resolves
   * that new Pod. Resolves and NEVER rejects, like every action here.
   *
   * ON SUCCESS the returned Pod is added to the Pod list — where its server
   * `tabOrder` places it — and `activePodId` becomes its id. The new Pod is
   * `'closed'`: forking starts no process, and opening the fork is the ordinary
   * `openPod`.
   *
   * ON FAILURE main's `IpcError` is passed through unmodified, and neither the
   * Pod list nor `activePodId` changes.
   *
   * A second call for the same `podId` while one is in flight issues NO second
   * `pods.fork`: it resolves the in-flight call's result. A double activation
   * of the Fork control makes one fork, not two.
   *
   * Eligibility is NOT re-checked here. Main answers `CONFLICT` for an
   * ineligible Pod, and the Fork control reads `forkEligibility` from
   * `@shared/fork-eligibility` to decide whether to offer the call at all.
   */
  forkPod(podId: PodId): Promise<ActionResult<Pod>>;

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

  /** Writes the Steer prefill into the Pod composer. No send, no protocol. */
  steerFromLane(podId: PodId, laneId: LaneId): void;

  // --- Lanes --------------------------------------------------------------

  /**
   * THE SINGLE LANE-SELECTION VERB. REPLACES the deleted `selectLane`,
   * `pinLane` and `unpinLane`. Puts `laneId` on screen and zeroes its
   * `unreadEventCount`.
   *
   * RESOLUTION ORDER, and a consumer may rely on all four branches:
   *
   *  1. `laneId` names no lane in `lanes.value` -> NO-OP. Legitimate in
   *     'inline' routing mode and for a dispatch whose lane was dropped by a
   *     snapshot. The same tolerance `selectLane` had.
   *  2. `laneId === primaryLaneId` -> the primary pane is already showing it.
   *     Clears its unread count and nothing else. NEVER opens a follower.
   *  3. `laneId` is already in `followerLaneIds` -> FOCUS, DO NOT DUPLICATE.
   *     `focusedFollowerIndex` moves to that lane's index; the array is
   *     unchanged, its length included. This is the uniqueness invariant doing
   *     its job, and it is the branch a push-based implementation gets wrong.
   *  4. Otherwise -> REPLACE THE FOCUSED FOLLOWER. When `followerLaneIds` is
   *     empty, one is opened and `focusedFollowerIndex` becomes 0. When a
   *     follower exists, the lane at `focusedFollowerIndex` is replaced IN
   *     PLACE — the array's length does not change and no lane is appended,
   *     because the cap is `MAX_FOLLOWER_PANES`.
   *
   * WHAT THIS DELIBERATELY CANNOT DO: move a lane into the primary pane.
   */
  showLane(podId: PodId, laneId: LaneId): void;

  /**
   * Closes ONE follower pane and removes its lane from `followerLaneIds`.
   *
   * `laneId` names which pane. A `laneId` that is not currently a follower is
   * a NO-OP, not an error — a double-click on an unpin control must not throw
   * and must not close a different pane. After the removal
   * `focusedFollowerIndex` becomes `null` when the array is empty, and
   * otherwise clamps into range.
   */
  hideLane(podId: PodId, laneId: LaneId): void;

  /**
   * UNCHANGED SIGNATURE, REDEFINED BEHAVIOUR. The inline dispatch card's jump
   * target DELEGATES TO `showLane` — so a jump opens or steers the follower
   * pane rather than replacing the Matriarch's transcript, which is the
   * behaviour the pane model exists to remove. Still a no-op when `laneId`
   * names no known lane, which happens legitimately in 'inline' routing mode
   * and for a dispatch whose lane has been deleted with its Pod.
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
