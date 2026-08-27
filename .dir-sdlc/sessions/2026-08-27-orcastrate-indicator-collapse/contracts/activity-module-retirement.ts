/**
 * CONTRACT — Retirement of `src/renderer/src/activity/`. Frozen at Gate 2.
 *
 * Boundary between T1 (Pod tab) and T2 (lane rail), which remove the two mount
 * sites concurrently, and T3, which deletes the directory afterwards. T3 may
 * only delete what T1 and T2 have already stopped importing, and it must not
 * drop the two obligations the directory currently discharges for OTHER
 * files. This file says which obligation lands on which task, because no
 * implementer can ask a peer.
 *
 * ORDERING GUARANTEE consumers may rely on: T3 runs strictly after T1 and T2
 * (`dependsOn: ["T1", "T2"]`). Until T3 runs, `activity/` still exists and
 * still compiles; T1 and T2 therefore see a green typecheck and a green suite
 * without waiting for anything.
 */

/**
 * 1. WHAT IS DELETED, exhaustively. Seven files, the whole directory.
 *
 * Verified by content search over `src/` before decomposition — the ONLY
 * importers of this directory are the four files listed in section 2, and
 * nothing else in the repository names `WorkingIndicator`,
 * `WORKING_INDICATOR_TEST_ID` or the literal `working-indicator`. The
 * remaining `activity` hits in `src/` are the unrelated word in
 * `transcript/tool-summary.ts` and `shared/contracts/pod-runner.ts`, plus
 * doc-comment references to `contracts/activity-indicator.ts`, which is a
 * PRIOR SESSION'S contract file and is not part of this deletion.
 */
export const DELETED_FILES = [
  'src/renderer/src/activity/WorkingIndicator.tsx',
  'src/renderer/src/activity/WorkingIndicator.module.css',
  'src/renderer/src/activity/WorkingIndicator.test.tsx',
  'src/renderer/src/activity/WorkingIndicator.source.test.ts',
  'src/renderer/src/activity/WorkingIndicator.styles.test.ts',
  'src/renderer/src/activity/index.ts',
  'src/renderer/src/activity/raw.d.ts',
] as const;

/**
 * 2. THE FOUR IMPORTERS, and who clears each.
 *
 * `LaneRow.source.test.ts` names the directory only in a doc-comment; T2 still
 * owns updating that comment, because a comment pointing at a deleted file is
 * a trap for the next reader.
 */
export const IMPORTERS = {
  'src/renderer/src/pods/PodTab.tsx': 'T1',
  'src/renderer/src/pods/PodTab.test.tsx': 'T1',
  'src/renderer/src/lanes/LaneRow.tsx': 'T2',
  'src/renderer/src/lanes/LaneRail.test.tsx': 'T2',
} as const;

/**
 * 3. RE-HOMED OBLIGATION A — the "nothing here schedules a frame" source
 * guard, currently `activity/WorkingIndicator.source.test.ts`.
 *
 * It moves onto the two mount sites' OWN source tests, because after the
 * collapse those are the files that must not acquire a clock. The rule it
 * enforces is unchanged and is the one both components' docblocks already
 * state: `elapsedMs` arrives pre-computed, the provider's single
 * `useElapsedClock(hasRunningLane)` stays the renderer's only clock, and a row
 * holding a finished lane must schedule nothing.
 *
 * WHY A TEXT GUARD AND NOT A BEHAVIOURAL ONE, restated so it is not "tidied"
 * away: a behavioural check only covers the code paths the fixture happened to
 * take, and cannot see a timer on a branch no test exercised. The text can.
 *
 * The four names both guards forbid: `setInterval`, `setTimeout`,
 * `requestAnimationFrame`, `Date.now`.
 *
 * `PodTab.tsx` contains none of the four today (verified by grep before
 * decomposition: no match). It DOES legitimately use `useEffect` and `useRef`
 * for the delete-control focus rescue, so T1's guard must NOT copy
 * `LaneRow.source.test.ts`'s `useState|useEffect|useRef` assertion — that
 * assertion is specific to the lane row and stays there.
 */
export const SOURCE_GUARD = {
  /** NEW FILE, created by T1. `pods/` has no source test today. */
  'src/renderer/src/pods/PodTab.source.test.ts': 'T1',
  /** EXISTING FILE, extended by T2. Its four-primitive block stays as is. */
  'src/renderer/src/lanes/LaneRow.source.test.ts': 'T2',
} as const;

/**
 * The additional assertion BOTH source guards must carry, which is what makes
 * them guards for THIS session rather than copies of an old one: the component
 * no longer imports the retired directory, and no longer names the retired
 * component or its test id.
 */
export const SOURCE_GUARD_FORBIDDEN_TEXT = [
  '../activity',
  'WorkingIndicator',
  'WORKING_INDICATOR_TEST_ID',
] as const;

/**
 * 4. RE-HOMED OBLIGATION B — the `prefers-reduced-motion` assertion,
 * currently `activity/WorkingIndicator.styles.test.ts`.
 *
 * Two files own keyframes after the collapse, so the assertion is owned twice,
 * once by each surface's existing styles test. Its content is pinned by
 * `status-dot-motion.ts` section 5.
 */
export const REDUCED_MOTION_GUARD = {
  'src/renderer/src/pods/PodBar.styles.test.ts': 'T1',
  'src/renderer/src/lanes/LaneRail.styles.test.ts': 'T2',
} as const;

/**
 * 5. RE-HOMED OBLIGATION C — the ambient `*.tsx?raw` module declaration,
 * currently `activity/raw.d.ts`.
 *
 * THIS IS THE COUPLING MOST EASILY MISSED. `lanes/LaneRow.source.test.ts`
 * imports `./LaneRow.tsx?raw` today and T1's new `PodTab.source.test.ts` will
 * import `./PodTab.tsx?raw`. Neither compiles without this declaration, and
 * `tsconfig.web.json` sets `"types": []` so `vite/client` supplies nothing. If
 * T3 deletes `activity/raw.d.ts` without replacing it, `typecheck:web` breaks
 * in two files T3 does not own.
 *
 * T3 OWNS BOTH SIDES OF THE MOVE — the delete and the replacement — precisely
 * so the declaration never exists twice at once. Two ambient `declare module
 * '*.tsx?raw'` blocks in one program is a duplicate declaration, and T1 and T2
 * must be able to typecheck while `activity/raw.d.ts` is still present.
 * Neither T1 nor T2 may create a second one.
 *
 * New home: alongside the other ambient stylesheet/text declarations, which is
 * where the next reader will look. It is NOT added to `styles/css.d.ts`: that
 * file is about CSS, is referenced by name in three docblocks, and a `.tsx`
 * declaration inside it would be the kind of thing a later reader deletes as
 * misfiled.
 */
export const RAW_TSX_DECLARATION_HOME = 'src/renderer/src/styles/raw.d.ts';

/**
 * 6. THE DRIFT GUARD — new, and the reason T3 is a task rather than an `rm`.
 *
 * `status-dot-motion.ts` mandates per-module keyframes because a cross-file
 * reference provably does not resolve. The cost of that shape is exactly one
 * duplication, and duplication with no guard drifts. T3 owns a single styles
 * test that reads BOTH modules as text and asserts they still agree.
 *
 * It lives in neither surface's directory, because it belongs to neither
 * surface and because T1 and T2 own their own directories exclusively.
 */
export const DRIFT_GUARD = 'src/renderer/src/styles/status-motion.styles.test.ts';

/**
 * 7. ERROR CASES.
 *
 * - A dangling importer of `activity/` after T3: `typecheck:web` fails with an
 *   unresolved module. T3 must run the typecheck and read exit 0, not assume
 *   it. Command, verbatim, no `NODE_PATH` and no scratch config:
 *     node "C:/Users/dmarq/Development/Repos/orcastrate/node_modules/typescript/bin/tsc" --noEmit -p tsconfig.web.json --composite false
 * - A missing `*.tsx?raw` declaration: the SAME typecheck fails, in
 *   `LaneRow.source.test.ts` and `PodTab.source.test.ts`. It does NOT fail the
 *   Vitest run, because Vite resolves the import at runtime regardless — so a
 *   green suite is not evidence here and the typecheck is not optional.
 * - Drift between the two keyframe blocks: T3's drift guard fails. It cannot
 *   fail vacuously — it asserts a non-empty read of both files first, the
 *   vacuity guard `PodBar.styles.test.ts` and `LaneRail.styles.test.ts`
 *   already use.
 *
 * Any implementer that finds one of these obligations landing outside its own
 * `owns` set STOPS AND ESCALATES rather than reaching across.
 */
export type RetirementObligationOwner = 'T1' | 'T2' | 'T3';
