/**
 * The channel surface itself (acceptance criteria 2, 11, 12).
 *
 * These tests enumerate the FROZEN CONSTANTS and compare them against what
 * main actually installed, in both directions: no contract channel may be left
 * unhandled, and no handler may exist for a channel the contract does not
 * declare. A drift in either direction is what leaves the renderer awaiting a
 * promise that never settles, or reachable capability nobody reviewed.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { EVENT_CHANNELS, INVOKE_CHANNELS } from '../../../src/shared/contracts/ipc';
import type {
  IpcResult,
  OrcastrateApi,
  PodDeletionResult,
  SlashCommandInfo,
} from '../../../src/shared/contracts/ipc';
import type { Pod } from '../../../src/shared/contracts/events';
import { ROUTING_MODE } from '../../../src/main/pod-manager';

import { driveFixture, findings, makeHarness, openPod, tick, type Harness } from './helpers';

const harnesses: Harness[] = [];

function harness(options: Parameters<typeof makeHarness>[0] = {}): Harness {
  const made = makeHarness(options);
  harnesses.push(made);
  return made;
}

afterEach(async () => {
  while (harnesses.length > 0) await harnesses.pop()?.dispose();
});

describe('the frozen channel constants themselves', () => {
  it('declares exactly 23 invoke channels, all with distinct wire names', () => {
    const keys = Object.keys(INVOKE_CHANNELS);
    const values = Object.values(INVOKE_CHANNELS);
    expect(keys.length).toBe(23);
    expect(new Set(values).size).toBe(values.length);
  });

  it('declares exactly 8 push channels, all with distinct wire names', () => {
    const values = Object.values(EVENT_CHANNELS);
    expect(Object.keys(EVENT_CHANNELS).length).toBe(8);
    expect(new Set(values).size).toBe(values.length);
  });

  it('names the six panel channels exactly as the frozen contracts spell them', () => {
    expect(INVOKE_CHANNELS.beachcomberScan).toBe('beachcomber:scan');
    expect(INVOKE_CHANNELS.beachcomberPreview).toBe('beachcomber:preview');
    expect(INVOKE_CHANNELS.beachcomberTrash).toBe('beachcomber:trash');
    expect(INVOKE_CHANNELS.helmScopes).toBe('helm:scopes');
    expect(INVOKE_CHANNELS.helmLoad).toBe('helm:load');
    expect(INVOKE_CHANNELS.helmSave).toBe('helm:save');
    expect(EVENT_CHANNELS.helmChanged).toBe('push:helmChanged');
  });

  // The pull shares its key with the push (`EVENT_CHANNELS.podCommands`), but
  // the two objects are separate and the wire names stay distinct.
  it("names the slash-command pull 'pod:commands', distinct from its push", () => {
    expect(INVOKE_CHANNELS.podCommands).toBe('pod:commands');
    expect(EVENT_CHANNELS.podCommands).toBe('push:podCommands');
  });

  // A wire name colliding across the two constant objects would let a push
  // shadow an invoke in `ipcRenderer`, which is the kind of thing nobody finds
  // until a panel goes quiet in production.
  it('shares no wire name between the invoke and push constants', () => {
    const all = [...Object.values(INVOKE_CHANNELS), ...Object.values(EVENT_CHANNELS)];
    expect(new Set(all).size).toBe(all.length);
  });
});

describe('invoke channels (criterion 2)', () => {
  it('registers exactly one handler for every channel in INVOKE_CHANNELS', () => {
    const installed = harness().channels;
    const declared = Object.values(INVOKE_CHANNELS);

    expect(new Set(installed).size, 'a channel was registered twice').toBe(installed.length);
    expect([...installed].sort()).toEqual([...declared].sort());
    expect(installed.length).toBe(23);
  });

  it("names the fork channel 'pod:fork' and registers exactly one handler for it", () => {
    expect(INVOKE_CHANNELS.podFork).toBe('pod:fork');
    const installed = harness().channels;
    expect(installed.filter((channel) => channel === 'pod:fork')).toHaveLength(1);
  });

  /**
   * `register` refuses a duplicate, and the six new channels did not weaken
   * that. The guard is unreachable from outside — every registration is
   * spelled once against a distinct `INVOKE_CHANNELS` member — so what is
   * pinned here is the property it protects: Electron is handed each channel
   * exactly once, including after the panel channels arrived. A second
   * `handle` on one channel is what silently replaces a handler in production.
   */
  it('hands ipcMain each channel exactly once, panel channels included', () => {
    const handled = [...harness().channels];

    expect(handled.length).toBe(new Set(handled).size);
    for (const channel of [
      INVOKE_CHANNELS.beachcomberScan,
      INVOKE_CHANNELS.beachcomberPreview,
      INVOKE_CHANNELS.beachcomberTrash,
      INVOKE_CHANNELS.helmScopes,
      INVOKE_CHANNELS.helmLoad,
      INVOKE_CHANNELS.helmSave,
    ]) {
      expect(handled.filter((name) => name === channel)).toHaveLength(1);
    }
  });

  it('registers no handler for a channel outside the contract', () => {
    const declared = new Set<string>(Object.values(INVOKE_CHANNELS));
    const extra = harness().channels.filter((channel) => !declared.has(channel));
    expect(extra).toEqual([]);
  });

  it('every declared channel actually answers', async () => {
    const h = harness();
    for (const channel of Object.values(INVOKE_CHANNELS)) {
      // Called with no arguments on purpose: the point is that SOMETHING
      // settles, not that it succeeds. A missing handler would reject.
      const result = await h.invoke(channel);
      expect(result, `${channel} did not resolve an envelope`).toHaveProperty('ok');
    }
  });
});

describe('push channels (criterion 2)', () => {
  it('main emits every channel in EVENT_CHANNELS', async () => {
    // `push:podCommands` comes from opening a Pod whose fake SDK session
    // answers `supportedCommands`, exactly as the real query would, rather
    // than from calling a push sink by hand. `push:autoModeSupport` comes the
    // same way: the session answers `supportedModels` with an entry for the
    // model the fixture's `system`/`init` names.
    const h = harness({
      supportedCommands: () => async () => [
        { name: 'review', description: 'Review a diff', argumentHint: '', aliases: [] },
      ],
      supportedModels: () => async () => [{ value: 'claude-sonnet-5', supportsAutoMode: true }],
    });
    const podId = await openPod(h);

    await driveFixture(h, podId, '01-parallel-dispatch.ndjson');

    // A permission prompt, driven exactly as the SDK would drive it.
    const controller = new AbortController();
    const decision = h.sdk(podId).callCanUseTool(
      'Bash',
      { command: 'ls' },
      { requestId: 'req-channels', signal: controller.signal },
    );
    await tick();
    await h.invoke('permission:respond', {
      podId,
      requestId: 'req-channels',
      decision: 'allow',
    });
    await decision;

    // `push:helmChanged` does not come from PodManager — it comes from
    // HelmService's watcher, through the SAME sink `src/main/index.ts` hands
    // both. Driving it here is what keeps this test's claim ("main emits every
    // channel") true rather than quietly scoped to the Pod pipeline.
    h.helm.watch('user');

    const emitted = new Set(h.pushed.map((entry) => entry.channel));
    for (const channel of Object.values(EVENT_CHANNELS)) {
      expect(emitted.has(channel), `${channel} was never emitted by main`).toBe(true);
    }
  });
});

describe('routing mode has one source of truth (criterion 11)', () => {
  it('app:routingMode answers with the mode the live PodManager builds routers with', async () => {
    const h = harness();
    const result = await h.invoke<string>(INVOKE_CHANNELS.appRoutingMode);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBe(h.manager.routingMode);
    expect(result.value).toBe(ROUTING_MODE);
  });

  it('the shipped constant still matches the probe findings it was derived from', () => {
    expect(ROUTING_MODE).toBe(findings().recommendedRoutingMode);
  });
});

describe('this task ends at the IPC boundary (criterion 12)', () => {
  const SRC = fileURLToPath(new URL('../../../src/main/', import.meta.url));

  function sourcesUnder(dir: string): { file: string; text: string }[] {
    return readdirSync(join(SRC, dir))
      .filter((name) => name.endsWith('.ts'))
      .map((name) => ({ file: `${dir}/${name}`, text: readFileSync(join(SRC, dir, name), 'utf8') }));
  }

  const owned = [...sourcesUnder('ipc'), ...sourcesUnder('pod-manager')];

  it('imports no React and nothing from the renderer', () => {
    for (const { file, text } of owned) {
      expect(/from\s+['"]react/.test(text), `${file} imports React`).toBe(false);
      expect(/from\s+['"][^'"]*renderer/.test(text), `${file} imports renderer code`).toBe(false);
    }
  });

  it('imports no electron, so the whole surface is testable without a runtime', () => {
    for (const { file, text } of owned) {
      expect(/from\s+['"]electron['"]/.test(text), `${file} imports electron`).toBe(false);
    }
  });

  /**
   * The panel ports are INJECTED, and this is what says so. `src/main/ipc/**`
   * must reach neither the filesystem nor either service implementation: if it
   * could, "validation is shape-only and path resolution is the service's job"
   * would be a convention instead of a fact, and the next handler to need a
   * path would just import `node:path` and take one.
   */
  it('reaches neither node:fs nor the panel implementations from src/main/ipc', () => {
    for (const { file, text } of sourcesUnder('ipc')) {
      expect(/from\s+['"]node:fs(\/promises)?['"]/.test(text), `${file} imports node:fs`).toBe(
        false,
      );
      expect(/from\s+['"]node:path['"]/.test(text), `${file} imports node:path`).toBe(false);
      // The frozen CONTRACT under `shared/contracts/` is exactly what these
      // files are supposed to import — type-only. What is refused is the
      // IMPLEMENTATION under `src/main/`.
      expect(
        /from\s+['"](?![^'"]*shared\/contracts)[^'"]*\/beachcomber['"]/.test(text),
        `${file} imports the beachcomber implementation instead of taking the injected port`,
      ).toBe(false);
      expect(
        /from\s+['"](?![^'"]*shared\/contracts)[^'"]*\/helm['"]/.test(text),
        `${file} imports the helm implementation instead of taking the injected port`,
      ).toBe(false);
      expect(/\brequire\(/.test(text), `${file} uses require()`).toBe(false);
    }
  });

  /**
   * The vacuity guard for the scan above: a typo in the directory name, or a
   * filter that matched nothing, would make every assertion pass over an empty
   * list. The contract types are imported type-only, so a `beachcomber`
   * mention in the source is expected — an IMPORT of the implementation is not.
   */
  it('has ipc sources to scan at all, and they do name the panel contracts', () => {
    const files = sourcesUnder('ipc');
    expect(files.length).toBeGreaterThanOrEqual(4);
    const all = files.map((entry) => entry.text).join('\n');
    expect(all).toContain('shared/contracts/beachcomber');
    expect(all).toContain('shared/contracts/helm');
  });
});

/**
 * THE NEGATIVE GUARD FOR THE E1 DECISION.
 *
 * Escalation E1 was resolved at Gate 2 AGAINST a `PodView` wrapper and AGAINST
 * a parallel `opened` boolean: `Pod.status` is the single authoritative field
 * for whether main holds a live runner, and openness is DERIVED from it. A
 * decision recorded only in a docblock is a hope. These tests are the part that
 * fails a build, so the rejected shape cannot return through a later
 * well-meaning patch that "just adds a convenience field".
 *
 * Both halves are here on purpose. The TYPE half catches a field added to the
 * contract; the RUNTIME half catches a field a handler adds without the
 * contract admitting it, which the type half cannot see.
 */
describe('openness is derived from status, never carried beside it', () => {
  type PodsApi = OrcastrateApi['pods'];
  type Unwrap<T> = T extends Promise<IpcResult<infer V>> ? V : never;
  type ValueOf<M extends keyof PodsApi> = Unwrap<ReturnType<PodsApi[M]>>;
  /** A reply is often a list; the prohibition is on the ELEMENT's shape. */
  type Element<T> = T extends readonly (infer E)[] ? E : T;

  type ForbiddenReturnKey<M extends keyof PodsApi> = Extract<
    keyof Element<ValueOf<M>>,
    'opened' | 'isOpen'
  >;

  /**
   * Fails to COMPILE — not at runtime — the moment any `pods` method's return
   * type grows a parallel openness field. `npm run typecheck:node` is where
   * this one is enforced. The object literal below is what forces EVERY member
   * of the namespace through the check, rather than only the ones a test
   * remembered to name.
   */
  type NoOpenedOnAnyReturn = {
    [M in keyof PodsApi]: [ForbiddenReturnKey<M>] extends [never]
      ? true
      : { POD_METHOD_RETURNS_A_PARALLEL_OPENNESS_FIELD: M };
  };

  const returnsAreClean: NoOpenedOnAnyReturn = {
    list: true,
    create: true,
    update: true,
    delete: true,
    open: true,
    close: true,
    reconnect: true,
    fork: true,
    commands: true,
    send: true,
    interrupt: true,
    setPermissionMode: true,
  };

  /** Type-level EXACT equality, checked in both directions. */
  type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

  /**
   * THE SIGNATURES DO NOT MOVE. Every method that returns `Pod` today still
   * returns `Pod` — not a wrapper, not a widened union, not a `Pod & {...}`.
   * `Exact` is bidirectional, so a supertype fails here too.
   */
  const podReturningMethodsStillReturnPod: {
    list: Exact<ValueOf<'list'>, Pod[]>;
    create: Exact<ValueOf<'create'>, Pod>;
    update: Exact<ValueOf<'update'>, Pod>;
    open: Exact<ValueOf<'open'>, Pod>;
    reconnect: Exact<ValueOf<'reconnect'>, Pod>;
    fork: Exact<ValueOf<'fork'>, Pod>;
    // The slash-command pull answers the bare list, the same element type the
    // push carries, with no openness or status field beside it.
    commands: Exact<ValueOf<'commands'>, SlashCommandInfo[]>;
    // AMENDED: `delete` now reports what happened rather than resolving
    // `void`. The exactness check is what stops the report growing a field the
    // contract has not admitted.
    delete: Exact<ValueOf<'delete'>, PodDeletionResult>;
    close: Exact<ValueOf<'close'>, void>;
    send: Exact<ValueOf<'send'>, void>;
    interrupt: Exact<ValueOf<'interrupt'>, void>;
    setPermissionMode: Exact<ValueOf<'setPermissionMode'>, void>;
  } = {
    list: true,
    create: true,
    update: true,
    open: true,
    reconnect: true,
    fork: true,
    commands: true,
    delete: true,
    close: true,
    send: true,
    interrupt: true,
    setPermissionMode: true,
  };

  /**
   * `status` TRAVELS OUTWARD ONLY. No request payload on this namespace
   * declares one, which is precisely why `src/main/ipc/**` needs no status
   * validator: there is no inbound status to validate.
   */
  type ForbiddenArgKey<M extends keyof PodsApi> = {
    [K in keyof Parameters<PodsApi[M]>]: Extract<
      keyof Parameters<PodsApi[M]>[K],
      'status' | 'opened'
    >;
  }[number];

  type NoStatusInboundOnAnyMethod = {
    [M in keyof PodsApi]: [ForbiddenArgKey<M>] extends [never]
      ? true
      : { POD_METHOD_ACCEPTS_A_STATUS_OR_OPENED_ARGUMENT: M };
  };

  const argumentsAreClean: NoStatusInboundOnAnyMethod = {
    list: true,
    create: true,
    update: true,
    delete: true,
    open: true,
    close: true,
    reconnect: true,
    fork: true,
    commands: true,
    send: true,
    interrupt: true,
    setPermissionMode: true,
  };

  it('type-checks the three prohibitions above (they fail the build, not this run)', () => {
    // The assertions ARE the type annotations. This body exists so the three
    // constants are used: an unused const is a lint failure, and a guard a
    // linter deletes is not a guard.
    expect(Object.values(returnsAreClean).every((v) => v === true)).toBe(true);
    expect(Object.values(podReturningMethodsStillReturnPod).every((v) => v === true)).toBe(true);
    expect(Object.values(argumentsAreClean).every((v) => v === true)).toBe(true);
  });

  /** Every key named anywhere in `value`, however deeply nested. */
  function allKeys(value: unknown, seen = new Set<unknown>()): string[] {
    if (value === null || typeof value !== 'object') return [];
    if (seen.has(value)) return [];
    seen.add(value);
    if (Array.isArray(value)) return value.flatMap((entry) => allKeys(entry, seen));
    return Object.entries(value as Record<string, unknown>).flatMap(([key, nested]) => [
      key,
      ...allKeys(nested, seen),
    ]);
  }

  const FORBIDDEN = ['opened', 'isOpen'];

  it('no reply on any frozen invoke channel carries an openness field', async () => {
    const h = harness();
    const podId = await openPod(h);

    // Arguments that make the pod-shaped channels actually SUCCEED. An
    // envelope that failed validation carries no Pod, and the sweep over it
    // would be vacuous.
    const args: Record<string, unknown[]> = {
      [INVOKE_CHANNELS.podCreate]: [
        { title: 'Sweep', cwd: process.cwd(), permissionMode: 'default' },
      ],
      [INVOKE_CHANNELS.podUpdate]: [{ podId, title: 'Renamed' }],
      [INVOKE_CHANNELS.podOpen]: [podId],
      [INVOKE_CHANNELS.podCommands]: [podId],
      [INVOKE_CHANNELS.podSend]: [podId, 'hello'],
      [INVOKE_CHANNELS.podInterrupt]: [podId],
      [INVOKE_CHANNELS.podSetPermissionMode]: [podId, 'plan'],
      [INVOKE_CHANNELS.laneList]: [podId],
      [INVOKE_CHANNELS.eventsRead]: [{ podId }],
    };

    // Driven separately below, so this sweep does not tear down the Pod it is
    // still using.
    const deferred = new Set<string>([
      INVOKE_CHANNELS.podClose,
      INVOKE_CHANNELS.podReconnect,
      INVOKE_CHANNELS.podDelete,
    ]);

    let sawAPod = false;
    let commandsAnswered = false;
    for (const channel of Object.values(INVOKE_CHANNELS)) {
      if (deferred.has(channel)) continue;

      const result = await h.invoke(channel, ...(args[channel] ?? []));
      if (channel === INVOKE_CHANNELS.podCommands) commandsAnswered = result.ok;
      if (!result.ok) continue;
      const keys = allKeys(result.value);
      if (keys.includes('status') && keys.includes('lastActiveAt')) sawAPod = true;
      for (const forbidden of FORBIDDEN) {
        expect(keys, `${channel} replied with a '${forbidden}' field`).not.toContain(forbidden);
      }
    }

    // Vacuity guard: the sweep must have seen a Pod-shaped reply, or "no reply
    // carried `opened`" is a statement about nothing.
    expect(sawAPod, 'the sweep never observed a Pod-shaped reply').toBe(true);
    // The same guard for the slash-command pull: its row must have been swept
    // as a successful reply, not skipped as a failed envelope.
    expect(commandsAnswered, 'pod:commands did not answer ok in the sweep').toBe(true);
  });

  it('close and reconnect answer without an openness field either', async () => {
    const h = harness();
    const podId = await openPod(h);

    const closed = await h.invoke(INVOKE_CHANNELS.podClose, podId);
    expect(closed.ok).toBe(true);
    expect(allKeys(closed.ok ? closed.value : null)).not.toContain('opened');

    const reconnected = await h.invoke<Record<string, unknown>>(
      INVOKE_CHANNELS.podReconnect,
      podId,
    );
    expect(reconnected.ok).toBe(true);
    if (!reconnected.ok) return;
    // Vacuity guard for this one: reconnect really did answer with a Pod.
    expect(reconnected.value).toHaveProperty('status');
    expect(allKeys(reconnected.value)).not.toContain('opened');
  });

  it('every podStatus push carries exactly the contract shape and nothing else', async () => {
    const h = harness();
    const podId = await openPod(h);
    await driveFixture(h, podId, '01-parallel-dispatch.ndjson');
    await h.invoke(INVOKE_CHANNELS.podClose, podId);

    const pushes = h.pushesOn<Record<string, unknown>>(EVENT_CHANNELS.podStatus);
    expect(pushes.length, 'no podStatus push was observed').toBeGreaterThan(0);

    // `PodStatusPush` is `podId`, `status`, and — for `'beached'` alone —
    // `exitCode` and `detail`. Nothing else may ride along.
    const allowed = new Set(['podId', 'status', 'exitCode', 'detail']);
    for (const push of pushes) {
      for (const key of Object.keys(push)) {
        expect(allowed.has(key), `podStatus push carried an undeclared '${key}'`).toBe(true);
      }
      expect(push).toHaveProperty('podId');
      expect(push).toHaveProperty('status');
    }
  });

  /**
   * The runtime half of "no inbound status". The request validators are
   * WHITELISTS, and this pins that they stay whitelists rather than growing a
   * pass-through that would let a renderer dictate main's view of its own
   * session registry.
   */
  it('ignores a status or opened smuggled into a pods request', async () => {
    const h = harness();

    const created = await h.invoke<Record<string, unknown>>(INVOKE_CHANNELS.podCreate, {
      title: 'Smuggler',
      cwd: process.cwd(),
      permissionMode: 'default',
      status: 'running',
      opened: true,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.value['status'], 'pod:create accepted a caller-supplied status').not.toBe(
      'running',
    );
    expect(Object.keys(created.value)).not.toContain('opened');

    const podId = created.value['id'] as string;
    const before = created.value['status'];

    const updated = await h.invoke<Record<string, unknown>>(INVOKE_CHANNELS.podUpdate, {
      podId,
      title: 'Same status as before',
      status: 'beached',
      opened: true,
    });
    expect(updated.ok).toBe(true);
    if (!updated.ok) return;
    expect(updated.value['status'], 'pod:update accepted a caller-supplied status').toBe(before);
    expect(Object.keys(updated.value)).not.toContain('opened');
  });

  /**
   * NO NEW VALIDATOR, asserted at the source. The product's ONLY runtime
   * enforcement of the status set is SQLite's CHECK constraint at the schema
   * head. That is a PRE-EXISTING property and this session does not change it:
   * a second enforcement point here would be a design change nobody licensed,
   * and — worse — a second copy of the status union, free to drift from the
   * contract in silence.
   */
  it('src/main/ipc validates no status and knows no openness field', () => {
    const IPC = fileURLToPath(new URL('../../../src/main/ipc/', import.meta.url));
    const files = readdirSync(IPC).filter((name) => name.endsWith('.ts'));
    expect(files.length).toBeGreaterThanOrEqual(4);

    for (const name of files) {
      const text = readFileSync(join(IPC, name), 'utf8');
      expect(/\bopened\b/.test(text), `${name} mentions an openness field`).toBe(false);
      expect(/\bPodStatus\b/.test(text), `${name} imports the status union`).toBe(false);
      expect(
        /\b(requireStatus|isAllowedStatus|POD_STATUSES)\b/.test(text),
        `${name} added a status validator`,
      ).toBe(false);
    }
  });
});
