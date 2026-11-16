/**
 * `PodManager.listSlashCommands`: the synchronous read behind `pod:commands`.
 *
 * Driven through the ASSEMBLED pipeline, as `slash-commands-push.test.ts` is:
 * the real `PodManager`, `PodRunner` and store over the fake SDK. The answer is
 * compared against what main actually pushed, because the rule under test is
 * that a pull never differs from the last push for the live session.
 */

import { afterEach, describe, expect, it } from 'vitest';

import type { PodId } from '../../../src/shared/contracts/events';
import { EVENT_CHANNELS, type PodCommandsPush } from '../../../src/shared/contracts/ipc';
import { IpcFailure } from '../../../src/main/ipc';
import { makeHarness, tick, type Harness } from '../ipc/helpers';
import { waitFor } from '../pod/helpers';

function cmd(name: string): { name: string; description: string; argumentHint: string; aliases: string[] } {
  return { name, description: `${name} description`, argumentHint: '', aliases: [] };
}

function init(terminal: unknown): Record<string, unknown> {
  return {
    type: 'system',
    subtype: 'init',
    session_id: 'cc-session-1',
    uuid: 'init-uuid',
    terminal_slash_commands: terminal,
  };
}

type Answer = () => Promise<unknown>;

interface PullHarness extends Harness {
  answers: Map<PodId, Answer>;
}

const harnesses: Harness[] = [];

afterEach(async () => {
  while (harnesses.length > 0) await harnesses.pop()?.dispose();
});

function harness(): PullHarness {
  const answers = new Map<PodId, Answer>();
  const h = makeHarness({ supportedCommands: (podId) => answers.get(podId) });
  harnesses.push(h);
  return Object.assign(h, { answers });
}

async function create(h: PullHarness, title = 'Pull Pod'): Promise<PodId> {
  const created = await h.invoke<{ id: PodId }>('pod:create', {
    title,
    cwd: process.cwd(),
    permissionMode: 'default',
  });
  if (!created.ok) throw new Error(`pod:create failed: ${created.error.code}`);
  return created.value.id;
}

/** Arms the Pod's next `supportedCommands` answer and opens it through IPC. */
async function open(h: PullHarness, podId: PodId, answer: Answer): Promise<void> {
  h.answers.set(podId, answer);
  const opened = await h.invoke('pod:open', podId);
  if (!opened.ok) throw new Error(`pod:open failed: ${opened.error.code}`);
}

function commandPushes(h: Harness, podId: PodId): PodCommandsPush[] {
  return h
    .pushesOn<PodCommandsPush>(EVENT_CHANNELS.podCommands)
    .filter((push) => push.podId === podId);
}

/** Opens a Pod whose read answers `alpha` and `beta`, and waits for its push. */
async function openWithList(h: PullHarness): Promise<PodId> {
  const podId = await create(h);
  await open(h, podId, async () => [cmd('alpha'), cmd('beta')]);
  await waitFor(() => commandPushes(h, podId).length > 0, 'a podCommands push');
  await tick(3);
  return podId;
}

const never: Answer = () => new Promise<unknown>(() => undefined);

describe('PodManager.listSlashCommands', () => {
  it('answers the last pushed list for an open Pod whose read answered', async () => {
    const h = harness();
    const podId = await openWithList(h);

    const last = commandPushes(h, podId).at(-1);
    expect(last?.commands).toHaveLength(2);
    expect(h.manager.listSlashCommands(podId)).toEqual(last?.commands);
  });

  it('answers [] for an open Pod whose read has not settled', async () => {
    const h = harness();
    const podId = await create(h);
    await open(h, podId, never);
    await tick(3);

    expect(h.store.getPod(podId)?.status).toBe('idle');
    expect(h.manager.listSlashCommands(podId)).toEqual([]);
  });

  it('answers [] for a Pod row that was never opened', async () => {
    const h = harness();
    const podId = await create(h);

    expect(h.manager.listSlashCommands(podId)).toEqual([]);
  });

  it('answers [] after closePod, even for a Pod that had a list', async () => {
    const h = harness();
    const podId = await openWithList(h);
    expect(h.manager.listSlashCommands(podId)).toHaveLength(2);

    await h.manager.closePod(podId);

    expect(h.manager.listSlashCommands(podId)).toEqual([]);
  });

  it("answers [] after a close and a reopen, before the new session's read settles", async () => {
    const h = harness();
    const podId = await openWithList(h);
    expect(h.manager.listSlashCommands(podId)).toHaveLength(2);

    await h.manager.closePod(podId);
    await open(h, podId, never);
    await tick(3);

    expect(h.store.getPod(podId)?.status).toBe('idle');
    expect(h.manager.listSlashCommands(podId)).toEqual([]);
  });

  it("omits what the latest init names in terminal_slash_commands, matching the last push", async () => {
    const h = harness();
    const podId = await openWithList(h);

    h.sdk(podId).emitMessage(init(['alpha']));
    await tick(3);

    const last = commandPushes(h, podId).at(-1);
    expect(last?.commands.map((command) => command.name)).toEqual(['beta']);
    expect(h.manager.listSlashCommands(podId)).toEqual(last?.commands);
  });

  it('throws NOT_FOUND for an id no Pod row has', () => {
    const h = harness();

    let thrown: unknown;
    try {
      h.manager.listSlashCommands('no-such-pod');
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(IpcFailure);
    expect((thrown as IpcFailure).code).toBe('NOT_FOUND');
  });

  it('reads only: emits no push and logs nothing', async () => {
    const h = harness();
    const podId = await openWithList(h);
    const pushedBefore = h.pushed.length;
    const loggedBefore = h.logged.length;

    expect(h.manager.listSlashCommands(podId)).toHaveLength(2);
    await tick(3);

    expect(h.pushed).toHaveLength(pushedBefore);
    // `logged` is the record of the harness's injected `warn` and `error`.
    expect(h.logged).toHaveLength(loggedBefore);
  });
});
