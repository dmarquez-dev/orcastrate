# Tests and guards sweep

Clear every open **Tests and guards** item in `.sir/backlog.md`: 15 items, each of which makes a test or guard actually catch the regression it exists to catch.

## Context

The user is clearing `.sir/backlog.md` one unit at a time. The previous session, `20261102-2224-prose-drift-sweep`, cleared the Prose drift section. At this Gate 1 the backlog held 50 open items. The count comes from an `awk` tally per section on 2026-11-03 at `main` `ce1cd36`: Tests and guards 15, Cosmetic and structural 11, Design decisions 9, Correctness 8, Tooling 4, Ungrouped 3. Those add up to 50, which matches a separate `grep -c` over the dated lines. Four units were offered. The user picked Tests and guards on its own and turned down the variant that also took the 3 Ungrouped prose items.

The 15 items cite these locations, taken from the backlog lines by a backtick-path grep:

- `src/main/helm/helm-service.ts:231` / `tests/unit/helm/watcher.test.ts:249-256` (empty-serialization acknowledgement never exercised through `save`)
- `tests/unit/ipc/failure-leaf.test.ts:47` (import regex misses bare side-effect, double-quoted and semicolon-less imports)
- `src/renderer/src/beachcomber/BeachcomberRow.tsx:134` (orphan marker position; `unverified`/`orphan` mutually exclusive at `:44-45`)
- `src/renderer/src/__tests__/correctness-sweep.e2e.test.tsx:257-264` (`absentControlLabels` silently broadens)
- `src/main/ipc/handlers.ts:102` / `tests/unit/ipc/channels.test.ts:84` (no direct test of the duplicate-registration guard)
- `tests/unit/pod-manager/helpers.ts:236-249` (`recordAttempts` Proxy trap forwards one argument, fresh closure per access)
- a general assertion that every push channel a pod-manager method touches is counted (only `closePod` is held to it today)
- `tests/unit/beachcomber/roots.test.ts:129-130` (recursive `sizeBytes` asserted only as `> 0`)
- `tests/unit/store/migration-frozen.test.ts:100` (should skip, not go red, in a shallow clone)
- `tests/unit/helm/helpers.ts:193` (`settle(turns = 6)` fixed wait → a condition)
- the ten `.ndjson` recordings in `tests/fixtures/protocol/` and `probe/evidence/` (no integrity signal)
- `src/renderer/src/shell/Panels.styles.test.ts:21,27` (`PanelBar.module.css`'s `[aria-current='true']` selector unguarded)
- `src/renderer/src/styles/tokens.test.ts:55` (`:root` body end found by the first `}`)
- `src/renderer/src/pods/PodBar.module.css:1-7` and `src/renderer/src/pods/DeletePodDialog.module.css:1-6` (docblock enumerations: enforce or soften)
- `src/renderer/src/__tests__/hygiene.test.ts` `retiredLiteralUseReport` (`total` and `absent` counted on different matches)

Each item's full wording is on its backlog line.

## Decisions

- Track: Standard. The change is test-focused, but its result is 15 independent claims that can each be checked. Under scope routing's "count the judgments" rule that means the full pipeline.
- Session name: `tests-and-guards-sweep`.
- Scope: exactly the 15 Tests and guards lines. Nothing from any other section, the 3 Ungrouped prose items included.
- Test-side by default. Production source changes only where an item cannot be closed without one. One example is the PodBar/DeletePodDialog item, where "soften" means editing a CSS docblock. Runtime behaviour does not change.
- Every citation is re-measured against the current tree before it is acted on. The line numbers date from 2026-09-30 to 2026-10-29 and may have moved. If an item's claim no longer holds, it is closed as already resolved, not worked.
- A strengthened guard is shown to bite, which follows the project's "verify your instrument" lesson. Each item's criterion carries a positive control: a red step or an injected defect that the new or changed test catches and the old one did not. A "found nothing" result carries a predicted count.
- Items that offer two options ("enforce or soften", "skip rather than go red") get their choice settled in spec through `sir-inference`. It is escalated only if the ladder cannot settle it.
- Any count restated in a test or comment is derived afresh and attributed to the command that produced it. Example: "ten `.ndjson` recordings".
- Each closed item's backlog line is removed at Gate 3. Any item found invalid is reported, not silently dropped.
- Clock note: this run's first clock read (16:57Z) was taken after Gate 1 had been presented and answered. Both Gate 1 log lines therefore carry that read rather than one taken before the gate.
