# Remove Helm's dormant warning plumbing

Remove the `warning` severity path from Helm's save pipeline, end to end. No validator has
produced a `warning` since the `crossSessionInbound: hold` warning was removed, so the path
is code that nothing real exercises.

## Context

- Backlog line (`.sir/backlog.md`, Ungrouped, 2026-11-05, `20261105-0107-design-decisions-sweep`):
  "Decide whether to keep or remove Helm's dormant warning plumbing (`HelmValidationSeverity
  'warning'`, `HelmSaveResult.warnings`, `warningIssues` at `src/main/helm/validate.ts:113`,
  consumed at `src/main/helm/helm-service.ts:240`, renderer notice tested only synthetically)".
- I re-measured it at `main` 3cb07f5 on 2026-11-06:
  - `grep -rnE "severity: *'warning'" src --exclude='*.test.*'` prints nothing (exit 1).
  - As a check that the search works, `grep -rnE "severity: *'error'" src --exclude='*.test.*' | wc -l` prints 16.
  - Without the exclusion, `grep -rnE "severity: *'warning'" src | wc -l` prints 1. That one site is the synthetic test.
- Files that name the plumbing (`grep -rnlE "warningIssues|HelmSaveResult|\.warnings" src`):
  `src/main/helm/helm-service.ts`, `src/main/helm/validate.ts`, `src/preload/api.ts`,
  `src/renderer/src/contracts/renderer-panels.ts`, `src/renderer/src/helm/HelmNotices.tsx`,
  `src/renderer/src/helm/HelmPanel.tsx`, `src/renderer/src/state/panel-store.ts`,
  `src/renderer/src/test-utils/stub-api.ts`, `src/shared/contracts/helm.ts`.
  Tests and docs that mention it are not in that list, and spec must survey them.
- Docblocks that describe the error/warning split: `src/main/helm/validate.ts:1-14`
  (see line 4) and `src/shared/contracts/helm.ts:241` (the "`warning` does not: it is reported
  to the user" sentence). The `:37` comment ("a warning — never a silent overwrite") may be
  unrelated, so spec must read it before touching it.
- `.sir/lessons.md` 2026-11-05 (design-decisions-sweep): a name search for callers of the
  `warning` plumbing was refuted at Gate 3 as `called (pre-existing)`. Spec must count
  callers by reading the code, not only by searching for names.

## Decisions

- Gate 1: **remove** the plumbing. The user chose this over keeping it as a documented extension point and over giving it a producer.
- Track: Standard. The change touches a shared contract (`src/shared/contracts/helm.ts`) and spans main, preload and renderer.
- Scope of the removal: the `'warning'` member of `HelmValidationSeverity`, `HelmSaveResult.warnings`, `warningIssues`, the
  service's `warnings:` field, the renderer's warnings notice branch and heading copy, the stub's and preload's matching fields,
  and the synthetic tests that exist only to drive the warning path.
- Docblocks that describe a `warning` severity are reworded to say that every validation issue blocks the save.
- Out of scope: any new validation rule; any change to `error` behaviour; the remaining backlog items.
- Closing: the backlog line above is removed at Gate 3 once the removal merges.
