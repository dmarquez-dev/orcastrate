/**
 * canUseTool wiring. Acceptance criterion 5.
 *
 * DIVERGENCE UNDER TEST: the frozen contract types the SDK callback as
 * `(request, { signal })`. The real one is `(toolName, input, options)` —
 * measured in probe run 06 and matching `sdk.d.ts` line 209. These tests drive
 * the real three-argument shape; the `PermissionHandler` abstraction the
 * contract defines is what the runner's caller still sees.
 */

import { describe, expect, it } from 'vitest';

import findings from '../../fixtures/protocol/findings.json';
import { createPodRunnerWith, InvalidPermissionAnswerError } from '../../../src/main/pod';
import { toPermissionResult } from '../../../src/main/pod';
import type {
  PermissionAnswer,
  PermissionPrompt,
} from '../../../src/shared/contracts/pod-runner';
import { makeFakeSdk, podOptions, recordHandlers, tick } from './helpers';

async function started(handler: (p: PermissionPrompt) => Promise<PermissionAnswer>) {
  const sdk = makeFakeSdk({ autoInitialize: true });
  const runner = createPodRunnerWith(sdk.bridge)(podOptions());
  const handlers = recordHandlers();
  await runner.start(handlers, handler);
  return { sdk, runner, handlers };
}

const OPTS = { requestId: 'req-42', toolUseID: 'toolu_01MkAUwWyPMPhRgT4P67ZL95' };

describe('the callback is invoked with three positional arguments', () => {
  it('receives (toolName, input, options) and builds one PermissionPrompt', async () => {
    const seen: PermissionPrompt[] = [];
    const { sdk } = await started(async (p) => {
      seen.push(p);
      return { decision: 'allow' };
    });

    await sdk.callCanUseTool('Write', { file_path: 'x.txt', content: 'hi' }, OPTS);

    expect(seen).toHaveLength(1);
    expect(seen[0]?.toolName).toBe('Write');
    expect(seen[0]?.requestId).toBe('req-42');
    expect(seen[0]?.input).toEqual({ file_path: 'x.txt', content: 'hi' });
    expect(seen[0]?.signal).toBeInstanceOf(AbortSignal);
  });

  it('matches what the probe observed on the wire', () => {
    const permissionFixture = findings.fixtures.find(
      (f) => f.file === '06-permission-prompt.ndjson',
    );
    expect(permissionFixture?.notes).toContain('(toolName, input, options)');
  });
});

describe('decisions surface to the SDK', () => {
  it('allow -> behavior allow', async () => {
    const { sdk } = await started(async () => ({ decision: 'allow' }));
    const result = await sdk.callCanUseTool('Write', {}, OPTS);
    expect(result).toMatchObject({ behavior: 'allow' });
    expect(result).not.toHaveProperty('updatedPermissions');
  });

  it('allow_always -> behavior allow plus a persisted rule', async () => {
    const { sdk } = await started(async () => ({ decision: 'allow_always' }));
    const result = (await sdk.callCanUseTool('Write', {}, OPTS)) as {
      behavior: string;
      updatedPermissions: unknown[];
    };
    expect(result.behavior).toBe('allow');
    expect(result.updatedPermissions).toEqual([
      { type: 'addRules', rules: [{ toolName: 'Write' }], behavior: 'allow', destination: 'projectSettings' },
    ]);
  });

  it('allow_always prefers the SDK`s own suggestions when it offers them', async () => {
    const { sdk } = await started(async () => ({ decision: 'allow_always' }));
    const suggestion = {
      type: 'addRules',
      rules: [{ toolName: 'Write', ruleContent: 'x.txt' }],
      behavior: 'allow',
      destination: 'localSettings',
    };
    const result = (await sdk.callCanUseTool('Write', {}, {
      ...OPTS,
      suggestions: [suggestion],
    })) as { updatedPermissions: unknown[] };
    expect(result.updatedPermissions).toEqual([suggestion]);
  });

  it('deny -> behavior deny carrying the reason verbatim', async () => {
    const { sdk } = await started(async () => ({ decision: 'deny', reason: 'not this file' }));
    const result = await sdk.callCanUseTool('Write', {}, OPTS);
    expect(result).toMatchObject({ behavior: 'deny', message: 'not this file' });
  });
});

describe('a deny without a reason is rejected (criterion 5)', () => {
  it('the mapper refuses it rather than substituting an empty message', () => {
    expect(() =>
      toPermissionResult({ decision: 'deny' } as PermissionAnswer, 'Write', {
        signal: new AbortController().signal,
        requestId: 'r',
      }),
    ).toThrow(InvalidPermissionAnswerError);
  });

  it('refuses a whitespace-only reason too', () => {
    expect(() =>
      toPermissionResult({ decision: 'deny', reason: '   ' }, 'Write', {
        signal: new AbortController().signal,
        requestId: 'r',
      }),
    ).toThrow(/non-empty reason/);
  });

  it('fails CLOSED at the boundary: the tool is denied, never left pending', async () => {
    const { sdk, handlers } = await started(
      async () => ({ decision: 'deny' }) as PermissionAnswer,
    );
    const result = (await sdk.callCanUseTool('Write', {}, OPTS)) as {
      behavior: string;
      message: string;
    };
    expect(result.behavior).toBe('deny');
    expect(result.message).toContain('could not obtain a decision');
    expect(handlers.events.some((e) => e.type === 'error')).toBe(true);
  });

  it('fails closed when the handler throws outright', async () => {
    const { sdk } = await started(async () => {
      throw new Error('renderer went away');
    });
    const result = (await sdk.callCanUseTool('Write', {}, OPTS)) as { behavior: string };
    expect(result.behavior).toBe('deny');
  });
});

describe('an aborting signal settles the pending prompt (criterion 5)', () => {
  it('resolves to a denial instead of hanging', async () => {
    const controller = new AbortController();
    // A handler that NEVER answers — the card is still open.
    const { sdk } = await started(() => new Promise<PermissionAnswer>(() => undefined));

    const pending = sdk.callCanUseTool('Write', {}, { ...OPTS, signal: controller.signal });

    let settled = false;
    void pending.then(() => {
      settled = true;
    });
    await tick();
    expect(settled).toBe(false);

    controller.abort();
    const result = (await pending) as { behavior: string; message: string };
    expect(settled).toBe(true);
    expect(result.behavior).toBe('deny');
    expect(result.message).toContain('interrupted');
  });

  it('settles immediately when the signal was already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const { sdk } = await started(() => new Promise<PermissionAnswer>(() => undefined));
    const result = (await sdk.callCanUseTool('Write', {}, {
      ...OPTS,
      signal: controller.signal,
    })) as { behavior: string };
    expect(result.behavior).toBe('deny');
  });
});

describe('permission activity is recorded as synthetic events', () => {
  it('emits a request and a matching decision', async () => {
    const { sdk, handlers } = await started(async () => ({ decision: 'allow' }));
    await sdk.callCanUseTool('Write', { file_path: 'x' }, OPTS);

    const request = handlers.events.find((e) => e.type === 'permission_request');
    const decision = handlers.events.find((e) => e.type === 'permission_decision');
    expect(request?.payload).toMatchObject({
      requestId: 'req-42',
      toolName: 'Write',
      toolUseId: 'toolu_01MkAUwWyPMPhRgT4P67ZL95',
    });
    expect(decision?.payload).toMatchObject({ requestId: 'req-42', decision: 'allow' });
  });

  it('parks the Pod in `waiting` while a card is open', async () => {
    let release!: (a: PermissionAnswer) => void;
    const { sdk, runner } = await started(
      () => new Promise<PermissionAnswer>((res) => (release = res)),
    );
    const pending = sdk.callCanUseTool('Write', {}, OPTS);
    await tick();
    expect(runner.status).toBe('waiting');
    release({ decision: 'allow' });
    await pending;
    expect(runner.status).toBe('running');
  });
});
