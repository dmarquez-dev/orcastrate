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
  PodCommandsPush,
  CreatePodRequest,
  DeletePodRequest,
  PodDeletionResult,
  ReadEventsRequest,
  ReadEventsResponse,
  UpdatePodRequest,
  Unsubscribe,
} from '@shared/contracts/ipc';
import { EVENT_CHANNELS, INVOKE_CHANNELS } from '@shared/contracts/ipc';
import type { Lane, PermissionMode, Pod, PodId } from '@shared/contracts/events';
import type { RoutingMode } from '@shared/contracts/lane-router';
import type {
  BeachcomberEntry,
  BeachcomberPreview,
  BeachcomberPreviewRequest,
  BeachcomberScan,
  BeachcomberTrashRequest,
  BeachcomberTrashResult,
} from '@shared/contracts/beachcomber';
import type {
  HelmChangedPush,
  HelmDocument,
  HelmSaveRequest,
  HelmSaveResult,
  HelmScope,
  HelmScopeId,
} from '@shared/contracts/helm';

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
  podFork: ['pods', 'fork'],
  laneList: ['lanes', 'list'],
  eventsRead: ['events', 'read'],
  permissionRespond: ['permissions', 'respond'],
  dialogPickDirectory: ['dialog', 'pickDirectory'],
  appRoutingMode: ['app', 'routingMode'],
  beachcomberScan: ['beachcomber', 'scan'],
  beachcomberPreview: ['beachcomber', 'preview'],
  beachcomberTrash: ['beachcomber', 'trash'],
  helmScopes: ['helm', 'listScopes'],
  helmLoad: ['helm', 'load'],
  helmSave: ['helm', 'save'],
} as const satisfies Record<InvokeChannelKey, readonly [string, string]>;

/** The mapping from a frozen push-channel key to its `api.on.*` subscriber. */
export const EVENT_CHANNEL_METHODS = {
  podEvent: 'podEvent',
  podStatus: 'podStatus',
  laneChanged: 'laneChanged',
  permissionRequested: 'permissionRequested',
  permissionResolved: 'permissionResolved',
  helmChanged: 'helmChanged',
  podCommands: 'podCommands',
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
    // RECONSIDERED for the derived-openness meaning of `status`. `'idle'` now
    // reads as OPEN (main holds a live runner between turns), so defaulting to
    // it would hand every suite an open Pod it never asked for. A Pod is BORN
    // `'closed'` — see `PodStatus` in `events.ts` — and that is the honest
    // default here too.
    status: 'closed',
    createdAt: '2026-01-01T00:00:00.000Z',
    lastActiveAt: '2026-01-01T00:00:00.000Z',
    // A stub Pod was never forked.
    forkedFromPodId: null,
    forkedFromCcSessionId: null,
    ...overrides,
  };
}

/**
 * THE DEFAULT POD-LIST FIXTURE: two Pods on OPPOSITE sides of the openness
 * derivation, in tab order.
 *
 * Openness is a pure function of `status` now, so a fixture holding one Pod —
 * or holding several that all fall the same side — lets an assertion pass by
 * guessing whichever constant the renderer happens to produce about
 * everything. `pod-1` is `'closed'` and `pod-2` is `'running'`, so only a
 * reply-driven answer satisfies both rows at once.
 *
 * `overrides` are applied to BOTH Pods, so a suite can vary an unrelated field
 * without losing the opposition; pass explicit `makeStubPod` calls instead
 * when the statuses themselves are the subject.
 */
export function makeStubPods(overrides: Partial<Pod> = {}): Pod[] {
  return [
    makeStubPod({ id: 'pod-1', title: 'Closed Pod', tabOrder: 0, status: 'closed', ...overrides }),
    makeStubPod({ id: 'pod-2', title: 'Running Pod', tabOrder: 1, status: 'running', ...overrides }),
  ];
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
// Beachcomber and Helm fixtures
//
// THESE ARE DELIBERATELY RICH, and that is a decision rather than an accident.
// A default that carries only one bland row makes every downstream suite build
// its own corpus, and three hand-built corpora drift from the contract in
// three different directions. So the default scan below carries every shape
// the panel has to render — a blocked row, an orphan, a guessed path, and all
// four roots populated — and the default Helm document carries the unmanaged
// keys and the hooks text that "round-trips untouched" is actually about.
//
// IT DOES NOT CARRY AN EMPTY ROOT, and the claim that it did stood in this
// comment unchecked: every one of `projects`, `shellSnapshots`, `fileHistory`
// and `pasteCache` has at least one entry below. A suite that needs the
// empty-root rendering must build it — `makeStubBeachcomberScan({ entries })`
// recomputes the per-root totals from whatever it is handed — rather than
// believe this paragraph.
//
// Every value here is contract-valid, including the rule that is easiest to
// break by hand: `orphan` may only ever be true when
// `pathSource === 'session-record'`, because "this path does not exist" is
// unfalsifiable when the path itself is a guess.
// ---------------------------------------------------------------------------

/** Sorted by root order, then `sizeBytes` descending — as the contract says. */
export function makeStubBeachcomberEntries(): BeachcomberEntry[] {
  return [
    {
      // BLOCKED, and it names what blocked it, so the panel can say "Stub Pod
      // is using this" instead of "blocked".
      id: 'entry-projects-blocked',
      root: 'projects',
      name: 'C--stub-workspace',
      displayPath: 'C:\\stub\\workspace',
      pathSource: 'session-record',
      sizeBytes: 4_194_304,
      fileCount: 12,
      lastModified: '2026-01-03T00:00:00.000Z',
      sessionCount: 5,
      orphan: false,
      blocked: 'pod-cwd',
      blockedBy: { podId: 'pod-1', title: 'Stub Pod' },
    },
    {
      // ORPHAN. Legal only because the path came from a session record.
      id: 'entry-projects-orphan',
      root: 'projects',
      name: 'C--stub-deleted-project',
      displayPath: 'C:\\stub\\deleted-project',
      pathSource: 'session-record',
      sizeBytes: 1_048_576,
      fileCount: 6,
      lastModified: '2025-11-01T00:00:00.000Z',
      sessionCount: 2,
      orphan: true,
      blocked: null,
      blockedBy: null,
    },
    {
      // A GUESS. The directory name contains a hyphen, which is exactly the
      // case where decoding is ambiguous — so `orphan` stays false no matter
      // what the filesystem says.
      id: 'entry-projects-decoded',
      root: 'projects',
      name: 'C--stub-repos-dir-ect',
      displayPath: 'C:\\stub\\repos\\dir-ect',
      pathSource: 'decoded-name',
      sizeBytes: 262_144,
      fileCount: 3,
      lastModified: '2026-01-02T00:00:00.000Z',
      sessionCount: 1,
      orphan: false,
      blocked: null,
      blockedBy: null,
    },
    {
      id: 'entry-shell-1',
      root: 'shellSnapshots',
      name: 'snapshot-bash-1735689600.sh',
      displayPath: '~/.claude/shell-snapshots/snapshot-bash-1735689600.sh',
      pathSource: 'absolute-path',
      sizeBytes: 65_536,
      fileCount: 1,
      lastModified: '2026-01-01T12:00:00.000Z',
      sessionCount: null,
      orphan: false,
      blocked: null,
      blockedBy: null,
    },
    {
      id: 'entry-history-1',
      root: 'fileHistory',
      name: 'a1b2c3d4',
      displayPath: '~/.claude/file-history/a1b2c3d4',
      pathSource: 'absolute-path',
      sizeBytes: 32_768,
      fileCount: 9,
      lastModified: '2026-01-01T09:00:00.000Z',
      sessionCount: null,
      orphan: false,
      blocked: null,
      blockedBy: null,
    },
    {
      id: 'entry-paste-1',
      root: 'pasteCache',
      name: 'paste-0001.png',
      displayPath: '~/.claude/paste-cache/paste-0001.png',
      pathSource: 'absolute-path',
      sizeBytes: 8_192,
      fileCount: 1,
      lastModified: '2026-01-01T08:00:00.000Z',
      sessionCount: null,
      orphan: false,
      blocked: null,
      blockedBy: null,
    },
  ];
}

/** A full four-root scan. Every override is shallow — pass whole fields. */
export function makeStubBeachcomberScan(overrides: Partial<BeachcomberScan> = {}): BeachcomberScan {
  const entries = overrides.entries ?? makeStubBeachcomberEntries();
  const bytesIn = (root: BeachcomberEntry['root']): number =>
    entries.filter((e) => e.root === root).reduce((sum, e) => sum + e.sizeBytes, 0);
  const countIn = (root: BeachcomberEntry['root']): number =>
    entries.filter((e) => e.root === root).length;

  return {
    scanId: 'stub-scan-1',
    scannedAt: '2026-01-03T00:00:00.000Z',
    roots: [
      {
        key: 'projects',
        displayPath: '~/.claude/projects',
        present: true,
        entryCount: countIn('projects'),
        totalBytes: bytesIn('projects'),
        error: null,
      },
      {
        key: 'shellSnapshots',
        displayPath: '~/.claude/shell-snapshots',
        present: true,
        entryCount: countIn('shellSnapshots'),
        totalBytes: bytesIn('shellSnapshots'),
        error: null,
      },
      {
        key: 'fileHistory',
        displayPath: '~/.claude/file-history',
        present: true,
        entryCount: countIn('fileHistory'),
        totalBytes: bytesIn('fileHistory'),
        error: null,
      },
      {
        key: 'pasteCache',
        displayPath: '~/.claude/paste-cache',
        present: true,
        entryCount: countIn('pasteCache'),
        totalBytes: bytesIn('pasteCache'),
        error: null,
      },
    ],
    entries,
    ...overrides,
  };
}

/**
 * A preview of whatever ids were asked for, drawn from the default scan.
 * An id the scan does not know is REFUSED rather than dropped — the preview's
 * whole job is to say no before the confirm button, and a blocked row is
 * refused for the same reason with a message that says what to do about it.
 */
export function makeStubBeachcomberPreview(ids: readonly string[]): BeachcomberPreview {
  const entries = makeStubBeachcomberEntries();
  const preview: BeachcomberPreview = { items: [], refused: [], totalBytes: 0, totalFiles: 0 };

  for (const id of ids) {
    const entry = entries.find((candidate) => candidate.id === id);
    if (entry === undefined) {
      // No entry, so no displayPath to copy: the id is the only name the stub
      // has for it. (Main throws NOT_FOUND here instead; this stub refuses.)
      preview.refused.push({
        id,
        displayPath: id,
        reason: 'This entry is not part of the current scan. Rescan and try again.',
      });
      continue;
    }
    if (entry.blocked !== null) {
      preview.refused.push({
        id,
        displayPath: entry.displayPath,
        reason: `${entry.blockedBy?.title ?? 'A Pod'} is using this directory. Delete the Pod first if you want to clear it.`,
      });
      continue;
    }
    preview.items.push({
      id: entry.id,
      displayPath: entry.displayPath,
      root: entry.root,
      sizeBytes: entry.sizeBytes,
      fileCount: entry.fileCount,
      sampleNames: ['session-a1b2.jsonl', 'session-c3d4.jsonl'],
      stale: false,
    });
    preview.totalBytes += entry.sizeBytes;
    preview.totalFiles += entry.fileCount;
  }
  return preview;
}

/**
 * The user scope plus BOTH project scopes for one Pod, because the pair is the
 * thing the form has to get right and a single scope hides the bug where
 * `settings.local.json` silently resolves to `settings.json`.
 */
export function makeStubHelmScopes(): HelmScope[] {
  return [
    {
      id: 'user',
      kind: 'user',
      podId: null,
      label: 'All projects',
      displayPath: '~/.claude/settings.json',
      exists: true,
    },
    {
      id: 'project:pod-1',
      kind: 'project',
      podId: 'pod-1',
      label: 'Stub Pod',
      displayPath: 'C:\\stub\\workspace\\.claude\\settings.json',
      exists: true,
    },
    {
      // Absent is the NORMAL case for the gitignored overlay, not an error.
      id: 'projectLocal:pod-1',
      kind: 'projectLocal',
      podId: 'pod-1',
      label: 'Stub Pod',
      displayPath: 'C:\\stub\\workspace\\.claude\\settings.local.json',
      exists: false,
    },
  ];
}

/**
 * A document with real unmanaged keys and real hooks text. Both matter: a save
 * that loses `statusLine` or flattens `hooks` is the failure this feature is
 * most likely to ship, and a default that carried neither would let a suite
 * pass without ever exercising the round trip.
 */
export function makeStubHelmDocument(
  scopeId: HelmScopeId = 'user',
  overrides: Partial<HelmDocument> = {},
): HelmDocument {
  const scopes = makeStubHelmScopes();
  const scope = scopes.find((candidate) => candidate.id === scopeId);
  return {
    // `scopes` is a non-empty literal, so index 0 always exists;
    // `noUncheckedIndexedAccess` still wants the branch spelled out.
    scope: scope ?? scopes[0] ?? {
      id: scopeId,
      kind: 'user',
      podId: null,
      label: 'All projects',
      displayPath: '~/.claude/settings.json',
      exists: true,
    },
    revision: { sha256: 'a'.repeat(64), sizeBytes: 512, mtimeMs: 1_767_225_600_000 },
    managed: {
      model: 'claude-sonnet-4-6',
      permissionsAllow: ['Bash(npm run test:*)', 'Read(~/.claude/**)'],
      permissionsDeny: ['Bash(rm:*)'],
      env: { CLAUDE_CODE_ENABLE_TELEMETRY: '0' },
      crossSessionInbound: 'accept',
    },
    // Two keys Helm does not manage. They must survive a round trip verbatim.
    unmanaged: {
      statusLine: { type: 'command', command: 'npx ccstatusline@latest' },
      outputStyle: 'Explanatory',
    },
    hooksJson: JSON.stringify(
      {
        PreToolUse: [
          { matcher: 'Bash', hooks: [{ type: 'command', command: 'echo pre-bash' }] },
        ],
      },
      null,
      2,
    ),
    parseError: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// The stub
// ---------------------------------------------------------------------------

/** Drives every push channel `EVENT_CHANNELS` declares. Each call is
 *  synchronous and fans out the SAME payload object to every live subscriber;
 *  a subscriber added during the fan-out is not called for the in-flight
 *  emit. */
export interface StubEmitters {
  podEvent(push: PodEventPush): void;
  podStatus(push: PodStatusPush): void;
  laneChanged(push: LaneChangedPush): void;
  permissionRequested(push: PermissionRequestedPush): void;
  permissionResolved(push: PermissionResolvedPush): void;
  /** Advisory. Drives the staleness banner, never the save safety. */
  helmChanged(push: HelmChangedPush): void;
  /** One Pod's whole slash-command list, as main pushes it. */
  podCommands(push: PodCommandsPush): void;
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
  beachcomber?: Partial<OrcastrateApi['beachcomber']>;
  helm?: Partial<OrcastrateApi['helm']>;
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
      // STAYS EMPTY. The zero-Pod reply is the first-run premise several
      // suites assert against by NOT overriding this channel, so it is not a
      // "default fixture" of Pods at all. `makeStubPods()` above is that
      // fixture, and it is the one that cannot be passed by guessing.
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
      /**
       * T0's widened channel: a `DeletePodRequest` in, a `PodDeletionResult`
       * out. `channel` records the whole ARGUMENT LIST, so `calls.podDelete`
       * holds the request object and a suite can assert what `deleteSession`
       * was actually sent rather than only that a delete happened.
       *
       * The default answers `'not-requested'` when the caller did not ask for
       * the session file, and `'trashed'` when it did — the two outcomes a
       * dialog test needs without overriding the channel. The three outcomes
       * that depend on the filesystem (`'no-session'`, `'not-found'`,
       * `'failed'`) are override territory: a default that guessed one of them
       * would let a suite assert a path it never exercised.
       */
      delete: channel('podDelete', (req: DeletePodRequest): PodDeletionResult => ({
        podId: req.podId,
        podDeleted: true,
        session: req.deleteSession ? 'trashed' : 'not-requested',
        sessionError: null,
      })),
      open: channel('podOpen', (podId: PodId): Pod => makeStubPod({ id: podId, status: 'running' })),
      close: channel('podClose', (_podId: PodId): void => undefined),
      reconnect: channel('podReconnect', (podId: PodId): Pod =>
        makeStubPod({ id: podId, status: 'running' }),
      ),
      /**
       * A fork is born `'closed'`, with its own session id and both ancestry
       * fields naming where it came from — the shape main resolves. Its id is
       * derived from the parent's so two forks of different Pods never collide
       * in a suite; a test that cares about the exact Pod overrides this.
       */
      fork: channel('podFork', (podId: PodId): Pod =>
        makeStubPod({
          id: `${podId}-fork`,
          title: 'Stub Pod (fork)',
          ccSessionId: 'cc-stub-fork',
          status: 'closed',
          forkedFromPodId: podId,
          forkedFromCcSessionId: 'cc-stub-parent',
        }),
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
    beachcomber: {
      scan: channel('beachcomberScan', (): BeachcomberScan => makeStubBeachcomberScan()),
      preview: channel('beachcomberPreview', (req: BeachcomberPreviewRequest): BeachcomberPreview =>
        // `req.ids` is non-optional in the contract, but this stub is also
        // driven by the coverage walk in `stub-api.test.ts`, which calls every
        // channel with one generic object. A default that threw there would
        // report as a missing method rather than as a bad call.
        makeStubBeachcomberPreview(req?.ids ?? []),
      ),
      trash: channel('beachcomberTrash', (req: BeachcomberTrashRequest): BeachcomberTrashResult => {
        const requested = req?.ids ?? [];
        const preview = makeStubBeachcomberPreview(requested);
        const trashed = preview.items.map((item) => item.id);
        return {
          trashed,
          // Partial success is a VALUE, not an error — the default models the
          // shape rather than the happy case only, so nothing downstream has
          // to invent a `failed` row to test the message that renders it.
          failed: [],
          refused: preview.refused,
          scan: makeStubBeachcomberScan({
            entries: makeStubBeachcomberEntries().filter(
              (entry) => !trashed.includes(entry.id),
            ),
          }),
        };
      }),
      ...overrides.beachcomber,
    },
    helm: {
      listScopes: channel('helmScopes', (): HelmScope[] => makeStubHelmScopes()),
      load: channel('helmLoad', (scopeId: HelmScopeId): HelmDocument =>
        makeStubHelmDocument(typeof scopeId === 'string' ? scopeId : 'user'),
      ),
      save: channel('helmSave', (req: HelmSaveRequest): HelmSaveResult => {
        const scopeId = typeof req?.scopeId === 'string' ? req.scopeId : 'user';
        return {
          // Freshly re-read after the write, so the form's revision is current
          // — and carrying back exactly what the caller sent, which is what
          // "preserves unmanaged keys" means from the renderer's side.
          document: makeStubHelmDocument(scopeId, {
            ...(req?.managed === undefined ? {} : { managed: req.managed }),
            ...(req?.unmanaged === undefined ? {} : { unmanaged: req.unmanaged }),
            ...(req?.hooksJson === undefined ? {} : { hooksJson: req.hooksJson }),
            revision: { sha256: 'b'.repeat(64), sizeBytes: 640, mtimeMs: 1_767_312_000_000 },
          }),
          backupDisplayPath: '~/.claude/settings.json.2026-01-03T000000.bak',
        };
      }),
      ...overrides.helm,
    },
    on: {
      podEvent: subscribe<PodEventPush>('podEvent'),
      podStatus: subscribe<PodStatusPush>('podStatus'),
      laneChanged: subscribe<LaneChangedPush>('laneChanged'),
      permissionRequested: subscribe<PermissionRequestedPush>('permissionRequested'),
      permissionResolved: subscribe<PermissionResolvedPush>('permissionResolved'),
      helmChanged: subscribe<HelmChangedPush>('helmChanged'),
      podCommands: subscribe<PodCommandsPush>('podCommands'),
      ...overrides.on,
    },

    emit: {
      podEvent: (push) => emitTo('podEvent', push),
      podStatus: (push) => emitTo('podStatus', push),
      laneChanged: (push) => emitTo('laneChanged', push),
      permissionRequested: (push) => emitTo('permissionRequested', push),
      permissionResolved: (push) => emitTo('permissionResolved', push),
      helmChanged: (push) => emitTo('helmChanged', push),
      podCommands: (push) => emitTo('podCommands', push),
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
