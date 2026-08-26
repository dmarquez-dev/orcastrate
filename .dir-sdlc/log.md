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
