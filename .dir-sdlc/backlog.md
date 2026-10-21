# Backlog

Work deliberately deferred by a DIR session, with the session that deferred it.
Read at session setup; append only at Gate 3.

> ## TRUST STATUS — audited 2026-10-09, read before scoping anything from this file
>
> **Every block in this file has now been verified against the code.** The
> pre-`2026-09-01` blocks were audited bullet by bullet on 2026-10-09; each one
> that was already fixed now carries a `**CLOSED**` note in its own block naming
> the evidence. Scope from the bullets as written — they are current.
>
> What the audit changed, in case a reader remembers the older state:
>
> | Item | Audit verdict |
> |---|---|
> | Pane model — "pin the Matriarch always" | **closed** — adopted exactly as the research round recommended (`primaryLaneId` + `followerLaneIds`) |
> | The three "indicator set" refinements | **closed** — `WorkingIndicator` is deleted; the status dot carries the motion |
> | Four tokens "with no consumer" | **closed** — 22 real `var()` uses. The 2026-10-09 re-check that called them unconsumed grepped the TS identifiers, not the CSS variable names |
> | `closePod` against an already-closed Pod | **closed** — `close-pod-lane-sweep.test.ts:311` |
> | Migration 4's blob hash | **closed** — `it.each([1, 2, 3, 4])` |
> | Dangling `contracts/activity-indicator.ts` pointers | **closed** — no reference remains |
> | `MIGRATION_1` interpolating four live enums | **narrowed to two** — `LANE_KINDS` (`:344`) and `EVENT_TYPES` (`:382`) |
>
> **The structural cause of the staleness is still unfixed.** A DIR session
> appends its deferrals at Gate 3 and records closures in its own block; nothing
> reaches back to the block an item came from. This file has been patched by hand
> four times now (`d9d95cb`, `8ce26fd`, `008da4d`, and this audit). It will
> recur until the DIR skill gains a step for it, or sessions are told explicitly
> to annotate the source block.

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

- **`MIGRATION_1` still interpolates two live enums.** **NARROWED 2026-10-09:**
  three of the original four are now pinned — `MIGRATION_1_POD_STATUSES`,
  `MIGRATION_1_LANE_STATUSES` and `MIGRATION_1_PERMISSION_MODES`. Still live are
  `LANE_KINDS` (`schema.ts:344`) and `EVENT_TYPES` (`schema.ts:382`); see the
  `2026-08-26` block, which deferred exactly this pair deliberately. Original text,
  for the reasoning: interpolates `POD_STATUSES`, `LANE_STATUSES`, `LANE_KINDS`
  and `EVENT_TYPES` into already-shipped DDL, the
  identical latent bug T1 fixed for `PERMISSION_MODES`. Widening any of the four
  silently rewrites history. Partially mitigated: the byte-identity pin now fails
  loudly instead of shipping, but the pin is not a fix. Pinning all five
  per-migration lists in one pass would close the class.
  `src/main/store/schema.ts:141-201`

- **Nine of fifteen invoke channels have no surface that renders their error**,
  and four of those (`podUpdate`, `podDelete`, `podSetPermissionMode`,
  `podReconnect`) are never invoked by any affordance at all. **VERIFIED
  2026-10-09: down to two.** `podDelete` and `podReconnect` have production
  callers; `podUpdate` and `podSetPermissionMode` are referenced only from
  `test-utils/stub-api.ts`. Enforced as an
  executable allowlist in `src/renderer/src/__tests__/failure-paths.e2e.test.tsx`,
  so the set cannot silently grow — but a user currently gets no feedback when any
  of the nine fails. Related: `TranscriptPane.tsx:140-142` has an unreachable
  error branch, because the sole writer of that state always writes `null`, while
  the backfill failure it looks like it covers is silent in `runtime.backfill.error`.

## 2026-08-20 — 2026-08-19-orcastrate-beachcomber-helm

Sub-session 3 shipped Beachcomber and Helm, closing MVP items 6 and 7. Deferred
at its Gate 3 by explicit user decision. Full per-criterion verdicts and each
finding's full text are in that session's `reviews/T1.md`–`T10.md`.

**STATUS: this block is now almost entirely closed.** Four items were closed
2026-09-01 by sub-session C1 (`2026-08-31-orcastrate-helm-draft-safety`, merged
`818b833`); **seven more were closed 2026-09-30 by sub-session C2**
(`2026-09-04-orcastrate-correctness-sweep`, merged `32638b7`). Only the token
work and the test/CI and cosmetic notes below remain. Do not re-scope anything
marked closed.

**CLOSED 2026-09-30 by C2** — the `refused`/`NOT_FOUND` contract contradiction;
the same-millisecond backup overwrite; Pod blocking against a `displayPath`
guess; `acknowledgeOwnWrite` swallowing one genuine external change; the
`HelmNotices.tsx` duplicate sentence (its `toHaveLength(2)` pin is now
`toHaveLength(1)` and the REPORTED DEFECT comment is deleted — that was the
authorised outcome, not a weakened test); `BeachcomberRow.tsx:77`
path-above-caveat; and the leaf error module.

**CLOSED 2026-09-01 by C1:**

- Escalation-derived — *a failed Helm `reload` discards the draft* — **closed**. A failed
  load whose scope equals the previously selected one now keeps `document` and `draft`; a
  failed load for a *different* scope still clears both.
- Contract gaps — *`helm.ts:251` promises a side-by-side that cannot be built* — **closed**.
  `HelmActions.compare()` and `HelmView.incoming`/`comparing` were added and the Helm panel
  renders the side-by-side on the conflict banner.
- Contract gaps — *`helm.ts:208` lists five `field` names* — **closed**. It documents all
  seven; the declared type stays `string` on purpose.
- Correctness risks — *closing the Helm panel discards an unsaved draft* — **closed**, and
  widened: closing **and switching panels** both route through a guard the Helm panel owns.

Everything else in this block is still open. See the `2026-09-01` block at the end of this
file for the eight findings C1 itself produced.

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
- ~~**`font-weight: 600` has no token.**~~ **CLOSED 2026-10-12** by sub-session C3
  (`2026-10-09-orcastrate-theme-contract-decisions`, `10feee6`). The contract gained
  `--oc-weight-semibold: 600` as an additions-only amendment authorised by escalation E1,
  and all ten declarations consume it. **The close went wider than the item:** the
  remaining five bare `font-weight` literals (four `700`, one `400`) were folded in by
  user decision at Gate 2, so **no `*.module.css` under `src/renderer/src` sets
  `font-weight` to a literal anywhere** — a zero-pixel change, since those tokens already
  held exactly those values. That is what let the new hygiene census be the universal rule
  with no exception list rather than one scoped to a single value. Original text:
  The set offers 400/500/700. Fixing it is a
  visual decision, not a mechanical swap — which is why T10 pinned it rather than
  changing it. **Re-measured 2026-10-09: this is wider than first recorded — 10
  occurrences across 5 files** (`lanes/LaneRail.module.css` ×2,
  `pods/DeletePodDialog.module.css` ×2, `pods/NewPodDialog.module.css` ×2,
  `shell/EmptyWorkspace.module.css`, `transcript/Transcript.module.css` ×3), not
  the single file originally named.
- ~~**Four of the nine tokens T4 added have no consumer yet** — `borderThick`,
  `trackingTight`, `weightRegular`, `weightMedium`.~~ **CLOSED — audit 2026-10-09.**
  All four are consumed, across 22 real `var()` declarations:
  `--oc-border-thick` in `Beachcomber`, `BeachcomberPreviewDialog`, `Helm`,
  `LaneRail`, `PodBar` and `PanelBar`; `--oc-tracking-tight` in `Beachcomber` and
  `BeachcomberPreviewDialog`; `--oc-weight-regular` in `Helm`; `--oc-weight-medium`
  in `Beachcomber`, `BeachcomberPreviewDialog`, `Helm` and `PanelBar`.
  **The re-check recorded here earlier the same day was wrong** — it grepped the
  TypeScript identifiers (`borderThick`) rather than the CSS variable names
  (`--oc-border-thick`), which is how stylesheets actually reference them. Noted
  because it is the one audit finding that reversed a *negative* verdict.

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

- ~~**Nothing in this session has run in a real Electron window.**~~ **CLOSED
  2026-10-07** by the Playwright-driven hand-run (`929c613`); see the `2026-10-07`
  block at the end of this file. Original text: coverage is unit
  and jsdom only, as design section 9 specifies — but that decision predates a
  panel that moves files to the recycle bin. T8 states plainly it did not launch
  the app, and the two layout token values are therefore unvalidated, since jsdom
  applies no stylesheet.
- **`tests/unit/store/errors.test.ts` is order-dependent** and fails under
  `--sequence.shuffle`: its "covers all four documented codes" reads a set filled
  by earlier tests in the same file. Pre-existing from sub-session 1; the rest of
  the repo shuffles clean.
- ~~**One T10 pin still fails when the defect it pins is fixed.**~~ **FULLY CLOSED
  2026-10-12** by sub-session C3 (`10feee6`). Both halves are now shut. C3 deleted the
  `EmptyWorkspace.module.css: font-weight: 600` entry from
  `PRE_TOKEN_SHELL_DECLARATIONS`, leaving its five border entries, and **the pin fired
  exactly as predicted**: the implementer converted the stylesheet before editing the
  list and observed `expected [ …(5) ] to deeply equal [ …(6) ]` at the assertion. The
  exception list shrank under review rather than outliving the problem, which is what it
  was built to do. **NARROWED 2026-10-09:** the `HelmNotices` `toHaveLength(2)` half is
  **closed** — C2 fixed the duplicate sentence and the pin now reads `toHaveLength(1)`.
  Original text: `PRE_TOKEN_SHELL_DECLARATIONS` is still live, and has **moved** out of
  `failure-paths.e2e.test.tsx` into `src/renderer/src/__tests__/hygiene.test.ts:628`,
  asserted at `:710`. Whoever does the font-weight token work edits it there.
  (Those line numbers were already stale by the time C3 read them — the declaration was
  at `:631` and the assertion at `:713`. Re-grep, always.)
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

- ~~`src/renderer/src/test-utils/stub-api.ts:154` — fixture docblock claims the
  default scan carries "an empty root".~~ **CLOSED — audit 2026-10-09.** The phrase
  is gone from the file.
- ~~`src/renderer/src/helm/probes.ts:8-11` — header says `HelmPanel.test.tsx` runs
  the probes against the real panel.~~ **CLOSED — audit 2026-10-09.** The header now
  names both arms correctly, and `HelmPanel.test.tsx` does reference the probes.
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

### Pane model: pin the Matriarch always — CLOSED, ADOPTED (audit 2026-10-09)

**This decision was taken and shipped, and nobody wrote it down here.**
`src/renderer/src/contracts/renderer-state.ts` now declares
`primaryLaneId: LaneId | null` (`:234`) and `followerLaneIds: readonly LaneId[]`
(`:253`) — the state shape the research round below recommended, **not** the
`boolean` the original proposal asked for. `selectedLaneId` and `pinnedLaneId` are
both deleted, and the invariants are the ordinary list rules the research round
predicted (`:244-246`). `LaneRowVm` carries `inPrimaryPane` / `inFollowerPane` /
`focusedFollower` in place of `selected` / `pinned`.

Everything below is kept for provenance — it is the reasoning that produced the
shipped shape. **Not pending work.**

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
  **VERIFIED STILL OPEN — audit 2026-10-09.** Current citation is
  `schema.ts:256-257`; the surrounding docblock at `:250-254` claims "the build
  breaks here", which is the false sentence. The validated spelling is one screen
  down at `:275-277` (`_AssertNever`) and again at `:312`. **One new sub-finding
  from the audit:** that guard measures `PermissionMode` against
  `MIGRATION_2_PERMISSION_MODES` while the schema head is now migration 3
  (`MIGRATION_3_PERMISSION_MODES`, `:226`), and its docblock still calls migration 2
  the head. Benign today — the two lists are verbatim identical — but the guard
  should name the head it means, and pod status and lane status both already do
  (`MIGRATION_3_POD_STATUSES`, `MIGRATION_4_LANE_STATUSES`). Fixing the spelling
  and the target is one edit.

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

- ~~**`PodManager.closePod` against an already-closed Pod is exercised nowhere in the
  repository.**~~ **CLOSED — audit 2026-10-09.** Covered by
  `tests/unit/pod-manager/close-pod-lane-sweep.test.ts:311`, "criterion 5: a second
  `closePod` against an already-closed Pod", added by the
  `2026-08-26-orcastrate-stop-transcript-visibility` session. Original text: `relaunch.e2e.test.tsx` test 1 was the only site; T5 reshaped it
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

- ~~**A stopped lane's `lane_closed` event is durably written and never reaches the
  renderer.**~~ **CLOSED 2026-08-26** (`f7008ae`), together with the PLUMBING item
  below — the two were one outcome and were fixed as one. See the
  `2026-08-26-orcastrate-stop-transcript-visibility` block. Original text:
  *Mechanism verified twice — by T7 and independently by the orchestrator,
  2026-08-26.* `PodManager.#stopRunningLanes` appends the events and then pushes only
  `laneChanged` — never `podEvent`. The renderer's backfill short-circuits on
  `hasMore === false`, so the event stays invisible for the life of the session. The
  precedent is in the same file: `#appendResumeFallbackNotice` **does** push
  `podEvent`, and its comment gives the reason — *"without the push the explanation
  would not appear until the transcript was next re-read."* The sweep missed it.
  The fix is one line, `this.#push.podEvent({ podId, events: stored })`, in
  `#stopRunningLanes`.

- ~~**`lane_closed` is PLUMBING, so even once pushed it is hidden in the default
  transcript view.**~~ **CLOSED 2026-08-26** (`f7008ae`) by exactly the
  payload-scoped exemption this bullet prescribes. Original text: This falsifies the premise of this session's own T7 criterion 3,
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

- ~~**Migration 4's own blob hash must be added to `migration-frozen.test.ts`** once this
  branch merges.~~ **CLOSED — audit 2026-10-09.** `SHIPPED_BLOB` carries migration 4
  and the suite runs `it.each([1, 2, 3, 4])`. Original text: nothing in the file
  records that obligation — which is exactly the
  omission that made migration 1's pin necessary.

- ~~**`statusToken('stopped')` has no production caller.**~~ **STALE — audit
  2026-10-09.** `statusToken` is called from `lanes/LaneRow.tsx:154` and
  `pods/PodTab.tsx:173`. The `statusToken`-versus-CSS-variable split is still worth a
  deliberate look, which is the half of this bullet that survives. Original text:
  accepted out of scope at
  Gate 2: the rail consumes `--oc-status-*` variables directly, exactly as `orphaned`
  does. The pair was widened to keep the hygiene guard honest. The `statusToken`
  versus CSS-variable split is worth a deliberate look rather than being inherited
  again.

- ~~**Dangling contract pointers in shipped source.**~~ **CLOSED — audit 2026-10-09.**
  No reference to `contracts/activity-indicator.ts`, `POD_TAB_MOUNT` or
  `LANE_ROW_MOUNT` remains anywhere under `src/`; the
  `2026-08-27-orcastrate-indicator-collapse` session removed them with the module.
  Original text: `PodTab.tsx` and `LaneRow.tsx`
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

### UX refinements — the indicator set — CLOSED 2026-08-27 (audit 2026-10-09)

**All three shipped, via the `2026-08-27-orcastrate-indicator-collapse` session,
and none of them was marked here.** `WorkingIndicator` and the whole
`src/renderer/src/activity/` directory are **deleted** — its `raw.d.ts` was
re-homed to `styles/raw.d.ts` and its source test to `pods/PodTab.source.test.ts`,
each carrying a header that records the move. The status dot carries the motion
now, which is the first of the two shapes the second bullet below says to prefer,
and it is also the shape the third bullet says is the safe home for a resting
affordance. Kept for provenance; **not pending work.**

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

---

## 2026-08-26 — 2026-08-26-orcastrate-stop-transcript-visibility

The transcript-visibility defect pair is **fixed and merged** (`f7008ae`). A stop now
puts `Lane closed` / `Stopped` in the default transcript, proven by a joined jsdom
test that fails if either half is disabled. Post-merge on a quiescent tree:
`npm run typecheck` clean both projects, `npm test` 2027/2027.

### Contract gaps

- **A frozen contract from the previous session carries a now-falsified claim.**
  `.dir-sdlc/sessions/2026-08-25-orcastrate-pod-status-and-chrome/contracts/lane-stopped-status.ts:77`
  states a stopped lane "is visible in the default transcript with no filter change".
  It was false when written — that is the defect this session fixed — and it is now
  false in a second way, because visibility today depends on the payload-scoped
  exemption the claim says is unnecessary. Frozen contracts are not edited, and it is
  not this session's file, but it is live misinformation for anyone reading that
  session's artifacts.
- **A manifest criterion's mechanical gloss over-reached the region it paraphrased.**
  T2's acceptance criterion 2 forbade any hunk touching `transcript-filter.ts:38-164`,
  while criterion 5(d) mandated an edit to the `PLUMBING_EVENT_TYPES` docblock at
  base lines 81–96 — inside that range. The frozen contract itself was consistent:
  `contracts/stop-notice-visibility.ts` §2 freezes `136-164` plus named identifiers,
  and §3(d) assigns the docblock edit. **Only the criterion's paraphrase was wrong**,
  by roughly a hundred lines. Recorded so no later reader adopts `38-164` as the
  frozen region and re-derives the same false conflict. This is the project's
  recurring pattern #2 — a criterion stated as a mechanical grep whose letter and
  purpose pull apart — and it cost one escalation.

### Correctness risks

- **`close-pod-lane-sweep.test.ts` had complete push-channel coverage for
  `laneChanged` and `podStatus` and none for `podEvent`.** That absence is what let
  this defect ship green. T1 closed it for this verb; the general shape — *every push
  channel a method touches is counted* — is enforced nowhere.
- **`recordAttempts`' Proxy trap forwards exactly one argument**
  (`tests/unit/pod-manager/helpers.ts:245-248`). Correct today, since every `Pushes`
  method takes one; it would silently drop a second parameter if one were added. A
  rest-args forward removes the trap at no cost. The same trap returns a fresh
  closure per property access, so `push.podEvent !== push.podEvent` — inert now, a
  hazard for any future `vi.spyOn` on a harness push method.
- **`pod-manager.ts` carries two textually identical
  `this.#push.podEvent({ podId, events: stored });` statements** (lines 567 and 755).
  A pattern-based injection hits both and over-disables; line-targeted editing is
  required. Worth knowing for whoever runs the stop demonstration next.
- **The `KEPT_POD` *rendered* assertion in `pod-stop.e2e.test.tsx` is near-vacuous
  alone** — with the inert runner the kept Pod's conversation-mode transcript
  plausibly renders zero rows of any kind, so an empty lane-closed list would hold on
  a build that rendered nothing. The criterion is met because the durable-side
  assertion beside it is falsifiable. Making the rendered half carry weight needs a
  positive control row in the kept pane.

### Test and CI concerns

- **The contract-operation coverage search returns `not called` for every operation
  in a defect-fix session, and that is a false alarm by construction.** The rule
  searches the session's *touched* files, then discards the definition site, same-task
  files, and test files. A session that changes six production lines and adds tests
  around them has all its consumers in untouched pre-existing code, so nothing can
  survive. Reachability had to be established separately and recorded by hand — see
  `coverage.md`'s closing note. The check is not wrong, but its output needs reading
  with the session's shape in mind, and a reader who takes the column at face value
  concludes eight operations are dead.

### Process note

**A DIR worktree placed as a SIBLING of the repository breaks every documented test
command.** `dir-git` created this session's worktree at
`Repos\orcastrate-worktrees\<slug>`, whose ancestors are `orcastrate-worktrees\` and
`Repos\` — never `Repos\orcastrate\`. So `node <main>/node_modules/vitest/vitest.mjs`
fails at startup with `Cannot find module 'vitest/config'`, and **all four
implementers plus three reviewers independently hit it and independently built scratch
configs to work around it.** What works:

- **node-env suites** — `NODE_PATH=<main>/node_modules` prefixed to the same command.
- **jsdom/JSX suites** — `NODE_PATH` is *not* sufficient; Vite does not honour it for
  bare specifiers, so JSX fails on `react/jsx-dev-runtime`. Needs a scratch vitest
  config mirroring the worktree's own, with generated `resolve.alias` entries mapping
  every package in the main repo's `node_modules` — **and** `NODE_PATH` still set,
  because the config file itself sits outside any `node_modules` ancestry.
- **`npm run typecheck:*` is not runnable in such a worktree at all.** No typecheck
  claim made from inside one is evidence. It ran clean post-merge on main.

Either place future worktrees inside the repository, or record the two commands above
where the next session's agents will find them.

### Hand-run confirmation, 2026-08-26 (post-merge) — and two things it did NOT prove

**The fix works against a real Electron window.** A stop now renders in the default
transcript. Confirmed by hand the same day it merged, which closes the loop the
2026-08-26 morning hand-run opened.

Two observations from that run, neither a defect, both worth recording:

- **Historical stops became visible retroactively, which nobody wrote down.** The user
  saw stop notices on *opening* the Pod as well as on stopping it. Cause, verified
  against the store: that Pod holds four `lane_closed`/`stopped` events (ids 6, 78, 88
  from the morning, 106 from the run itself). The three older ones were durable all
  along and invisible — they *are* this session's defect. The exemption applies to the
  filter, and the filter runs over backfilled history as well as live pushes, so every
  previously-hidden stop in every existing Pod is now visible. That is correct
  behaviour — a real record of a real user action — but the definition of done spoke
  only about the live push, so the retroactive half shipped unstated. **Anyone opening
  an old Pod will see stop notices that were never there before.**

- **The hand-run could not exercise the narrowness constraint.** `SELECT status,
  COUNT(*) ... WHERE type='lane_closed' GROUP BY status` over the live database returns
  **`stopped: 4` and nothing else** — there are zero `done` and zero `orphaned`
  `lane_closed` events in it. So the window had nothing the filter was supposed to keep
  hidden, and the hard constraint of this session ("do not unhide `lane_closed`
  wholesale") remains proven only by test: `typeCount(pane, 'lane_closed') === 0`
  against the `done` fixtures, and T3's `KEPT_POD` assertion. **A future hand-run that
  wants to test it needs a Pod with a lane that finished normally**, which is a
  different scenario to set up and did not arise here.

## 2026-08-27 — 2026-08-27-orcastrate-indicator-collapse

Deferred at Gate 3 by explicit user decision. Both are advisory; neither blocked the
merge. Full per-criterion verdicts and every finding's text are in that session's
`reviews/T1.md`–`T3.md`.

- **`src/renderer/src/pods/PodTab.source.test.ts:25-26` describes finished work in the
  future tense and names a deleted file.** The docblock reads "`activity/raw.d.ts`
  declares the form today; T3 moves that declaration to `styles/raw.d.ts`". It was
  accurate when T1 wrote it and went stale the moment T3 landed in the same session.
  One-line fix whenever someone next touches that file. **Found by the orchestrator at
  Gate 3, not by any of the three reviewers** — each reviewed only its own task's
  ownership-scoped diff, and no single diff contained both halves of the move. Worth
  noting as a structural limit of ownership-scoped review, not a reviewer failure: this
  is recurring pattern #1 ("prose no longer true of the code") reaching the one place
  the session's own review design could not see it.

- **The three session commits do not read as the series they are.** `595247d` took a
  `test(renderer):` prefix for a change whose substance is renderer behaviour, where its
  sibling `2cc0bea` used `fix(renderer):` and `0dd8468` used `refactor(renderer):`. Not
  rewritten — DIR never rewrites history, and a rewrite would have swept in commits from
  a concurrently running task. Recorded so a later reader of the log is not misled about
  which commit changed behaviour.

### Not deferred — recorded because it changes how future sessions should be set up

- **The worktree module-resolution traps are an artefact of worktree PLACEMENT, and this
  session dissolved them.** Prior sessions placed the worktree in a sibling directory
  (`Repos\orcastrate-worktrees\<slug>`), which is outside the main repository, so Node's
  ancestor resolution never reached `node_modules` — costing seven agents independent
  rediscovery in the previous session and requiring per-suite `NODE_PATH` and scratch
  vitest configs. This session placed the worktree at `.claude-worktrees/<slug>`, a path
  **already listed in `.gitignore`** and a descendant of the repository. Verified before
  any agent was dispatched: a jsdom/JSX suite ran with the plain command and no
  `NODE_PATH` and no scratch config, and `tsc --noEmit -p tsconfig.web.json` exited 0
  from inside the worktree — the check that was previously believed impossible there.
  Nine agents ran without one resolution failure between them. **Use this layout.**

## 2026-08-27 — 2026-08-27-orcastrate-matriarch-pod-status

Deferred at Gate 3 by explicit user decision. Both advisory; neither blocked the merge.
Full per-criterion verdicts and every finding's text are in that session's
`reviews/T1.md`–`T5.md`.

- **One stale-prose defect in THREE places, and fixing any one alone leaves it
  half-repaired.** All three name a symbol or a state that no longer exists:
  `pods/PodTab.tsx:229` still says the `srOnly` sentence "opens with
  `STATUS_LABEL[status]`", a symbol T2's extraction removed; `pods/PodTab.test.tsx:310`
  still says "Duplicated from `PodTab`'s own `STATUS_LABEL` on purpose"; and
  `__tests__/pod-stop.e2e.test.tsx:472` is still named "turns the Matriarch row from
  Running to Stopped" when the row now reads `Idle` before the stop. Each was frozen
  out of the task that would naturally have fixed it — the first two by T2's c2/c5
  hunk-count and ownership limits, the third by T5's c16 prohibition on renaming any
  `it`. **Every one was surfaced by the agent that hit it rather than silently
  resolved**, and the reviewer ruled in both cases that deferring was correct: an
  implementer relaxing a frozen criterion on purpose-reasoning is what makes frozen
  criteria stop meaning anything. Suggested rename for the third:
  `turns the Matriarch row from its live Pod word to Stopped and freezes its duration
  across two advances of the clock`.

- **`lanes/LaneRail.module.css:208` lacks `flex: none`** where `pods/PodBar.module.css:120`
  has it. Confirmed **pre-existing** — `git show 2c778b7` shows the identical rule
  untouched by this session — but the exposure changed: the Matriarch dot now sits
  beside Pod words that are much longer than the lane vocabulary's (`Waiting on you`,
  `Beached, process stopped` against `Running`/`Done`/`Stopped`), so a narrow rail can
  squeeze it where it previously could not. Adding `flex: none` to the shared `.dot`
  base would also change the lane branch, which is why T4 correctly declined it.

### Not deferred — recorded because it changes what a future session should check

- **A criterion can be vacuous in the direction nobody checks, and this session found
  two.** T3's terminal-Matriarch case passes against an implementation with **no
  `podStatus` field at all**, because `undefined ?? 'null'` renders `null` — exactly what
  the case asserts. T5's repairs would have been vacuous for a different reason:
  `POD_STATUS_LABEL.running` and `LANE_STATUS_LABEL.running` are **both the literal
  string `'Running'`**, so a text-only assertion cannot say which vocabulary a row is
  reporting and would read identically before and after the entire session's change —
  measured, not argued, in T5's red-step diff where `railWord` is `"Running"` on both
  sides. **Both were caught by the implementer and confirmed by a reviewer that
  reconstructed them.** When a criterion's assertion could be satisfied by absence,
  demand the mutation rather than the red run, and when two label maps can collide,
  assert on the attribute as well as the word.

- **An ownership-scoped diff cannot see a cross-task move, and a criterion's
  enumeration can undercount.** T4's change broke three assertions in files no task
  owned; the manifest named three and the real surface was four, with `pod-stop:523`
  masked behind `:476` in the same test and only visible once the first was repaired.
  Both were caught at Gate 3 and by a reviewer running rather than reading. Prefer
  per-assertion criteria over per-line ones for this reason.

## 2026-09-01 — 2026-08-31-orcastrate-helm-draft-safety

Sub-session C1 of the Large routing over the 2026-08-20 block. All 66 acceptance
criteria met, no blocking findings, no revision rounds. Eight advisory findings
carried forward by user decision at Gate 3. `HelmNotices.tsx`'s duplicate-sentence
defect is NOT repeated here — it is already in the 2026-08-20 block above.

**TWO ITEMS IN THIS BLOCK WERE CLOSED 2026-09-30 by sub-session C2**
(`2026-09-04-orcastrate-correctness-sweep`, merged `32638b7`) — both were defects
C1 itself introduced. Do not re-scope them:
- Correctness risks — *`HelmPanel.tsx:53,62-63` `compareRequested` never resets* —
  **closed**. A resetting `lastAction` latch replaced the one-way flag, so a later
  unrelated failure lands in the error banner rather than the comparison surface.
- Correctness risks — *`helm/copy.ts` `COPY.comparisonEmpty` names an affordance
  that may not be on screen* — **closed**. The copy now describes when a
  comparison appears instead of naming a control that is not rendered.

Everything else in this block is still open and is C3's scope.

### Contract gaps

- ~~**`panel-store.ts:329-332` — a fifth site nulls `incoming`.**~~ **CLOSED 2026-10-12**
  by sub-session C3 (`5ba2f3e`), authorised by escalation E4. The **live** contract at
  `contracts/renderer-panels.ts` now names the panel-close whole-state reset as a fifth
  clearing event, stamped with C3's slug, and `EXHAUSTIVE` stays and is now true;
  `resetHelmForReopen`'s own docblock, which had the identical hole one line from the
  code, now names `incoming` too. No behaviour changed — the diff touches only comments.
  **Note the target:** the amendment went to the live contract under `src/`, NOT to C1's
  frozen `helm-draft-safety.ts:142`, which carries the same list and which this project
  never edits — that frozen copy is still wrong and is now its own backlog item in the
  C3 block below. **One residue:** C3's reviewer, asked to audit whether `EXHAUSTIVE` is
  now *true* rather than just confirm a fifth bullet exists, enumerated all 13 writers of
  `incoming` and found a **sixth** clearing write at `panel-store.ts:663` — a failed
  `compare()`. It does not falsify the claim, because the docblock preamble separately
  names "the last request failed" as a cause of null, but it is carried forward. Original
  text: `resetHelmForReopen`
  replaces the whole Helm state via `newHelmState(null)` when the panel closes, so
  `incoming` goes null with `document` and `draft`. Correct behaviour, but the frozen
  contract's clearing list names "exactly four events" and this is not one of them. A
  future reader auditing that list will find it and cannot tell whether it is a bug.
  Fix is to name the whole-state reset in the contract, not to change the code.
- ~~**`HelmPanel.tsx:113` — the comparison surface does not exist before a scope is
  chosen.**~~ **CLOSED 2026-10-12** by sub-session C3 (`5ba2f3e`). Resolved as prose, with
  no behaviour change and no escalation: the question "which reading did criterion 6 mean"
  was settled at rung 1 of the inference ladder, because the **frontend discipline base
  states the rule the criterion transcribed almost verbatim** — "Every fetch has a
  declared loading state, a declared error state, and a declared empty state" — and that
  rule governs the states *of a fetch*, not whether the surface mounts before a fetch is
  possible. `HelmComparison` declares all three whenever a draft exists; with no scope
  chosen there is no fetch, no pending edit and no file. `HelmPanel.tsx`'s docblock now
  records which reading governs, names the discipline rule, and cites C1's unreachability
  finding, so the next auditor does not re-litigate it. The gating is byte-identical.
  Original text: the comparison surface does not exist before a scope is
  chosen.** Criterion 6 required a declared empty state; with `draft === null` no
  surface renders at all. Judged met at review, because the reviewer traced the store
  and established that `draft === null && incoming !== null` is unreachable, so the
  gating never hides a comparison that has data. The criterion's letter admits the
  other reading; a future session should decide which it meant.
- ~~**`Helm.module.css` `.confirmScrim` is opaque.**~~ **CLOSED 2026-10-12** by
  sub-session C3 (`10feee6`), authorised by escalation E2. The contract gained
  `--oc-overlay-scrim: color-mix(in srgb, var(--oc-bg-app) 70%, transparent)` — a
  deliberately new family, not a sixth `--oc-bg-*` surface, and introducing no colour
  literal, which answers the exact objection the stylesheets had recorded. **This item
  was filed four times too narrow.** The scoping pass found the defect is **four
  full-window scrims, not one**: a census of all eleven `var(--oc-bg-app)` CSS consumers
  found four identical `position: fixed; inset: 0; background: var(--oc-bg-app)` rules —
  Helm's close confirmation, `DeletePodDialog`, `NewPodDialog` and
  `BeachcomberPreviewDialog` — and `BeachcomberPreviewDialog.module.css:8-10` had
  recorded the missing alpha layer as the cause for itself *and* for `NewPodDialog`. All
  four now veil instead of hiding the whole window, and that docblock, which became false
  the moment the token existed, was rewritten with the change. The seven legitimate
  `--oc-bg-app` surfaces are untouched. Original text: It uses `background: var(--oc-bg-app)`
  because `renderer-theme.ts`'s `TOKENS` has no overlay, opacity or alpha token, and the
  stylesheet rule forbids literal colours. So the panel behind the confirmation is hidden
  rather than dimmed. **Same shape as the gap that produced `ADDED_TOKENS` in
  sub-session 3** — fixing it needs a token added to the frozen theme contract.
- **`panel-close-guard.tsx` — criterion 2's literal form was unsatisfiable.** It asked
  for `setOpenPanel(null)` in exactly one place, but the contract requires `requestClose`
  and `requestOpen` to share one guarded transition, so the setter arrives as a parameter
  named `apply` and the identifier cannot appear. The intent — one owner of the state
  move — was met and grep-verified. Phrase such criteria against the behaviour, not the
  identifier.

### Correctness risks

- ~~**`HelmPanel.tsx:53,62-63` — `compareRequested` never resets.**~~ **CLOSED 2026-09-30**
  by C2 (`32638b7`), as this block's own header already recorded. Annotated here
  2026-10-09, because the header said so and the bullet did not — the exact split
  that made the pre-C1 audit necessary. Verified in code: a resetting `lastAction`
  latch (`HelmPanel.tsx:62`, read at `:73`) replaced the one-way flag. Original text:
  after a compare that
  failed, `incoming` stays null; a subsequent *different* failure (a failed save, say)
  then satisfies `compareRequested && !comparing && incoming === null` and prints its
  message inside the comparison surface instead of the error banner. Narrow — it needs a
  failed compare followed by an unrelated failure — and it is the mirror of the bug the
  flag exists to prevent. Clearing the flag when `actionError` transitions closes it.
- ~~**`helm/copy.ts` `COPY.comparisonEmpty` names an affordance that may not be on screen.**~~
  **CLOSED 2026-09-30** by C2 (`32638b7`), as this block's own header already recorded;
  annotated here 2026-10-09 for the same reason as the bullet above. Verified in code:
  `copy.ts:154-155` now describes when a comparison appears and names no button.
  Original text:
  It says "Compare with the file on disk to fetch its current contents", but that button
  exists only on the conflict banner (`HelmNotices.tsx:104`). With a draft and no conflict,
  the surface advertises an action the user cannot reach.
- **`PanelBar.tsx` — three close routes became two.** The per-panel button no longer
  toggles the open panel closed; it always requests an open, which the controller no-ops.
  This was compelled by the frozen contract ("re-clicking the open panel's own button must
  not raise a dialog") and is not a defect, but it removes a gesture users had. The strip
  close button and Escape both survive and are test-covered, so nothing is trapped.
- ~~**`PanelBar.tsx:78` — `aria-pressed` announces a toggle that cannot be un-pressed.**~~
  **CLOSED 2026-10-12** by sub-session C3 (`56abc4b`), authorised by escalation E3, which
  also **sanctioned the edit to `PanelBar.test.tsx:50-59` that C1's own criterion 11
  protected** — the decision the item asked for. The button now carries
  `aria-current="true"`, on MDN's definition that aria-current marks "the current item
  within a container or set of related elements", which one button in a panel strip is;
  `aria-pressed` is for a toggle with two reachable states and this button has one. The
  stylesheet's open-state selector, both rationale docblocks, and the protected test moved
  with it — the test still reads the attribute off the open panel's button *and* off a
  closed one, so the non-visual two-state proof is intact, and `aria-pressed` survives
  untouched on the seven files carrying genuine toggles. **One residue carried forward:**
  the implementation emits `aria-current="false"` on every closed button, and both agents
  labelled its ARIA validity as belief rather than verified fact. Original text:
  The attribute still truthfully reports open state, but the button it sits on can no
  longer un-press itself. Changing it means editing `PanelBar.test.tsx:50-59`, which the
  session's own criterion 11 protected. Decide between keeping `aria-pressed` as a state
  indicator and moving to `aria-current`.

## 2026-09-30 — 2026-09-04-orcastrate-correctness-sweep

Sub-session C2 of the Large routing over the 2026-08-20 block. **All nine items it
was scoped for are CLOSED** — see the CLOSED list at the end of this block. 90
acceptance criteria, all met; one revision round; zero escalations. Full
per-criterion verdicts and each finding's full text are in that session's
`reviews/T1.md`–`T6.md`. Full suite on the merged branch: **2222 passing** (was
2178). Everything below is carried forward by explicit user decision at Gate 3.

### Correctness risks

- **`BackupSequence` is per-`Helm`-instance state.** `helm-service.ts:79-83`. Two
  `Helm` services constructed in one process against the same settings file would
  each start at ordinal 0 and could still collide inside one millisecond. Contract
  section 1 scopes out a second *process*; the in-process multi-instance case is
  contemplated by no criterion. Not a defect today — nothing constructs two.
- **The empty-serialization acknowledgement has no regression pin.**
  `helm-service.ts:231` is unconditionally `sha256Of(content)`, which is correct,
  but `tests/unit/helm/watcher.test.ts:249` pins only the watcher's treatment of
  `sha256Of('')` vs `null` and never calls `save`. Reintroducing a
  `content === '' ? null : sha256Of(content)` branch would turn nothing red.
- **Two unreachable holes in the "a failure renders on exactly one surface"
  invariant.** `HelmPanel.tsx:84,126`. If `draft` became null while a compare error
  stood, no comparison would render while the banner was still suppressed — the
  message would vanish. If `refreshScopes` failed while the latch was `'compare'`,
  `loadError` and `actionError` take the same sentence and it would print in both
  surfaces. **Both verified unreachable today** — only `loadDocument` nulls `draft`
  and both its entry points set the latch to `'other'` first; `refreshScopes` runs
  only at mount when the latch is still `null`. The invariant rests on that
  reachability argument rather than on the code's own shape.
- **`blockedBy` can name a different Pod than before, in a multi-Pod case.**
  `paths.ts:117-120`. Both comparisons run per-pod inside one loop, so where pod A
  matches by encoding and a later pod B matches by normalized path, the old code
  reported B and the new reports A. **Blocked-ness is unchanged** — that is the
  safety property, and it holds — only the identity shown in the banner differs.

### Disciplines

- **The frontend discipline says nothing about indexing under
  `noUncheckedIndexedAccess`.** `tsconfig.web.json:24` sets it, so destructuring or
  indexing a `querySelectorAll`/`map` result yields `T | undefined`. This is the one
  finding that would have prevented **this session's only revision round**: the
  destructure that failed to compile looked idiomatic when written. A line requiring
  an explicit guard — one that makes an absent node a named test failure rather than
  letting `-1` compare cleanly — would prevent recurrence. **No task could have
  fixed this: disciplines sit outside every task's `owns` globs.**

### Test and CI concerns

- **The leaf scan's import regex misses bare side-effect imports.**
  `tests/unit/ipc/failure-leaf.test.ts:41-47` uses
  `/^import[\s\S]*?from\s*'[^']*';/gm`, which requires a `from` clause, single
  quotes and a trailing semicolon. `import '../pod';` would not be matched at all
  and the scan would report zero imports and pass. Double-quoted or semicolon-less
  specifiers evade it the same way.
- **No test pins the orphan marker's position relative to the path.**
  `BeachcomberRow.tsx:44-45`. Close to untestable as written, since `unverified`
  (`decoded-name`) and `orphan` (`session-record`) are mutually exclusive by
  construction.
- **`absentControlLabels` resolves to a single entry.**
  `correctness-sweep.e2e.test.tsx:263`. `COPY.compare` is the only absent control in
  that scenario, so the loop is effectively one assertion. The
  `expect(...).toContain(COPY.compare)` guard prevents a vacuous pass today, but if
  Helm later stops rendering Save, Discard or Reload the test silently broadens.

### Cosmetics

- `src/main/beachcomber/paths.ts:52-57` — the `decodeDirectoryName` docblock is now
  orphaned: `PodBlockingSubject` and `podBlockerFor` were inserted between it and the
  function at `:122`, so it reads as documentation for the interface that follows it.
- `src/renderer/src/helm/HelmPanel.tsx:73` — `lastAction` is three-valued but only
  `'compare'` is ever tested; `'other'` and `null` are behaviourally identical.
- T2's report under-named its test-file edits (`watcher.test.ts`'s import block was
  rewritten) and mis-stated why it could not reach an empty serialization — it said
  the file was unowned, but `src/main/helm/document.ts` **is** inside its globs. The
  real reason is scope: widening `serializeSettings`' output floor is a behaviour
  change no criterion asked for. Conclusion right, justification wrong.

### CLOSED by this session — do not re-scope

From the **2026-08-20** block: `beachcomber.ts:213` `refused`/`NOT_FOUND` contradiction;
same-millisecond Helm backup overwrite; Pod blocking against a `displayPath` guess;
`acknowledgeOwnWrite` swallowing one genuine external change; `HelmNotices.tsx`
duplicate error sentence (**the `toHaveLength(2)` pin at `failure-paths.e2e.test.tsx`
is now `toHaveLength(1)` and its REPORTED DEFECT comment is deleted — that was the
authorised outcome, not a weakened test**); `BeachcomberRow.tsx:77` path-above-caveat;
and the leaf error module, so `IpcFailure` no longer transitively pulls `src/main/pod`
and `src/main/store`.

From the **2026-09-01** block: `HelmPanel.tsx` `compareRequested` never resetting, and
`helm/copy.ts` `COPY.comparisonEmpty` naming a conflict-banner-only affordance — both
defects C1 introduced.

**Still open from the 2026-08-20 block, deferred to C3:** `font-weight: 600` has no
token; the four unconsumed tokens; the opaque `.confirmScrim`; and every remaining
2026-09-01 item (the `PanelBar` pair, `resetHelmForReopen` as an unnamed fifth
clearing site, the two criterion-phrasing gaps).

## 2026-10-07 — driven Electron hand-run (no session; Playwright-driven, observed directly)

The hand-run owed since C1, executed by Playwright driving the real Electron app
against a sandboxed home. 110 of 111 checks passed across 24 steps. Full evidence,
root causes and screenshots in `.dir-sdlc/handruns/2026-09-30-electron-handrun/`.

### Correctness risks

- **CLOSED 2026-10-09 — BLOCKING — Helm's file watcher is never armed, so the
  stale notice is dead code.** Fixed by remediation 1: the `helmLoad` handler now
  arms the watcher after a successful load, with the arming wrapped so an advisory
  watch failure cannot fail the load. Six regression tests in
  `tests/unit/ipc/panels.test.ts` assert the *application* makes the call; shown
  able to fail (3 go red with `expected [] to deeply equal [ 'user' ]` when the
  handler is reverted). Verified end to end: the probe went from 0 pushes in 25s
  to 1 push with the stale notice in 500ms, the driven suite from 110/111 to
  **112/112**, `npm test` 2222 -> **2228**, both typechecks at baseline.
  Original report kept below for provenance.

- **(original report)** `HelmService.watch(scopeId)` is the only arming path
  (`helm-service.ts:239-248`) and **nothing in the application calls it**: there is
  no `helmWatch` IPC channel, `handlers.ts` registers only `helmScopes`/`helmLoad`/
  `helmSave`, and `load()`/`save()` do not arm it. The only callers are
  `tests/unit/helm/watcher.test.ts` and `tests/unit/ipc/channels.test.ts`.
  Production passes `watchEnabled: true`, which makes it look enabled, and the
  frozen contract documents the behaviour as intended (`helm.ts:57-58`).
  **Proved empirically**: with the user scope loaded, two external writes produced
  **zero** `helmChanged` pushes over 25s and no stale notice.
  **Consequences**: (a) `COPY.staleHeading`/`staleBody` can never render; (b) C2's
  `acknowledgeOwnWrite` fix is correct but guards a path that never executes, so
  its user-visible benefit is currently zero. Save-time conflict detection is
  unaffected — it re-reads independently, which is why the conflict flow passes.
  **Remediations, ranked**: (1) have the `helmLoad` handler call
  `deps.helm.watch(scopeId)` after a successful load and `watch(null)` on close —
  smallest change, keeps the renderer ignorant; (2) add an explicit `helmWatch`
  channel the renderer calls on scope selection; (3) accept it is not shipped and
  delete the unreachable copy. Whichever is chosen, **add a test asserting the
  application arms the watcher**, not merely that the watcher works once armed.
  *Why nothing caught it*: every watcher test calls `watch()` itself, and
  `helm.watch` was never a declared contract operation in C1's or C2's session
  contracts, so `coverage.md` never had a row for it — the exact
  implementer-with-no-consumer shape the coverage check exists to find.

### Cosmetics

- **The "path not verified" caveat renders on paths that are not guesses —
  now visually confirmed.** Under `shell-snapshots`, `file-history` and
  `paste-cache`, every row shows "…the path below is a guess" above a true
  absolute path, because `buildEntry` labels every non-`projects` entry
  `pathSource: 'decoded-name'`. Already filed from C2 review; this run confirms
  it in the real UI, where it is plainly wrong for three of the four roots.
- **The `hold` warning names CLI 2.1.235 while 2.1.277 is installed.** Correct —
  2.1.235 is the build the confirmed value set was read from — but it reads as
  stale. Decide whether to re-verify against the current CLI.

### Verified working (closes the "never hand-run" gap)

Helm's write path (file written, valid JSON, trailing newline, backup holds the
pre-save content, second save produced a distinct backup name **and** payload);
Beachcomber's trash path (cancel removed nothing; confirm moved the fixture to the
recycle bin). Every C1 and C2 fix confirmed in a real window, including **Pod
blocking by encoded cwd** — the row was blocked with a genuinely `disabled`
checkbox while its displayed path was a wrong guess — and both halves of the R4
guard, the union property, failure routing, the `comparisonEmpty` copy, the close
guard on both close and switch, the failed-reload draft retention, and the
conflict side-by-side.

### Still not exercised

`B5` (a blocked backup aborts the write) and the same-millisecond backup collision
are not reachable interactively — the backup name derives from the save-time clock;
both remain covered only by unit tests with an injected clock. `D3` (a failed
`helm:scopes` printing once) could not be staged without breaking every later step.
Narrow-window layout still needs a human eye.

---

## 2026-10-09 — pre-C1 backlog audit (no session; every bullet checked against code)

Every bullet in every pre-`2026-09-01` block was read against the code on
2026-10-09. The closures are annotated in their own blocks above. This block is
the **roster of what the audit left standing**, so a scoping session can read one
list instead of re-deriving it. Each line carries the citation the audit used.

**Seven items were closed and unmarked**, and one earlier verdict was reversed:
the four "unconsumed" tokens are consumed. That reversal is the one to remember —
the bad check grepped TypeScript identifiers where only CSS variable names appear.

### Open — correctness, with a citation

- **`_UncoveredAtSchemaHead` is the inert empty-array spelling** —
  `store/schema.ts:256-257`, docblock `:250-254` falsely claims the build breaks.
  Also names migration 2 as the schema head where migration 3 is (`:226`).
- **`MIGRATION_1` still interpolates `LANE_KINDS` (`:344`) and `EVENT_TYPES`
  (`:382`)** live. Deliberately deferred by the `2026-08-26` session; the other
  three enums are pinned. `migration-frozen.test.ts` catches either the moment a
  union widens, so this is latent, not live.
- **The `RESUME_FAILED` regex matches the bare word `resume`** —
  `pod/errors.ts:63`. Load-bearing on the common path since `openPod` started
  resuming: it is the discriminator between a silent fresh session and a
  surfaced, beached error.
- **The abandoned `ccSessionId` persists through the resume fallback** —
  `pod-manager.ts:713-731`. `#startFreshAfterRejectedResume` logs the abandoned
  id and calls `#start(pod, false)` without clearing the stored one.
- **`podUpdate` and `podSetPermissionMode` have no production caller** — their
  only references are in `test-utils/stub-api.ts`. Down from four: `podDelete`
  and `podReconnect` both acquired callers.
- **`LaneRail.module.css` lacks `flex: none`** on the dot where
  `PodBar.module.css:120` has it.

### Open — tests and guards, with a citation

- ~~**The `startup_reconciliation` marker is duplicated and pinned to nothing**~~ —
  **CLOSED 2026-10-09** by session `2026-10-09-orcastrate-guard-hardening` (`ea06303`). Both constants now live in
  `src/shared/startup-reconciliation-notice.ts`, which both tsconfig programs
  include; producer and filter re-export that one binding, and
  `tests/unit/pod-manager/marker-single-definition.test.ts` fails if a second
  declaration reappears. **The regression was live, and worse than recorded:**
  renaming the marker at the producer left **199 renderer tests green across 11
  files**. Original text:
  `transcript-filter.ts:221` re-declares the literal that
  `pod-manager/startup-reconciliation.ts:28` produces, and the test compares
  against a hard-coded string (`transcript-filter.test.ts:191`). Nothing reads
  the producer. `STARTUP_RECONCILIATION_REASON` lives in three places. Either
  fix (a `tests/**` equality test, or move the literal to `src/shared/`) is cheap.
- ~~**A vacuous assertion in `tests/unit/ipc/user-prompt.test.ts:398-401`**~~ —
  **CLOSED 2026-10-09** by session `2026-10-09-orcastrate-guard-hardening` (`bbb8a17`). `BASELINE_USER_ROWS` pins each
  fixture's measured row count before the two survival assertions. Proof it could
  not fail: under an injection making the replay ingest nothing, the tree at
  `a186f06` passed **all six** loop iterations. Original text:
  `toHaveLength(baseline.length + 1)` and `toEqual([typed, ...baseline])` both
  hold trivially for any fixture that ingests nothing. No `baseline.length > 0`
  guard exists anywhere in the file. The fix stays one line, and cannot be blanket.
- ~~**The control-byte hygiene rule still scans `src/` only**~~ —
  **CLOSED 2026-10-09** by session `2026-10-09-orcastrate-guard-hardening` (`7410c82`). It now walks `src/`, `tests/` and
  `probe/`, each root asserting its own measured non-emptiness floor, with the
  filter widened to `.md`/`.json` (20 previously-skipped files) and `.ndjson`
  excluded for a recorded reason. Original text:
  `__tests__/hygiene.test.ts:836`, "finds no stray control byte anywhere under
  `src/`". `tests/` and `probe/` carry the same exposure and
  `tests/router/hygiene.test.ts` has no such rule.
- ~~**`PRE_TOKEN_SHELL_DECLARATIONS` is still a two-sided pin**~~ — **CLOSED 2026-10-12**
  by sub-session C3 (`10feee6`). The font-weight entry is deleted and the pin fired on the
  way, as designed. **The citation in this roster line was already stale when C3 read
  it:** the declaration was at `:631` and the assertion at `:713`, not `:628`/`:710` — it
  had moved twice on 2026-10-09, within hours of this roster being written. C3's handoff
  brief caught and corrected it before dispatch. Original text: relocated to
  `__tests__/hygiene.test.ts:628`, asserted `:710`. The font-weight token work
  must edit it.
- ~~**`tests/unit/store/errors.test.ts:117` is order-dependent**~~ —
  **CLOSED 2026-10-09** by session `2026-10-09-orcastrate-guard-hardening` (`3584295`). The `provoked` Set and its
  `record()` calls are gone; a `PROVOCATIONS` table keyed by `EventStoreErrorCode`
  is run by the coverage test itself. Green at four shuffle seeds. Original text:
  "Runs last in
  this file; `provoked` is filled by the tests above." Fails under shuffle.
- **`handlers.ts`'s duplicate-registration guard has no direct test** —
  `register` is still an inner function of `registerIpcHandlers` (`:98-102`);
  `tests/unit/ipc/channels.test.ts:84` mentions it only in a comment.
- **`recordAttempts`' Proxy trap forwards exactly one argument** —
  `tests/unit/pod-manager/helpers.ts:238-248`, and still returns a fresh closure
  per property access.
- **No general enforcement that every push channel a method touches is counted** —
  T1 closed it for `closePod` only; nothing asserts the shape.
- **`roots.test.ts:129` asserts recursive `sizeBytes` loosely** — `> 0` after
  subtracting 15.
- **`migration-frozen.test.ts:100` shells out to `git show`** — red rather than
  skipped in a shallow clone. Nothing is broken today; this repo has no CI workflows.
- **Helm's watcher tests depend on `fs.watch` landing within a fixed turn count.**
- **The retired-id rule's exemption self-check proves presence, not purpose** —
  `hygiene.test.ts:805-833`. It now asserts call-shape *containment*, which is
  closer than when first filed, but still not the surrounding call in the exempt
  file (`lanes/LaneRail.test.tsx:180` holds the real proof).
- ~~**NEW — `KEPT_POD` is a dead constant.**~~ **CLOSED 2026-10-09** by session `2026-10-09-orcastrate-guard-hardening`
  (`4b05532`), together with `STOPPED_POD`, which was dead for the same reason.
  The kept pane also gained the positive control: **at `a186f06` that pane was
  always empty**, so `expect(laneClosedRows(keptPrimary)).toEqual([])` was green
  over nothing in normal operation, not merely under injection. Original text:
  `__tests__/pod-stop.e2e.test.tsx:271`
  declares it and nothing in the file reads it; the scenario reaches the kept Pod
  through `keptLaneId` instead. Worth a look alongside the standing finding that
  the `KEPT_POD` *rendered* assertion is near-vacuous — the two may be the same
  thing, with the assertion having gone away rather than been strengthened.

### Open — prose no longer true of the code (recurring pattern #1)

Eleven instances, every one verified present. They are individually trivial and
collectively the project's most repeated defect class, which is the argument for
sweeping them in one pass rather than one at a time.

- `contracts/renderer-state.ts:298` — "The four fields below"; three remain
  (`inPrimaryPane`, `inFollowerPane`, `focusedFollower`).
- `pods/PodTab.tsx:229` — the `srOnly` sentence "opens with `STATUS_LABEL[status]`";
  the symbol is `POD_STATUS_LABEL` (`:7`, `:239`).
- `pods/PodTab.test.tsx:310` — "Duplicated from `PodTab`'s own `STATUS_LABEL`".
- `__tests__/pod-stop.e2e.test.tsx:466` — still "from Running to Stopped"; the
  row reads `Idle` before the stop. The suggested rename is in the `2026-08-27` block.
- `pods/PodTab.source.test.ts:25-26` — "`activity/raw.d.ts` declares the form
  today; T3 moves that declaration to `styles/raw.d.ts`". Future tense about
  finished work, naming a deleted file. The same file's own header already
  records the move correctly one paragraph up.
- `helm/rules.ts:7-8` — states the lookahead bug backwards ("matches nothing";
  measured, it fires on clean code).
- `main/index.ts:94` — "Criterion 5" from an earlier task's numbering.
- ~~`pods/PodBar.module.css:1-4` — "the only bare lengths are hairline border
  widths, for which the token set has no entry"~~ — **CLOSED 2026-10-15** by session
  `2026-10-12-orcastrate-token-sweep` (`ab7dd23`). The docblock was rewritten and each of its
  five replacement claims verified in-session. **This roster line undercounted the defect:
  the claim was false on three counts, not one.** `--oc-border-thick` exists and the file
  used it (the count this line records); `:209` was a bare `letter-spacing`, not a border
  width; and `:72`/`:159` carried bare `px` lengths in `box-shadow`, which neither this line
  nor the handoff brief recorded. The replacement prose deliberately does **not** claim the
  file is free of bare lengths, because the two `box-shadow` geometries remain and the token
  set has no shadow-geometry entry (verified: anchored grep exit 1, positive-controlled).
  A companion claim in `pods/DeletePodDialog.module.css:1-4` was absent from this roster
  entirely, and its direction was the opposite: it was **true** at `af12edc` and the
  session's own conversions are what falsified it. Original text: `--oc-border-thick` exists
  and the same file uses it at `:152`.
- `styles/tokens.css:43` — the Status block header lists three lane statuses
  where there are four.
- `styles/tokens.css:63-65` — the assembled sentence overstates: it says the
  value "clears the shipped `closed`/`idle` precedent (2.173)" while naming
  `stopped`/`idle`, which is 1.796.
- `docs/superpowers/specs/2026-08-18-orcastrate-design.md:236-238` — §4.4's
  "never to data loss" still has no cross-reference to the §8 row that carries
  the exception.

### Open — cosmetic and structural, with a citation

- `ipc/index.ts:10-15` — two consecutive re-exports from `./validate`.
- `beachcomber/BeachcomberGroupHeader.tsx:62-64` — the one user-visible sentence
  composed in JSX rather than routed through `copy.ts`.
- `beachcomber/BeachcomberRefusals.tsx:36-38` — a refusal renders
  `{refusal.reason}` and never names the entry it refers to.
- `lanes/LaneRail.module.css:156` — `.rowMain:hover` paints `--oc-bg-hover`,
  which `:130` also uses as the selected-Matriarch surface, so hover feedback
  vanishes there. Fix is a Matriarch-specific hover surface, not a change to the
  three selection tokens.
- `lanes/LaneRail.module.css:155-157` — `.rowMain:hover` paints only the button
  box, drawing an inner rectangle inside the full-width swimlane.
- `lanes/LaneRow.source.test.ts` — the guard also bars `useState`/`useEffect`/`useRef`,
  broader than its criterion. Now *documented* as lane-row-specific in
  `pods/PodTab.source.test.ts:16-20`, so it is a deliberate asymmetry rather than
  an oversight — but it will still go red on a legitimate future `useRef`.
- `tests/unit/store/migration-2.test.ts:103-104` — its own migration-1
  byte-identity test, fully subsumed by `migration-frozen.test.ts`.
- **`use-dialog-focus.ts` is still in `beachcomber/`** with one consumer
  (`BeachcomberPreviewDialog.tsx:45`). `DeletePodDialog` and `NewPodDialog` have
  none of its three behaviours. Moving it to `shell/` needs an owner for both
  `shell/**` and `beachcomber/**`.

### Open — design decisions, no code answer

- **The palette-wide lightness pass**, and whether the hygiene guard should
  assert measured separation rather than string inequality. Worst shipped pair is
  `idle`/`beached` at 1.005, with five pairs under 1.2. Includes the
  `stopped`-vs-`waiting` measurement the third hand-run asked for, and the open
  question of whether a stopped Pod's tab should read grey where its Matriarch
  reads tan. Treat as one pass.
- **The six `2026-08-19` MVP feature deferrals** are all intact product
  decisions, not rot: direct Calf steering (`pod-runner.ts:485` still returns
  `{ supported: false }`), `forkSession` branching (no reference anywhere), the
  full config manager, adopting terminal-started sessions, a raw terminal pane
  per lane, and macOS/Linux validation.

### Informational — frozen contracts and process notes

Not work. Frozen contracts are never edited, so the falsified claims in
`pod-lifecycle.ts` §7, `transcript-filter.ts` §1, `lane-stopped-status.ts:77`
and the `beachcomber.ts:213` lineage stay as recorded; they are live
misinformation for anyone reading those sessions' artifacts, which is the whole
reason they are written down here. The same holds for the manifest-gloss note,
the two textually identical `podEvent` statements at `pod-manager.ts:567,755`,
the contract-operation coverage false alarm, the quiescent-tree gate note, and
the commit-series note.

---

## 2026-10-09 — 2026-10-09-orcastrate-guard-hardening

Five vacuous guards closed, each with a reproduced red step and a confirmation
that the same injection left `a186f06` green. 37 of 37 acceptance criteria met,
0 blocking findings, 0 revision rounds, 0 escalations. The five items this
session closed are annotated in the audit roster above rather than only here —
which is the structural fix the roster's own header has been asking for since
`008da4d`.

**One follow-up is already scheduled, not deferred:** the `grep -lP` docblock
correction below is being done as a Small session immediately after this merge,
by user decision at Gate 3.

### Correctness risks

- **A shipped docblock records a measurement taken with a command that cannot
  report a hit.** `src/renderer/src/__tests__/hygiene.test.ts`. T4 corroborated
  its `.ndjson`-exclusion and clean-tree claims with
  `grep -lP '[\x00-\x08...]'`, which in this environment fails with
  `grep: -P supports only unibyte and UTF-8 locales` and **exit 2** — it matches
  nothing regardless of file contents, confirmed by the reviewer against a
  positive-control file carrying a literal `0x08`. The *conclusion* is true: the
  reviewer reproduced it with a Node sweep over 354 files, positive control
  included. Only the cited evidence was broken, and the docblock sentence
  recording it should not later be trusted as a measurement that was taken. **This
  is a fresh instance of the project's recurring pattern #1 — prose no longer true
  of the code — introduced by the session that was auditing that very pattern.**
  Being fixed as a Small session directly after this merge.

- **The reconciliation-notice visibility guards no longer protect against marker
  drift.** `src/renderer/src/transcript/transcript-filter.test.ts:191`.
  `startup-reconciliation.test.tsx` and `TranscriptPane.filter.test.tsx` retain
  real content — the notice renders, the row text, filter behaviour — so they are
  not vacuous. But **with respect to a rename they are now tautological**: both
  sides read one binding, so producer and filter move together and the notice
  stays visible. Demonstrated by the criterion-7 run, where renaming the shared
  const left all 28 of those tests green. The E5 protection now rests entirely on
  the `:191` value pin and `marker-single-definition.test.ts`. Anyone who later
  deletes either on the grounds that "the visibility tests cover it" would
  silently reopen the gap this session closed.

- **The ten `.ndjson` fixtures now have no integrity signal at all.**
  `tests/fixtures/protocol/`, `probe/evidence/`. Excluding them from the
  control-byte rule is correct — they are byte-for-byte recordings of another
  process's stdout, their value is fidelity, and the natural way to answer a false
  positive would be to edit the fixture, which is the one repair a fixture must not
  invite. But the residual gap is real: an unintended mutation of a recording is
  now invisible, and these files are machine-written by exactly the kind of
  scripted tooling that wrote the original `0x08`. **A checksum or byte-length
  assertion over the fixture set is the right instrument** — it catches any
  unintended change, control byte or not, without asking a rule to distinguish
  defect from data.

- **T5's criterion-4 census is wrong in detail, though no classification changes.**
  `.dir-sdlc/sessions/2026-10-09-orcastrate-guard-hardening/reviews/T5.md`. The
  delivered table listed 6 occurrences where the reviewer's own `grep` found 8; it
  cites `marker-single-definition.test.ts:79` as a category-(iii) occurrence when
  `:79` carries no literal (the nearest real mention is `:8`); three prose
  occurrences went unlisted without being scoped out; and **category (iii) turns
  out to be unused entirely**, because the needle is assembled from fragments so
  the hygiene rule never carries the literal at all. The substantive property holds
  under the reviewer's grep — all five code occurrences permitted, none an
  unpermitted duplicate — but the delivered table should not be cited again as
  written. The correction is recorded in `reviews/T5.md`.

### Process notes, for whoever runs the next session

- **A criterion can be unsatisfiable because its own premise forbids its
  conclusion, and this session wrote one.** T5's criterion 7 demanded the
  reconciliation-notice visibility guards go red *"because producer and filter now
  read one const"* — but that premise is exactly what makes the conclusion
  unreachable: once both sides share a binding, a visibility test built from that
  const is invariant under renaming it. Satisfying the literal observable would have
  required criteria 2 and 3 to *not* hold. The reviewer ruled it met on the
  substituted evidence and said so explicitly. **The sting: Gate 2 had already
  caught this exact self-comparison trap in criterion 5 — deleting two `toBe`
  reference pins that would have compared a value to itself — and did not propagate
  the insight three criteria down.** When a decomposition removes a self-comparing
  assertion, re-read every other criterion in that task for the same shape.

- **"`git diff --stat` shows exactly one changed file" is not satisfiable in a
  shared worktree.** It appears in T1, T2, T3 and T4 of this manifest, and T2 and
  T3 each flagged it independently. Peers hold uncommitted work in the same tree by
  design, so the unscoped command always shows several files. Write it as the
  path-scoped diff, which is the question it is actually asking: did this task
  write outside its ownership set.

- **An implementer invoked git, and the ruling was advisory.** T4 ran
  `git checkout -- <two files>` to revert an injection criterion 4 required it to
  make. Ruled advisory rather than blocking because the `index.lock` race the
  orchestrator-only rule exists to prevent was **structurally impossible on the DAG
  tail** — `ea06303` was both HEAD and the last peer commit — and a working-tree
  checkout cannot alter index or commit state. It self-reported rather than hiding
  it. The correct alternative for an append-only injection is `truncate -s -1`
  (GNU coreutils is present); the general pattern, which also covers in-place
  injections, is to copy each target into the assigned scratch directory before
  injecting and copy it back afterward. **Put that in the injection instructions
  rather than discovering it again.**

- **Two commit messages drifted from their diffs, and the second is the worse
  kind.** Both were caught by reading the message back against the diff, which is
  this project's convention and the only thing that finds either. In both cases
  the **staged paths were correct** — nothing was committed that should not have
  been, and no file was missed. Only the prose drifted. History is never rewritten
  here, so both commits stand; they are recorded so the log stays readable despite
  them.

  - **`4b05532` is INCOMPLETE.** It describes T2's positive control fully but says
    nothing about deleting `KEPT_POD` and `STOPPED_POD` — criterion 1 of that task.
    Verified: `git show 4b05532 -- src/renderer/src/__tests__/pod-stop.e2e.test.tsx
    | grep '^-'` returns three removed lines, the two `const` declarations and the
    blank line between them, and the message mentions none of it. Nothing claimed
    is false. Recorded so a later reader is not misled about where those constants
    went.
  - **`e6768b2` is INACCURATE, which is worse.** The session's own artifact commit
    says "five guards hardened against **start/stop races**". **There were no races
    in that session.** The five were a vacuous prompt-survival assertion, a
    kept-pane negative with no positive control, an order-dependent coverage check,
    a scan whose reach was too narrow, and a duplicated constant — not one of them
    a concurrency defect. Verified: `grep -ic race` over that session's `spec.md`
    and `manifest.json` returns **0** for both files, so the word appears nowhere
    in the frozen scope it claims to summarise. An incomplete message leaves a
    reader uninformed; this one sends a reader searching the log for race
    conditions to a session that never touched one, and sends anyone scoping
    concurrency work to a precedent that does not exist.

  **Both are the same class as this project's standing `test(renderer):`-versus-
  `fix(renderer):` note** — the `595247d` item in the 2026-08-27 indicator-collapse
  block above, which likewise records a message whose characterisation of its diff
  was wrong while its contents were right. One `dir-git` agent summarising a diff
  rather than reading it closely is an incident; three is the pattern. The
  staged-paths half of that agent's job keeps coming back correct while the prose
  half keeps drifting, which locates the defect in how the message is derived, not
  in how the commit is assembled.

- **`.dir-sdlc/log.md` has the same hole the backlog had.** Found during this
  session's setup: three merged DIR sessions have no entry of their own —
  `2026-08-20-orcastrate-workspace-refinement`,
  `2026-08-21-orcastrate-transcript-readability` (mentioned once in passing inside a
  hand-run entry), and `2026-09-04-orcastrate-correctness-sweep`, the largest
  session in the project. The 2026-10-07 driven hand-run and the 2026-10-09 audit
  are absent too. Same structural cause as the backlog staleness: Gate 3's append
  obligation getting skipped. **Repairing those five entries is a documentation job
  worth one Small session**, and it is the last piece of the audit trail that is
  thinner than it looks.

- **Nothing in this session ran in a real Electron window**, and nothing in it
  should have — every change is to test and guard code, plus one constant move
  proven byte-identical by SHA-256. Recorded only so the next hand-run knows this
  session added no surface for it to exercise.

---

## 2026-10-09 — 2026-10-09-orcastrate-audit-trail-repair (Small)

Follow-up to the guard-hardening session. Corrected the docblock claim that
session introduced, recorded its two commit-message defects, and filled five
missing `log.md` entries. Small writes no `reviews/` file, so the per-criterion
verdicts live in `log.md`'s entry for this session and nowhere else. Seven
derived criteria, all met; 0 blocking findings.

### Correctness risks

- **An absolute claim about `grep -P` that is actually locale-conditional —
  caught, and fixed, inside this session.** `src/renderer/src/__tests__/hygiene.test.ts`.
  The first draft of the replacement docblock said `grep -lP` "cannot report a hit
  at all" and "matches nothing whatever the files contain". Measured at Gate 3:
  `grep -P` fails that way only where `LANG` and `LC_ALL` are unset, which is this
  harness's state and the state the original measurement was taken in. Force a
  UTF-8 locale and it works — `LC_ALL=C.UTF-8 grep -lP '[\x00-\x08…]'` exits 1 and
  names a planted-byte file. **The conclusion was never in doubt** (a clean result
  from an unrunnable command is evidence of nothing, and the real sweep was
  re-measured with a positive control); only the generality of the sentence
  overreached. Now scoped explicitly, with the reason the condition is spelled out
  rather than trimmed.
  **This is the third nesting of one defect class in two sessions:** a vacuous
  assertion, then a docblock citing a broken instrument for it, then an
  over-general claim in the docblock that fixed that. Each was caught by the next
  layer of review rather than by the author. Worth knowing that the pattern
  recurs *at every level*, including in the prose written to correct it.

- **One `log.md` figure is second-hand.** `.dir-sdlc/log.md`, the
  `2026-10-09 — pre-C1 backlog audit` entry. "22 `var()` declarations" is quoted
  from `a186f06`'s own prose rather than re-derived from the stylesheets. It is
  traceable to an artifact, which is the standard the entry had to meet, but it
  inherits whatever that count's accuracy was — and that audit is the one whose
  headline finding was a *miscounted* grep. Re-derive it if it is ever load-bearing.

### Test and CI concerns

- **The driven hand-run's date rests partly on evidence that does not survive a
  clone.** `.dir-sdlc/log.md`, `2026-10-07 — driven Electron hand-run`. Three dates
  name three different events: `2026-09-30` is the directory and the *manual*
  32-step plan, whose `RESULTS.md` is still an unfilled capture template, so that
  sitting never happened; `2026-10-07` is when the driven run executed; `2026-10-09`
  is when git first sees any of it (`929c613`) and when the watcher repair landed
  (`d995e1d`). The entry is headed `2026-10-07` because `log.md`'s own convention
  dates a hand-run by when it was driven, and because it matches the existing
  backlog block so a cross-referencing reader lands on one date. **Git corroborates
  none of it**, and the entry says so. The `README.md` self-heading is the only
  durable half of the evidence; the Oct 7 mtimes that corroborate it will not
  survive a fresh clone.

### Cosmetics

- **A sixth `log.md` hole is still open.** The **2026-08-21 hand-run of
  sub-session B** — the one that produced the four findings that *became* the
  `2026-08-21-orcastrate-transcript-readability` session — has no entry. It is
  distinct from the existing `2026-08-21 — second hand-run` section, which
  postdates that merge (`25d241f` follows `52950c3`). Deliberately not written:
  there is no artifact directory for it, only secondhand prose in two sessions'
  `spec.md` files, and backfilling it would be exactly the reconstruction this
  session's brief forbade. Recorded so the next audit does not rediscover it as
  though it were new.

### Process notes, for whoever runs the next session

- **Quoted heredocs are not backslash-safe in this harness, and it wrote a live
  control byte into a source file.** This session's first attempt at the docblock
  edit went through `python - <<'PYEOF'`. Backslashes collapsed in transit —
  `\\x00` arrived as `\x00`, Python interpreted it, and **a literal 0x00 byte
  landed in `hygiene.test.ts:796`**. Line-continuation backslashes were eaten the
  same way. It was caught within minutes by the very rule being documented
  (`hygiene.test.ts: line 796: 0x00`, `1 failed | 20 passed`), reverted, and redone
  with the Edit tool.
  **Two things follow.** First, use the Edit tool for any content containing
  backslashes; a quoted heredoc is not sufficient protection in this harness.
  Second, and more useful: the control-byte rule T4 had just widened **caught a
  real, tooling-introduced byte on the same day it merged**, in a file it had not
  been aimed at. Until now that rule had only ever been demonstrated against an
  injected byte. It has a live case.

- **The orchestrator made the final one-sentence fix directly** rather than
  re-dispatching, after the reviewer specified it precisely and it was verified
  comment-only (`git diff` shows every changed line beginning ` *`) and still green
  at 21/21. Recorded because it is a departure from "the orchestrator dispatches,
  implementers edit": for a one-sentence comment correction already specified by a
  review, a re-dispatch is the overhead the Small track exists to avoid. Judge the
  same way next time, and do not let it widen past one specified sentence.

---

## 2026-10-12 — 2026-10-09-orcastrate-theme-contract-decisions

Sub-session **C3** of the Large routing over the 2026-08-20 block, and the last of the
three. **All five scoped items are CLOSED** — the closures are annotated in their own
blocks above: `font-weight: 600` and the T10 pin in the `2026-08-20` block, the opaque
`.confirmScrim`, the unnamed fifth clearing site, the criterion-6 reading and the
`PanelBar` `aria-pressed` decision in the `2026-09-01` block, and the pin line in the
`2026-10-09` audit roster.

**32 acceptance criteria, all met. One blocking finding, closed in one round. Five
escalations, one amendment. 4 user interactions. Suite 2228 → 2240** (measured 2233 at
the session's own base, 2240 at its tip); typecheck clean on both programs throughout.
Three commits: `56abc4b`, `5ba2f3e`, `10feee6`.

Two of the five items were filed with their **breadth wrong**, both corrected before
decomposition: the opaque scrim was four sites rather than one, and the clearing-list
amendment belonged in the live contract rather than C1's frozen artifact. Scoping a
handed-down item by re-measuring it, rather than by trusting its citation, is what this
session's two biggest corrections came from.

### Contract gaps

- **`panel-store.ts:663` — a failed `compare()` nulls `incoming` and the clearing list
  does not name it.** The sixth clearing write, found by a reviewer asked to audit whether
  `EXHAUSTIVE` is now *true* rather than confirm a fifth bullet exists. It does **not**
  falsify the claim: the docblock's preamble at `:406` separately taxonomises "the last
  request failed" as a cause of null, so the write is accounted for outside the list by
  design. But a reader of the bullet list alone, without the preamble, finds a clearing
  write the list does not name — the same reading failure the whole item existed to close.
  A future session may want the list to cross-reference it explicitly.
- **`contracts/renderer-panels.ts:421` — the new fifth entry states the reset
  unconditionally; the code guards on phase.** `panel-store.ts:337` reads
  `current.phase === 'idle' ? current : newHelmState(null)`. Harmless in substance:
  `incoming` can only be non-null after a scope load, by which point `phase` is `'ready'`,
  so whenever there is anything to clear the replacement does happen, and when the guard
  short-circuits `incoming` is already null. Precision only.
- **`.dir-sdlc/sessions/2026-08-31-orcastrate-helm-draft-safety/contracts/helm-draft-safety.ts:142`
  still carries the four-event list with the now-known-false `EXHAUSTIVE`.** C3 amended
  the live contract and correctly left this one alone — frozen contracts are never edited
  here. It is live misinformation for anyone reading C1's artifacts, which is exactly the
  class the `2026-10-09` **Informational** section exists for. Recorded, not actionable.

### Correctness risks

- **`shell/PanelBar.tsx:89` — `aria-current="false"` is emitted on every closed panel
  button, and its ARIA validity was never verified.** React stringifies the `false` branch
  rather than omitting the attribute; the test asserts `'false'` and passes, so the
  behaviour is measured. What is *not* measured is whether `aria-current="false"` on every
  non-current item is correct practice versus omitting the attribute. **Both the
  implementer and the reviewer explicitly labelled this belief rather than verified fact,
  and neither spent a lookup**, correctly, since no criterion turned on it. This is the
  one unverified external claim the session shipped. Closing it costs one citation, or one
  line to omit the attribute on closed buttons.

### Test and CI concerns

- **`shell/Panels.styles.test.ts` does not guard the open-state selector.** It imports
  `PanelBar.module.css?raw` but asserts only on `.panelBar`, so C3's swap to
  `[aria-current='true']` has no stylesheet-level guard against a silent revert. Only the
  component test ties paint to announcement, and indirectly.
- **`styles/tokens.test.ts:57` locates the `:root` body with
  `source.indexOf('}', openIndex)`** — the first `}` after `:root {`. Any future token
  whose value contains a brace would silently truncate that body and make the "inside
  `:root`" assertion vacuous for every token after it. `color-mix(…)` has no braces, so
  nothing is wrong today. A latent trap in a file C3 did not own.
- ~~**`__tests__/hygiene.test.ts:16-17`'s header bullet understates the scoped rule.**~~ —
  **CLOSED 2026-10-15** by session `2026-10-12-orcastrate-token-sweep` (`0327924`, `9a09c1b`).
  The docblock title "THE RAW BORDER WIDTHS THIS RULE STILL TOLERATES" is gone with the pin
  it headed, and the header bullet was rewritten twice: T4 corrected the prose its pin
  deletion falsified, and T5 rewrote the bullet again because the repo-wide censuses made
  its three-directory scoping false. The bullet now records that the scoped rule is a
  narrower restatement **over this tree** and states explicitly that it is *not* narrower as
  a predicate — it reads declarations unanchored, so it flags a custom property named
  `--oc-border` that the anchored census does not, both directions asserted in the file.
  Original text: it said the rule checks "a border width or a letter-spacing" while `:726`
  ran `tokenOffenders(text, [LETTER_SPACING, FONT_WEIGHT])`; not falsified, but the
  enumeration no longer mapped to the code path.
- **`npx prettier --check` warns on `renderer-panels.ts`, `panel-store.ts` and
  `HelmPanel.tsx`** — pre-existing, identical at the session's base. Not fixed because
  reformatting would have touched executable lines and broken a no-behaviour-change
  criterion. The repo has no `eslint.config.*` at all, so lint is not an available check.

### Cosmetics

- **Three loose count phrasings in C3's own new census section.**
  `__tests__/hygiene.test.ts:1030` ("the five bare `font-weight` literals in `lanes/`,
  `pods/` and `transcript/`") and `:1236` ("these three directories hold the five
  literals") — those three directories hold **14** bare declarations across **5 files**, so
  "five literals" is true only read as *files*, the measure the session standardised on in
  the contract files and did not carry into the test file. And `:1201` ("the four other
  bare literals") is **five** — four `700`s and one `400`; defensible only as four distinct
  file-value pairs. Deliberately not fixed: no assertion depends on any of them, every
  assertion is correct and two-sided, and three comment words were not worth the session's
  unused second revision round.
- **`__tests__/hygiene.test.ts:709` — "Beachcomber has two, Helm one, the shell four."**
  Measured: 2, 1, and **five** — eight against an assertion of
  `toBeGreaterThanOrEqual(7)`, so the suite stays green and the comment is simply stale.
  **Pre-existing, and proven so:** at `41f274e`, before C3 began, `shell/` already held
  five module stylesheets, and `PanelBar.module.css` existed at that ref, so T1 modified
  rather than added it and is not the cause either. A **twelfth** instance of the "prose no
  longer true of the code" class. C3's implementer surfaced it and correctly declined to
  edit it, since its criterion scoped to claims its own change falsified.
- **Commit `10feee6`'s message drifted from its diff.** The body claims "the remaining
  nine take existing tokens (five 400→`--oc-weight-regular`, four 700→`--oc-weight-bold`)".
  The diff shows **one** `400` and **four** `700`s, and only **five** sites take an
  existing token — the other four are the scrims, which take the **new** overlay token.
  The 19 total is correct, which is why the error survives a casual read. History is never
  rewritten here, so the commit stands and this is the record. Found by the mandatory
  read-back; everything else in that message is true of its diff.
- **`lanes/LaneRow.tsx:46` and `lanes/LaneRail.test.tsx:201` carry `aria-pressed` prose.**
  Still accurate — those are the genuine two-state lane toggles — and correctly untouched.
  Noted only so a future `aria-pressed` sweep does not mistake them for stragglers.

### Process notes, for whoever runs the next session

- **Two defect classes already written down in this project's notes recurred anyway, five
  times between them.** (1) *A check that cannot report*: five instances this session — a
  control string quoting source prose that wrapped across a line break and so could never
  match (twice, once in the orchestrator's own criterion and once in an implementer's); a
  reviewer's probe returning 0 offenders where 15 existed; and two more caught in
  drafting. (2) *Heredoc backslash collapse*: the reviewer's probe died because a quoted
  heredoc turned `\\s*` into a bare `s` inside a template literal — the second such
  incident in this project. **Both are in memory as advice and both recurred. They need to
  be enforced rather than remembered:** a positive control is only a control if it is run,
  and file content should go through the edit tools without exception.
- **`dir-git`'s prose drifted for the fourth consecutive session while its staged paths
  were correct every time.** Three of C3's three commits staged exactly their `owns`
  globs; one of three misdescribed its own diff. The read-back is the only control, since
  history is never rewritten — and it caught this one. Keep doing it, and consider that the
  cheap model may be the wrong tier for message authorship specifically.
- **Broadening a criterion from an enumeration to a property paid for itself immediately.**
  C3's criterion 11 was rewritten at Gate 2 from "delete these three strings" to "the
  docblock carries no claim this task falsifies". The session's single blocking finding was
  a fourth false claim in that same file, in the assertion body rather than the docblock,
  which none of the three enumerated greps would have touched. **An enumeration of known
  instances is not a specification of the obligation.**
- **The criteria the orchestrator writes need the same adversarial read as the code.** Two
  defects originated in C3's own frozen criteria: criterion 8's count was arithmetically
  impossible against criterion 4's mandated value (amendment A1), and criterion 2 asserted
  "five directories" while naming four, which an implementer faithfully reproduced into
  shipped prose. The Gate 2 consistency check tested vacuity and pairwise contradiction
  but never **simulated a criterion's own stated count against the post-change tree**. Add
  that step.
- **The veiled dialogs have not been seen by a human.** Four scrims now paint a
  translucent overlay, confirmed by count, by census predicate and by a passing suite — but
  no part of this session rendered them. The 2026-10-07 driven Playwright hand-run is the
  instrument that would, and it has not been re-run against these changes. The same gap
  applies to the ten semibold headings. **A call site is not a pixel.**

---

## 2026-10-15 — 2026-10-12-orcastrate-token-sweep

Work ran 2026-10-12/13; closed and merged 2026-10-15. **C3's shape, one property over, and
it finished what C3 started.** The repo-wide census now covers `letter-spacing` and border
widths as well as `font-weight`, and **`PRE_TOKEN_SHELL_DECLARATIONS` is deleted** — the
project's last token exception list, emptied rather than left to outlive its problem, which
is what its own docblock said it existed for.

**63 acceptance criteria, 62 met on the letter and all 63 after one amendment. One blocking
finding, closed in one round. Four escalations, two amendments. 5 user interactions,
`reviewRounds: 1`. Suite 2240 → 2248** (measured by the orchestrator at both ends on a
quiescent tree); typecheck exit 0 on both programs throughout. Six commits: `01a8055`,
`f8deb51`, `ab7dd23`, `0327924`, `9a09c1b`, `d83b28c`.

**39 declarations converted** — 36 raw-length border widths (all exactly `1px`, in 7 files
across 4 directories) to `var(--oc-border-hairline)`, and 3 `letter-spacing` literals to
`var(--oc-tracking-wide)`. 38 are zero-pixel. The 39th, `.railHeading`'s `0.06em → 0.04em`,
is the session's only change to shipped type, decided by the user at escalation E1 rather
than rounded by an implementer — and it was **measured on screen** at `0.44px` against its
own `font-size: 11px`, the first time any hand-run has rendered that element.

**The handoff brief was wrong on five measurements and one of them resized the session.** It
billed 2 bare border widths; there were 36. The brief had counted declarations naming no
`--oc-*` token, while the rule's actual predicate (`borderOffenders`) flags any raw length in
a `border*` value regardless of colour token. That made the brief internally inconsistent:
its §4 asked for a repo-wide census with no exception list, which would have gone red on the
29 survivors of a 7-site conversion. Re-measuring at kickoff — and positive-controlling the
predicate against `border-radius: 4px` and `border: 0` — is what caught it, for the third
consecutive session.

### Contract gaps

- **CLOSED 2026-10-21** (session `2026-10-16-orcastrate-keyword-hairline-sweep`). All six
  converted to `var(--oc-border-hairline)` in `5073544` and `0d6b7dd`; both border-width
  predicates widened to the keyword forms in `6cf4d0b`; the "design decision" framing retired
  from `hygiene.test.ts` at both of the two sites that carried it. **Zero-pixel confirmed rather
  than asserted**: all six measured on screen in `2a6d797` at the same used width as a declared
  `1px` reference measured in the same window. ⚠ The claim below that `medium` and `thick` appear
  in no declaration is true only of **bare keywords** — seven `var(--oc-border-thick)` references
  ship, and a substring predicate would flag every one of them and go red on a clean tree.
- **Six untokenised border widths survive, declared with the CSS keyword `thin`** —
  `composer/Composer.module.css:15,44,70` and `permissions/PermissionCards.module.css:27,85,100`.
  A keyword is not a raw length, so the frozen census predicate correctly does not flag them,
  and T5 was right to report rather than widen a frozen criterion. **Both files were invisible
  twice over:** they sit outside `beachcomber/`/`helm/`/`shell/`, so the old scoped rule never
  saw them, and this session never touched them. **Converting them is zero-pixel in the engine
  that ships** — T6 measured `thin` at `0.8px` on a synthetic element in the real Electron
  window, identical to a declared `1px` (`medium` `2.4px`, `thick` `4.8px`). MDN states
  `thin` ≡ `1px` but the spec fixes only the `thin < medium < thick` ordering, so this is an
  engine measurement on one display rather than a standards claim. **A mechanical consistency
  sweep, not a design pass** — which is the opposite of how the deferral reads in
  `hygiene.test.ts`, where the prose calls widening "a design decision and not a test change".
  Correcting that framing is part of the item.
- **CLOSED 2026-10-21** (session `2026-10-16-orcastrate-keyword-hairline-sweep`). Fixed by
  **declaration-keyed** enumeration in the new `driver/run-keyword-sweep.mjs` (`2a6d797`): a site
  is keyed by the declaration, carries every selector in its group, and counts as reached when
  **any** of them renders — the property, not a hardcoded extra class for the one known instance.
  `transcript/Transcript.module.css:51` is now reported MEASURED, resolved via `.filterToggle`,
  and the enumeration was shown able to report `not reached` by substituting absent class names.
  `FINDINGS-TOKEN-SWEEP.md` carries a dated correction; that run's own recorded results are left
  as it observed them. `run-token-sweep.mjs` itself is byte-identical by Gate 2 decision.
- **A reachable converted declaration is reported as unreachable** —
  `transcript/Transcript.module.css:45` is a grouped selector, `.filterToggle, .unpin`, and
  the driver enumerates it only as `.unpin`, reporting "not reached — needs a SPLIT pane".
  But `.filterToggle` renders unconditionally in the pane header
  (`TranscriptPane.tsx:175-181`) and the run measured `.pane` and `.paneHeader` as rendered
  in that very state. This understates coverage, which is the conservative direction and
  violated no criterion. **Scope is bounded and positive-controlled:** the 6-line context
  above every hairline declaration in all 7 files was grepped for comma-grouped selectors and
  this is the only one. Fix is declaration-keyed enumeration, or enumerating every selector
  in a group.

### Correctness risks

- **The hand-run driver's prose overstates its own central fix.** `FINDINGS-TOKEN-SWEEP.md`
  says the driver fails "loudly on ambiguity instead of dropping the file"; `resolveHashes()`
  does fail loudly *and* the plan loop still skips the file (`if (!h) continue`), so it does
  both. Either throw, or soften the sentence. Two more in the same document: the `0.8px`
  quantization's **mechanism** is stated as fact ("this display is fractionally scaled") while
  the run's own `devicePixelRatio` reads `1.0000000149011612` — the quantization is measured
  and the `×1.25` fit is exact on all five rungs, but the cause is not measured; and TS-0
  defers a live-element/bundle hash check to "TS-4" where the rail renders at TS-5 and no such
  check exists, so `check('the live .railHeading element carries the SAME file hash…')` never
  ran. The claim is substantiated by other artifacts, but by a different one than the pointer
  names.
- **Two rewritten docblocks state exhaustive enumerations no scanner enforces** —
  `pods/PodBar.module.css:1-8` ("two declarations still carry a bare `px`") and
  `pods/DeletePodDialog.module.css:1-5` ("the only raw values left are `z-index`, `opacity`,
  the `100%` fills and the `0` resets"). Both were verified true as the session left them —
  by full declaration listings, not filtered greps — but the census checks border widths,
  tracking and token termination, not these enumerations, so both will go stale silently on
  the next edit to either file. The same hazard the session spent five criteria correcting,
  now reintroduced in two files at once.

### Informational — not work

- **Commits `01a8055` and `f8deb51` carry `Co-Authored-By: Claude Haiku 5.5`** where this
  session's attribution is `Claude Opus 5`. `dir-git` disclosed the deviation itself and the
  remaining four commits are correct. **Escalation E4; the user chose to leave them**,
  upholding the rule that history is never rewritten even though the branch was unpushed and
  the usual "a rewrite sweeps in concurrent peers" hazard did not apply. The mandatory
  commit read-back is what caught it — the fifth consecutive session in which that read-back
  found something, and the first in which what it found was not a message contradicting its
  own diff. **All six messages were accurate against their diffs**, which breaks a
  four-session streak. **Superseded in part: see the next entry — a third commit acquired the
  same wrong trailer after E4 was answered, and it is pushed.**

### Open — tooling, with a citation

- **`dir-git`'s own attribution configuration overrides an explicit, verbatim trailer
  instruction in its dispatch, inconsistently — so the orchestrator's brief is not a reliable
  control for that field.** Three of this session's nine pushed commits carry
  `Co-Authored-By: Claude Haiku 5.5` where the session's attribution is `Claude Opus 5`:
  `01a8055`, `f8deb51` and **`b3f4982`**. The first two came from a dispatch that did not
  name the trailer. **`b3f4982` is the finding**: its dispatch specified the two trailer
  lines verbatim and added "regardless of which model you are running as", and the agent
  followed its own configuration instead — then disclosed that it had, naming the mismatch as
  the same class as E4. Four other dispatches in this same session, same agent type and same
  model tier, *did* honour the instruction (`ab7dd23`, `0327924`, `9a09c1b`, `d83b28c`,
  `f378b55`), so the behaviour is not even consistent within one session.

  **CORRECTED TWICE, 2026-10-16, and this is the settled version. The two superseded claims
  are left visible below because each was falsified by the very next commit, which is the
  most useful thing about them.**

  - **First claim:** "the fix is not a better-worded dispatch — it belongs in the agent
    definition or a `commit-msg` hook." Falsified by `edfe2e9`, whose dispatch named the
    configuration conflict and stated precedence, and which carries the correct trailer.
  - **Second claim:** "merely specifying the trailer does not reliably bind; anticipating the
    configuration conflict does." Falsified by `f7f6e25` — the commit carrying that very
    correction — whose dispatch used the identical precedence wording and which carries
    `Claude Haiku 5.5` anyway.

  **The settled finding, stated so it does not depend on agent behaviour.** The
  `Co-Authored-By` trailer records **the model of the agent that ran the commit**, not the
  session's attribution, because every agent receives its own harness attribution instruction
  naming its own model. Asked to write a different name, agents **split** — identical wording
  produced compliance once (`edfe2e9`) and refusal once (`f7f6e25`). And the refusal was
  **principled, not a malfunction**: the agent's stated reason was that writing another
  model's name "would have been a false authorship claim", which is a better argument than the
  instruction it declined. Tally across this session's 11 commits: **6 `Claude Opus 5`, 4
  `Claude Haiku 5.5`, 1 merge commit with no trailer.**

  **So: do not try to override it.** Either accept that `dir-git`'s commits carry `dir-git`'s
  model — which is arguably what the field *should* say — or enforce uniformity with a
  `commit-msg` hook, the only mechanism that does not rest on an agent's judgment about
  authorship. Read the trailer back before the push either way, so you know what you have;
  after a push, correcting it needs a force-push to shared history and is not worth it.

  **The transferable lesson is about the shape of the claim, not about trailers.** Both
  superseded versions were claims about *what wording makes a non-deterministic agent behave*,
  and a claim of that shape will not hold. The settled version is a claim about what the field
  means and who controls it, which is why it is stable. Two doc-only commits were spent
  learning that.

  **E4's premise also expired
  between the question and this commit.** The user answered "leave them" when nothing was
  pushed and amending was cheap; `b3f4982` landed in the same operation as the push, so all
  three now sit in shared history and correcting any of them would require a force-push to
  `origin/main` — a worse trade than the inconsistency. **No action is proposed on the three
  commits; the record stands.** What is actionable is the control, and only for a future
  session.

  This is the sixth consecutive session in which `dir-git`'s prose or trailers drifted, and
  the first in which the drift survived a verbatim counter-instruction. The standing note
  that "the cheap model may be the wrong tier for message authorship specifically" now has a
  sharper form: the tier is not the issue if configuration outranks the brief.

### Process notes, for whoever runs the next session

- **"A check that cannot report" recurred six times, and the sixth was the orchestrator's.**
  Five were caught inside the session: T2's census grep passed invalid CSS cleanly; T2's own
  first positive control proved nothing because `\b` cannot follow `%`, and it discarded the
  control rather than banking it; T2's reviewer found the implementer's tree-wide control
  would have returned no hits only because peers had already converted their files, and ran a
  base-text control instead; T5 withdrew a matcher assertion after determining `border-radius`
  is *not* the near-miss that fools the unanchored reader (`border-radius:` offers a hyphen
  where `declaredValues` needs a colon — the real case is a custom property named
  `--oc-border`). The sixth: **the orchestrator reported 290 NUL bytes in a findings
  document**, because bash collapses `$'\x00'` to the empty string and `grep -c ''` matches
  every line — 290 was the file's line count. Byte-delta with a planted-NUL control showed
  zero. **The rule is not "positive-control your greps"; it is "positive-control the
  instrument you are about to trust", and it applies to the orchestrator's own commands.**
- **A bulk token sweep can produce CSS the browser silently discards, and nothing in this
  repository detected it.** T2's first pass stripped a trailing space, writing
  `var(--oc-border-hairline)solid` on all 14 of its lines — invalid CSS, so every one of
  those borders would have vanished on screen. The raw-length census **passed it**, because
  there is no raw length left to find; the full `pods` suite passed 31/31. Only the
  zero-pixel diff criterion caught it. Verified independently: no CSS parser exists anywhere
  under `src/` or `tests/`, and `styles/tokens.test.ts` checks only that token *names* match
  the frozen `TOKENS` map. **Closed this session by amendment A1** (escalation E2), which
  added a two-sided repo-wide rule that every `var(--oc-*)` reference be terminated by a
  space, `,`, `)`, `;`, `}` or end-of-line. **The lesson generalises past CSS:** a
  presence-of-bad-value predicate cannot see a well-formed value that is syntactically dead.
- **The orchestrator froze a third defective criterion, and the Gate 2 step that was supposed
  to catch it is the one C3 asked for.** T6's criterion 6 required a border measured "with a
  computed border width of 1px". No 1px border computes to `1px` in the window under test —
  a declared literal measures `0.8px`, because Chromium quantises used widths to whole device
  pixels. Worse, **criterion 4 of the same task explicitly forbade exactly that**: "compare
  against the element's measured font-size rather than a hardcoded pixel value." The two could
  not both be honoured, and the method criterion 4 mandated is the one that made criterion 6's
  intent measurable. Resolved by amendment A2 at Gate 3. C3's own note said to simulate a
  criterion's stated numbers against the post-change tree before freezing; **this session did
  run that step and still missed this, because `1px` does not look like a number anyone needs
  to simulate.** Add the narrower rule: a criterion naming a *rendered* quantity must say what
  it is measured against, never a literal.
- **The architect died mid-decomposition on an API rate limit**, after writing
  `manifest.json` and the contract but before returning its coverage mapping. The orchestrator
  derived the mapping itself and recorded the provenance deviation in `coverage.md` rather
  than presenting it as architect-derived — it also authored the definition of done that
  mapping joins against, which is a weaker guarantee and is stated as such in the artifact.
  Drafts on disk were complete and schema-valid, so no re-dispatch was attempted.
- **Two agents corrected the party above them, and both were right.** T5's implementer
  reverted its reviewer's suggested wording — "gives **no** listed border-width property a
  raw length" — because the bullet's leading "no" distributes across every verb, making the
  suggestion a double negative that asserts the opposite of the rule; it flagged the departure
  instead of making it silently, and the reviewer then retracted its own suggestion. T6's
  reviewer declined to rule criterion 6 met on its own reading of intent and escalated
  instead, which is what produced the amendment rather than a quiet pass. **The reviewers
  earned their tier**: T1's caught that the implementer's *stated reason* for a criterion was
  false while its conclusion held, and T4's pinned "no coverage lost" to counted invariants
  (`expect(` 106→106, `it(` 28→28) rather than to the diff's appearance.
- **The hand-run's honest limit is better than C3's and still the highest-value follow-up.**
  21 of this session's 39 converted sites were measured in the real app; the other 18 are
  recorded with a reason each, and most need a live `claude` process. C3 managed 3 of 10. The
  instrument now also carries its own cautionary tale: an ambiguous single-class anchor
  silently deleted an entire stylesheet from the sweep, so `.action` was reported "not
  reached" while the New Pod button was plainly visible **in the screenshot that same step had
  just taken**. First pass would have scored 36/46 and invited the conclusion that the
  conversions were defective; all 10 failures were harness faults and none was the
  application. **A coverage gap that reports itself as a limit is worse than one that
  errors.** A live-`claude` harness is the single highest-value thing anyone could build next.

## 2026-10-21 — 2026-10-16-orcastrate-keyword-hairline-sweep

**The token sweep's shape, one keyword over, and it finished what that session left.** The six
surviving keyword `thin` border widths are tokenised, **both** border-width predicates now flag a
bare keyword as well as a raw length, and the prose claiming that widening them "would change six
shipped borders' pixels, which is a design decision and not a test change" is gone from both of
the two places it appeared. Merged as `48912a0`; `git diff 2a6d797 main` is empty, so the merge
preserved the tree exactly.

**56 acceptance criteria, all 56 met. 3 escalations, 2 amendments, `reviewRounds: 3`,
5 user interactions.** Suite **2248 → 2252** (141 files both ends, measured by the orchestrator on
a quiescent tree); typecheck exit 0 over both programs; `npm run build` exit 0. Six commits:
`9d55ce9`, `0d6b7dd`, `5073544`, `e2677e5`, `6cf4d0b`, `2a6d797`.

**The zero-pixel claim is now measured rather than inherited.** All six conversions were measured
on screen in the real Electron window at the same used width as a declared `1px` reference measured
in the **same window**, with both synthetic probes alive together in one pass
(`devicePixelRatio 1.0000000149011612`). No pixel literal is an expectation anywhere in the driver
or the findings — `0.8px` is this display's quantization and is recorded as non-portable.

**Both predicates now call one function.** `isOffendingBorderWidth` serves the scoped
`borderOffenders` and the repo-wide `censusBorderOffenders`, so the two cannot drift about what a
border width is — which is the defect class this session is the third instalment of, fixed at the
mechanism rather than at its latest instance.

**The load-bearing near-miss was `var(--oc-border-thick)`, and the brief did not name it.** Seven
declarations ship a token whose *name* ends in a width keyword, five of them inside the scoped
roots. A substring predicate flags all seven and goes red on a clean tree; a term predicate flags
none. Found by the architect reading the population a second, differently-shaped way: unanchored
13, minus 7, equals the 6 the brief named.

### Correctness risks

- **The census takes its population from `process.cwd()`, which vitest's `--root` does not
  change** — `hygiene.test.ts:94`. So it can scan an entirely different checkout and report
  confidently either way. **The orchestrator hit this live**: `vitest run --root <worktree>`
  launched from the main checkout scanned `main` at `6914e49` and failed with exactly **6**
  offenders — the six unconverted declarations. Rooted correctly, 37/37. Two consequences, both
  worth keeping: the mis-rooted run is an accidental **positive control on the real tree**, stronger
  evidence of the widened predicate than any synthetic injection; and **a census whose population
  is an unstated input cannot report that it read the wrong one.** That is this session's own
  defect class living in the instrument. Highest-value item in this block.
- **The scoped rule is blind to a declaration that ships** — `hygiene.test.ts:622`, whose
  `BORDER_PROPERTIES` docblock says "including the shorthands", against
  `beachcomber/BeachcomberPreviewDialog.module.css:61`'s
  `border-block: var(--oc-border-hairline) solid var(--oc-border)`. `declaredValues(text, 'border')`
  needs a colon straight after `border` and meets a hyphen, so it cannot read it — and that is the
  **only** logical-form border declaration in the tree, measured
  (`grep -rnE '(^|[;{])[[:space:]]*border-(block|inline)[[:space:]]*:'` → one hit). Tokenised today
  and the repo-wide census covers it, so nothing is unheld. Pre-existing, verbatim at base; T4 was
  told explicitly not to widen that list, so leaving it is a recorded decision.
- **A docblock calls an empty capture impossible, and it is reachable** —
  `composer/Composer.styles.test.ts:44`. Group 2 is `([^;}]*)`, so a malformed `border: ;` yields
  the string `"border: "`, which the keyword predicate reads as a **non-offender**. The claim is
  true of `undefined` and false of the empty string. This *strengthens* the reason the task
  refused a `?? ''` fallback — a fallback in the offender direction is a silent pass in the one
  test meant to go red — and the equality pin catches the case in that file. One clause would stop
  a later reader conflating the two.
- **The corrected contrast prose states a boundary-sensitive count without its margin** —
  `styles/tokens.css:88-91`. `running`/`orphaned` computes **1.1949**, 0.005 inside the 1.2 line,
  and `done`/`stopped` sits just outside at 1.2062. **This is almost certainly the origin of the
  old `five`**: over the pre-`stopped` seven, the count strictly under **1.19** is exactly five.
  Found by T3's implementer unprompted and confirmed by its reviewer, and the correction
  deliberately did **not** act on it — the prose states 7 and 6 at the 1.2 line only.

### Contract gaps

- **The frozen contract's own census grep cannot reach the logical longhands** —
  `contracts/keyword-hairline-sweep.ts:30`. Its alternation
  `border(-top|…|-block|-inline)?` needs the colon straight after the property name, so
  `border-block-start:` is invisible to it — the identical mechanism that made
  `CENSUS_BORDER_PROPERTIES` blind to the longhands before this session added them. **T4 found it
  by having its own positive control declined**: it planted `.a { border-block-start: thin solid
  red; }`, watched that grep return nothing, and re-controlled with shorthand forms rather than
  banking a control that proved nothing. The shipped matcher now covers all four longhands
  (synthetically — none ships); the contract's prose does not.
- **That grep's boundary class disagrees with the shipped matcher about `_`** — same line. The
  contract uses `[^-[:alnum:]]`, which treats `_` as a boundary; the shipped `BARE_WIDTH_KEYWORD`
  uses `[^-\w]`, which treats it as an identifier character. So `_thin` would flag in the grep and
  not in the suite. **T4 decided the matcher is right and the grep is wrong, not merely different**
  — `_` is a valid CSS ident character, so reading a keyword out of `_thin` is the substring failure
  shifted one character left — and keeping `[^-\w]` makes the shipped matcher byte-identical to
  T1's and T2's in-file predicates. `KeywordWidthMatchShape` names `-` and is silent on `_`.
  Unexercised: the only underscores in any `*.module.css` are inside comment prose.

### Process notes, for whoever runs the next session

- **Two of the three escalations were defects in criteria the orchestrator froze at Gate 2**, and
  both were found by implementers rather than by its own consistency check. **A1**: criterion 10 of
  T1/T2/T3 and criterion 12 of T4 named `git status --porcelain` scoped to `src/renderer/src` as
  the instrument for per-task diff scope — which reports the whole shared worktree, so it was
  unsatisfiable by **any** task in the manifest. **A2**: T4's criterion 2 demanded every
  `KEYWORD_MUST_PASS` sample pass both predicates when `--oc-border: thin` cannot, because
  `declaredValues` is unanchored and `DeclarationReader` freezes it. **This is the third
  consecutive session in which a frozen criterion named an outcome a frozen artifact forbade**, and
  the Gate 2 consistency check missed it twice more. The narrower rule the token sweep proposed —
  a criterion naming a rendered quantity must say what it is measured against — is necessary but
  not sufficient: **a criterion naming an *instrument* must be checkable with that instrument in
  the conditions the task will actually run in.** Both defects were invisible to a reading of the
  criterion alone and obvious to the first agent that tried to run it.
- **Four times an agent corrected the layer above it and was right every time.** T1 on the
  criterion-10 instrument; T1 again on the reviewer's own remedy ranking, arguing that an
  enumeration in a test name is a *stored derivation* that drifts silently while a property does
  not — the reviewer withdrew its ranking and conceded its option had been internally inconsistent
  with its own staleness advisory in the same review; T2's reviewer on the premise of its own
  criterion 8, which had mis-described a past **coverage** gap as a naming defect; T4 on B1's
  remedy, looping the shipped constant rather than writing four named assertions, because four
  assertions close the finding today and re-create it at the next entry. **The useful behaviour is
  disagreeing with the brief when the brief is wrong, and it should keep being asked for by name.**
- **T4's refinement of the property-over-enumeration rule is the most transferable thing here.** A
  loop whose subject is the shipped constant makes a universal name true *by construction* — but it
  goes blind to a **deletion**, because the loop shrinks with the list. So neither form is simply
  correct: the enumeration covers deletion, the loop covers addition, and the file now says which
  half catches which failure. Its reviewer then audited the stated limit and found it
  **understated** — nine of thirteen properties are deletion-covered by literals, not the five the
  docblock names, the four uncovered being `border-right`, `border-left`, `border-inline`,
  `outline`. A reviewer finding in the direction that makes its subject look better.
- **The repo-wide `tsc` gate on the DAG tail earned its keep for the second time.** T1's committed
  `Composer.styles.test.ts` failed `typecheck:web` on `TS18048` — `matchAll` types every capture
  group as `string | undefined` — while every scoped vitest run stayed green, because **vitest
  transpiles without typechecking**. Found by T4, a peer task, not by T1's reviewer: no criterion of
  T1's named `tsc`, so neither party had an instrument that could see it. T1 then refused the
  obvious `?? ''` on the grounds that an empty capture yields `"border: "`, which its own predicate
  reads as a non-offender — **a fallback in the offender direction is a silent pass** — and chose
  `as string` by *counting* the repo's existing idiom (8+ sites, 5 files, and no `?? ''` anywhere)
  rather than by preference. Note `as string` cannot apply to a `.mjs` driver; indexed access with
  a comment is the portable half of the rule.
- **The contract-operation coverage search needed a hand-recorded deviation, for the second
  session running.** Run literally it returns `not called` for 15 of this contract's 20
  declarations, and all 15 would be false: the contract is declaration-only by design, so nothing
  imports it and implementers consume it by asserting its content. `coverage.md` records the
  criterion verdict establishing each consumption instead. **A check whose literal application
  produces 15 false alarms against the sharpest row on the table is a check the reader learns to
  override** — the same conclusion the token sweep reached from 18.
- **Commit trailers were uniform, and the way to get that was to stop fighting them.** All six
  commits carry `Co-Authored-By: Claude Haiku 5.5`, the model of the `dir-git` agent that made
  them. No dispatch asked any agent to write another model's name, so none split the way last
  session's eleven commits did (6/4/1). The settled finding holds: **the field records the
  committing agent, and uniformity comes free once you accept that.** A `commit-msg` hook remains
  the only control that would say something else.
- **The commit read-back found something again — the seventh consecutive session — and this time
  it was convention, not a false claim.** `0d6b7dd`'s body ran to 305 characters where every other
  commit on `main` wraps at 71-87. Not rewritten, per the no-rewrite rule; **naming it in the next
  dispatch is what kept the remaining four commits at 68-71.** All six messages were accurate
  against their diffs.
- **Three agents independently reported an "auto mode" directive** instructing them to make file
  changes with `sed`, heredocs or short scripts rather than the Edit tool, and all three ignored it.
  The harness separately refused T5's `Write` to its own deliverable because the filename
  pattern-matched "report file"; T5 routed around it with `cp` plus a `cmp` verification rather than
  reaching for a heredoc. **Both work directly against the rule this repo learned from a heredoc
  writing a literal NUL byte into a source file.** Worth knowing it reaches subagents, not just the
  orchestrator.
- **The orchestrator's own instruments failed twice and both were caught by controlling them.** A
  `--listFiles` check matched 4 files where 3 were predicted, because the pattern caught
  `Beachcomber.hygiene.test.ts` as a **substring** — the exact failure the session was about, in the
  orchestrator's grep. And the brief told three agents the worktree has "a real `node_modules`"; it
  holds **one** entry, `.vite`, with resolution walking up to the main checkout. T5 corrected it.
  The half that was actually controlled — that it is **not a junction**, so no recursive delete can
  follow it into the main checkout — is the half cleanup safety depends on, and it held.
- **Still outstanding and still the highest-value instrument this project lacks:** a live-`claude`
  hand-run harness. This session needed none — all six sites were measured, and the three
  permission cards turned out reachable by having the **main process** send the app's own
  `push:permissionRequested`, which no prior session had tried. The reach note predicting they
  needed a live `claude` was wrong in the favourable direction, and `coverage.md` records the Gate 2
  prediction as **refuted** rather than quietly overwriting it.
- **What the next session should not have to rediscover:** `--oc-border-hairline` is at
  `styles/tokens.css:156`, not `:144` — T3's twelve added comment lines moved it, and `:144` is
  correct only as of `6914e49`.
