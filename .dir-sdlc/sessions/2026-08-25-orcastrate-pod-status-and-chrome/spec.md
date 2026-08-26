# Pod status and chrome

Clear the seven second-hand-run findings: a stopped Pod must read as stopped, work in
flight must be visible, and the Pod tab and lane rail must look deliberate.

## Context

The 2026-08-21 hand-run of `2026-08-21-orcastrate-transcript-readability` produced
seven findings, recorded in `.dir-sdlc/backlog.md` under *second hand-run findings*
with two mechanisms already traced. This session clears that block. Nothing here is
re-derived; the backlog entry is the authority.

Two of the seven are defects.

**A stopped Pod still reads "Running" with a ticking duration.** `PodManager.closePod`
writes `status: 'closed'` to the Pod and pushes `podStatus`, but never ends the
Matriarch lane. `lane.endedAt` stays null, and `elapsedMsOf` falls back to `nowMs` for
any lane with a null `endedAt`, so the duration counts up forever on a Pod with no
process. The user named the deeper half: there is no status to replace `running` with.
`'done'` means the lane finished its own work; `'orphaned'` means it was found open
with no runner. Neither is true of a lane whose Pod someone stopped on purpose. So
this is a schema change, not a renderer fix.

**Nothing shows that Claude Code is working.** This is partly self-inflicted:
`thinking` is in `PLUMBING_EVENT_TYPES` and has been hidden by default since the
transcript filter landed, and it was the one plumbing type carrying liveness. The
filter was right for the noise problem it solved, so the fix is a status affordance,
not a transcript row.

The remaining five are cosmetic, on two surfaces: Pod tab chrome and highlight extents.

## Definition of done

**The stopped Pod**

1. `LaneStatus` has a fourth member, `'stopped'`, meaning the Pod that owns the lane
   was stopped deliberately — distinct from both `'done'` and `'orphaned'`.
2. Migration 1's lane-status list is pinned to a frozen constant carrying **no**
   `satisfies` clause, so widening the live union cannot rewrite already-shipped DDL.
3. A migration 4 rebuilds `lanes` with the widened CHECK, carrying forward migration
   1's `CHECK ((status = 'running') = (ended_at IS NULL))` verbatim and restoring all
   four indexes, two of which are UNIQUE and partial.
4. A schema-head guard in the `_AssertNever<T extends never>` spelling fails the build
   if `LaneStatus` gains a member migration 4's list lacks.
5. `closePod` ends the Pod's running lanes with status `'stopped'`, and is the only
   writer of that value in the product.
6. `closePod` against an already-closed Pod does not restamp `ended_at` and emits no
   second `lane_closed` — the coverage gap promoted at `2026-08-20-orcastrate-pod-lifecycle`.
7. A stopped Pod's Matriarch row reads `Stopped` with a duration that does not tick.

**Work in flight**

8. A `WorkingIndicator` renders work in progress without a timer or a clock, is
   `aria-hidden`, and has a reduced-motion fallback.
9. It is mounted on the Pod tab and on the lane rail.
10. `thinking` stays in `PLUMBING_EVENT_TYPES`; `transcript-filter.ts` is unchanged,
    byte for byte.

**Pod tab chrome**

11. The run control is green and the stop control yellow, from new `--oc-action-*`
    tokens.
12. Colour stays a redundant carrier: `PodTab.test.tsx`'s accessible-name assertions
    keep passing, unmodified.
13. The play/pause glyph and the delete `×` render at the same size.
14. The delete `×` is padded from the tab edge and from the play/pause control, and a
    running Pod has trailing padding right of the stop icon.
15. A Pod tab highlights across the whole tab on hover, not only its name.

**Highlight extents**

16. Selecting a lane highlights the whole swimlane — lighter for Calves, darker for
    the Matriarch.
17. `Steer` stays darker than the highlight, which extends around it rather than
    stopping at it.

## Scope

Seven tasks in three waves. `LaneStatus` is a shared contract that the database,
main-process and rail work all sit downstream of; the two cosmetic surfaces are
independent of it and of each other.

- **Wave 1** — T1 (union, pinning, migration 4, guard), T3 (theme tokens), T4 (`WorkingIndicator`)
- **Wave 2** — T2 (`closePod`), T5 (Pod tab chrome), T6 (lane rail)
- **Wave 3** — T7 (end-to-end proof and repository-wide fallout)

### Not in scope

- **Pinning `LANE_KINDS` and `EVENT_TYPES`.** Both are still interpolated live into
  migration 1 and carry the identical latent bug. Excluded deliberately: pinning them
  in this diff would rewrite migration 1's rendered text for a second reason and make
  any byte-identity failure unattributable to a cause. Already in the backlog.
- **Repairing the inert `_UncoveredLaneStatus` entry** in `schema.ts`'s `_exhaustive`
  block. That block's own CAUTION says it must not be cited as protection, and the new
  `_AssertNever` guard is the real tripwire.
- **Moving `thinking` out of `PLUMBING_EVENT_TYPES`.** Explicitly ruled out by the
  backlog: it would reintroduce the noise the filter exists to remove.
- **A `statusToken('stopped')` production caller.** The rail stylesheet consumes
  `--oc-status-*` variables directly, exactly as `orphaned` does today.

## Assumptions

| Question | Answer | Rung | Evidence |
|---|---|---|---|
| What should the new `LaneStatus` member be called? | `'stopped'` | repo + judgment | `__tests__/hygiene.test.ts` parses both halves of the `statusToken` pair with `/'([a-z]+)'/g` — lowercase ASCII only, so `'pod-stopped'` and `'podStopped'` would silently drop out of the guard. The specific word is judgment: it reads correctly beside `Done` and `Orphaned` and matches the tab's existing `Stop` verb. |
| Does widening `LaneStatus` really need a new migration? | Yes | repo | `schema.ts:47` `LANE_STATUSES` is interpolated live into migration 1's `lanes` CHECK at `schema.ts:268`. This is the exact anti-pattern `MIGRATION_1_POD_STATUSES` was pinned to fix; its FROZEN docblock spells out the two-structurally-different-v1-schemas failure. |
| Which schema-head guard spelling? | `_AssertNever<T extends never>` | repo | `schema.ts:219-232` documents at length that the `_UncoveredAtSchemaHead` empty-array-literal spelling is vacuous — an empty array literal is assignable to any array type — and does not fail the build. |
| Is migration 4 the same shape as migrations 2 and 3? | No, materially harder | repo | Both of their docblocks say the rebuild's index steps "reduce to nothing" because `pods` carries no index. `lanes` carries four, two UNIQUE and partial; `idx_lanes_tool_use` is correctness-bearing per migration 1's own comment. `lanes` also self-references `parent_lane_id REFERENCES lanes(id)` and is referenced by `events.lane_id ON DELETE CASCADE`. |
| Does the store need a change to stamp `ended_at` for `'stopped'`? | No | repo | Migration 1's CHECK `((status = 'running') = (ended_at IS NULL))` forces any non-running status terminal at the database, and `setLaneStatus` already stamps `endedAt ?? now()` for any non-running status. |
| Do new theme tokens count as a contract change? | Yes | repo | `renderer-theme.ts` carries one `--oc-status-*` token per status and has no green or yellow action colour, so both the status token and the run/stop pair are additions to a shared seam three tasks read. |
| Should the working indicator be active for `'waiting'` too? | No — `'running'` only | repo | `events.ts` defines `'waiting'` as blocked on the user, and `PodBar.module.css` already gives it the busiest dot shape plus the permission badge. |
| Will T1 leave the build green? | No — `typecheck:web` stays red until T6 | repo | The union's exhaustiveness tripwire at `lanes/lane-status.ts` fires the moment the member is added. T1's criteria are scoped to `typecheck:node`; T6 requires full `npm run typecheck`. Flagged so a reviewer does not read T1's red web build as failure. |

## Contracts

Frozen at Gate 2, in `contracts/`:

- **`lane-stopped-status.ts`** — the widened union, `LaneClosedPayload.status`, the
  five-step schema obligation, and `closePod`'s sweep, push ordering and idempotence.
- **`renderer-theme-amendment.ts`** — `--oc-status-stopped` plus the new
  `--oc-action-run/-bg` and `--oc-action-stop/-bg` family, with pinned values, both
  halves of the `statusToken` declare/implement pair, and the two guards that widen
  with it.
- **`activity-indicator.ts`** — `WorkingIndicator({ active, size })`: CSS-only,
  `aria-hidden`, no timer or clock, reduced-motion fallback, and its two mount sites.

## Open questions

None. Both items the architect surfaced were resolved into `### Not in scope` above
rather than left open.
