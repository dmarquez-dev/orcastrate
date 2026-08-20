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
