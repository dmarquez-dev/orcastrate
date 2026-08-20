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
  PermissionMode,
  Pod,
  PodId,
  Timestamp,
} from '@shared/contracts/events';
import type {
  CreatePodRequest,
  IpcError,
  IpcResult,
  LaneChangedPush,
  OrcastrateApi,
  PermissionRequestedPush,
  PermissionResolvedPush,
  PermissionRespondRequest,
  PodEventPush,
  PodStatusPush,
  Unsubscribe,
  UpdatePodRequest,
} from '@shared/contracts/ipc';
import type { RoutingMode } from '@shared/contracts/lane-router';

import type {
  ActionResult,
  BackfillState,
  LoadPhase,
  PermissionCardVm,
  WorkspaceActions,
} from '../contracts/renderer-state';

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
  selectedLaneId: LaneId | null;
  pinnedLaneId: LaneId | null;
  transcripts: Record<LaneId, LaneTranscriptState | undefined>;
  backfill: BackfillState;
  pendingPermissions: PermissionCardVm[];
  composerText: string;
  composerSending: boolean;
  composerError: IpcError | null;
  /** `pods.open` succeeded and no `close`/beach has followed. */
  opened: boolean;
  unreadEventCount: number;
  laneUnread: Record<LaneId, number>;
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

export function newRuntime(
  phase: LoadPhase,
  error: IpcError | null,
  pageSize: number = DEFAULT_BACKFILL_PAGE_SIZE,
): PodRuntimeState {
  return {
    lanesPhase: phase,
    lanes: [],
    lanesError: error,
    selectedLaneId: null,
    pinnedLaneId: null,
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
    opened: false,
    unreadEventCount: 0,
    laneUnread: {},
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
  private readonly inflightRespond = new Set<string>();

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
      if (next === existing) return state;
      return { ...state, runtimes: { ...state.runtimes, [podId]: next } };
    });
  }

  private bridgeError(): IpcError | null {
    return this.api === null ? internalError(NO_BRIDGE_MESSAGE) : null;
  }

  // --- lifecycle -----------------------------------------------------------

  /**
   * Mount. Subscribes to all five push channels exactly once and issues the
   * two startup reads together — they are independent, so chaining them would
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

  /** Read once at startup, then constant for the app's lifetime. */
  private async loadRoutingMode(): Promise<void> {
    const api = this.api;
    if (api === null) return;
    const result = await safeInvoke(() => api.app.routingMode());
    if (!result.ok) return;
    const mode = result.value;
    this.update((state) => (state.routingMode === mode ? state : { ...state, routingMode: mode }));
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
        if (live && grew > 0 && laneId !== runtime.selectedLaneId) {
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
    if (push.status === 'beached') {
      this.patchRuntime(push.podId, (runtime) =>
        runtime.opened ? { ...runtime, opened: false } : runtime,
      );
    }
  }

  /**
   * `laneChanged` is a SNAPSHOT, not a delta: the list is replaced wholesale,
   * so a lane the push omits disappears from the rail. Selection and pin are
   * repaired against the new list rather than left dangling.
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
        // "Creates the Pod row AND opens its process." A failed open leaves
        // the row in place, unopened, and reports the error verbatim.
        const opened = await safeInvoke(() => api.pods.open(pod.id));
        if (!opened.ok) return opened;
        store.applyPod(opened.value);
        store.patchRuntime(pod.id, (runtime) => ({ ...runtime, opened: true }));
        return { ok: true, value: opened.value };
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

      async deletePod(podId: PodId): Promise<ActionResult<void>> {
        const api = store.api;
        if (api === null) return store.failClosed<void>();
        const result = await safeInvoke(() => api.pods.delete(podId));
        if (!result.ok) return result;
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
        return { ok: true, value: undefined };
      },

      async openPod(podId: PodId): Promise<ActionResult<Pod>> {
        const api = store.api;
        if (api === null) return store.failClosed<Pod>();
        const result = await safeInvoke(() => api.pods.open(podId));
        if (!result.ok) return result;
        store.applyPod(result.value);
        store.patchRuntime(podId, (runtime) => ({ ...runtime, opened: true }));
        return result;
      },

      async closePod(podId: PodId): Promise<ActionResult<void>> {
        const api = store.api;
        if (api === null) return store.failClosed<void>();
        const result = await safeInvoke(() => api.pods.close(podId));
        if (!result.ok) return result;
        store.patchRuntime(podId, (runtime) => ({ ...runtime, opened: false }));
        return { ok: true, value: undefined };
      },

      async reconnectPod(podId: PodId): Promise<ActionResult<Pod>> {
        const api = store.api;
        if (api === null) return store.failClosed<Pod>();
        const result = await safeInvoke(() => api.pods.reconnect(podId));
        if (!result.ok) return result;
        store.applyPod(result.value);
        store.patchRuntime(podId, (runtime) => ({ ...runtime, opened: true }));
        return result;
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

      async setPermissionMode(podId: PodId, mode: PermissionMode): Promise<ActionResult<void>> {
        const api = store.api;
        if (api === null) return store.failClosed<void>();
        const result = await safeInvoke(() => api.pods.setPermissionMode(podId, mode));
        if (!result.ok) return result;
        store.update((state) => ({
          ...state,
          pods: state.pods.map((pod) =>
            pod.id === podId ? { ...pod, permissionMode: mode } : pod,
          ),
        }));
        return { ok: true, value: undefined };
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

      selectLane(podId: PodId, laneId: LaneId): void {
        store.patchRuntime(podId, (runtime) => {
          if (!isKnownLane(runtime, laneId)) return runtime;
          if (runtime.selectedLaneId === laneId) return clearLaneUnread(runtime, laneId);
          // Selecting the PINNED lane swaps the panes rather than closing the
          // split or rendering the same lane twice.
          const pinned =
            runtime.pinnedLaneId === laneId ? runtime.selectedLaneId : runtime.pinnedLaneId;
          return clearLaneUnread(
            { ...runtime, selectedLaneId: laneId, pinnedLaneId: pinned },
            laneId,
          );
        });
      },

      pinLane(podId: PodId, laneId: LaneId): void {
        store.patchRuntime(podId, (runtime) => {
          if (!isKnownLane(runtime, laneId)) return runtime;
          // Pinning the selected lane would render it twice: no-op.
          if (runtime.selectedLaneId === laneId) return runtime;
          if (runtime.pinnedLaneId === laneId) return runtime;
          // At most one lane is pinned: this replaces any previous pin.
          return { ...runtime, pinnedLaneId: laneId };
        });
      },

      unpinLane(podId: PodId): void {
        store.patchRuntime(podId, (runtime) =>
          runtime.pinnedLaneId === null ? runtime : { ...runtime, pinnedLaneId: null },
        );
      },

      /** No-op for an unknown lane — legitimate in 'inline' routing mode. */
      jumpToLane(podId: PodId, laneId: LaneId): void {
        const runtime = store.state.runtimes[podId];
        if (runtime === undefined) return;
        if (!runtime.lanes.some((lane) => lane.id === laneId)) return;
        store.actions.selectLane(podId, laneId);
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

  private async loadLanes(podId: PodId): Promise<void> {
    const api = this.api;
    if (api === null) return;
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
      return;
    }
    this.patchRuntime(podId, (runtime) =>
      repairSelection({
        ...runtime,
        lanes: result.value,
        lanesPhase: 'ready',
        lanesError: null,
      }),
    );
  }
}

// ---------------------------------------------------------------------------
// Free helpers
// ---------------------------------------------------------------------------

function isoNow(): Timestamp {
  return new Date().toISOString();
}

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

/**
 * Restores the selection invariants after the lane list is replaced:
 * a selection defaults to the Matriarch, a pin or selection naming a lane the
 * snapshot dropped is cleared, and `pinnedLaneId !== selectedLaneId` holds.
 */
function repairSelection(runtime: PodRuntimeState): PodRuntimeState {
  const known = new Set(runtime.lanes.map((lane) => lane.id));
  let selected = runtime.selectedLaneId;
  let pinned = runtime.pinnedLaneId;

  if (selected !== null && !known.has(selected)) selected = null;
  if (pinned !== null && !known.has(pinned)) pinned = null;
  if (selected === null) selected = matriarchOf(runtime.lanes)?.id ?? null;
  if (pinned !== null && pinned === selected) pinned = null;

  if (selected === runtime.selectedLaneId && pinned === runtime.pinnedLaneId) return runtime;
  return { ...runtime, selectedLaneId: selected, pinnedLaneId: pinned };
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
