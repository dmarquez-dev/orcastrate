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

## 2026-08-26 — fourth hand-run (no session), post-merge

Drove the merged fix against a real Electron window the same day. **It works**: a stop
renders `Lane closed` / `Stopped` in the default transcript.

Two things the run established that the session had not:

- **Historical stops are visible retroactively.** The filter runs over backfilled
  history, not just live pushes, so the three older `lane_closed`/`stopped` events in
  the test Pod (durable since the morning, invisible until now) render on open. Correct,
  but unstated in the definition of done.
- **Narrowness was NOT hand-tested.** The live database holds four `lane_closed` events,
  all `stopped`, and no `done` or `orphaned` at all — so there was nothing the filter was
  meant to hide. That constraint still rests on tests alone.

## 2026-08-27 — 2026-08-27-orcastrate-indicator-collapse

Merged `f2862ee` (`--no-ff`). Three tasks, three commits: `2cc0bea` (Pod tab),
`595247d` (lane rail), `0dd8468` (retire `activity/`). 19 files, +790/−485.

**What shipped.** Each of the two surfaces drew two adjacent marks — a status dot plus a
separate pulsing `WorkingIndicator`. Each now draws one: the status dot itself carries
the motion, derived from the `data-status` attribute both surfaces already had, so no
new prop, class, or test id was threaded to either. `idle` on the Pod tab is sharpened
to a `--oc-border-thick` hollow ring. `LANE_STATUS_LABEL` is untouched and no
`Active`/`Waiting` vocabulary was introduced — the lane already renders a word for each
of its four statuses. `src/renderer/src/activity/` is retired, all seven files.

**31/31 acceptance criteria met, 0 blocking findings, 0 revision rounds, 0 escalations,
3 user interactions.** Post-merge on a quiescent `main`: `npm run typecheck` exit 0,
`npm test` 2041/2041.

**The design decision was made by measurement, and the obvious answer was wrong.** The
approved brief said to put `@keyframes` in `global.css` and reference it from both CSS
modules. Probed before decomposition: `global.css` emitted `@keyframes ocProbePulse`
while the module emitted `animation: _ocProbePulse_ijqny_1`. **Vite hashes an animation
name inside a `*.module.css` even when no local keyframe of that name exists**, so the
reference resolves to nothing and the animation silently never runs — and jsdom applies
no stylesheet, so no suite in this repository could have caught it. The shape shipped
instead is per-module keyframes plus a drift guard, and T3's build-level proof reads the
emitted bundle for the pair `@keyframes _ocStatusPulse_<hash>` / `animation:
_ocStatusPulse_<hash>` in each module scope independently.

**The architect found a coupling the brief missed.** `activity/raw.d.ts` declared
`*.tsx?raw`, which `lanes/LaneRow.source.test.ts:23` depends on. Deleting `activity/`
would have failed `typecheck:web` in files the deleting task did not own — and **only**
under `tsc`, never under Vitest, since Vite resolves the import at runtime regardless.
T3 owned both halves of the move.

**Demonstrations were reproduced, not read.** Every reviewer was told to reproduce and
each did. T3's reviewer ran the co-drift test the criteria demanded — the same drift
injected into both stylesheets at once — and the guard still went red, proving it
re-types its expectation rather than deriving it from one file. Two implementers
volunteered honesty that cost them: T1 disclosed that its "exactly one `[data-status]`
element" assertion could not have gone red (the retired indicator carried `data-size`,
not `data-status`) and added a helper to cover the real gap; T2 found four of its new
assertions green before implementation and proved each non-vacuous by mutation instead
of banking them.

**One defect escaped all three reviews and was caught at Gate 3** — a docblock in
`PodTab.source.test.ts` describing T3's move in the future tense and naming the
now-deleted `activity/raw.d.ts`. Ownership-scoped review is what makes concurrency safe,
and it is also why no reviewer could see both halves of a cross-task move. Deferred to
the backlog.

**The worktree traps did not occur, because the worktree was placed inside the
repository** at the already-gitignored `.claude-worktrees/<slug>`. Verified before
dispatch rather than assumed; nine agents ran with zero resolution failures. See the
backlog entry.

## 2026-08-27 — 2026-08-27-orcastrate-matriarch-pod-status

Five tasks, five commits: `1d031f9` (contract), `2c778b7` (label extraction), `a797952`
(derivation), `2bd2b58` (the row), `52a69cc` (joined e2e + repairs). 14 files, +1278/−39.
**55/55 acceptance criteria met, 0 blocking findings outstanding, 0 revision rounds,
2 escalations, 3 user interactions.** Post-merge on a quiescent `main`: `npm run typecheck`
exit 0, `npm test` 2096/2096.

**What shipped.** The Matriarch lane row now reports the owning **Pod's** status while its
lane is open — the Pod's word from `POD_STATUS_LABEL`, its hue via `statusToken`, and the
Pod tab's own dot shapes — so the rail and the tab agree about whether Claude Code is
working. Once the lane has ended, terminal `LaneStatus` wins and `Stopped`/`Done`/`Orphaned`
render exactly as before with their frozen durations. Calf rows are untouched by design.

**The defect, and it was not a regression.** A hand-run found the Matriarch's dot pulsing
continuously, never resting between turns. Root cause: `PodStatus.running` is an ACTIVITY
flag (`pod-runner.ts:426` sets it on `send()`, `:272` clears it at turn end) while
`LaneStatus.running` is a LIFETIME flag the database enforces (`schema.ts:355`,
`CHECK ((status = 'running') = (ended_at IS NULL))`), and the Matriarch's lane is open for
the Pod's whole life. **The retired `WorkingIndicator` bar carried the identical condition**
(`git show 595247d^:…/LaneRow.tsx` line 129) — collapsing the indicator into the status dot
made a pre-existing defect visible by moving the motion onto the element the user reads for
status.

**The shape was the user's call, and the evidence was concrete.** `LaneRowVm` gained a
distinct `podStatus: PodStatus | null` on a `data-pod-status` attribute mutually exclusive
with `data-status`, rather than widening `status` to both unions. Both unions spell
`running`, so a widened field would have made `LaneRail.module.css:256`'s
`.status[data-status='running'] .dot` match a streaming Pod and a merely-unended lane alike
— **this defect, re-encoded in CSS**.

**Two vacuity traps were found by the agents that hit them, not by the criteria.** T3's
terminal case passes against an implementation with no `podStatus` field at all, because
`undefined ?? 'null'` renders `null`; it made its red step the clause-less mutation instead
and said so. T5 measured that `POD_STATUS_LABEL.running` and `LANE_STATUS_LABEL.running` are
both the literal `'Running'`, so a text-only assertion would have read identically before and
after the entire change — its red-step diff shows `railWord: "Running"` on both sides. Both
were reconstructed and confirmed by reviewers rather than accepted.

**One blocking finding, and it was nobody's to fix.** T4's correct change broke three
assertions in `__tests__/`, which no task owned — ownership-scoped review is what makes two
implementers safe in one worktree, and it is also why no single diff contained both halves.
Escalation E2 widened T5's ownership with the user's approval. The repair could easily have
shipped a weakened suite: `pod-stop:473` carried a comment stating its assertion existed so
the test "could not tell 'the fix works' from 'the row never said Running'", and
`relaunch:501` was a negative that went trivially true. Both were replaced with positives
that were then **seen failing under injected defects**. The real surface was four assertions,
not the three the manifest named — `:523` was masked behind `:476`.

**The architect caught a criterion that would have failed T5 for doing the approved work.**
When E2 widened T5's ownership, its frozen c10 still said "must not edit any existing file
under `__tests__/`" — jointly unsatisfiable with the amendment. Rewritten before dispatch.

## 2026-08-27 — fifth hand-run (no session), post-merge

The Matriarch-Pod-status change was driven against a real Electron window immediately
after `2e5c310` merged. **Behaviour was clean and every enumerated scenario passed.**

- The Matriarch row's dot **rests between turns**: pulsing blue while a turn streams, a
  grey hollow ring reading `Idle` once it ends. This is the defect the fourth hand-run
  reported, and it is fixed.
- **The rail and the Pod tab agree.** The icons matched between the Matriarch lane row
  and the Pod tab across the scenarios driven — which is the session's whole claim, and
  the one that only a joined render could have shown.
- **Calf lanes were unaffected**, showing their own `Running` / `Done` lane statuses
  beside a Matriarch reporting the Pod. The deliberate decision to leave Calves on the
  lane vocabulary reads correctly in practice: a running Calf genuinely is working.
- No finding of any kind. **Nothing in this hand-run became backlog**, which is the first
  time that has happened in this project — the previous four each produced the next
  session's work.

Worth recording for the rhythm's sake: the defect this session fixed was **found by a
hand-run and confirmed fixed by a hand-run**, with the diagnosis done by reading the code
before any session opened. The `PodStatus`/`LaneStatus` split was established from
`pod-runner.ts:426`, `:272` and the schema `CHECK` at `schema.ts:355` — not guessed — and
that diagnosis was handed to every agent at dispatch so none re-derived it.

## 2026-09-01 — 2026-08-31-orcastrate-helm-draft-safety

Sub-session C1 of the Large routing over the 2026-08-20 deferral block. Closed the Helm
draft-safety cluster: a failed same-scope reload now keeps the draft, `compare()` makes the
side-by-side the contract promised on 2026-08-19 actually buildable and it is built, closing
or switching away from a dirty Helm panel raises the panel's own confirmation, and
`HelmValidationIssue.field` documents all seven names it emits.

Five tasks, 66 acceptance criteria, all met. **Zero blocking findings, zero revision rounds,
zero re-dispatches** — 29 files, 3493 insertions, range `95436c3..c4665be`.

One escalation. E1: `helm/test-fixtures.ts` needed the new contract members, but although T4
owned the file no criterion required touching it, and no task typechecked the repo — every
scoped `vitest` run passes regardless, because vitest transpiles without typechecking. The
user chose to fix it *and* gate it, adding a repo-wide `tsc` criterion to T5. That gate came
back 24 total / 24 TS6307 / 0 other, so the contract amendment typechecks against the whole
tree. **This session had no repo-wide typecheck until the user added one at an escalation.**

Two decisions at Gate 2 beyond the spec: the side-by-side was built rather than the promise
retracted, and the unguarded `PanelBar.onOpen` row the architect refused to close was folded
into T3 rather than backlogged — which turned out to matter, since switching panels ate drafts
by exactly the same path closing did.

Eight advisory findings carried to the backlog. Two are real defects this session introduced.

## 2026-10-09 — 2026-10-09-orcastrate-guard-hardening

Five guards that could not fail, made falsifiable. Scoped from the 2026-10-09 audit
roster. `a186f06..7410c82`, five commits, 12 files, +660/−107. 37 of 37 criteria met,
**0 blocking findings, 0 revision rounds, 0 escalations, 3 user interactions.**
`npm run typecheck` clean on both programs and `npx vitest run` at 141 files / 2233
tests, both re-run by T4's reviewer rather than taken on report.

Every one of the five was confirmed **genuinely incapable of failing** beforehand,
not merely weak — which is the whole evidentiary standard the session was built on:

| Guard | Proof it could not fail at `a186f06` |
|---|---|
| Calf prompt survival | an injection making the replay ingest nothing passed **all six** loop iterations |
| kept-Pod transcript pane | that pane was **always empty**; `toEqual([])` was green over nothing in normal operation |
| error-code coverage | reproduced failing under `--sequence.shuffle`; the only such failure in 140 files / 2228 tests |
| control-byte scan | the injected files were **structurally invisible** — one outside its root, one outside root *and* filter |
| marker desync | renaming at the producer left **199 renderer tests green across 11 files** |

The marker finding is the one that mattered most. The duplication main-to-renderer
was deliberate and documented, and the documentation was correct — `tsconfig.web.json`
genuinely cannot see `src/main`. The defect was that nothing in the chain read the
producer, so escalation E5's regression was live: producer writes `_v2`, filter matches
the old string, the reconciliation notice silently returns to being filtered out, and
the entire renderer suite says nothing. Both constants now live in `src/shared/`, which
both tsconfig programs include. **The architect killed the additive alternative on a
fact the orchestrator had asserted wrongly** — `tsconfig.node.json` declares no `paths`,
so a `tests/**` file importing the renderer filter TS2307s; the "touches no shipped
code" option would have required editing the whole node program's config.

**Two findings about the session's own manifest outweigh the code fixes.** T5's
criterion 7 was unsatisfiable as written — it demanded the visibility guards go red
*because* producer and filter share a const, which is the premise that makes the
conclusion unreachable — and Gate 2 had already caught that identical self-comparison
shape in criterion 5, deleting two reference pins that would have compared a value to
itself, without propagating the insight three criteria down. And a T4 verification
command was itself vacuous: `grep -lP` fails in this environment with exit 2 and matches
nothing regardless of content, a claim now sitting in a shipped docblock. The reviewer
caught it with a positive control. **In a session auditing assertions that cannot fail,
one agent verified its work with a command that could not report a hit** — being fixed
as a Small session immediately after this merge, by user decision at Gate 3.

Gate 2 resolved three authoring problems before the freeze: the c4/c5 contradiction over
`transcript-filter.test.ts:191`, the two self-comparing reference pins, and an ordering
clause in T1 c5 that would have mandated execution order inside the session built to
delete it. All three were found by the orchestrator's consistency pass, not by the
architect that wrote them.

Reviewers reproduced rather than read, and it paid: T1's re-derived six baseline counts
two independent ways; T2's checked criterion 4 against the diff and found the base
evidence *stronger* than claimed; T3's ran four shuffle seeds and verified the injected
defect fails under plain `vitest` rather than only under `tsc`; T5's noticed its own
criterion-7 injection proved only absent-declaration detection and ran the duplicate
direction itself; T4's re-ran both session gates and swept 354 files with a positive
control.

Four advisories carried to the backlog, all four in the correctness-risks group. Also
recorded there: "exactly one changed file" is unsatisfiable in a shared worktree and
appears in four tasks; T4's self-reported `git checkout` and the `truncate -s -1`
alternative; `4b05532`'s message omitting the dead-constant deletion; and the discovery
that `log.md` itself is missing entries for three merged sessions, the 2026-10-07
hand-run, and the audit.
