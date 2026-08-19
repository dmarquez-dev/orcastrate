/**
 * The `canUseTool` bridge.
 *
 * The SDK callback takes THREE POSITIONAL ARGUMENTS — `(toolName, input,
 * options)` — measured in probe run `06` and confirmed in `sdk.d.ts` line 209,
 * with `options` carrying `agentID, blockedPath, decisionReason, description,
 * displayName, requestId, signal, suggestions, title, toolUseID`.
 *
 * This is no longer a divergence: amendment E2 corrected the contract, which
 * now records the three-argument signature itself. What the contract still
 * defines FACING ORCASTRATE is unchanged — consumers supply a
 * `PermissionHandler` taking one `PermissionPrompt` and returning one
 * `PermissionAnswer` — and the three-argument reality stays confined to this
 * file. `toPermissionPrompt` below is the single adapter between the two.
 */

import type { PermissionResult } from '@anthropic-ai/claude-agent-sdk';

import type { AgentId, ToolUseId } from '../../shared/contracts/events';
import type { PermissionAnswer, PermissionPrompt } from '../../shared/contracts/pod-runner';

import { alwaysAllowUpdates } from './options';

/** The `options` argument the real callback receives, narrowed to what is used. */
export interface CanUseToolOptions {
  signal: AbortSignal;
  requestId: string;
  toolUseID?: string;
  agentID?: string;
  suggestions?: import('@anthropic-ai/claude-agent-sdk').PermissionUpdate[];
}

/**
 * AMENDMENT E5 — the single place a `PermissionPrompt` is built from the SDK's
 * three arguments.
 *
 * `options.agentID` and `options.toolUseID` used to be read for the SDK-facing
 * result only and dropped on the way in, which is why a prompt could not be
 * attributed to the Calf that raised it and `PodManager` had to file every one
 * under the Matriarch. Both are carried across now.
 *
 * The fields stay OPTIONAL and are OMITTED rather than set to `undefined` when
 * the SDK does not supply them, so `'agentId' in prompt` is a truthful test of
 * whether the CLI offered an attribution at all — the distinction the
 * Matriarch fallback downstream is allowed to key on. An empty string is
 * treated as absent: the SDK sends `""` for a Matriarch-originated call in
 * some builds, and an empty id would resolve to no lane anyway.
 */
export function toPermissionPrompt(
  toolName: string,
  input: unknown,
  options: CanUseToolOptions,
): PermissionPrompt {
  const agentId = nonEmpty(options.agentID);
  const toolUseId = nonEmpty(options.toolUseID);
  return {
    requestId: options.requestId,
    toolName,
    input,
    signal: options.signal,
    ...(agentId !== null ? { agentId: agentId as AgentId } : {}),
    ...(toolUseId !== null ? { toolUseId: toolUseId as ToolUseId } : {}),
  };
}

function nonEmpty(value: string | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export class InvalidPermissionAnswerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidPermissionAnswerError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Maps a contract `PermissionAnswer` onto the SDK's `PermissionResult`.
 *
 * A `deny` with no reason is REJECTED rather than quietly turned into an empty
 * denial message: the contract types `reason` as required on deny, spec 5.4
 * shows the reason to the model, and the SDK's deny branch requires a
 * `message`. Silently substituting `''` would send the model an empty
 * explanation and hide the caller's bug.
 */
export function toPermissionResult(answer: PermissionAnswer, toolName: string, options: CanUseToolOptions): PermissionResult {
  switch (answer.decision) {
    case 'allow':
      return { behavior: 'allow', toolUseID: options.toolUseID };
    case 'allow_always':
      return {
        behavior: 'allow',
        toolUseID: options.toolUseID,
        updatedPermissions: alwaysAllowUpdates(toolName, options.suggestions),
      };
    case 'deny': {
      const reason = answer.reason;
      if (typeof reason !== 'string' || reason.trim().length === 0) {
        throw new InvalidPermissionAnswerError(
          'a deny decision must carry a non-empty reason; the contract types it as required and the model is shown it verbatim',
        );
      }
      return { behavior: 'deny', message: reason, toolUseID: options.toolUseID };
    }
    default: {
      const exhaustive: never = answer;
      throw new InvalidPermissionAnswerError(
        `unrecognized permission decision: ${JSON.stringify(exhaustive)}`,
      );
    }
  }
}

/** The denial used when the turn is interrupted while a card is open. */
export function abortedDenial(options: CanUseToolOptions): PermissionResult {
  return {
    behavior: 'deny',
    message: 'Permission request cancelled: the turn was interrupted before the user answered.',
    toolUseID: options.toolUseID,
  };
}

/**
 * The denial used when the handler misbehaves — it threw, or it answered
 * `deny` with no reason. FAIL CLOSED: the tool is refused. Returning `null`
 * (the SDK's "I answered out of band" signal) or leaving the promise pending
 * would block the tool indefinitely, because permission prompts have no park
 * deadline.
 */
export function handlerFailureDenial(detail: string, options: CanUseToolOptions): PermissionResult {
  return {
    behavior: 'deny',
    message: `Permission denied: Orcastrate could not obtain a decision (${detail}).`,
    toolUseID: options.toolUseID,
  };
}

/**
 * Resolves as soon as either the handler answers or the signal aborts, so a
 * pending prompt SETTLES on interrupt instead of hanging forever.
 */
export function raceAbort<T>(
  work: Promise<T>,
  signal: AbortSignal,
): Promise<{ aborted: false; value: T } | { aborted: true }> {
  if (signal.aborted) return Promise.resolve({ aborted: true as const });
  return new Promise((resolve, reject) => {
    const onAbort = (): void => resolve({ aborted: true as const });
    signal.addEventListener('abort', onAbort, { once: true });
    work.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve({ aborted: false as const, value });
      },
      (err: unknown) => {
        signal.removeEventListener('abort', onAbort);
        reject(err instanceof Error ? err : new Error(String(err)));
      },
    );
  });
}
