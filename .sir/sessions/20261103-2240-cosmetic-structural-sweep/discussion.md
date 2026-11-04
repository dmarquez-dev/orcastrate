# Cosmetic and structural sweep

Clear the 11 open **Cosmetic and structural** items in `.sir/backlog.md`, plus 3 Ungrouped test-guard items: 14 items in total.

## Context

The user is working through `.sir/backlog.md` one unit at a time. Earlier sessions cleared Prose drift (`20261102-2224-prose-drift-sweep`), Tests and guards (`20261103-1657-tests-and-guards-sweep`) and Correctness (`20261103-1947-correctness-sweep`). At this Gate 1 the backlog held 29 open items. The count comes from an `awk` per-section tally run on 2026-11-03 at `main` `e2e81e1`: Cosmetic and structural 11, Design decisions 9, Ungrouped 5, Tooling 4. Those sections sum to 29, which matches a `grep -c '^20[0-9][0-9]-'` over the file. The user was offered three units and picked the recommended one, Cosmetic and structural plus the 3 Ungrouped test-guard items.

The 11 Cosmetic and structural items, with citations as their backlog lines give them:

- C1 `src/main/beachcomber/paths.ts:53-58`: move the orphaned `decodeDirectoryName` docblock back above its function at `:124`.
- C2 `src/renderer/src/helm/HelmPanel.tsx:62`: `lastAction` has three values. Either collapse them or test them. Only `'compare'` has a test, and `'other'` and `null` behave identically.
- C3 `src/main/ipc/index.ts:9-15`: merge the two consecutive `./validate` re-exports.
- C4 `src/renderer/src/beachcomber/BeachcomberGroupHeader.tsx:63`: route the "Select all in …" sentence through `copy.ts`, as every other user-visible string already is.
- C5 `src/renderer/src/beachcomber/BeachcomberRefusals.tsx:36-38`: make a Beachcomber refusal name the entry it refers to. Today only `{refusal.reason}` renders.
- C6 `src/renderer/src/lanes/LaneRail.module.css:163-165`: give the selected Matriarch a distinct hover surface. `.rowMain:hover` paints `--oc-bg-hover`, and `:138` and `:142` already use that same token for that row, so hover feedback vanishes there.
- C7 `src/renderer/src/lanes/LaneRail.module.css:163-165`: lane hover should paint the full-width swimlane, not an inner rectangle. `.rowMain:hover` paints only the button box.
- C8 `src/renderer/src/lanes/LaneRail.module.css:216`: add `flex: none` to the lane status `.dot`, matching what `PodBar.module.css:123` has on its status dot.
- C9 `src/renderer/src/lanes/LaneRow.source.test.ts:45`: narrow the check. It bars `useState`/`useEffect`/`useRef` more broadly than its criterion requires, so it will go red on a legitimate future `useRef`.
- C10 `tests/unit/store/migration-2.test.ts:104`: delete the migration-1 byte-identity test, which `migration-frozen.test.ts` fully subsumes.
- C11 `use-dialog-focus.ts`: move it from `beachcomber/` to `shell/`, and adopt it in `DeletePodDialog` and `NewPodDialog`, which have none of its three behaviours. Its one consumer today is `BeachcomberPreviewDialog.tsx:45`.

The 3 Ungrouped test-guard items:

- U1 `src/renderer/src/__tests__/hygiene.test.ts:1331`: the retired-id offender scan uses `text.includes(literal)`, so it flags a live id that merely extends a retired one. Make it match the quote-delimited literal instead, the same shape D15 fixed in `retiredLiteralUseReport`.
- U2 `src/renderer/src/pods/PodBar.styles.test.ts` (the test at `:469`): relax or document the border-width predicate. It rejects a multi-value longhand such as `border-width: var(--oc-border-hairline) 0`, which the `PodBar.module.css` docblock permits. No such declaration exists today.
- U3 `tests/unit/store/migration-2.test.ts:104`: make the test skip in a shallow clone, as `migration-frozen.test.ts` now does. This is needed only if C10 does not delete the test first.

The full wording of each item is on its backlog line.

## Decisions

- Track: Standard. The work produces 14 independent claims that can each be checked, so the "count the judgments" rule of scope routing applies.
- Session name: `cosmetic-structural-sweep`.
- Scope: the 11 Cosmetic and structural lines and the 3 Ungrouped lines named above. The other 2 Ungrouped lines, the Design decisions section and the Tooling section are out of scope.
- Every citation is re-measured against the current tree before it is acted on, and line numbers in particular have likely drifted. Literals are read from `git show <base>:<path>` at the moment a criterion quotes them (per `.sir/lessons.md`, 2026-11-03 prose-drift-sweep), and contract or type names are checked the same way (per `.sir/lessons.md`, 2026-11-03 correctness-sweep). An item whose claim no longer holds is closed as already resolved, not worked.
- U3 is expected to be closed as moot by C10's deletion. Spec confirms this. If C10 turns out not to hold, U3 is worked instead.
- Some items need a decision, and spec settles each one through `sir-inference` from repository evidence, escalating only if the ladder cannot settle it. They are C2 (collapse or test), U2 (relax or document), C6 (which token gives the selected Matriarch a distinct hover surface; it must be an existing `--oc-*` token, and no raw colour is allowed under the project's token hygiene guards), C7 (how the hover reaches the full swimlane width) and C5 (which field of a refusal names its entry).
- Visual CSS changes (C6, C7, C8) are covered by the project's existing stylesheet-test pattern, which reads the module CSS and asserts the declaration. A stylesheet scanner carries both a must-match fixture and a near-miss fixture (per `.sir/lessons.md`, 2026-11-03 tests-and-guards-sweep).
- C11 is a behaviour change for two dialogs. Each adopting dialog gets tests for the hook's three behaviours, and each test has a red step or an injected defect.
- Every new or narrowed guard (C9, U1, U2) carries a positive control: a must-match case that the guard catches, plus a near-miss that it must not catch. A "found nothing" result carries a predicted count.
- C4's new copy key, and C5's rendered name, go through `copy.ts` under its existing conventions.
- The DAG tail runs a repo-wide `tsc` typecheck and the full test suite, because vitest does not typecheck. C3 and C11's move both change import surfaces.
- Any count restated in code or comments is derived afresh and attributed to the command that produced it.
- At Gate 3, each closed item's backlog line is removed. Any item found invalid is reported rather than silently dropped.
