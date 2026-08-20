/**
 * The orphaned child: a `start()` that fails AFTER the query exists must reap
 * what it spawned. Contract `pod-lifecycle.ts` section 7, half B.
 *
 * The leak is at exactly one throw site. `:162` (options threw) and `:171`
 * (`#bridge` threw) throw before any query exists, so there is nothing to reap;
 * the `#ready.promise` rejection is the one path where `#bridge` has already
 * returned, the stream is being consumed, and a Claude Code child may be alive.
 */

import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { createPodRunnerWith, PodRunnerError } from '../../../src/main/pod';
import { makeFakeSdk, podOptions, recordHandlers, tick } from './helpers';

const allow = async (): Promise<{ decision: 'allow' }> => ({ decision: 'allow' });

/** Starts a runner and fails it at the ready gate, the one throw site that leaks. */
async function failedStart(overrides: Record<string, unknown> = {}, err?: unknown) {
  const sdk = makeFakeSdk();
  const runner = createPodRunnerWith(sdk.bridge)(podOptions(overrides));
  const handlers = recordHandlers();
  const start = runner.start(handlers, allow);
  sdk.failInitialization(err ?? new Error('spawn claude ENOENT'));
  let thrown: unknown;
  try {
    await start;
  } catch (caught) {
    thrown = caught;
  }
  return { sdk, runner, handlers, thrown };
}

describe('a failed start reaps its own child (criterion 1)', () => {
  it('aborts the controller it handed to query()', async () => {
    const { sdk, thrown } = await failedStart();
    expect(thrown).toBeInstanceOf(PodRunnerError);
    // Asserted through the injected double, not through the runner.
    expect(sdk.aborted).toBe(true);
  });

  it('closes the streaming-input queue it handed to query()', async () => {
    const { sdk } = await failedStart();
    expect(sdk.promptClosed).toBe(true);
  });

  it('reaps nothing at the two throw sites that never built a query', async () => {
    const sdk = makeFakeSdk({ autoInitialize: true });
    const runner = createPodRunnerWith(sdk.bridge)(
      podOptions({ cwd: join(process.cwd(), 'no-such-directory-ffee03') }),
    );
    await expect(runner.start(recordHandlers(), allow)).rejects.toBeInstanceOf(PodRunnerError);
    // No query, no child, nothing to abort.
    expect(sdk.calls).toHaveLength(0);
    expect(sdk.aborted).toBe(false);
  });
});

describe('the child stops streaming into a store with no owner (criterion 4)', () => {
  it('consumes nothing more once start() has rejected', async () => {
    const sdk = makeFakeSdk();
    const runner = createPodRunnerWith(sdk.bridge)(podOptions());
    const handlers = recordHandlers();

    const start = runner.start(handlers, allow);
    // The bridge HAS returned and the stream IS live at this point.
    sdk.emitMessage({ type: 'system', subtype: 'init', session_id: 'sess-live' });
    sdk.failInitialization(new Error('spawn claude ENOENT'));
    await expect(start).rejects.toBeInstanceOf(PodRunnerError);

    const messagesAtRejection = handlers.messages.length;
    const eventsAtRejection = handlers.events.length;

    // A message the child pushes AFTER the owner is gone must reach no handler
    // and append no event.
    sdk.emitMessage({ type: 'assistant', session_id: 'sess-live' });
    sdk.emitMessage({ type: 'result', subtype: 'success', session_id: 'sess-live' });
    await tick();

    expect(handlers.messages).toHaveLength(messagesAtRejection);
    expect(handlers.events).toHaveLength(eventsAtRejection);
    expect(handlers.turnEnds).toBe(0);
  });
});

describe('stop() stays a no-throw idempotent no-op afterwards (criterion 2)', () => {
  it('resolves and throws nothing after a failed start', async () => {
    const { runner } = await failedStart();
    await expect(runner.stop()).resolves.toBeUndefined();
  });

  it('two successive calls are indistinguishable from one', async () => {
    const { runner, handlers } = await failedStart();
    await runner.stop();
    const statusesAfterOne = [...handlers.statuses];
    await runner.stop();
    expect(handlers.statuses).toEqual(statusesAfterOne);
    expect(runner.status).toBe('idle');
  });
});

describe("the caller's error is unchanged (criterion 3)", () => {
  it('SPAWN_FAILED keeps its code and its message', async () => {
    const { thrown } = await failedStart({}, new Error('spawn claude ENOENT'));
    expect(thrown).toBeInstanceOf(PodRunnerError);
    expect((thrown as PodRunnerError).code).toBe('SPAWN_FAILED');
    expect((thrown as PodRunnerError).message).toBe(
      'could not start the claude CLI: spawn claude ENOENT',
    );
  });

  it('RESUME_FAILED keeps its code and its message when a resume was requested', async () => {
    const { thrown } = await failedStart(
      { resume: '30f2c781-82d3-404f-a84b-c551e77ae658' },
      new Error('No conversation found to resume'),
    );
    expect((thrown as PodRunnerError).code).toBe('RESUME_FAILED');
    expect((thrown as PodRunnerError).message).toBe(
      'resume rejected by the CLI: No conversation found to resume',
    );
  });

  it('the resumeRequested guard still refuses to blame a fresh Pod', async () => {
    const { thrown } = await failedStart({}, new Error('No conversation found to resume'));
    expect((thrown as PodRunnerError).code).toBe('SPAWN_FAILED');
  });

  it('CWD_MISSING is still raised before anything is spawned', async () => {
    const sdk = makeFakeSdk({ autoInitialize: true });
    const runner = createPodRunnerWith(sdk.bridge)(
      podOptions({ cwd: join(process.cwd(), 'no-such-directory-ffee04') }),
    );
    let thrown: unknown;
    try {
      await runner.start(recordHandlers(), allow);
    } catch (err) {
      thrown = err;
    }
    expect((thrown as PodRunnerError).code).toBe('CWD_MISSING');
  });

  it('send, interrupt and setPermissionMode still throw NOT_RUNNING', async () => {
    const { runner } = await failedStart();
    for (const call of [
      () => runner.send('hi'),
      () => runner.interrupt(),
      () => runner.setPermissionMode('default'),
    ]) {
      let thrown: unknown;
      try {
        await call();
      } catch (err) {
        thrown = err;
      }
      expect((thrown as PodRunnerError).code).toBe('NOT_RUNNING');
    }
  });
});
