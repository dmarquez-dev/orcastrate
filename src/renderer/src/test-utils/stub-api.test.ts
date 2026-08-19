/**
 * The stub must not silently lag the frozen IPC surface.
 *
 * These tests enumerate `INVOKE_CHANNELS` and `EVENT_CHANNELS` from the frozen
 * `@shared/contracts/ipc` and assert the stub covers every member. A channel
 * added to the contract without a stub method fails here rather than surfacing
 * as a confusing `undefined is not a function` inside a consumer's suite.
 *
 * No jsdom docblock: nothing here renders, so this file runs in the default
 * `node` environment.
 */

import { describe, expect, it } from 'vitest';
import { EVENT_CHANNELS, INVOKE_CHANNELS, type IpcResult } from '@shared/contracts/ipc';

import {
  EVENT_CHANNEL_METHODS,
  INVOKE_CHANNEL_METHODS,
  expectOk,
  ipcError,
  stubOrcastrateApi,
  type EventChannelKey,
  type InvokeChannelKey,
} from './stub-api';

const invokeKeys = Object.keys(INVOKE_CHANNELS) as InvokeChannelKey[];
const eventKeys = Object.keys(EVENT_CHANNELS) as EventChannelKey[];

/** Call one invoke channel with plausible-but-ignored arguments. */
async function callChannel(
  api: ReturnType<typeof stubOrcastrateApi>,
  key: InvokeChannelKey,
): Promise<IpcResult<unknown>> {
  const [group, method] = INVOKE_CHANNEL_METHODS[key];
  const namespace = (api as unknown as Record<string, Record<string, unknown>>)[group];
  expect(namespace, `api.${group} is missing`).toBeDefined();
  const fn = namespace?.[method];
  expect(typeof fn, `api.${group}.${method} is not a function`).toBe('function');
  const call = fn as (...args: unknown[]) => Promise<IpcResult<unknown>>;
  return call.call(namespace, {
    podId: 'pod-1',
    title: 'T',
    cwd: '/stub/workspace',
    permissionMode: 'default',
    requestId: 'req-1',
    decision: 'allow',
  });
}

describe('stubOrcastrateApi — coverage of the frozen surface', () => {
  it('maps every INVOKE_CHANNELS member to a stub method', () => {
    expect(Object.keys(INVOKE_CHANNEL_METHODS).sort()).toEqual([...invokeKeys].sort());
    expect(invokeKeys.length).toBeGreaterThan(0);
  });

  it('maps every EVENT_CHANNELS member to a stub subscriber', () => {
    expect(Object.keys(EVENT_CHANNEL_METHODS).sort()).toEqual([...eventKeys].sort());
    expect(eventKeys.length).toBe(5);
  });

  it('resolves an { ok: true } envelope on every invoke channel by default', async () => {
    const api = stubOrcastrateApi();
    for (const key of invokeKeys) {
      const result = await callChannel(api, key);
      expect(result.ok, `${key} did not resolve ok`).toBe(true);
      expect(api.calls[key]).toHaveLength(1);
    }
  });

  it('never rejects on any invoke channel', async () => {
    const api = stubOrcastrateApi();
    api.failAllInvokes(ipcError('INTERNAL', 'boom'));
    for (const key of invokeKeys) {
      const result = await callChannel(api, key);
      expect(result.ok, `${key} should have resolved a failure envelope`).toBe(false);
    }
  });

  it('exposes a working Unsubscribe on every push channel', () => {
    const api = stubOrcastrateApi();
    for (const key of eventKeys) {
      const method = EVENT_CHANNEL_METHODS[key];
      const subscribe = api.on[method] as (cb: (p: never) => void) => () => void;
      expect(typeof subscribe, `api.on.${method} is not a function`).toBe('function');

      const unsubscribe = subscribe(() => {});
      expect(typeof unsubscribe, `api.on.${method} returned no Unsubscribe`).toBe('function');
      expect(api.listenerCount(key)).toBe(1);
      unsubscribe();
      expect(api.listenerCount(key), `${key} leaked a listener`).toBe(0);
    }
  });
});

describe('stubOrcastrateApi — driving pushes', () => {
  it('delivers each of the five push payloads to its subscriber', () => {
    const api = stubOrcastrateApi();
    const seen: string[] = [];

    api.on.podEvent((p) => seen.push(`podEvent:${p.podId}:${p.events.length}`));
    api.on.podStatus((p) => seen.push(`podStatus:${p.status}`));
    api.on.laneChanged((p) => seen.push(`laneChanged:${p.lanes.length}`));
    api.on.permissionRequested((p) => seen.push(`requested:${p.requestId}:${p.laneId}`));
    api.on.permissionResolved((p) => seen.push(`resolved:${p.outcome}`));

    api.emit.podEvent({ podId: 'pod-1', events: [] });
    api.emit.podStatus({ podId: 'pod-1', status: 'beached', exitCode: 1 });
    api.emit.laneChanged({ podId: 'pod-1', lanes: [] });
    api.emit.permissionRequested({
      podId: 'pod-1',
      laneId: 'lane-1',
      requestId: 'req-1',
      toolName: 'Bash',
      input: { command: 'ls' },
    });
    api.emit.permissionResolved({ podId: 'pod-1', requestId: 'req-1', outcome: 'aborted' });

    expect(seen).toEqual([
      'podEvent:pod-1:0',
      'podStatus:beached',
      'laneChanged:0',
      'requested:req-1:lane-1',
      'resolved:aborted',
    ]);
  });

  it('stops delivering after unsubscribe', () => {
    const api = stubOrcastrateApi();
    let calls = 0;
    const off = api.on.podStatus(() => {
      calls += 1;
    });
    api.emit.podStatus({ podId: 'pod-1', status: 'running' });
    off();
    api.emit.podStatus({ podId: 'pod-1', status: 'idle' });
    expect(calls).toBe(1);
  });
});

describe('stubOrcastrateApi — the failure path', () => {
  it('makes one channel fail while the rest keep succeeding', async () => {
    const api = stubOrcastrateApi();
    const error = ipcError('SPAWN_FAILED', 'claude: not found');
    api.failInvoke('podOpen', error);

    const failed = await api.pods.open('pod-1');
    expect(failed).toEqual({ ok: false, error });

    const stillOk = await api.pods.list();
    expect(stillOk.ok).toBe(true);
  });

  it('returns the SAME IpcError object, so the main-process message survives', async () => {
    const api = stubOrcastrateApi();
    const error = ipcError('IO', 'EACCES: permission denied');
    api.failInvoke('podSend', error);
    const result = await api.pods.send('pod-1', 'hi');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe(error);
  });

  it('clearInvokeFailure restores the default', async () => {
    const api = stubOrcastrateApi();
    api.failInvoke('appRoutingMode', ipcError('INTERNAL', 'x'));
    expect((await api.app.routingMode()).ok).toBe(false);
    api.clearInvokeFailure('appRoutingMode');
    expect(expectOk(await api.app.routingMode())).toBe('lanes');
  });
});

describe('stubOrcastrateApi — overrides and call recording', () => {
  it('lets a caller replace one method and keep the rest', async () => {
    const pod = { ...expectOk(await stubOrcastrateApi().pods.open('pod-9')) };
    const api = stubOrcastrateApi({
      pods: { list: async () => ({ ok: true, value: [pod] }) },
    });
    expect(expectOk(await api.pods.list())).toEqual([pod]);
    expect(expectOk(await api.lanes.list('pod-9'))).toEqual([]);
  });

  it('records the arguments each channel was called with', async () => {
    const api = stubOrcastrateApi();
    await api.pods.send('pod-1', 'hello');
    await api.pods.send('pod-1', 'again');
    expect(api.calls.podSend).toEqual([
      ['pod-1', 'hello'],
      ['pod-1', 'again'],
    ]);
  });

  it('defaults dialog.pickDirectory to an opaque picked path', async () => {
    const api = stubOrcastrateApi();
    expect(expectOk(await api.dialog.pickDirectory())).toEqual({ path: '/stub/workspace' });
  });
});
