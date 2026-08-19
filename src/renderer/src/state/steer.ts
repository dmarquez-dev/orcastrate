/**
 * Steer is COMPOSER PREFILL AND NOTHING ELSE (spec 5.3). No new protocol, no
 * direct send, no `SendMessage`. This function formats the string; the lane
 * rail's Steer button and every future caller go through it so they stay
 * word-identical.
 */

import type { Lane } from '@shared/contracts/events';
import { STEER_PREFILL_PREFIX } from '../contracts/renderer-state';

/**
 * `null` when the lane has no `agentId` — the CLI surfaced nothing to address,
 * so the Steer affordance must not be offered at all. Otherwise the frozen
 * prefix followed by the agent id and nothing else: the caret lands at the end
 * and the user writes their instruction from there.
 */
export function steerPrefill(lane: Lane): string | null {
  const agentId = lane.agentId;
  if (agentId === null || agentId.trim() === '') return null;
  return `${STEER_PREFILL_PREFIX}${agentId}`;
}
