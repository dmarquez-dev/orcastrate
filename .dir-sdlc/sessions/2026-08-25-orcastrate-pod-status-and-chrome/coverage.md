# Coverage — 2026-08-25-orcastrate-pod-status-and-chrome

Gate 2 columns written before the approval that freezes `manifest.json`.
End state written at Gate 3.

## Definition of done

| Item | Covering task | Gate 2 | End state |
|---|---|---|---|
| 1. `LaneStatus` gains `'stopped'`, distinct from `'done'` and `'orphaned'` | T1 | covered | met |
| 2. Migration 1's lane-status list pinned, bare, no `satisfies` | T1 | covered | met |
| 3. Migration 4 rebuilds `lanes`, CHECK verbatim, all four indexes restored | T1 | covered | met |
| 4. Schema-head guard in the `_AssertNever` spelling | T1 | covered | met |
| 5. `closePod` ends running lanes as `'stopped'`, sole writer | T2 | covered | met |
| 6. `closePod` idempotent against an already-closed Pod | T2 | covered | met |
| 7. Stopped Pod's Matriarch row reads `Stopped`, duration frozen | T6 | covered | met |
| 8. `WorkingIndicator` — no timer, `aria-hidden`, reduced-motion fallback | T4 | covered | met |
| 9. Indicator mounted on Pod tab and lane rail | T5, T6 | covered | met |
| 10. `thinking` stays plumbing; `transcript-filter.ts` byte-identical | T7 | covered | met |
| 11. Run control green, stop control yellow, from `--oc-action-*` | T3, T5 | covered | met |
| 12. Accessible-name assertions in `PodTab.test.tsx` keep passing unmodified | T3, T5 | covered | met |
| 13. Play/pause glyph and delete `×` render at the same size | T5 | covered | met |
| 14. Delete `×` padded from edge and control; running Pod has trailing padding | T5 | covered | met |
| 15. Pod tab highlights across the whole tab on hover | T5 | covered | met |
| 16. Whole swimlane highlights — lighter Calf, darker Matriarch | T6 | covered | met |
| 17. `Steer` darker than the highlight, which extends around it | T6 | covered | met |

No uncovered rows.

## Contract operations

`Implementing task` was empty at Gate 2 by design — derivable only once the Gate 3
search located each definition site. Change surface searched:
`git diff --name-only 25d241f..HEAD` (35 files).

| Operation | Implementing task | Consuming task | Gate 2 | End state |
|---|---|---|---|---|
| `LaneStatus` value `'stopped'` written | T2 (`pod-manager.ts:535`) | T2 | covered | **called** — `pod-manager.ts:535`, the sole write site. Definition and call are the same task, so the cross-task proof is T7's `pod-stop.e2e.test.tsx`, which drives the real `PodManager` and reads the result off the renderer. |
| `LaneClosedPayload.status: 'stopped'` emitted | T2 (`pod-manager.ts:549`) | T2 | covered | **called** — `pod-manager.ts:549`. Same-task; T7's e2e asserts the durable event end to end. |
| `MIGRATION_4` applied | T1 (`schema.ts`) | existing `SqliteEventStore.migrate()` | covered | **called** — applied by the pre-existing migrate loop, proved by T1 against a real migrated database via `sqlite_master`. |
| `_AssertNever` schema-head guard fires | T1 (`schema.ts:313`) | the compiler | covered | **called** — fired under T1's probe: adding a fifth member produced `TS2344: Type '"adrift"' does not satisfy the constraint 'never'`, reproduced by the reviewer. |
| `LANE_STATUS_LABEL.stopped` rendered | T6 (`lane-status.ts:11`) | T6, T7 | covered | **called** — `LaneRow.tsx:115`. Same task as the definition, so discarded by the strict owns-scoped rule; the surviving cross-task evidence is T7's e2e, which asserts the rendered row reads `Stopped`. |
| `FINISHED_LANE_STATUSES` including `'stopped'` | T6 (`finished-lanes.ts:23`) | T6 | covered | **called** — `finished-lanes.ts:54` in `isCollapsibleFinishedLane`. Definition and use are the same file; T6's test asserts both branches (stopped Calf collapses, stopped Matriarch never does). |
| `TOKENS.statusStopped` / `--oc-status-stopped` | T3 (`renderer-theme.ts:95`, `tokens.css:75`) | T6 | covered | **called** — `LaneRail.module.css:233`, a genuine cross-task call site. |
| `TOKENS.actionRun` / `actionRunBg` / `actionStop` / `actionStopBg` | T3 (`renderer-theme.ts:109-115`) | T5 | covered | **called** — `PodBar.module.css:227,233,240,244`, all four, cross-task. |
| `WorkingIndicator` | T4 (`activity/WorkingIndicator.tsx`) | T5, T6 | covered | **called** — `PodTab.tsx:242` and `LaneRow.tsx:129`. Two independent cross-task call sites, the cleanest row on the table. |
| `statusToken('stopped')` | T3 (`renderer-theme.ts` / `contract-runtime.ts:52`) | none | uncovered — accepted out of scope at Gate 2 | **out of scope**, as accepted. The rail consumes `--oc-status-*` directly, exactly as `orphaned` does; the pair was widened to keep the hygiene guard honest, not for a caller. |

### What a call site does not prove

A call site proves something calls the operation. It does not prove a user can reach
it. For this session that gap is closed independently for the operation that matters
most: T7's `pod-stop.e2e.test.tsx` drives the real `PodManager` through the Pod tab's
stop control and asserts the rendered rail row, so `'stopped'` is reachable by a user
gesture rather than only callable.

### The one thing the search found that the table cannot show

The `lane_closed` event T2 writes is **durably recorded and never pushed to the
renderer** — `#stopRunningLanes` emits `laneChanged` but not `podEvent`. The operation
is called; its result is invisible in the transcript for the life of the session.
Recorded as escalation E3 and carried to the backlog by user decision.
