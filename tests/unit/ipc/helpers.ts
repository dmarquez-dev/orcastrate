/**
 * Harness for the IPC / PodManager assembly suite.
 *
 * The pipeline under test is the REAL one — the production `LaneRouter`, the
 * production `PodRunner`, the production SQLite store — assembled exactly as
 * `src/main/index.ts` assembles it. Only three things are doubles, and each is
 * a seam the production code already declares:
 *
 *   - the SDK boundary (`SdkBridge`), driven from `tests/fixtures/protocol/`,
 *     so nothing spawns `claude` and nothing needs an API key;
 *   - `ipcMain`, so no Electron runtime is required;
 *   - the directory picker and the `isDirectory` probe, so no test depends on
 *     the developer's filesystem layout.
 *
 * The store is `:memory:`. Ids and timestamps come from injected counters, so a
 * replay is byte-identical run to run.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { EventStore } from '../../../src/shared/contracts/event-store';
import type { Pod, PodId } from '../../../src/shared/contracts/events';
import type { IpcResult, PodSessionRemover } from '../../../src/shared/contracts/ipc';
import type { CreatePodRunner } from '../../../src/shared/contracts/pod-runner';
import type { IpcMainLike } from '../../../src/main/ipc';
import { registerIpcHandlers } from '../../../src/main/ipc';
import { createPodRunnerWith, parseStreamLine } from '../../../src/main/pod';
import type { PodStreamItem } from '../../../src/main/pod';
import { createPushes, PodManager, ROUTING_MODE } from '../../../src/main/pod-manager';
import { openEventStore } from '../../../src/main/store';
import { EVENT_CHANNELS } from '../../../src/shared/contracts/ipc';
import { makeFakeSdk, type FakeSdk } from '../pod/helpers';
import {
  fakeBeachcomberService,
  fakeHelmService,
  type FakeBeachcomberService,
  type FakeHelmService,
} from './panel-fakes';

export const FIXTURE_DIR = join(
  fileURLToPath(new URL('../../', import.meta.url)),
  'fixtures',
  'protocol',
);

export function fixtureItems(name: string): PodStreamItem[] {
  return readFileSync(join(FIXTURE_DIR, name), 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.length > 0)
    .map(parseStreamLine);
}

export interface FixtureFindings {
  recommendedRoutingMode: string;
}

export function findings(): FixtureFindings {
  return JSON.parse(readFileSync(join(FIXTURE_DIR, 'findings.json'), 'utf8')) as FixtureFindings;
}

export interface Pushed {
  channel: string;
  payload: unknown;
}

export interface Harness {
  store: EventStore;
  manager: PodManager;
  pushed: Pushed[];
  /** Every channel a handler was registered on, in registration order. */
  channels: string[];
  /** How many PodRunners were constructed, per Pod. */
  runnerCount(podId: PodId): number;
  /** The fake SDK backing the newest runner for a Pod. */
  sdk(podId: PodId): FakeSdk;
  invoke<T>(channel: string, ...args: unknown[]): Promise<IpcResult<T>>;
  /** Payloads pushed on one channel, in order. */
  pushesOn<T>(channel: string): T[];
  /**
   * Everything PodManager logged. The drift warnings are DIAGNOSTIC OUTPUT
   * under test: a warning fired during a clean fixture drive means the pipeline
   * silently corrected something, which is exactly how a routing regression
   * hides. Tests assert this stays empty.
   */
  logged: { level: 'warn' | 'error'; args: unknown[] }[];
  /**
   * The two injected panel ports, so a test can arm a failure or read what the
   * boundary forwarded. They are FAKES: this suite tests the transport, and
   * `src/main/ipc/**` is written against the interface, not the implementation.
   */
  beachcomber: FakeBeachcomberService;
  helm: FakeHelmService;
  /**
   * Every Pod handed to the injected `deletePodSession` port, in order. A
   * recording list rather than a counter: a port that was never called and a
   * port that was called with the wrong Pod must not read the same.
   */
  sessionRemovals: Pod[];
  /** Whatever `pickDirectory` should answer next. */
  setPickedDirectory(path: string | null): void;
  /** Force the directory picker to fail. */
  failPickDirectory(err: unknown): void;
  dispose(): Promise<void>;
}

export interface HarnessOptions {
  /** Answers PodManager's cwd capability check. Default: everything is a directory. */
  isDirectory?: (path: string) => boolean;
  /**
   * The Pod-session port. Default: a recording fake that answers `'not-found'`
   * and reaches no disk — this suite tests the TRANSPORT, and the real remover
   * is exercised in `tests/unit/pod-session/`. A test that wants the real one
   * over a temp tree supplies it here.
   */
  deletePodSession?: PodSessionRemover;
}

export function makeHarness(options: HarnessOptions = {}): Harness {
  const store = openEventStore(':memory:');
  store.migrate();

  const pushed: Pushed[] = [];
  const logged: { level: 'warn' | 'error'; args: unknown[] }[] = [];
  const sdks = new Map<PodId, FakeSdk>();
  const runnerCounts = new Map<PodId, number>();

  const createRunner: CreatePodRunner = (runnerOptions) => {
    const fake = makeFakeSdk({ autoInitialize: true });
    sdks.set(runnerOptions.podId, fake);
    runnerCounts.set(runnerOptions.podId, (runnerCounts.get(runnerOptions.podId) ?? 0) + 1);
    return createPodRunnerWith(fake.bridge)(runnerOptions);
  };

  let ids = 0;
  let clock = 0;

  const manager = new PodManager({
    store,
    createRunner,
    push: createPushes((channel, payload) => {
      pushed.push({ channel, payload });
    }),
    routingMode: ROUTING_MODE,
    newId: () => `id-${(ids += 1)}`,
    now: () => new Date(Date.UTC(2026, 7, 18, 0, 0, (clock += 1))).toISOString(),
    isDirectory: options.isDirectory ?? ((): boolean => true),
    // Captured rather than printed: a test asserts on what was logged, and the
    // suite stays quiet.
    logger: {
      warn: (...args: unknown[]) => logged.push({ level: 'warn', args }),
      error: (...args: unknown[]) => logged.push({ level: 'error', args }),
    },
  });

  const handlers = new Map<
    string,
    (event: unknown, ...args: unknown[]) => Promise<unknown> | unknown
  >();
  const ipcMain: IpcMainLike = {
    handle(channel, listener) {
      handlers.set(channel, listener);
    },
  };

  let picked: string | null = 'C:\\picked';
  let pickError: unknown = null;

  const sessionRemovals: Pod[] = [];
  const deletePodSession: PodSessionRemover =
    options.deletePodSession ??
    (async (pod: Pod) => {
      sessionRemovals.push(pod);
      return { outcome: 'not-found' as const, error: null };
    });

  const beachcomber = fakeBeachcomberService();
  // The same `pushed` sink PodManager writes to. In production T8 supplies
  // `sendToRenderers` here, which is the same function it supplies to
  // `createPushes` — so this harness models the one-sink arrangement rather
  // than inventing a second channel for helm.
  const helm = fakeHelmService((push) => {
    pushed.push({ channel: EVENT_CHANNELS.helmChanged, payload: push });
  });

  const channels = registerIpcHandlers({
    ipcMain,
    manager,
    pickDirectory: async () => {
      if (pickError !== null) throw pickError;
      return picked;
    },
    beachcomber,
    helm,
    deletePodSession,
  });

  return {
    store,
    sessionRemovals,
    manager,
    pushed,
    beachcomber,
    helm,
    logged,
    channels,
    runnerCount: (podId) => runnerCounts.get(podId) ?? 0,
    sdk(podId) {
      const fake = sdks.get(podId);
      if (!fake) throw new Error(`no runner was created for pod ${podId}`);
      return fake;
    },
    async invoke<T>(channel: string, ...args: unknown[]): Promise<IpcResult<T>> {
      const handler = handlers.get(channel);
      if (!handler) throw new Error(`no handler registered for ${channel}`);
      return (await handler(null, ...args)) as IpcResult<T>;
    },
    pushesOn<T>(channel: string): T[] {
      return pushed.filter((entry) => entry.channel === channel).map((entry) => entry.payload as T);
    },
    setPickedDirectory(path) {
      picked = path;
      pickError = null;
    },
    failPickDirectory(err) {
      pickError = err;
    },
    async dispose() {
      await manager.disposeAll();
      store.close();
    },
  };
}

/** Lets pending microtasks and timers run. */
export function tick(times = 1): Promise<void> {
  return new Promise((resolve) => {
    let remaining = times;
    const step = (): void => {
      remaining -= 1;
      if (remaining <= 0) resolve();
      else setTimeout(step, 0);
    };
    setTimeout(step, 0);
  });
}

/** Opens a Pod through the real IPC surface and returns its id. */
export async function openPod(
  harness: Harness,
  overrides: { title?: string; cwd?: string } = {},
): Promise<PodId> {
  const created = await harness.invoke<{ id: PodId }>('pod:create', {
    title: overrides.title ?? 'Test Pod',
    // A real directory: PodRunner runs its own `statSync` check before it
    // spawns anything, and that one is not injectable.
    cwd: overrides.cwd ?? process.cwd(),
    permissionMode: 'default',
  });
  if (!created.ok) throw new Error(`pod:create failed: ${created.error.code}`);
  const podId = created.value.id;

  const opened = await harness.invoke('pod:open', podId);
  if (!opened.ok) throw new Error(`pod:open failed: ${opened.error.code}`);
  return podId;
}

/** Feeds a captured fixture through the assembled pipeline. */
export async function driveFixture(
  harness: Harness,
  podId: PodId,
  fixture: string,
): Promise<void> {
  const sdk = harness.sdk(podId);
  for (const item of fixtureItems(fixture)) sdk.emit(item);
  await tick(3);
}
