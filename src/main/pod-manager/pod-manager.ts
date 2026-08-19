/**
 * PodManager — the assembly point.
 *
 * It owns the live `PodRunner` set (exactly one per OPEN Pod, keyed by PodId),
 * the per-Pod `LaneRouter`, the pending permission prompts, and the one place
 * where a stream message becomes a persisted, sequenced, pushed event:
 *
 *     PodRunner.onMessage -> LaneRouter.ingest -> EventStore.appendMany
 *                         -> push:podEvent (carrying the store-assigned seq)
 *
 * Nothing here imports `electron`. The window transport arrives as `Pushes`,
 * the SDK arrives as `CreatePodRunner`, and the filesystem check arrives as
 * `isDirectory` — so the whole pipeline runs in a plain Node test with an
 * in-memory store and a fixture-driven fake SDK.
 *
 * ---------------------------------------------------------------------------
 * Three hazards this file exists to absorb
 * ---------------------------------------------------------------------------
 * 1. LANE RESTAMPING. `PodRunner` has no lane model, so its synthetic events
 *    carry `UNROUTED_LANE_ID` (the empty string) in `NewEvent.laneId`.
 *    `events.lane_id` has a foreign key to `lanes(id)` with `foreign_keys = ON`
 *    and every real lane id is a uuid, so an unrestamped event would be
 *    rejected as CONFLICT at append time. `#routeLane` restamps at this
 *    boundary — before the store ever sees the row — and asserts rather than
 *    relying on the FK to catch it late.
 *
 * 2. LANE PERSISTENCE KEYS OFF `payload.lane.id`, NEVER `event.laneId`. In
 *    'inline' mode a `lane_opened` event carries the MATRIARCH's `laneId` with
 *    a CALF payload, which is exactly what the contract specifies. Keying the
 *    `createLane` call off `event.laneId` would misfile every Calf onto the
 *    Matriarch's row.
 *
 * 3. NOT EVERY RUNNER REJECTION HAS `.code`. `setPermissionMode` and the
 *    PodRunner constructor throw a bare `RangeError` for a mode outside the
 *    contract's union. Nothing here reads `.code` off an unproven error; the
 *    classification lives in `../ipc/errors.ts` and covers `RangeError`.
 */

import { statSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

import type { EventStore } from '../../shared/contracts/event-store';
import type {
  AgentId,
  Lane,
  LaneId,
  NewEvent,
  NormalizedEvent,
  PermissionMode,
  Pod,
  PodId,
  PodStatus,
} from '../../shared/contracts/events';
import type { LaneRouter, RoutingMode } from '../../shared/contracts/lane-router';
import type {
  CreatePodRequest,
  PermissionRespondRequest,
  ReadEventsRequest,
  ReadEventsResponse,
  UpdatePodRequest,
} from '../../shared/contracts/ipc';
import type {
  CreatePodRunner,
  PermissionAnswer,
  PermissionHandler,
  PermissionPrompt,
  PodRunner,
  PodRunnerHandlers,
} from '../../shared/contracts/pod-runner';

import { cwdMissing, IpcFailure, notFound } from '../ipc/errors';
import { createLaneRouter } from '../lane';
import { UNROUTED_LANE_ID } from '../pod';

import type { Pushes } from './pushes';

/** The reason handed to the model when a prompt dies with its turn. */
const ABORTED_REASON = 'the turn was interrupted before the user answered';

/**
 * The answer a prompt settles with when its turn is interrupted. The frozen
 * `PermissionAnswer` union has no 'aborted' member, and it must not grow one,
 * so an abort FAILS CLOSED as a denial. The renderer still learns the
 * difference: `push:permissionResolved` carries `outcome: 'aborted'`.
 */
const ABORTED_ANSWER: PermissionAnswer = { decision: 'deny', reason: ABORTED_REASON };

export interface PodManagerDeps {
  store: EventStore;
  createRunner: CreatePodRunner;
  push: Pushes;
  routingMode: RoutingMode;
  /** Injectable so fixture replay produces stable ids. */
  newId?: () => string;
  /** Injectable clock. */
  now?: () => string;
  /** Injectable filesystem probe for the `cwd` capability check. */
  isDirectory?: (path: string) => boolean;
  /** Where non-fatal pipeline failures go. */
  logger?: Pick<Console, 'warn' | 'error'>;
}

/**
 * What the IPC handlers require. Declared as an interface, not as the class,
 * so criterion 3's "force an internal throw in every handler" test can supply
 * a stub that throws from every member.
 */
export interface PodManagerApi {
  readonly routingMode: RoutingMode;
  listPods(): Pod[];
  createPod(req: CreatePodRequest): Pod;
  updatePod(req: UpdatePodRequest): Pod;
  deletePod(podId: PodId): Promise<void>;
  openPod(podId: PodId): Promise<Pod>;
  closePod(podId: PodId): Promise<void>;
  reconnectPod(podId: PodId): Promise<Pod>;
  send(podId: PodId, text: string): Promise<void>;
  interrupt(podId: PodId): Promise<void>;
  setPermissionMode(podId: PodId, mode: PermissionMode): Promise<void>;
  listLanes(podId: PodId): Lane[];
  readEvents(req: ReadEventsRequest): ReadEventsResponse;
  respondPermission(req: PermissionRespondRequest): void;
  disposeAll(): Promise<void>;
}

interface PodSession {
  podId: PodId;
  runner: PodRunner;
  router: LaneRouter;
  matriarchLaneId: LaneId;
  /** Lane ids this manager has already written an `agentId` for (see E4). */
  persistedAgentIds: Map<LaneId, AgentId>;
  /** Every lane id the store is known to hold for this Pod. */
  knownLanes: Set<LaneId>;
  /**
   * This session's unanswered permission prompts, keyed by `requestId`.
   *
   * SCOPED TO THE SESSION ON PURPOSE. `requestId` is the SDK control_request
   * envelope's `request_id`, which is unique only within ONE worker connection
   * — and one Pod is one worker. Running many Pods at once is the product's
   * premise, so a manager-wide map keyed by the bare `requestId` lets two Pods
   * collide: the second prompt overwrites the first, and the first can then
   * never be answered, never be found by the abort sweep, and hangs until the
   * SDK's own signal fires. Living on the session also means a prompt cannot
   * outlive the session that raised it.
   */
  pending: Map<string, PendingPermission>;
  disposed: boolean;
}

interface PendingPermission {
  podId: PodId;
  requestId: string;
  /** The session map this entry lives in. */
  owner: Map<string, PendingPermission>;
  resolve: (answer: PermissionAnswer) => void;
  release: () => void;
  settled: boolean;
}

export class PodManager implements PodManagerApi {
  readonly routingMode: RoutingMode;

  readonly #store: EventStore;
  readonly #createRunner: CreatePodRunner;
  readonly #push: Pushes;
  readonly #newId: () => string;
  readonly #now: () => string;
  readonly #isDirectory: (path: string) => boolean;
  readonly #log: Pick<Console, 'warn' | 'error'>;

  /** Criterion 6: the live runner set. One entry per OPEN Pod, keyed by PodId. */
  readonly #sessions = new Map<PodId, PodSession>();
  /** In-flight `openPod` calls, so two concurrent opens cannot race a second runner. */
  readonly #opening = new Map<PodId, Promise<Pod>>();

  constructor(deps: PodManagerDeps) {
    this.#store = deps.store;
    this.#createRunner = deps.createRunner;
    this.#push = deps.push;
    this.routingMode = deps.routingMode;
    this.#newId = deps.newId ?? ((): string => randomUUID());
    this.#now = deps.now ?? ((): string => new Date().toISOString());
    this.#isDirectory = deps.isDirectory ?? defaultIsDirectory;
    this.#log = deps.logger ?? console;
  }

  // -------------------------------------------------------------------------
  // Pod CRUD
  // -------------------------------------------------------------------------

  listPods(): Pod[] {
    return this.#store.listPods();
  }

  /**
   * Criterion 5: `cwd` is not a capability the renderer may assert. It is
   * accepted only after main proves it resolves to a real directory; anything
   * else is CWD_MISSING, never a spawn attempt.
   */
  createPod(req: CreatePodRequest): Pod {
    if (!this.#isDirectory(req.cwd)) {
      throw cwdMissing(`cwd does not exist or is not a directory: ${req.cwd}`);
    }
    const tabOrder = this.#store.listPods().length;
    return this.#store.createPod({
      id: this.#newId(),
      title: req.title,
      cwd: req.cwd,
      permissionMode: req.permissionMode,
      envOverrides: req.envOverrides ?? {},
      tabOrder,
    });
  }

  updatePod(req: UpdatePodRequest): Pod {
    const patch: Parameters<EventStore['updatePod']>[1] = {};
    if (req.title !== undefined) patch.title = req.title;
    if (req.tabOrder !== undefined) patch.tabOrder = req.tabOrder;
    if (req.envOverrides !== undefined) patch.envOverrides = req.envOverrides;
    if (req.permissionMode !== undefined) patch.permissionMode = req.permissionMode;

    const pod = this.#store.updatePod(req.podId, patch);

    // A mode change on an OPEN Pod must also reach the live CLI, or the stored
    // mode and the running session silently disagree. A running session that
    // refuses the change surfaces through `pod:setPermissionMode`; here it is
    // best-effort so the row update is not lost.
    if (req.permissionMode !== undefined) {
      const session = this.#sessions.get(req.podId);
      if (session) {
        void session.runner.setPermissionMode(req.permissionMode).catch((err: unknown) => {
          this.#log.warn(`[orcastrate] could not apply permission mode to ${req.podId}`, err);
        });
      }
    }
    return pod;
  }

  async deletePod(podId: PodId): Promise<void> {
    await this.#dispose(podId);
    this.#store.deletePod(podId);
  }

  // -------------------------------------------------------------------------
  // Session lifecycle
  // -------------------------------------------------------------------------

  /**
   * Criterion 6: opening an already-open Pod returns the same Pod and does NOT
   * create a second runner. Two concurrent opens share one in-flight promise
   * for the same reason.
   */
  async openPod(podId: PodId): Promise<Pod> {
    const pod = this.#requirePod(podId);
    if (this.#sessions.has(podId)) return pod;

    const inflight = this.#opening.get(podId);
    if (inflight) return inflight;

    const started = this.#start(pod, false).finally(() => {
      this.#opening.delete(podId);
    });
    this.#opening.set(podId, started);
    return started;
  }

  /**
   * Criterion 10: re-open a Beached Pod against Claude Code's own session id,
   * passed as the SDK's `resume` option (the contract's correction #3 — it is
   * `resume`, not `resumeSessionId`). A Pod that never reached its first turn
   * has no `ccSessionId`; that reconnects as a fresh session rather than
   * failing, because there is nothing to resume.
   */
  async reconnectPod(podId: PodId): Promise<Pod> {
    this.#requirePod(podId);
    await this.#dispose(podId);
    const pod = this.#requirePod(podId);
    return this.#start(pod, true);
  }

  async closePod(podId: PodId): Promise<void> {
    this.#requirePod(podId);
    await this.#dispose(podId);
    const pod = this.#store.getPod(podId);
    if (pod !== null && pod.status !== 'beached') {
      this.#store.updatePod(podId, { status: 'idle' });
      this.#push.podStatus({ podId, status: 'idle' });
    }
  }

  /** App quit: every runner disposed, every prompt settled. */
  async disposeAll(): Promise<void> {
    await Promise.all([...this.#sessions.keys()].map((podId) => this.#dispose(podId)));
  }

  async #start(pod: Pod, resume: boolean): Promise<Pod> {
    const matriarchLaneId = this.#ensureMatriarchLane(pod.id);
    const router = createLaneRouter({
      podId: pod.id,
      matriarchLaneId,
      mode: this.routingMode,
      newLaneId: this.#newId,
      now: this.#now,
    });

    const lanes = this.#store.listLanes(pod.id);
    router.restore({ lanes });

    const session: PodSession = {
      podId: pod.id,
      router,
      matriarchLaneId,
      persistedAgentIds: new Map(
        lanes
          .filter((lane): lane is Lane & { agentId: AgentId } => lane.agentId !== null)
          .map((lane) => [lane.id, lane.agentId] as const),
      ),
      knownLanes: new Set(lanes.map((lane) => lane.id)),
      pending: new Map(),
      disposed: false,
      runner: this.#createRunner({
        podId: pod.id,
        cwd: pod.cwd,
        permissionMode: pod.permissionMode,
        envOverrides: pod.envOverrides,
        forwardSubagentText: true,
        ...(resume && pod.ccSessionId !== null ? { resume: pod.ccSessionId } : {}),
      }),
    };

    // Registered BEFORE start() so a message that arrives during startup has a
    // session to route into, and so a concurrent open sees the slot taken.
    this.#sessions.set(pod.id, session);

    try {
      await session.runner.start(this.#handlersFor(session), this.#permissionHandlerFor(session));
    } catch (err) {
      this.#sessions.delete(pod.id);
      session.disposed = true;
      // Spec 8: a Pod that cannot come up is Beached, not merely errored. The
      // envelope the renderer receives still carries the specific cause
      // (CWD_MISSING / SPAWN_FAILED) — this only records the resting state.
      this.#markBeached(pod.id, null, describe(err));
      throw err;
    }

    const opened = this.#store.updatePod(pod.id, { status: 'idle' });
    this.#push.podStatus({ podId: pod.id, status: 'idle' });
    return opened;
  }

  async #dispose(podId: PodId): Promise<void> {
    const session = this.#sessions.get(podId);
    if (!session) return;
    session.disposed = true;
    this.#sessions.delete(podId);
    this.#abortPendingFor(session);
    await session.runner.stop();
  }

  // -------------------------------------------------------------------------
  // Control surface
  // -------------------------------------------------------------------------

  async send(podId: PodId, text: string): Promise<void> {
    await this.#requireSession(podId).runner.send(text);
  }

  async interrupt(podId: PodId): Promise<void> {
    await this.#requireSession(podId).runner.interrupt();
  }

  /**
   * Persists the mode as well as applying it, so a reopen does not silently
   * revert. `setPermissionMode` throws a bare `RangeError` for a mode outside
   * the contract's union — that reaches the handler and is classified as
   * INVALID_ARGUMENT, not INTERNAL.
   */
  async setPermissionMode(podId: PodId, mode: PermissionMode): Promise<void> {
    const session = this.#requireSession(podId);
    await session.runner.setPermissionMode(mode);
    this.#store.updatePod(podId, { permissionMode: mode });
  }

  // -------------------------------------------------------------------------
  // Reads
  // -------------------------------------------------------------------------

  listLanes(podId: PodId): Lane[] {
    this.#requirePod(podId);
    return this.#store.listLanes(podId);
  }

  readEvents(req: ReadEventsRequest): ReadEventsResponse {
    this.#requirePod(req.podId);
    const events = this.#store.readEvents(req);
    const last = events[events.length - 1];

    // `hasMore` asks a question the row set cannot answer on its own: a page
    // that exactly fills `limit` may or may not be the end. One bounded probe
    // past the last returned seq — under the SAME lane filter — answers it
    // exactly, where comparing against the Pod-wide `latestSeq` would report a
    // false `hasMore` for any lane that is not the last one written.
    let hasMore = false;
    if (last !== undefined) {
      const probe = this.#store.readEvents({
        podId: req.podId,
        ...(req.laneId !== undefined ? { laneId: req.laneId } : {}),
        afterSeq: last.seq,
        limit: 1,
      });
      hasMore = probe.length > 0;
    }
    return { events, hasMore };
  }

  // -------------------------------------------------------------------------
  // Permissions (criteria 8 and 9)
  // -------------------------------------------------------------------------

  /**
   * SECURITY (criterion 9). This is the ONLY method that resolves a pending
   * prompt, and `PodSession.pending` is the only place a prompt lives. No agent
   * message, tool result, stream event or router output touches those maps —
   * the ingest path below never even reads one. A permission gate therefore cannot be
   * cleared by anything the model emits, only by a human calling
   * `permission:respond`.
   */
  respondPermission(req: PermissionRespondRequest): void {
    // The lookup is scoped to the named Pod's session, so a `requestId` that
    // two Pods happen to share cannot cross between them: `r1` on Pod B is a
    // different key in a different map from `r1` on Pod A.
    const entry = this.#sessions.get(req.podId)?.pending.get(req.requestId);
    if (entry === undefined) {
      throw notFound(`no pending permission request ${req.requestId} for pod ${req.podId}`);
    }
    const answer: PermissionAnswer =
      req.decision === 'deny'
        ? { decision: 'deny', reason: req.reason ?? 'denied by the user' }
        : { decision: req.decision };

    this.#settle(entry, req.decision, answer);
  }

  #permissionHandlerFor(session: PodSession): PermissionHandler {
    return (prompt: PermissionPrompt): Promise<PermissionAnswer> =>
      new Promise<PermissionAnswer>((resolve) => {
        const entry: PendingPermission = {
          podId: session.podId,
          requestId: prompt.requestId,
          owner: session.pending,
          resolve,
          release: () => undefined,
          settled: false,
        };

        // Criterion 8: an interrupted turn SETTLES the prompt. Without this the
        // promise would outlive its turn and the card would hang forever —
        // PodRunner races the same signal for its own return value, but nothing
        // else would ever release this one.
        const onAbort = (): void => {
          this.#settle(entry, 'aborted', ABORTED_ANSWER);
        };
        prompt.signal.addEventListener('abort', onAbort, { once: true });
        entry.release = (): void => {
          prompt.signal.removeEventListener('abort', onAbort);
        };

        session.pending.set(prompt.requestId, entry);

        if (prompt.signal.aborted) {
          onAbort();
          return;
        }

        this.#push.permissionRequested({
          podId: session.podId,
          // `PermissionPrompt` (frozen) carries no tool_use_id, so the prompt
          // cannot be attributed to a Calf here. The Matriarch lane is the
          // Pod-level home for it and is always present.
          laneId: session.matriarchLaneId,
          requestId: prompt.requestId,
          toolName: prompt.toolName,
          input: prompt.input,
        });
      });
  }

  #settle(
    entry: PendingPermission,
    outcome: 'allow' | 'allow_always' | 'deny' | 'aborted',
    answer: PermissionAnswer,
  ): void {
    if (entry.settled) return;
    entry.settled = true;
    entry.owner.delete(entry.requestId);
    entry.release();
    entry.resolve(answer);
    this.#push.permissionResolved({ podId: entry.podId, requestId: entry.requestId, outcome });
  }

  /** Closing or deleting a Pod must not strand its open prompts. */
  #abortPendingFor(session: PodSession): void {
    for (const entry of [...session.pending.values()]) {
      this.#settle(entry, 'aborted', ABORTED_ANSWER);
    }
  }

  /**
   * Test/diagnostic view of the unanswered prompts. Bare `requestId`s, across
   * every open Pod unless one is named — the ids are only unique per Pod, so a
   * caller comparing them across Pods must pass `podId`.
   */
  pendingPermissionIds(podId?: PodId): string[] {
    if (podId !== undefined) return [...(this.#sessions.get(podId)?.pending.keys() ?? [])];
    return [...this.#sessions.values()].flatMap((session) => [...session.pending.keys()]);
  }

  // -------------------------------------------------------------------------
  // The stream pipeline (criterion 7)
  // -------------------------------------------------------------------------

  #handlersFor(session: PodSession): PodRunnerHandlers {
    const guard = (what: string, fn: () => void): void => {
      // A throw here would unwind inside PodRunner's consume loop and tear the
      // stream down. Persistence failures are reported and the stream survives.
      try {
        fn();
      } catch (err) {
        this.#log.error(`[orcastrate] ${what} failed for pod ${session.podId}`, err);
      }
    };

    return {
      onMessage: (message) => {
        guard('ingest', () => {
          this.#persist(session, session.router.ingest(message));
        });
      },
      onTurnEnd: () => {
        guard('turn boundary', () => {
          this.#persist(session, session.router.onTurnBoundary());
        });
      },
      onEvent: (event) => {
        guard('synthetic event', () => {
          this.#persist(session, [event]);
        });
      },
      onStatus: (status) => {
        guard('status', () => {
          // 'beached' is deliberately skipped: `onBeached` publishes it with
          // the exit code, and publishing here first would emit a status push
          // that criterion 10 requires to carry one.
          if (status === 'beached') return;
          this.#setStatus(session.podId, status);
        });
      },
      onSessionId: (ccSessionId) => {
        guard('session id', () => {
          this.#store.updatePod(session.podId, { ccSessionId });
        });
      },
      onBeached: (exitCode, detail) => {
        guard('beached', () => {
          this.#sessions.delete(session.podId);
          session.disposed = true;
          this.#abortPendingFor(session);
          this.#markBeached(session.podId, exitCode, detail);
        });
      },
      onMalformed: (rawLine, parseError) => {
        // The runner already emits a `malformed` NewEvent through `onEvent`,
        // which is what puts it in the transcript. This is the log half.
        this.#log.warn(
          `[orcastrate] unparseable stream line for pod ${session.podId}: ${parseError}`,
          rawLine.slice(0, 500),
        );
      },
    };
  }

  /**
   * The single append path. For each event: its lane row first (the FK demands
   * it, and routing depends on it — see the loop), then ONE `appendMany` for the
   * whole batch so it is all-or-nothing and `seq` is assigned in array order,
   * then the push carrying the store-assigned `seq`.
   */
  #persist(session: PodSession, events: NewEvent[]): void {
    if (session.disposed) return;

    let lanesChanged = false;

    if (events.length > 0) {
      const prepared: NewEvent[] = [];
      for (const event of events) {
        // ORDER IS LOAD-BEARING. The lane row is created BEFORE the carrying
        // event is routed, because in 'lanes' mode a `lane_opened` event is
        // stamped with the id of the very Calf it announces. Routing first
        // would find that id unknown — the row does not exist yet — and redirect
        // the Calf's own opening marker onto the Matriarch, which both loses the
        // router's lane assignment and fires the drift warning on every normal
        // dispatch, masking the real bug that warning exists to catch.
        if (event.payload.type === 'lane_opened') {
          // HAZARD 2: keyed off `payload.lane.id`, NOT `event.laneId`. In
          // 'inline' mode this event carries the MATRIARCH's laneId with a CALF
          // payload, and keying off the event would misfile every Calf.
          if (this.#ensureLaneRow(session, event.payload.lane)) lanesChanged = true;
        } else if (event.payload.type === 'lane_closed') {
          if (this.#closeLaneRow(session, event.payload.laneId, event.payload.status)) {
            lanesChanged = true;
          }
        }

        const laneId = this.#routeLane(session, event);
        prepared.push(laneId === event.laneId ? event : { ...event, laneId });
      }

      const stored = this.#store.appendMany(prepared);
      assertAscendingSeq(stored);
      this.#push.podEvent({ podId: session.podId, events: stored });
    }

    if (this.#backfillAgentIds(session)) lanesChanged = true;

    if (lanesChanged) {
      this.#push.laneChanged({ podId: session.podId, lanes: this.#store.listLanes(session.podId) });
    }
  }

  /**
   * HAZARD 1. Restamps `UNROUTED_LANE_ID` — and anything else that could not
   * satisfy the `events.lane_id` foreign key — onto the Pod's Matriarch lane,
   * BEFORE the store sees the row.
   *
   * The unknown-lane case follows the LaneRouter contract's own rule ("an event
   * whose parent matches no known lane routes to the Matriarch and is NOT
   * dropped") rather than throwing, but it is logged: silently correct output
   * from a router that has drifted is exactly the failure this is meant to make
   * visible.
   */
  #routeLane(session: PodSession, event: NewEvent): LaneId {
    const laneId = event.laneId;
    if (typeof laneId !== 'string' || laneId === UNROUTED_LANE_ID || laneId.length === 0) {
      return session.matriarchLaneId;
    }
    if (laneId === session.matriarchLaneId || session.knownLanes.has(laneId)) return laneId;

    // A lane the store has never heard of. Its `lane_opened` is handled by the
    // caller BEFORE this routing call, so reaching here means the router's
    // ordering guarantee — "`lane_opened` for a Calf is ALWAYS emitted before
    // any event carrying that Calf's laneId" — did not hold. This branch is a
    // DRIFT DETECTOR and must stay silent on every normal turn; the test suite
    // asserts the warn logger is never called during a clean fixture drive.
    if (this.#store.getLane(laneId) !== null) {
      session.knownLanes.add(laneId);
      return laneId;
    }
    this.#log.warn(
      `[orcastrate] event for pod ${session.podId} referenced unknown lane ${laneId}; routed to the Matriarch`,
    );
    return session.matriarchLaneId;
  }

  #ensureLaneRow(session: PodSession, lane: Lane): boolean {
    if (session.knownLanes.has(lane.id) || this.#store.getLane(lane.id) !== null) {
      session.knownLanes.add(lane.id);
      return false;
    }
    // A parent the store does not hold would fail the FK. The router opens
    // ancestors before descendants, so this only guards against drift.
    let parentLaneId = lane.parentLaneId;
    if (
      parentLaneId !== null &&
      !session.knownLanes.has(parentLaneId) &&
      this.#store.getLane(parentLaneId) === null
    ) {
      this.#log.warn(
        `[orcastrate] lane ${lane.id} named an unknown parent ${parentLaneId}; reparented to the Matriarch`,
      );
      parentLaneId = session.matriarchLaneId;
    }

    this.#store.createLane({
      id: lane.id,
      podId: session.podId,
      kind: lane.kind,
      toolUseId: lane.toolUseId,
      agentId: lane.agentId,
      parentLaneId,
      depth: lane.depth,
      subagentType: lane.subagentType,
      description: lane.description,
    });
    session.knownLanes.add(lane.id);
    if (lane.agentId !== null) session.persistedAgentIds.set(lane.id, lane.agentId);
    return true;
  }

  #closeLaneRow(session: PodSession, laneId: LaneId, status: 'done' | 'orphaned'): boolean {
    if (!session.knownLanes.has(laneId) && this.#store.getLane(laneId) === null) return false;
    this.#store.setLaneStatus(laneId, status, this.#now());
    return true;
  }

  /**
   * ---------------------------------------------------------------------------
   * E4 — the agentId backfill trigger. OUT OF THIS TASK'S FROZEN CRITERIA.
   * ---------------------------------------------------------------------------
   * `LaneRouter` emits `lane_opened` with `agentId: null`, because in every
   * captured fixture the dispatching `tool_use` precedes `system/task_started`
   * and the id is not known at open time. The router banks it and exposes it
   * through `agentIds()`, which is pull-only and silent.
   * `EventStore.setLaneAgentId` exists for exactly this backfill. Nothing else
   * connects them, so without this loop `lanes.agent_id` stays permanently NULL
   * and design-spec 5.3's Steer feature has nothing to address.
   *
   * Runs after every ingest batch, diffing the router's map against what has
   * already been written. A lane the store has not materialized yet is skipped
   * and picked up by the next batch — including the empty batch `onTurnEnd`
   * produces, so an id that arrives after the last routed message still gets a
   * trigger.
   *
   * KNOWN NARROW GAP, left as-is deliberately: an id the router has banked for
   * a lane it has NOT yet materialized lives only in router memory, and
   * `restore()` repopulates `byAgentId` from persisted lanes alone — so a
   * beach-then-reconnect discards it. It is self-healing: the lane materializes
   * on the next dispatch and the id is re-banked and backfilled then. Closing it
   * properly would mean persisting un-materialized lanes, which the schema has
   * no row for.
   */
  #backfillAgentIds(session: PodSession): boolean {
    let changed = false;
    for (const [laneId, agentId] of session.router.agentIds()) {
      if (session.persistedAgentIds.get(laneId) === agentId) continue;
      if (!session.knownLanes.has(laneId) && this.#store.getLane(laneId) === null) continue;
      this.#store.setLaneAgentId(laneId, agentId);
      session.persistedAgentIds.set(laneId, agentId);
      changed = true;
    }
    return changed;
  }

  // -------------------------------------------------------------------------
  // Status
  // -------------------------------------------------------------------------

  #setStatus(podId: PodId, status: PodStatus): void {
    this.#store.updatePod(podId, { status });
    this.#push.podStatus({ podId, status });
  }

  /** Criterion 10: Beached is recorded AND pushed with the process exit code. */
  #markBeached(podId: PodId, exitCode: number | null, detail: string): void {
    if (this.#store.getPod(podId) === null) return;
    this.#store.updatePod(podId, { status: 'beached' });
    this.#push.podStatus({ podId, status: 'beached', exitCode, detail });
  }

  // -------------------------------------------------------------------------
  // Lookups
  // -------------------------------------------------------------------------

  #requirePod(podId: PodId): Pod {
    const pod = this.#store.getPod(podId);
    if (pod === null) throw notFound(`no Pod with id ${podId}`);
    return pod;
  }

  #requireSession(podId: PodId): PodSession {
    const session = this.#sessions.get(podId);
    if (session === undefined) {
      throw new IpcFailure('NOT_RUNNING', `Pod ${podId} is not open`);
    }
    return session;
  }

  #ensureMatriarchLane(podId: PodId): LaneId {
    const existing = this.#store.getMatriarchLane(podId);
    if (existing !== null) return existing.id;

    const id = this.#newId();
    this.#store.createLane({
      id,
      podId,
      kind: 'matriarch',
      toolUseId: null,
      agentId: null,
      parentLaneId: null,
      depth: 0,
      subagentType: null,
      description: null,
    });
    this.#push.laneChanged({ podId, lanes: this.#store.listLanes(podId) });
    return id;
  }
}

/**
 * Criterion 7's ordering guarantee, checked at the boundary that publishes it
 * rather than assumed from the store's docstring.
 */
function assertAscendingSeq(events: NormalizedEvent[]): void {
  for (let i = 1; i < events.length; i += 1) {
    const previous = events[i - 1];
    const current = events[i];
    if (previous === undefined || current === undefined) continue;
    if (current.seq !== previous.seq + 1) {
      throw new IpcFailure(
        'INTERNAL',
        `append returned a non-contiguous seq run: ${previous.seq} -> ${current.seq}`,
      );
    }
  }
}

function defaultIsDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
