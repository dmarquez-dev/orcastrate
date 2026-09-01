# Helm draft safety

Session `2026-08-31-orcastrate-helm-draft-safety` — sub-session C1 of the Large
routing over the 2026-08-20 deferral block.

## Problem

Helm loses a user's typed draft in situations where **nothing was written to disk**,
and the frozen contract promises a comparison view that cannot be built from the
actions it declares. Four backlog items, one problem.

1. **A failed reload discards the draft it could not replace.** `loadDocument()` at
   `src/renderer/src/state/panel-store.ts:554` patches `document: null, draft: null`
   on any failed load. `selectScope` and `reload` share that path (`:600-604`). For a
   scope *change* the clearing is correct — scope A's values under scope B's name is
   worse than losing them, and the frozen contract documents reload as discarding the
   draft. For a *failed reload* it is data loss: a user who follows the conflict
   banner's own advice, clicks Reload and hits `EACCES`, loses a draft to an operation
   that wrote nothing. This is the half of escalation-derived item that Gate 3 of
   session `2026-08-19-orcastrate-beachcomber-helm` did **not** accept.

2. **The contract promises a side-by-side that cannot be built.**
   `HELM_CONFLICT_CODE`'s docblock in `src/shared/contracts/helm.ts` says the panel
   "shows the current contents beside the pending edit". `HelmActions`
   (`src/renderer/src/contracts/renderer-panels.ts:243`) offers only `reload()`,
   self-documented as "Re-reads from disk, discarding the draft". No action fetches
   the fresh document *without* replacing the draft, so the promised comparison has
   no data source.

3. **Closing the Helm panel discards an unsaved draft.** `App.tsx:78-80` sets
   `setOpenPanel(null)` unconditionally; the panel unmounts and the draft goes with
   it. T9 of the original session declined this correctly, and its reasoning survives
   at `App.tsx:85-90`: `useHelm()` in `App` would issue the scope fetch and break the
   stated "neither panel's hook is mounted while its panel is closed" invariant.

4. **`HelmValidationIssue.field` documents five names; seven are emitted.**
   `src/shared/contracts/helm.ts:208`. Confirmed across two producers —
   `src/main/helm/validate.ts` (six, no `parseError`) and `validateDraft` at
   `panel-store.ts:767` (seven). Folded into this session only because it edits the
   same contract file as item 2; leaving it for C2 would race two sessions on
   `helm.ts`.

## Definition of done

1. A **failed same-scope reload keeps the draft**. A failed load for a *different*
   scope still clears it.
2. The contract's side-by-side is **buildable and built**: an action fetches the
   fresh document without replacing the draft, and the conflict banner shows them
   together.
3. **Closing the Helm panel with a dirty draft does not silently discard it**, and
   the shell never learns the word "draft".
4. `HelmValidationIssue.field` **documents all seven names** actually emitted.

## Not in scope

- Every other item in the 2026-08-20 deferral block. C2 takes the correctness and
  contract-comment sweep; C3 takes test/CI hygiene and cosmetics.
- The Electron hand-run, deferred by user decision to after C3.
- Narrowing `HelmValidationIssue.field` from `string` to a union. Deliberate:
  a union would make an eighth name a compile error and remove the pressure that
  keeps `issues.ts`'s `unplacedIssues` catch-all honest.

## Assumptions

| # | Assumption | Rung | Evidence |
|---|---|---|---|
| 1 | Track is Large; this is sub-session C1 of three | repo evidence | `log.md` Gate 1 entry; user decision recorded 2026-08-31 |
| 2 | Per-file test command is `npx vitest run <path>` | repo evidence | `package.json` exposes only `vitest run` / `vitest`; `vitest.config.ts` is a single project |
| 3 | The close guard is sited at `src/renderer/src/shell/panel-close-guard.tsx` | repo evidence | `shell/` already holds `PanelBar` and `PanelRegion` |
| 4 | `compare()` is not de-duplicated, unlike `refreshScopes` | judgment | `refreshScopes` de-dupes because a mount effect reaches it; `compare()` is user-triggered only |
| 5 | A guard that throws **fails open** — the panel closes | judgment | Stranding a user in a panel with no exit is worse than the draft loss the guard prevents |
| 6 | Item 4's stated consumer risk is already closed | repo evidence | `issues.ts:47 unplacedIssues` is a catch-all whose own header names both omissions; so item 4 is a pure doc correction, T1 only |

## Mechanical trap, flagged into the contract and T2's first criterion

`loadDocument` patches `selectedScopeId: scopeId` **before** it awaits. Comparing
against `state.helm.selectedScopeId` in the failure branch therefore always reports
"same scope", and would wrongly retain a draft across a scope change — inverting
item 1's own correctness condition. The previous id must be captured before that patch.

## Decomposition

Four waves: T1 → (T2 ‖ T3) → T4 → T5. Every contract edit is pulled into T1, so the
two files under contention are touched once by one task; implementation then splits
cleanly by directory.

| id | agent / domain | owns | dependsOn |
|---|---|---|---|
| T1 | dir-architect / architecture | `shared/contracts/helm.ts`, `renderer/src/contracts/renderer-panels.ts` | — |
| T2 | dir-frontend-engineer / frontend | `state/panel-store.ts`, `state/panel-provider.tsx`, + both tests | T1 |
| T3 | dir-frontend-engineer / frontend | `shell/panel-close-guard.tsx` (new) + test, `App.tsx`, `shell/PanelBar.tsx`, `shell/PanelRegion.tsx`, `shell/PanelBar.test.tsx`, `shell/App.smoke.test.tsx` | T1 |
| T4 | dir-frontend-engineer / frontend | `renderer/src/helm/**` | T1, T2, T3 |
| T5 | dir-test-engineer / test | `__tests__/failure-paths.e2e.test.tsx`, `__tests__/helm-draft-safety.e2e.test.tsx` (new) | T2, T3, T4 |

5 tasks, 16 owns globs, 57 acceptance criteria — counted from `manifest.json` at
Gate 2. Ownership sets are disjoint.
