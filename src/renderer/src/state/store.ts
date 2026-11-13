/**
 * The workspace store — the ONLY module in `src/renderer/**` that talks to
 * `window.orcastrate` (through the `OrcastrateApi` handed to its constructor).
 *
 * It is a plain external store rather than a reducer inside the component
 * tree, for three reasons the frozen contract forces:
 *
 *   1. `WorkspaceActions` must be referentially stable for the provider's
 *      lifetime. Methods bound to a long-lived object are stable by
 *      construction; callbacks closed over render scope are not.
 *   2. Push handlers must read the CURRENT state. An external store has no
 *      render closure to go stale.
 *   3. Nothing may be fetched in response to a render. Every fetch here is
 *      reached from `start()` (an explicit lifecycle) or from an action (an
 *      explicit event).
 *
 * ERROR DISCIPLINE: every IPC call goes through `safeInvoke`. No action
 * rejects, no action throws, and a preload bug that rejects outright is
 * converted to `INTERNAL` rather than becoming an unhandled rejection.
 *
 * PATHS: `cwd` is an opaque display string. This module never composes,
 * parses, joins, or types one, and imports no `node:` builtin.
 */

import type {
  Lane,
  LaneId,
  NormalizedEvent,
  Pod,
  PodId,
  Timestamp,
} from '@shared/contracts/events';
import type {
  CreatePodRequest,
  DeletePodRequest,
  IpcError,
  IpcResult,
  LaneChangedPush,
  OrcastrateApi,
  PermissionRequestedPush,
  PermissionResolvedPush,
  PermissionRespondRequest,
  PodCommandsPush,
  PodDeletionResult,
  PodEventPush,
  PodStatusPush,
  SlashCommandInfo,
  Unsubscribe,
  UpdatePodRequest,
} from '@shared/contracts/ipc';
import type { RoutingMode } from '@shared/contracts/lane-router';

import type {
  ActionResult,
  BackfillState,
  LoadPhase,
  PermissionCardVm,
  PodDeletionActionResult,
  WorkspaceActions,
} from '../contracts/renderer-state';
import { MAX_FOLLOWER_PANES } from '../contracts/renderer-state';

import { mergeEvents } from './merge';
import { matriarchOf, orderPods } from './ordering';
import { steerPrefill } from './steer';

// ---------------------------------------------------------------------------
// Shape
// ---------------------------------------------------------------------------

/** Page size the renderer asks for. Main clamps anything above 5000. */
export const DEFAULT_BACKFILL_PAGE_SIZE = 500;

/** The error used whenever the bridge itself is missing or misbehaving. */
export function internalError(message: string): IpcError {
  return { code: 'INTERNAL', message };
}

/** Exported so `panel-store.ts` fails closed with the SAME sentence. */
export const NO_BRIDGE_MESSAGE =
  'The Orcastrate bridge is unavailable. The window was loaded without its preload script.';

export interface LaneTranscriptState {
  events: NormalizedEvent[];
  phase: LoadPhase;
  error: IpcError | null;
}

/**
 * Everything the store keeps for one Pod. Held for ANY Pod that has been
 * activated or has received a push — not only the active one — because the
 * Pod bar's permission badge must light up for a backgrounded Pod.
 */
export interface PodRuntimeState {
  lanesPhase: LoadPhase;
  lanes: Lane[];
  lanesError: IpcError | null;
  // THE PANE MODEL (`contracts/renderer-panes.ts` section 1). These three
  // REPLACE `selectedLaneId` and `pinnedLaneId`; neither survives, not even as
  // an alias, because a compile error at every remaining call site is how the
  // call sites get found.
  //
  // `primaryLaneId` is written by `repairSelection` and by NOTHING ELSE. That
  // is what makes "the Matriarch is never displaced" a property of the action
  // surface rather than a rule someone has to remember.
  primaryLaneId: LaneId | null;
  followerLaneIds: LaneId[];
  focusedFollowerIndex: number | null;
  transcripts: Record<LaneId, LaneTranscriptState | undefined>;
  backfill: BackfillState;
  pendingPermissions: PermissionCardVm[];
  composerText: string;
  composerSending: boolean;
  composerError: IpcError | null;
  // NO `opened` HERE, DELIBERATELY. Openness is a fact about main's session
  // registry and `pod.status` is the only field that reports it, so the
  // renderer stores nothing and derives it once in `workspace-provider.tsx`.
  // A renderer-local copy had two owners and disagreed with main on every
  // fresh renderer — reload, HMR or relaunch — which is the defect this
  // session removed. See `contracts/renderer-lifecycle.ts` section 1.
  unreadEventCount: number;
  laneUnread: Record<LaneId, number>;
  /**
   * The Pod's latest pushed slash-command list, held as the very array the
   * last `podCommands` push for this Pod delivered: no copy, no filter, no
   * reordering. A push replaces it wholesale. Before any push it is the shared
   * `NO_SLASH_COMMANDS` array, so a Pod that never received one reads as empty
   * and keeps one identity across renders.
   */
  slashCommands: readonly SlashCommandInfo[];
  /** Set the first time this Pod becomes active, so backfill starts once. */
  activated: boolean;
}

/**
 * RAW state. Nothing derived is stored here: ordering, view models, unread
 * clamping and `highWaterSeq` are all computed in the provider, so none of
 * them can go stale.
 */
export interface WorkspaceState {
  podsPhase: LoadPhase;
  pods: Pod[];
  podsError: IpcError | null;
  activePodId: PodId | null;
  routingMode: RoutingMode | null;
  /** The failed `app.routingMode()` answer, unmodified; `null` otherwise. */
  routingModeError: IpcError | null;
  runtimes: Record<PodId, PodRuntimeState | undefined>;
}

/**
 * Construction-time knobs. Both exist so tests are deterministic; neither is
 * part of the frozen contract's surface and the provider sets neither.
 */
export interface WorkspaceStoreOptions {
  /** Clock used for `PermissionCardVm.receivedAt`. */
  now?: () => Timestamp;
  /**
   * Backfill page size. Deliberately unclamped here: main clamps anything
   * above 5000, and a page shorter than what was asked for is NOT an error and
   * does not end paging.
   */
  pageSize?: number;
}

/**
 * The one empty command list. Every Pod that has received no `podCommands`
 * push holds this array, and the provider answers it when no Pod is active,
 * so "nothing to suggest" has a single identity and never re-renders a
 * consumer on its own. Frozen so no holder can grow it for everyone.
 */
export const NO_SLASH_COMMANDS: readonly SlashCommandInfo[] = Object.freeze([]);

export function newRuntime(
  phase: LoadPhase,
  error: IpcError | null,
  pageSize: number = DEFAULT_BACKFILL_PAGE_SIZE,
): PodRuntimeState {
  return {
    lanesPhase: phase,
    lanes: [],
    lanesError: error,
    primaryLaneId: null,
    followerLaneIds: [],
    focusedFollowerIndex: null,
    transcripts: {},
    backfill: {
      phase,
      error,
      cursorSeq: 0,
      hasMore: false,
      pageSize,
    },
    pendingPermissions: [],
    composerText: '',
    composerSending: false,
    composerError: null,
    unreadEventCount: 0,
    laneUnread: {},
    slashCommands: NO_SLASH_COMMANDS,
    activated: false,
  };
}

// ---------------------------------------------------------------------------
// The store
// ---------------------------------------------------------------------------

export class WorkspaceStateStore {
  private state: WorkspaceState;
  private readonly listeners = new Set<() => void>();
  private readonly api: OrcastrateApi | null;
  private readonly now: () => Timestamp;
  private readonly pageSize: number;
  private unsubscribes: Unsubscribe[] = [];
  private started = false;

  /** In-flight de-duplication, so a double click cannot send two decisions. */
  private readonly inflightBackfill = new Map<PodId, Promise<ActionResult<void>>>();
  private readonly inflightSend = new Map<PodId, Promise<ActionResult<void>>>();
  private readonly inflightFork = new Map<PodId, Promise<ActionResult<Pod>>>();
  private readonly inflightRespond = new Set<string>();
  /**
   * The one `lanes.list` per Pod that may be in flight, whoever started it —
   * the activation load in `setActivePod` or `retryLanes`. A call made while
   * one is registered here resolves that load's outcome instead of issuing a
   * second read.
   */
  private readonly inflightLanes = new Map<PodId, Promise<ActionResult<void>>>();
  /** The one `app.routingMode()` that may be in flight: startup's or a retry's. */
  private inflightRoutingMode: Promise<ActionResult<void>> | null = null;

  readonly actions: WorkspaceActions;

  constructor(api: OrcastrateApi | null, options: WorkspaceStoreOptions = {}) {
    this.api = api;
    this.now = options.now ?? isoNow;
    this.pageSize = options.pageSize ?? DEFAULT_BACKFILL_PAGE_SIZE;
    const bridgeError = api === null ? internalError(NO_BRIDGE_MESSAGE) : null;
    this.state = {
      // With no bridge the contract requires every Loadable to render in
      // phase 'error' with code INTERNAL — and requires NOT throwing, because
      // a throw during module init blanks the window with no diagnosis.
      podsPhase: api === null ? 'error' : 'idle',
      pods: [],
      podsError: bridgeError,
      activePodId: null,
      routingMode: null,
      // Stays null with no bridge: that case surfaces through `podsError`.
      routingModeError: null,
      runtimes: {},
    };
    this.actions = this.buildActions();
  }

  /** True when the provider was constructed without a bridge. */
  get hasBridge(): boolean {
    return this.api !== null;
  }

  // --- subscription surface (useSyncExternalStore) -------------------------

  readonly getState = (): WorkspaceState => this.state;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private commit(next: WorkspaceState): void {
    if (next === this.state) return;
    this.state = next;
    for (const listener of [...this.listeners]) listener();
  }

  private update(fn: (state: WorkspaceState) => WorkspaceState): void {
    this.commit(fn(this.state));
  }

  private patchRuntime(podId: PodId, fn: (runtime: PodRuntimeState) => PodRuntimeState): void {
    this.update((state) => {
      const existing = state.runtimes[podId];
      const base =
        existing ??
        newRuntime(this.api === null ? 'error' : 'idle', this.bridgeError(), this.pageSize);
      const next = fn(base);
      // EVERY write to a runtime record passes through here — every action and
      // every push — so this is the one place today's pane policy has to be
      // checked to be checked everywhere.
      assertPanePolicy(next);
      if (next === existing) return state;
      return { ...state, runtimes: { ...state.runtimes, [podId]: next } };
    });
  }

  private bridgeError(): IpcError | null {
    return this.api === null ? internalError(NO_BRIDGE_MESSAGE) : null;
  }

  // --- lifecycle -----------------------------------------------------------

  /**
   * Mount. Subscribes exactly once to every workspace push channel — each
   * `EVENT_CHANNELS` member except `helmChanged`, which the panel store owns —
   * and issues the two startup reads together — they are independent, so chaining them would
   * be a waterfall for no reason.
   *
   * Idempotent while started, so React StrictMode's double-invoke cannot
   * double-subscribe.
   */
  start(): void {
    if (this.started) return;
    this.started = true;
    const api = this.api;
    if (api === null) return;

    this.unsubscribes = [
      api.on.podEvent((push) => this.onPodEvent(push)),
      api.on.podStatus((push) => this.onPodStatus(push)),
      api.on.laneChanged((push) => this.onLaneChanged(push)),
      api.on.permissionRequested((push) => this.onPermissionRequested(push)),
      api.on.permissionResolved((push) => this.onPermissionResolved(push)),
      api.on.podCommands((push) => this.onPodCommands(push)),
    ];

    void this.loadRoutingMode();
    void this.actions.refreshPods();
  }

  /** Unmount. Every `Unsubscribe` returned on mount is called exactly once. */
  stop(): void {
    if (!this.started) return;
    this.started = false;
    const subs = this.unsubscribes;
    this.unsubscribes = [];
    for (const unsubscribe of subs) unsubscribe();
  }

  /**
   * The routing-mode read. Issued by `start()` and, after that read failed,
   * by `retryRoutingMode` — the second writer of `routingModeError`, and the
   * only other one. A failure is recorded as the very `IpcError` the bridge
   * answered, and `routingMode` stays `null`; a success sets the mode, which
   * is constant from then on, and leaves `routingModeError` `null`.
   *
   * At most one read is in flight: a call made while one is registered in
   * `inflightRoutingMode` resolves that read's outcome.
   */
  private async loadRoutingMode(): Promise<ActionResult<void>> {
    const api = this.api;
    if (api === null) return this.failClosed<void>();
    const inflight = this.inflightRoutingMode;
    if (inflight !== null) return inflight;

    const promise = (async (): Promise<ActionResult<void>> => {
      const result = await safeInvoke(() => api.app.routingMode());
      if (!result.ok) {
        const error = result.error;
        this.update((state) => ({ ...state, routingModeError: error }));
        return result;
      }
      const mode = result.value;
      this.update((state) =>
        state.routingMode === mode && state.routingModeError === null
          ? state
          : { ...state, routingMode: mode, routingModeError: null },
      );
      return { ok: true, value: undefined };
    })();

    this.inflightRoutingMode = promise;
    try {
      return await promise;
    } finally {
      this.inflightRoutingMode = null;
    }
  }

  // --- push handlers -------------------------------------------------------

  /**
   * Live events. Merged into the per-lane transcript by `seq`, so a live event
   * that arrives mid-backfill is neither duplicated when the page carrying it
   * lands nor dropped. Backfill pages take the same path — there is exactly
   * one merge in this file.
   */
  private onPodEvent(push: PodEventPush): void {
    this.applyEvents(push.podId, push.events, true);
  }

  private applyEvents(podId: PodId, events: readonly NormalizedEvent[], live: boolean): void {
    if (events.length === 0) return;
    const activePodId = this.state.activePodId;

    this.patchRuntime(podId, (runtime) => {
      const byLane = new Map<LaneId, NormalizedEvent[]>();
      for (const event of events) {
        const bucket = byLane.get(event.laneId);
        if (bucket === undefined) byLane.set(event.laneId, [event]);
        else bucket.push(event);
      }

      const transcripts = { ...runtime.transcripts };
      const laneUnread = { ...runtime.laneUnread };
      let added = 0;

      for (const [laneId, laneEvents] of byLane) {
        const before = transcripts[laneId]?.events ?? [];
        const after = mergeEvents(before, laneEvents);
        transcripts[laneId] = { events: after, phase: 'ready', error: null };
        const grew = after.length - before.length;
        // A lane that is ON SCREEN — in the primary pane or in a follower —
        // accrues no unread count. Under the old shape only the single
        // selected lane qualified; the pane model makes that a membership
        // test over both panes.
        if (live && grew > 0 && !isOnScreen(runtime, laneId)) {
          laneUnread[laneId] = (laneUnread[laneId] ?? 0) + grew;
        }
        added += grew;
      }

      // Backfilled history is not "unread" — only a live push is. And the
      // active Pod's count is zero at all times.
      const unread =
        live && added > 0 && podId !== activePodId
          ? runtime.unreadEventCount + added
          : runtime.unreadEventCount;

      return { ...runtime, transcripts, laneUnread, unreadEventCount: unread };
    });
  }

  /**
   * Writing `push.status` onto the Pod row is the WHOLE of this handler, and
   * it is what makes a push update the tab with no refetch: openness is
   * derived from that field, so there is nothing else to keep in step. The
   * `beached` branch that used to clear a renderer-local `opened` went with
   * the field rather than being rewritten.
   */
  private onPodStatus(push: PodStatusPush): void {
    this.update((state) => {
      if (!state.pods.some((pod) => pod.id === push.podId)) return state;
      return {
        ...state,
        pods: state.pods.map((pod) =>
          pod.id === push.podId ? { ...pod, status: push.status } : pod,
        ),
      };
    });
  }

  /**
   * `laneChanged` is a SNAPSHOT, not a delta: the list is replaced wholesale,
   * so a lane the push omits disappears from the rail. The pane model is
   * repaired against the new list rather than left dangling — see
   * `repairSelection`, which restores all three uniqueness rules.
   */
  private onLaneChanged(push: LaneChangedPush): void {
    this.patchRuntime(push.podId, (runtime) =>
      repairSelection({
        ...runtime,
        lanes: push.lanes,
        lanesPhase: 'ready',
        lanesError: null,
      }),
    );
  }

  private onPermissionRequested(push: PermissionRequestedPush): void {
    const receivedAt = this.now();
    this.patchRuntime(push.podId, (runtime) => {
      // Pushes may be replayed; a request already on screen is not re-added.
      if (runtime.pendingPermissions.some((card) => card.requestId === push.requestId)) {
        return runtime;
      }
      const card: PermissionCardVm = {
        podId: push.podId,
        laneId: push.laneId,
        requestId: push.requestId,
        toolName: push.toolName,
        input: push.input,
        receivedAt,
        submitting: false,
        error: null,
      };
      return { ...runtime, pendingPermissions: [...runtime.pendingPermissions, card] };
    });
  }

  /**
   * THE REMOVAL RULE. A card leaves `pendingPermissions` here and nowhere
   * else — including outcome 'aborted', which clears it silently with no
   * error state. A resolution for an unknown or already-removed requestId is
   * a no-op, because pushes may be replayed.
   */
  private onPermissionResolved(push: PermissionResolvedPush): void {
    this.patchRuntime(push.podId, (runtime) => {
      const remaining = runtime.pendingPermissions.filter(
        (card) => card.requestId !== push.requestId,
      );
      if (remaining.length === runtime.pendingPermissions.length) return runtime;
      return { ...runtime, pendingPermissions: remaining };
    });
    this.inflightRespond.delete(push.requestId);
  }

  /**
   * A Pod's slash-command list, WHOLE. The push is written to the Pod it
   * names — `push.podId`, never the active Pod — so a list for a backgrounded
   * Pod waits on that Pod's record until it is activated, and activating it
   * reads the list with no IPC call. The array replaces the previous one
   * wholesale, an empty one included. A push for a Pod with no record creates
   * the record, as every other per-Pod push does.
   */
  private onPodCommands(push: PodCommandsPush): void {
    this.patchRuntime(push.podId, (runtime) => ({ ...runtime, slashCommands: push.commands }));
  }

  // --- actions -------------------------------------------------------------

  private failClosed<T>(): ActionResult<T> {
    return { ok: false, error: internalError(NO_BRIDGE_MESSAGE) };
  }

  private buildActions(): WorkspaceActions {
    const store = this;

    return {
      // --- Pods -----------------------------------------------------------

      async refreshPods(): Promise<ActionResult<Pod[]>> {
        const api = store.api;
        if (api === null) return store.failClosed<Pod[]>();
        // The existing list stays visible while loading — `Loadable.value` is
        // always renderable, so a refetch never blanks the Pod bar.
        store.update((state) => ({ ...state, podsPhase: 'loading' }));
        const result = await safeInvoke(() => api.pods.list());
        if (!result.ok) {
          store.update((state) => ({ ...state, podsPhase: 'error', podsError: result.error }));
          return result;
        }
        store.update((state) => ({
          ...state,
          podsPhase: 'ready',
          podsError: null,
          pods: result.value,
        }));
        // First list with nothing selected: open the leftmost tab, so the app
        // does not start on a blank workspace. A later refresh never steals
        // the user's selection, because `activePodId` is no longer null.
        if (store.state.activePodId === null) {
          const first = orderPods(result.value)[0];
          if (first !== undefined) store.actions.setActivePod(first.id);
        }
        return result;
      },

      async createPod(req: CreatePodRequest): Promise<ActionResult<Pod>> {
        const api = store.api;
        if (api === null) return store.failClosed<Pod>();
        const created = await safeInvoke(() => api.pods.create(req));
        if (!created.ok) return created;
        const pod = created.value;
        store.applyPod(pod);
        store.update((state) => ({
          ...state,
          podsPhase: state.podsPhase === 'idle' ? 'ready' : state.podsPhase,
        }));
        store.actions.setActivePod(pod.id);
        // CREATES THE ROW, AND STOPS. There is deliberately no `pods.open`
        // here: opening is `openPod`'s job and the Pod bar's affordance, and
        // folding it in reported a spawn failure as a failed CREATE for a Pod
        // that had in fact been created. `applyPod` wrote the returned status,
        // and that status IS the openness — nothing else to patch.
        return { ok: true, value: pod };
      },

      async updatePod(req: UpdatePodRequest): Promise<ActionResult<Pod>> {
        const api = store.api;
        if (api === null) return store.failClosed<Pod>();
        const result = await safeInvoke(() => api.pods.update(req));
        if (!result.ok) return result;
        store.applyPod(result.value);
        return result;
      },

      /**
       * Commits a drag. Dense `tabOrder` 0..n-1, issued together because the
       * updates are independent. On ANY failure the list is refetched, so the
       * bar can never keep an order main rejected.
       */
      async reorderPods(orderedPodIds: PodId[]): Promise<ActionResult<void>> {
        const api = store.api;
        if (api === null) return store.failClosed<void>();
        const results = await Promise.all(
          orderedPodIds.map((podId, index) =>
            safeInvoke(() => api.pods.update({ podId, tabOrder: index })),
          ),
        );
        for (const result of results) {
          if (!result.ok) {
            await store.actions.refreshPods();
            return { ok: false, error: result.error };
          }
        }
        for (const result of results) if (result.ok) store.applyPod(result.value);
        return { ok: true, value: undefined };
      },

      /**
       * The Pod row, its runtime and its `activePodId` claim are cleared
       * whenever `podDeleted` is true — INDEPENDENTLY of `session`. A Pod
       * whose session file could not be binned is still a deleted Pod, and
       * leaving its tab on screen because a FILE survived would tell the user
       * the opposite of what happened. `session: 'failed'` is the dialog's to
       * report, not this layer's to act on.
       */
      async deletePod(req: DeletePodRequest): Promise<PodDeletionActionResult> {
        const api = store.api;
        if (api === null) return store.failClosed<PodDeletionResult>();
        const result = await safeInvoke(() => api.pods.delete(req));
        if (!result.ok) return result;
        const podId = req.podId;
        store.update((state) => {
          const runtimes = { ...state.runtimes };
          delete runtimes[podId];
          return {
            ...state,
            pods: state.pods.filter((pod) => pod.id !== podId),
            runtimes,
            activePodId: state.activePodId === podId ? null : state.activePodId,
          };
        });
        return { ok: true, value: result.value };
      },

      async openPod(podId: PodId): Promise<ActionResult<Pod>> {
        const api = store.api;
        if (api === null) return store.failClosed<Pod>();
        const result = await safeInvoke(() => api.pods.open(podId));
        if (!result.ok) return result;
        store.applyPod(result.value);
        return result;
      },

      async closePod(podId: PodId): Promise<ActionResult<void>> {
        const api = store.api;
        if (api === null) return store.failClosed<void>();
        const result = await safeInvoke(() => api.pods.close(podId));
        if (!result.ok) return result;
        // No `opened: false` patch. `pod:close` triggers a `podStatus` push
        // carrying `'closed'`, and `onPodStatus` writing that onto the Pod row
        // is the whole update — openness is derived from it.
        return { ok: true, value: undefined };
      },

      async reconnectPod(podId: PodId): Promise<ActionResult<Pod>> {
        const api = store.api;
        if (api === null) return store.failClosed<Pod>();
        const result = await safeInvoke(() => api.pods.reconnect(podId));
        if (!result.ok) return result;
        // `applyPod` writes the returned status, and that status IS the
        // openness — no optimistic patch is issued or needed.
        store.applyPod(result.value);
        return result;
      },

      /**
       * One `pods.fork` per Pod at a time: a second call while the first is in
       * flight resolves the first call's result. On success the fork is listed
       * and selected; on failure nothing is touched and main's error is passed
       * through unmodified.
       */
      async forkPod(podId: PodId): Promise<ActionResult<Pod>> {
        const api = store.api;
        if (api === null) return store.failClosed<Pod>();
        const inflight = store.inflightFork.get(podId);
        if (inflight !== undefined) return inflight;

        const promise = (async (): Promise<ActionResult<Pod>> => {
          const result = await safeInvoke(() => api.pods.fork(podId));
          if (!result.ok) return result;
          // No push announces a fork: the resolved Pod is the whole
          // announcement, so it is applied here. Its server `tabOrder` is what
          // places it in the bar.
          store.applyPod(result.value);
          store.actions.setActivePod(result.value.id);
          return result;
        })();

        store.inflightFork.set(podId, promise);
        try {
          return await promise;
        } finally {
          store.inflightFork.delete(podId);
        }
      },

      /** Idempotent. Clears the Pod's unread count and, once, starts its reads. */
      setActivePod(podId: PodId | null): void {
        if (store.state.activePodId === podId) return;
        store.update((state) => ({ ...state, activePodId: podId }));
        if (podId === null) return;
        store.patchRuntime(podId, (runtime) =>
          runtime.unreadEventCount === 0 ? runtime : { ...runtime, unreadEventCount: 0 },
        );
        if (store.state.runtimes[podId]?.activated === true) return;
        store.patchRuntime(podId, (runtime) => ({ ...runtime, activated: true }));
        // Two independent reads, issued together rather than chained.
        void store.loadLanes(podId);
        void store.actions.loadMoreEvents(podId);
      },

      // --- Composer / turn control ----------------------------------------

      setComposerText(podId: PodId, text: string): void {
        store.patchRuntime(podId, (runtime) => ({
          ...runtime,
          composerText: text,
          composerError: null,
        }));
      },

      /**
       * Empty or whitespace-only text is a LOCAL `INVALID_ARGUMENT` that never
       * reaches IPC — the one class of error this layer invents.
       */
      async sendComposer(podId: PodId): Promise<ActionResult<void>> {
        const api = store.api;
        if (api === null) return store.failClosed<void>();
        const text = store.state.runtimes[podId]?.composerText ?? '';
        if (text.trim() === '') {
          const error: IpcError = {
            code: 'INVALID_ARGUMENT',
            message: 'Type a message before sending.',
          };
          store.patchRuntime(podId, (runtime) => ({ ...runtime, composerError: error }));
          return { ok: false, error };
        }
        const inflight = store.inflightSend.get(podId);
        if (inflight !== undefined) return inflight;

        const promise = (async (): Promise<ActionResult<void>> => {
          store.patchRuntime(podId, (runtime) => ({
            ...runtime,
            composerSending: true,
            composerError: null,
          }));
          const result = await safeInvoke(() => api.pods.send(podId, text));
          store.patchRuntime(podId, (runtime) => ({
            ...runtime,
            composerSending: false,
            composerError: result.ok ? null : result.error,
            // Cleared only on success; a failed send must not lose the text.
            composerText: result.ok && runtime.composerText === text ? '' : runtime.composerText,
          }));
          return result.ok ? { ok: true, value: undefined } : result;
        })();

        store.inflightSend.set(podId, promise);
        try {
          return await promise;
        } finally {
          store.inflightSend.delete(podId);
        }
      },

      /**
       * Interrupting an idle Pod is a resolving no-op decided by MAIN, not
       * short-circuited here: a local guess would hide a real failure.
       */
      async interruptPod(podId: PodId): Promise<ActionResult<void>> {
        const api = store.api;
        if (api === null) return store.failClosed<void>();
        const result = await safeInvoke(() => api.pods.interrupt(podId));
        return result.ok ? { ok: true, value: undefined } : result;
      },

      /** Prefill only. Writes the string and sends NOTHING. */
      steerFromLane(podId: PodId, laneId: LaneId): void {
        const lane = store.state.runtimes[podId]?.lanes.find((candidate) => candidate.id === laneId);
        if (lane === undefined) return;
        const prefill = steerPrefill(lane);
        if (prefill === null) return;
        store.actions.setComposerText(podId, prefill);
      },

      // --- Lanes ----------------------------------------------------------

      /**
       * THE SINGLE LANE-SELECTION VERB, and the five branches of its
       * resolution order in the order the contract states them
       * (`contracts/lane-pin-removal.ts` section 2). NOTE WHAT IS ABSENT: no
       * branch writes `primaryLaneId`.
       */
      showLane(podId: PodId, laneId: LaneId): void {
        // 0. 'inline' ROUTING MODE OPENS NO FOLLOWER, EVER. Every event
        //    carries the Matriarch's laneId there, so a follower pane on a
        //    Calf would show BYTE-IDENTICAL contents to the primary under a
        //    different lane title. This rule used to be enforced one level up,
        //    by the deleted pin-gating field on the rail's view model, which
        //    suppressed the rail's pin button; the button is gone, so the rule
        //    lives in the action instead — which is also the only placement
        //    `jumpToLane` inherits by delegating.
        //    The unread count IS still cleared: the user looked at the lane.
        //    `routingMode === null` takes NO special branch — the shell does
        //    not render the rail until the mode resolves, so there is no
        //    click — and it falls through to the ordinary path.
        //
        //    A TABLE, NOT A COMPARISON, for the reason `isolation.test.ts`
        //    criterion 12 scans for the comparison and for the reason the
        //    provider's own deleted routing-mode table was one: a routing mode
        //    added by a later session fails to compile HERE, loudly, instead
        //    of quietly falling into whichever half the `else` was.
        const mode = store.state.routingMode;
        const opensFollower = mode === null || OPENS_FOLLOWER_BY_ROUTING_MODE[mode];

        store.patchRuntime(podId, (runtime) => {
          //    Step 0 resolves BEFORE the unknown-lane check, exactly as the
          //    contract numbers them. It is not observable that it does:
          //    `clearLaneUnread` returns the runtime untouched when the count
          //    is already zero, and a lane the Pod does not know has no count.
          if (!opensFollower) return clearLaneUnread(runtime, laneId);

          // 1. Unknown lane: no-op, all three fields untouched.
          if (!isKnownLane(runtime, laneId)) return runtime;

          // 2. Already the primary. Clear its unread and NOTHING else — in
          //    particular, never open a follower showing the primary's lane.
          if (runtime.primaryLaneId === laneId) return clearLaneUnread(runtime, laneId);

          // 3. Already a follower: FOCUS it, do not duplicate it. The array is
          //    returned unchanged — length included. Pushing a second copy
          //    here is the mistake the uniqueness invariant exists to catch.
          const existing = runtime.followerLaneIds.indexOf(laneId);
          if (existing !== -1) {
            const focused =
              runtime.focusedFollowerIndex === existing
                ? runtime
                : { ...runtime, focusedFollowerIndex: existing };
            return clearLaneUnread(focused, laneId);
          }

          // 4. Otherwise REPLACE the focused follower. The array grows only
          //    while it is under `MAX_FOLLOWER_PANES` — at the cap the lane at
          //    `focusedFollowerIndex` is overwritten IN PLACE and the length
          //    does not change. At today's cap of one that reads as "clicking
          //    a Calf updates the Calf pane, always".
          const followers = [...runtime.followerLaneIds];
          let index: number;
          if (followers.length < MAX_FOLLOWER_PANES) {
            followers.push(laneId);
            index = followers.length - 1;
          } else {
            index = clampIndexInto(runtime.focusedFollowerIndex, followers.length);
            followers[index] = laneId;
          }
          return clearLaneUnread(
            { ...runtime, followerLaneIds: followers, focusedFollowerIndex: index },
            laneId,
          );
        });
      },

      /**
       * Closes ONE follower pane. A lane that is not a follower is a no-op,
       * not an error — a double-click on an unpin control must not throw and
       * must not close a different pane.
       */
      hideLane(podId: PodId, laneId: LaneId): void {
        store.patchRuntime(podId, (runtime) => {
          const at = runtime.followerLaneIds.indexOf(laneId);
          if (at === -1) return runtime;
          const followers = runtime.followerLaneIds.filter((_, index) => index !== at);
          return {
            ...runtime,
            followerLaneIds: followers,
            focusedFollowerIndex: clampFollowerIndex(runtime.focusedFollowerIndex, at, followers),
          };
        });
      },

      /**
       * DELEGATES TO `showLane`, so a jump opens or steers the follower pane
       * rather than replacing the Matriarch's transcript. Still a no-op for an
       * unknown lane — legitimate in 'inline' routing mode.
       */
      jumpToLane(podId: PodId, laneId: LaneId): void {
        const runtime = store.state.runtimes[podId];
        if (runtime === undefined) return;
        if (!runtime.lanes.some((lane) => lane.id === laneId)) return;
        store.actions.showLane(podId, laneId);
      },

      /**
       * Re-reads `lanes.list` for the Pod in any lane phase, through the same
       * `loadLanes` the activation uses — so it makes the same synchronous
       * `'loading'`/`null` write, records a failure as the same `IpcError`
       * object, and coalesces into a read already in flight for that Pod,
       * `setActivePod`'s included. It does not activate the Pod, does not
       * touch `activePodId`, and does not read the backfill.
       */
      retryLanes(podId: PodId): Promise<ActionResult<void>> {
        return store.loadLanes(podId);
      },

      // --- Events ---------------------------------------------------------

      /**
       * Pages FORWARD by `afterSeq` and stops on `hasMore === false`, never on
       * a short page — main clamps `limit`, so a page shorter than `pageSize`
       * proves nothing about exhaustion. Concurrent calls coalesce into the
       * one in-flight request.
       */
      async loadMoreEvents(podId: PodId): Promise<ActionResult<void>> {
        const api = store.api;
        if (api === null) return store.failClosed<void>();

        const inflight = store.inflightBackfill.get(podId);
        if (inflight !== undefined) return inflight;

        const backfill = store.state.runtimes[podId]?.backfill;
        // Only a page that actually CAME BACK can prove exhaustion: `hasMore`
        // is false before the first read, and false again after a failed one,
        // so keying the no-op on anything but `'ready'` would make a transient
        // IO error permanent and leave the transcript short forever.
        if (backfill !== undefined && backfill.phase === 'ready' && !backfill.hasMore) {
          return { ok: true, value: undefined };
        }

        const afterSeq = backfill?.cursorSeq ?? 0;
        const limit = backfill?.pageSize ?? store.pageSize;

        const promise = (async (): Promise<ActionResult<void>> => {
          store.patchRuntime(podId, (runtime) => ({
            ...runtime,
            backfill: { ...runtime.backfill, phase: 'loading', error: null },
          }));
          const result = await safeInvoke(() => api.events.read({ podId, afterSeq, limit }));
          if (!result.ok) {
            store.patchRuntime(podId, (runtime) => ({
              ...runtime,
              backfill: { ...runtime.backfill, phase: 'error', error: result.error },
            }));
            return result;
          }
          const page = result.value;
          store.applyEvents(podId, page.events, false);
          const highest = page.events.reduce((max, event) => Math.max(max, event.seq), afterSeq);
          store.patchRuntime(podId, (runtime) => ({
            ...runtime,
            backfill: {
              ...runtime.backfill,
              phase: 'ready',
              error: null,
              cursorSeq: highest,
              hasMore: page.hasMore,
            },
          }));
          return { ok: true, value: undefined };
        })();

        store.inflightBackfill.set(podId, promise);
        try {
          return await promise;
        } finally {
          store.inflightBackfill.delete(podId);
        }
      },

      // --- Routing mode -----------------------------------------------------

      /**
       * Re-reads `app.routingMode()` while the mode is unresolved. A NO-OP once
       * `routingMode` is non-null: the mode is constant from then on. A call
       * while a read is in flight — the startup read included — coalesces into
       * it. Otherwise `routingModeError` becomes `null` HERE, synchronously and
       * before the call, so it is `null` for as long as the read is in flight
       * and a subscriber sees it change even when the bridge answers the same
       * error object twice.
       */
      async retryRoutingMode(): Promise<ActionResult<void>> {
        const api = store.api;
        if (api === null) return store.failClosed<void>();
        if (store.state.routingMode !== null) return { ok: true, value: undefined };
        const inflight = store.inflightRoutingMode;
        if (inflight !== null) return inflight;
        store.update((state) =>
          state.routingModeError === null ? state : { ...state, routingModeError: null },
        );
        return store.loadRoutingMode();
      },

      // --- Permissions ------------------------------------------------------

      /**
       * The card is NOT removed here — only `permissionResolved` removes it.
       * A deny with an empty or whitespace-only reason is rejected LOCALLY, so
       * the message appears next to the field instead of after a round trip.
       */
      async respondToPermission(req: PermissionRespondRequest): Promise<ActionResult<void>> {
        const api = store.api;
        if (api === null) return store.failClosed<void>();

        if (req.decision === 'deny' && (req.reason ?? '').trim() === '') {
          const error: IpcError = {
            code: 'INVALID_ARGUMENT',
            message: 'Give a reason for denying this request.',
          };
          store.patchPermissionCard(req.podId, req.requestId, (card) => ({
            ...card,
            submitting: false,
            error,
          }));
          return { ok: false, error };
        }

        // Safe to call twice: a redundant in-flight duplicate is suppressed
        // here rather than in the card.
        if (store.inflightRespond.has(req.requestId)) return { ok: true, value: undefined };
        store.inflightRespond.add(req.requestId);

        store.patchPermissionCard(req.podId, req.requestId, (card) => ({
          ...card,
          submitting: true,
          error: null,
        }));
        const result = await safeInvoke(() => api.permissions.respond(req));
        store.inflightRespond.delete(req.requestId);
        store.patchPermissionCard(req.podId, req.requestId, (card) => ({
          ...card,
          submitting: false,
          error: result.ok ? null : result.error,
        }));
        return result.ok ? { ok: true, value: undefined } : result;
      },

      // --- Dialogs ----------------------------------------------------------

      /** The ONLY source of a directory path. Cancellation is not an error. */
      async pickDirectory(): Promise<ActionResult<{ path: string | null }>> {
        const api = store.api;
        if (api === null) return store.failClosed<{ path: string | null }>();
        return safeInvoke(() => api.dialog.pickDirectory());
      },
    };
  }

  // --- internals -----------------------------------------------------------

  private applyPod(pod: Pod): void {
    this.update((state) => ({
      ...state,
      pods: state.pods.some((candidate) => candidate.id === pod.id)
        ? state.pods.map((candidate) => (candidate.id === pod.id ? pod : candidate))
        : [...state.pods, pod],
    }));
  }

  private patchPermissionCard(
    podId: PodId,
    requestId: string,
    fn: (card: PermissionCardVm) => PermissionCardVm,
  ): void {
    this.patchRuntime(podId, (runtime) => {
      if (!runtime.pendingPermissions.some((card) => card.requestId === requestId)) return runtime;
      return {
        ...runtime,
        pendingPermissions: runtime.pendingPermissions.map((card) =>
          card.requestId === requestId ? fn(card) : card,
        ),
      };
    });
  }

  /**
   * The lane read for one Pod, from `setActivePod`'s first activation and from
   * `retryLanes`. `lanesPhase` becomes `'loading'` and `lanesError` `null`
   * synchronously, before the call. A failure records the very `IpcError`
   * object and leaves the existing `lanes` as they were; a success replaces
   * them and repairs the pane model.
   *
   * At most one read per Pod is in flight: a call made while one is
   * registered in `inflightLanes` writes nothing and resolves that read's
   * outcome.
   */
  private async loadLanes(podId: PodId): Promise<ActionResult<void>> {
    const api = this.api;
    if (api === null) return this.failClosed<void>();
    const inflight = this.inflightLanes.get(podId);
    if (inflight !== undefined) return inflight;

    const promise = (async (): Promise<ActionResult<void>> => {
      this.patchRuntime(podId, (runtime) => ({
        ...runtime,
        lanesPhase: 'loading',
        lanesError: null,
      }));
      const result = await safeInvoke(() => api.lanes.list(podId));
      if (!result.ok) {
        this.patchRuntime(podId, (runtime) => ({
          ...runtime,
          lanesPhase: 'error',
          lanesError: result.error,
        }));
        return result;
      }
      this.patchRuntime(podId, (runtime) =>
        repairSelection({
          ...runtime,
          lanes: result.value,
          lanesPhase: 'ready',
          lanesError: null,
        }),
      );
      return { ok: true, value: undefined };
    })();

    this.inflightLanes.set(podId, promise);
    try {
      return await promise;
    } finally {
      this.inflightLanes.delete(podId);
    }
  }
}

// ---------------------------------------------------------------------------
// Free helpers
// ---------------------------------------------------------------------------

function isoNow(): Timestamp {
  return new Date().toISOString();
}

/**
 * Whether a lane selection may open a FOLLOWER pane at all
 * (`contracts/lane-pin-removal.ts` section 2, `showLane` step 0).
 */
const OPENS_FOLLOWER_BY_ROUTING_MODE: Readonly<Record<RoutingMode, boolean>> = {
  // Selecting a Calf really does change what a pane shows.
  lanes: true,
  // Spec 4.3 fallback: every event carries the Matriarch's laneId, so a
  // follower pane would show the events the primary already shows, byte for
  // byte, under a different lane title.
  inline: false,
};

/**
 * A lane the Pod knows about — or any lane at all while the list is still
 * empty, so a selection made before `lanes.list` lands is not silently
 * swallowed. `repairSelection` cleans up anything the snapshot disproves.
 */
function isKnownLane(runtime: PodRuntimeState, laneId: LaneId): boolean {
  if (runtime.lanes.length === 0) return true;
  return runtime.lanes.some((lane) => lane.id === laneId);
}

function clearLaneUnread(runtime: PodRuntimeState, laneId: LaneId): PodRuntimeState {
  if ((runtime.laneUnread[laneId] ?? 0) === 0) return runtime;
  return { ...runtime, laneUnread: { ...runtime.laneUnread, [laneId]: 0 } };
}

/** In the primary pane or in any follower pane — i.e. the user can see it. */
function isOnScreen(runtime: PodRuntimeState, laneId: LaneId): boolean {
  return runtime.primaryLaneId === laneId || runtime.followerLaneIds.includes(laneId);
}

/** A valid index into an array of `length`, given a possibly stale one. */
function clampIndexInto(index: number | null, length: number): number {
  if (length === 0) return 0;
  if (index === null || index < 0) return 0;
  return index >= length ? length - 1 : index;
}

/**
 * The focused index after the pane at `removedAt` was closed. Null once no
 * follower is left; otherwise it follows the pane it was on when that pane
 * moved left, and clamps into range when it was the one removed.
 */
function clampFollowerIndex(
  focused: number | null,
  removedAt: number,
  remaining: readonly LaneId[],
): number | null {
  if (remaining.length === 0) return null;
  if (focused === null) return 0;
  return clampIndexInto(focused > removedAt ? focused - 1 : focused, remaining.length);
}

/**
 * Restores the pane model after the lane list is replaced wholesale.
 *
 * THIS IS THE ONLY WRITER OF `primaryLaneId`, and it always writes the same
 * thing: the Matriarch. No action can move another lane into the primary pane
 * (`contracts/renderer-panes.ts` section 1), so a snapshot is the only event
 * that can change which lane is there — it changes it by changing which lane
 * is the Matriarch, or by emptying the list.
 *
 * It restores all three UNIQUENESS rules for the followers:
 *   - `primaryLaneId` is never a member of `followerLaneIds`;
 *   - `followerLaneIds` contains no duplicates;
 *   - every member names a lane in the snapshot.
 * plus today's `MAX_FOLLOWER_PANES` cap, so a state that arrived over it — a
 * future cap reduction, a replayed push — is trimmed rather than asserted at.
 */
function repairSelection(runtime: PodRuntimeState): PodRuntimeState {
  const known = new Set(runtime.lanes.map((lane) => lane.id));
  // `matriarchOf` is the rail's index 0, which is the Matriarch when there is
  // one and the earliest Calf when the snapshot has no Matriarch at all — so
  // this is null only when the list is empty, exactly as the contract says.
  const primary = matriarchOf(runtime.lanes)?.id ?? null;

  const followers: LaneId[] = [];
  for (const laneId of runtime.followerLaneIds) {
    if (!known.has(laneId)) continue;
    if (laneId === primary) continue;
    if (followers.includes(laneId)) continue;
    if (followers.length >= MAX_FOLLOWER_PANES) break;
    followers.push(laneId);
  }

  const focused = followers.length === 0 ? null : clampIndexInto(runtime.focusedFollowerIndex, followers.length);

  if (
    primary === runtime.primaryLaneId &&
    focused === runtime.focusedFollowerIndex &&
    sameLaneIds(followers, runtime.followerLaneIds)
  ) {
    return runtime;
  }
  return {
    ...runtime,
    primaryLaneId: primary,
    followerLaneIds: followers,
    focusedFollowerIndex: focused,
  };
}

function sameLaneIds(a: readonly LaneId[], b: readonly LaneId[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((laneId, index) => laneId === b[index]);
}

/**
 * TODAY'S POLICY, ASSERTED RATHER THAN ENCODED — the two statements
 * `contracts/renderer-panes.ts` section 1 makes about a shape that could
 * express more than today's behaviour, checked on every runtime write.
 *
 * They are assertions and not types because the SHAPE is deliberately general:
 * a list and an index can carry two Calves the day the cap moves, and the cost
 * of that generality is that "one follower, Matriarch always primary" has to
 * be stated somewhere. Here.
 *
 * A violation is a logic error in this file, not bad input, so it throws
 * rather than repairing: silently correcting it is how the previous session
 * shipped guards that proved nothing.
 */
export function assertPanePolicy(runtime: PodRuntimeState): void {
  if (runtime.lanes.length > 0) {
    const expected = matriarchOf(runtime.lanes)?.id ?? null;
    if (runtime.primaryLaneId !== expected) {
      throw new Error(
        `Pane policy violated: primaryLaneId is ${String(runtime.primaryLaneId)} but the ` +
          `Matriarch is ${String(expected)}. No action may write primaryLaneId.`,
      );
    }
  }
  if (runtime.followerLaneIds.length > MAX_FOLLOWER_PANES) {
    throw new Error(
      `Pane policy violated: ${runtime.followerLaneIds.length} follower panes, ` +
        `cap is ${MAX_FOLLOWER_PANES}.`,
    );
  }
}

/**
 * The single choke point through which every IPC call passes.
 *
 * The frozen `ipc.ts` promises that no invoke channel rejects. This does not
 * TRUST that promise: a preload bug that rejects, throws synchronously, or
 * answers something that is not an envelope becomes `{ ok: false }` with code
 * `INTERNAL` rather than an unhandled rejection inside a click handler.
 */
export async function safeInvoke<T>(call: () => Promise<IpcResult<T>>): Promise<IpcResult<T>> {
  try {
    const result = await call();
    if (
      typeof result === 'object' &&
      result !== null &&
      'ok' in result &&
      typeof (result as { ok: unknown }).ok === 'boolean'
    ) {
      return result;
    }
    return {
      ok: false,
      error: internalError('The Orcastrate bridge returned a malformed response.'),
    };
  } catch (cause) {
    return { ok: false, error: internalError(describeThrown(cause)) };
  }
}

function describeThrown(cause: unknown): string {
  if (cause instanceof Error && cause.message !== '') return cause.message;
  if (typeof cause === 'string' && cause !== '') return cause;
  return 'The Orcastrate bridge failed unexpectedly.';
}
