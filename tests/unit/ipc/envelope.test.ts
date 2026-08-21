/**
 * The envelope contract and input validation (criteria 3, 4, 5).
 *
 * Criterion 3 is the load-bearing one: an Electron IPC rejection crosses the
 * bridge as a stringified error and loses its type, so a handler that rejects
 * hands the renderer something it cannot branch on. Every handler must resolve.
 * The test forces an internal throw in EVERY handler and asserts an
 * `{ ok: false }` envelope with a documented code comes back — including for
 * the failure classes that are easy to miss: a store error, a runner error, and
 * a bare `RangeError` with no `.code` at all.
 */

import { describe, expect, it } from 'vitest';

import type { PermissionMode, PodId } from '../../../src/shared/contracts/events';
import {
  INVOKE_CHANNELS,
  type CreatePodRequest,
  type DeletePodRequest,
  type IpcErrorCode,
  type IpcResult,
  type PermissionRespondRequest,
  type PickDirectoryResponse,
  type ReadEventsRequest,
  type UpdatePodRequest,
} from '../../../src/shared/contracts/ipc';
import type { IpcMainLike } from '../../../src/main/ipc';
import { IPC_ERROR_CODES, registerIpcHandlers } from '../../../src/main/ipc';
import { PodRunnerError } from '../../../src/main/pod';
import type { PodManagerApi } from '../../../src/main/pod-manager';
import { EventStoreError } from '../../../src/main/store';

import { makeHarness } from './helpers';
import {
  fakeBeachcomberService,
  fakeHelmService,
  VALID_PANEL_PAYLOADS,
} from './panel-fakes';

/**
 * Valid arguments for every channel — valid enough to clear validation, so the
 * throw the test is looking for comes from the manager and not from an
 * argument check.
 */
const VALID_ARGS: Record<string, unknown[]> = {
  [INVOKE_CHANNELS.podList]: [],
  [INVOKE_CHANNELS.podCreate]: [
    { title: 'a', cwd: 'C:\\work', permissionMode: 'default' } satisfies CreatePodRequest,
  ],
  [INVOKE_CHANNELS.podUpdate]: [{ podId: 'p1', title: 'b' } satisfies UpdatePodRequest],
  [INVOKE_CHANNELS.podDelete]: [{ podId: 'p1', deleteSession: false } satisfies DeletePodRequest],
  [INVOKE_CHANNELS.podOpen]: ['p1'],
  [INVOKE_CHANNELS.podClose]: ['p1'],
  [INVOKE_CHANNELS.podSend]: ['p1', 'hello'],
  [INVOKE_CHANNELS.podInterrupt]: ['p1'],
  [INVOKE_CHANNELS.podSetPermissionMode]: ['p1', 'plan'],
  [INVOKE_CHANNELS.podReconnect]: ['p1'],
  [INVOKE_CHANNELS.laneList]: ['p1'],
  [INVOKE_CHANNELS.eventsRead]: [{ podId: 'p1' } satisfies ReadEventsRequest],
  [INVOKE_CHANNELS.permissionRespond]: [
    { podId: 'p1', requestId: 'r1', decision: 'allow' } satisfies PermissionRespondRequest,
  ],
  [INVOKE_CHANNELS.dialogPickDirectory]: [],
  [INVOKE_CHANNELS.appRoutingMode]: [],
  [INVOKE_CHANNELS.beachcomberScan]: [],
  [INVOKE_CHANNELS.beachcomberPreview]: [VALID_PANEL_PAYLOADS.preview],
  [INVOKE_CHANNELS.beachcomberTrash]: [VALID_PANEL_PAYLOADS.trash],
  [INVOKE_CHANNELS.helmScopes]: [],
  [INVOKE_CHANNELS.helmLoad]: [VALID_PANEL_PAYLOADS.scopeId],
  [INVOKE_CHANNELS.helmSave]: [VALID_PANEL_PAYLOADS.save],
};

/** Malformed arguments for every channel that takes one. */
const BAD_ARGS: Record<string, unknown[]> = {
  [INVOKE_CHANNELS.podCreate]: [{ title: '', cwd: 42, permissionMode: 'nope' }],
  [INVOKE_CHANNELS.podUpdate]: [{ podId: '' }],
  [INVOKE_CHANNELS.podDelete]: [null],
  // `deleteSession` missing entirely — the field that decides whether a file
  // leaves the disk is never defaulted.
  [INVOKE_CHANNELS.podOpen]: [{ podId: 'p1' }],
  [INVOKE_CHANNELS.podClose]: [123],
  [INVOKE_CHANNELS.podSend]: ['p1', ''],
  [INVOKE_CHANNELS.podInterrupt]: [undefined],
  // `acceptEdits` used to sit here as the known-invalid mode. It is now part of
  // the exposed four-mode surface, so this case is re-pointed at `dontAsk` —
  // a mode the CLI accepts but Orcastrate deliberately does not expose.
  [INVOKE_CHANNELS.podSetPermissionMode]: ['p1', 'dontAsk'],
  [INVOKE_CHANNELS.podReconnect]: [['p1']],
  [INVOKE_CHANNELS.laneList]: [false],
  [INVOKE_CHANNELS.eventsRead]: [{ podId: 'p1', limit: -3 }],
  [INVOKE_CHANNELS.permissionRespond]: [{ podId: 'p1', requestId: 'r1', decision: 'maybe' }],
  [INVOKE_CHANNELS.beachcomberPreview]: [{ scanId: 'scan-1', ids: 'entry-1' }],
  [INVOKE_CHANNELS.beachcomberTrash]: [{ ids: ['entry-1'] }],
  [INVOKE_CHANNELS.helmLoad]: [42],
  [INVOKE_CHANNELS.helmSave]: [{ scopeId: 'user', hooksJson: '' }],
};

/** The channels that take no arguments, so have nothing to validate. */
const ZERO_ARG_CHANNELS = [
  INVOKE_CHANNELS.podList,
  INVOKE_CHANNELS.dialogPickDirectory,
  INVOKE_CHANNELS.appRoutingMode,
  INVOKE_CHANNELS.beachcomberScan,
  INVOKE_CHANNELS.helmScopes,
] as string[];

interface Rig {
  invoke(channel: string, ...args: unknown[]): Promise<IpcResult<unknown>>;
}

/**
 * Registers the real handlers over a manager whose every member fails with
 * `err`. `async` makes the members REJECT rather than throw synchronously —
 * the wrapper must catch both, and half the manager's surface is async.
 */
function rigThatThrows(err: () => unknown, mode: 'throw' | 'reject' = 'throw'): Rig {
  const handlers = new Map<
    string,
    (event: unknown, ...args: unknown[]) => Promise<unknown> | unknown
  >();
  const ipcMain: IpcMainLike = {
    handle(channel, listener) {
      handlers.set(channel, listener);
    },
  };

  const boom = ((): never | Promise<never> => {
    if (mode === 'reject') {
      const rejected = Promise.reject(err());
      // `listPods` is SYNCHRONOUS on the real interface, so a caller that
      // treats its result as an array — `pod:delete` reads the row before it
      // deletes it — throws on the returned promise instead of awaiting it,
      // and the rejection would surface as an unhandled one and turn the run
      // red for the wrong reason. Marked handled here; what this rig asserts
      // is the envelope the handler produces, which is unchanged.
      rejected.catch(() => undefined);
      return rejected as never;
    }
    throw err();
  }) as () => never;
  const manager: PodManagerApi = {
    get routingMode(): never {
      return boom();
    },
    listPods: boom,
    createPod: boom,
    updatePod: boom,
    deletePod: boom,
    openPod: boom,
    closePod: boom,
    reconnectPod: boom,
    send: boom,
    interrupt: boom,
    setPermissionMode: boom,
    listLanes: boom,
    readEvents: boom,
    respondPermission: boom,
    disposeAll: boom,
  };

  // The panel ports fail the same way the manager does, so the sweep below
  // covers all 21 channels rather than 15 plus six that quietly succeed.
  const beachcomber = fakeBeachcomberService();
  const helm = fakeHelmService();
  beachcomber.throwWith(err());
  helm.throwWith(err());

  registerIpcHandlers({
    ipcMain,
    manager,
    pickDirectory: async () => boom(),
    beachcomber,
    helm,
    // The session port fails the same way everything else in this rig does, so
    // `pod:delete` is not the one channel that quietly succeeds.
    deletePodSession: boom,
  });

  return {
    async invoke(channel, ...args) {
      const handler = handlers.get(channel);
      if (!handler) throw new Error(`no handler for ${channel}`);
      return (await handler(null, ...args)) as IpcResult<unknown>;
    },
  };
}

async function expectFailure(
  result: IpcResult<unknown>,
  channel: string,
): Promise<IpcErrorCode> {
  expect(result.ok, `${channel} resolved ok when it should have failed`).toBe(false);
  if (result.ok) throw new Error('unreachable');
  expect(IPC_ERROR_CODES, `${channel} used an undocumented code`).toContain(result.error.code);
  expect(typeof result.error.message).toBe('string');
  return result.error.code;
}

describe('no handler ever rejects (criterion 3)', () => {
  const failureClasses: { name: string; make: () => unknown }[] = [
    { name: 'a plain Error', make: () => new Error('internal boom') },
    { name: 'an EventStoreError', make: () => new EventStoreError('IO', 'disk fell over') },
    { name: 'a PodRunnerError', make: () => new PodRunnerError('SPAWN_FAILED', 'no binary') },
    // HANDOFF TRAP 3: `setPermissionMode` and the PodRunner constructor throw a
    // bare RangeError with NO `.code`. A handler that assumed `.code` exists
    // would produce `undefined` as the error code, or crash classifying it.
    { name: 'a bare RangeError with no .code', make: () => new RangeError('mode outside union') },
    { name: 'a thrown string', make: () => 'not even an Error' },
    { name: 'a thrown null', make: () => null },
  ];

  for (const { name, make } of failureClasses) {
    it(`resolves { ok: false } for every channel when the internals throw ${name}`, async () => {
      const rig = rigThatThrows(make);
      for (const channel of Object.values(INVOKE_CHANNELS)) {
        const args = VALID_ARGS[channel] ?? [];
        const result = await rig.invoke(channel, ...args);
        await expectFailure(result, channel);
      }
    });
  }

  it('resolves { ok: false } for every channel when the internals REJECT', async () => {
    // The six cases above all throw synchronously. A returned rejected promise
    // takes a different path through the wrapper's `await`, and most of the
    // manager surface is async — so it is pinned separately.
    const rig = rigThatThrows(() => new Error('async boom'), 'reject');
    for (const channel of Object.values(INVOKE_CHANNELS)) {
      const result = await rig.invoke(channel, ...(VALID_ARGS[channel] ?? []));
      await expectFailure(result, channel);
    }
  });

  it('maps each failure class onto the code that describes it', async () => {
    const cases: [() => unknown, IpcErrorCode][] = [
      [() => new EventStoreError('NOT_FOUND', 'gone'), 'NOT_FOUND'],
      [() => new EventStoreError('CONFLICT', 'dup'), 'CONFLICT'],
      [() => new EventStoreError('SCHEMA_MISMATCH', 'newer'), 'UNSUPPORTED'],
      [() => new PodRunnerError('CWD_MISSING', 'gone'), 'CWD_MISSING'],
      [() => new PodRunnerError('NOT_RUNNING', 'stopped'), 'NOT_RUNNING'],
      [() => new PodRunnerError('ALREADY_STARTED', 'again'), 'CONFLICT'],
      [() => new PodRunnerError('RESUME_FAILED', 'stale id'), 'SPAWN_FAILED'],
      [() => new RangeError('bad mode'), 'INVALID_ARGUMENT'],
      [() => new Error('who knows'), 'INTERNAL'],
    ];
    for (const [make, expected] of cases) {
      const rig = rigThatThrows(make);
      const result = await rig.invoke(INVOKE_CHANNELS.podList);
      expect(await expectFailure(result, INVOKE_CHANNELS.podList)).toBe(expected);
    }
  });
});

describe('renderer input is never trusted (criterion 4)', () => {
  it('answers INVALID_ARGUMENT for malformed input on every handler that takes an argument', async () => {
    const h = makeHarness();
    try {
      const argTaking = Object.values(INVOKE_CHANNELS).filter(
        (channel) => !ZERO_ARG_CHANNELS.includes(channel),
      );
      expect(argTaking.length).toBe(
        Object.values(INVOKE_CHANNELS).length - ZERO_ARG_CHANNELS.length,
      );

      for (const channel of argTaking) {
        const bad = BAD_ARGS[channel];
        expect(bad, `no malformed-input case defined for ${channel}`).toBeDefined();
        const result = await h.invoke(channel, ...(bad ?? []));
        expect(await expectFailure(result, channel)).toBe('INVALID_ARGUMENT');
      }
    } finally {
      await h.dispose();
    }
  });

  it('answers INVALID_ARGUMENT when an argument is simply missing', async () => {
    const h = makeHarness();
    try {
      for (const channel of Object.values(INVOKE_CHANNELS)) {
        if (ZERO_ARG_CHANNELS.includes(channel)) continue;
        const result = await h.invoke(channel);
        expect(await expectFailure(result, channel)).toBe('INVALID_ARGUMENT');
      }
    } finally {
      await h.dispose();
    }
  });

  it('refuses a deny with no reason, and a deny with a blank one', async () => {
    const h = makeHarness();
    try {
      for (const reason of [undefined, '', '   ']) {
        const result = await h.invoke(INVOKE_CHANNELS.permissionRespond, {
          podId: 'p1',
          requestId: 'r1',
          decision: 'deny',
          ...(reason === undefined ? {} : { reason }),
        });
        expect(await expectFailure(result, 'deny without a reason')).toBe('INVALID_ARGUMENT');
      }
    } finally {
      await h.dispose();
    }
  });

  it('refuses a permission mode outside the contract union', async () => {
    const h = makeHarness();
    try {
      for (const mode of ['dontAsk', 'root', 42, null]) {
        const result = await h.invoke(
          INVOKE_CHANNELS.podSetPermissionMode,
          'p1',
          mode as PermissionMode,
        );
        expect(await expectFailure(result, 'setPermissionMode')).toBe('INVALID_ARGUMENT');
      }
    } finally {
      await h.dispose();
    }
  });
});

describe('paths are a capability main grants, never one the renderer asserts (criterion 5)', () => {
  it('pod:create refuses a cwd that is not a directory, with CWD_MISSING', async () => {
    const h = makeHarness({ isDirectory: () => false });
    try {
      const result = await h.invoke(INVOKE_CHANNELS.podCreate, {
        title: 'Ghost',
        cwd: 'C:\\definitely\\not\\here',
        permissionMode: 'default',
      });
      expect(await expectFailure(result, 'pod:create')).toBe('CWD_MISSING');
      // Nothing was written: a rejected cwd must not leave a half-made Pod.
      const listed = await h.invoke<unknown[]>(INVOKE_CHANNELS.podList);
      expect(listed.ok && listed.value).toEqual([]);
    } finally {
      await h.dispose();
    }
  });

  it('pod:create refuses a relative path outright', async () => {
    const h = makeHarness();
    try {
      const result = await h.invoke(INVOKE_CHANNELS.podCreate, {
        title: 'Relative',
        cwd: '../elsewhere',
        permissionMode: 'default',
      });
      expect(await expectFailure(result, 'pod:create')).toBe('INVALID_ARGUMENT');
    } finally {
      await h.dispose();
    }
  });

  it('pod:update refuses to move an existing Pod to a new cwd', async () => {
    const h = makeHarness();
    try {
      const created = await h.invoke<{ id: PodId }>(INVOKE_CHANNELS.podCreate, {
        title: 'Fixed',
        cwd: process.cwd(),
        permissionMode: 'default',
      });
      expect(created.ok).toBe(true);
      if (!created.ok) return;

      const result = await h.invoke(INVOKE_CHANNELS.podUpdate, {
        podId: created.value.id,
        cwd: 'C:\\somewhere\\else',
      });
      expect(await expectFailure(result, 'pod:update')).toBe('INVALID_ARGUMENT');
    } finally {
      await h.dispose();
    }
  });

  it('dialog:pickDirectory is the only source of a new path, and cancelling is not an error', async () => {
    const h = makeHarness();
    try {
      h.setPickedDirectory(null);
      const cancelled = await h.invoke<PickDirectoryResponse>(
        INVOKE_CHANNELS.dialogPickDirectory,
      );
      expect(cancelled).toEqual({ ok: true, value: { path: null } });

      h.setPickedDirectory('C:\\chosen\\by\\the\\user');
      const chosen = await h.invoke<PickDirectoryResponse>(INVOKE_CHANNELS.dialogPickDirectory);
      expect(chosen).toEqual({ ok: true, value: { path: 'C:\\chosen\\by\\the\\user' } });
    } finally {
      await h.dispose();
    }
  });

  it('a failing picker is an envelope, not a rejection', async () => {
    const h = makeHarness();
    try {
      h.failPickDirectory(new Error('the shell dialog blew up'));
      const result = await h.invoke(INVOKE_CHANNELS.dialogPickDirectory);
      await expectFailure(result, 'dialog:pickDirectory');
    } finally {
      await h.dispose();
    }
  });
});
