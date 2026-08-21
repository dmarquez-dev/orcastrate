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
import { PodRunnerError, UNROUTED_LANE_ID } from '../pod';

import {
  armPendingEcho,
  suppressEchoedUserPrompts,
  type PendingEcho,
} from './pending-echo';
import type { Pushes } from './pushes';
import {
  RESUME_FALLBACK_REASON,
  RESUME_FALLBACK_SUBTYPE,
  type ResumeFallbackData,
} from './resume-fallback';
import {
  STARTUP_RECONCILIATION_REASON,
  STARTUP_RECONCILIATION_SUBTYPE,
  type ReconciledPod,
  type StartupReconciliation,
  type StartupReconciliationData,
  type StartupReconciler,
} from './startup-reconciliation';

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
  /**
   * Prompts this manager appended and has not yet seen echoed back. Lives on
   * the session so two Pods sending the same sentence cannot consume each
   * other's record, and so a record cannot outlive the session that armed it.
   */
  pendingEchoes: PendingEcho[];
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

/**
 * `StartupReconciler` is implemented by the CLASS and deliberately not added to
 * `PodManagerApi`. The IPC handlers have no business calling the boot sweep —
 * it has exactly one caller, `src/main/index.ts` — and widening the handler
 * interface would force every stub that implements it to grow a member for a
 * method the transport never reaches.
 */
export class PodManager implements PodManagerApi, StartupReconciler {
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
  // Startup reconciliation
  // -------------------------------------------------------------------------

  /**
   * Reconciles the store against the fact that a process restart destroyed
   * every runner. Called ONCE, from `src/main/index.ts`, after `migrate()` and
   * the `PodManager` constructor and before `createMainWindow()`.
   *
   * SYNCHRONOUS because the whole `EventStore` API is synchronous, and
   * IDEMPOTENT: after one sweep every Pod is `'closed'` or `'beached'` with no
   * running lanes, so a second call with no intervening runner writes no row,
   * appends no event, and returns `pods: []`.
   *
   * For each Pod from `listPods()`, in that order:
   *
   *  a. LANES. Every lane at `'running'` — Matriarch and Calf alike — becomes
   *     `'orphaned'`, stamped from the sweep's single `now()`. A Matriarch left
   *     open by a killed process is exactly the reproduced bug.
   *
   *  b. EVENTS, only when step (a) changed at least one lane. ONE `appendMany`
   *     per Pod so `seq` is contiguous and the batch is all-or-nothing: the
   *     `system` notice on the Matriarch lane first, then one `lane_closed` per
   *     orphaned lane on its own lane id.
   *
   *     THE CONDITION IS "A LANE CHANGED", NOT "ANYTHING CHANGED", and that
   *     narrowing is deliberate. Step (c) rewrites EVERY non-beached Pod on
   *     every boot, including quiet ones that were merely `'idle'`. A
   *     transcript row for each of those would put a reconciliation notice in
   *     every Pod on every relaunch, forever — noise that trains the user to
   *     ignore the one notice that matters. A pure status correction is
   *     bookkeeping; the Pod still appears in the returned `pods`, so nothing
   *     is hidden from the log or from a test.
   *
   *  c. POD STATUS. Every Pod that is not `'beached'` becomes `'closed'`.
   *     `'idle'` now means OPEN AND BETWEEN TURNS, and at application start no
   *     runner exists by construction, so an `'idle'` row is a lie about a
   *     process that is not there. This is the step that makes the relaunch
   *     defect impossible at the DATA level rather than papered over in a view.
   *
   *     `'beached'` IS LEFT ALONE. It is already a truthful not-open resting
   *     state WITH a recorded cause; rewriting it to `'closed'` would erase why
   *     the Pod stopped and send the user to `Open` instead of `Reconnect`.
   *
   *  d. A Pod with no running lane and a status already `'closed'` or
   *     `'beached'` produces no write and no entry in the result.
   *
   * ORDERING is lanes before the pod-status write, so a crash mid-sweep leaves
   * lanes reconciled and the status stale — recoverable by the next boot —
   * rather than a Pod already `'closed'` with `running` lanes, which is the bug
   * this fixes.
   *
   * N+1 over Pods is accepted: `listLanes` runs once per Pod, Pod counts are
   * single digits, and the alternative is a change to the frozen `EventStore`
   * contract for no measured gain.
   *
   * PUSHES ARE NOT THE DELIVERY MECHANISM. No window exists at this point in
   * startup and `sendToRenderers` drops a payload with no window, so everything
   * the renderer needs is READ from the store by its first `pod:list` /
   * `lane:list`. The sweep therefore pushes nothing.
   */
  reconcileStartup(): StartupReconciliation {
    const at = this.#now();
    const reconciled: ReconciledPod[] = [];

    for (const pod of this.#store.listPods()) {
      // (a) lanes first.
      const orphanedLaneIds: LaneId[] = [];
      for (const lane of this.#store.listLanes(pod.id)) {
        if (lane.status !== 'running') continue;
        this.#store.setLaneStatus(lane.id, 'orphaned', at);
        orphanedLaneIds.push(lane.id);
      }

      // (d) `'beached'` keeps its status; `'closed'` is already right. Anything
      // else is a stale claim that a runner exists.
      const statusBefore = pod.status;
      const statusAfter: PodStatus = statusBefore === 'beached' ? 'beached' : 'closed';
      const statusNeedsWrite = statusBefore !== statusAfter;

      if (orphanedLaneIds.length === 0 && !statusNeedsWrite) continue;

      // (b) the durable record, ONLY when a lane actually changed.
      if (orphanedLaneIds.length > 0) {
        this.#appendReconciliationEvents(pod.id, {
          subtypeMarker: STARTUP_RECONCILIATION_SUBTYPE,
          reason: STARTUP_RECONCILIATION_REASON,
          statusBefore,
          statusAfter,
          orphanedLaneIds,
          at,
        });
      }

      // (c) THE `lastActiveAt` IS PASSED EXPLICITLY AND IT IS LOAD-BEARING.
      // `EventStore.updatePod` refreshes `lastActiveAt` to now unless it is
      // supplied. This sweep touches every non-beached Pod on every boot, so
      // omitting it would reset every Pod's last-used stamp to boot time on
      // every launch and destroy the field within one session of use.
      if (statusNeedsWrite) {
        this.#store.updatePod(pod.id, { status: statusAfter, lastActiveAt: pod.lastActiveAt });
      }

      reconciled.push({ podId: pod.id, statusBefore, statusAfter, orphanedLaneIds });
    }

    if (reconciled.length > 0) {
      this.#log.warn(
        `[orcastrate] startup reconciliation closed ${reconciled.length} Pod(s) and orphaned ` +
          `${reconciled.reduce((n, p) => n + p.orphanedLaneIds.length, 0)} lane(s) left running by a previous process`,
      );
    }
    return { at, pods: reconciled };
  }

  /**
   * ONE `appendMany` per Pod, so the batch is all-or-nothing and the `seq` run
   * is contiguous: the `system` notice first, then one `lane_closed` per
   * orphaned lane on its OWN lane id. Both are synthetic, so neither carries
   * `raw`.
   */
  #appendReconciliationEvents(podId: PodId, data: StartupReconciliationData): void {
    // The notice belongs on the Matriarch, which is the lane the transcript
    // reads by default. A Pod with a running lane always has one; the fallback
    // keeps the durable record from being dropped if a store ever hands back a
    // Pod whose Matriarch row is missing, rather than silently losing it.
    const matriarchLaneId = this.#store.getMatriarchLane(podId)?.id ?? data.orphanedLaneIds[0];
    if (matriarchLaneId === undefined) return;

    const events: NewEvent[] = [
      {
        podId,
        laneId: matriarchLaneId,
        type: 'system',
        payload: { type: 'system', subtype: STARTUP_RECONCILIATION_SUBTYPE, data },
        createdAt: data.at,
      },
      ...data.orphanedLaneIds.map(
        (laneId): NewEvent => ({
          podId,
          laneId,
          type: 'lane_closed',
          payload: { type: 'lane_closed', laneId, status: 'orphaned' },
          createdAt: data.at,
        }),
      ),
    ];
    this.#store.appendMany(events);
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
   *
   * OPEN RESUMES. It passed `false` here until 2026-08-20, so a Pod closed and
   * reopened — the routine flow — always started a Claude Code session with no
   * memory of the conversation the transcript was still showing. Design 4.2
   * defines `resume` as "the session id, set when reopening a persisted Pod";
   * this is that. A Pod with no `ccSessionId` still starts fresh, which is
   * `#start`'s own guard and not a special case here.
   */
  async openPod(podId: PodId): Promise<Pod> {
    const pod = this.#requirePod(podId);
    if (this.#sessions.has(podId)) return pod;

    const inflight = this.#opening.get(podId);
    if (inflight) return inflight;

    const started = this.#start(pod, true).finally(() => {
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
   *
   * IT NO LONGER DIFFERS FROM `openPod` IN WHAT IT STARTS — both resume. What
   * remains is what each does to a session that is ALREADY live: this one
   * disposes it and builds a new runner, `openPod` returns the open Pod
   * untouched and never builds a second. For a `closed` Pod, where no session
   * exists, the two are now the same call. That is stated rather than papered
   * over; the split still earns its place at the UI, where `'beached'` and
   * `'closed'` want different affordances.
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
    // `'closed'`, not `'idle'`: after `#dispose` there is no runner, and
    // `'idle'` now means a runner exists and is between turns. The
    // `'beached'` guard is preserved — closing a Beached Pod must not erase
    // why it died, or the user is sent to `Open` instead of `Reconnect`.
    if (pod !== null && pod.status !== 'beached') {
      this.#store.updatePod(podId, { status: 'closed' });
      this.#push.podStatus({ podId, status: 'closed' });
    }
  }

  /** App quit: every runner disposed, every prompt settled. */
  async disposeAll(): Promise<void> {
    await Promise.all([...this.#sessions.keys()].map((podId) => this.#dispose(podId)));
  }

  /**
   * `attemptResume` is the CALLER's intent; `resumeSessionId` below is what
   * actually happened, and the failure path turns on the second. Both public
   * entry points now pass `true`; the ONE caller that passes `false` is the
   * fallback retry at the bottom of this method, which is also what makes the
   * retry incapable of recursing.
   */
  async #start(pod: Pod, attemptResume: boolean): Promise<Pod> {
    // A Pod that never reached its first turn has nothing to resume, and asking
    // the CLI to resume nothing is not a thing to fail over — it starts fresh.
    const resumeSessionId = attemptResume ? pod.ccSessionId : null;
    const matriarchLaneId = this.#ensureMatriarchLane(pod.id);
    this.#reviveMatriarchLane(pod.id, matriarchLaneId);
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
      pendingEchoes: [],
      disposed: false,
      runner: this.#createRunner({
        podId: pod.id,
        cwd: pod.cwd,
        permissionMode: pod.permissionMode,
        envOverrides: pod.envOverrides,
        forwardSubagentText: true,
        ...(resumeSessionId !== null ? { resume: resumeSessionId } : {}),
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
      // THE MANAGER HALF OF THE REAP. A `start()` that rejects after the SDK
      // bridge already returned can leave a Claude Code child streaming with no
      // owner: the manager drops the session, so nothing else will ever call
      // `stop()` on this runner. `#dispose` reaps on the normal path; this is
      // the failure path's equivalent, and the two halves of the reap (this one
      // and the runner's own teardown) each stand alone.
      //
      // WRAPPED SO A THROWING `stop()` CANNOT MASK THE START FAILURE. The error
      // the caller receives must still be `err`, with its CWD_MISSING /
      // SPAWN_FAILED / RESUME_FAILED classification intact — that
      // classification lives on `err` and nowhere else. A teardown failure is
      // real but secondary, so it is logged rather than swallowed silently.
      try {
        await session.runner.stop();
      } catch (stopErr) {
        this.#log.warn(
          `[orcastrate] stop() failed while reaping a failed start for pod ${pod.id}`,
          stopErr,
        );
      }
      // A REJECTED RESUME IS NOT A DEAD POD. It is the one start failure the
      // user can neither fix nor act on, and refusing to open would be worse
      // than the defect this whole change exists to fix.
      //
      // THE TEST IS DELIBERATELY NARROW, and both halves of it matter:
      //  - `resumeSessionId !== null`, so a start that never asked to resume
      //    cannot take this path however the failure is labelled; and
      //  - the code is exactly `RESUME_FAILED`, which `classifyStartupFailure`
      //    (`../pod/errors.ts`) only ever produces when a `resume` id WAS
      //    supplied AND the CLI's wording names the session.
      // `CWD_MISSING` and `SPAWN_FAILED` therefore fall through to the beach
      // below with their cause intact. Widening either half would turn a
      // missing directory or an unspawnable binary into a silent fresh
      // session, which is the one way this fix could be worse than the bug.
      if (resumeSessionId !== null && err instanceof PodRunnerError && err.code === 'RESUME_FAILED') {
        return await this.#startFreshAfterRejectedResume(pod, resumeSessionId, err);
      }

      // Spec 8: a Pod that cannot come up is Beached, not merely errored — a
      // failure WITH a cause, so `'beached'` and never `'closed'`. The envelope
      // the renderer receives still carries the specific cause; this only
      // records the resting state. `session.disposed` above has already
      // detached the runner's handlers, so a trailing `onStatus('idle')` from
      // `stop()` cannot overwrite it.
      this.#markBeached(pod.id, null, describe(err));
      throw err;
    }

    const opened = this.#store.updatePod(pod.id, { status: 'idle' });
    this.#push.podStatus({ podId: pod.id, status: 'idle' });
    return opened;
  }

  /**
   * The retry, and the notice that keeps it from being silent.
   *
   * EXACTLY ONE RETRY, and it cannot become two: it calls `#start` with
   * `attemptResume: false`, so no `resume` option is sent, so the CLI has
   * nothing to reject and `classifyStartupFailure` cannot label the result
   * `RESUME_FAILED` again. The reaping of the first runner has already happened
   * in `#start`'s catch before this is called.
   *
   * THE NOTICE IS WRITTEN AFTER THE FRESH SESSION IS UP, never before. Its
   * sentence claims a new conversation exists; if the retry also fails, that
   * claim would be false, and `#start`'s own failure path beaches the Pod with
   * the retry's cause instead. The event is appended, not derived, so it
   * survives the next restart — the transcript must still explain itself
   * tomorrow.
   */
  async #startFreshAfterRejectedResume(
    pod: Pod,
    abandonedCcSessionId: string,
    cause: PodRunnerError,
  ): Promise<Pod> {
    this.#log.warn(
      `[orcastrate] claude code refused to resume session ${abandonedCcSessionId} for pod ` +
        `${pod.id}; starting a fresh session instead: ${cause.message}`,
    );
    const opened = await this.#start(pod, false);
    this.#appendResumeFallbackNotice(pod.id, {
      subtypeMarker: RESUME_FALLBACK_SUBTYPE,
      reason: RESUME_FALLBACK_REASON,
      podId: pod.id,
      abandonedCcSessionId,
      detail: describe(cause),
      at: this.#now(),
    });
    return opened;
  }

  /**
   * One `system` event on the Matriarch, which is the lane the transcript reads
   * by default — the same shape and the same rendering path as the startup
   * reconciliation notice, so no `EventType` grows and nothing new has to learn
   * to render it.
   *
   * Unlike the boot sweep this DOES push: a window exists by now, the Pod the
   * user is looking at just came up, and without the push the explanation would
   * not appear until the transcript was next re-read.
   */
  #appendResumeFallbackNotice(podId: PodId, data: ResumeFallbackData): void {
    const matriarchLaneId = this.#store.getMatriarchLane(podId)?.id;
    if (matriarchLaneId === undefined) {
      // Nothing to hang the notice on. Losing the durable record silently is
      // the one thing worse than losing the resume, so it is logged.
      this.#log.warn(
        `[orcastrate] pod ${podId} has no Matriarch lane; the resume-fallback notice was dropped`,
      );
      return;
    }
    const stored = this.#store.appendMany([
      {
        podId,
        laneId: matriarchLaneId,
        type: 'system',
        payload: { type: 'system', subtype: RESUME_FALLBACK_SUBTYPE, data },
        createdAt: data.at,
      },
    ]);
    this.#push.podEvent({ podId, events: stored });
  }

  /**
   * WITHOUT THIS THE BOOT SWEEP IS A ONE-WAY DOOR.
   *
   * `#ensureMatriarchLane` returns an existing Matriarch unchanged whatever its
   * status, and nothing else in `#start` sets a lane back to `running`. After a
   * sweep has orphaned it, every subsequent Open would leave the rail showing
   * the Matriarch as Orphaned forever while the Pod ran normally underneath it.
   *
   * `setLaneStatus(id, 'running')` with NO `endedAt` clears `ended_at`, which
   * is what the `(status = 'running') = (ended_at IS NULL)` CHECK requires.
   *
   * CALF LANES ARE NOT REVIVED. A Calf's worker process is genuinely gone and
   * cannot be resumed, so `orphaned` is the truth for it. Only the Matriarch —
   * the lane the new runner will actually write into — comes back.
   *
   * Runs before `router.restore`, so the router restores from the revived rows.
   */
  #reviveMatriarchLane(podId: PodId, matriarchLaneId: LaneId): void {
    const matriarch = this.#store.getLane(matriarchLaneId);
    if (matriarch === null || matriarch.status === 'running') return;
    this.#store.setLaneStatus(matriarchLaneId, 'running');
    this.#push.laneChanged({ podId, lanes: this.#store.listLanes(podId) });
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

  /**
   * THE APPEND HAPPENS FIRST, THEN THE SEND. Not the other way round.
   *
   *   - `#requireSession` still runs before either, so no append happens for a
   *     Pod that cannot be sent to.
   *   - The prompt must never appear AFTER the model's reply to it.
   *     `PodRunner.send` pushes into the input queue and resolves on a
   *     microtask; the SDK drains that queue asynchronously, so awaiting it
   *     first opens a real window in which an ingested event takes a lower
   *     `seq` than the prompt that caused it. `seq` is the transcript's only
   *     ordering, so that window is a user-visible reordering.
   *   - The cost is a phantom row if `runner.send` then throws. That is the
   *     safe direction: the user sees what they typed plus the error the IPC
   *     envelope already surfaces, rather than a send that vanished.
   */
  async send(podId: PodId, text: string): Promise<void> {
    const session = this.#requireSession(podId);
    this.#appendUserPrompt(session, text);
    await session.runner.send(text);
  }

  /**
   * The user's typed prompt as a durable event, stored VERBATIM — not trimmed,
   * not normalised, not truncated, not escaped. What the user typed is what the
   * transcript shows.
   *
   * IT GOES THROUGH `#persist`, the single append path, so it gets the lane row
   * handling, the one `appendMany`, the `assertAscendingSeq` and the
   * `push.podEvent` in the established order. A second, parallel append path is
   * how the two halves of this feature drift.
   *
   * NO MATRIARCH LANE MEANS NO APPEND, LOUDLY, AND THE SEND STILL RUNS — the
   * same trade `#appendResumeFallbackNotice` makes for the same reason. Losing
   * the durable record silently is worse than losing it loudly; refusing to
   * send the user's message because bookkeeping failed is worse than both.
   */
  #appendUserPrompt(session: PodSession, text: string): void {
    const matriarchLaneId = this.#store.getMatriarchLane(session.podId)?.id;
    if (matriarchLaneId === undefined) {
      this.#log.warn(
        `[orcastrate] pod ${session.podId} has no Matriarch lane; the typed prompt was not recorded`,
      );
      return;
    }

    const at = this.#now();
    const before = this.#store.latestSeq(session.podId);
    this.#persist(session, [
      {
        podId: session.podId,
        laneId: matriarchLaneId,
        type: 'user_message',
        payload: { type: 'user_message', text },
        createdAt: at,
      },
    ]);
    const appendedSeq = this.#store.latestSeq(session.podId);

    // ARM THE ECHO RECORD ONLY IF THE ROW ACTUALLY LANDED. `#persist` returns
    // without writing for a disposed session, and a record armed against an
    // append that never happened could only ever suppress something else.
    if (appendedSeq > before) {
      armPendingEcho(session.pendingEchoes, { text, appendedSeq, at });
    }
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
          laneId: this.#attributePrompt(session, prompt).laneId,
          requestId: prompt.requestId,
          toolName: prompt.toolName,
          input: prompt.input,
        });
      });
  }

  /**
   * ---------------------------------------------------------------------------
   * E5 — which lane does this prompt belong to?
   * ---------------------------------------------------------------------------
   * Design-spec 5.4 wants the permission card rendered "in the lane that
   * asked". Before this amendment `PermissionPrompt` carried no identifier, so
   * every prompt was filed under the Matriarch and a Calf's card appeared in
   * the wrong lane. The prompt now carries the ids the SDK always had.
   *
   * Resolution order, strongest key first:
   *
   *  1. `agentId` — names the sub-agent directly. Looked up in the live
   *     router's agent index first (it banks ids the store has not been
   *     backfilled with yet), then in the store's persisted `agent_id`.
   *  2. `toolUseId` — weaker. It identifies the tool CALL, not the lane, and
   *     resolves only when the call being permitted is itself a dispatch. Kept
   *     because it costs one indexed lookup and covers a prompt that arrives
   *     before the agent id does.
   *  3. The Matriarch — the EXPLICIT fallback, returned with
   *     `attribution: 'matriarch'` rather than falling out of the code by
   *     accident. The Matriarch lane always exists for an open session, so the
   *     push can never be dropped for want of a lane.
   *
   * A resolved lane is REQUIRED to belong to this Pod. The router is per-Pod so
   * its answers are scoped already; the store lookup is scoped by `podId`
   * explicitly. Nothing here can attribute Pod A's prompt to Pod B's lane.
   *
   * ---------------------------------------------------------------------------
   * THE FALLBACK IS TWO DIFFERENT EVENTS AND ONLY ONE OF THEM IS NORMAL
   * ---------------------------------------------------------------------------
   * NO ID SUPPLIED — the Matriarch raised the prompt. The common case, correct,
   * and SILENT. A warning here would fire on ordinary traffic.
   *
   * AN ID WAS SUPPLIED BUT RESOLVES TO NO LANE — the CLI named an agent or a
   * tool call this Pod does not know. That is drift, and it is logged. This
   * branch is a DRIFT DETECTOR of exactly the same shape as `#routeLane`'s
   * unknown-lane branch: a defensive fallback that produces a plausible wrong
   * answer, so its silence is the contract rather than an accident. It must
   * stay silent on every normal turn, and the test suite asserts the warn
   * logger is never called during a clean fixture drive.
   *
   * KNOWN ORDERING HAZARD this warning is the only way to observe. `canUseTool`
   * is invoked by the SDK OUT OF BAND from stream ingestion, while BOTH
   * attribution indexes are populated only by ingesting `task_started` or the
   * dispatch block. A Calf's first tool prompt that arrives before that
   * ingestion lands therefore resolves against neither index and falls back to
   * the Matriarch — a legitimate Calf prompt rendered on the wrong lane, and
   * from the payload alone indistinguishable from the correct no-id case. The
   * fixture tests drive the stream to completion before raising a prompt, so
   * they cannot reproduce it. If this warning ever appears in a real log naming
   * an `agentId`, THIS RACE IS THE FIRST THING TO SUSPECT: the id was real, the
   * indexes were merely late. Closing it properly means either awaiting the
   * ingestion of the dispatch that owns the id, or parking the prompt until the
   * lane materializes — both are behaviour changes beyond this amendment.
   */
  #attributePrompt(
    session: PodSession,
    prompt: PermissionPrompt,
  ): { laneId: LaneId; attribution: 'agent' | 'toolUse' | 'matriarch' } {
    const { agentId, toolUseId } = prompt;

    if (agentId !== undefined) {
      for (const [laneId, banked] of session.router.agentIds()) {
        if (banked === agentId) return { laneId, attribution: 'agent' };
      }
      const persisted = this.#laneByAgentIdFromStore(session, agentId);
      if (persisted !== null) return { laneId: persisted, attribution: 'agent' };
    }

    if (toolUseId !== undefined) {
      const routed = session.router.getLaneByToolUseId(toolUseId);
      if (routed !== null) return { laneId: routed.id, attribution: 'toolUse' };
      const stored = this.#store.getLaneByToolUseId(session.podId, toolUseId);
      if (stored !== null) return { laneId: stored.id, attribution: 'toolUse' };
    }

    // Drift only. An unattributed prompt is the Matriarch's and says nothing.
    // Both ids are named when both were supplied, so the log says which key
    // actually missed rather than leaving the reader to guess.
    const unresolved = [
      ...(agentId !== undefined ? [`agentId ${agentId}`] : []),
      ...(toolUseId !== undefined ? [`toolUseId ${toolUseId}`] : []),
    ];
    if (unresolved.length > 0) {
      this.#log.warn(
        `[orcastrate] permission request ${prompt.requestId} for pod ${session.podId} named ${unresolved.join(' and ')}, which matches no lane in this Pod; attributed to the Matriarch`,
      );
    }

    return { laneId: session.matriarchLaneId, attribution: 'matriarch' };
  }

  /**
   * The store has no `getLaneByAgentId` — the contract does not declare one and
   * a contract change was not in scope for this amendment — so the persisted
   * lookup goes through `listLanes`, which is already indexed by Pod. It runs
   * only when the router misses, which is the beach-then-reconnect case where
   * the router's in-memory index was rebuilt from persisted lanes and the id
   * was never re-banked.
   */
  #laneByAgentIdFromStore(session: PodSession, agentId: AgentId): LaneId | null {
    for (const lane of this.#store.listLanes(session.podId)) {
      if (lane.agentId === agentId) return lane.id;
    }
    return null;
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
      // THE HANDLERS ARE DETACHED WHEN THE SESSION IS DISPOSED, and this closes
      // the race that `'closed'` exposes. `PodRunner.stop()` ends by emitting
      // `onStatus('idle')`, and `stop()` is called from inside `#dispose` —
      // which `closePod` runs BEFORE it writes `'closed'`. Letting that late
      // callback through would write `'idle'` over the close, or push an
      // `'idle'` status for a Pod with no runner. While both writes were
      // `'idle'` the race had no consequence; it does now.
      //
      // Detaching here rather than relying on `closePod`'s statement order is
      // the point: statement order is invisible to a reviewer and a reorder
      // would reintroduce the bug silently. A disposed session speaks for
      // nothing.
      if (session.disposed) return;
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
          // THE ECHO GUARD WRAPS THE ROUTER'S OUTPUT, NOT `#persist`. `#persist`
          // is also the path `#appendUserPrompt` takes, and a filter attached
          // there would suppress the manager's own appended prompt. The lane is
          // therefore read as the ROUTER produced it, before `#routeLane`'s
          // unknown-lane restamping moves a Calf's events onto the Matriarch.
          this.#persist(session, this.#suppressEchoes(session, session.router.ingest(message)));
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
   * Drops an SDK echo of a prompt this manager just appended. See
   * `pending-echo.ts` for why the rule is five conditions and why every bound
   * fails toward rendering the event.
   *
   * The clock is only read when a record is outstanding, which is the only time
   * anything can be suppressed — so a Pod nobody has typed into pays nothing.
   */
  #suppressEchoes(session: PodSession, batch: NewEvent[]): NewEvent[] {
    if (session.pendingEchoes.length === 0) return batch;
    return suppressEchoedUserPrompts(
      batch,
      this.#store.getMatriarchLane(session.podId)?.id,
      session.pendingEchoes,
      Date.parse(this.#now()),
    );
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
