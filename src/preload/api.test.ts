import { describe, expect, it } from 'vitest';
import { createOrcastrateApi, type PreloadIpc, type PushListener } from './api';
import {
  EVENT_CHANNELS,
  INVOKE_CHANNELS,
} from '../shared/contracts/ipc';

interface FakeIpc extends PreloadIpc {
  calls: Array<{ channel: string; args: unknown[] }>;
  listeners: Map<string, PushListener[]>;
  emit(channel: string, payload: unknown): void;
}

function fakeIpc(result: unknown = { ok: true, value: null }): FakeIpc {
  const calls: Array<{ channel: string; args: unknown[] }> = [];
  const listeners = new Map<string, PushListener[]>();

  return {
    calls,
    listeners,
    invoke(channel, ...args) {
      calls.push({ channel, args });
      return Promise.resolve(result);
    },
    on(channel, listener) {
      const existing = listeners.get(channel) ?? [];
      existing.push(listener);
      listeners.set(channel, existing);
      return undefined;
    },
    removeListener(channel, listener) {
      const existing = listeners.get(channel) ?? [];
      const index = existing.indexOf(listener);
      if (index >= 0) existing.splice(index, 1);
      listeners.set(channel, existing);
      return undefined;
    },
    emit(channel, payload) {
      for (const listener of [...(listeners.get(channel) ?? [])]) {
        listener({}, payload);
      }
    },
  };
}

describe('preload bridge smoke', () => {
  it('builds an api object with exactly the contract namespaces', () => {
    const api = createOrcastrateApi(fakeIpc());
    expect(Object.keys(api).sort()).toEqual([
      'app',
      'beachcomber',
      'dialog',
      'events',
      'helm',
      'lanes',
      'on',
      'permissions',
      'pods',
    ]);
  });
});

describe('invoke channels', () => {
  const cases: Array<[string, (api: ReturnType<typeof createOrcastrateApi>) => unknown, string]> = [
    ['pods.list', (a) => a.pods.list(), INVOKE_CHANNELS.podList],
    [
      'pods.create',
      (a) =>
        a.pods.create({ title: 't', cwd: 'c', permissionMode: 'default' }),
      INVOKE_CHANNELS.podCreate,
    ],
    ['pods.update', (a) => a.pods.update({ podId: 'p' }), INVOKE_CHANNELS.podUpdate],
    ['pods.delete', (a) => a.pods.delete('p'), INVOKE_CHANNELS.podDelete],
    ['pods.open', (a) => a.pods.open('p'), INVOKE_CHANNELS.podOpen],
    ['pods.close', (a) => a.pods.close('p'), INVOKE_CHANNELS.podClose],
    ['pods.reconnect', (a) => a.pods.reconnect('p'), INVOKE_CHANNELS.podReconnect],
    ['pods.send', (a) => a.pods.send('p', 'hi'), INVOKE_CHANNELS.podSend],
    ['pods.interrupt', (a) => a.pods.interrupt('p'), INVOKE_CHANNELS.podInterrupt],
    [
      'pods.setPermissionMode',
      (a) => a.pods.setPermissionMode('p', 'plan'),
      INVOKE_CHANNELS.podSetPermissionMode,
    ],
    ['lanes.list', (a) => a.lanes.list('p'), INVOKE_CHANNELS.laneList],
    ['events.read', (a) => a.events.read({ podId: 'p' }), INVOKE_CHANNELS.eventsRead],
    [
      'permissions.respond',
      (a) =>
        a.permissions.respond({ podId: 'p', requestId: 'r', decision: 'allow' }),
      INVOKE_CHANNELS.permissionRespond,
    ],
    [
      'dialog.pickDirectory',
      (a) => a.dialog.pickDirectory(),
      INVOKE_CHANNELS.dialogPickDirectory,
    ],
    ['app.routingMode', (a) => a.app.routingMode(), INVOKE_CHANNELS.appRoutingMode],
    [
      'beachcomber.scan',
      (a) => a.beachcomber.scan(),
      INVOKE_CHANNELS.beachcomberScan,
    ],
    [
      'beachcomber.preview',
      (a) => a.beachcomber.preview({ scanId: 's1', ids: ['e1'] }),
      INVOKE_CHANNELS.beachcomberPreview,
    ],
    [
      'beachcomber.trash',
      (a) => a.beachcomber.trash({ scanId: 's1', ids: ['e1'] }),
      INVOKE_CHANNELS.beachcomberTrash,
    ],
    ['helm.listScopes', (a) => a.helm.listScopes(), INVOKE_CHANNELS.helmScopes],
    ['helm.load', (a) => a.helm.load('user'), INVOKE_CHANNELS.helmLoad],
    [
      'helm.save',
      (a) =>
        a.helm.save({
          scopeId: 'user',
          revision: null,
          managed: {
            model: null,
            permissionsAllow: [],
            permissionsDeny: [],
            env: {},
            crossSessionInbound: null,
          },
          unmanaged: {},
          hooksJson: '',
        }),
      INVOKE_CHANNELS.helmSave,
    ],
  ];

  for (const [name, call, channel] of cases) {
    it(`${name} invokes ${channel}`, async () => {
      const ipc = fakeIpc();
      const api = createOrcastrateApi(ipc);
      await call(api);
      expect(ipc.calls.map((c) => c.channel)).toEqual([channel]);
    });
  }

  it('forwards arguments positionally', async () => {
    const ipc = fakeIpc();
    const api = createOrcastrateApi(ipc);
    await api.pods.send('pod-1', 'hello');
    expect(ipc.calls[0]?.args).toEqual(['pod-1', 'hello']);
  });

  it('forwards the beachcomber and helm payloads through untouched', async () => {
    const ipc = fakeIpc();
    const api = createOrcastrateApi(ipc);

    const preview = { scanId: 'scan-7', ids: ['e1', 'e2'] };
    const trash = { scanId: 'scan-7', ids: ['e3'] };
    const save = {
      scopeId: 'project:pod-1',
      revision: { sha256: 'abc', sizeBytes: 12, mtimeMs: 5 },
      managed: {
        model: 'sonnet',
        permissionsAllow: ['Bash(ls:*)'],
        permissionsDeny: [],
        env: { FOO: 'bar' },
        crossSessionInbound: 'hold' as const,
      },
      unmanaged: { statusLine: { type: 'command' } },
      hooksJson: '{"PreToolUse":[]}',
    };

    await api.beachcomber.scan();
    await api.beachcomber.preview(preview);
    await api.beachcomber.trash(trash);
    await api.helm.listScopes();
    await api.helm.load('user');
    await api.helm.save(save);

    expect(ipc.calls).toEqual([
      { channel: INVOKE_CHANNELS.beachcomberScan, args: [] },
      { channel: INVOKE_CHANNELS.beachcomberPreview, args: [preview] },
      { channel: INVOKE_CHANNELS.beachcomberTrash, args: [trash] },
      { channel: INVOKE_CHANNELS.helmScopes, args: [] },
      { channel: INVOKE_CHANNELS.helmLoad, args: ['user'] },
      { channel: INVOKE_CHANNELS.helmSave, args: [save] },
    ]);
    // The SAME objects, not copies: the bridge must not reshape a payload on
    // the way out, or main would validate something the caller never sent.
    expect(ipc.calls[1]?.args[0]).toBe(preview);
    expect(ipc.calls[5]?.args[0]).toBe(save);
  });

  it('uses no channel outside INVOKE_CHANNELS', async () => {
    const ipc = fakeIpc();
    const api = createOrcastrateApi(ipc);
    await Promise.all(cases.map(([, call]) => call(api)));
    const allowed = new Set<string>(Object.values(INVOKE_CHANNELS));
    for (const call of ipc.calls) {
      expect(allowed.has(call.channel)).toBe(true);
    }
    expect(new Set(ipc.calls.map((c) => c.channel)).size).toBe(allowed.size);
  });

  it('returns the IpcResult envelope unchanged rather than throwing', async () => {
    const failure = { ok: false, error: { code: 'NOT_FOUND', message: 'gone' } };
    const api = createOrcastrateApi(fakeIpc(failure));
    await expect(api.pods.open('p')).resolves.toEqual(failure);
  });
});

describe('push subscriptions', () => {
  const subscriptions = [
    ['podEvent', EVENT_CHANNELS.podEvent],
    ['podStatus', EVENT_CHANNELS.podStatus],
    ['laneChanged', EVENT_CHANNELS.laneChanged],
    ['permissionRequested', EVENT_CHANNELS.permissionRequested],
    ['permissionResolved', EVENT_CHANNELS.permissionResolved],
    ['helmChanged', EVENT_CHANNELS.helmChanged],
  ] as const;

  for (const [name, channel] of subscriptions) {
    it(`on.${name} subscribes to ${channel}, delivers the payload, and unsubscribes`, () => {
      const ipc = fakeIpc();
      const api = createOrcastrateApi(ipc);
      const seen: unknown[] = [];

      const unsubscribe = api.on[name]((payload: unknown) => {
        seen.push(payload);
      });

      expect(ipc.listeners.get(channel)).toHaveLength(1);

      ipc.emit(channel, { marker: name });
      expect(seen).toEqual([{ marker: name }]);

      unsubscribe();
      expect(ipc.listeners.get(channel)).toHaveLength(0);

      ipc.emit(channel, { marker: 'after-unsubscribe' });
      expect(seen).toEqual([{ marker: name }]);
    });
  }

  it('strips the Electron event object before calling back', () => {
    const ipc = fakeIpc();
    const api = createOrcastrateApi(ipc);
    const args: unknown[][] = [];
    api.on.podStatus((...received: unknown[]) => {
      args.push(received);
    });
    ipc.emit(EVENT_CHANNELS.podStatus, { podId: 'p', status: 'idle' });
    expect(args).toEqual([[{ podId: 'p', status: 'idle' }]]);
  });

  it('removes only its own listener when several are registered', () => {
    const ipc = fakeIpc();
    const api = createOrcastrateApi(ipc);
    const first: unknown[] = [];
    const second: unknown[] = [];

    const unsubFirst = api.on.podEvent((p) => first.push(p));
    api.on.podEvent((p) => second.push(p));
    expect(ipc.listeners.get(EVENT_CHANNELS.podEvent)).toHaveLength(1 + 1);

    unsubFirst();
    ipc.emit(EVENT_CHANNELS.podEvent, { podId: 'p', events: [] });

    expect(first).toEqual([]);
    expect(second).toEqual([{ podId: 'p', events: [] }]);
  });

  it('is idempotent when the unsubscribe is called twice', () => {
    const ipc = fakeIpc();
    const api = createOrcastrateApi(ipc);
    api.on.laneChanged(() => {});
    const unsub = api.on.laneChanged(() => {});

    unsub();
    unsub();

    expect(ipc.listeners.get(EVENT_CHANNELS.laneChanged)).toHaveLength(1);
  });

  /**
   * The helm watcher is ADVISORY (see the `helm.ts` header), so a leaked or a
   * double-removed listener would not fail a save — it would just make the
   * staleness banner lie. Pinned here for exactly that reason.
   */
  it('on.helmChanged delivers the push and removes only its own listener', () => {
    const ipc = fakeIpc();
    const api = createOrcastrateApi(ipc);
    const first: unknown[] = [];
    const second: unknown[] = [];

    const unsubFirst = api.on.helmChanged((p) => first.push(p.scopeId));
    api.on.helmChanged((p) => second.push(p.scopeId));
    expect(ipc.listeners.get(EVENT_CHANNELS.helmChanged)).toHaveLength(2);

    unsubFirst();
    expect(ipc.listeners.get(EVENT_CHANNELS.helmChanged)).toHaveLength(1);

    ipc.emit(EVENT_CHANNELS.helmChanged, {
      scopeId: 'project:pod-1',
      displayPath: '/repo/.claude/settings.json',
      changedAt: '2026-08-19T00:00:00.000Z',
    });

    expect(first).toEqual([]);
    expect(second).toEqual(['project:pod-1']);
  });

  it('on.helmChanged unsubscribe is a no-op the second time', () => {
    const ipc = fakeIpc();
    const api = createOrcastrateApi(ipc);
    api.on.helmChanged(() => {});
    const unsub = api.on.helmChanged(() => {});

    unsub();
    unsub();

    expect(ipc.listeners.get(EVENT_CHANNELS.helmChanged)).toHaveLength(1);
  });

  it('subscribes to no channel outside EVENT_CHANNELS', () => {
    const ipc = fakeIpc();
    const api = createOrcastrateApi(ipc);
    api.on.podEvent(() => {});
    api.on.podStatus(() => {});
    api.on.laneChanged(() => {});
    api.on.permissionRequested(() => {});
    api.on.permissionResolved(() => {});
    api.on.helmChanged(() => {});

    expect([...ipc.listeners.keys()].sort()).toEqual(
      [...Object.values(EVENT_CHANNELS)].sort(),
    );
  });
});
