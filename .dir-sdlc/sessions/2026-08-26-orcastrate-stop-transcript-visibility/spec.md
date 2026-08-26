# Stop transcript visibility

Make a deliberate Pod stop appear in the transcript, in words, in the default view.

## Context

Stopping a Pod produces **nothing visible**. Confirmed by hand on 2026-08-26
against a real Electron window: press Stop, and the transcript stays empty.

Two independent defects sit between the event and the screen, and fixing either
alone changes nothing a user sees.

1. **The event never leaves the main process.** `PodManager.#stopRunningLanes`
   appends `lane_closed` events through `appendMany` and then pushes only
   `laneChanged` — never `podEvent`. The renderer's backfill short-circuits on
   `hasMore === false`, so the durably-written event stays invisible for the life
   of the session. The precedent that gets this right is in the same file:
   `#appendResumeFallbackNotice` captures `appendMany`'s return and pushes it,
   and its comment states the reason.
2. **Once pushed, the filter hides it.** `lane_closed` is a `PLUMBING` event
   type, so `'conversation'` mode — the default — drops it.

Both mechanisms were traced twice by reading before the hand-run observed the
outcome. **Diagnosis is finished; this session is the fix.**

A false premise to name rather than inherit: the previous session's frozen
`contracts/lane-stopped-status.ts` §1 asserts a stopped lane "is visible in the
default transcript with no filter change". It is not, and was not. That session's
T7 criterion 3 was recorded **not met** for exactly this reason, rather than
quietly dropped. No criterion in this session restates it.

## Definition of done

1. A `lane_closed` event with `status: 'stopped'`, written by the stop sweep, is
   pushed live to the renderer on the `podEvent` channel.
2. That event survives `'conversation'` mode, the default transcript view.
3. `lane_closed` is **not** unhidden wholesale — `done` and `orphaned` stay
   hidden.
4. The transcript reads `Lane closed` / `Stopped`, using the rendering that
   already exists. No new rendering work.
5. Idempotence is preserved: a second `closePod` sweeps nothing and therefore
   pushes nothing, on any channel.
6. The joined outcome is proven by a test that **would have failed at `ad0368a`**
   — the commit this branch starts from.
7. `transcript-filter.ts`'s three-set partition and both `_AssertNever` guards
   survive untouched.
8. `transcript-filter.ts`'s prose stays true of the code it describes.
9. Migration 4's shipped blob is pinned in the frozen-migration tripwire.

## Scope

The two defects above, the joined proof, and the migration-4 blob pin.

### Not in scope

- **Unhiding `lane_closed` for `done` or `orphaned`.** Routine lane bookkeeping
  is what the filter exists to remove.
- **The wording "Lane closed" for a deliberate stop.** It reads slightly off-key
  against a button labelled Stop. Recorded for the backlog; changing it here
  would mix a cosmetic decision into a defect fix.
- **`migration-frozen.test.ts`'s `git show` shallow-clone weakness** — already
  backlogged, and it goes red rather than silently green, which is the better
  failure mode.
- **Pinning `LANE_KINDS` / `EVENT_TYPES`** against the latent migration-1 bug.
  Deliberately excluded by the previous session so a byte-identity failure stays
  attributable; that reasoning is unchanged.
- **Reproducing the fix in a real Electron window.** Every test here is unit or
  jsdom by design (§9). A hand-run after merge is the only thing that closes
  this, and it is not a Gate 3 claim.

## Assumptions

| Question | Answer | Rung | Evidence |
|---|---|---|---|
| Does `appendMany` return the stored events, so the named fix is available? | Yes — `NormalizedEvent[]`, currently discarded at the call site | 1 — repo evidence | `src/shared/contracts/event-store.ts:201`, `src/main/store/sqlite-event-store.ts:366` |
| Does the renderer already handle a live `podEvent` push? | Yes — `onPodEvent` merges head-of-stream events; no renderer work needed for arrival | 1 — repo evidence | `src/renderer/src/state/store.ts:287`, `src/renderer/src/state/merge.ts` |
| Does anything already render `lane_closed` readably? | Yes — `Labelled label="Lane closed"` with a status dot and `LANE_STATUS_LABEL[payload.status]`, which yields `Stopped` | 1 — repo evidence | `src/renderer/src/transcript/TranscriptEventItem.tsx:113` |
| What shape may a payload-scoped exemption take without loosening the type partition? | The `isStartupReconciliationNotice` shape — it changes the *predicate*, leaving the three sets and both `_AssertNever` guards intact | 1 — repo evidence | `src/renderer/src/transcript/transcript-filter.ts:229` and its comment at 243–250 |
| Will a wholesale unhide be caught, or does it need a new guard? | Caught by the existing corpus — both `lane_closed` fixtures build `status: 'done'`, so a wholesale unhide breaks two existing suites | 1 — repo evidence | `transcript-filter.test.ts:315`, `test-fixtures.ts:103` (both verified this session) |
| Which commit shipped migration 4? | `e15b1c4` | 1 — repo evidence | `git log -S MIGRATION_4 -- src/main/store/schema.ts`; `git cat-file -t e15b1c4` → `commit` |
| May the joined proof add a new e2e file? | No — `hygiene.test.ts:300` asserts `MAIN_REACHING_FILES` two-sided, and its comment bars a glob. Extend the existing `pod-stop.e2e.test.tsx` | 1 — repo evidence | `src/renderer/src/__tests__/hygiene.test.ts:112–115, 300` |
| Is a repo-wide `npm test` a valid gate? | No, not while peers are mid-write — a previous reviewer saw 8 failures that were a peer's in-flight probe. Criteria name scoped vitest invocations | 2 — project record | `.dir-sdlc/backlog.md`, 2026-08-26 process note |

## Contracts

- `contracts/stop-event-push.ts` — the main-side push: capturing `appendMany`'s
  return, the ordering of `podEvent` against the existing `laneChanged`, and the
  idempotence guarantee that forbids an empty push.
- `contracts/stop-notice-visibility.ts` — the renderer-side exemption:
  `isDeliberateStopNotice`, its reach into `isHiddenInConversation`, and the
  invariants the partition must keep. Opens by naming the false premise above.

## Open questions

None outstanding. The one genuinely open design decision — the ordering of the
`podEvent` push relative to `laneChanged` — was settled in
`contracts/stop-event-push.ts` under the architect's contract-authoring mandate:
`podEvent` goes immediately after the `appendMany`, binding the push to the write
it publishes, so "append and forget to push" stops being a state the code can be
left in. That is precisely the state it was left in.
