# Pod lifecycle reconciliation

**Goal.** A relaunched Orcastrate shows the truth about its Pods, and the way back to a working Pod is visible rather than folklore.

## Context

Orcastrate's MVP shipped across three merged DIR sessions and was launched by hand for the first time on 2026-08-20. That run surfaced one confirmed, reproducible defect and three related lifecycle gaps, recorded in `.dir-sdlc/backlog.md` under "2026-08-20 — first run findings".

Close the app and reopen it and the Pod is unusable: the rail shows its Matriarch lane as **Running** with a duration ticking from the original `started_at`, and the composer is disabled with "This Pod is not running." With the app closed and no Claude Code process alive, the database holds Matriarch lanes with `status: 'running'` and `ended_at: null` while both Pods read `idle`. Recovery works — it is the Open button at `PodTab.tsx:94` — but nothing says so, and the symptoms say the opposite.

Verified directly against the code before decomposition: there is no boot sweep anywhere in `src/main/`; `store.ts:161` hard-codes `opened: false` for every fresh renderer; `pod-manager.ts:336-347` marks a failed start beached without calling `runner.stop()`, unlike `#dispose()` at `:353-360`; and `pod-runner.ts:189-191` sets `#phase = 'stopped'` before throwing, making `stop()`'s `#abort.abort()` at `:381` unreachable on that path.

Baseline on `main` at `49151c9`: 91 test files, 1392 tests, `npm test` exit 0.

## Definition of done

1. **Relaunch is clean.** With Pod rows and `running` Matriarch lanes persisted and no runner alive, starting the app leaves no lane displayed as Running. A test drives this end to end from a seeded store.
2. **Reconciliation is observable.** Every Pod whose **lanes** were reconciled carries a durable `system` event with subtype `startup_reconciliation`, written *before* its lane closures, naming what was reconciled. A boot-orphaned lane is distinguishable from a turn-orphaned one by the presence of that event. A Pod that needed only a status correction (`idle` → `closed`, no running lane) gets **no** transcript row, deliberately: under E1's Option 3 the sweep touches every non-beached Pod on every boot, and a notice that always fires carries no information. A test asserts that absence as well as the presence.
3. **Reconciliation is reversible.** Opening a reconciled Pod returns its Matriarch lane to `running`. Relaunch, Open, send a message works with no intermediate step, and a test asserts the lane is not left Orphaned once the Pod is running.
4. **`opened` is derived from `status`, not remembered by the renderer.** A fresh renderer against an already-open Pod shows it open, with an enabled composer, without calling `pods.open`. Hydration stays one round trip — no request waterfall. Per E1's Option 3, `PodStatus` gains `closed`, `status` alone is authoritative, `PodRuntimeState.opened` is **deleted**, and `PodTabVm.opened` is computed at exactly one place by `status === 'idle' || 'running' || 'waiting'`. There is no `PodView` and no parallel `opened` field on the IPC surface.
5. **The way out is on screen.** A Pod whose lanes were reconciled presents the run control as the affordance that fixes it, and the composer's disabled explanation names that control rather than stating a bare negative.
6. **A failed `start()` reaps its child.** After a start that throws, no runner is left streaming into the store: the manager stops the runner it abandoned, and `PodRunner.stop()` reaches `#abort.abort()` even when `start()` already set the phase to `stopped`. Each half is tested without assuming the other landed.
7. **Three enums stay frozen; one is widened deliberately, with its migration pinned.** `LANE_STATUSES`, `LANE_KINDS` and `EVENT_TYPES` stay byte-identical to their shipped values — they are still interpolated live into shipped DDL (`schema.ts:155,162,193`) and a guard test asserts the three arrays. `POD_STATUSES` **is** widened with `closed`, which is the whole point of E1's Option 3, so the interpolation hazard is *disarmed* rather than avoided: `MIGRATION_1_POD_STATUSES` is pinned the way `MIGRATION_1_PERMISSION_MODES` already was, `MIGRATION_2` is untouched (its status CHECK was already a literal), and migration 3 rebuilds `pods` with the five-value CHECK. `MIGRATIONS` becomes `[1, 2, 3]` and `CURRENT_SCHEMA_VERSION` becomes 3. The proof that no applied migration was rewritten is `tests/unit/store/migration-2.test.ts`'s existing byte-identity check against the shipped git blob, which must be seen **passing** with the union widened, plus a test that migrating a seeded v2 database appends only version 3 and loses no lane or event row.
8. **The spec matches the code.** Design §8 gains the process-start row it lacks, design §4.4's Pod-status enumeration becomes five values, `LaneClosedPayload.status`'s docblock states that `orphaned` covers two boundaries and how to tell them apart, and `index.ts:133`'s comment — which already said `'idle'` covers both open-and-quiet and closed — is corrected to say the distinction now exists.
9. **Whole-repo green.** `npm test` exits 0 across all suites, with no fewer tests than the 1392 baseline.

## Scope

The four first-run lifecycle findings: startup reconciliation, `opened` deriving from main, the unreapable orphaned child, and the `cc_session_id` capture question (shaped by escalation E2's answer).

### Not in scope

- **Sub-session B's work**: transcript noise filtering, the Pod delete affordance, pinning UX, finished-lane clearing, the pane model.
- **Sub-session C's work**: the Helm and Beachcomber panel items.
- `tests/unit/store/errors.test.ts`'s known order-dependence under `--sequence.shuffle`. Pre-existing; not to be mistaken for a regression from this session.
- Unowned and therefore frozen by construction: `src/main/lane/**`, `src/main/{beachcomber,helm}/**`, `src/renderer/src/{beachcomber,helm,permissions}/**`, `App.tsx`, `src/renderer/src/state/panel-*`, `src/renderer/src/state/isolation.test.ts`.
- **Narrowed by E1's Option 3.** `src/main/store/**` was frozen in the first draft and is now T0's, in full — the migration work is the price of the option. Of `src/renderer/src/shell/**` exactly two files are in scope (`contract-runtime.ts`, `WorkspaceLayout.test.tsx`) and of `src/renderer/src/styles/**` exactly one (`tokens.css`); everything else under both trees stays frozen. `src/renderer/src/contracts/renderer-theme.ts` is a frozen contract file now amended under explicit Gate 2 licence and nothing else.

## Assumptions

| Question | Answer | Rung | Evidence |
|---|---|---|---|
| New lane status for boot-orphaned, or reuse `orphaned`? | Reuse `orphaned`; amend its documented semantics to cover both boundaries, distinguished by the `startup_reconciliation` event that always precedes the process-start case and never the turn-boundary one | 1 | Design §2 lines 53-55 (new *steady* states not added lightly); `schema.ts:162` interpolates `LANE_STATUSES` live into shipped DDL; renderer already renders `orphaned` end to end — `lane-status.ts:14`, `renderer-theme.ts:70`, `contract-runtime.ts:35` |
| How is the reconciliation recorded durably? | A `system` event with a new free-form `subtype`, not a new `EventType` | 1 | `SystemPayload.subtype` is typed `string`, `events.ts:240-244`; `EVENT_TYPES` interpolated live at `schema.ts:193`; spec 5.2 already requires every `EventType` stay renderable |
| Does the sweep need a new `EventStore` method? | No — N+1 over Pods. There is no bulk or cross-pod lane query, and adding one changes frozen `event-store.ts` and `schema.test.ts`'s `STORE_METHODS`. Pod counts are single digits and the sweep runs once, before the window exists | 1 | `listLanes` is always `WHERE pod_id = ?` |
| Must the sweep pass `lastActiveAt`? | Yes, explicitly. `updatePod` refreshes it to now unless supplied, so a sweep that omits it stamps every Pod as active at boot and destroys the only record of when it was last really used | 1 | `event-store.ts:128-132` |
| Is the sweep a one-way door? | It would be without a fix: `#ensureMatriarchLane` returns an existing lane whatever its status, and nothing in `#start` sets a lane back to `running`, so every later Open would leave the rail showing Orphaned forever. `#start` must revive it | 1 | `pod-manager.ts:883-886`; no `running` write in `#start` |
| Is the reported symptom "the tab's x refuses with a not-running error" reproducible from the code? | **No.** `PodsChrome.tsx:41` → `pod:close` → `closePod` throws only `NOT_FOUND` from `#requirePod`; `#dispose` is a no-op with no session, and `NOT_RUNNING` appears nowhere on that path. Ship a regression guard proving the benign behaviour, and report the observed text as a finding if it still reproduces against the built app | 1 | `PodsChrome.tsx:41`, `pod-manager.ts` `#requirePod`, `#dispose` |
| Who owns whole-repo green? | T6. Earlier tasks are green within their own ownership plus typecheck | 1 | E4 amendment from session `2026-08-19-orcastrate-beachcomber-helm`, adopted up front rather than rediscovered mid-session |

## Contracts

- `contracts/pod-lifecycle.ts` (977 lines) — the three invariants the session is built around (three enums frozen and one deliberately widened, reconciliation observable, reconciliation reversible), `OrphanReason`, `StartupReconciler`, the `startup_reconciliation` event, the `'closed'` semantics with its transition table and blast-radius enumeration, the migration obligation, the reap obligation, and the session-id capture rule.
- `contracts/renderer-lifecycle.ts` (373 lines) — `opened` as a derived value, the hydration rule, the status-token widening, the relaunch symptoms as testable statements, and reconciliation legibility.

Both were amended after Gate 2 to describe E1's Option 3 and E2's Option A, and are frozen as amended.

## Escalations — both resolved at Gate 2

- **E1 — resolved as Option 3, not the architect's recommended Option 1.** `PodStatus` is widened with `'closed'` so `status` alone is authoritative. No `PodView`, no parallel `opened` boolean on the IPC surface. The user was shown the three costs — the `MIGRATION_1` rewrite hazard, the reach into `src/main/store/**`, and the frozen `renderer-theme.ts` status tokens — and chose it on the grounds that one authoritative field beats a parallel boolean. Settled; not relitigated. The migration obligation it creates is contract §6 and task T0; the compensating simplification is the deletion of `PodRuntimeState.opened` and of the first draft's `OpenedKnowledge` tri-state.
- **E2 — resolved as Option A.** `session_id` capture narrows to `system`/`subtype: 'init'` and `result` messages, latest such id in a run wins, with a warn-level log when a captured id changes. T3 keeps its full size and no criterion of it is conditional.

### Assumptions the amendment changed

None of the seven assumptions above is **invalidated** by Option 3. Two are materially amended and both amendments are in the contracts:

- *"Must the sweep pass `lastActiveAt`?"* — still yes, and now far more consequential. The sweep used to touch only Pods that were mid-turn at the crash; under Option 3 it touches every non-beached Pod on every boot, so omitting `lastActiveAt` would destroy the field within one session of use rather than corrupting a few rows.
- *"Who owns whole-repo green?"* — still T6, with an addition the first pass did not anticipate: `npm run typecheck:web` is red from T0's commit until T5's, because widening the union breaks the exhaustive `Record<PodStatus, string>` in `PodTab.tsx`. T0 enumerates the exact failure set; T1, T2 and T4 each assert it did not grow; T5 closes it. Suite greenness is unaffected, since vitest transpiles without typechecking.

One assumption survives but needed its reasoning sharpened rather than changed: *"reuse `orphaned` rather than add a lane status"* previously leaned partly on "no enum is widened", which is no longer a blanket rule. It stands on the stronger ground stated in contract §1 — a boot-orphaned lane is genuinely the same steady state reached by a second route, whereas `'idle'` was two distinct states sharing one name. Widening the one that was overloaded does not license widening the one that is not.
