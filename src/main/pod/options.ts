/**
 * Construction of the SDK `Options` object for one Pod.
 *
 * Everything here is a pure function so the option shape can be asserted
 * without spawning anything (acceptance criterion 11).
 *
 * Every value in this file traces to a MEASUREMENT in
 * `tests/fixtures/protocol/findings.json`, not to SDK documentation. Where the
 * frozen contract and the measurement disagree, the measurement wins and the
 * divergence is called out inline.
 */

import type { Options as SdkOptions, PermissionUpdate } from '@anthropic-ai/claude-agent-sdk';

import type { PermissionMode } from '../../shared/contracts/events';
import type { PodRunnerOptions } from '../../shared/contracts/pod-runner';

/**
 * The four permission modes Orcastrate exposes — the runtime half of the
 * contract's `PermissionMode` union, which is the source of truth.
 *
 * This is still a PRODUCT restriction, not a platform limit. T2 measured the
 * real CLI 2.1.235: it accepts
 * `default, plan, acceptEdits, bypassPermissions, dontAsk, auto, manual`
 * (verbatim commander rejection quoted in findings.json `optionsVerified`).
 * `dontAsk`, `auto` and `manual` remain deliberately unexposed and must keep
 * failing this guard.
 */
export const ALLOWED_PERMISSION_MODES: readonly PermissionMode[] = [
  'default',
  'acceptEdits',
  'plan',
  'bypassPermissions',
];

export function isAllowedPermissionMode(value: unknown): value is PermissionMode {
  return (
    typeof value === 'string' && (ALLOWED_PERMISSION_MODES as readonly string[]).includes(value)
  );
}

/**
 * Runtime guard for the mode. Throws a `RangeError`, deliberately NOT a
 * `PodRunnerError`: no documented `PodRunnerErrorCode` covers "caller passed a
 * value outside the contract's own union", and inventing a code would break
 * acceptance criterion 1's "no added members".
 */
export function assertAllowedPermissionMode(value: unknown): PermissionMode {
  if (!isAllowedPermissionMode(value)) {
    throw new RangeError(
      `unsupported permissionMode ${JSON.stringify(value)}; Orcastrate allows ${ALLOWED_PERMISSION_MODES.join(', ')}`,
    );
  }
  return value;
}

/**
 * Merge of the parent environment with the Pod's overrides.
 *
 * MEASURED, twice: the SDK's `env` REPLACES the child environment, it does not
 * merge. The probe passed `env: { PROBE_MARKER }` alone and the child reported
 * `INHERITED=[] PASSED=[probe-env-marker]`; `sdk.mjs` corroborates with
 * `env: c = {...process.env}`, a destructuring *default* that only applies when
 * the caller omits `env` entirely. Passing `envOverrides` on its own strips
 * PATH and every Pod fails to launch.
 *
 * `process.env` values are `string | undefined`; undefined entries are dropped
 * rather than forwarded, because an explicit `undefined` in the spawn env is
 * not the same as an absent variable on win32.
 */
export function buildEnv(envOverrides: Record<string, string>): Record<string, string> {
  const merged: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === 'string') merged[key] = value;
  }
  for (const [key, value] of Object.entries(envOverrides)) {
    merged[key] = value;
  }
  return merged;
}

/** Tool names CLI 2.1.235 uses for a subagent dispatch. */
export const DISPATCH_TOOL_NAMES: readonly string[] = ['Agent', 'Task'];

/**
 * The single most load-bearing finding of T2's probe.
 *
 * `AgentInput.run_in_background` defaults to TRUE in CLI 2.1.235 ("Agents run
 * in the background by default", sdk-tools.d.ts). A background dispatch returns
 * `{"isAsync":true,"status":"async_launched"}` immediately and forwards ZERO
 * subagent messages — see `04-orphaned-calf.ndjson`, which contains no
 * subagent-originated message at all. Every Calf lane in the product would
 * render empty.
 *
 * Two independent levers force foreground, and both are applied:
 *
 *  1. This `PreToolUse` hook, which rewrites `run_in_background` to `false` on
 *     the tool input before the dispatch runs. Hooks fire for every tool call,
 *     including ones auto-approved without a permission prompt, so unlike
 *     `canUseTool` this does not depend on the permission path being taken.
 *     It is deterministic — it does not ask the model for anything.
 *  2. `FOREGROUND_DISPATCH_DIRECTIVE`, appended to the Claude Code system
 *     prompt preset, which tells the model to pass `run_in_background: false`
 *     itself.
 *
 * Lever 1 is the one that should carry the weight; lever 2 is the belt to its
 * braces and costs a few tokens.
 *
 * VERIFIED against the live CLI. An earlier revision of this comment said "NOT
 * VERIFIED ... acceptance criterion 11 forbids spawning the real binary"; that
 * is superseded. The measurement and its numbers are recorded once, in the
 * FOREGROUND DISPATCH block of `src/shared/contracts/pod-runner.ts` — read it
 * there rather than trusting a copy here. `probe/verify-foreground.ts` is the
 * run that produced it, and it drives THIS function.
 *
 * DO NOT REMOVE THE HOOK on the theory that the directive alone is enough. The
 * directive asks the model; the hook does not ask anyone.
 */
export const FOREGROUND_DISPATCH_DIRECTIVE = [
  'Subagent dispatch policy for this session (Orcastrate):',
  'ALWAYS pass `run_in_background: false` when you call the Agent (Task) tool.',
  'This session renders each subagent as its own live transcript lane, which only',
  'receives messages from foreground dispatches. A background dispatch returns an',
  '"async_launched" acknowledgement and streams nothing, so its lane stays empty and',
  'the user sees no work happening. Never background a dispatch, even when several',
  'run at once — parallel foreground dispatches are fine and interleave correctly.',
].join(' ');

interface PreToolUseLikeInput {
  hook_event_name?: unknown;
  tool_name?: unknown;
  tool_input?: unknown;
}

/**
 * The `PreToolUse` callback that forces foreground dispatch. Exported so its
 * rewrite can be asserted directly.
 *
 * Returns `{}` (no opinion) for anything that is not a dispatch, and for a
 * dispatch that already asked for the foreground — never fabricating a
 * permission decision, only an `updatedInput`.
 */
export function forceForegroundDispatch(input: unknown): {
  hookSpecificOutput?: {
    hookEventName: 'PreToolUse';
    updatedInput: Record<string, unknown>;
  };
} {
  const candidate = input as PreToolUseLikeInput | null;
  if (typeof candidate !== 'object' || candidate === null) return {};
  if (candidate.hook_event_name !== 'PreToolUse') return {};
  if (typeof candidate.tool_name !== 'string') return {};
  if (!DISPATCH_TOOL_NAMES.includes(candidate.tool_name)) return {};

  const toolInput = candidate.tool_input;
  if (typeof toolInput !== 'object' || toolInput === null || Array.isArray(toolInput)) return {};

  const current = (toolInput as { run_in_background?: unknown }).run_in_background;
  if (current === false) return {};

  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      updatedInput: { ...(toolInput as Record<string, unknown>), run_in_background: false },
    },
  };
}

/**
 * `allow_always` writes a rule so the user is not asked again (contract
 * `PermissionAnswer`, spec 5.4). The SDK hands `canUseTool` a `suggestions`
 * array for exactly this and its own docs say to return that full set; when the
 * CLI offers none, fall back to a project-scoped allow rule for the tool.
 */
export function alwaysAllowUpdates(
  toolName: string,
  suggestions: readonly PermissionUpdate[] | undefined,
): PermissionUpdate[] {
  if (suggestions && suggestions.length > 0) return [...suggestions];
  return [
    {
      type: 'addRules',
      rules: [{ toolName }],
      behavior: 'allow',
      destination: 'projectSettings',
    },
  ];
}

/**
 * Assembles the SDK options for one Pod. `canUseTool` and `hooks` are attached
 * by the caller-supplied pieces so this stays pure and assertable.
 */
export function buildSdkOptions(
  podOptions: PodRunnerOptions,
  parts: {
    canUseTool: NonNullable<SdkOptions['canUseTool']>;
    preToolUseHook: NonNullable<NonNullable<SdkOptions['hooks']>['PreToolUse']>[number]['hooks'][number];
    abortController: AbortController;
  },
): SdkOptions {
  const permissionMode = assertAllowedPermissionMode(podOptions.permissionMode);

  const options: SdkOptions = {
    cwd: podOptions.cwd,
    permissionMode,

    // Contract requires the literal `true`; without it subagent text and
    // thinking blocks are never forwarded (measured: 4 blocks with, 0 without)
    // and Calf lanes receive only tool_use/tool_result.
    forwardSubagentText: podOptions.forwardSubagentText,

    // MEASURED: replaces, does not merge. See buildEnv.
    env: buildEnv(podOptions.envOverrides),

    abortController: parts.abortController,
    canUseTool: parts.canUseTool,

    systemPrompt: {
      type: 'preset',
      preset: 'claude_code',
      append: FOREGROUND_DISPATCH_DIRECTIVE,
    },

    hooks: {
      PreToolUse: [
        {
          // Both spellings: the dispatch tool is named `Agent` in CLI 2.1.235,
          // `Task` in older builds. The callback re-checks the name, so a
          // matcher that is interpreted loosely cannot cause a wrong rewrite.
          matcher: DISPATCH_TOOL_NAMES.join('|'),
          hooks: [parts.preToolUseHook],
        },
      ],
    },
  };

  // MEASURED: the option is `resume`, not `resumeSessionId`. Omitted entirely
  // when absent — passing `resume: undefined` is not the same as not resuming
  // for every SDK code path.
  if (podOptions.resume !== undefined) options.resume = podOptions.resume;

  if (podOptions.pathToClaudeCodeExecutable !== undefined) {
    options.pathToClaudeCodeExecutable = podOptions.pathToClaudeCodeExecutable;
  }

  return options;
}
