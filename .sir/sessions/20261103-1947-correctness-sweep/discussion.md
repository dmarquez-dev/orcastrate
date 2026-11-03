# Correctness sweep

Clear the 8 open **Correctness** items in `.sir/backlog.md`, plus the 3 Ungrouped docblock-prose items: 11 items in total.

## Context

The user is working through `.sir/backlog.md` one unit at a time. The two previous sessions cleared Prose drift (`20261102-2224-prose-drift-sweep`) and Tests and guards (`20261103-1657-tests-and-guards-sweep`). At this Gate 1 the backlog held 39 open items, counted by an `awk` per-section tally on 2026-11-03 at `main` `df6c3d2`: Correctness 8, Cosmetic and structural 11, Design decisions 9, Ungrouped 7, Tooling 4. The sections sum to 39, which matches a `grep -c '^20[0-9][0-9]-'` over the file. The user was offered four units and picked Correctness together with the 3 Ungrouped prose items.

The 8 Correctness items, with citations taken from their backlog lines:

- `src/main/helm/helm-service.ts:83`: `BackupSequence` is per-instance, so two `Helm` services on one settings file could collide within a single millisecond. Nothing constructs two today.
- `src/renderer/src/helm/HelmPanel.tsx:84` and `:152`: the "a failure renders on exactly one surface" invariant holds only through a reachability argument. The fix is to make it hold by the shape of the code.
- `src/main/beachcomber/paths.ts:117-120`: `podBlockerFor` has to choose which Pod to name when one Pod matches by encoding and another by normalized path. Blocked-ness is already correct; only the identity shown in the banner is in question.
- `src/main/beachcomber/service.ts:177-179`: `buildEntry` gives every root other than `projects` the value `pathSource: 'decoded-name'`, so the "path is a guess" caveat appears wrongly under three of the four roots.
- `src/main/store/schema.ts:256-257` (and its docblock at `:252-255`): `_UncoveredAtSchemaHead` is inert. The docblock is also keyed to migration 2's list, but migration 3 is the schema head.
- `src/main/store/schema.ts:344` and `:382`: the `LANE_KINDS` and `EVENT_TYPES` interpolations in `MIGRATION_1` are live and should be pinned the way the other enums are. The problem is latent today.
- `src/renderer/src/state/store.ts:674`: the `setPermissionMode` action has no caller. Wire it up or remove it.
- `src/renderer/src/shell/PanelBar.tsx:89`: either cite a source showing `aria-current="false"` is valid ARIA, or omit the attribute.

The 3 Ungrouped prose items:

- `src/renderer/src/contracts/renderer-panels.ts:425-434`: the PANEL-CLOSE entry should name the second early return in `resetHelmForReopen`, the `this.api === null` case at `src/renderer/src/state/panel-store.ts:336`.
- `src/renderer/src/composer/Composer.styles.test.ts:56-59`: reword the "impossible case" sentence so that it cannot be read as covering empty values.
- `src/renderer/src/helm/rules.ts:16`: change `discrimination.test.ts` to `discrimination.test.tsx`.

The full wording of each item is on its backlog line.

## Decisions

- Track: Standard. The work produces 11 independent claims that can each be checked, which falls under scope routing's "count the judgments" rule.
- Session name: `correctness-sweep`.
- Scope: the 8 Correctness lines plus the 3 Ungrouped prose lines named above. The other 4 Ungrouped lines and every other section are out of scope.
- Every citation is re-measured against the current tree before it is acted on. Literals are read from `git show <base>:<path>` at the moment a criterion quotes them (per `.sir/lessons.md`, 2026-11-03 prose-drift-sweep). An item whose claim no longer holds is closed as already resolved, not worked.
- Items that are decision-shaped are settled in spec through `sir-inference` from repository and external evidence, and escalated only if the ladder cannot settle them. These are `podBlockerFor`'s choice of Pod, `setPermissionMode` wire-or-remove, `aria-current` cite-or-omit, and the Helm backup ordinal's scope.
- Correctness fixes change runtime behaviour where the item requires it. Each fix carries a positive control, a red step or an injected defect that the new or changed test catches, following the project's "verify your instrument" lesson. A "found nothing" result carries a predicted count.
- Prose items change only comments and docblocks. Their criteria quote the target text read from the base commit.
- The DAG tail carries a repo-wide `tsc` typecheck and the full test suite. Vitest does not typecheck, so the `_UncoveredAtSchemaHead` fix in particular has to be proven by a compile failure under an injected uncovered value.
- Any count restated in code or comments is derived afresh and attributed to the command that produced it.
- At Gate 3, each closed item's backlog line is removed. Any item found invalid is reported rather than silently dropped.
