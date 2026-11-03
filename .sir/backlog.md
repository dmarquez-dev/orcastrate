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

## Tests and guards

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

2026-11-03 20261103-1657-tests-and-guards-sweep Make the retired-id offender scan at `src/renderer/src/__tests__/hygiene.test.ts:1331` match the quote-delimited literal rather than `text.includes(literal)`, which flags a live id that merely extends a retired one (the same shape D15 fixed in `retiredLiteralUseReport`).
2026-11-03 20261103-1657-tests-and-guards-sweep Relax or document the border-width predicate in `src/renderer/src/pods/PodBar.styles.test.ts` (the test at `:469`), which rejects a multi-value longhand such as `border-width: var(--oc-border-hairline) 0` that the `PodBar.module.css` docblock permits; no such declaration exists today.
2026-11-03 20261103-1657-tests-and-guards-sweep Make `tests/unit/store/migration-2.test.ts:104` skip in a shallow clone as `migration-frozen.test.ts` now does, since it also shells out to `git show`, unless the Cosmetic line deleting that test lands first.
2026-11-03 20261103-1657-tests-and-guards-sweep Decide whether `closePod` on an already-closed Pod should stop re-pushing `podStatus 'closed'` (`src/main/pod-manager/pod-manager.ts:511-518`); harmless today, and `tests/unit/pod-manager/close-pod-lane-sweep.test.ts`'s whole-record count pins the re-push, so changing it means updating that expectation.
2026-11-03 20261103-1947-correctness-sweep Give the renderer stub's three non-`projects` Beachcomber rows (`src/renderer/src/test-utils/stub-api.ts:256-288`) `pathSource: 'absolute-path'`; they carry `'session-record'`, which matches neither the old base nor the new D4 rule.
