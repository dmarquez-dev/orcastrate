/**
 * A complete, drivable stand-in for `window.orcastrate`.
 *
 * WHY IT EXISTS: `WorkspaceProviderProps.api` is the test seam declared by the
 * frozen contract `renderer-state.ts`. Supplying this stub is how every
 * renderer task drives the whole state layer with no Electron, no preload
 * bridge, and no main process.
 *
 * WHAT IT GUARANTEES:
 *   1. Every channel in `INVOKE_CHANNELS` has a method here, resolving a
 *      `{ ok: true }` envelope by default and NEVER rejecting — matching the
 *      error discipline of the frozen `ipc.ts`.
 *   2. Every channel in `EVENT_CHANNELS` has a subscribe method here that
 *      returns a WORKING `Unsubscribe`, and can be driven from a test via
 *      `emit`.
 *   3. Any invoke channel can be made to resolve `{ ok: false, error }` via
 *      `failInvoke`, which is the path most consumer acceptance criteria are
 *      written against.
 *
 * `stub-api.test.ts` enumerates both frozen constant objects and asserts this
 * file covers them, so the stub cannot silently lag the frozen surface.
 *
 * This module imports no `node:` builtin, no `electron`, and touches
 * `window.orcastrate` only through the imported `OrcastrateApi` TYPE.
 */

import type {
  IpcError,
  IpcResult,
  OrcastrateApi,
  PermissionRespondRequest,
  PickDirectoryResponse,
  PodEventPush,
  PodStatusPush,
  LaneChangedPush,
  PermissionRequestedPush,
  PermissionResolvedPush,
  CreatePodRequest,
  ReadEventsRequest,
  ReadEventsResponse,
  UpdatePodRequest,
  Unsubscribe,
} from '@shared/contracts/ipc';
import { EVENT_CHANNELS, INVOKE_CHANNELS } from '@shared/contracts/ipc';
import type { Lane, PermissionMode, Pod, PodId } from '@shared/contracts/events';
import type { RoutingMode } from '@shared/contracts/lane-router';

// ---------------------------------------------------------------------------
// Channel keys, and where each one lives on the API object
// ---------------------------------------------------------------------------

export type InvokeChannelKey = keyof typeof INVOKE_CHANNELS;
export type EventChannelKey = keyof typeof EVENT_CHANNELS;

/**
 * The mapping from a frozen invoke-channel key to the `OrcastrateApi` method
 * that carries it. Declared as data, not inferred, so `stub-api.test.ts` can
 * walk `INVOKE_CHANNELS` and prove that every channel reaches a real function.
 */
export const INVOKE_CHANNEL_METHODS = {
  podList: ['pods', 'list'],
  podCreate: ['pods', 'create'],
  podUpdate: ['pods', 'update'],
  podDelete: ['pods', 'delete'],
  podOpen: ['pods', 'open'],
  podClose: ['pods', 'close'],
  podSend: ['pods', 'send'],
  podInterrupt: ['pods', 'interrupt'],
  podSetPermissionMode: ['pods', 'setPermissionMode'],
  podReconnect: ['pods', 'reconnect'],
  laneList: ['lanes', 'list'],
  eventsRead: ['events', 'read'],
  permissionRespond: ['permissions', 'respond'],
  dialogPickDirectory: ['dialog', 'pickDirectory'],
  appRoutingMode: ['app', 'routingMode'],
} as const satisfies Record<InvokeChannelKey, readonly [string, string]>;

/** The mapping from a frozen push-channel key to its `api.on.*` subscriber. */
export const EVENT_CHANNEL_METHODS = {
  podEvent: 'podEvent',
  podStatus: 'podStatus',
  laneChanged: 'laneChanged',
  permissionRequested: 'permissionRequested',
  permissionResolved: 'permissionResolved',
} as const satisfies Record<EventChannelKey, keyof OrcastrateApi['on']>;

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

/** A fully populated `Pod`. Every field overridable; none left `undefined`. */
export function makeStubPod(overrides: Partial<Pod> = {}): Pod {
  return {
    id: 'pod-1',
    title: 'Stub Pod',
    // Opaque display string. The renderer never composes or parses a path.
    cwd: '/stub/workspace',
    ccSessionId: null,
    permissionMode: 'default',
    envOverrides: {},
    tabOrder: 0,
    status: 'idle',
    createdAt: '2026-01-01T00:00:00.000Z',
    lastActiveAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

/** A fully populated Matriarch `Lane` unless overridden into a Calf. */
export function makeStubLane(overrides: Partial<Lane> = {}): Lane {
  return {
    id: 'lane-matriarch',
    podId: 'pod-1',
    kind: 'matriarch',
    toolUseId: null,
    agentId: null,
    parentLaneId: null,
    depth: 0,
    subagentType: null,
    description: null,
    status: 'running',
    startedAt: '2026-01-01T00:00:00.000Z',
    endedAt: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// The stub
// ---------------------------------------------------------------------------

/** Drives the five push channels. Each call is synchronous and fans out to
 *  every live subscriber; a subscriber added during the fan-out is not called
 *  for the in-flight emit. */
export interface StubEmitters {
  podEvent(push: PodEventPush): void;
  podStatus(push: PodStatusPush): void;
  laneChanged(push: LaneChangedPush): void;
  permissionRequested(push: PermissionRequestedPush): void;
  permissionResolved(push: PermissionResolvedPush): void;
}

/**
 * The stub is a SUPERSET of `OrcastrateApi`: it satisfies the frozen type, so
 * it can be handed straight to `WorkspaceProviderProps.api`, and it carries the
 * test-driving affordances alongside.
 */
export interface StubOrcastrateApi extends OrcastrateApi {
  /** Push a payload down a channel, as the main process would. */
  emit: StubEmitters;
  /**
   * Make one invoke channel resolve `{ ok: false, error }` on every subsequent
   * call, until `clearInvokeFailure`. Has no effect on a channel the caller
   * replaced wholesale through `overrides` — an explicit override wins.
   */
  failInvoke(channel: InvokeChannelKey, error: IpcError): void;
  /** Restore a channel's default `{ ok: true }` behaviour. */
  clearInvokeFailure(channel: InvokeChannelKey): void;
  /** Make every invoke channel fail with one error. */
  failAllInvokes(error: IpcError): void;
  /** Arguments each invoke channel was called with, in call order. */
  readonly calls: Readonly<Record<InvokeChannelKey, readonly unknown[][]>>;
  /** Live subscriber count for a push channel — 0 after a correct unmount. */
  listenerCount(channel: EventChannelKey): number;
}

/**
 * Per-namespace method overrides. Anything omitted keeps the default. An
 * overridden method replaces the default entirely, including its call
 * recording and its `failInvoke` behaviour.
 */
export interface StubApiOverrides {
  pods?: Partial<OrcastrateApi['pods']>;
  lanes?: Partial<OrcastrateApi['lanes']>;
  events?: Partial<OrcastrateApi['events']>;
  permissions?: Partial<OrcastrateApi['permissions']>;
  dialog?: Partial<OrcastrateApi['dialog']>;
  app?: Partial<OrcastrateApi['app']>;
  on?: Partial<OrcastrateApi['on']>;
}

const INVOKE_KEYS = Object.keys(INVOKE_CHANNELS) as InvokeChannelKey[];
const EVENT_KEYS = Object.keys(EVENT_CHANNELS) as EventChannelKey[];

export function stubOrcastrateApi(overrides: StubApiOverrides = {}): StubOrcastrateApi {
  const failures = new Map<InvokeChannelKey, IpcError>();
  const calls = {} as Record<InvokeChannelKey, unknown[][]>;
  for (const key of INVOKE_KEYS) calls[key] = [];

  const listeners = new Map<EventChannelKey, Set<(payload: never) => void>>();
  for (const key of EVENT_KEYS) listeners.set(key, new Set());

  /**
   * Wraps one channel's happy path. The returned function records the call,
   * short-circuits to the registered failure if there is one, and otherwise
   * resolves `{ ok: true, value }`. It never rejects and never throws — that
   * is the error discipline of the frozen `ipc.ts`.
   */
  function channel<A extends unknown[], T>(
    key: InvokeChannelKey,
    value: (...args: A) => T,
  ): (...args: A) => Promise<IpcResult<T>> {
    return async (...args: A): Promise<IpcResult<T>> => {
      calls[key].push(args);
      const failure = failures.get(key);
      if (failure !== undefined) return { ok: false, error: failure };
      return { ok: true, value: value(...args) };
    };
  }

  function subscribe<P>(key: EventChannelKey): (cb: (payload: P) => void) => Unsubscribe {
    return (cb: (payload: P) => void): Unsubscribe => {
      const set = listeners.get(key);
      // `listeners` is seeded from EVENT_KEYS above, so this is unreachable;
      // `noUncheckedIndexedAccess` still requires the branch.
      if (set === undefined) return () => {};
      const wrapped = cb as (payload: never) => void;
      set.add(wrapped);
      return () => {
        set.delete(wrapped);
      };
    };
  }

  function emitTo<P>(key: EventChannelKey, payload: P): void {
    const set = listeners.get(key);
    if (set === undefined) return;
    for (const cb of [...set]) (cb as unknown as (p: P) => void)(payload);
  }

  const stub: StubOrcastrateApi = {
    pods: {
      list: channel('podList', (): Pod[] => []),
      create: channel('podCreate', (req: CreatePodRequest): Pod =>
        makeStubPod({
          title: req.title,
          cwd: req.cwd,
          permissionMode: req.permissionMode,
          envOverrides: req.envOverrides ?? {},
        }),
      ),
      update: channel('podUpdate', (req: UpdatePodRequest): Pod =>
        makeStubPod({
          id: req.podId,
          ...(req.title === undefined ? {} : { title: req.title }),
          ...(req.tabOrder === undefined ? {} : { tabOrder: req.tabOrder }),
          ...(req.permissionMode === undefined ? {} : { permissionMode: req.permissionMode }),
          ...(req.envOverrides === undefined ? {} : { envOverrides: req.envOverrides }),
        }),
      ),
      delete: channel('podDelete', (_podId: PodId): void => undefined),
      open: channel('podOpen', (podId: PodId): Pod => makeStubPod({ id: podId, status: 'running' })),
      close: channel('podClose', (_podId: PodId): void => undefined),
      reconnect: channel('podReconnect', (podId: PodId): Pod =>
        makeStubPod({ id: podId, status: 'running' }),
      ),
      send: channel('podSend', (_podId: PodId, _text: string): void => undefined),
      interrupt: channel('podInterrupt', (_podId: PodId): void => undefined),
      setPermissionMode: channel(
        'podSetPermissionMode',
        (_podId: PodId, _mode: PermissionMode): void => undefined,
      ),
      ...overrides.pods,
    },
    lanes: {
      list: channel('laneList', (_podId: PodId): Lane[] => []),
      ...overrides.lanes,
    },
    events: {
      read: channel(
        'eventsRead',
        (_req: ReadEventsRequest): ReadEventsResponse => ({ events: [], hasMore: false }),
      ),
      ...overrides.events,
    },
    permissions: {
      respond: channel('permissionRespond', (_req: PermissionRespondRequest): void => undefined),
      ...overrides.permissions,
    },
    dialog: {
      // A picked directory, not a cancellation: cancelling is the interesting
      // case and a test that wants it overrides this or fails the channel.
      pickDirectory: channel(
        'dialogPickDirectory',
        (): PickDirectoryResponse => ({ path: '/stub/workspace' }),
      ),
      ...overrides.dialog,
    },
    app: {
      routingMode: channel('appRoutingMode', (): RoutingMode => 'lanes'),
      ...overrides.app,
    },
    on: {
      podEvent: subscribe<PodEventPush>('podEvent'),
      podStatus: subscribe<PodStatusPush>('podStatus'),
      laneChanged: subscribe<LaneChangedPush>('laneChanged'),
      permissionRequested: subscribe<PermissionRequestedPush>('permissionRequested'),
      permissionResolved: subscribe<PermissionResolvedPush>('permissionResolved'),
      ...overrides.on,
    },

    emit: {
      podEvent: (push) => emitTo('podEvent', push),
      podStatus: (push) => emitTo('podStatus', push),
      laneChanged: (push) => emitTo('laneChanged', push),
      permissionRequested: (push) => emitTo('permissionRequested', push),
      permissionResolved: (push) => emitTo('permissionResolved', push),
    },

    failInvoke(channelKey, error) {
      failures.set(channelKey, error);
    },
    clearInvokeFailure(channelKey) {
      failures.delete(channelKey);
    },
    failAllInvokes(error) {
      for (const key of INVOKE_KEYS) failures.set(key, error);
    },
    calls,
    listenerCount(channelKey) {
      return listeners.get(channelKey)?.size ?? 0;
    },
  };

  return stub;
}

/** Convenience for the failure path: `failInvoke('podSend', ipcError('IO', 'disk full'))`. */
export function ipcError(code: IpcError['code'], message: string): IpcError {
  return { code, message };
}

/** Narrowing helper so a test can read `.value` without a cast. */
export function expectOk<T>(result: IpcResult<T>): T {
  if (!result.ok) throw new Error(`expected ok, got ${result.error.code}: ${result.error.message}`);
  return result.value;
}
