/**
 * `push:podCommands`: when main pushes a Pod's visible slash-command list, and
 * what it carries.
 *
 * Driven through the ASSEMBLED pipeline — the real `PodManager`, the real
 * `PodRunner`, the real store — over the fixture-driven fake SDK, so every
 * `system` message reaches the manager exactly as a CLI's would. The FakeRunner
 * harness is used once, for a runner that has no command surface at all.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { PodId } from '../../../src/shared/contracts/events';
import {
  EVENT_CHANNELS,
  type PodCommandsPush,
  type SlashCommandInfo,
} from '../../../src/shared/contracts/ipc';
import { SLASH_COMMANDS_READ_TIMEOUT_MS } from '../../../src/main/pod-manager';
import { SlashCommandState } from '../../../src/main/pod-manager/slash-commands';
import { makeHarness, tick, type Harness } from '../ipc/helpers';
import { waitFor } from '../pod/helpers';
import { makeManagerHarness, seedPod, type ManagerHarness } from './helpers';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function cmd(name: string): { name: string; description: string; argumentHint: string; aliases: string[] } {
  return { name, description: `${name} description`, argumentHint: '', aliases: [] };
}

function init(terminal?: unknown): Record<string, unknown> {
  return {
    type: 'system',
    subtype: 'init',
    session_id: 'cc-session-1',
    uuid: 'init-uuid',
    ...(terminal !== undefined ? { terminal_slash_commands: terminal } : {}),
  };
}

function commandsChanged(commands: unknown[]): Record<string, unknown> {
  return {
    type: 'system',
    subtype: 'commands_changed',
    commands,
    session_id: 'cc-session-1',
    uuid: 'commands-changed-uuid',
  };
}

interface Pending<T> {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(err: unknown): void;
}

function pending<T>(): Pending<T> {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

type Answer = () => Promise<unknown>;

/** A harness whose per-Pod `supportedCommands` answer is chosen before the open. */
interface CommandsHarness extends Harness {
  answers: Map<PodId, Answer>;
  calls: Map<PodId, number>;
}

const harnesses: { dispose(): Promise<void> }[] = [];

afterEach(async () => {
  vi.useRealTimers();
  while (harnesses.length > 0) await harnesses.pop()?.dispose();
});

function harness(): CommandsHarness {
  const answers = new Map<PodId, Answer>();
  const calls = new Map<PodId, number>();
  const h = makeHarness({
    supportedCommands: (podId) => {
      const answer = answers.get(podId);
      if (answer === undefined) return undefined;
      return () => {
        calls.set(podId, (calls.get(podId) ?? 0) + 1);
        return answer();
      };
    },
  });
  harnesses.push(h);
  return Object.assign(h, { answers, calls });
}

/** Creates a Pod, arms its answer (or none), and opens it through the IPC surface. */
async function openWith(h: CommandsHarness, answer: Answer | undefined, title = 'Commands Pod'): Promise<PodId> {
  const created = await h.invoke<{ id: PodId }>('pod:create', {
    title,
    cwd: process.cwd(),
    permissionMode: 'default',
  });
  if (!created.ok) throw new Error(`pod:create failed: ${created.error.code}`);
  const podId = created.value.id;
  if (answer !== undefined) h.answers.set(podId, answer);
  const opened = await h.invoke('pod:open', podId);
  if (!opened.ok) throw new Error(`pod:open failed: ${opened.error.code}`);
  return podId;
}

function commandPushes(h: Harness, podId?: PodId): PodCommandsPush[] {
  return h
    .pushesOn<PodCommandsPush>(EVENT_CHANNELS.podCommands)
    .filter((push) => podId === undefined || push.podId === podId);
}

function names(push: PodCommandsPush | undefined): string[] | undefined {
  return push?.commands.map((command) => command.name);
}

function warnings(h: Harness): string[] {
  return h.logged.filter((entry) => entry.level === 'warn').map((entry) => String(entry.args[0]));
}

async function emit(h: Harness, podId: PodId, message: unknown): Promise<void> {
  h.sdk(podId).emitMessage(message);
  await tick(3);
}

// ---------------------------------------------------------------------------
// The initial read
// ---------------------------------------------------------------------------

describe('the initial supportedCommands read', () => {
  it('pushes exactly one podCommands carrying the normalized list, after one read', async () => {
    const h = harness();
    const podId = await openWith(h, async () => [
      cmd('alpha'),
      { name: 'beta', description: 9, argumentHint: '<x>', aliases: ['b', 2] },
    ]);
    await waitFor(() => commandPushes(h).length > 0, 'a podCommands push');
    await tick(3);

    expect(commandPushes(h)).toEqual([
      {
        podId,
        commands: [
          { name: 'alpha', description: 'alpha description', argumentHint: '', aliases: [] },
          { name: 'beta', description: '', argumentHint: '<x>', aliases: ['b'] },
        ],
      },
    ]);
    expect(h.calls.get(podId)).toBe(1);
    expect(h.sdk(podId).supportedCommandsCalls).toBe(1);
  });

  it('does not hold up openPod when the read never settles, and pushes nothing', async () => {
    const h = harness();
    const podId = await openWith(h, () => new Promise<unknown>(() => undefined));
    await tick(3);

    expect(
      h.pushesOn<{ podId: PodId; status: string }>(EVENT_CHANNELS.podStatus).filter(
        (push) => push.podId === podId && push.status === 'idle',
      ),
    ).toHaveLength(1);
    expect(commandPushes(h)).toEqual([]);
  });

  it('logs one warn naming the Pod and supportedCommands when the read times out, and pushes nothing', async () => {
    vi.useFakeTimers();
    const h = harness();
    const podId = await openWith(h, () => new Promise<unknown>(() => undefined));

    expect(warnings(h)).toEqual([]);
    await vi.advanceTimersByTimeAsync(SLASH_COMMANDS_READ_TIMEOUT_MS);

    const warned = warnings(h);
    expect(warned).toHaveLength(1);
    expect(warned[0]).toContain(podId);
    expect(warned[0]).toContain('supportedCommands');
    expect(commandPushes(h)).toEqual([]);
  });

  it('logs one warn naming the Pod when the read rejects, pushes nothing, and leaves the Pod idle', async () => {
    const h = harness();
    const podId = await openWith(h, async () => {
      throw new Error('control request failed');
    });
    await waitFor(() => warnings(h).length > 0, 'the read failure warn');
    await tick(3);

    const warned = warnings(h);
    expect(warned).toHaveLength(1);
    expect(warned[0]).toContain(podId);
    expect(warned[0]).toContain('supportedCommands');
    expect(commandPushes(h)).toEqual([]);
    expect(h.store.getPod(podId)?.status).toBe('idle');
  });

  it('pushes an empty first list: exactly one push, carrying commands: []', async () => {
    const h = harness();
    const podId = await openWith(h, async () => []);
    await waitFor(() => commandPushes(h).length > 0, 'a podCommands push');
    await tick(3);

    expect(commandPushes(h)).toEqual([{ podId, commands: [] }]);
  });
});

// ---------------------------------------------------------------------------
// commands_changed
// ---------------------------------------------------------------------------

describe('commands_changed replaces the catalog', () => {
  it('pushes the normalized replacement list after the first push', async () => {
    const h = harness();
    const podId = await openWith(h, async () => [cmd('alpha'), cmd('beta')]);
    await waitFor(() => commandPushes(h).length === 1, 'the first push');

    await emit(h, podId, commandsChanged([cmd('gamma'), { name: '' }, cmd('delta')]));

    const pushes = commandPushes(h);
    expect(pushes).toHaveLength(2);
    expect(pushes[1]).toEqual({ podId, commands: [cmd('gamma'), cmd('delta')] });
  });

  it('discards an initial-read answer that arrives after a replacement', async () => {
    const h = harness();
    const read = pending<unknown>();
    const podId = await openWith(h, () => read.promise);

    await emit(h, podId, commandsChanged([cmd('fresh')]));
    expect(commandPushes(h).map(names)).toEqual([['fresh']]);

    read.resolve([cmd('stale-one'), cmd('stale-two')]);
    await tick(3);

    expect(commandPushes(h).map(names)).toEqual([['fresh']]);
  });
});

// ---------------------------------------------------------------------------
// The terminal set
// ---------------------------------------------------------------------------

describe('the terminal set from system/init', () => {
  it("hides the latest init's terminal_slash_commands, keeping catalog order", async () => {
    const h = harness();
    const read = pending<unknown>();
    const podId = await openWith(h, () => read.promise);

    await emit(h, podId, init(['doctor']));
    expect(commandPushes(h)).toEqual([]);

    read.resolve([cmd('a'), cmd('doctor'), cmd('b')]);
    await waitFor(() => commandPushes(h).length > 0, 'a podCommands push');
    await tick(3);

    expect(commandPushes(h).map(names)).toEqual([['a', 'b']]);

    // An init with no terminal_slash_commands field empties the terminal set.
    await emit(h, podId, init());

    expect(commandPushes(h).map(names)).toEqual([
      ['a', 'b'],
      ['a', 'doctor', 'b'],
    ]);
  });

  it('pushes nothing for a second init whose terminal set is identical', async () => {
    const h = harness();
    const podId = await openWith(h, async () => [cmd('a'), cmd('b')]);
    await waitFor(() => commandPushes(h).length === 1, 'the first push');

    await emit(h, podId, init(['b']));
    expect(commandPushes(h).map(names)).toEqual([['a', 'b'], ['a']]);

    await emit(h, podId, init(['b']));
    expect(commandPushes(h).map(names)).toEqual([['a', 'b'], ['a']]);
  });

  it('pushes nothing for an init while the catalog is unknown (no command surface)', async () => {
    const h = harness();
    const podId = await openWith(h, undefined);
    await tick(3);

    await emit(h, podId, init(['doctor']));

    expect(commandPushes(h)).toEqual([]);
    expect(warnings(h)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Runners, disposal, and more than one Pod
// ---------------------------------------------------------------------------

describe('runners without a command surface, disposal, and several Pods', () => {
  const managers: ManagerHarness[] = [];
  afterEach(async () => {
    while (managers.length > 0) await managers.pop()?.dispose();
  });

  it('opens a Pod whose runner has no supportedCommands member and pushes nothing', async () => {
    const h = makeManagerHarness();
    managers.push(h);
    const podId = seedPod(h, { status: 'closed' });

    await expect(h.manager.openPod(podId)).resolves.toMatchObject({ id: podId });
    expect('supportedCommands' in h.runner(podId)).toBe(false);

    h.runner(podId).handlers?.onMessage(init(['doctor']));
    await tick(3);

    expect(h.attempted.filter((entry) => entry.channel === EVENT_CHANNELS.podCommands)).toEqual([]);
  });

  it('drops a read that settles after the Pod was closed: no push, no error logged', async () => {
    const h = harness();
    const read = pending<unknown>();
    const podId = await openWith(h, () => read.promise);

    const closed = await h.invoke('pod:close', podId);
    expect(closed.ok).toBe(true);

    read.resolve([cmd('late')]);
    await tick(3);

    expect(commandPushes(h)).toEqual([]);
    expect(h.logged.filter((entry) => entry.level === 'error')).toEqual([]);
  });

  it('pushes nothing when the session is disposed after the stream guard passed but before the publish', async () => {
    // The stream handler's own disposed check runs before `observe`; this
    // closes the Pod from INSIDE `observe`, so that check has already passed
    // and only the publish choke point can still stop the push. `closePod`
    // marks the session disposed synchronously, before its first await.
    const h = makeManagerHarness();
    managers.push(h);
    const podId = seedPod(h, { status: 'closed' });
    await h.manager.openPod(podId);
    const pushesOf = () =>
      h.attempted.filter((entry) => entry.channel === EVENT_CHANNELS.podCommands);

    // Positive control: the same path, undisturbed, does push.
    h.runner(podId).handlers?.onMessage(commandsChanged([cmd('before')]));
    expect(pushesOf()).toEqual([
      { channel: EVENT_CHANNELS.podCommands, payload: { podId, commands: [cmd('before')] } },
    ]);

    const original = SlashCommandState.prototype.observe;
    let closing: Promise<void> | undefined;
    let observed: SlashCommandInfo[] | null | undefined;
    const spy = vi
      .spyOn(SlashCommandState.prototype, 'observe')
      .mockImplementation(function (this: SlashCommandState, message: unknown) {
        observed = original.call(this, message);
        closing = h.manager.closePod(podId);
        return observed;
      });
    try {
      h.runner(podId).handlers?.onMessage(commandsChanged([cmd('after')]));
    } finally {
      spy.mockRestore();
    }
    await closing;

    // The state DID report a change, so only the publish could have dropped it.
    expect(observed).toEqual([cmd('after')]);
    expect(closing).toBeDefined();
    expect(pushesOf()).toHaveLength(1);
  });

  it("carries each Pod's own podId and list", async () => {
    const h = harness();
    const first = await openWith(h, async () => [cmd('one')], 'First');
    const second = await openWith(h, async () => [cmd('two'), cmd('three')], 'Second');
    await waitFor(() => commandPushes(h).length === 2, 'one push per Pod');
    await tick(3);

    expect(commandPushes(h, first).map(names)).toEqual([['one']]);
    expect(commandPushes(h, second).map(names)).toEqual([['two', 'three']]);
    expect(commandPushes(h)).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// The raw messages are not consumed
// ---------------------------------------------------------------------------

describe('commands_changed and init still reach the store', () => {
  it('persists each as exactly one system event, with its own subtype, on the Matriarch lane', async () => {
    const h = harness();
    const podId = await openWith(h, async () => [cmd('a')]);
    await waitFor(() => commandPushes(h).length === 1, 'the first push');

    await emit(h, podId, commandsChanged([cmd('b')]));
    await emit(h, podId, init(['b']));

    const matriarch = h.store.getMatriarchLane(podId)?.id;
    expect(matriarch).toBeDefined();
    const systems = h.store
      .readEvents({ podId })
      .filter((event) => event.payload.type === 'system');
    const bySubtype = (subtype: string) =>
      systems.filter(
        (event) => event.payload.type === 'system' && event.payload.subtype === subtype,
      );

    expect(bySubtype('commands_changed')).toHaveLength(1);
    expect(bySubtype('init')).toHaveLength(1);
    expect(bySubtype('commands_changed')[0]?.laneId).toBe(matriarch);
    expect(bySubtype('init')[0]?.laneId).toBe(matriarch);
  });
});
