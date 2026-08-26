# Backlog

Work deliberately deferred by a DIR session, with the session that deferred it.
Read at session setup; append only at Gate 3.

## 2026-08-19 — 2026-08-18-orcastrate-mvp

- **Direct Calf steering (`SendMessage` / `TaskStop`) stays deferred; sub-session 2
  ships the read-only UI first.** The original deferral rested on a false premise
  — `SendMessage` was believed broken in SDK mode per
  `claude-agent-sdk-python#716` — which this session's probe disproved: all three
  steering tools exist and execute against CLI 2.1.235, and `agent_id` is
  observable and persisted for every Calf. The work is therefore **reachable, not
  blocked**. `PodRunner.sendToAgent()` returns `{ supported: false }` as a
  deliberate product choice, and its body is a one-line swap. Deferred because
  mid-work steering has UX questions nobody has designed, and sub-session 2 should
  not grow mid-flight.

- **`forkSession` Pod branching.** A latent capability documented in the SDK
  reference and **not verified against CLI 2.1.235 by this session's probe** —
  verify before building on it. Would let a Pod branch into a new session id
  rather than continuing one.

- **Full config manager** — MCP server management (`~/.claude.json`), a hooks
  builder, and agent/skill browsing. Out of MVP by decision at brainstorming;
  Helm covers `settings.json` only.

- **Adopting terminal-started sessions** by scanning `~/.claude/projects/`, giving
  pre-existing Claude Code sessions Orcastrate titles retroactively.

- **Raw terminal pane per lane**, for anything the structured event view does not
  model.

- **macOS and Linux validation.** The stack supports all three; only Windows is
  validated.

## Decided for sub-session 2 — CONSUMED 2026-08-19 (session 2026-08-19-orcastrate-workspace-ui)

All four shipped. Kept for provenance; not pending work.

### Original heading: Decided for sub-session 2 (not deferred — inputs to its decomposition)

These were settled at this session's Gate 3 and are requirements, not backlog:

- **`system/task_progress` routes to its own Calf**, via
  `byToolUseId.get(tool_use_id)`, with a Matriarch fallback when the lane is not
  yet materialized. The current blanket "all `system` messages to the Matriarch"
  rule leaves a background Calf with an empty lane while the Matriarch fills with
  progress lines about a lane the user is viewing elsewhere.

- **The New Pod dialog offers four permission modes** — `default`, `acceptEdits`,
  `plan`, `bypassPermissions`. This requires widening the frozen `PermissionMode`
  union, which the contract now explicitly flags as a product decision rather than
  a platform limit. `acceptEdits` was excluded at Gate 2 on the false premise that
  the SDK lacked it; the CLI accepts seven modes.

- **The `bypassPermissions` badge must say what is true**: a Pod in that mode
  raises **no permission cards at all** — the SDK shadows `canUseTool` entirely
  and warns `CLAUDE_SDK_CAN_USE_TOOL_SHADOWED`. "This Pod will never ask you about
  anything" rather than a generic danger warning.

- **A `canUseTool` ordering race exists and is observable only through one log
  line.** `canUseTool` is invoked out of band from stream ingestion, while both
  attribution indexes are populated by ingesting `task_started` or the dispatch
  block. A Calf's first tool prompt arriving before that ingestion falls back to
  the Matriarch — a legitimate Calf prompt on the wrong lane, indistinguishable
  from the correct no-id case. `PodManager.#attributePrompt` warns when a supplied
  id resolves to no lane; if that warning appears in a real log naming an
  `agentId`, this race is the first thing to suspect. The two real fixes — await
  ingestion of the owning dispatch, or park the prompt until the lane materializes
  — are both behavior changes beyond sub-session 1's scope.

## 2026-08-19 — 2026-08-19-orcastrate-workspace-ui

Advisory findings promoted from that session's reviews because they outlive it.
The other 48 advisories stay in `.dir-sdlc/sessions/2026-08-19-orcastrate-workspace-ui/reviews/T1.md`–`T9.md`.

- **`TOKENS` has no border-width, tracking, or font-weight token.** Six renderer
  directories independently reached for bare `1px`, `0.04em`, and `font-weight:
  700` because nothing else existed, and every reviewer judged it a token-set gap
  rather than a deviation. Adding `TOKENS.borderHairline`, `TOKENS.tracking*`, and
  `TOKENS.weight*` would let T8's hygiene rule widen to all raw lengths. This is a
  change to the frozen `renderer-theme.ts`, so it needs an escalation.
  **Sub-session 3 will hit this the moment it styles Beachcomber or Helm.**

- **`MIGRATION_1` still interpolates four live enums** — `POD_STATUSES`,
  `LANE_STATUSES`, `LANE_KINDS`, `EVENT_TYPES` — into already-shipped DDL, the
  identical latent bug T1 fixed for `PERMISSION_MODES`. Widening any of the four
  silently rewrites history. Partially mitigated: the byte-identity pin now fails
  loudly instead of shipping, but the pin is not a fix. Pinning all five
  per-migration lists in one pass would close the class.
  `src/main/store/schema.ts:141-201`

- **Nine of fifteen invoke channels have no surface that renders their error**,
  and four of those (`podUpdate`, `podDelete`, `podSetPermissionMode`,
  `podReconnect`) are never invoked by any affordance at all. Enforced as an
  executable allowlist in `src/renderer/src/__tests__/failure-paths.e2e.test.tsx`,
  so the set cannot silently grow — but a user currently gets no feedback when any
  of the nine fails. Related: `TranscriptPane.tsx:140-142` has an unreachable
  error branch, because the sole writer of that state always writes `null`, while
  the backfill failure it looks like it covers is silent in `runtime.backfill.error`.

## 2026-08-20 — 2026-08-19-orcastrate-beachcomber-helm

Sub-session 3 shipped Beachcomber and Helm, closing MVP items 6 and 7. Deferred
at its Gate 3 by explicit user decision. Full per-criterion verdicts and each
finding's full text are in that session's `reviews/T1.md`–`T10.md`.

### Escalation-derived

- **A failed Helm `reload` discards the draft it could not replace.**
  `panel-store.ts:556,573-577` clears `document` and `draft` on any failed load,
  and that path is shared by `selectScope` and `reload`. For a scope *change*
  that is correct — showing scope A's typed values under scope B's name is worse
  than losing them, and the frozen contract documents reload as "discarding the
  draft". For a *failed reload* it is data loss: a user who follows the conflict
  banner's own advice, clicks Reload and hits `EACCES` loses a draft to an
  operation that wrote nothing. Narrow fix: keep the draft when the failed load's
  `scopeId` equals the current one. T10's criterion 5 was amended at Gate 3 to
  match shipped behaviour; this item is the half that was **not** accepted.

### Contract gaps

- **`src/shared/contracts/beachcomber.ts:213` contradicts shipped behaviour.**
  `refused` is documented as covering ids "unknown to this scan", but the service
  throws `NOT_FOUND` for an unknown or stale id, as the same file's own service
  docblock and header require. T1, T5, T6 and T10 all read that comment; a
  consumer coding to it would wait for a `refused` entry that never arrives.
- **`src/shared/contracts/helm.ts:251` promises a side-by-side that cannot be
  built.** It says a conflict "shows the current contents beside the pending
  edit", but frozen `HelmActions` offers only `reload()`, which replaces the
  draft, and no action fetching the fresh document without replacing it.
- **`helm.ts:208` lists five `HelmValidationIssue.field` names**; the shipped
  validator legitimately emits `parseError` and `permissionsDeny`. The type is
  `string`, so nothing breaks — but a consumer keying per-field rendering off the
  five would leave a `parseError` issue disabling Save with no visible cause.
- **`font-weight: 600` has no token.** The set offers 400/500/700, and
  `shell/EmptyWorkspace.module.css` uses 600. Fixing it is a visual decision, not
  a mechanical swap — which is why T10 pinned it rather than changing it.
- **Four of the nine tokens T4 added have no consumer yet** — `borderThick`,
  `trackingTight`, `weightRegular`, `weightMedium`. Candidates for a dead-token
  sweep if nothing claims them.

### Correctness risks

- **Two Helm saves inside the same millisecond silently overwrite the first
  backup.** `backupPathFor` is fully determined by the injected clock and
  `copyFileSync` clobbers. A collision-avoiding suffix, or `COPYFILE_EXCL` with a
  retry, closes it.
- **Closing the Helm panel discards an unsaved draft.** T9's close button
  triggers it, and T9 correctly declined to fix it: knowing the draft is dirty
  would require `App.tsx` to call `useHelm()`, whose mount effect issues the
  scope fetch — making `App` a data fetcher and breaking the "hook mounted means
  panel open" invariant. The fix belongs inside the Helm panel as a guard it
  exposes, or a `beforeClose` the shell awaits. Contract change.
- **Beachcomber's Pod blocking compares against `displayPath`, which may be a
  guess.** `src/main/beachcomber/service.ts:147,188`. For a `projects` entry with
  no cwd-bearing record the comparison key is the decoded name, so a Pod holding
  that directory's *true* path would not block it. Bounded — trashing removes the
  `~/.claude/projects/<dir>` state, not the Pod's working directory — but it is
  the one place the decode ambiguity reaches a safety check rather than a label.
- **`acknowledgeOwnWrite` can swallow one genuine external change.** If another
  writer lands between Helm's `rename` and its post-write snapshot, the watcher
  adopts those bytes as Helm's own and emits no push. Bounded: the save-time
  re-read still catches it.
- **`HelmNotices.tsx` prints the same error sentence twice** when a failed
  `helm:scopes` sets both `Loadable.error` and `actionError` to the same string.
  `BeachcomberError` dedupes exactly this case. **Pinned by T10 as
  `toHaveLength(2)` with a REPORTED DEFECT comment — fixing it requires deleting
  that assertion.**
- **`BeachcomberRow.tsx:77` renders the path above a notice saying the path below
  is a guess.** The copy is frozen and rendered verbatim as required; the fix is
  DOM order, not wording.
- **Both new main-process modules reach `../ipc/errors`**, which transitively
  pulls `src/main/pod` and `src/main/store`. Verified electron-free and harmless
  today; a leaf error module would make the isolation true transitively as well
  as directly. Flagged independently by two reviewers.

### Test and CI concerns

- **Nothing in this session has run in a real Electron window.** Coverage is unit
  and jsdom only, as design section 9 specifies — but that decision predates a
  panel that moves files to the recycle bin. T8 states plainly it did not launch
  the app, and the two layout token values are therefore unvalidated, since jsdom
  applies no stylesheet.
- **`tests/unit/store/errors.test.ts` is order-dependent** and fails under
  `--sequence.shuffle`: its "covers all four documented codes" reads a set filled
  by earlier tests in the same file. Pre-existing from sub-session 1; the rest of
  the repo shuffles clean.
- **Two T10 pins fail when the defects they pin are fixed** —
  `PRE_TOKEN_SHELL_DECLARATIONS` and the `HelmNotices` `toHaveLength(2)`. The
  two-sidedness is deliberate, but each fix carries a mandatory edit to
  `failure-paths.e2e.test.tsx`.
- **`src/main/ipc/handlers.ts:90-92`'s duplicate-registration guard has no direct
  test**, before or after this session. Extracting `register` into an exported
  factory would cover it without a test-only export.
- **Helm's watcher tests depend on `fs.watch` delivering within a fixed turn
  count.** Deterministic here, but latency is platform- and CI-dependent; a
  bounded poll-until-push would be sturdier.
- **`tests/unit/beachcomber/roots.test.ts:129-130` asserts recursive `sizeBytes`
  loosely** — `> 0` after subtracting 15 — so it would pass even if the nested
  bytes were never counted. Recursion is covered by `fileCount` on the same tree.
- **`EACCES` is exercised through an `ENOTDIR` proxy** in the Beachcomber root
  tests: no portable way to force a permission fault on Windows without ACL
  manipulation. The code path is identical.

### Cosmetics

- `src/renderer/src/test-utils/stub-api.ts:154` — fixture docblock claims the
  default scan carries "an empty root"; all four roots are populated.
- `src/renderer/src/helm/probes.ts:8-11` — header says `HelmPanel.test.tsx` runs
  the probes against the real panel; that arm lives in `discrimination.test.tsx`.
- `src/renderer/src/helm/rules.ts:7-8` — states the lookahead bug backwards. It
  says the broken form "matches nothing"; measured, it returns true on a
  tokenised declaration, so it fires on *clean* code. The shipped pattern is
  correct, only the prose is wrong.
- `src/main/index.ts:94` — comments refer to "Criterion 5" from an earlier task's
  numbering, colliding with T8's own criterion 5.
- `src/main/ipc/index.ts:9-15` — two consecutive re-exports from `./validate`
  where one would do.
- `src/renderer/src/beachcomber/BeachcomberGroupHeader.tsx:63` — the one
  user-visible sentence composed in JSX rather than routed through `copy.ts`.
- `src/renderer/src/beachcomber/BeachcomberRefusals.tsx:36-38` — a refusal names
  its reason but not which entry it refers to.

## 2026-08-20 — first run findings (no session; observed directly)

The app was launched for the first time on 2026-08-20 and driven by hand: two
Pods, one of which dispatched two sub-agents. These are the findings from that
run, for a follow-up refinement session. Everything below was verified against
the running app or against `%APPDATA%\orcastrate\orcastrate.db`, not inferred.

### Bugs — CONSUMED 2026-08-20 (session 2026-08-20-orcastrate-pod-lifecycle)

All four shipped. Kept for provenance; not pending work. The relaunch stranding,
the renderer-local `runtime.opened`, and the unreapable orphaned child are fixed
and each carries a regression test that was observed failing first. The open
question about `cc_session_id` was answered: the finding's premise was wrong —
capture was first-message-wins per runner, not last — and the real hazard was
that `stream.ts` accepted a `session_id` off any message type with no filter.
Capture now narrows to `system/init` and `result`, latest wins, with a warning
when it changes.

- **Nothing reconciles persisted Pod and lane state at startup, and it strands
  the Pod on every relaunch.** *Confirmed by reproduction.* Close the app and
  reopen it, and the Pod is unusable: the rail shows its Matriarch lane as
  **Running** with a duration ticking from the original `started_at`, the
  composer is disabled with "This Pod is not running. Open it before sending a
  message.", and the tab's `x` refuses with a not-running error. Nothing on boot
  marks an open lane orphaned or reconciles a Pod's status against the fact that
  no runner exists. Evidence: with the app **closed** and no Claude Code process
  alive, the database holds two Matriarch lanes with `status: 'running'` and
  `ended_at: null`, while both Pods read `idle`.
  **Recovery works and is the Open button on the Pod tab**
  (`PodTab.tsx:94`, `showRunControl = beached || !opened`) — pressing it restored
  full functionality. But nothing tells the user that is the way out, and the
  three symptoms all say the opposite. Design §8 defines Orphaned for a lane open
  at a *turn* boundary; it says nothing about a lane open at *process start*, and
  that is the gap.

- **`runtime.opened` is renderer-local, in-memory, and initialised `false`.**
  `store.ts:161`. It is set true only by a successful `pods.open`
  (`store.ts:473,533,552`) and reset only on a `beached` push
  (`store.ts:357-360`). So any fresh renderer — a reload, an HMR cycle, a
  relaunch — believes every Pod is unopened regardless of what main knows. This
  is the state-model half of the bug above; reconciling lanes at boot fixes the
  display, but the composer stays disabled until `opened` derives from main
  rather than from renderer memory.

- **A failed `start()` orphans the Claude Code child, and `stop()` cannot reap
  it.** `pod-manager.ts:338-347` deletes the session from the registry and marks
  the Pod beached, but never calls `session.runner.stop()` — unlike `#dispose()`
  at `:353-360`, which does. Worse, `start()` sets `#phase = 'stopped'` before
  throwing (`pod-runner.ts:189-191`), and `stop()` early-returns when the phase is
  already `'stopped'` (`:379`), so it never reaches `#abort.abort()`. The child
  keeps streaming into the store with no owner and no reaper. Not observed on this
  run — the Pods opened successfully — but the path is real.

- **Open question: the stored `cc_session_id` may not be the session you want to
  resume.** The first Pod's transcript carried **three** distinct `session_id`s
  during startup (`f70fbdf4`, `1045d714`, `c794f73b`) and the store recorded the
  last one seen. Pressing Open later started a fresh session and overwrote it
  again (`c794f73b` → `2c98e7f0`). Since `pods.reconnect` resumes whatever id is
  stored, a wrong id means resuming the wrong conversation. The user's own
  `SessionStart` hook reports `sdk_bootstrap` metrics and may be spawning nested
  SDK sessions, so this may not be Orcastrate's doing — but which id is
  authoritative needs deciding before Reconnect is trusted.

### UX refinements — CONSUMED 2026-08-20 (session 2026-08-20-orcastrate-workspace-refinement)

All four shipped, together with the pane-model decision below. Kept for provenance;
not pending work.

- **The transcript shows everything the CLI emits, and it is mostly noise.**
  Of 109 stored events, **53 are `system`** — `hook_started` 10, `hook_progress`
  8, `task_progress` 8, `hook_response` 6, `thinking_tokens` 5, `init` 4,
  `result` 4, `rate_limit_event` 2 — against only 11 `assistant_text`. A first-run
  Pod fills its Matriarch lane with hook plumbing before the model says anything.
  **Default the transcript to the conversation** — assistant text, user messages,
  tool use and results, permissions — and put the rest behind a toggle.
  Note this is a *render filter*, not a routing or storage change: the events are
  correctly captured and spec 5.2 requires every `EventType` to remain
  renderable, including `malformed`. Hiding must stay reversible in the UI, never
  a silent drop.

- **The Pod tab's `x` stops a Pod but can never remove one.** For an already
  stopped Pod, `x` should open a confirmation offering to delete the Pod **and,
  optionally, its Claude Code session** on disk. `deletePod` already exists in the
  frozen contract (`renderer-state.ts:413`) and in the state layer
  (`store.ts:509-512`) with **no component caller anywhere** — this closes the
  gap sub-session 2 recorded as "`podDelete` … never invoked by any affordance at
  all". *That item can be struck once this ships.*
  **Constraint for whoever builds it:** deleting the CC session means removing a
  directory under `~/.claude/projects/`, which is Beachcomber's territory. It must
  go through the single injected `TrashItem` port, not a new deletion primitive —
  the "one deletion capability in the whole application" invariant is asserted by
  a source scan and is worth keeping.

- **Pinning should read as an icon, and unpin belongs on the pinned pane.**
  Today the control lives only on the left-hand rail row. Make it a pin/unpin
  icon reflecting current state, and put an unpin affordance on the right-hand
  pinned pane itself — that is where a user looks to dismiss it. Keeping it in
  both places is fine and faster; the pinned pane is the one that must not be
  missing it.

- **Finished sub-agent lanes stay in the rail with no way to clear them.**
  A test session's two Calves were killed by the parent and are correctly
  recorded — both `status: 'done'` with real `ended_at` stamps — so the lifecycle
  is right; the rail simply never clears them. Wanted: clear or collapse finished
  lanes.
  **Decide where it happens.** `LaneChangedPush` replaces the rail wholesale, so
  omitting done lanes from the snapshot removes them everywhere, including from
  history the user may still want to read. A renderer-side filter or collapse
  keeps the lane reachable while getting it out of the way. The second is almost
  certainly right, but it is a real fork and should be chosen deliberately rather
  than discovered.

### Pane model: pin the Matriarch always, and let one Calf pane follow selection

Raised from using the app, 2026-08-20. **Design question, not a defect** — the
current model works as specified. Decide it before, or together with, the pinning
refinement above, because that item's "where does unpin live" question has a
different answer under this model.

**Today.** `selectedLaneId` and `pinnedLaneId` are both `LaneId | null`, either
can hold any lane, at most one lane is pinned, and the pair carries an invariant
that they are never equal (`renderer-state.ts:194-203`). Pinning the lane that is
already selected therefore cannot mean "show it twice", so it means **swap**: the
previously selected lane becomes the pinned one (`:459-469`). Two panes maximum,
either able to hold the Matriarch or a Calf.

**Proposed.** The Matriarch is *always* the primary pane and is never pinnable,
un-selectable-away, or displaceable. Calves get a single toggleable pane beside
it: clicking a Calf in the rail updates that pane rather than pinning that
specific lane, and an unpin control on the pane itself closes it. In multiplexer
terms, one fixed orchestrator view plus one follower view you steer with the rail.

**What it removes, which is the main argument for it.** Two nullable lane ids
become one lane id plus a boolean. The `pinnedLaneId !== selectedLaneId`
invariant disappears, and with it the swap-on-pin rules — the subtlest behaviour
in the workspace and the one hardest to predict while actually using it. Clicking
a Calf would do one thing, always.

**What it strengthens.** The composer is bound to the Pod and Calf lanes are
read-only (spec 5.2, items 11 and 13), so the Matriarch is the only lane you can
ever type into. Keeping it permanently on screen puts the thing you type into
beside the thing you are reading. It also makes Steer legible: prefilling a
message addressed to the Matriarch reads very differently when the Matriarch is
visibly right there.

**What it costs, and this is the trade to make deliberately.** Today you can put
Calf A in one pane and Calf B in the other and compare two workers side by side.
Reserving pane one for the Matriarch removes that. Whether anyone wants it is the
question — for watching one orchestrator drive one worker it is no loss, and for
diffing two parallel sub-agents it is the whole feature.

**Blast radius.** `WorkspaceLayoutProps`' `primary` / `split` slots survive
unchanged — what changes is which lane feeds which slot. The state contract does
change: `pinnedLaneId` collapses to a boolean and the swap rules in
`WorkspaceActions` are deleted, so `renderer-state.ts` needs an amendment and the
lane-rail and shell tests that assert the swap behaviour will need rewriting
rather than extending. The Matriarch's pin control disappears entirely.

**Research round completed 2026-08-20.** Full findings, with citations, are in
`.dir-sdlc/sessions/2026-08-20-orcastrate-workspace-refinement/resolved-unknowns.md`.
Headline: the *behaviour* is well supported — four Anthropic surfaces converge on
one-orchestrator-plus-one-viewed-worker, and the swap rule has no prior art
anywhere in the survey — but the proposed *state shape* is not. `pinnedLaneId`
collapsing to a `boolean` forecloses more than one Calf and would force a second
contract amendment and a second round of test rewrites. Adopt
`primaryLaneId: LaneId` plus `followerLaneIds: readonly LaneId[]` instead: the
invariant becomes ordinary list uniqueness, today's model becomes two assertions
rather than a different shape, and growing to N Calves is a cap change. The
decision itself is still open and belongs to sub-session B's Gate 2.

## 2026-08-20 — 2026-08-20-orcastrate-pod-lifecycle

Advisory findings promoted from that session's reviews because they outlive it.
The other 19 stay in
`.dir-sdlc/sessions/2026-08-20-orcastrate-pod-lifecycle/reviews/T0.md`–`T6.md`.
Deferred at Gate 3 by explicit user decision; the rest were left in the review
files rather than promoted.

### Correctness risks

- **`_UncoveredAtSchemaHead` for `PermissionMode` is still the inert spelling.**
  `src/main/store/schema.ts:210-212`. T0 proved by experiment that the
  empty-array-literal form of this guard **never fires** — an empty array literal
  is assignable to any array type — and replaced it for `PodStatus` with a
  generic-constraint spelling (`_AssertNever<T extends never>`) that was verified
  to error on a sixth member. The `PermissionMode` guard one enum over was left
  alone because it was outside T0's criteria. A fifth `PermissionMode` would
  therefore not break the build the way a sixth `PodStatus` now does; it would
  fail as a runtime CHECK violation on a user's machine instead. The fix is a
  one-line change to a spelling that is already validated in the same file.
  Note the same weakness applies to the pre-existing `_UncoveredPodStatus` guard
  at `schema.ts:65-78`, which T0 kept but documented as not-to-be-relied-on.

### Contract gaps

- **The frozen contract names a suppression mechanism that is not the one that
  shipped.** `contracts/pod-lifecycle.ts` section 7 half A states that `stop()`'s
  trailing `#setStatus('idle')` is suppressed on the failed-start path "by the
  runner's own beached latch (`pod-runner.ts:424`)". The runner is **not** beached
  on that path; suppression comes from `#setStatus`'s equality guard, and on the
  manager side from the `session.disposed` handler guard. Same observable
  outcome, different cause. This was caught mid-session and relayed to T2 before
  it coded against the false premise — T2's mutation testing then confirmed the
  correction, because removing the `session.disposed` guard let a parting
  `'idle'` overwrite `'beached'`, which the beached latch would have prevented if
  it had existed. A consumer reasoning from that sentence would reach the wrong
  conclusion about why the race is closed.
- **A stated test-directory rule is now false about a file in that directory.**
  `src/renderer/src/transcript/startup-reconciliation.test.tsx`'s header states
  that the renderer may not import main and that `hygiene.test.ts` holds that
  line. `src/renderer/src/__tests__/relaunch.e2e.test.tsx:66-67` imports
  `src/main/pod-manager` and `src/main/store` — deliberately, because its
  criterion required driving the real `reconcileStartup()` before mount, and that
  is what makes the suite non-tautological. It passes every rule `hygiene.test.ts`
  actually enforces (relative specifiers are exempt at `:387`) and compiles under
  the web project. So the rule as enforced and the rule as stated disagree.
  T6 raised three ranked options: widen `hygiene.test.ts` to state the real rule
  with a named exception (recommended); relocate the world builder, which moves
  the crossing rather than removing it; or accept a renderer-only suite driven by
  a hand-written fake, which reintroduces the tautology the suite exists to avoid.

## Decided for sub-session B — CONSUMED 2026-08-20 (session 2026-08-20-orcastrate-workspace-refinement)

All shipped. Kept for provenance; not pending work.

Settled 2026-08-20 by explicit user decision. These are requirements the
workspace-refinement session must account for, in the sense sub-session 1's
"Decided for sub-session 2" section was.

- **Decide whether `Open` and `Reconnect` still earn separate existence.**
  Since `2026-08-20-orcastrate-open-resumes`, `openPod` and `reconnectPod` make
  the **identical call** — both `#start(pod, true)` — for any Pod with **no live
  session**. `#dispose` early-returns when `#sessions` holds no entry, so
  Reconnect's extra step is a no-op there. They differ only against a *live*
  session: `openPod` returns the Pod untouched and dedupes concurrent opens via
  `#opening`, while `reconnectPod` always disposes and rebuilds the runner.

  **Wider than first framed.** The collapse is not limited to `'closed'` Pods —
  it covers a `'beached'` one too. `PodsChrome.tsx`'s comment asserts that "a
  beached Pod … answers `pods.open` with an error", but a review of that Small
  session grepped `src/main/ipc/` and found **no guard anywhere in main refusing
  `pods.open` on a beached Pod**. The beached→Reconnect routing is a
  renderer-side convention, not an enforced rule, and that comment is currently
  false. Either the guard should exist or the comment should go.

  **Why this belongs to sub-session B specifically.** `PodsChrome`'s
  `showRunControl` and its verb choice are the same surface that B's pinning
  refinement and its Pod-delete affordance both modify, and this backlog already
  records `podReconnect` as one of four invoke channels with no affordance
  calling it. Deciding the verb question separately would mean touching that one
  component three times.

  **Constraint on any answer.** A beached Pod must keep an affordance that
  carries its cause — design §8 — so collapsing the two verbs must not lose the
  distinction between "stopped deliberately" and "stopped with a reason".

- **Decide whether creating a Pod must also start it.** Raised by the user from
  using the app on 2026-08-20: "I currently can't create a Pod without it
  starting." That is deliberate today and documented at
  `src/renderer/src/state/store.ts:473-476` — *"Creates the Pod row AND opens its
  process."* `createPod` invokes `pods.create` and then `pods.open` in one action.

  It is worth revisiting now rather than earlier because the ground moved: a Pod
  is born `'closed'` since `2026-08-20-orcastrate-pod-lifecycle`
  (`sqlite-event-store.ts:175`), the tab renders a working `Open` control for a
  closed Pod, and reopening resumes since `2026-08-20-orcastrate-open-resumes`.
  So "create without starting" is now a coherent state the UI already knows how
  to display and recover from, which it was not when the auto-open was written.

  **What it costs to change.** Creating a Pod spawns a real Claude Code process
  with real token cost, so a user who wants to set up several Pods and start them
  deliberately currently cannot. Against that: the New Pod dialog's error
  handling folds create-failure and open-failure into one path
  (`store.ts:461-481`), and splitting them means deciding what the dialog says
  when the row is created but the process is not — which is the same surface as
  the run-control verb question above, and another reason to decide the two
  together.

## 2026-08-20 — 2026-08-20-orcastrate-open-resumes (Small)

Advisory findings the user chose to carry forward at that session's Gate 3. Small
writes no `reviews/` file, so this is their only durable record; the other two
advisories were left in the session thread.

### Correctness risks

- **The `RESUME_FAILED` regex matches the bare word `resume` anywhere in the
  CLI's message.** `src/main/pod/errors.ts:63`. Pre-existing and deliberately
  broad per its own comment, but that breadth **became load-bearing on the common
  path** the moment `openPod` started resuming: it is now the discriminator
  deciding whether a failed start becomes a silent fresh session or a surfaced,
  beached error. A genuine spawn failure whose message happens to contain the
  word "resume" would be misread as a rejected resume and answered with a new
  conversation. Narrowing it to the CLI's actual session-rejection wording, with
  a fixture proving a spawn failure containing the word still beaches, is the fix.

- **The abandoned `ccSessionId` persists through the fallback.** On the
  fallback path the Pod row keeps the rejected session id until the fresh runner
  emits `onSessionId`. An app killed inside that window resumes the dead id on
  the next Open and writes a second `resume_fallback` notice. Bounded — each open
  still performs exactly one retry, and the SDK emits its id at `system/init`, so
  the window is small — but clearing or replacing the id at fallback time would
  close it.

### Contract gaps

- **Design §4.4 still makes an absolute claim its own §8 now contradicts.**
  `docs/superpowers/specs/2026-08-18-orcastrate-design.md:236-238` says a resume
  mismatch "degrades to 'CC remembers more than the UI shows', **never to data
  loss**", while the failure row added at `:390` states that the resume fallback
  is precisely the case where CC remembers *less* than the UI shows. The §8 row
  is correct and carries the exception; the §4.4 sentence needs a cross-reference
  so the two stop disagreeing. This is the same class of defect this session and
  the last one each hit once — prose that is no longer true of shipped code.

## 2026-08-20 — 2026-08-20-orcastrate-workspace-refinement

All seven items of "Decided for sub-session B" and the first-run UX refinements
shipped. Four advisory findings promoted here by explicit user decision at Gate 3;
the other 28 stay in that session's `reviews/T0.md`–`T5.md`.

### Correctness risks

- **The `startup_reconciliation` marker is duplicated into the renderer and pinned
  to nothing.** `src/renderer/src/transcript/transcript-filter.ts` copies the
  literal from `src/main/pod-manager/startup-reconciliation.ts:28`. Not importing
  it is justified — `tsconfig.web.json` includes only `src/renderer/src/**` and
  `src/shared/**`, so importing the producer would pull main-process code into the
  renderer program — but the test that claims to pin the copy **compares it to a
  hard-coded literal and to a fixture whose payload is also hard-coded**. Nothing
  in the chain reads the producer. A rename at the producer leaves all 1731 tests
  green while the reconciliation notice silently returns to being hidden by the
  transcript filter, which is the exact regression the E5 exemption was added to
  prevent. Two cheap closures, neither inside any task's ownership set that
  session: a plain `.ts` test under `tests/` importing both consts and asserting
  equality (`vitest.config.ts` already includes `tests/**`, `tsconfig.node.json`
  already includes `tests/**`, and `transcript-filter.ts` imports only types from
  `@shared` so it needs no DOM lib), or move the literal into `src/shared/`, which
  both programs already include.
  **Same class, one level milder:** `STARTUP_RECONCILIATION_REASON` now exists in
  three places — `startup-reconciliation.ts:32`,
  `transcript/startup-reconciliation.test.tsx:39`, `transcript/test-fixtures.ts:131`.

- **`PodManager.closePod` against an already-closed Pod is exercised nowhere in the
  repository.** `relaunch.e2e.test.tsx` test 1 was the only site; T5 reshaped it
  correctly, because the affordance it drove no longer exists — a stopped Pod has
  no stop control, and its `x` is now the delete control. The user-reachable path
  is fully covered (T5 verified `closePod` is still driven through the real
  `PodManager` from the Pod that genuinely has a session), but the already-closed
  call itself is not, and no `src/main` test names `closePod`. A main-side gap,
  outside any renderer task's ownership.

### Contract gaps

- **`contracts/transcript-filter.ts` §1's type annotation makes its own
  exhaustiveness guard vacuous.** Annotating each event-type set
  `readonly EventType[]` widens `(typeof X)[number]` to `EventType`, so `Exclude`
  collapses to `never` and the guard can never fire. **Proved by compiler probe,
  not argued:** the contract's spelling with a thirteenth uncovered union member
  exits 0 with no error; the shipped `as const satisfies` spelling errors TS2344 on
  the identical input. The contract's §1 and its own PLUMBING docblock — "A
  thirteenth `EventType` must break `typecheck:web` here" — contradict each other.
  T3 worked around it correctly and the shipped guard does fire, but the frozen
  contract still says the wrong thing. This is the third time this project has hit
  prose that is no longer true of shipped code.
  **Two corrections to this backlog's own earlier citation, from the same probe:**
  the inert empty-array guard form is at `src/main/store/schema.ts:209-210`, not
  `210-212`; and `schema.ts:221` records a second guard there as "SPELLED
  DIFFERENTLY … ON PURPOSE", so that file's guards are **not uniformly inert** —
  the `_UncoveredAtSchemaHead` item must name which one it means.

### UX refinements

- **Move `use-dialog-focus.ts` from `beachcomber/` to `shell/`, and use it in all
  three dialogs.** It already implements focus-on-open, focus-trapping and
  conditional focus-return. `DeletePodDialog` wants all three and `NewPodDialog`
  has none of them; T4 correctly neither imported across the feature boundary nor
  duplicated the hook, matching `NewPodDialog`'s existing level instead. `shell/`
  is where `a11y.module.css` and `contract-runtime.ts` already live. Needs an owner
  for `shell/**` and `beachcomber/**`, which sub-session B's manifest had not.

### Struck by this session

- **"`podDelete` and `podReconnect` are invoke channels with no affordance calling
  them."** Falsified. Both now have exactly one caller each —
  `PodsChrome.handleConfirmDelete` and the beached Pod's run control — and
  `failure-paths.e2e.test.tsx` drives each from a rendered control and asserts it.
  The standing claim of four unreachable channels is down to two:
  `podUpdate` and `podSetPermissionMode`.

## 2026-08-21 — 2026-08-21-orcastrate-transcript-readability

Raised by the user's hand-run of sub-session B on 2026-08-21 — the first time B's
code met a real window and a real CLI. All four findings shipped. Four advisory
findings promoted here by explicit user decision at Gate 3; the other 26 stay in
that session's `reviews/T1.md`–`T4.md`.

### Correctness risks

- **A vacuous assertion shipped in `tests/unit/ipc/user-prompt.test.ts`.**
  `expect(withSend).toEqual([typed, ...baseline])` is **vacuously satisfiable for
  any fixture whose replay ingests nothing** — both sides collapse to `[typed]`.
  Only `01-parallel-dispatch` carries a hard positive row-count guard. This is the
  one open vacuity in this session's own code, and it guards the criterion that
  proves a Calf's opening prompt is never deleted by the echo filter — the exact
  regression the five-condition rule exists to prevent. **The fix is one line:**
  `expect(baseline.length).toBeGreaterThan(0)` for the fixtures known to carry Calf
  prompts. It cannot be blanket — `04-orphaned-calf` legitimately replays zero.

- **The new control-byte hygiene rule scans `src/` only.** `tests/` and `probe/` at
  the repository root are source and carry the same exposure. The rule's own
  docblock argues against scoping to where the last incident happened, which is
  precisely what `src/` does one level up. `tests/router/hygiene.test.ts` is the
  natural second home. Context: this rule exists because a scripted edit in that
  session wrote a **literal `0x08` byte** into a source file where the regex still
  behaved correctly, every test stayed green, and **nothing in the suite could have
  flagged it** — only `od -c` revealed it. It is the one failure mode this project
  has found that no test-level detector could catch, which is why the scan's reach
  matters.

- **The retired-id rule's exemption self-check proves presence, not purpose.** It
  requires `src/renderer/src/lanes/LaneRail.test.tsx` to still carry the
  `lane-row-pin` literal in code, so the exemption cannot silently outlive the file.
  But it would be satisfied by `const dead = 'lane-row-pin'` after someone deleted
  the actual `expect(screen.queryAllByTestId('lane-row-pin')).toHaveLength(0)` proof.
  Asserting the surrounding call shape would close it. Low likelihood, cheap fix —
  and it is the guard on the E1 ratification, which is the one place in the tree
  that deliberately keeps a deleted identifier.

### Cosmetics

- **`src/renderer/src/contracts/renderer-state.ts:296-302` contradicts its own
  neighbour on one screen.** The `inPrimaryPane` docblock still opens "**The four
  fields below** REPLACE the deleted `selected` and `pinned`" — **three** remain
  since `canPin` was deleted — and it now sits immediately beneath the relocated
  interface note reading "A FIELD WAS DELETED FROM THIS INTERFACE". One word:
  "four" → "three". **Fourth instance in this project of prose that is no longer
  true of the code**, after the beached-Pod comment, the `hygiene.test.ts` import
  rule, and the `transcript-filter.ts` §1 annotation.

### Struck by this session

- **"The user's typed prompt never appears in the transcript."** Fixed. `send()`
  now appends a `user_message` to the Matriarch lane before the runner can reply,
  with a five-condition echo filter whose every bound fails toward over-showing —
  because the recorded corpus proved the hazard is **over-suppression**, not
  doubling: every `user` text block in all six fixtures carries a non-null
  `parent_tool_use_id` and is a **Calf opening prompt**, two of them with identical
  text to each other.

## 2026-08-21 — second hand-run findings — CLEARED 2026-08-26 (session 2026-08-25-orcastrate-pod-status-and-chrome)

All seven shipped. Kept for provenance; **not pending work**. What that session
deferred, and the two defects it found while proving its own fix, are in the
2026-08-26 block at the end of this file.

### Original heading: 2026-08-21 — second hand-run findings (no session; observed directly)

The transcript-readability session was driven by hand on 2026-08-21, immediately
after it merged. The user's verdict on the shipped work: *"Chat behavior and
general UX looks much better. A very polished experience so far."* Everything
below is a nit or a defect found in that run, recorded for a fresh session.

Two of these have mechanisms already traced — do not re-derive them.

### Defects

- **A stopped Pod still reads "Running" with a ticking duration. There is no idle
  status to replace it with.** *Mechanism confirmed by inspection, 2026-08-21.*
  `PodManager.closePod` (`src/main/pod-manager/pod-manager.ts:478-488`) writes
  `status: 'closed'` to the **Pod** and pushes `podStatus`, but **never ends the
  Matriarch lane**. So `lane.endedAt` stays `null`, and `elapsedMsOf`
  (`src/renderer/src/state/workspace-provider.tsx:252-258`) falls back to `nowMs`
  for any lane with a null `endedAt` — the duration keeps counting up and the row
  keeps reading `running`.
  **The deeper half:** `LaneStatus` is `'running' | 'done' | 'orphaned'`
  (`src/shared/contracts/events.ts:101`). There is **no member meaning "the Pod
  that owns me was stopped deliberately"**, which is exactly the gap the user
  described as "no idle status replacement". `'done'` means the lane finished its
  own work and `'orphaned'` means it was found open at startup with no runner —
  neither is true here. **Adding a member to `LaneStatus` is a schema change with a
  CHECK constraint behind it**, so this is not a renderer-only fix; see the
  `_UncoveredAtSchemaHead` item below, which governs the guard on that enum.
  **Same shape as the relaunch-stranding defect** fixed in
  `2026-08-20-orcastrate-pod-lifecycle`: lane state not reconciled against Pod
  state. That one was found by hand too.
  **Cross-reference:** the `closePod` coverage gap promoted at that session's Gate
  3 — `PodManager.closePod` against an already-closed Pod is exercised nowhere in
  the repository — sits on this same verb. Whoever takes this item should close
  both together.

- **No visual indication that Claude Code is thinking or working.** The user:
  *"the only way that I can tell the session isn't stalled is if something visual
  like a new subagent spawning occurs."*
  **This is partly self-inflicted by `2026-08-21-orcastrate-transcript-readability`,
  and that must be stated plainly.** `thinking` is a member of
  `PLUMBING_EVENT_TYPES` (`src/renderer/src/transcript/transcript-filter.ts`), so
  it is **hidden by default** since that session. The conversation-by-default
  filter was the right call for the 53-of-109-events noise problem it was built
  for, but `thinking` was the one plumbing type that carried *liveness*, and
  hiding it removed the only in-transcript signal that work is happening.
  **Do not fix this by moving `thinking` back to `CONVERSATION`** — that
  reintroduces the noise the filter exists to remove, and thinking blocks are long.
  The wanted thing is a **status affordance**, not a transcript row: emulate Claude
  Code's own in-progress indicators. Note the lane rail already receives everything
  needed to drive one — `LaneRow` has `status`, `elapsedMs` and `unreadEventCount`,
  and deliberately holds **no timer and no clock** (`LaneRow.tsx:30`), with
  `elapsedMs` arriving pre-computed on the view model. Any animated indicator must
  respect that property or it will re-render every finished row forever.

### UX refinements — Pod tab chrome

These four are one surface and should be one task; they are all
`src/renderer/src/pods/PodTab.tsx` and `PodBar.module.css`.

- **Colour the run and stop controls.** Play/open green, pause/stop yellow. The
  delete control is already red. **Constraint, and it is a real one:** colour must
  remain a redundant carrier, never the only one. `T4`'s criterion 3 in the
  transcript-readability session asserts each control by **accessible name**, never
  by class or computed style, and that assertion must keep passing — it is what
  makes these affordances work for someone who cannot see the colour. Use existing
  `--oc-*` tokens; `renderer-theme.ts` has no green or yellow today, so this likely
  needs new tokens, which is a contract change.
- **Icon sizes disagree.** The play/pause glyph and the delete `x` render at
  different sizes. They are text glyphs, not SVG — see `PodTab.tsx`.
- **The delete `x` has no padding** between itself, the tab edge, and the
  play/pause control.
- **A running Pod has no trailing padding** to the right of the stop/pause icon.

### UX refinements — highlight extents

- **Lane rail row highlight does not cover the row.** Selecting a lane highlights
  with horizontal padding inset from the row edges, and the `Steer` button on a
  Calf row sits in its own unhighlighted island. Wanted: the **whole** swimlane
  highlights — lighter for Calves, darker for the Matriarch — with `Steer` staying
  darker than the highlight and the highlight extending around it rather than
  stopping at it.
  **Cross-reference, same rows:** an advisory from
  `2026-08-20-orcastrate-workspace-refinement` recorded that `aria-current` is set
  for a row in the primary **or** a follower pane and so does not distinguish them,
  and that `focusedFollower` reaches assistive technology through the row's
  accessible name only. Whoever restyles these rows should read that advisory
  first — the visual and the announced state should agree.

- **Pod tab hover highlights only the name, not the tab.** Wanted: the entire tab
  highlights on hover, for easier target visibility.

### Not a finding

The user confirmed the four items from the first hand-run all read correctly in
use: the user's own prompt now appears, right-aligned; tool calls are compact with
collapsed results; permissions are out of the transcript; the lane-rail pin control
is gone.

## 2026-08-26 — 2026-08-25-orcastrate-pod-status-and-chrome

The seven items in the *second hand-run findings* block above are **cleared** by this
session. What follows is work it deliberately deferred, plus two defects it found
while proving the fix.

### Defects found by this session, not fixed by it

- **A stopped lane's `lane_closed` event is durably written and never reaches the
  renderer.** *Mechanism verified twice — by T7 and independently by the orchestrator,
  2026-08-26.* `PodManager.#stopRunningLanes` appends the events and then pushes only
  `laneChanged` — never `podEvent`. The renderer's backfill short-circuits on
  `hasMore === false`, so the event stays invisible for the life of the session. The
  precedent is in the same file: `#appendResumeFallbackNotice` **does** push
  `podEvent`, and its comment gives the reason — *"without the push the explanation
  would not appear until the transcript was next re-read."* The sweep missed it.
  The fix is one line, `this.#push.podEvent({ podId, events: stored })`, in
  `#stopRunningLanes`.

- **`lane_closed` is PLUMBING, so even once pushed it is hidden in the default
  transcript view.** This falsifies the premise of this session's own T7 criterion 3,
  which asserted `lane_closed` was a CONVERSATION type — it is not
  (`transcript-filter.ts`, `PLUMBING` alongside `thinking`). Criterion 3 was recorded
  **not met** rather than quietly dropped. If the stop should read in words in the
  default view, the shape to use is a **payload-scoped exemption** for `lane_closed`
  with `status: 'stopped'`, following `isStartupReconciliationNotice`, which is narrow
  enough to leave the `_AssertNever` partition guards untouched. **Do not unhide
  `lane_closed` wholesale** — that reintroduces routine lane bookkeeping noise, which
  is what the filter exists to remove.

  These two are one user-visible outcome and should be taken together.

  **CONFIRMED BY HAND 2026-08-26** (third hand-run). The symptom was predicted in
  words before the check and then observed exactly: after stopping a Pod, **the
  transcript is empty — nothing about the stop appears in it at all.** Until now
  both defects had only been traced by reading the source, twice. The user-visible
  outcome is now witnessed, so the pair needs no further diagnosis before a fix —
  only the fix, and a way to prove it that does not depend on reading source.

### Deferred, with the reason

- **The status palette is hue-differentiated throughout; "survives greyscale" is not a
  property any pair of it has.** Escalation E1 re-pinned `--oc-status-stopped` from
  `#8f8577` to `#c0b39d` because the first measured 1.022 against `idle`. But the
  orchestrator's sweep of the whole palette found the shipped worst pair is
  `idle` vs `beached` at **1.005**, with five shipped pairs under 1.2, and the new
  value sits at 1.052 against `waiting`. The re-pin fixed the semantically adjacent
  pair, where confusing two resting states costs something. The systemic question was
  explicitly not settled: a palette-wide lightness pass, and whether the hygiene
  guard should assert measured separation rather than string inequality, which today
  it cannot catch.

- **`LANE_KINDS` and `EVENT_TYPES` are still interpolated live into migration 1** and
  carry the identical latent bug this session pinned `MIGRATION_1_LANE_STATUSES`
  against. Excluded deliberately: pinning them in the same diff would have rewritten
  migration 1's rendered text for a second reason and made any byte-identity failure
  unattributable. `migration-frozen.test.ts` now covers migrations 1-3 generically, so
  it will catch either one the moment those unions widen.

- **`migration-frozen.test.ts` shells out to `git show` at run time.** In a shallow
  clone (`actions/checkout` defaults to `fetch-depth: 1`) or an exported tarball with
  no `.git`, the three cases go **red rather than skipped** — the better failure mode,
  and nothing is broken today since this repo has no CI workflows. If shallow-clone CI
  ever lands, the durable fix is committing the shipped renderings as a fixture.

- **Migration 4's own blob hash must be added to `migration-frozen.test.ts`** once this
  branch merges. Nothing in the file records that obligation — which is exactly the
  omission that made migration 1's pin necessary.

- **`statusToken('stopped')` has no production caller.** Accepted out of scope at
  Gate 2: the rail consumes `--oc-status-*` variables directly, exactly as `orphaned`
  does. The pair was widened to keep the hygiene guard honest. The `statusToken`
  versus CSS-variable split is worth a deliberate look rather than being inherited
  again.

- **Dangling contract pointers in shipped source.** `PodTab.tsx` and `LaneRow.tsx`
  cite `contracts/activity-indicator.ts` and its `POD_TAB_MOUNT` / `LANE_ROW_MOUNT`
  constants, but frozen contracts live in `.dir-sdlc/sessions/<slug>/contracts/` and
  are not part of the source tree. The comments describe the mount shape correctly;
  they will read as a real file to the next person.

### Cosmetic, recorded rather than fixed

- **Hover feedback vanishes on a selected Matriarch.** `.rowMain:hover` uses
  `--oc-bg-hover`, which is now also the selected-Matriarch surface. A selected Calf
  still darkens on hover. If revisited, the fix is a Matriarch-specific hover surface,
  **not** a change to the three selection tokens.
- **`.rowMain:hover` paints only the button box**, so on a highlighted row a hover
  draws an inner rectangle inside the full-width swimlane — the shape the selection
  highlight just removed still exists for hover.
- **`tokens.css` overstates one comparison.** The re-pin comment says the value
  "clears the shipped `closed`/`idle` precedent (2.173)" while naming the semantically
  adjacent pair; `stopped`/`idle` is 1.796, *below* 2.173. Only the `closed`
  comparison clears it. Every number is individually correct; the sentence assembling
  them is not. Same class of defect as the finding that produced E1.
- **`PodBar.module.css`'s header comment is stale** — it says the only bare lengths are
  hairline borders "for which the token set has no entry", but `--oc-border-hairline`
  and `--oc-border-thick` now exist and the same file already uses one.
- **`tokens.css`'s Status block header is stale** — still reads
  `Lane running|done|orphaned`, three members, where this session made it four.
- **`LaneRow.source.test.ts`'s guard is broader than its criterion** — it also bars
  `useState`/`useEffect`/`useRef`, so it will go red on a legitimate future `useRef`
  that schedules nothing.
- **`migration-2.test.ts` still carries its own migration-1 byte-identity test**, now
  fully subsumed by `migration-frozen.test.ts`. Two copies of one guard drift apart.

### Process note, for whoever runs the next session

**A repository-wide `npm test` is not a reliable gate while any task is in flight.**
T8's reviewer saw 8 failures that were a concurrent reviewer mid-write to
`workspace-provider.tsx` for its own red-step probe; a clean re-run on a quiescent
tree passed 2020/2020. Run the full suite when the tree is quiescent, or scope it.

---

## 2026-08-26 — third hand-run findings (no session; observed directly)

The stop flow was driven against a real Electron window immediately after the
`pod-status-and-chrome` session merged — the first end-to-end evidence for any of
the three surfaces that session changed. **Behaviour was clean.** Colours read
accurately, the stopped state reads correctly, and nothing in the flow misbehaved.
Every finding below is visual.

**Two mechanisms were traced before writing, so the next session does not re-derive
them.** Both matter, because one of these items is not the CSS change it looks like.

- **The Pod tab shows TWO adjacent elements, not one.** What reads as "a solid blue
  dot plus a flashing blue dot" is `styles.statusDot` — hue from
  `statusToken(status)` at render time — sitting immediately beside a
  `<WorkingIndicator size="dot">` that is active for `'running'` alone
  (`PodTab.tsx`). The grey outline at rest and the amber on a permission prompt are
  the same single `statusDot` at its `idle`/`closed` and `waiting` hues; the
  indicator is simply absent then. So "make the tab one dot" is a decision about
  **which of two existing elements survives**, not a restyle of one.
- **`WorkingIndicator` renders `null` when inactive, by design and by contract.**
  Its own doc-comment makes that the load-bearing property: "a row whose work has
  finished renders this once — as `null` — and the last lane ending leaves nothing
  ticking." **A resting-state outline is therefore a contract change, not a CSS
  change** — see the third item.

### UX refinements — the indicator set

- **The lane rail should use the dot form, not the bar.** `LaneRow.tsx:129` mounts
  `size="bar"`; the user's read is that a purely dot-based set looks best and that
  the two surfaces should not use two different shapes. This one **is** the one-word
  change it appears to be — `size="dot"` — but `WorkingIndicator.module.css` sizes
  `dot` for a dense surface, so check it against the rail row's height rather than
  assuming it transplants.

- **The Pod tab should carry one dot, not two.** Wanted: the blue dot animated while
  working, and a green outline when the Pod is open but not actively thinking. Note
  the cost before choosing — collapsing the pair means either the `statusDot` itself
  animates while `running` (and `WorkingIndicator` leaves the tab entirely), or the
  indicator replaces the status dot while running, **which drops the status hue for
  exactly the state it is describing**. The first is the shape to prefer; it also
  keeps the contract's "third carrier" rule intact, since the `srOnly` sentence and
  the dot's `data-status` both survive either way.

- **A resting state wants an affordance, and today there is none.** The ask is a
  green outline on the tab when open-but-idle, and on the lane a green outline plus
  a word — `Active` or `Waiting`. **This is the item to be careful with.** It is not
  a tweak to `WorkingIndicator`: making it render something when `active` is false
  falsifies the property quoted above and puts an element back on every finished row
  forever. The two shapes that do not: give the resting affordance to the
  **`statusDot`** (which already renders in every state and already has the hue), or
  add a **separate presentational component** for it. Whichever is chosen, the lane's
  proposed word must come from `LANE_STATUS_LABEL`, not a new literal — `Running`
  and the other three are already the labels that surface there, and `Active` /
  `Waiting` are neither.

### Palette — one collision worth measuring

- **A stopped lane's dot was read as "yellow".** It is `--oc-status-stopped`
  (`#c0b39d`), the warm tan E1 re-pinned it to. `--oc-status-waiting` is `#e6a33c`,
  amber. The two are not adjacent in meaning but were described with the same word
  at dot size, which is the observation the shipped hygiene guard — string
  inequality — cannot make. **Measure `stopped` against `waiting` before the tab and
  the rail both go dot-only**, since shrinking the affordance is the change that
  makes a hue collision matter more. This is the same systemic question the
  `pod-status-and-chrome` block already deferred; treat it as one more data point
  for that pass, not a separate fix.

- **Open question the user raised, not a finding:** whether the tab should read grey
  outline where the lane reads stopped. Worth noting the two are different unions —
  a stopped Pod's `PodStatus` is `'closed'` (`--oc-status-closed`, `#4a5060`) while
  its Matriarch's `LaneStatus` is `'stopped'` (`#c0b39d`). They are *supposed* to
  differ. Decide deliberately whether that difference should be visible at a glance
  or whether the two surfaces should agree.

### Not a finding

- **The behaviour of the stop flow itself.** Reported clean, and no defect was
  observed in it.
