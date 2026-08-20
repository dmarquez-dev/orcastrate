/**
 * Shared fixtures for the Beachcomber suite.
 *
 * EVERY test in this directory runs against a `~/.claude` this module builds
 * inside a freshly created OS temp directory, mirroring
 * `tests/unit/store/helpers.ts`. Nothing here reads the developer's home
 * directory, and nothing here is ever handed Electron's real trash function —
 * the service's one dangerous capability is injected, so the suite exercises
 * the full deletion path without a single real file being at risk.
 */

import { mkdirSync, mkdtempSync, renameSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import type {
  BeachcomberServiceDeps,
  BeachcomberScan,
  BeachcomberEntry,
} from '../../../src/shared/contracts/beachcomber';
import type { PodDirectory } from '../../../src/shared/contracts/panel-host';

const createdRoots: string[] = [];

/** A fresh, empty synthetic `~/.claude` inside a tracked temp directory. */
export function makeClaudeHome(): string {
  const base = mkdtempSync(join(tmpdir(), 'orcastrate-beachcomber-'));
  createdRoots.push(base);
  const home = join(base, '.claude');
  mkdirSync(home, { recursive: true });
  return home;
}

/** A tracked temp directory with no `~/.claude` inside it yet. */
export function makeTempBase(): string {
  const base = mkdtempSync(join(tmpdir(), 'orcastrate-beachcomber-'));
  createdRoots.push(base);
  return base;
}

/** Tears down every temp tree this module made. Call from `afterEach`. */
export function cleanupFixtures(): void {
  for (const dir of createdRoots.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Writes `contents` at `base/relative`, creating parents. Returns the path. */
export function writeAt(base: string, relative: string, contents: string): string {
  const target = join(base, relative);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, contents, 'utf8');
  return target;
}

export function makeDir(base: string, relative: string): string {
  const target = join(base, relative);
  mkdirSync(target, { recursive: true });
  return target;
}

/** Pins a file's mtime so `lastModified` assertions never read the wall clock. */
export function setMtime(path: string, iso: string): void {
  const when = new Date(iso);
  utimesSync(path, when, when);
}

/** One JSONL line for a session transcript. */
export function jsonlLine(record: Record<string, unknown>): string {
  return `${JSON.stringify(record)}\n`;
}

/**
 * Creates `projects/<dirName>` with one session transcript whose records are
 * `records`, in order.
 */
export function makeProject(
  claudeHome: string,
  dirName: string,
  records: Record<string, unknown>[],
  sessionFile = 'session-a.jsonl',
): string {
  const dir = makeDir(claudeHome, join('projects', dirName));
  if (records.length > 0) {
    writeAt(dir, sessionFile, records.map(jsonlLine).join(''));
  }
  return dir;
}

// ---------------------------------------------------------------------------
// Injected dependencies
// ---------------------------------------------------------------------------

/** A counter-backed id source. Deterministic, and opaque with respect to paths. */
export function counterIds(prefix = 'bc'): () => string {
  let n = 0;
  return () => {
    n += 1;
    return `${prefix}-${String(n).padStart(6, '0')}`;
  };
}

/** A frozen clock. No test in this suite reads the ambient one. */
export function fixedNow(iso = '2026-08-19T12:00:00.000Z'): () => Date {
  return () => new Date(iso);
}

export interface FakeTrash {
  /** The injected port. */
  trashItem: (absolutePath: string) => Promise<void>;
  /** Every path the service asked to remove, in call order. */
  calls: string[];
}

/**
 * A stand-in for the real trash port that MOVES the target into a sibling
 * `recycled` directory inside the same temp tree.
 *
 * It is a move, not a removal, and it is confined to the fixture — which is the
 * point of injecting the capability at all. `rejectFor` makes exactly the named
 * paths reject, so partial success can be exercised without anything real being
 * at stake.
 */
export function fakeTrash(options: { rejectFor?: string[]; message?: string } = {}): FakeTrash {
  const calls: string[] = [];
  const rejects = new Set((options.rejectFor ?? []).map((p) => p.toLowerCase()));
  const message = options.message ?? 'The process cannot access the file because it is being used by another process.';
  const bin = mkdtempSync(join(tmpdir(), 'orcastrate-beachcomber-recycled-'));
  createdRoots.push(bin);
  let moved = 0;

  return {
    calls,
    trashItem: async (absolutePath: string) => {
      calls.push(absolutePath);
      if (rejects.has(absolutePath.toLowerCase())) {
        throw new Error(message);
      }
      moved += 1;
      renameSync(absolutePath, join(bin, `moved-${String(moved)}`));
    },
  };
}

export function podProvider(pods: PodDirectory[]): () => readonly PodDirectory[] {
  return () => pods;
}

/** `BeachcomberServiceDeps` with every dangerous capability injected and inert. */
export function makeDeps(
  claudeHome: string,
  overrides: Partial<BeachcomberServiceDeps> = {},
): BeachcomberServiceDeps {
  return {
    claudeHome,
    pods: podProvider([]),
    trashItem: async () => undefined,
    now: fixedNow(),
    newId: counterIds(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Assertions helpers
// ---------------------------------------------------------------------------

export function entryNamed(scan: BeachcomberScan, name: string): BeachcomberEntry {
  const found = scan.entries.find((entry) => entry.name === name);
  if (found === undefined) {
    throw new Error(`no entry named ${name}; saw ${scan.entries.map((e) => e.name).join(', ')}`);
  }
  return found;
}

/** Runs `fn`, requiring a rejection, and hands the error back for assertions. */
export async function catchAsync(fn: () => Promise<unknown>): Promise<unknown> {
  try {
    await fn();
  } catch (err) {
    return err;
  }
  throw new Error('expected the call to reject, but it resolved');
}
