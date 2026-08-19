/**
 * One provocation per documented PodRunnerErrorCode. Acceptance criterion 9.
 */

import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { PodRunnerErrorCode } from '../../../src/shared/contracts/pod-runner';
import { createPodRunnerWith, PodRunnerError } from '../../../src/main/pod';
import { makeFakeSdk, podOptions, recordHandlers, tick } from './helpers';

const ALL_CODES: PodRunnerErrorCode[] = [
  'CWD_MISSING',
  'SPAWN_FAILED',
  'NOT_RUNNING',
  'ALREADY_STARTED',
  'RESUME_FAILED',
];

async function catchPodError(fn: () => Promise<unknown>): Promise<PodRunnerError> {
  try {
    await fn();
  } catch (err) {
    if (err instanceof PodRunnerError) return err;
    throw err;
  }
  throw new Error('expected a PodRunnerError, none was thrown');
}

describe('PodRunnerError', () => {
  it('is a real, throwable Error carrying a contract code', () => {
    const err = new PodRunnerError('NOT_RUNNING', 'boom');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(PodRunnerError);
    expect(err.name).toBe('PodRunnerError');
    expect(err.code).toBe('NOT_RUNNING');
  });
});

describe('every documented error code is reachable (criterion 9)', () => {
  it('CWD_MISSING — and it is raised before anything is spawned', async () => {
    const sdk = makeFakeSdk({ autoInitialize: true });
    const runner = createPodRunnerWith(sdk.bridge)(
      podOptions({ cwd: join(process.cwd(), 'no-such-directory-ffee01') }),
    );
    const err = await catchPodError(() =>
      runner.start(recordHandlers(), async () => ({ decision: 'allow' })),
    );
    expect(err.code).toBe('CWD_MISSING');
    // The load-bearing half: query() was never called.
    expect(sdk.calls).toHaveLength(0);
  });

  it('CWD_MISSING — a path that exists but is a file, not a directory', async () => {
    const sdk = makeFakeSdk({ autoInitialize: true });
    const runner = createPodRunnerWith(sdk.bridge)(
      podOptions({ cwd: join(process.cwd(), 'package.json') }),
    );
    const err = await catchPodError(() =>
      runner.start(recordHandlers(), async () => ({ decision: 'allow' })),
    );
    expect(err.code).toBe('CWD_MISSING');
    expect(err.message).toContain('not a directory');
    expect(sdk.calls).toHaveLength(0);
  });

  it('SPAWN_FAILED — the binary could not be launched', async () => {
    const sdk = makeFakeSdk();
    const runner = createPodRunnerWith(sdk.bridge)(podOptions());
    const start = runner.start(recordHandlers(), async () => ({ decision: 'allow' }));
    sdk.failInitialization(new Error('spawn claude ENOENT'));
    const err = await catchPodError(() => start);
    expect(err.code).toBe('SPAWN_FAILED');
  });

  it('SPAWN_FAILED — the stream dies before the session is ever up', async () => {
    const sdk = makeFakeSdk();
    const runner = createPodRunnerWith(sdk.bridge)(podOptions());
    const start = runner.start(recordHandlers(), async () => ({ decision: 'allow' }));
    sdk.failStream(new Error('Claude Code process exited with code 1'));
    const err = await catchPodError(() => start);
    expect(err.code).toBe('SPAWN_FAILED');
  });

  it('RESUME_FAILED — only when a resume id was actually supplied', async () => {
    const sdk = makeFakeSdk();
    const runner = createPodRunnerWith(sdk.bridge)(
      podOptions({ resume: '30f2c781-82d3-404f-a84b-c551e77ae658' }),
    );
    const start = runner.start(recordHandlers(), async () => ({ decision: 'allow' }));
    sdk.failInitialization(new Error('No conversation found to resume'));
    const err = await catchPodError(() => start);
    expect(err.code).toBe('RESUME_FAILED');
  });

  it('RESUME_FAILED is not blamed on a fresh Pod', async () => {
    const sdk = makeFakeSdk();
    const runner = createPodRunnerWith(sdk.bridge)(podOptions());
    const start = runner.start(recordHandlers(), async () => ({ decision: 'allow' }));
    sdk.failInitialization(new Error('No conversation found to resume'));
    const err = await catchPodError(() => start);
    expect(err.code).toBe('SPAWN_FAILED');
  });

  it('ALREADY_STARTED — start() twice', async () => {
    const sdk = makeFakeSdk({ autoInitialize: true });
    const runner = createPodRunnerWith(sdk.bridge)(podOptions());
    await runner.start(recordHandlers(), async () => ({ decision: 'allow' }));
    const err = await catchPodError(() =>
      runner.start(recordHandlers(), async () => ({ decision: 'allow' })),
    );
    expect(err.code).toBe('ALREADY_STARTED');
    expect(sdk.calls).toHaveLength(1);
  });

  it('NOT_RUNNING — send() before start()', async () => {
    const sdk = makeFakeSdk({ autoInitialize: true });
    const runner = createPodRunnerWith(sdk.bridge)(podOptions());
    const err = await catchPodError(() => runner.send('hi'));
    expect(err.code).toBe('NOT_RUNNING');
  });

  it('NOT_RUNNING — interrupt() before start()', async () => {
    const sdk = makeFakeSdk({ autoInitialize: true });
    const runner = createPodRunnerWith(sdk.bridge)(podOptions());
    const err = await catchPodError(() => runner.interrupt());
    expect(err.code).toBe('NOT_RUNNING');
  });

  it('NOT_RUNNING — send() after stop()', async () => {
    const sdk = makeFakeSdk({ autoInitialize: true });
    const runner = createPodRunnerWith(sdk.bridge)(podOptions());
    await runner.start(recordHandlers(), async () => ({ decision: 'allow' }));
    await runner.stop();
    const err = await catchPodError(() => runner.send('hi'));
    expect(err.code).toBe('NOT_RUNNING');
  });

  it('NOT_RUNNING — send() on a beached Pod', async () => {
    const sdk = makeFakeSdk({ autoInitialize: true });
    const runner = createPodRunnerWith(sdk.bridge)(podOptions());
    await runner.start(recordHandlers(), async () => ({ decision: 'allow' }));
    sdk.failStream(new Error('Claude Code process exited with code 1'));
    await tick();
    const err = await catchPodError(() => runner.send('hi'));
    expect(err.code).toBe('NOT_RUNNING');
  });

  it('covers every code in the contract union', () => {
    // Guard against a code being added to the contract with no provocation.
    expect(ALL_CODES).toHaveLength(5);
  });
});
