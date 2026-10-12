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

## 2026-08-20 — 2026-08-20-orcastrate-workspace-refinement

Sub-session B of the Large routing over the first hand-run's findings. Merged `09550d9`
(two parents, so non-fast-forward); artifacts at `b2c3caf`. Six tasks, seven commits —
`8008866` (`pod:delete`), `dfe5930` (pane model), `0b9e5c2` (rail), `c762007` (transcript
filter), `2c3f6f9` (Pod chrome), `018c3f8` (T3's user-directed revision), `5be7f9c` (e2e).
**69 files, +7478/−491** (`git diff --shortstat cd2696b 5be7f9c`). **72 acceptance criteria
across six tasks, all met; 0 blocking findings outstanding, 1 review round, 5 escalations,
5 user interactions** (`state.json` metrics). Suite 1562 → 1731 (+169) with both typechecks
clean, per the session's own `log.md` at 22:40Z.

**What shipped.** `selectedLaneId` and `pinnedLaneId` are gone with no compatibility alias,
replaced by `primaryLaneId` + `followerLaneIds` + `focusedFollowerIndex`, so every call site
had to fail to compile before it could be found. The Matriarch is always primary and no
action writes `primaryLaneId` — asserted after every action and every push, rather than
merely intended. The transcript shows the conversation by default: the first hand-run emitted
**53 `system` events against 11 `assistant_text` out of 109** (`spec.md`), and all 53 used to
render. The rail lost the Matriarch's pin control and gained a counted finished-lane
disclosure with four never-collapse rules. The Pod tab's single close button became two
distinct controls — a play/pause run control, and a red delete control absent from the DOM
entirely on an opened Pod. `pods.delete` widened to a required `deleteSession` boolean.

**Five escalations, all resolved with their actions implemented rather than deferred**, which
is why Gate 3's section 1 was empty. E1 settled that session deletion targets the single
`<ccSessionId>.jsonl` and **not** the `~/.claude/projects/` directory, which is keyed by
working directory and holds other Pods' and the user's own CLI sessions. E2 kept both Open
and Reconnect. E3 made Create no longer open, with no "Create and open" checkbox — reversing
a behaviour the user had the day before. E4 re-scoped a frozen criterion: T1's criterion 13
demanded a whole-suite green that no single concurrent task could deliver, so the whole-suite
assertion moved onto T5's final criterion, which already demanded it. E5 special-cased
`startup_reconciliation` into the diagnostic set after the new default filter hid the startup
notice — a user-directed contract amendment, not review churn, which is why T3's single
revision round sits against a review that found 0 blocking.

**The user added work at Gate 2 that the spec did not contain** — play/pause/red-delete
iconography — folded into T4 rather than deferred, because T4 already owned `pods/**`.

**Four guards that proved nothing were caught here, three of them by the agent whose own work
was at stake.** The fourth outlived the session entirely. T3 claimed "a test pins the
copy" of the duplicated `startup_reconciliation` marker, and it does not: the pin compares the
renderer copy to a hard-coded literal and to a fixture whose payload is also hard-coded, so
**nothing in the chain reads the producer**. A drift at
`pod-manager/startup-reconciliation.ts:28` would have left all 83 transcript tests green while
the notice silently returned to being hidden. Advisory here because no criterion required
drift-resistance; promoted to the backlog at Gate 3, and not closed until `ea06303` on
2026-10-09.

**A reviewer settled a contract defect with compiler probes rather than argument.** T3's
reviewer established that `contracts/transcript-filter.ts` §1's `readonly EventType[]`
annotation makes its exhaustiveness guard **vacuous**: the contract's own spelling exits 0 on
a thirteenth `EventType`, while T3's shipped spelling errors TS2344 on the same input. The
contract's §1 and its own "a thirteenth EventType must break `typecheck:web` here" docblock
therefore contradicted each other, and T3's deviation was necessary rather than optional. The
same round corrected two citations in the backlog's own inert-guard item.

**Two process findings worth more than their ratings.** The worktree was first placed inside
the agent's own scratch directory and re-dispatched to the project convention
`.claude-worktrees/<slug>`. And `git status` showed eight production files dirty against T5's
claim that it had modified none — checked rather than assumed: `git diff` was empty for all
eight and `git hash-object` matched `git rev-parse HEAD:<path>` exactly, so git's stat cache
was stale from a mutation-then-restore cycle and T5's claim stood.

## 2026-08-21 — 2026-08-21-orcastrate-transcript-readability

Merged `7da7c54` (non-fast-forward); artifacts at `52950c3`. Four tasks, four commits:
`b3cf3a7` (prompt persistence), `95fc7d8` (pin removal), `39c4364` (transcript rendering),
`de5f74a` (e2e plus two new hygiene rules). **43 files, +4238/−393**
(`git diff --shortstat b2c3caf de5f74a`). **41 acceptance criteria across four tasks, all
met; 0 blocking findings outstanding, 3 review rounds, 2 escalations, 6 user interactions**
(`state.json`). Suite 1731 → 1910 (+179), both typechecks clean, per the session `log.md` at
12:32Z.

**The defect was main-side, and 1731 tests could not have found it.** `PodManager.send()`
pushed the user's text into the runner's input queue and appended **nothing** to the store
(`pod-manager.ts:700-701`). Every `user_message` event in existence came from
`lane-router.ts:276`, which fires only when the SDK echoes a `user` message back.
`user_message` was already in `CONVERSATION_EVENT_TYPES` and `TranscriptEventItem.tsx:39`
already rendered it — there was simply nothing to render. No test in this repository types
into the app, so only a hand-run could surface it.

**Decomposition inverted the orchestrator's own framing of the hazard by reading the
corpus.** The orchestrator briefed the architect that the risk was *doubling* the user's turn.
Inspection of all six `tests/fixtures/protocol/*.ndjson` found the opposite: all seven `user`
messages with `parent_tool_use_id: null` are tool-result carriers and not one is a text block,
so the CLI does not echo the human's prompt back in this corpus at all — while all seven
`user` **text** blocks carry a non-null `parent_tool_use_id` and are Calf opening prompts, two
of which (`01-parallel-dispatch.ndjson:5,8`) carry identical text to each other. **A dedupe
keyed on "matches something we sent" would have silently deleted a Calf's first row from a
durable store.** Every bound in the frozen contract was then written to fail toward
over-showing: five simultaneous conditions, `PENDING_ECHO_CAP = 10`, a 60s TTL.

**The strongest vacuity catch in the project came from the implementer whose test it was.**
T1's criterion-2 pipeline test asserted the user row precedes the assistant reply, and **stayed
green when T1 swapped the append to after `await runner.send`** — the exact bug it existed to
catch. Cause: `PodRunner.send` resolves on a single `await Promise.resolve()`
(`pod-runner.ts:423-427`) while the fake SDK's async iterator needs more microtask hops, so
nothing can be ingested in that window. T1 wrote a second attempt, watched it stay green too,
and concluded the window is **structurally unobservable in that harness** rather than
mis-arranged. It moved the assertion to where the ordering is actually decided — reading the
real store from inside `FakeRunner.send` — and deleted the dead test with a comment recording
the measurement.

**This is the session that found the 0x08 byte.** T2's scripted edit wrote a literal backspace
byte into `Transcript.styles.test.ts` where the two characters backslash-`b` were meant — an
escaping collapse in the edit mechanism, not in the logic. Inside a regex literal the two forms
are near-interchangeable, so the regex still behaved correctly, **every test stayed green, and
nothing in the repository would ever have flagged it**; only an `od -c` of the line revealed it.
Unlike the session's eleven vacuity-class catches, no test could have caught this one, because
the tests were not wrong. T4 turned it into the control-byte hygiene rule and proved it fires
against a planted probe before deleting the probe; the orchestrator's immediate scan across all
of `src/` came back clean. The rule's reach was recorded as too narrow in the same breath, and
was not widened past `src/` until `7410c82` on 2026-10-09.

**The forbidden exhaustiveness spelling was independently confirmed inert for the third time,
across two sessions.** T2's probe C — `const x: _Unpartitioned[] = []` over a deliberately
unpartitioned 13-member union — exits 0 with no diagnostic, while the `as const satisfies` form
errors TS2344 on the same input and the disjointness guard fires where the cover guard stays
silent. T2's reviewer rebuilt all three probes itself rather than reading the report, and
reproduced the tuple-by-tuple result exactly.

**Reported at Gate 3 as a pattern rather than three coincidences: three criteria had their
letter and their purpose pull apart.** T3's criteria 1 and 2 were jointly unsatisfiable on the
page and were ratified at E1; T2's grep clause forbade a guard its reviewer judged **strictly
better** than the one it replaced, fixed in one revision round rather than escalated because it
was satisfiable; and T4's "passes unmodified" clause collided with additions enforcing a
previously unenforced discipline, ruled to prohibit repair-driven edits only. All three of this
session's review rounds trace to criteria wording, not to bad code.

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

## 2026-09-30 — 2026-09-04-orcastrate-correctness-sweep

Sub-session C2 of the Large routing over the 2026-08-20 deferral block, and the largest
session in the project. Scoped 2026-09-04, implemented and merged 2026-09-30 as `32638b7`
(non-fast-forward, matching repository convention); artifacts at `3b57255`. Six tasks in
three waves — **(T1 ‖ T4 ‖ T5) → (T2 ‖ T3) → T6** — and seven commits, T5 committing twice
either side of a revision round: `0c9e829`, `3eaae3d`, `1711134`, `f82d8ce`, `b4499f1`,
`0b2d54f`, `f8b2410`. **24 files, +1586/−136** (`git diff --shortstat d9d95cb f8b2410`,
matching `coverage.md`'s own figure). **90 acceptance criteria across six tasks, all met** —
12+16+14+23+12+13, from the per-task verdicts recorded in the session `log.md` — with
**0 blocking findings outstanding at Gate 3, 1 review round, 0 escalations, 3 user
interactions** (`state.json`). T6's repo-wide gates: `tsc -p tsconfig.web.json` 24 errors all
`TS6307`, `typecheck:node` zero, `npm test` **140 files / 2222 tests**.

**Nine backlog items cleared**, per `coverage.md`, which records the review that proves each:
two Helm saves inside one millisecond now produce two distinct backups; Beachcomber blocks a
Pod holding a directory whose recorded path is only a decoded guess; a foreign write landing
between Helm's `rename` and its acknowledgement still produces a change push; a failure
renders on exactly one surface; the comparison empty state no longer advertises a control
that is off screen; a failed `helm:scopes` says its sentence once; a Beachcomber row states
the path is unverified *before* showing it; the `refused` documentation in the frozen
`beachcomber.ts` contract matches shipped behaviour; and `IpcFailure` is reachable without
transitively loading `src/main/pod` and `src/main/store`. **Two of the nine were defects C1
had introduced.**

**The orchestrator found the session's only blocking defect, in already-committed work.**
`npx tsc -p tsconfig.web.json --noEmit` against T5's merged commit gave
`BeachcomberRow.test.tsx(189,36) TS2345` — the only non-`TS6307` error in the program. That
is **the C1 failure mode exactly: vitest transpiles without typechecking**, so every scoped
test gate T5 had run passed over a live type error. T5 went back to `revising`, replaced the
`noUncheckedIndexedAccess` destructure with a `positionOf()` guard whose new assertion it
proved falsifiable independently of the short-circuiting `compareDocumentPosition` one, and
the repair landed as its own commit `1711134` rather than as a rewrite. Wave 2 was then
dispatched with an explicit implementer-level `typecheck:node` gate, added because of this.

**Reviewers ran mutations the criteria had not asked for, and two were load-bearing.** T3's
reviewer gated the normalized comparison on `!compareByEncoding`, turning the union into a
replacement, and watched the `my_project` test fail — direct evidence that the "nothing
blocked before C2 becomes unblocked" union property is real rather than asserted. T4's
reviewer tested criterion 7's non-derivability argument by enumerating all five writers of
`actionError`, and found two unreachable holes in the Q1 invariant (correctly advisory, not
blocking). T1's reviewer rejected esbuild for the comment-only proof and wrote its own
falsifiability-tested comment stripper instead, getting 2666 chars on both sides.

**`coverage.md` reported four contract operations as having no caller, and the session proved
all four false alarms rather than either accepting or waving them off.** The check discards
hits in files owned by the same task that owns the definition site, and for
`backupPathForSequence`/`BackupSequence`, `acknowledgeOwnWrite`, `podBlockerFor` and the three
`IpcFailure` constructors the definition and *every* consumer sit inside one task's ownership
by design — in item 9's case, necessarily so, since the point of the item was moving those
consumers to the leaf. Each was then checked by hand and named. The check prefers a false
alarm at a gate to a silent pass, and that is recorded as working as intended. **The operation
that genuinely did have an implementer and no caller was not in the table at all**:
`helm.watch` was never a declared contract operation in C1's or C2's contracts, so
`coverage.md` never had a row for it, and the dead watcher went unfound until the driven
hand-run.

**The merge was verified to transfer the gates rather than re-running them.**
`git diff 32638b7 f8b2410` excluding `.dir-sdlc` is empty, so the merged tree is byte-identical
to the tip T6's three gates ran against and the 2222-passing result carries to `main` without
a re-run.

Token and design work was deferred to sub-session C3 at Gate 1 — `font-weight: 600` with no
token, the four apparently unconsumed tokens, the opaque `.confirmScrim`, and the `PanelBar`
pair. C3 has not run.

## 2026-10-07 — driven Electron hand-run (no session; Playwright-driven, observed directly)

**Headed 2026-10-07, and three dates disagree, so here is the reconciliation.** The directory
`.dir-sdlc/handruns/2026-09-30-electron-handrun/` is named for the **manual** 32-step plan:
`RESULTS.md` heads itself "Hand-run results — 2026-09-30" and is still an empty capture
template, so the manual sitting it was written for never happened. `README.md` heads itself
"Electron hand-run — 2026-10-07" and reports the driven run at 110/111; `driver/` and
`screenshots/` carry 2026-10-07 mtimes. Git corroborates none of that, because git sees none
of it until two days later: `929c613` (author date 2026-10-09 10:55:32 -0700) commits the
harness and the 110/111 result in one go, and `d995e1d` (11:06) carries the watcher fix and
the re-run, whose `driven-report.md` stamps itself `Generated 2026-10-09T18:05:11.892Z` at
112/112. So the **run** is 2026-10-07 on the artifacts' own word, its **repair** is
2026-10-09 on git's, and the directory name is a third thing again. This entry is headed by
the date the run happened — the convention every other hand-run entry in this file follows,
and the date the backlog block for it already uses — with the 2026-10-09 work named below as
2026-10-09.

**The hand-run owed since C1, finally executed — and automated.** Playwright drives the built
app through `_electron.launch`, so this is the real main process, the real preload bridge, the
real renderer and real filesystem writes, not jsdom. 24 steps across sections B–F, assertions
made by the harness rather than by eye, and 27 screenshots captured for what only a human can
judge. **110 of 111 checks passed, and the one failure was a real defect.**

**The finding is one no existing test could have caught: Helm's file watcher is never armed in
the shipped app.** `HelmService.watch(scopeId)` is the only arming path
(`helm-service.ts:239-248`) and nothing in the application called it — there is no `helmWatch`
channel, `handlers.ts` registers only `helmScopes`/`helmLoad`/`helmSave`, and neither `load()`
nor `save()` arms it. Its only callers were tests. Production passes `watchEnabled: true`,
which makes it look enabled, and the frozen contract documents the behaviour as intended
(`helm.ts:57-58`). **Proved empirically before being believed**: with the user scope loaded,
two external writes produced **zero** `helmChanged` pushes over 25s. So
`COPY.staleHeading`/`staleBody` could never render, and **C2's `acknowledgeOwnWrite` fix was
correct but guarded a path that never executed**, making its user-visible benefit zero.
Save-time conflict detection was unaffected, because it re-reads independently — which is why
the conflict flow passed.

**Why nothing caught it, which is the durable lesson.** Every watcher test calls `watch()`
itself, and `helm.watch` was never a declared contract operation in C1's or C2's session
contracts, so `coverage.md` never had a row for it. **This is precisely the
implementer-with-no-consumer shape the coverage check exists to find, missed because the
operation was never declared to it.**

**Fixed 2026-10-09 by remediation 1 of the three the findings ranked** (`d995e1d`). The
`helmLoad` handler now arms the watcher after a successful load — that is where "the user chose
a scope" is known, and scope switches and reloads both route through `load` while
`HelmWatcher` holds at most one watch — with the arming wrapped so an advisory watch failure
cannot turn a load the user sees succeed into a failed invoke. Six tests in
`tests/unit/ipc/panels.test.ts` assert the **application** makes the call rather than that the
watcher works once armed; reverting the handler turns three of them red with
`expected [] to deeply equal [ 'user' ]`. The probe went from 0 pushes in 25s to one push with
the stale notice on screen in 500ms, the driven suite from 110/111 to **112/112**, and
`npm test` from 2222 to 2228.

**Everything else C1 and C2 shipped is confirmed in a real window**, including the one that
mattered most: a Pod blocks the Beachcomber entry whose displayed path was only a decoded
guess, with a genuinely `disabled` checkbox — the case that motivated C2's item 2, and one that
would not have blocked before it. Both halves of the R4 gate, the union property, failure
routing, the `comparisonEmpty` copy, the close guard on both close and switch, the
failed-reload draft retention and the conflict side-by-side all passed. Helm's write path and
Beachcomber's trash path ran for real: a file written as valid JSON with a trailing newline, a
backup holding the pre-save content, a second save producing a distinct backup name **and**
payload, cancel removing nothing, and confirm moving a sandbox fixture to the recycle bin.

**The run is fully sandboxed, and that is what made the crown-jewel check reachable.** It
redirects `USERPROFILE`, `APPDATA`, `LOCALAPPDATA` and `TEMP` into a throwaway home so both
`CLAUDE_HOME` and the Pod sqlite store land there, and every run ends by asserting the real
`settings.json` is byte-identical with no stray backup beside it. The earlier manual plan had
targeted the real home, on the reasoning that Pod-dependent scenarios need a live `claude`
process a sandbox would break. **That reasoning was wrong**: `createPod` spawns nothing — it
validates the cwd and writes a store record (`pod-manager.ts:390`) — and `openPod` is what
spawns, so Pod *blocking* and project-scope Helm work against a created Pod with no child
process. Two environment traps are written into `README.md` so nobody pays for them twice:
redirecting `USERPROFILE` alone makes Electron abort with `0xC0000003` before any app JS runs,
because Chromium needs the `AppData` skeleton to derive its profile; and `app.getPath('home')`
returns the *real* profile even when the env var is redirected, so the UI's rendered output is
the only honest probe.

**Two cosmetics confirmed rather than newly found.** The "path not verified" caveat renders
above true absolute paths under `shell-snapshots`, `file-history` and `paste-cache`, because
`buildEntry` labels every non-`projects` entry `pathSource: 'decoded-name'` — already filed
from C2's review, and now plainly wrong in the real UI for three of the four roots. And the
`hold` warning names CLI 2.1.235 while 2.1.277 is installed; correct, since 2.1.235 is the
build the value set was read from, but it reads as stale.

**Still not exercised.** `B5` (a blocked backup aborting the write) and the same-millisecond
backup collision are not reachable interactively, since the backup name derives from the
save-time clock; both remain covered only by unit tests with an injected clock. `D3` (a failed
`helm:scopes` printing once) could not be staged without breaking every later step.
Narrow-window layout still needs a human eye.

## 2026-10-09 — pre-C1 backlog audit (no session; every bullet checked against code)

Two commits, both touching `.dir-sdlc/backlog.md` and nothing else: `008da4d` (+22) and
`a186f06` (+278/−45), per `git show --stat`.

**A seven-item sample is what opened it.** `008da4d` checked seven bullets from the
pre-`2026-09-01` blocks and found **five already fixed but still listed as open** — startup
reconciliation, Pod removal, `lane_closed` reaching the renderer, and the failed-start
orphan/reap all ship today, and `statusToken` has production callers. One was genuinely still
open; one had been closed by the hand-run. Rather than quietly fix the seven, that commit wrote
the sample and its evidence into the file's own header, so the file said out loud that it was
misleading as a planning input until audited.

**`a186f06` then checked all of them** — roughly 60 bullets of unknown status. Seven items were
closed and unmarked, and each now carries a CLOSED note **in its own block** rather than only
in the closing session's: the pane model (`primaryLaneId` + `followerLaneIds` shipped exactly
as that block's own research round had recommended), all three indicator-set refinements
(`WorkingIndicator` is deleted and the status dot carries the motion), `closePod` against an
already-closed Pod, migration 4's blob hash, the dangling activity-indicator pointers, and the
`lane_closed` pair. `MIGRATION_1`'s four unpinned enums are down to two.

**One earlier verdict was reversed, and it is the finding worth carrying.** Four tokens
re-verified as unconsumed earlier the same day (`8ce26fd`, 11:12) are in fact **consumed,
across 22 `var()` declarations**. That check had grepped the TypeScript identifiers where the
stylesheets only ever write the CSS variable names. It is recorded in place because it is the
one audit finding that overturned a negative — and a negative measured with a needle that
cannot match is the same defect class as a guard that cannot fail.

**The output is a roster, not a narrative.** The file now ends with every still-open item, each
line carrying the citation the audit used, in five groups: correctness, tests and guards, prose
no longer true of the code, cosmetic and structural, and design decisions with no code answer.
**40 bullets across those five groups** — 6, 13, 11, 8 and 2 — counted over the block by script
rather than by eye. A sixth heading, Informational, is explicitly not work: frozen contracts are
never edited, so the falsified claims in them stay as recorded and are listed only because they
are live misinformation for anyone reading those sessions' artifacts. A scoping session reads
one list instead of re-deriving it, which is exactly what the guard-hardening session did later
the same day.

**The structural cause is unfixed, and the header says so.** Sessions close items without
annotating the source block, so a later reader of that block re-scopes finished work — the same
hazard `d9d95cb` fixed for C1 and `8ce26fd` for C2, arriving a third time. Guard-hardening
became the first session to annotate the roster items it closed with the block they came from.

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

## 2026-10-09 — 2026-10-09-orcastrate-audit-trail-repair (Small)

Three files, +390/−10: the docblock claim the guard-hardening session introduced,
its two commit-message defects recorded, and the five missing entries above this
one written from their sessions' own artifacts. One implementer, one reviewer,
**seven derived criteria all met, 0 blocking findings, 0 revision rounds.**
`npx vitest run src/renderer/src/__tests__/hygiene.test.ts` → 21/21;
`npm run typecheck` clean on both programs.

Small keeps no `reviews/` file, so the verdicts are here: every one of the seven
was tagged `reviewer-reproduced`, and the reviewer traced **nine of nine**
falsifiable numbers in the new log entries back to an artifact — reproducing all
three change surfaces to the digit (`69/+7478/−491`, `43/+4238/−393`,
`24/+1586/−136`), all three metric triples exactly, and re-deriving the criteria
counts by script, where `90 = 12+16+14+23+12+13` came out right. The 40-bullet
audit roster was recounted as `6+13+11+8+2`. No entry was left as a stub: all
five sessions had artifacts supporting a real one, the three DIR sessions in
particular carrying near-transcript per-session `log.md` files.

**The docblock correction took two passes, and the second one is the point.** The
guard-hardening session had cited `grep -lP` as evidence its `.ndjson` exclusion
hid nothing; that command exits 2 here and matches nothing whatever the files
contain, so the claim rested on an instrument that could not report. The
replacement names a Node sweep proved in both directions — `86 swept []` clean,
`87 swept` naming a planted `0x08`. But the first draft of that replacement
*also* overreached, saying `grep -P` "cannot report a hit at all" when the failure
is conditional on `LANG`/`LC_ALL` being unset; forced to a UTF-8 locale it works.
Caught at Gate 3, scoped, and the condition spelled out rather than trimmed.
Three nestings of one defect class in two sessions, each caught by the next layer
of review rather than by its author.

**The widened control-byte rule caught a live byte on the day it merged.** The
first attempt at this session's edit went through a quoted heredoc, which
collapsed `\\x00` to `\x00` and wrote a **literal 0x00 into
`hygiene.test.ts:796`**. The rule failed immediately and named the file and line —
`1 failed | 20 passed`. Reverted and redone with the Edit tool. Until then that
rule had only ever been shown failing on a deliberately injected byte; it now has
a real, tooling-introduced case, in a file nobody was aiming it at.

The driven hand-run entry is headed `2026-10-07` after reconciling three competing
dates; the reasoning and what git cannot corroborate are stated in that entry
itself. Four advisories carried to the backlog, including a sixth `log.md` hole
left deliberately unwritten — the 2026-08-21 sub-session B hand-run has no artifact
directory, and backfilling it would be the reconstruction this session's brief
forbade.

## 2026-10-12 — 2026-10-09-orcastrate-theme-contract-decisions

Sub-session **C3**, the last of the Large routing over the 2026-08-20 block, run
from the cold-start brief at `.dir-sdlc/handoff-c3.md`. **All five scoped items
closed.** Three tasks, all `frontend`, 17 files, **+474/−57** over
`41f274e..10feee6` — `56abc4b` (PanelBar on `aria-current`), `5ba2f3e` (the
clearing list and the criterion-6 reading, prose only), `10feee6` (both theme
tokens, 19 call sites, the pin release and a new repo-wide census).

**32 of 32 acceptance criteria met. 1 blocking finding, closed in one round of a
cap of two. 5 escalations, 1 amendment, 4 user interactions.** Suite **2233 →
2240**, both figures measured in this session rather than inherited; `npm run
typecheck` clean on both programs at the base and at the tip. T2 took one
re-dispatch when an API session limit killed its reviewer mid-run — a crash
costs a dispatch, never a round, so `reviewRounds` is 1 and equals the sum of the
per-task `revisionRounds`.

The theme contract gained two additions-only members under escalations E1 and E2:
`--oc-weight-semibold: 600`, closing a gap five directories had independently
worked around, and `--oc-overlay-scrim`, a new family deriving its hue from
`--oc-bg-app` through `color-mix` so that no colour literal was invented — which
answers on its own terms the objection the stylesheets had recorded for choosing
opacity. All fifteen bare `font-weight` literals in the renderer are now
tokenised, so none remains anywhere, and four dialogs veil the window instead of
hiding it.

**Two of the five items were handed over with their breadth wrong, and both were
corrected by re-measuring rather than by trusting the citation.** The opaque
scrim was four sites, not one: a census of all eleven `var(--oc-bg-app)` CSS
consumers found four identical full-window rules, with the cause already recorded
in one of their docblocks. And the clearing-list amendment belonged in the live
contract under `src/`, not in C1's frozen session artifact, which carries the same
list and which this project never edits.

**Two defects originated in this session's own frozen criteria, and both were
caught by the parties downstream of them.** Criterion 8's expected count was
arithmetically impossible against criterion 4's mandated value — the implementer
reported the conflict instead of quietly filtering a grep to make the number come
out, and it was fixed by escalation E5 and amendment A1. Criterion 2 asserted
"five directories" while naming four, which an implementer faithfully reproduced
into shipped prose before a reviewer caught it; the orchestrator then found a
third site the reviewer had missed. The Gate 2 consistency check tested vacuity
and pairwise contradiction but never simulated a criterion's own stated count
against the post-change tree — the gap that let both through.

**The session's single blocking finding is the argument for the Gate 2 decision
that produced it.** Criterion 11 was rewritten before the freeze from "delete
these three strings" to "the docblock carries no claim this task falsifies". The
blocking finding was a fourth false claim in that same file, sitting in the
assertion body rather than the docblock, which none of the three enumerated greps
would have reached. An enumeration of known instances is not a specification of
the obligation.

Seven advisories carried to the backlog, three contract gaps and one correctness
risk among them by explicit user decision at Gate 3. Two recurring defect classes
already written down in this project's notes recurred anyway — a check that cannot
report, five times, and heredoc backslash collapse, a second time — and the
backlog now argues they need enforcing rather than remembering. `dir-git`'s prose
drifted from its diff for the fourth consecutive session while its staged paths
were correct every time; the mandatory read-back caught it, and the commit stands
as written because history is never rewritten here. **Nothing in this session was
rendered for a human eye:** the four veiled scrims and ten semibold headings are
confirmed by count, census predicate and a green suite, and the driven hand-run
that would actually look at them has not been re-run.
