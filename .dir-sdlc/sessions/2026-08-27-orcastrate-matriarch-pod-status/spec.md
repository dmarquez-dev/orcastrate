# Matriarch row reports Pod status

The Matriarch lane row reports the owning Pod's status rather than its own lifetime flag, so the lane rail and the Pod tab agree about whether Claude Code is actually working.

## Context

The fourth hand-run found the Pod tab correct on every state and one defect on the rail: **the Matriarch's blue dot pulses continuously and never rests while Claude Code sits idle between turns.**

The cause is that two unions use the word `running` for different things.

- **`PodStatus.running` is an activity flag.** `pod/pod-runner.ts:426` sets it on `send()` — turn start — and `:272` clears it to `idle`, or `waiting` when permissions are pending, at turn end.
- **`LaneStatus.running` is a lifetime flag, and the database enforces it.** `store/schema.ts:355`: `CHECK ((status = 'running') = (ended_at IS NULL))`. A lane is `running` iff it has not ended, so it structurally cannot mean "working right now".

The Matriarch lane is created `running` at session start (`lane/lane-router.ts:142`) and ends only when the Pod stops, so it reads `running` for the Pod's whole life.

**This is not a regression from the indicator collapse.** `git show 595247d^:src/renderer/src/lanes/LaneRow.tsx` line 129 is `<WorkingIndicator active={row.status === 'running'} size="bar" />` — the retired bar carried the identical condition and pulsed continuously too. Collapsing the indicator into the status dot made a pre-existing defect visible by moving the motion onto the element the user reads for status.

**Calf rows are already correct.** A Calf is created when dispatched and ends when its subagent finishes; subagents never wait on user input, so a `running` Calf genuinely is working.

The fix needs no new plumbing: `state/workspace-provider.tsx:189` `deriveSession` already holds `pod?.status` and passes it to `deriveComposer` at `:207`. It simply does not pass it to `deriveLaneRail` at `:198`.

## Definition of done

1. `LaneRowVm` carries the Pod's status for the Matriarch row, in a shape that does not put two vocabularies into one attribute.
2. `deriveLaneRail` receives the Pod status and populates the new field for the Matriarch row, recomputed on every snapshot rather than stored stale.
3. While its lane is **open**, the Matriarch row renders `PodStatus`: the word from an existing label map, the hue via `statusToken`, and the Pod tab's dot shapes.
4. The Matriarch dot pulses when the Pod is streaming, and at no other time.
5. An open, idle Pod's Matriarch row shows the grey `--oc-border-thick` hollow ring.
6. An open Pod awaiting permission shows the amber halo; `beached` and `closed` keep their square and flat-bar shapes.
7. Once the Matriarch's lane has **ended**, terminal `LaneStatus` wins: `Stopped` / `Done` / `Orphaned` render with today's hue and today's frozen duration, unchanged.
8. **Calf rows are byte-unchanged in behaviour**, asserted explicitly by the task that owns `LaneRow.tsx`.
9. No new status vocabulary is invented; every word comes from `POD_STATUS_LABEL` or `LANE_STATUS_LABEL`.
10. Colour is never the only carrier: every dot assertion asserts its word in the same render.
11. Reduced motion stops the pulse and never the dot.
12. The emitted animation name still resolves, proved at build level by reading `out/renderer/assets/`.
13. The rail and the Pod tab agree, proved jointly in one end-to-end test rendering both surfaces.

## Scope

`contracts/renderer-state.ts` (the amendment), `pods/` (extracting the label map), `state/workspace-provider.tsx` (the derivation), `lanes/**` (the row, its stylesheet, its suites), and one new joined e2e suite.

### Not in scope

- **The `--oc-status-stopped` (`#c0b39d`) vs `--oc-status-waiting` (`#e6a33c`) hue measurement.** Still with the deferred palette-wide pass.
- **The two advisory items** in `.dir-sdlc/backlog.md` under 2026-08-27 — the stale docblock at `PodTab.source.test.ts:25-26` and the commit-prefix inconsistency.
- **Any change to `LaneStatus`, to the schema `CHECK`, or to how the main process computes either status.** This is a renderer-side presentation change.
- **Calf row rendering.**

## Assumptions

| Question | Answer | Rung | Evidence |
|---|---|---|---|
| Why does the Matriarch dot never rest? | `LaneStatus.running` is a lifetime flag, not an activity flag, and the Matriarch lane is open for the Pod's whole life. | Repo evidence | `schema.ts:355` `CHECK`; `lane-router.ts:142`; `pod-runner.ts:426,272`. |
| Is this a regression from the indicator collapse? | No. The retired bar carried the identical condition. | Repo evidence | `git show 595247d^:…/LaneRow.tsx` line 129. |
| Is the Pod status reachable from the lane derivation? | Yes, with no new plumbing. | Repo evidence | `workspace-provider.tsx:189,198,207`. |
| Can `LaneRowVm.status` simply be widened to both unions? | No. Both unions contain `'running'` and disagree about its meaning, so `.status[data-status='running'] .dot` would match a streaming Pod and a merely-unended lane alike — the defect re-encoded in CSS. | Repo evidence | `LaneRail.module.css:256`; positional reads at `LaneRail.test.tsx:479`, `stopped-lane.test.tsx:129`, `orphaned-lane.test.tsx:110`. |
| Do Calf rows need changing? | No. A Calf ends when its subagent finishes and subagents never wait on a user, so a `running` Calf genuinely is working. | Repo evidence | `lane-router.ts:588`. |
| What breaks on the interface change? | Three things, read out of the worktree rather than predicted: `LaneRail.styles.test.ts:274` pins the animating-selector list with `toEqual([PULSE_SELECTOR])`; `LaneRail.styles.test.ts:65-71` runs `tokensIn` over the whole sheet and `--pod-status-color` is not in `TOKENS`; `lanes/test-fixtures.ts` `makeRow` stops compiling on a new required member. | Repo evidence | Confirmed independently by the orchestrator at all three sites. |
| Does the drift guard still pass? | Predicted yes — the keyframe body and both reduced-motion blocks are unchanged, and `blockBody`'s pattern tolerates a second nested rule. Stated as a prediction so T4 can falsify it. | Repo evidence | `styles/status-motion.styles.test.ts`. |
| Is there an `architecture` discipline to compose? | No — dir-ect bundles only `backend`, `database`, `frontend`, `test`. T1 was reassigned to `frontend` so the task defining the shared interface is not the only one dispatched without conventions. | Repo evidence | Bundled `disciplines/` listing. |
| Can agents run tests, typecheck and build from this worktree? | Yes, with plain commands — no `NODE_PATH`, no scratch config. | Measured last session | In-repo worktree under gitignored `.claude-worktrees/`. |

## Contracts

- `contracts/lane-row-pod-status.ts` — the `LaneRowVm` amendment, the derivation rule clause by clause, the two-mutually-exclusive-attributes rendering rule with the dot-shape table, the keyframe measurement and drift-guard prediction, the three existing assertions this breaks, and out-of-scope.
- `contracts/pod-status-label.ts` — extracting `POD_STATUS_LABEL` into `pods/pod-status.ts`, modelled on the existing sibling `lanes/lane-status.ts`.

## Open questions

One, and it is the frozen-contract escalation presented at Gate 2: what shape `LaneRowVm` should take to carry the Pod's status. Resolved by the user there.
