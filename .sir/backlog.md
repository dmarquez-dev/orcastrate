# Backlog

<!-- Project-level, not session-level. Append one line per item at Gate 3,
     after approval: the date, the session id, and the action in a
     sentence. Never create this file when there is nothing to append. -->

<!-- Example: 2026-10-26 oauth-login Defer rate-limiting the refresh endpoint to a later session. -->

<!-- Seeded 2026-10-29 from the open items of the previous framework's backlog
     (.dir-sdlc/backlog.md and .dir-sdlc/handoff-after-keyword-sweep.md), every
     file:line citation re-measured against the tree that day. Session ids
     dir-audit-2026-10-09, dir-handrun-2026-10-07 and dir-handoff-2026-10-26
     name DIR blocks that had no session of their own. -->

## Correctness

2026-09-30 2026-09-04-orcastrate-correctness-sweep Make Helm's backup ordinal safe across service instances: `BackupSequence` is per-instance state (`src/main/helm/helm-service.ts:83`), so two `Helm` services on one settings file could still collide inside one millisecond; nothing constructs two today.
2026-09-30 2026-09-04-orcastrate-correctness-sweep Make Helm's "a failure renders on exactly one surface" invariant hold by the code's shape rather than a reachability argument, closing the two currently-unreachable holes at `src/renderer/src/helm/HelmPanel.tsx:84` and `:152`.
2026-09-30 2026-09-04-orcastrate-correctness-sweep Decide which Pod `podBlockerFor` should name when one Pod matches by encoding and another by normalized path (`src/main/beachcomber/paths.ts:117-120`); blocked-ness is correct, only the banner's identity changed.
2026-10-07 dir-handrun-2026-10-07 Stop labelling true absolute paths as guesses: `buildEntry` gives every non-`projects` root `pathSource: 'decoded-name'` (`src/main/beachcomber/service.ts:177-179`), so the "path is a guess" caveat renders wrongly under three of the four roots.
2026-10-09 dir-audit-2026-10-09 Make `_UncoveredAtSchemaHead` actually break the build: the empty-array spelling at `src/main/store/schema.ts:256-257` is inert, and its docblock (`:252-255`) also keys it to migration 2's list where migration 3 is the schema head.
2026-10-09 dir-audit-2026-10-09 Pin `MIGRATION_1`'s live `LANE_KINDS` (`src/main/store/schema.ts:344`) and `EVENT_TYPES` (`:382`) interpolations as the other enums are; latent, since `migration-frozen.test.ts` catches a widened union.
2026-10-09 dir-audit-2026-10-09 Narrow the `RESUME_FAILED` classifier at `src/main/pod/errors.ts:63`, whose regex matches the bare word `resume` and decides between a silent fresh session and a surfaced, beached error.
2026-10-09 dir-audit-2026-10-09 Clear the abandoned `ccSessionId` in `#startFreshAfterRejectedResume` (`src/main/pod-manager/pod-manager.ts:713-732`), which calls `#start(pod, false)` without clearing the stored id, so it survives until the fresh run's first authoritative `session_id` reaches `onSessionId` (`:1181-1183`) and a reopen inside that window retries the rejected resume.
2026-10-09 dir-audit-2026-10-09 Wire or remove the renderer store's `setPermissionMode` action (`src/renderer/src/state/store.ts:674`), which no component calls.
2026-10-12 2026-10-09-orcastrate-theme-contract-decisions Verify or drop `aria-current="false"` on every closed panel button (`src/renderer/src/shell/PanelBar.tsx:89`), whose ARIA validity was never checked; one citation or omitting the attribute closes it.
2026-10-21 2026-10-16-orcastrate-keyword-hairline-sweep Replace the `process.cwd()` census root in six test files (`src/renderer/src/__tests__/hygiene.test.ts:94`, `beachcomber/Beachcomber.hygiene.test.ts:43`, `helm/no-paths.test.ts:49`, `pods/wording.test.ts:50`, `transcript/tool-summary.test.ts:43`, `state/isolation.test.ts:37`) with the repo's `import.meta.url` idiom (`tests/router/helpers.ts:27`), plus a guard that tells this tree from another valid checkout, with the handoff's Case B as negative control.

## Tests and guards

2026-09-30 2026-09-04-orcastrate-correctness-sweep Pin Helm's empty-serialization acknowledgement: `src/main/helm/helm-service.ts:231` is correctly unconditional, but `tests/unit/helm/watcher.test.ts:249-256` never calls `save`, so reintroducing a `content === '' ? null` branch turns nothing red.
2026-09-30 2026-09-04-orcastrate-correctness-sweep Widen the leaf scan's import regex at `tests/unit/ipc/failure-leaf.test.ts:47`, which misses bare side-effect, double-quoted and semicolon-less imports and would then pass reporting zero imports.
2026-09-30 2026-09-04-orcastrate-correctness-sweep Pin the orphan marker's position relative to the path in `src/renderer/src/beachcomber/BeachcomberRow.tsx:134`, noting it is close to untestable while `unverified` and `orphan` (`:44-45`) are mutually exclusive.
2026-09-30 2026-09-04-orcastrate-correctness-sweep Strengthen `absentControlLabels` at `src/renderer/src/__tests__/correctness-sweep.e2e.test.tsx:257-264`, which resolves to one entry today and silently broadens if Helm stops rendering Save, Discard or Reload.
2026-10-09 dir-audit-2026-10-09 Add a direct test for the IPC duplicate-registration guard: `register` is an inner function of `registerIpcHandlers` (`src/main/ipc/handlers.ts:102`) and `tests/unit/ipc/channels.test.ts:84` mentions it only in a comment.
2026-10-09 dir-audit-2026-10-09 Fix `recordAttempts`' Proxy trap (`tests/unit/pod-manager/helpers.ts:236-249`), which forwards exactly one argument and returns a fresh closure per property access.
2026-10-09 dir-audit-2026-10-09 Add a general assertion that every push channel a pod-manager method touches is counted; today only `closePod` is held to it.
2026-10-09 dir-audit-2026-10-09 Tighten `tests/unit/beachcomber/roots.test.ts:129-130`, which asserts recursive `sizeBytes` only as `> 0` after subtracting 15.
2026-10-09 dir-audit-2026-10-09 Make `tests/unit/store/migration-frozen.test.ts:100` skip rather than go red in a shallow clone, since it shells out to `git show`; the repo has no CI today.
2026-10-09 dir-audit-2026-10-09 Replace the fixed turn count Helm's watcher tests wait on (`settle(turns = 6)`, `tests/unit/helm/helpers.ts:193`) with a condition, since they depend on `fs.watch` landing within it.
2026-10-09 dir-audit-2026-10-09 Make the retired-test-id exemption self-check (`src/renderer/src/__tests__/hygiene.test.ts:1129-1140`) prove purpose rather than presence, by checking the surrounding call in the exempt file (`lanes/LaneRail.test.tsx:180` holds the real proof).
2026-10-09 2026-10-09-orcastrate-guard-hardening Add a checksum or byte-length assertion over the ten `.ndjson` recordings in `tests/fixtures/protocol/` and `probe/evidence/`, which have had no integrity signal since the control-byte rule excluded them.
2026-10-12 2026-10-09-orcastrate-theme-contract-decisions Guard `PanelBar`'s open-state selector at the stylesheet level: `src/renderer/src/shell/Panels.styles.test.ts:21,27` imports `PanelBar.module.css` but asserts only on `.panelBar`, so a revert of `[aria-current='true']` goes unseen.
2026-10-12 2026-10-09-orcastrate-theme-contract-decisions Make `src/renderer/src/styles/tokens.test.ts:55` find the end of the `:root` body robustly, since `source.indexOf('}', openIndex)` would silently truncate it at the first token value containing a brace.
2026-10-15 2026-10-12-orcastrate-token-sweep Enforce or soften the exhaustive enumerations in the docblocks of `src/renderer/src/pods/PodBar.module.css:1-7` and `src/renderer/src/pods/DeletePodDialog.module.css:1-6`, which no scanner checks and which will go stale silently on the next edit.
2026-10-21 2026-10-16-orcastrate-keyword-hairline-sweep Either narrow the `BORDER_PROPERTIES` docblock at `src/renderer/src/__tests__/hygiene.test.ts:623` ("including the shorthands") or widen the constant at `:630` to the logical forms, but never silently; the one logical-form declaration (`BeachcomberPreviewDialog.module.css:61`) is already held by the repo-wide census.

## Prose drift

2026-10-09 dir-audit-2026-10-09 Correct "The four fields below" at `src/renderer/src/contracts/renderer-state.ts:298`; three remain (`inPrimaryPane`, `inFollowerPane`, `focusedFollower`).
2026-10-09 dir-audit-2026-10-09 Correct the `srOnly` comment at `src/renderer/src/pods/PodTab.tsx:229`, which names `STATUS_LABEL[status]` where the symbol is `POD_STATUS_LABEL` (`:7`, `:239`).
2026-10-09 dir-audit-2026-10-09 Correct "Duplicated from `PodTab`'s own `STATUS_LABEL`" at `src/renderer/src/pods/PodTab.test.tsx:310`; the symbol is `POD_STATUS_LABEL`.
2026-10-09 dir-audit-2026-10-09 Rename the test at `src/renderer/src/__tests__/pod-stop.e2e.test.tsx:480`, which still says "from Running to Stopped" though the row reads `Idle` before the stop.
2026-10-09 dir-audit-2026-10-09 Fix the future-tense claim at `src/renderer/src/pods/PodTab.source.test.ts:25-26` that `activity/raw.d.ts` declares the form and T3 will move it; the move to `styles/raw.d.ts` is done.
2026-10-09 dir-audit-2026-10-09 Correct `src/renderer/src/helm/rules.ts:7-10`, which states the old lookahead bug backwards ("matches nothing") where measured it fires on clean code.
2026-10-09 dir-audit-2026-10-09 Remove the stale "Criterion 5" task-numbering reference at `src/main/index.ts:96`.
2026-10-09 dir-audit-2026-10-09 Add `stopped` to the Status block header at `src/renderer/src/styles/tokens.css:60`, which lists three lane statuses where there are four.
2026-10-09 dir-audit-2026-10-09 Fix the overstatement at `src/renderer/src/styles/tokens.css:80-82`, which says the value clears the shipped `closed`/`idle` precedent (2.173) while naming `stopped`/`idle` at 1.796.
2026-10-09 dir-audit-2026-10-09 Cross-reference §4.4's "never to data loss" (`docs/superpowers/specs/2026-08-18-orcastrate-design.md:237`) to the §8 row that carries the exception.
2026-10-12 2026-10-09-orcastrate-theme-contract-decisions Name the failed-`compare()` clearing write (`src/renderer/src/state/panel-store.ts:663`) in the `incoming` clearing list at `src/renderer/src/contracts/renderer-panels.ts:411-426`, or cross-reference the preamble at `:406`, so the list reads complete on its own.
2026-10-12 2026-10-09-orcastrate-theme-contract-decisions Make the panel-close entry at `src/renderer/src/contracts/renderer-panels.ts:419-426` state the phase guard the code applies (`src/renderer/src/state/panel-store.ts:337`); precision only.
2026-10-12 2026-10-09-orcastrate-theme-contract-decisions Correct "Beachcomber has two, Helm one, the shell four" at `src/renderer/src/__tests__/hygiene.test.ts:850`; the shell has five module stylesheets.
2026-10-12 2026-10-09-orcastrate-theme-contract-decisions Tighten the loose "five literals" counts at `src/renderer/src/__tests__/hygiene.test.ts:1170` and `:1376` (14 bare declarations across 5 files) and "the four other bare literals" at `:1341-1342` (five).
2026-10-15 2026-10-12-orcastrate-token-sweep Add a dated correction to `.dir-sdlc/handruns/2026-09-30-electron-handrun/FINDINGS-TOKEN-SWEEP.md` for `:272` ("fails loudly instead of dropping the file", where the plan loop still skips) and `:147` (fractional scaling stated as cause, unmeasured), noting the byte-frozen driver's pointer at `driver/run-token-sweep.mjs:501` to a TS-4 hash check that never ran.
2026-10-21 2026-10-16-orcastrate-keyword-hairline-sweep Add one clause to the docblock at `src/renderer/src/composer/Composer.styles.test.ts:51-53` distinguishing `undefined` (impossible) from the empty capture `"border: "` (reachable, read as a non-offender); low value, bundle it.
2026-10-21 2026-10-16-orcastrate-keyword-hairline-sweep State the margin of the boundary-sensitive contrast count at `src/renderer/src/styles/tokens.css:88-92` (`running`/`orphaned` 1.1949 is 0.005 inside 1.2), deriving any changed figure afresh rather than editing it in.

## Cosmetic and structural

2026-09-30 2026-09-04-orcastrate-correctness-sweep Move the orphaned `decodeDirectoryName` docblock at `src/main/beachcomber/paths.ts:53-58` back above its function at `:124`.
2026-09-30 2026-09-04-orcastrate-correctness-sweep Collapse or test `lastAction`'s three values at `src/renderer/src/helm/HelmPanel.tsx:62`; only `'compare'` is tested and `'other'` and `null` behave identically.
2026-10-09 dir-audit-2026-10-09 Merge the two consecutive `./validate` re-exports at `src/main/ipc/index.ts:9-15`.
2026-10-09 dir-audit-2026-10-09 Route the "Select all in …" sentence at `src/renderer/src/beachcomber/BeachcomberGroupHeader.tsx:63` through `copy.ts` like every other user-visible string.
2026-10-09 dir-audit-2026-10-09 Make a Beachcomber refusal name the entry it refers to; `src/renderer/src/beachcomber/BeachcomberRefusals.tsx:36-38` renders only `{refusal.reason}`.
2026-10-09 dir-audit-2026-10-09 Give the selected Matriarch a distinct hover surface: `.rowMain:hover` (`src/renderer/src/lanes/LaneRail.module.css:163-165`) paints `--oc-bg-hover`, which `:138` and `:142` already use for that row, so hover feedback vanishes there.
2026-10-09 dir-audit-2026-10-09 Make lane hover paint the full-width swimlane rather than an inner rectangle; `.rowMain:hover` (`src/renderer/src/lanes/LaneRail.module.css:163-165`) paints only the button box.
2026-10-09 dir-audit-2026-10-09 Add `flex: none` to the lane status `.dot` (`src/renderer/src/lanes/LaneRail.module.css:216`) as `PodBar.module.css:123` has on its status dot.
2026-10-09 dir-audit-2026-10-09 Narrow `src/renderer/src/lanes/LaneRow.source.test.ts:45`, which bars `useState`/`useEffect`/`useRef` more broadly than its criterion and will go red on a legitimate future `useRef`.
2026-10-09 dir-audit-2026-10-09 Delete the migration-1 byte-identity test at `tests/unit/store/migration-2.test.ts:104`, which `migration-frozen.test.ts` fully subsumes.
2026-10-09 dir-audit-2026-10-09 Move `use-dialog-focus.ts` from `beachcomber/` to `shell/` and adopt it in `DeletePodDialog` and `NewPodDialog`, which have none of its three behaviours; its one consumer is `BeachcomberPreviewDialog.tsx:45`.

## Design decisions

2026-09-01 2026-08-31-orcastrate-helm-draft-safety Decide whether to restore the re-click-to-close gesture on `PanelBar`'s per-panel button, removed because the frozen contract forbade a dialog on re-click; the strip close button and Escape both survive.
2026-10-07 dir-handrun-2026-10-07 Decide whether to re-verify Helm's `hold` value set against the current CLI, since the warning names `OBSERVED_CLI_VERSION` 2.1.235 (`src/main/helm/validate.ts:31`) and reads as stale.
2026-10-09 dir-audit-2026-10-09 Run the palette-wide status lightness pass, with the user deciding per pair, including whether the hygiene guard should assert measured separation and whether a stopped Pod's tab should read grey where its Matriarch reads tan; worst shipped pair `idle`/`beached` 1.005, seven of 28 pairs under 1.2 (`src/renderer/src/styles/tokens.css:88-92`).
2026-10-09 dir-audit-2026-10-09 Decide on direct Calf steering, still unimplemented (`src/main/pod/pod-runner.ts:486` returns `{ supported: false }`).
2026-10-09 dir-audit-2026-10-09 Decide on `forkSession` branching, which has no reference anywhere in `src/`.
2026-10-09 dir-audit-2026-10-09 Decide on the full config manager deferred by the MVP.
2026-10-09 dir-audit-2026-10-09 Decide on adopting terminal-started Claude Code sessions, deferred by the MVP.
2026-10-09 dir-audit-2026-10-09 Decide on a raw terminal pane per lane, deferred by the MVP.
2026-10-09 dir-audit-2026-10-09 Decide on macOS and Linux validation, deferred by the MVP.

## Tooling

2026-09-30 2026-09-04-orcastrate-correctness-sweep Add a frontend discipline rule requiring an explicit guard when indexing or destructuring under `noUncheckedIndexedAccess` (`tsconfig.web.json:24`), so an absent node is a named failure.
2026-10-12 2026-10-09-orcastrate-theme-contract-decisions Clear the pre-existing `npx prettier --check` warnings on `src/renderer/src/contracts/renderer-panels.ts`, `src/renderer/src/state/panel-store.ts` and `src/renderer/src/helm/HelmPanel.tsx` in a formatting-only change.
2026-10-15 2026-10-12-orcastrate-token-sweep Decide whether to enforce uniform commit trailers with a tracked `commit-msg` hook plus an install step; `.git/hooks/` holds no non-sample hook, `core.hooksPath` is unset, and the field otherwise records the committing agent's model.
2026-10-26 dir-handoff-2026-10-26 Build a live-`claude` hand-run harness, checking first whether the app's own IPC can reach a state; still unexercised are `B5`, the same-millisecond backup collision, `D3`, and narrow-window layout.
