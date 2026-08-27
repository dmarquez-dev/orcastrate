# Indicator collapse — one dot per surface

Collapse the working-indicator affordance into the status dot on the Pod tab and the lane rail, so each surface draws a single dot whose motion is derived from the status it already carries.

## Context

Two surfaces each draw TWO adjacent marks where the user wants one.

The Pod tab renders `styles.statusDot` — hue from `statusToken(status)` at render time — immediately beside a `<WorkingIndicator size="dot">` that is active for `'running'` alone. What reads as "a solid blue dot plus a flashing blue dot" is those two elements. The lane rail row renders a `.dot` plus its status word, then a `<WorkingIndicator size="bar">` on the same `.meta` line.

The third hand-run (2026-08-26) reported the stop flow's behaviour clean and every finding visual; this is the first of them. The user's refinement over the original backlog framing: rather than deciding which of two elements survives, the status dot itself becomes the working indicator. `WorkingIndicator` therefore leaves both mount sites and `src/renderer/src/activity/` is retired.

This removes nothing from the accessibility floor. The dot was never the sole carrier of meaning on either surface: the tab's `srOnly` sentence opens with `STATUS_LABEL[status]` and the lane renders `LANE_STATUS_LABEL[row.status]` as visible text. The retired indicator was `aria-hidden` and contributed no accessible text at all, so its removal subtracts no signal a screen reader ever received.

## Definition of done

1. `PodTab.tsx` no longer mounts `WorkingIndicator`, and `styles.statusDot` keeps its `statusToken(status)` hue.
2. The Pod tab's status dot animates under `running` and under no other status.
3. The Pod tab's `idle` state renders a hollow ring at `--oc-status-idle`, its border widened to `--oc-border-thick`.
4. The Pod tab's `waiting` halo, `beached` square and `closed` flat-bar rules are unchanged.
5. The Pod tab's `srOnly` sentence still opens with `STATUS_LABEL[status]`.
6. `LaneRow.tsx` no longer mounts `WorkingIndicator`.
7. The lane row's `.dot` animates under `running` and under no other lane status.
8. `LANE_STATUS_LABEL` is unchanged and no `Active`/`Waiting` vocabulary is introduced anywhere.
9. Every one of the seven files under `src/renderer/src/activity/` is deleted.
10. The `*.tsx?raw` ambient declaration survives the deletion, re-homed to `src/renderer/src/styles/raw.d.ts`, and `tsc --noEmit -p tsconfig.web.json` exits 0.
11. The "nothing in this component schedules a frame" source guard is re-homed onto both mount sites' source tests.
12. The `prefers-reduced-motion: reduce` guarantee is asserted for both surfaces' keyframes.
13. Every assertion site naming `WORKING_INDICATOR_TEST_ID` is REPLACED by a dot assertion, not deleted.
14. A drift guard asserts the two per-module keyframe definitions and their reduced-motion guards stay in agreement, and that guard is SEEN FAILING against an injected drift.
15. `electron-vite build` emits, for each module scope, an `@keyframes _ocStatusPulse_<hash>` AND an `animation:` declaration naming that same hashed string — the literal matched strings reported, not paraphrased.

## Scope

`src/renderer/src/pods/` (tab, stylesheet, suites), `src/renderer/src/lanes/` (row, stylesheet, suites), `src/renderer/src/activity/` (deleted), and one new ambient declaration under `src/renderer/src/styles/`.

### Not in scope

- **The `--oc-status-stopped` (`#c0b39d`) vs `--oc-status-waiting` (`#e6a33c`) hue measurement.** Deferred by the user to the separately-deferred palette-wide pass. It matters slightly more after this change than before it: on a lane row a `Stopped` dot and an amber `Awaiting permission` dot can occupy the same `.meta` line, and both surfaces are now dot-only.
- **Whether the Pod tab should read grey where the lane reads stopped.** `PodStatus` and `LaneStatus` are different unions and are supposed to differ; not opened.
- **Any green resting hue.** The user rejected recolouring the resting state green — it collides with `--oc-status-done` (`#4bb87a`) — and rejected adding a new `ready` token. Resting keeps `--oc-status-idle` slate.
- **A motion duration token.** `tokens.css` has no `--oc-motion-*` or duration entry, so `1.4s` carries forward as a literal from the retired stylesheet. Inventing one would amend frozen `renderer-theme.ts`.

## Assumptions

| Question | Answer | Rung | Evidence |
|---|---|---|---|
| Can a CSS module reference a `@keyframes` defined in `global.css`? | **No.** Vite hashes the animation name inside a module even with no local keyframe of that name, so the reference resolves to nothing and the animation silently never runs. | Measured in this session | Probe build: `global.css` emitted `@keyframes ocProbePulse`, the module emitted `animation: _ocProbePulse_ijqny_1`. Reverted; worktree clean. |
| Where does the shared motion live, then? | Per-module `@keyframes`, keyed on the `data-status` attribute both surfaces already carry. Drift is paid for by a guard test rather than by a shared file. | Repo evidence | `activity/WorkingIndicator.module.css` ships the same-file pattern and its animation runs. |
| Would a shared CSS class be observable to the suites? | No. `*.module.css` resolves to a blanked module under Vitest, so class names do not survive; existing dot assertions reach the element by `querySelector('[data-status]')`. | Repo evidence | `PodBar.styles.test.ts` docblock; `PodTab.test.tsx:353`, `LaneRail.test.tsx:479`. |
| Is a motion utility in `global.css` in scope for that file? | No — it would be a fourth kind of thing in a file whose contract enumerates three, i.e. a `renderer-theme.ts` amendment. | Repo evidence | `global.css` header; `renderer-theme.ts` rules 1–2. |
| Does deleting `activity/` break anything outside it? | Yes, and the brief missed it. `activity/raw.d.ts` declares `*.tsx?raw`, which `lanes/LaneRow.source.test.ts:23` depends on. It must be re-homed in the same task that deletes it. | Repo evidence | `activity/raw.d.ts:16`; `LaneRow.source.test.ts:23`. Fails under `tsc` only, not under Vitest. |
| Do `--oc-status-idle` and `--oc-border-thick` exist? | Yes — `#7c8598` and `2px`. | Repo evidence | `tokens.css:46`, `tokens.css:128`. |
| Does `PodTab.tsx` schedule frames today? | No — zero occurrences of the scheduling primitives. Its `useEffect`/`useRef` are the delete-control focus rescue, so its new source guard must NOT copy `LaneRow.source.test.ts`'s hook ban. | Repo evidence | Content search over `PodTab.tsx`. |
| Are the two mount sites the only importers of `activity/`? | Yes — `PodTab.tsx`, `PodTab.test.tsx`, `LaneRow.tsx`, `LaneRail.test.tsx`, plus doc-comment-only mentions. | Repo evidence | Content search, run independently by the architect and the orchestrator. |
| Do the new test files get picked up without config? | Yes. | Repo evidence | `vitest.config.ts` includes `src/**/*.test.{ts,tsx}`; `tsconfig.web.json` includes `src/renderer/src/**/*`. |
| Can agents run tests and typecheck from this worktree? | Yes, with the plain commands — no `NODE_PATH`, no scratch config. | Measured in this session | Worktree is a descendant of the main repo, under the gitignored `.claude-worktrees/`. jsdom suite 8/8; `tsc --noEmit -p tsconfig.web.json` exit 0. |

## Contracts

- `contracts/status-dot-motion.ts` — the keyframe name, body and tail; the per-surface pulse selectors; the reduced-motion guarantee; and the prohibitions, including no cross-file keyframes and no animation on a base rule.
- `contracts/activity-module-retirement.ts` — the deleted file list, the importers that must stop importing, the re-homed source guard and reduced-motion guard, the new home of the `*.tsx?raw` declaration, and the drift guard.

## Open questions

None. The one decision that is arguably the user's rather than the architect's — whether a motion utility may live in `global.css` — is presented at Gate 2 as a ranked choice, with the draft's answer first.
