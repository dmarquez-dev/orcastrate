/**
 * `PodRunner.supportedModels()`: the SDK's answer passed through unvalidated,
 * `null` for a bridge with no model list, and NOT_RUNNING outside a run.
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

describe('PodRunner.supportedModels', () => {
  it('resolves the very array the SDK session answered, unvalidated', async () => {
    const answer = [{ value: 'sonnet', supportsAutoMode: true }, 'not even an object'];
    const { sdk, runner } = await started({ supportedModels: async () => answer });

    await expect(runner.supportedModels?.()).resolves.toBe(answer);
    expect(sdk.supportedModelsCalls).toBe(1);
  });

  it('resolves null when the SDK session has no supportedModels member', async () => {
    const { runner } = await started();

    await expect(runner.supportedModels?.()).resolves.toBeNull();
  });

  it('rejects with NOT_RUNNING on a runner that was never started', async () => {
    const sdk = makeFakeSdk({ autoInitialize: true, supportedModels: async () => [] });
    const runner = createPodRunnerWith(sdk.bridge)(podOptions());

    await expectNotRunning(runner.supportedModels?.());
    expect(sdk.supportedModelsCalls).toBe(0);
  });

  it('rejects with NOT_RUNNING after stop()', async () => {
    const { sdk, runner } = await started({ supportedModels: async () => [] });
    await runner.stop();

    await expectNotRunning(runner.supportedModels?.());
    expect(sdk.supportedModelsCalls).toBe(0);
  });
});
