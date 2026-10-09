/**
 * The startup-reconciliation marker and its reason sentence — ONE definition,
 * read by both tsconfig programs.
 *
 * WHY THIS FILE EXISTS. The marker had two declarations: the producer's, at
 * `src/main/pod-manager/startup-reconciliation.ts`, and a copy in the
 * renderer's transcript filter. The duplication was deliberate and documented
 * — `tsconfig.web.json` includes only `src/renderer/src/**` and
 * `src/shared/**`, so importing the producer would have pulled main-process
 * code into the renderer program to buy one string. What was NOT sound was the
 * test coverage over it: the filter's copy was pinned against a hard-coded
 * literal and against a fixture whose payload was also hard-coded, so NOTHING
 * IN THE CHAIN READ THE PRODUCER. Verified this session by renaming the
 * producer's marker to `startup_reconciliation_v2` on the pre-change tree: all
 * 199 renderer transcript tests stayed green while the reconciliation notice
 * went back to being hidden by the default filter — the exact regression
 * escalation E5 was raised to prevent.
 *
 * `src/shared/**` is included by BOTH `tsconfig.node.json` and
 * `tsconfig.web.json`, which makes it the only place a value can sit and be
 * read by main and renderer alike. The duplication is therefore deleted rather
 * than re-justified, and both sites now re-export this binding.
 *
 * WHY IT IS NOT UNDER `contracts/`. It is a RUNTIME VALUE, not a contract.
 * Everything under `src/shared/contracts/` is a frozen interface copied
 * verbatim out of an earlier session's artifacts and never edited afterwards;
 * adding a live const there would make a frozen file mutable. This module is
 * consequently THE FIRST NON-CONTRACT MEMBER of `src/shared/`, a convention
 * change the user ratified at Gate 2 of session
 * `2026-10-09-orcastrate-guard-hardening`.
 *
 * WHAT MAY BE IMPORTED HERE: nothing, or `import type` from
 * `src/shared/contracts/**` only. A reach into `src/main/**` or
 * `src/renderer/**` would break whichever program does not include that tree,
 * which is the whole reason the copy existed in the first place.
 */

/**
 * `SystemPayload.subtype` — and `StartupReconciliationData.subtypeMarker` — for
 * the reconciliation notice. A free string by contract (`contracts/events.ts`),
 * so `EventType` and `EVENT_TYPES` are untouched and anything that renders a
 * `system` event today renders this one.
 *
 * The producer stamps it on BOTH carriers; the renderer's filter accepts
 * either, because over-showing the notice is the safe way to be wrong.
 */
export const STARTUP_RECONCILIATION_SUBTYPE = 'startup_reconciliation' as const;

/**
 * EXACT TEXT, rendered verbatim, and pinned by a test.
 *
 * It is a fixed sentence rather than a free string so that two Pods reconciled
 * by the same sweep read identically and so the wording cannot drift. It
 * already names `Open`, which is also the affordance `status: 'closed'`
 * selects. Do not reword it.
 */
export const STARTUP_RECONCILIATION_REASON =
  'Orcastrate restarted while this Pod was still open. No Claude Code process ' +
  'survives an application restart, so lanes left running were marked ' +
  'Orphaned. Press Open to start this Pod again.';
