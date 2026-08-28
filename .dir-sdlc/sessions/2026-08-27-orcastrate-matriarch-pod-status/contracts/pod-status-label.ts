/**
 * CONTRACT — `POD_STATUS_LABEL`, extracted so two surfaces can share one word.
 * Session 2026-08-27-orcastrate-matriarch-pod-status. Frozen at Gate 2.
 *
 * Boundary between:
 *   - T2  PRODUCER. Creates the module and re-points `PodTab.tsx` at it.
 *   - T4  CONSUMER. `lanes/LaneRow.tsx` imports it for the Matriarch row.
 *   - T5  reads the labels through it rather than re-typing them.
 *
 * ------------------------------------------------------------------------
 * 1. WHY THIS EXISTS
 * ------------------------------------------------------------------------
 * The accessibility floor: colour is never the only carrier, so every status
 * dot is accompanied by its word in visible or screen-reader text. The
 * Matriarch row is about to draw a `PodStatus` dot, so it needs the `PodStatus`
 * word — and NO NEW STATUS VOCABULARY MAY BE INVENTED. The word must come from
 * the map the Pod tab already uses.
 *
 * Today that map is `const STATUS_LABEL` at `pods/PodTab.tsx:24` — module
 * private, so no second surface can reach it. A second copy in `lanes/` would
 * be exactly the drift `styles/status-motion.styles.test.ts` exists to catch in
 * CSS, with no guard on the text side.
 *
 * ------------------------------------------------------------------------
 * 2. THE MODULE
 * ------------------------------------------------------------------------
 * NEW FILE `src/renderer/src/pods/pod-status.ts`, modelled on its existing
 * sibling `src/renderer/src/lanes/lane-status.ts` — same file name pattern,
 * same single export, same `Readonly<Record<…, string>>` type, same
 * doc-comment shape. That sibling is the repository's own precedent for
 * "one status union, one label map, one module", and this file is its twin.
 *
 *     import type { PodStatus } from '@shared/contracts/events';
 *
 *     export const POD_STATUS_LABEL: Readonly<Record<PodStatus, string>> = {
 *       idle: 'Idle',
 *       running: 'Running',
 *       waiting: 'Waiting on you',
 *       beached: 'Beached, process stopped',
 *       closed: 'Closed',
 *     };
 *
 * THE FIVE STRINGS ARE MOVED BYTE FOR BYTE. Not one is reworded, and no sixth
 * key is added. `PodStatus` has five members and `Readonly<Record<PodStatus,
 * string>>` is the guard: a member added without an entry stops the file
 * compiling. The rationale comments currently sitting on `closed` inside
 * `PodTab.tsx` move with the entry they explain — a rationale left behind at
 * the old site is what a later reader mistakes for the current decision.
 *
 * `PodTab.tsx` deletes its local `const STATUS_LABEL` and imports
 * `POD_STATUS_LABEL` instead. Its one call site — the `srOnly` sentence at
 * `PodTab.tsx:252` — is re-pointed and NOTHING ELSE in that file changes: not
 * the markup, not the dot, not `statusToken`, not the focus rescue.
 *
 * ------------------------------------------------------------------------
 * 3. WHAT MUST NOT MOVE WITH IT
 * ------------------------------------------------------------------------
 * `PodTab.test.tsx:310` keeps its own RE-TYPED copy of the labels, and the
 * comment there stating why. Repointing that suite at the new module would make
 * it derive its expectation from the thing under test, so it would pass while
 * the labels drifted. Do not "tidy" it. `PodTab.source.test.ts` names none of
 * these symbols and needs no edit.
 *
 * ------------------------------------------------------------------------
 * 4. INDEPENDENCE
 * ------------------------------------------------------------------------
 * This task depends on nothing. It touches no contract, no view model and no
 * derivation, and it changes no rendered output anywhere — a pure extraction,
 * schedulable in parallel with T1. T4 depends on it only for the import.
 */

export {};
