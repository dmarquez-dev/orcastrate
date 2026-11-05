// frozen: 20261105-1907-fork-session-branching, Gate 2
/**
 * CONTRACT — the renderer-facing fork surface: the IPC channel, the preload
 * method, its errors, and the shared eligibility rule.
 *
 * Boundary between: T3 (implements all of it, in the source tree) and T4
 * (calls `window.orcastrate.pods.fork`, calls `forkEligibility`).
 *
 * WHERE THE DECLARATIONS LIVE. This file is the agreement, not an importable
 * module. T3 writes the shipped declarations into the source tree, and T4
 * imports them from there:
 *
 *   - `INVOKE_CHANNELS.podFork`, `OrcastrateApi.pods.fork`
 *         -> `src/shared/contracts/ipc.ts`
 *   - `ForkEligibility`, `forkEligibility`
 *         -> `src/shared/fork-eligibility.ts` (new file; imported by main and
 *            by the renderer, as `src/shared/startup-reconciliation-notice.ts`
 *            already is)
 *
 * No consumer re-declares any of them.
 */

import type { IpcResult } from '../../../../src/shared/contracts/ipc';
import type { Pod, PodId } from '../../../../src/shared/contracts/events';
import type { PodAfterThisSession } from './store-fork';

// ---------------------------------------------------------------------------
// 1. The channel
// ---------------------------------------------------------------------------

/** `INVOKE_CHANNELS` in `src/shared/contracts/ipc.ts` gains exactly this entry. */
export declare const INVOKE_CHANNELS_ADDITION: { readonly podFork: 'pod:fork' };

// ---------------------------------------------------------------------------
// 2. The preload method
// ---------------------------------------------------------------------------

/**
 * `OrcastrateApi['pods']` in `src/shared/contracts/ipc.ts` gains exactly this
 * member. It takes a BARE `PodId`, like `open`, `close` and `reconnect`.
 *
 * Forks the Pod `podId` at its current state into a NEW Pod and resolves that
 * new Pod — a plain `Pod`, no wrapper (the `OrcastrateApi` docblock forbids
 * one). The new Pod is `'closed'`: forking starts no process, and opening the
 * fork is the ordinary `pods.open`, which resumes the fork's OWN
 * `ccSessionId`. The parent is not opened, closed, or otherwise changed.
 *
 * Resolves, never rejects (the `IpcResult` rule). No push is emitted: the
 * resolved value is the whole announcement, and the caller applies it.
 *
 * ERRORS, as `{ ok: false, error: { code, message } }`:
 *   INVALID_ARGUMENT  `podId` is not a non-empty string
 *   NOT_FOUND         no such Pod (including one deleted while the fork was
 *                     in flight)
 *   CONFLICT          the Pod is not eligible: `forkEligibility(pod)` is not
 *                     `'eligible'`. The message names which reason applies.
 *   IO                the SDK's `forkSession` rejected, or the store's write
 *                     failed with an IO fault. The message names the fork
 *                     operation and the parent PodId.
 * On every error, no pod, lane or event row was created.
 */
export interface PodsForkMember {
  fork(podId: PodId): Promise<IpcResult<PodAfterThisSession>>;
}

// ---------------------------------------------------------------------------
// 3. The eligibility rule — one implementation, two consumers
// ---------------------------------------------------------------------------

/**
 *   'eligible'    ccSessionId !== null AND status is 'closed', 'idle' or
 *                 'beached'
 *   'mid-turn'    status is anything else ('running', 'waiting', or a status
 *                 a future build adds). Takes precedence over 'no-session'.
 *   'no-session'  status would be eligible, but ccSessionId === null: there is
 *                 no Claude Code conversation to fork yet.
 *
 * Written in the POSITIVE form, so it fails closed: a status this build does
 * not recognise reads as 'mid-turn', never as 'eligible'.
 */
export type ForkEligibility = 'eligible' | 'mid-turn' | 'no-session';

/** Pure, synchronous, total. Main's CONFLICT and the renderer's disabled state both come from this. */
export declare function forkEligibility(
  pod: Pick<Pod, 'ccSessionId' | 'status'>,
): ForkEligibility;
