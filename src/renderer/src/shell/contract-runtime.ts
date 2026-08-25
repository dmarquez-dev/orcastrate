/**
 * Runtime implementations of the three helpers the frozen contracts DECLARE
 * but never define.
 *
 * `renderer-view.ts` ends with `export declare function testId(...)` and
 * `renderer-theme.ts` with `export declare function cssVar(...)` /
 * `export declare function statusToken(...)`. Both files are frozen, both are
 * owned by T3, and neither ships a body — so importing those names at runtime
 * yields `undefined`. The contracts still fix the SEMANTICS exactly (the
 * doc-comment on each declaration gives the mapping and the output format), so
 * this module implements them verbatim against those comments rather than
 * inventing anything.
 *
 * This lives in T4's directory because T4 needs it first. It is a candidate to
 * move into `contracts/` in a follow-up, which is a T3 change and therefore a
 * contract change — see the escalation in T4's report.
 */

import { TOKENS } from '../contracts/renderer-theme';

/** `cssVar(TOKENS.bgPanel)` -> `"var(--oc-bg-panel)"`. */
export function cssVar(token: string): string {
  return `var(${token})`;
}

/** The union `statusToken` accepts: both status unions from `events.ts`. */
export type AnyStatus =
  | 'idle'
  | 'running'
  | 'waiting'
  | 'beached'
  | 'closed'
  | 'done'
  | 'orphaned'
  | 'stopped';

/**
 * `Readonly<Record<AnyStatus, string>>` is the real guard in the widening: add
 * a member to `AnyStatus` without an entry here and this file stops compiling.
 * The declaration in `renderer-theme.ts` is a hand-written duplicate of the
 * same union and must be kept in step with it — the two are a declare/implement
 * pair and never land apart.
 */
const STATUS_TOKENS: Readonly<Record<AnyStatus, string>> = {
  idle: TOKENS.statusIdle,
  running: TOKENS.statusRunning,
  waiting: TOKENS.statusWaiting,
  done: TOKENS.statusDone,
  beached: TOKENS.statusBeached,
  closed: TOKENS.statusClosed,
  orphaned: TOKENS.statusOrphaned,
  stopped: TOKENS.statusStopped,
};

/**
 * The status token for a Pod or Lane status. Defined once so the Pod tab dot
 * and the lane rail row cannot drift into different colors for one state.
 */
export function statusToken(status: AnyStatus): string {
  return STATUS_TOKENS[status];
}

/** `testId(TEST_IDS.podTab, podId)` -> `"pod-tab:<podId>"`. */
export function testId(base: string, suffix?: string): string {
  return suffix === undefined ? base : `${base}:${suffix}`;
}
