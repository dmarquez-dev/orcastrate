# helm-save-outcome-followups

The work is to close the three Helm save-outcome follow-ups that `20261118-1810-helm-save-outcome-in-view` left in `.sir/backlog.md`, the rows at lines 39, 40 and 41 at `c40d1bb`. The user's new ask, fetching permission modes dynamically for new sessions, is filed as a backlog row at this session's Gate 3. This session does not build it.

## Context

Every anchor below was re-measured with `grep -n` at `c40d1bb` before Gate 1.

- **Row 39 (conflict messaging).** A rejected save states the same fact three times:
  - `COPY.conflictLead` at `src/renderer/src/helm/copy.ts:106`
  - main's message at `src/main/helm/helm-service.ts:189`, "changed on disk since it was loaded. Nothing was written."
  - the stale banner, `COPY.staleHeading`/`staleBody` at `copy.ts:119-120`, raised by `stale: conflicted ? true : current.stale` at `src/renderer/src/state/panel-store.ts:744`

  `COPY.conflictAdvice` begins at `copy.ts:117`. Row 39's own check: render a conflict in `HelmPanel.test.tsx` and assert that "changed" appears in exactly one banner.
- **Row 40 (scroll target).** `src/renderer/src/helm/useSaveOutcomeScroll.ts:51` runs `querySelector(SAVE_OUTCOME_SELECTOR)`. The selector is built from `helmBackupPath`, `helmError` and `helmConflict` (`:38-40`), so the first match in DOM order wins. A successful save clears `actionError` (`panel-store.ts:759`) but not a scope-listing `loadError`, and that error renders at `helmError` above Saved. Row 40's check: a `HelmPanel.test.tsx` test with `error` set and a successful settle asserts that the scroll target contains `helmBackupPath`.
- **Row 41 (docblock).** `src/renderer/src/helm/HelmPanel.test.tsx:9-10` says "the only component in this directory that calls a hook is `ConnectedHelmPanel`". That is false. The row's check: `grep -n "the only component" src/renderer/src/helm/HelmPanel.test.tsx` no longer finds the claim.
- **Lessons that bind this work.** `.sir/lessons.md:102`: `src/renderer/src/helm/rules.ts:172` fails any file that names `compare()` and also runs `useEffect`, `useLayoutEffect` or `useMemo`. `HelmPanel.tsx` calls `actions.compare()`, so any lifecycle logic goes in a hook file, as `useSaveOutcomeScroll.ts` does. Other binding lessons:
  - `.sir/lessons.md:99`: a Helm scope list is stale outside phase `'ready'`.
  - `.sir/lessons.md:103`: check a predicted human-check appearance against every state the control passes through.
- **Permissions finding (SDK `@anthropic-ai/claude-agent-sdk` 0.3.235, `node_modules/.../sdk.d.ts`).**
  - No method or init field lists permission modes. `PermissionMode` is a compile-time union of six modes (`sdk.d.ts:2193`): `default`, `acceptEdits`, `bypassPermissions`, `plan`, `dontAsk`, `auto`.
  - Orcastrate allows four, at `src/main/pod/options.ts:29`.
  - `SDKControlInitializeResponse` (`sdk.d.ts:3718`) carries commands, agents, output styles, models and account info, but no modes.
  - The only runtime signal is `ModelInfo.supportsAutoMode` (`sdk.d.ts:1283`), reached through `supportedModels()` or `initializationResult()` on a running `Query`. The New Pod dialog runs before any session exists, so it has no such signal.
  - Settings carry `disableAutoMode` (`sdk.d.ts:7467`) and `permissions.defaultMode` (`sdk.d.ts:5422`).
  - Widening the mode set touches several places:
    - the SQLite CHECK, pinned at `src/main/store/schema.ts:569` (`MIGRATION_3_PERMISSION_MODES`), which needs a migration 4
    - `requirePermissionMode`'s message at `src/main/ipc/validate.ts:76`
    - `PERMISSION_MODE_OPTIONS` at `src/renderer/src/contracts/renderer-view.ts:175`
    - the checklist at `src/shared/contracts/events.ts:152-157`

  The open backlog row F5 at `.sir/backlog.md:35` (reconciling the displayed `permissionMode` with `system`/`init.permissionMode`) is adjacent.

## Decisions

- Gate 1 approved the Standard track (user, Gate 1).
- E1 (`ambiguous`), user's answer: this session does Helm backlog rows 39, 40 and 41. The permissions ask goes to `.sir/backlog.md` at Gate 3.
- E2 (`external-contract`), user's answer: "dynamic" means offering every mode the SDK's `PermissionMode` union declares, with a type-level check that fails the build when the SDK adds or removes a mode. `auto` is hidden when the model's `supportsAutoMode` is false, once a session can report it. This answer is recorded on the deferred backlog row. It is not built here.
- The Gate 3 backlog row for the permissions ask carries the findings in **Context** above and E2's answer. It also carries the open sub-question E2 left: where the New Pod dialog gets `supportsAutoMode` before the Pod's first session exists (a cached value from another running Pod, a probe, or showing `auto` until the first `init`).
- Row 39's single statement is the conflict banner's lead plus `COPY.conflictAdvice`. On a rejected save, main's duplicate sentence is no longer shown under the lead and the stale banner is not raised. An on-disk change with no rejected save still raises the stale banner. The spec phase settles how main's sentence leaves the screen: dropped in main, or not rendered by the renderer.
- Rows 39, 40 and 41 are removed from `.sir/backlog.md` at Gate 3 if their checks pass. The citation re-check from `.sir/lessons.md:68` runs over the rows that stay open.
- Models: implementers on `opus`, `sir-reviewer` on `opus`, `sir-git` on `haiku` (Gate 1 default, not corrected).
- Expect one human check: a save rejected in the running app shows the conflict in one banner, with no stale banner beside it.
