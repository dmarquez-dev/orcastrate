/**
 * `pod:delete` at the transport boundary.
 *
 * Three things are pinned here and nowhere else:
 *
 *   VALIDATION. `deleteSession` is required and must be a real boolean. The
 *   string `'true'` is the case that matters: coercing it would mean a
 *   renderer bug silently binned a file, and it is the case a validator
 *   written with `Boolean(raw.deleteSession)` would let through.
 *
 *   PARTIAL SUCCESS IS A VALUE. A Pod whose session file could not be binned
 *   is still a DELETED POD, so the envelope is `ok: true` and the failure
 *   travels as `session: 'failed'` with the platform message. Reporting
 *   `ok: false` would leave the user believing the Pod is still there.
 *
 *   ORDER. Row read -> row deleted -> file binned. Both directions are
 *   asserted: the trash fake looks the Pod up when it runs and must not find
 *   it, and a manager whose `deletePod` throws must leave the trash fake
 *   untouched. The reverse order would leave a Pod row pointing at a file
 *   already in the recycle bin.
 */

import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { Pod, PodId } from '../../../src/shared/contracts/events';
import {
  INVOKE_CHANNELS,
  type IpcResult,
  type PodDeletionResult,
} from '../../../src/shared/contracts/ipc';
import type { IpcMainLike } from '../../../src/main/ipc';
import { registerIpcHandlers } from '../../../src/main/ipc';
import type { PodManagerApi } from '../../../src/main/pod-manager';
import {
  createPodSessionRemover,
  encodeCwdForProjects,
  fileExists,
} from '../../../src/main/pod-session';

import { makeHarness, openPod, type Harness } from './helpers';
import { fakeBeachcomberService, fakeHelmService } from './panel-fakes';

const harnesses: Harness[] = [];

afterEach(async () => {
  while (harnesses.length > 0) await harnesses.pop()?.dispose();
});

function keep(made: Harness): Harness {
  harnesses.push(made);
  return made;
}

// ---------------------------------------------------------------------------
// Criterion 2 — the payload is validated, and `deleteSession` is REQUIRED
// ---------------------------------------------------------------------------

describe('pod:delete refuses a payload that is not a DeletePodRequest', () => {
  const bad: [string, unknown][] = [
    ['deleteSession absent', { podId: 'p1' }],
    ["deleteSession is the STRING 'true'", { podId: 'p1', deleteSession: 'true' }],
    ['podId is not a string', { podId: 42, deleteSession: true }],
  ];

  for (const [name, payload] of bad) {
    it(`answers INVALID_ARGUMENT when ${name}`, async () => {
      const h = keep(makeHarness());
      const result = await h.invoke<PodDeletionResult>(INVOKE_CHANNELS.podDelete, payload);

      expect(result.ok).toBe(false);
      if (result.ok) throw new Error('unreachable');
      expect(result.error.code).toBe('INVALID_ARGUMENT');
      // Nothing reached the session port on a refused payload.
      expect(h.sessionRemovals).toEqual([]);
    });
  }

  it('accepts a well-formed request', async () => {
    const h = keep(makeHarness());
    const podId = await openPod(h);
    const result = await h.invoke<PodDeletionResult>(INVOKE_CHANNELS.podDelete, {
      podId,
      deleteSession: false,
    });
    expect(result.ok).toBe(true);
  });

  it('still answers NOT_FOUND for an unknown Pod, exactly as it always did', async () => {
    const h = keep(makeHarness());
    const result = await h.invoke<PodDeletionResult>(INVOKE_CHANNELS.podDelete, {
      podId: 'ghost',
      deleteSession: true,
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.error.code).toBe('NOT_FOUND');
    expect(h.sessionRemovals).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The fifth outcome — `'not-requested'`, which only the handler can decide
// ---------------------------------------------------------------------------

describe("deleteSession: false answers 'not-requested' and bins nothing", () => {
  it('never reaches the session port at all', async () => {
    const binned: string[] = [];
    const claudeHome = mkdtempSync(join(tmpdir(), 'orcastrate-pod-delete-'));
    const h = keep(
      makeHarness({
        // THE REAL remover over a synthetic tree, so "nothing was binned" is a
        // statement about the production code path and not about a stub.
        deletePodSession: createPodSessionRemover({
          claudeHome,
          trashItem: async (path) => {
            binned.push(path);
          },
          fileExists,
        }),
      }),
    );
    const podId = await openPod(h);
    writeSessionFileFor(claudeHome, h, podId);

    const result = await h.invoke<PodDeletionResult>(INVOKE_CHANNELS.podDelete, {
      podId,
      deleteSession: false,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.value).toEqual({
      podId,
      podDeleted: true,
      session: 'not-requested',
      sessionError: null,
    });
    expect(binned).toEqual([]);
  });
});

/**
 * Gives the Pod a Claude Code session id and writes the file that its own
 * `cwd` and `ccSessionId` point at. The id is written through the STORE, which
 * is the row the handler reads — the fixture SDK does not reach a first turn
 * here, and a Pod with a null `ccSessionId` would legitimately answer
 * `'no-session'`.
 */
function writeSessionFileFor(claudeHome: string, h: Harness, podId: PodId): string {
  h.store.updatePod(podId, { ccSessionId: 'cc-session-under-test' });
  const pod = h.manager.listPods().find((row) => row.id === podId);
  if (pod === undefined) throw new Error(`no pod ${podId}`);
  const sessionId = pod.ccSessionId;
  if (sessionId === null) throw new Error('the fixture failed to set a session id');
  const dir = join(claudeHome, 'projects', encodeCwdForProjects(pod.cwd));
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${sessionId}.jsonl`);
  writeFileSync(path, '{}\n', 'utf8');
  return path;
}

// ---------------------------------------------------------------------------
// Criterion 6 — partial success is a VALUE
// ---------------------------------------------------------------------------

describe('a Pod whose session file could not be binned is still a deleted Pod', () => {
  it('resolves ok: true with session failed and the message verbatim', async () => {
    const claudeHome = mkdtempSync(join(tmpdir(), 'orcastrate-pod-delete-'));
    const attempted: string[] = [];
    const h = keep(
      makeHarness({
        deletePodSession: createPodSessionRemover({
          claudeHome,
          trashItem: (path) => {
            attempted.push(path);
            return Promise.reject(new Error('EBUSY: the file is open elsewhere'));
          },
          fileExists,
        }),
      }),
    );
    const podId = await openPod(h);
    const filePath = writeSessionFileFor(claudeHome, h, podId);

    const result = await h.invoke<PodDeletionResult>(INVOKE_CHANNELS.podDelete, {
      podId,
      deleteSession: true,
    });

    // All four fields, off the one envelope.
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.value.podId).toBe(podId);
    expect(result.value.podDeleted).toBe(true);
    expect(result.value.session).toBe('failed');
    expect(result.value.sessionError).toBe('EBUSY: the file is open elsewhere');

    // The bin really was attempted, on the file and not on its directory.
    expect(attempted).toEqual([filePath]);
    // And the Pod row really is gone, which is what makes `ok: true` honest.
    expect(h.manager.listPods().map((row) => row.id)).not.toContain(podId);
  });

  it("answers 'trashed' when the bin accepts the file", async () => {
    const claudeHome = mkdtempSync(join(tmpdir(), 'orcastrate-pod-delete-'));
    const binned: string[] = [];
    const h = keep(
      makeHarness({
        deletePodSession: createPodSessionRemover({
          claudeHome,
          trashItem: async (path) => {
            binned.push(path);
          },
          fileExists,
        }),
      }),
    );
    const podId = await openPod(h);
    const filePath = writeSessionFileFor(claudeHome, h, podId);

    const result = await h.invoke<PodDeletionResult>(INVOKE_CHANNELS.podDelete, {
      podId,
      deleteSession: true,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.value.session).toBe('trashed');
    expect(result.value.sessionError).toBeNull();
    expect(binned).toEqual([filePath]);
  });
});

// ---------------------------------------------------------------------------
// Criterion 7 — the order is OBSERVABLE, in both directions
// ---------------------------------------------------------------------------

describe('the row is deleted BEFORE the file is binned', () => {
  it('a trash fake that reads the store observes the Pod already gone', async () => {
    const claudeHome = mkdtempSync(join(tmpdir(), 'orcastrate-pod-delete-'));
    let podsSeenByTheBin: PodId[] | null = null;
    let harnessRef: Harness | null = null;

    const h = keep(
      makeHarness({
        deletePodSession: createPodSessionRemover({
          claudeHome,
          trashItem: async () => {
            // The store, queried from INSIDE the deletion capability.
            podsSeenByTheBin = (harnessRef?.manager.listPods() ?? []).map((row) => row.id);
          },
          fileExists,
        }),
      }),
    );
    harnessRef = h;
    const podId = await openPod(h);
    writeSessionFileFor(claudeHome, h, podId);

    const result = await h.invoke<PodDeletionResult>(INVOKE_CHANNELS.podDelete, {
      podId,
      deleteSession: true,
    });

    expect(result.ok).toBe(true);
    // Vacuity guard: the fake must actually have run, or "it saw no Pod" is a
    // statement about nothing.
    expect(podsSeenByTheBin, 'the trash capability was never invoked').not.toBeNull();
    expect(podsSeenByTheBin).not.toContain(podId);
  });

  it('a manager whose deletePod throws leaves the trash capability UNCALLED', async () => {
    const binned: string[] = [];
    const handlers = new Map<
      string,
      (event: unknown, ...args: unknown[]) => Promise<unknown> | unknown
    >();
    const ipcMain: IpcMainLike = {
      handle(channel, listener) {
        handlers.set(channel, listener);
      },
    };

    const pod: Pod = {
      id: 'pod-doomed',
      title: 'Doomed',
      cwd: 'C:\\Users\\tester\\work',
      ccSessionId: 'cc-1',
      permissionMode: 'default',
      envOverrides: {},
      tabOrder: 0,
      status: 'closed',
      createdAt: '2026-08-20T00:00:00.000Z',
      lastActiveAt: '2026-08-20T00:00:00.000Z',
    };

    const notImplemented = (): never => {
      throw new Error('not reached by this test');
    };
    const manager = {
      get routingMode(): never {
        return notImplemented();
      },
      listPods: () => [pod],
      createPod: notImplemented,
      updatePod: notImplemented,
      deletePod: () => Promise.reject(new Error('the store fell over')),
      openPod: notImplemented,
      closePod: notImplemented,
      reconnectPod: notImplemented,
      send: notImplemented,
      interrupt: notImplemented,
      setPermissionMode: notImplemented,
      listLanes: notImplemented,
      readEvents: notImplemented,
      respondPermission: notImplemented,
      disposeAll: notImplemented,
    } as unknown as PodManagerApi;

    const claudeHome = mkdtempSync(join(tmpdir(), 'orcastrate-pod-delete-'));
    registerIpcHandlers({
      ipcMain,
      manager,
      pickDirectory: async () => null,
      beachcomber: fakeBeachcomberService(),
      helm: fakeHelmService(),
      deletePodSession: createPodSessionRemover({
        claudeHome,
        trashItem: async (path) => {
          binned.push(path);
        },
        // Says yes to everything, so "nothing was binned" cannot be explained
        // by a file that merely was not there.
        fileExists: async () => true,
      }),
    });

    const handler = handlers.get(INVOKE_CHANNELS.podDelete);
    if (handler === undefined) throw new Error('pod:delete was not registered');
    const result = (await handler(null, {
      podId: pod.id,
      deleteSession: true,
    })) as IpcResult<PodDeletionResult>;

    expect(result.ok).toBe(false);
    expect(binned).toEqual([]);
  });
});
