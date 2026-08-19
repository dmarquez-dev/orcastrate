/**
 * The `canUseTool` bridge.
 *
 * DIVERGENCE FROM THE FROZEN CONTRACT (escalation E2, already recorded):
 * the contract types the SDK callback as `(request, { signal })`. The real
 * signature — measured in probe run `06`, and confirmed in
 * `sdk.d.ts` line 209 — is `(toolName, input, options)`, three positional
 * arguments, with `options` carrying
 * `agentID, blockedPath, decisionReason, description, displayName, requestId,
 * signal, suggestions, title, toolUseID`. The contract's shape is
 * unimplementable as written. What is preserved verbatim is the abstraction the
 * contract defines FACING ORCASTRATE: consumers still supply a
 * `PermissionHandler` taking one `PermissionPrompt` and returning one
 * `PermissionAnswer`. The three-argument reality is confined to this file.
 */

import type { PermissionResult } from '@anthropic-ai/claude-agent-sdk';

import type { PermissionAnswer } from '../../shared/contracts/pod-runner';

import { alwaysAllowUpdates } from './options';

/** The `options` argument the real callback receives, narrowed to what is used. */
export interface CanUseToolOptions {
  signal: AbortSignal;
  requestId: string;
  toolUseID?: string;
  agentID?: string;
  suggestions?: import('@anthropic-ai/claude-agent-sdk').PermissionUpdate[];
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
