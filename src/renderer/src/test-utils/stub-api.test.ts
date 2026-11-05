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
import { BEACHCOMBER_ROOTS } from '@shared/contracts/beachcomber';

import {
  EVENT_CHANNEL_METHODS,
  INVOKE_CHANNEL_METHODS,
  expectOk,
  ipcError,
  makeStubPod,
  makeStubPods,
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
    expect(eventKeys.length).toBe(6);
  });

  it('covers all 22 invoke channels, so the stub cannot lag the surface', () => {
    expect(invokeKeys.length).toBe(22);
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

  it('defaults pods.fork to a closed Pod forked from the PodId it was given', async () => {
    const api = stubOrcastrateApi();

    const forked = expectOk(await api.pods.fork('pod-1'));

    expect(forked.id).not.toBe('pod-1');
    expect(forked.status).toBe('closed');
    expect(forked.forkedFromPodId).toBe('pod-1');
    expect(forked.forkedFromCcSessionId).not.toBeNull();
    expect(forked.ccSessionId).not.toBeNull();
    expect(api.calls.podFork).toEqual([['pod-1']]);
  });

  it('lets a caller override pods.fork through the existing overrides argument', async () => {
    const replacement = makeStubPod({ id: 'chosen-fork', forkedFromPodId: 'pod-1' });
    const api = stubOrcastrateApi({
      pods: { fork: async () => ({ ok: true, value: replacement }) },
    });

    expect(expectOk(await api.pods.fork('pod-1'))).toBe(replacement);
    // The other pods methods keep their defaults.
    expect(expectOk(await api.pods.list())).toEqual([]);
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

// ---------------------------------------------------------------------------
// The two namespaces this session populated
// ---------------------------------------------------------------------------

const PANEL_CHANNELS: InvokeChannelKey[] = [
  'beachcomberScan',
  'beachcomberPreview',
  'beachcomberTrash',
  'helmScopes',
  'helmLoad',
  'helmSave',
];

describe('stubOrcastrateApi — the beachcomber and helm namespaces', () => {
  it('answers { ok: false } on each of the six when failInvoke arms it', async () => {
    for (const key of PANEL_CHANNELS) {
      const api = stubOrcastrateApi();
      const error = ipcError('IO', `${key} failed`);
      api.failInvoke(key, error);

      const result = await callChannel(api, key);
      expect(result.ok, `${key} did not answer a failure envelope`).toBe(false);
      if (!result.ok) expect(result.error).toBe(error);
      // The rest of the surface is untouched: a panel test that fails one
      // channel must not lose the Pod list under it.
      expect((await api.pods.list()).ok).toBe(true);
    }
  });

  it('delivers a helmChanged push and unsubscribes cleanly', () => {
    const api = stubOrcastrateApi();
    const seen: string[] = [];
    const off = api.on.helmChanged((p) => seen.push(`${p.scopeId}@${p.changedAt}`));

    api.emit.helmChanged({
      scopeId: 'project:pod-1',
      displayPath: 'C:\\stub\\workspace\\.claude\\settings.json',
      changedAt: '2026-01-03T12:00:00.000Z',
    });
    expect(seen).toEqual(['project:pod-1@2026-01-03T12:00:00.000Z']);

    off();
    expect(api.listenerCount('helmChanged')).toBe(0);
    api.emit.helmChanged({
      scopeId: 'user',
      displayPath: '~/.claude/settings.json',
      changedAt: '2026-01-03T13:00:00.000Z',
    });
    expect(seen).toHaveLength(1);
  });
});

/**
 * CRITERION 16, CHECKED AT RUNTIME AND NOT ONLY BY THE TYPE CHECKER.
 *
 * Typecheck proves the defaults have the right FIELDS. It cannot prove they
 * have the right CONTENT — that there is a blocked row to render a refusal
 * for, an orphan to render a warning for, a guessed path to render a caveat
 * for, and unmanaged keys to lose. Downstream panels build on these instead of
 * inventing three private corpora, so the content is part of the contract they
 * are relying on.
 */
describe('the Pod fixtures cannot be satisfied by guessing one constant', () => {
  // Openness is derived from `status` alone, so a fixture whose Pods all fall
  // the same side of that derivation lets an assertion pass by answering one
  // constant about everything. These two guard the fixture, not the renderer.

  it('makeStubPods supplies at least two Pods on opposite sides of the derivation', () => {
    const isOpen = (status: string): boolean =>
      status === 'idle' || status === 'running' || status === 'waiting';
    const pods = makeStubPods();

    expect(pods.length).toBeGreaterThanOrEqual(2);
    expect(pods.some((pod) => isOpen(pod.status))).toBe(true);
    expect(pods.some((pod) => !isOpen(pod.status))).toBe(true);
    // Stable identities and tab order, so a suite can assert on rendered order.
    expect(pods.map((pod) => pod.id)).toEqual(['pod-1', 'pod-2']);
    expect(pods.map((pod) => pod.tabOrder)).toEqual([0, 1]);
  });

  it('makeStubPod is born closed, so no suite gets an open Pod it never asked for', () => {
    expect(makeStubPod().status).toBe('closed');
    expect(makeStubPod({ status: 'waiting' }).status).toBe('waiting');
  });

  it('the default pods.list stays empty, which is the first-run premise', async () => {
    expect(expectOk(await stubOrcastrateApi().pods.list())).toEqual([]);
  });
});

describe('the stub defaults are rich enough to build on', () => {
  it('carries at least one entry in each of the four roots', async () => {
    const scan = expectOk(await stubOrcastrateApi().beachcomber.scan());
    for (const root of BEACHCOMBER_ROOTS) {
      expect(
        scan.entries.filter((entry) => entry.root === root),
        `no default entry under ${root}`,
      ).not.toHaveLength(0);
    }
    expect(scan.roots.map((root) => root.key)).toEqual([...BEACHCOMBER_ROOTS]);
  });

  it('carries a blocked entry that names what blocked it', async () => {
    const scan = expectOk(await stubOrcastrateApi().beachcomber.scan());
    const blocked = scan.entries.filter((entry) => entry.blocked !== null);
    expect(blocked).not.toHaveLength(0);
    for (const entry of blocked) {
      expect(entry.blocked).toBe('pod-cwd');
      // Non-null exactly when `blocked !== null` — the UI says "Stub Pod is
      // using this", never "blocked".
      expect(entry.blockedBy).not.toBeNull();
      expect(entry.blockedBy?.title.length ?? 0).toBeGreaterThan(0);
    }
  });

  it('carries an orphan and a guessed path, and never both on one row', async () => {
    const scan = expectOk(await stubOrcastrateApi().beachcomber.scan());
    expect(scan.entries.some((entry) => entry.orphan)).toBe(true);
    expect(scan.entries.some((entry) => entry.pathSource === 'decoded-name')).toBe(true);

    // The rule the design got wrong: a decoded name is a GUESS, and "this path
    // does not exist" is unfalsifiable about a guess.
    for (const entry of scan.entries) {
      if (entry.orphan) expect(entry.pathSource).toBe('session-record');
    }
  });

  it('gives projects rows a sessionCount and the other roots none', async () => {
    const scan = expectOk(await stubOrcastrateApi().beachcomber.scan());
    for (const entry of scan.entries) {
      if (entry.root === 'projects') expect(typeof entry.sessionCount).toBe('number');
      else expect(entry.sessionCount).toBeNull();
    }
  });

  it('tags every row outside projects as an absolute path, as the scanner does', async () => {
    // `src/main/beachcomber/service.ts` derives `pathSource` from the root: a
    // row outside `projects` names its own file, so it is never a session
    // record and never a decoded guess.
    const scan = expectOk(await stubOrcastrateApi().beachcomber.scan());
    const outside = scan.entries.filter((entry) => entry.root !== 'projects');
    expect(outside).not.toHaveLength(0);
    for (const entry of outside) {
      expect(entry.pathSource, entry.id).toBe('absolute-path');
    }
  });

  it('refuses a blocked entry in the preview rather than in the trash', async () => {
    const api = stubOrcastrateApi();
    const scan = expectOk(await api.beachcomber.scan());
    const blocked = scan.entries.find((entry) => entry.blocked !== null);
    const free = scan.entries.find((entry) => entry.blocked === null);
    expect(blocked && free).toBeTruthy();

    const preview = expectOk(
      await api.beachcomber.preview({
        scanId: scan.scanId,
        ids: [blocked?.id ?? '', free?.id ?? ''],
      }),
    );
    expect(preview.refused.map((r) => r.id)).toEqual([blocked?.id]);
    expect(preview.refused[0]?.displayPath).toBe(blocked?.displayPath);
    expect(preview.items.map((i) => i.id)).toEqual([free?.id]);
    expect(preview.refused[0]?.reason.length ?? 0).toBeGreaterThan(0);
  });

  it('returns a fresh scan from trash, without the rows that just went to the bin', async () => {
    const api = stubOrcastrateApi();
    const scan = expectOk(await api.beachcomber.scan());
    const free = scan.entries.find((entry) => entry.blocked === null && !entry.orphan);

    const result = expectOk(
      await api.beachcomber.trash({ scanId: scan.scanId, ids: [free?.id ?? ''] }),
    );
    expect(result.trashed).toEqual([free?.id]);
    expect(result.scan.entries.map((entry) => entry.id)).not.toContain(free?.id);
  });

  it('lists the user scope and both project scopes for one Pod', async () => {
    const scopes = expectOk(await stubOrcastrateApi().helm.listScopes());
    expect(scopes.map((scope) => scope.kind).sort()).toEqual([
      'project',
      'projectLocal',
      'user',
    ]);
    const project = scopes.filter((scope) => scope.podId !== null);
    expect(new Set(project.map((scope) => scope.podId)).size).toBe(1);
    for (const scope of scopes) expect(scope.displayPath.length).toBeGreaterThan(0);
  });

  it('loads a document with unmanaged keys and non-empty hooks text', async () => {
    const doc = expectOk(await stubOrcastrateApi().helm.load('user'));
    expect(Object.keys(doc.unmanaged).length).toBeGreaterThanOrEqual(2);
    expect(doc.hooksJson.length).toBeGreaterThan(0);
    // A validated raw-JSON pane, so the default must actually parse.
    expect(() => JSON.parse(doc.hooksJson) as unknown).not.toThrow();
    expect(doc.parseError).toBeNull();
    expect(doc.revision).not.toBeNull();
  });

  it('hands the unmanaged keys and hooks text back through a save', async () => {
    const api = stubOrcastrateApi();
    const doc = expectOk(await api.helm.load('project:pod-1'));
    const saved = expectOk(
      await api.helm.save({
        scopeId: doc.scope.id,
        revision: doc.revision,
        managed: doc.managed,
        unmanaged: doc.unmanaged,
        hooksJson: doc.hooksJson,
      }),
    );
    expect(saved.document.unmanaged).toEqual(doc.unmanaged);
    expect(saved.document.hooksJson).toBe(doc.hooksJson);
    // A new revision, so a second save is not a stale-revision CONFLICT.
    expect(saved.document.revision).not.toEqual(doc.revision);
    expect(saved.backupDisplayPath.length).toBeGreaterThan(0);
  });
});
