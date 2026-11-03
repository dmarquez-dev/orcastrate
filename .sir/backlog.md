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
2026-10-09 dir-audit-2026-10-09 Wire or remove the renderer store's `setPermissionMode` action (`src/renderer/src/state/store.ts:674`), which no component calls.
2026-10-12 2026-10-09-orcastrate-theme-contract-decisions Verify or drop `aria-current="false"` on every closed panel button (`src/renderer/src/shell/PanelBar.tsx:89`), whose ARIA validity was never checked; one citation or omitting the attribute closes it.

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
2026-10-09 2026-10-09-orcastrate-guard-hardening Add a checksum or byte-length assertion over the ten `.ndjson` recordings in `tests/fixtures/protocol/` and `probe/evidence/`, which have had no integrity signal since the control-byte rule excluded them.
2026-10-12 2026-10-09-orcastrate-theme-contract-decisions Guard `PanelBar`'s open-state selector at the stylesheet level: `src/renderer/src/shell/Panels.styles.test.ts:21,27` imports `PanelBar.module.css` but asserts only on `.panelBar`, so a revert of `[aria-current='true']` goes unseen.
2026-10-12 2026-10-09-orcastrate-theme-contract-decisions Make `src/renderer/src/styles/tokens.test.ts:55` find the end of the `:root` body robustly, since `source.indexOf('}', openIndex)` would silently truncate it at the first token value containing a brace.
2026-10-15 2026-10-12-orcastrate-token-sweep Enforce or soften the exhaustive enumerations in the docblocks of `src/renderer/src/pods/PodBar.module.css:1-7` and `src/renderer/src/pods/DeletePodDialog.module.css:1-6`, which no scanner checks and which will go stale silently on the next edit.
2026-10-29 20261029-1730-census-root-hygiene Make `retiredLiteralUseReport` in `src/renderer/src/__tests__/hygiene.test.ts` count `total` and `absent` on the same quote-delimited match. Today `total` counts substrings, so a retired literal that is a substring of a live test id would count as a non-absence occurrence; the only current literal, `lane-row-pin` (`:1163`), is not affected.

## Prose drift

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

## Ungrouped (Gate 3 appends land here)

2026-11-03 20261102-2224-prose-drift-sweep Make the PANEL-CLOSE entry at `src/renderer/src/contracts/renderer-panels.ts:425-434` name the second early return in `resetHelmForReopen`, taken when `this.api === null` (`src/renderer/src/state/panel-store.ts:336`).
2026-11-03 20261102-2224-prose-drift-sweep Reword the "impossible case" sentence at `src/renderer/src/composer/Composer.styles.test.ts:56-59` so it cannot be read as covering empty values, since the paragraph at `:61-66` shows `"border: "` is reachable without the `?? ''` fallback.
2026-11-03 20261102-2224-prose-drift-sweep Correct `discrimination.test.ts` to `discrimination.test.tsx` in the docblock at `src/renderer/src/helm/rules.ts:16`.
