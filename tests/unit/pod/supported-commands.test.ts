/**
 * `PodRunner.supportedCommands()`: the SDK's answer passed through unvalidated,
 * `null` for a bridge with no command surface, and NOT_RUNNING outside a run.
 */

import { describe, expect, it } from 'vitest';

import { createPodRunnerWith, PodRunnerError } from '../../../src/main/pod';
import { makeFakeSdk, podOptions, recordHandlers, type FakeSdkOptions } from './helpers';

async function started(sdkOptions: FakeSdkOptions = {}) {
  const sdk = makeFakeSdk({ autoInitialize: true, ...sdkOptions });
  const runner = createPodRunnerWith(sdk.bridge)(podOptions());
  await runner.start(recordHandlers(), async () => ({ decision: 'allow' }));
  return { sdk, runner };
}

async function expectNotRunning(promise: Promise<unknown> | undefined): Promise<void> {
  const err = await promise?.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(PodRunnerError);
  expect((err as PodRunnerError).code).toBe('NOT_RUNNING');
}

describe('PodRunner.supportedCommands', () => {
  it('resolves the very array the SDK session answered, unvalidated', async () => {
    const answer = [{ name: 'review' }, 'not even an object'];
    const { sdk, runner } = await started({ supportedCommands: async () => answer });

    await expect(runner.supportedCommands?.()).resolves.toBe(answer);
    expect(sdk.supportedCommandsCalls).toBe(1);
  });

  it('resolves null when the SDK session has no supportedCommands member', async () => {
    const { runner } = await started();

    await expect(runner.supportedCommands?.()).resolves.toBeNull();
  });

  it('rejects with NOT_RUNNING on a runner that was never started', async () => {
    const sdk = makeFakeSdk({ autoInitialize: true, supportedCommands: async () => [] });
    const runner = createPodRunnerWith(sdk.bridge)(podOptions());

    await expectNotRunning(runner.supportedCommands?.());
    expect(sdk.supportedCommandsCalls).toBe(0);
  });

  it('rejects with NOT_RUNNING after stop()', async () => {
    const { sdk, runner } = await started({ supportedCommands: async () => [] });
    await runner.stop();

    await expectNotRunning(runner.supportedCommands?.());
    expect(sdk.supportedCommandsCalls).toBe(0);
  });
});
