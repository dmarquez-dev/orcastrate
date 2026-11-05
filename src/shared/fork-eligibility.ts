/**
 * Whether a Pod may be forked — ONE implementation, read by main and by the
 * renderer.
 *
 * Main answers `pod:fork` with CONFLICT from it, and the renderer disables the
 * Fork control from it. Two copies of the rule would be two rules in a position
 * to disagree, so it lives in `src/shared/`, the one tree both tsconfig
 * programs include (as `./startup-reconciliation-notice.ts` already does).
 *
 * WHAT MAY BE IMPORTED HERE: nothing, or `import type` from
 * `src/shared/contracts/**` only. A reach into `src/main/**` or
 * `src/renderer/**` would break whichever program does not include that tree.
 */

import type { Pod } from './contracts/events';

/**
 *   'eligible'    ccSessionId !== null AND status is 'closed', 'idle' or
 *                 'beached'
 *   'mid-turn'    status is anything else ('running', 'waiting', or a status
 *                 a future build adds). Takes precedence over 'no-session'.
 *   'no-session'  status would be eligible, but ccSessionId === null: there is
 *                 no Claude Code conversation to fork yet.
 */
export type ForkEligibility = 'eligible' | 'mid-turn' | 'no-session';

/**
 * Pure, synchronous, total.
 *
 * WRITTEN IN THE POSITIVE FORM, so it fails closed: the resting statuses are
 * named, and anything not named — including a status this build does not
 * recognise — reads as 'mid-turn', never as 'eligible'. The negative spelling
 * (`status !== 'running' && status !== 'waiting'`) would have to be
 * re-audited every time the status union grows.
 */
export function forkEligibility(pod: Pick<Pod, 'ccSessionId' | 'status'>): ForkEligibility {
  const resting = pod.status === 'closed' || pod.status === 'idle' || pod.status === 'beached';
  if (!resting) return 'mid-turn';
  return pod.ccSessionId === null ? 'no-session' : 'eligible';
}
