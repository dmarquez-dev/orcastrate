/**
 * `WorkspaceProvider` and the seven focused hooks — the whole access path the
 * frozen `renderer-state.ts` declares. Consumers import from here (or from the
 * `state/` barrel) and never from `store.ts`.
 *
 * WHAT LIVES WHERE:
 *   - `store.ts` holds RAW state and owns every IPC call.
 *   - this file DERIVES the view models on each render — ordering, unread
 *     clamping, `elapsedMs`, `highWaterSeq`, `opened`, `disabled`. None of
 *     them is stored, so none of them can go stale.
 *
 * SUBSCRIPTION GUARANTEE: the provider subscribes to all five push channels
 * exactly once on mount and calls every returned `Unsubscribe` on unmount. No
 * consumer subscribes.
 */

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';

import type { Lane, LaneId, PodId, PodStatus } from '@shared/contracts/events';
import type { OrcastrateApi } from '@shared/contracts/ipc';
import type { RoutingMode } from '@shared/contracts/lane-router';

import type {
  ComposerState,
  Loadable,
  LaneRowVm,
  PermissionCardVm,
  PodListView,
  PodSessionView,
  PodTabVm,
  TranscriptView,
  WorkspaceActions,
  WorkspaceProviderProps,
  WorkspaceStore,
} from '../contracts/renderer-state';

import { highWaterSeq } from './merge';
import { PanelProvider } from './panel-provider';
import { orderLanes, orderPods } from './ordering';
import { WorkspaceStateStore, type PodRuntimeState, type WorkspaceState } from './store';

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const WorkspaceContext = createContext<WorkspaceStore | null>(null);

/** How often a RUNNING lane's `elapsedMs` is recomputed. */
const ELAPSED_TICK_MS = 1000;

const EMPTY_CARDS: PermissionCardVm[] = [];

/**
 * The api the provider will use: the test seam when supplied, otherwise the
 * preload bridge. `null` when neither exists — the contract requires the
 * provider to render its children with every `Loadable` in phase `'error'`
 * rather than throw, because a throw during init blanks the window with no
 * diagnosis.
 *
 * This expression is the ONLY reference to `window.orcastrate` in
 * `src/renderer/**`.
 */
function resolveApi(supplied: OrcastrateApi | undefined): OrcastrateApi | null {
  if (supplied !== undefined) return supplied;
  if (typeof window === 'undefined') return null;
  // Typed as always present by the frozen global augmentation, but genuinely
  // absent when the preload script did not run.
  const bridge = window.orcastrate as OrcastrateApi | undefined;
  return bridge ?? null;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function WorkspaceProvider({ children, api }: WorkspaceProviderProps): ReactNode {
  // Resolved ONCE, here, and handed to both stores. `PanelProvider` never
  // reaches for the bridge itself, which is what keeps the whole state layer
  // down to a single reference to it.
  const resolved = useMemo(() => resolveApi(api), [api]);

  // One store per api identity. Constructing it never touches IPC; `start()`
  // below is the explicit lifecycle that does.
  const store = useMemo(() => new WorkspaceStateStore(resolved), [resolved]);

  const state = useSyncExternalStore(store.subscribe, store.getState, store.getState);

  useEffect(() => {
    store.start();
    return () => {
      store.stop();
    };
  }, [store]);

  const activeRuntime = state.activePodId === null ? undefined : state.runtimes[state.activePodId];
  const hasRunningLane =
    activeRuntime !== undefined && activeRuntime.lanes.some((lane) => lane.status === 'running');
  // The timer is owned here, once, rather than by each row: a finished lane's
  // elapsed time is frozen and stops re-rendering.
  const nowMs = useElapsedClock(hasRunningLane);

  const value = useMemo<WorkspaceStore>(
    () => ({
      pods: derivePodList(state),
      activePodId: state.activePodId,
      session: deriveSession(state, nowMs),
      routingMode: state.routingMode,
      actions: store.actions,
    }),
    [state, nowMs, store],
  );

  return (
    <WorkspaceContext.Provider value={value}>
      <PanelProvider api={resolved}>{children}</PanelProvider>
    </WorkspaceContext.Provider>
  );
}

/**
 * `Date.now()` on a one-second cadence, and only while something is actually
 * running. When nothing runs the value is frozen and no interval exists, so an
 * idle workspace re-renders zero times a second.
 */
function useElapsedClock(running: boolean): number {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!running) return;
    setNowMs(Date.now());
    const handle = setInterval(() => setNowMs(Date.now()), ELAPSED_TICK_MS);
    return () => {
      clearInterval(handle);
    };
  }, [running]);

  return nowMs;
}

// ---------------------------------------------------------------------------
// Derivation
// ---------------------------------------------------------------------------

/**
 * THE ONE DERIVATION OF OPENNESS, and the only place in the renderer that
 * decides it.
 *
 * Openness is a fact about main's session registry, and `status` is the only
 * field that reports it. Positive form on purpose: a status this build does
 * not recognise reads as not-open, which shows a redundant run control rather
 * than enabling a composer over a dead process. Offering to type into a Pod
 * that may not be running is the worse error.
 */
export const isPodOpen = (status: PodStatus): boolean =>
  status === 'idle' || status === 'running' || status === 'waiting';

function derivePodList(state: WorkspaceState): PodListView {
  const value = orderPods(state.pods).map<PodTabVm>((pod) => {
    const runtime = state.runtimes[pod.id];
    const pending = runtime?.pendingPermissions.length ?? 0;
    const active = pod.id === state.activePodId;
    return {
      pod,
      active,
      // Derived from the Pod row, never from `runtime`. The old
      // `runtime?.opened ?? false` also manufactured "not open" for a merely
      // MISSING runtime record — a different fact wearing the same answer.
      opened: isPodOpen(pod.status),
      status: pod.status,
      // True for a BACKGROUNDED Pod too: that is the whole point of the badge.
      awaitingPermission: pending > 0,
      pendingPermissionCount: pending,
      // Zero for the active Pod at all times.
      unreadEventCount: active ? 0 : (runtime?.unreadEventCount ?? 0),
    };
  });

  return { phase: state.podsPhase, value, error: state.podsError };
}

function deriveSession(state: WorkspaceState, nowMs: number): PodSessionView | undefined {
  const podId = state.activePodId;
  if (podId === null) return undefined;
  const runtime = state.runtimes[podId];
  if (runtime === undefined) return undefined;
  const pod = state.pods.find((candidate) => candidate.id === podId);

  return {
    podId,
    lanes: deriveLaneRail(runtime, nowMs),
    primaryLaneId: runtime.primaryLaneId,
    followerLaneIds: runtime.followerLaneIds,
    focusedFollowerIndex: runtime.focusedFollowerIndex,
    transcripts: deriveTranscripts(runtime),
    backfill: runtime.backfill,
    pendingPermissions: runtime.pendingPermissions,
    // A Pod the state layer cannot find is not open, so the fallback is
    // `'closed'` rather than `'idle'`.
    composer: deriveComposer(podId, runtime, pod?.status ?? 'closed'),
  };
}

/**
 * THE RAIL ROW NO LONGER CARRIES THE PIN-GATING FIELD, and this function no
 * longer needs `routingMode` (`contracts/lane-pin-removal.ts` sections 1 and
 * 2). The pin control is deleted, and the two rules that field encoded now
 * live where they cannot be forgotten by a consumer:
 *   - the Matriarch is structurally undisplaceable — already `showLane`
 *     branch 2, which clears unread and opens no follower;
 *   - 'inline' routing mode opens no follower at all — now `showLane` step 0.
 * Both are properties of the ACTION surface, so `jumpToLane` inherits them by
 * delegating, which a view-model field could never have given it.
 */
function deriveLaneRail(runtime: PodRuntimeState, nowMs: number): Loadable<LaneRowVm[]> {
  const followers = runtime.followerLaneIds;
  const focusedIndex = runtime.focusedFollowerIndex;
  const focusedLaneId =
    focusedIndex === null ? null : (followers[focusedIndex] ?? null);

  const value = orderLanes(runtime.lanes).map<LaneRowVm>((lane) => {
    const isMatriarch = lane.kind === 'matriarch';
    const inPrimaryPane = lane.id === runtime.primaryLaneId;
    const inFollowerPane = followers.includes(lane.id);
    return {
      lane,
      isMatriarch,
      inPrimaryPane,
      inFollowerPane,
      focusedFollower: focusedLaneId !== null && lane.id === focusedLaneId,
      agentType: lane.subagentType ?? 'matriarch',
      description: isMatriarch ? null : lane.description,
      status: lane.status,
      elapsedMs: elapsedMsOf(lane, nowMs),
      // Zero for any lane that is ON SCREEN, in either pane, at all times.
      unreadEventCount:
        inPrimaryPane || inFollowerPane ? 0 : (runtime.laneUnread[lane.id] ?? 0),
      awaitingPermission: runtime.pendingPermissions.some((card) => card.laneId === lane.id),
    };
  });

  return { phase: runtime.lanesPhase, value, error: runtime.lanesError };
}

function elapsedMsOf(lane: Lane, nowMs: number): number {
  const started = Date.parse(lane.startedAt);
  if (Number.isNaN(started)) return 0;
  const ended = lane.endedAt === null ? nowMs : Date.parse(lane.endedAt);
  if (Number.isNaN(ended)) return 0;
  return Math.max(0, ended - started);
}

function deriveTranscripts(
  runtime: PodRuntimeState,
): Readonly<Record<LaneId, TranscriptView | undefined>> {
  const out: Record<LaneId, TranscriptView | undefined> = {};
  for (const [laneId, transcript] of Object.entries(runtime.transcripts)) {
    if (transcript === undefined) continue;
    out[laneId] = {
      laneId,
      events: transcript.events,
      phase: transcript.phase,
      error: transcript.error,
      highWaterSeq: highWaterSeq(transcript.events),
    };
  }
  return out;
}

function deriveComposer(
  podId: PodId,
  runtime: PodRuntimeState,
  status: PodStatus,
): ComposerState {
  // Most specific reason first: a beached Pod is also not opened, and saying
  // "not opened" there would send the user to the wrong affordance.
  const disabledReason: ComposerState['disabledReason'] =
    status === 'beached'
      ? 'beached'
      : !isPodOpen(status)
        ? 'not-opened'
        : runtime.pendingPermissions.length > 0
          ? 'awaiting-permission'
          : null;

  return {
    podId,
    text: runtime.composerText,
    sending: runtime.composerSending,
    error: runtime.composerError,
    disabled: disabledReason !== null,
    disabledReason,
  };
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export function useWorkspace(): WorkspaceStore {
  const value = useContext(WorkspaceContext);
  if (value === null) {
    throw new Error(
      'useWorkspace must be rendered inside <WorkspaceProvider>. See ' +
        'src/renderer/src/state/workspace-provider.tsx.',
    );
  }
  return value;
}

/** The Pod bar's whole data dependency. */
export function usePods(): PodListView {
  return useWorkspace().pods;
}

/** Undefined when no Pod is active. */
export function usePodSession(): PodSessionView | undefined {
  return useWorkspace().session;
}

/** Lane rail rows for the active Pod, in the guaranteed order. */
export function useLaneRail(): Loadable<LaneRowVm[]> {
  const session = usePodSession();
  return useMemo<Loadable<LaneRowVm[]>>(
    () => session?.lanes ?? { phase: 'idle', value: [], error: null },
    [session],
  );
}

/**
 * One lane's transcript. A lane with no events yet gets an empty `'idle'`
 * view rather than `undefined`, so the pane never branches on existence.
 */
export function useTranscript(laneId: LaneId | null): TranscriptView {
  const session = usePodSession();
  const existing = laneId === null ? undefined : session?.transcripts[laneId];
  return useMemo<TranscriptView>(
    () =>
      existing ?? {
        laneId: laneId ?? '',
        events: [],
        phase: 'idle',
        error: null,
        highWaterSeq: 0,
      },
    [existing, laneId],
  );
}

/** The active Pod's composer. Undefined when no Pod is active. */
export function useComposer(): ComposerState | undefined {
  return usePodSession()?.composer;
}

/** The unanswered cards FOR ONE LANE, oldest first. `[]` for any other lane. */
export function usePermissionCards(laneId: LaneId | null): PermissionCardVm[] {
  const session = usePodSession();
  const pending = session?.pendingPermissions;
  return useMemo<PermissionCardVm[]>(() => {
    if (laneId === null || pending === undefined) return EMPTY_CARDS;
    const cards = pending.filter((card) => card.laneId === laneId);
    return cards.length === 0 ? EMPTY_CARDS : cards;
  }, [pending, laneId]);
}

/** Referentially stable for the provider's lifetime. */
export function useWorkspaceActions(): WorkspaceActions {
  return useWorkspace().actions;
}
