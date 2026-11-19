/**
 * The selection rule behind `push:autoModeSupport`.
 *
 * Pure: no I/O, no clock, no logger. `PodManager` owns the read, the timeout,
 * the log lines, the app-level cache and the push; this module only decides a
 * session's answer from two SDK values of that session:
 *
 *   - MODELS, the raw answer of `Query.supportedModels()` (the initialize
 *     handshake's model list), and
 *   - MODEL, the `model` field of the latest `system`/`init` message.
 *
 * THE MATCHING ENTRIES are the object entries of MODELS whose `value` or
 * `resolvedModel` strictly equals MODEL. The answer is `true` if any matching
 * entry has `supportsAutoMode === true`, else `false` if any has
 * `supportsAutoMode === false`, else undefined. Undefined also covers every
 * malformed input: MODELS not an array, MODEL not a string, and non-object
 * entries, which are skipped.
 */

/**
 * How long the `supportedModels()` read may take. The SDK's method takes no
 * abort signal, so this bound is the whole of the cancellation the read can be
 * given.
 */
export const AUTO_MODE_SUPPORT_READ_TIMEOUT_MS = 10_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * A session's auto-mode answer by the rule in this file's header: `true` if a
 * matching entry says `supportsAutoMode: true`, else `false` if one says
 * `false`, else undefined.
 */
export function autoModeSupportOf(models: unknown, model: unknown): boolean | undefined {
  if (!Array.isArray(models) || typeof model !== 'string') return undefined;
  let answer: boolean | undefined;
  for (const entry of models as unknown[]) {
    if (!isRecord(entry)) continue;
    if (entry['value'] !== model && entry['resolvedModel'] !== model) continue;
    const supports = entry['supportsAutoMode'];
    if (supports === true) return true;
    if (supports === false) answer = false;
  }
  return answer;
}
