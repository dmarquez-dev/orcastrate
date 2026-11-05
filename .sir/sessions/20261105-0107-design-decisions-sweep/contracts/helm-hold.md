<!-- frozen: 20261105-0107-design-decisions-sweep, Gate 2 -->

# Contract: `crossSessionInbound: 'hold'` is a confirmed value (item 2)

Markdown, because the item-2 contract change is a set of deletions and docblock rewrites in
two frozen TypeScript files that already exist in the source tree. Both files remain the
importable declarations, and no consumer re-declares anything they hold.

Owner of both frozen-contract edits: **T4**. Consumers that stop importing the deleted names:
**T2** (`src/main`) and **T3** (`src/renderer`). T4 runs after both, so every commit
typechecks.

## Evidence the docblocks cite

The installed CLI is `claude --version` → `2.1.318 (Claude Code)`. Its binary
(`C:/Users/dmarq/.local/bin/claude`) embeds `VERSION:"2.1.318"`, declares
`["accept","hold","refuse"]` as the value set of the `crossSessionInbound` setting, and
describes `'hold'` as parking cross-session messages for review without letting Claude act.
(Re-measured by sir-architect at decomposition with `grep -a -o` over the binary.)

## `src/shared/contracts/helm.ts`

Kept, unchanged:

- `CROSS_SESSION_INBOUND_VALUES = ['accept', 'hold', 'refuse'] as const` and
  `type CrossSessionInbound`. This is now the only value-set declaration.
- `HelmManagedFields.crossSessionInbound: CrossSessionInbound | null`.
- `type HelmValidationSeverity = 'error' | 'warning'`, `HelmValidationIssue`,
  `HelmValidation`, `HelmSaveResult.warnings: HelmValidationIssue[]`. The generic warning
  plumbing is contract vocabulary and stays.

Deleted:

- `CROSS_SESSION_INBOUND_CONFIRMED`. Once `hold` is confirmed it would equal
  `CROSS_SESSION_INBOUND_VALUES` exactly, and an equal second list is a second source of
  truth with nothing to keep the two in step.

Docblocks:

- Above `CROSS_SESSION_INBOUND_VALUES` (base `:130-144`): cites CLI 2.1.318 and what the
  binary was observed to declare (above). It no longer cites 2.1.235 and no longer calls
  `hold` unconfirmed.
- `HelmValidation` (base `:248-252`): `error` blocks the save and `warning` does not. It no
  longer gives `hold` as the example of a warning.

## `src/renderer/src/contracts/renderer-panels.ts`

Deleted:

- `CROSS_SESSION_HOLD_CAVEAT` (base `:617-618`).
- `PANEL_TEST_IDS.helmCrossSessionCaveat` (base `:597`). After this change nothing renders
  it.

Kept, unchanged: `PANEL_TEST_IDS.helmCrossSession` and `UNVERIFIED_PATH_NOTICE`. The
docblock above the copy constants (base `:610-613`, "the two statements") is updated to
match the one constant that remains.

## Validation behaviour consumers implement

- **Main** (`validateSaveRequest`, T2). `crossSessionInbound` in `{accept, hold, refuse}` or
  `null` produces no issue. Any other value produces one issue
  `{ field: 'crossSessionInbound', severity: 'error' }` and blocks the save. That branch is
  unchanged. `save()` with `hold` writes the value and returns `warnings: []`.
- **Renderer** (`validateDraft`, T3). `crossSessionInbound` contributes no issue for any of
  the three values.
- **Form** (`CrossSessionInboundField`, T3). It offers all three values, as before. `hold`
  is rendered and described like its siblings: a label and a hint
  (`CROSS_SESSION_HINTS.hold`), and nothing else. The form still never preselects a value.
- After this session neither validator emits `severity: 'warning'`. The type,
  `warningIssues`, `HelmSaveResult.warnings` and the renderer's warning notice stay in
  place, unused by any producer. This is reported at Gate 2 and not resolved here.
