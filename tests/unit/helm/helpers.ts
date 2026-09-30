/**
 * Fixtures for the Helm suite.
 *
 * EVERY path any test in this directory touches is built here, and every one of
 * them lives under a directory created by `mkdtempSync(join(tmpdir(),
 * 'orcastrate-helm-'))` and removed in `cleanupHelm`. Nothing reads or writes a
 * real developer settings file — a suite for a service whose entire purpose is
 * to overwrite `settings.json` must not be able to overwrite the one belonging
 * to the person running it. `hygiene.test.ts` asserts that by source scan.
 *
 * The clock is injected and hand-advanced. Backup and temp file names are
 * derived from it, so no test sleeps and no assertion depends on the machine's
 * wall clock.
 */

import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';

import type {
  HelmChangedPush,
  HelmSaveRequest,
  HelmService,
  HelmServiceDeps,
} from '../../../src/shared/contracts/helm';
import type { PodDirectory } from '../../../src/shared/contracts/panel-host';
import { createHelmService } from '../../../src/main/helm';
import { IpcFailure } from '../../../src/main/ipc/failure';

const tempRoots: string[] = [];
const services: HelmService[] = [];

/** A fresh, empty, tracked temp tree. The only place a test may write. */
export function tempRoot(): string {
  const dir = mkdtempSync(join(tmpdir(), 'orcastrate-helm-'));
  tempRoots.push(dir);
  return dir;
}

export interface TestClock {
  (): Date;
  /** Moves the clock forward. Backup names change only because of this. */
  advance(ms: number): void;
  set(iso: string): void;
}

/** Starts at a fixed instant so every derived filename is assertable. */
export function testClock(startIso = '2026-08-19T09:00:00.000Z'): TestClock {
  let current = new Date(startIso).getTime();
  const clock = (() => new Date(current)) as TestClock;
  clock.advance = (ms: number): void => {
    current += ms;
  };
  clock.set = (iso: string): void => {
    current = new Date(iso).getTime();
  };
  return clock;
}

export interface Harness {
  root: string;
  claudeHome: string;
  /** `<claudeHome>/settings.json` — the user scope's file. */
  userSettingsPath: string;
  pods: PodDirectory[];
  pushes: HelmChangedPush[];
  clock: TestClock;
  service: HelmService;
  deps: HelmServiceDeps;
  /** Registers a Pod with its own temp `cwd` and returns it. */
  addPod(podId: string, title?: string): PodDirectory;
  /** `<pod.cwd>/.claude/settings.json`. */
  projectPath(podId: string): string;
  /** `<pod.cwd>/.claude/settings.local.json`. */
  projectLocalPath(podId: string): string;
}

export interface HarnessOptions {
  /** Defaults to FALSE. Every conflict test proves the authoritative path. */
  watchEnabled?: boolean;
  clock?: TestClock;
}

export function makeHarness(options: HarnessOptions = {}): Harness {
  const root = tempRoot();
  const claudeHome = join(root, 'claude-home');
  mkdirSync(claudeHome, { recursive: true });

  const pods: PodDirectory[] = [];
  const pushes: HelmChangedPush[] = [];
  const clock = options.clock ?? testClock();

  const deps: HelmServiceDeps = {
    claudeHome,
    pods: () => pods,
    now: clock,
    emitChanged: (push) => {
      pushes.push(push);
    },
    watchEnabled: options.watchEnabled ?? false,
  };

  const service = createHelmService(deps);
  services.push(service);

  return {
    root,
    claudeHome,
    userSettingsPath: join(claudeHome, 'settings.json'),
    pods,
    pushes,
    clock,
    service,
    deps,
    addPod(podId, title = `Pod ${podId}`) {
      const cwd = join(root, 'pods', podId);
      mkdirSync(cwd, { recursive: true });
      const pod: PodDirectory = { podId, title, cwd };
      pods.push(pod);
      return pod;
    },
    projectPath(podId) {
      const pod = pods.find((candidate) => candidate.podId === podId);
      if (pod === undefined) throw new Error(`no test pod ${podId}`);
      return join(pod.cwd, '.claude', 'settings.json');
    },
    projectLocalPath(podId) {
      const pod = pods.find((candidate) => candidate.podId === podId);
      if (pod === undefined) throw new Error(`no test pod ${podId}`);
      return join(pod.cwd, '.claude', 'settings.local.json');
    },
  };
}

/** Writes a settings file (creating its directory) as some OTHER writer would. */
export function writeOutOfBand(path: string, contents: unknown): string {
  mkdirSync(join(path, '..'), { recursive: true });
  const text = typeof contents === 'string' ? contents : `${JSON.stringify(contents, null, 2)}\n`;
  writeFileSync(path, text, 'utf8');
  return text;
}

export function readText(path: string): string {
  return readFileSync(path, 'utf8');
}

/** Every file under `dir`, as paths relative to it, sorted. Directories excluded. */
export function listFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (current: string): void => {
    for (const name of readdirSync(current)) {
      const full = join(current, name);
      if (statSync(full).isDirectory()) walk(full);
      else out.push(relative(dir, full));
    }
  };
  walk(dir);
  return out.sort();
}

/** A save request that echoes a loaded document back unchanged. */
export function draftFrom(
  scopeId: string,
  doc: Awaited<ReturnType<HelmService['load']>>,
  overrides: Partial<HelmSaveRequest> = {},
): HelmSaveRequest {
  return {
    scopeId,
    revision: doc.revision,
    managed: doc.managed,
    unmanaged: doc.unmanaged,
    hooksJson: doc.hooksJson,
    ...overrides,
  };
}

/**
 * Requires `fn` to reject with an `IpcFailure` and hands it back so the test can
 * assert on `.code`. Anything else propagates, so a genuine bug is never
 * swallowed as "the expected failure".
 */
export async function catchIpcFailure(fn: () => Promise<unknown>): Promise<IpcFailure> {
  try {
    await fn();
  } catch (err) {
    if (err instanceof IpcFailure) return err;
    throw err;
  }
  throw new Error('expected an IpcFailure, but the call resolved');
}

/** Lets pending `setImmediate` work (the watcher's coalescing) run to quiescence. */
export async function settle(turns = 6): Promise<void> {
  for (let i = 0; i < turns; i += 1) {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

/** Tears down every service and temp tree. Call from `afterEach`. */
export function cleanupHelm(): void {
  for (const service of services.splice(0)) {
    try {
      service.dispose();
    } catch {
      /* already disposed by the test */
    }
  }
  for (const dir of tempRoots.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
}
