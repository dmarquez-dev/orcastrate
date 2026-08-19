/**
 * The SDK options object. Acceptance criteria 3, 4, and the foreground-dispatch
 * finding. Every assertion here is against a MEASURED fact from
 * `tests/fixtures/protocol/findings.json`, not against SDK documentation.
 */

import { describe, expect, it } from 'vitest';

import findings from '../../fixtures/protocol/findings.json';
import { createPodRunnerWith } from '../../../src/main/pod';
import {
  ALLOWED_PERMISSION_MODES,
  DISPATCH_TOOL_NAMES,
  FOREGROUND_DISPATCH_DIRECTIVE,
  buildEnv,
  forceForegroundDispatch,
  isAllowedPermissionMode,
} from '../../../src/main/pod';
import { makeFakeSdk, podOptions, recordHandlers } from './helpers';

async function startWith(overrides = {}) {
  const sdk = makeFakeSdk({ autoInitialize: true });
  const runner = createPodRunnerWith(sdk.bridge)(podOptions(overrides));
  const handlers = recordHandlers();
  await runner.start(handlers, async () => ({ decision: 'allow' }));
  const call = sdk.calls[0];
  if (!call) throw new Error('query() was not called');
  return { sdk, runner, handlers, options: call.options };
}

describe('SDK options (criterion 3)', () => {
  it('always sets forwardSubagentText: true', async () => {
    const { options } = await startWith();
    expect(options.forwardSubagentText).toBe(true);
    expect(findings.optionsVerified.forwardSubagentTextRequired).toBe(true);
  });

  it('carries the session id on `resume`, never on `resumeSessionId`', async () => {
    const { options } = await startWith({ resume: '30f2c781-82d3-404f-a84b-c551e77ae658' });
    expect(options.resume).toBe('30f2c781-82d3-404f-a84b-c551e77ae658');
    expect('resumeSessionId' in options).toBe(false);
    expect(findings.optionsVerified.resumeOptionName).toBe('resume');
  });

  it('omits `resume` entirely for a fresh Pod', async () => {
    const { options } = await startWith();
    expect('resume' in options).toBe(false);
  });

  it('passes cwd and permissionMode through', async () => {
    const { options } = await startWith({ permissionMode: 'plan' });
    expect(options.cwd).toBe(process.cwd());
    expect(options.permissionMode).toBe('plan');
  });
});

describe('permissionMode is restricted to four values (criterion 3)', () => {
  it('allows exactly default | acceptEdits | plan | bypassPermissions', () => {
    expect([...ALLOWED_PERMISSION_MODES]).toEqual([
      'default',
      'acceptEdits',
      'plan',
      'bypassPermissions',
    ]);
  });

  // Inverted from "does not accept acceptEdits at runtime". `acceptEdits` is
  // now part of the exposed product surface; `dontAsk` inherits the
  // known-unexposed role so the negative path keeps a named mode behind it.
  it('accepts acceptEdits at construction', () => {
    const sdk = makeFakeSdk({ autoInitialize: true });
    expect(() =>
      createPodRunnerWith(sdk.bridge)(podOptions({ permissionMode: 'acceptEdits' })),
    ).not.toThrow();
    expect(isAllowedPermissionMode('acceptEdits')).toBe(true);
  });

  it('still rejects a mode the product does not expose at construction', () => {
    const sdk = makeFakeSdk({ autoInitialize: true });
    expect(() =>
      // @ts-expect-error criterion 3: the TYPE rejects it too. This directive
      // failing to be "unused" is itself the type-level half of the assertion.
      createPodRunnerWith(sdk.bridge)(podOptions({ permissionMode: 'dontAsk' })),
    ).toThrow(/unsupported permissionMode/);
    expect(isAllowedPermissionMode('dontAsk')).toBe(false);
  });

  it('accepts acceptEdits through setPermissionMode too', async () => {
    const { runner, sdk } = await startWith();
    await runner.setPermissionMode('acceptEdits');
    expect(sdk.permissionModes).toEqual(['acceptEdits']);
  });

  it('still rejects an unexposed mode through setPermissionMode', async () => {
    const { runner } = await startWith();
    await expect(
      // @ts-expect-error same, on the mid-session path.
      runner.setPermissionMode('dontAsk'),
    ).rejects.toThrow(/unsupported permissionMode/);
  });

  it('rejects the other real CLI modes the product deliberately hides', () => {
    for (const mode of ['dontAsk', 'auto', 'manual']) {
      expect(isAllowedPermissionMode(mode)).toBe(false);
    }
  });

  it('records that the restriction is a PRODUCT choice, not a platform limit', () => {
    // T2 measured the real CLI: it accepts seven modes. Orcastrate exposes four
    // and hides three. This test is the standing evidence that the remaining
    // restriction is a product decision, not a platform limit.
    expect(findings.optionsVerified.permissionModeValues).toContain('acceptEdits');
    expect(findings.optionsVerified.permissionModeValues).toContain('dontAsk');
  });

  it('accepts a valid mode change and forwards it to the SDK', async () => {
    const { runner, sdk } = await startWith();
    await runner.setPermissionMode('bypassPermissions');
    expect(sdk.permissionModes).toEqual(['bypassPermissions']);
  });
});

describe('env is merged over process.env, never substituted (criterion 4)', () => {
  const pathKey = process.platform === 'win32' ? 'Path' : 'PATH';

  it('keeps PATH even when envOverrides is non-empty', async () => {
    const { options } = await startWith({ envOverrides: { ORCASTRATE_POD: 'pod-1' } });
    const env = options.env ?? {};
    const keys = Object.keys(env);
    const hasPath = keys.some((k) => k.toLowerCase() === 'path');
    expect(hasPath).toBe(true);
    expect(env.ORCASTRATE_POD).toBe('pod-1');
    // The exact spelling on this platform is present too.
    expect(keys).toContain(
      keys.find((k) => k.toLowerCase() === 'path') ?? pathKey,
    );
  });

  it('lets an override win over the inherited value', () => {
    const key = Object.keys(process.env).find((k) => typeof process.env[k] === 'string');
    expect(key).toBeDefined();
    const merged = buildEnv({ [key as string]: 'overridden' });
    expect(merged[key as string]).toBe('overridden');
  });

  it('drops undefined inherited entries rather than forwarding them', () => {
    const merged = buildEnv({});
    for (const value of Object.values(merged)) expect(typeof value).toBe('string');
  });

  it('is mandatory because env REPLACES the child environment (measured)', () => {
    expect(findings.optionsVerified.envReplacesEnvironment).toBe(true);
  });
});

describe('foreground dispatch is forced', () => {
  it('registers a PreToolUse hook matching both dispatch tool names', async () => {
    const { options } = await startWith();
    const matchers = options.hooks?.PreToolUse;
    expect(matchers).toBeDefined();
    expect(matchers?.[0]?.matcher).toBe('Agent|Task');
    // CLI 2.1.235 names the dispatch tool `Agent`, not `Task`.
    expect(DISPATCH_TOOL_NAMES).toContain('Agent');
  });

  it('rewrites run_in_background to false on an Agent dispatch', async () => {
    const { sdk } = await startWith();
    const out = (await sdk.callPreToolUseHook({
      hook_event_name: 'PreToolUse',
      tool_name: 'Agent',
      tool_input: { description: 'probe', prompt: 'go', run_in_background: true },
      tool_use_id: 'toolu_1',
    })) as { hookSpecificOutput?: { updatedInput?: Record<string, unknown> } };

    expect(out.hookSpecificOutput?.updatedInput).toEqual({
      description: 'probe',
      prompt: 'go',
      run_in_background: false,
    });
  });

  it('also rewrites a dispatch that simply omitted the flag (the default is background)', () => {
    const out = forceForegroundDispatch({
      hook_event_name: 'PreToolUse',
      tool_name: 'Task',
      tool_input: { description: 'probe', prompt: 'go' },
    });
    expect(out.hookSpecificOutput?.updatedInput.run_in_background).toBe(false);
  });

  it('says nothing about a dispatch that already asked for the foreground', () => {
    const out = forceForegroundDispatch({
      hook_event_name: 'PreToolUse',
      tool_name: 'Agent',
      tool_input: { run_in_background: false },
    });
    expect(out).toEqual({});
  });

  it('never touches a non-dispatch tool', () => {
    const out = forceForegroundDispatch({
      hook_event_name: 'PreToolUse',
      tool_name: 'Bash',
      tool_input: { command: 'ls', run_in_background: true },
    });
    expect(out).toEqual({});
  });

  it('tolerates junk input without throwing', () => {
    for (const junk of [null, undefined, 42, 'x', {}, { hook_event_name: 'PostToolUse' }]) {
      expect(() => forceForegroundDispatch(junk)).not.toThrow();
    }
  });

  it('also appends the directive to the system prompt as a second lever', async () => {
    const { options } = await startWith();
    const prompt = options.systemPrompt as { type: string; preset: string; append: string };
    expect(prompt.type).toBe('preset');
    expect(prompt.preset).toBe('claude_code');
    expect(prompt.append).toBe(FOREGROUND_DISPATCH_DIRECTIVE);
    expect(prompt.append).toContain('run_in_background: false');
  });

  it('is load-bearing: a background Calf forwards zero subagent messages', () => {
    // 04-orphaned-calf.ndjson is a background dispatch and contains no
    // subagent-originated message at all. This is what an unforced dispatch
    // would render in a Calf lane.
    const orphan = findings.fixtures.find((f) => f.file === '04-orphaned-calf.ndjson');
    expect(orphan?.notes).toContain('0 subagent-originated messages');
  });
});
