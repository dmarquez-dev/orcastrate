# DIR log

One line per session. Sub-session records live under `sessions/<slug>/log.md`.

- 2026-08-18 — `2026-08-18-orcastrate-mvp` (Standard) — merged. MVP items 1–5: persistent Pods, lane routing, transcript and composer, permission prompts and interrupt, Steer.
- 2026-08-19 — `2026-08-19-orcastrate-workspace-ui` (Standard) — merged. Workspace shell, Pod bar, lane rail, permission cards, run control.
- 2026-08-19 — `2026-08-19-orcastrate-beachcomber-helm` (Standard) — merged. MVP items 6–7: the Beachcomber cleanup panel and the Helm settings editor.
- 2026-08-20 — `2026-08-20-orcastrate-pod-lifecycle` (Standard) — merged `1ba979c`. Fixed the four lifecycle defects the first hand-run found: startup reconciliation of persisted Pod and lane state, `opened` derived from `pod.status`, the orphaned child a failed `start()` left streaming, and session-id capture narrowed to `system/init` and `result`. Widened `PodStatus` with `'closed'` by user decision at Gate 2, which required pinning `MIGRATION_1`'s status list and adding migration 3. 7 tasks, 0 revision rounds, 0 blocking findings. 91/1392 tests → 102/1551.
- 2026-08-20 — `2026-08-20-orcastrate-open-resumes` (Small) — committed in place. Closing and reopening a Pod lost Claude Code's conversation context, because `openPod` never passed the SDK's `resume` option; only `reconnectPod` did, and only a beached Pod could reach it. Found by hand-running the app after the lifecycle session. `openPod` now resumes against the stored `ccSessionId`; a resume the CLI rejects falls back to one fresh session and writes a `resume_fallback` notice into the transcript, by user decision at dispatch. 0 revision rounds, 0 blocking findings. 102/1551 → 103/1562.

## Verified against the running app

Both 2026-08-20 sessions were checked by hand against a real Electron window and
a real Claude Code install, not only against the suite. This matters because
every test in this repository is unit or jsdom — design §9 says so deliberately —
so hand-running is the only evidence that any of it works end to end.

Confirmed working on 2026-08-20:

- A Pod closed and the app relaunched shows its Matriarch lane as **Orphaned**,
  not Running.
- Pressing **Open** returns the lane to Running and the Pod to a usable state.
- The `closed` and `idle` status icons read correctly and were not judged a UX
  problem.
- **Closing and reopening a Pod preserves Claude Code's conversation** — a
  question about an earlier turn is answered from context rather than treated as
  the start of a new conversation. This was the defect `open-resumes` fixed, and
  it is the only part of that fix a test could not prove: the suite asserts the
  `resume` option is *passed*, while honouring it is the CLI's behaviour.

Not yet exercised by hand: the resume-rejection fallback, which needs a stale or
garbage-collected session id to trigger. If it fires, a `resume_fallback` notice
appears in the transcript — and the `RESUME_FAILED` regex breadth recorded in the
backlog is the first thing to suspect if it fires on a Pod that should have
resumed cleanly.

## 2026-08-21 — second hand-run (no session)

The transcript-readability session was driven by hand immediately after merging.
Seven findings recorded to `.dir-sdlc/backlog.md` under "second hand-run findings"
for a fresh session to pick up; no implementation work started.

Two mechanisms were traced before writing, so the next session does not re-derive
them:

- **"Running" persisting on a stopped Pod** is `closePod` writing the Pod's status
  without ending the Matriarch lane, so `elapsedMsOf` falls back to `nowMs` on a
  null `endedAt`. The deeper half is that `LaneStatus` has no member meaning
  "stopped deliberately" — a schema change, not a renderer fix.
- **No in-progress indicator** is partly caused by this project's own transcript
  filter: `thinking` is in `PLUMBING_EVENT_TYPES` and therefore hidden by default
  since 2026-08-21. Recorded as such rather than as a pre-existing gap.

## 2026-08-26 — 2026-08-25-orcastrate-pod-status-and-chrome

Cleared the seven second-hand-run findings. A stopped Pod now reads Stopped with a
frozen duration; work in flight has a timer-free status affordance; the Pod tab and
lane rail chrome are done. 8 tasks, 7 commits, 36 files, +3453/-48; 70 of 71
acceptance criteria met, 1 revision round, 3 escalations.

Three decisions the user took:

- **E1** — the stopped status token was re-pinned from `#8f8577` to `#c0b39d` after
  review measured the first at 1.022 WCAG contrast against `idle`, hue-only
  separation. The orchestrator then established that the shipped palette's worst pair
  is `idle`/`beached` at 1.005, so the greyscale weakness is systemic; the re-pin
  fixes the semantically adjacent pair and the systemic question went to the backlog.
- **E2** — T8 was authorised outside the frozen manifest to add the new e2e suite to
  `hygiene.test.ts`'s main-reaching allowlist, rather than widening that rule to a
  glob, which would have returned it to the stated-but-unenforced state it was
  written to end.
- **E3** — two defects the session found while proving its own fix were backlogged
  rather than fixed: `#stopRunningLanes` never pushes `podEvent`, and `lane_closed`
  is PLUMBING. T7's criterion 3 is recorded **not met** because its premise was
  false, not because the work fell short.

The last one is the session's most useful output after the fix itself. T7 refused to
assert the current empty-transcript behaviour as correct, which would have locked the
defect in behind a green suite.

## 2026-08-26 — third hand-run (no session)

The `pod-status-and-chrome` session was driven by hand the day it merged — the
first end-to-end evidence for any of the three surfaces it changed. **The stop
flow behaved correctly**: colours read accurately, the stopped state reads
correctly, and no behavioural defect was observed.

Findings are recorded to `.dir-sdlc/backlog.md` under "third hand-run findings".
All are visual, and all concern the indicator set rather than the stop path.

Two mechanisms were traced before writing them down, because one finding is not
the change it looks like:

- **The Pod tab draws two adjacent elements**, `statusDot` and `WorkingIndicator`,
  not one dot with several states. "One dot on the tab" is therefore a decision
  about which element survives, and the naive collapse drops the status hue for
  the running state.
- **`WorkingIndicator` renders `null` when inactive by contract**, and that is the
  property that keeps nothing ticking after the last lane ends. The requested
  resting-state outline must go to `statusDot` or to a new component; putting it
  in `WorkingIndicator` would falsify the guarantee the last session built it to
  have.

**Confirmed by hand:** the two transcript-visibility defects
(`#stopRunningLanes` never pushing `podEvent`, and `lane_closed` being PLUMBING).
Their predicted symptom was stated before the check and then observed exactly —
**after the stop the transcript was empty, with nothing about the stop in it.**
Both were previously traced twice by reading; this is the first time the
user-visible outcome has been seen. They are no longer a prediction.

Migration 4 ran clean against the existing database on first launch. Startup
reconciliation closed 2 Pods and orphaned 2 lanes left running by the previous
process, as designed.

## 2026-08-26 — 2026-08-26-orcastrate-stop-transcript-visibility

Fixed the transcript-visibility defect pair confirmed by hand that morning. A stop now
reads `Lane closed` / `Stopped` in the default transcript. 4 tasks, 4 commits, 7 files,
+487/-35; 36 of 36 acceptance criteria met, 2 revision rounds, 1 escalation. Post-merge
on a quiescent tree: `npm run typecheck` clean, `npm test` 2027/2027.

**Every blocking finding in this session was an assertion or a claim that could not be
wrong** — which is notable in a session whose whole purpose was proving something true:

- **T1's suite-wide guard could not fail.** `createPushes` drops empty batches before
  they are recorded, so the `afterEach` loop iterated a collection that was empty by
  construction — while its comment claimed a hoisted push "fails here wherever it was
  added". Caught by injecting that exact defect and watching all 10 tests pass. Fixed
  by recording at the `Pushes` boundary; the same injection now reddens 9 of 10.
- **T4's new comment was false.** The paragraph written to stop this class of error
  recurring asserted "migration 4 shipped unpinned too". It shipped fully pinned
  (`MIGRATION_4_LANE_STATUSES`, `e15b1c4:schema.ts:291,605`). The replacement states
  the true and more useful thing: pinning and *watching* are separate obligations.
- **T2's apparent contract conflict was not one.** A criterion forbade edits to
  `transcript-filter.ts:38-164` while another mandated one at 81–96. The frozen
  contract freezes only `136-164`; the criterion's paraphrase over-reached by ~100
  lines. Resolved on repo evidence, not judgment.

**None of the three would have survived a reviewer that read reports instead of
reproducing them, and all three came from asking for reproduction by name.** Two
reviewers went further than asked: T4's ran a *stronger* injection of its own to settle
whether the row was genuinely byte-compared, and T3's verified that each injected half
failed *only* the new test while the six pre-existing ones stayed green — the direct
evidence that neither half's own coverage sees the other, which is why the defect
shipped green twice.

**Not verified: a real Electron window.** T3 proves the joined path in jsdom. The
hand-run of that morning was the diagnosis, not the verification. A hand-run of the
stop flow is the natural next step, and it is now cheap — the words either appear or
they do not.
