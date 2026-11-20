# Permission modes from the SDK

Offer every permission mode `@anthropic-ai/claude-agent-sdk` declares for new Pods, with Orcastrate's
allowed set derived from the SDK's `PermissionMode` union rather than kept by hand. Source: backlog row
`.sir/backlog.md:39`, recorded by session 20261118-2121-helm-save-outcome-followups (its E1, E2).

## Context

- SDK 0.3.235 (`node_modules/@anthropic-ai/claude-agent-sdk/package.json:3`) declares
  `PermissionMode = 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan' | 'dontAsk' | 'auto'`
  at `sdk.d.ts:2193`. It has no runtime list of modes, and `SDKControlInitializeResponse`
  (`sdk.d.ts:3718`, per the backlog row) carries none. `ModelInfo.supportsAutoMode?: boolean` is at
  `sdk.d.ts:1283`.
- Orcastrate allows four (`default`, `acceptEdits`, `plan`, `bypassPermissions`). Sites that pin
  them, read at `HEAD` (3bb3007) on 2026-11-19:
  - `src/shared/contracts/events.ts:157` — the union; its docblock at `:152-156` is the
    "adding a mode means" checklist and names `PERMISSION_MODES` in schema.ts, which is now
    `MIGRATION_3_PERMISSION_MODES` (`schema.ts:280`).
  - `src/main/pod/options.ts:29` — `ALLOWED_PERMISSION_MODES`, used by `isAllowedPermissionMode`
    (`:38`) and its error message (`:51`); re-exported from `src/main/pod/index.ts:15`.
  - `src/main/ipc/validate.ts:76` — `requirePermissionMode`'s hard-coded message, listing four.
  - `src/main/store/schema.ts:569` — the `pods.permission_mode` CHECK built from
    `MIGRATION_3_PERMISSION_MODES`; `:332` has an `Exclude<PermissionMode, …>` type check
    (`_UncoveredAtSchemaHead`, see `:260`, `:318-321`) that will fire once the union widens.
  - `src/renderer/src/contracts/renderer-view.ts:175` — `PERMISSION_MODE_OPTIONS`, rendered by
    `src/renderer/src/pods/NewPodDialog.tsx` (`:47` default, `:107` danger check, `:215` list) and
    pinned by `NewPodDialog.test.tsx:219-223` and `src/renderer/src/__tests__/wording.e2e.test.tsx:82-85`.
- Backlog row :39's check: removing a mode from a local copy of the union fails `npm run typecheck`,
  and a New Pod dialog test lists all six modes.

## Decisions

- Track: Standard (Gate 1, approved 2026-11-19).
- Derive Orcastrate's `PermissionMode` from the SDK union, with a type-level check that fails
  `npm run typecheck` when the SDK adds or removes a mode.
- Widen every pinning site listed above; the schema change is a new migration 4, and
  `MIGRATION_3_PERMISSION_MODES` and migration 3 are never edited.
- Hide `auto` in the New Pod dialog when `ModelInfo.supportsAutoMode` is false. Flag source:
  a value cached from another running Pod's `init`; when nothing is cached, show `auto`.
  (Gate 1 default, not corrected.)
- Danger treatment stays on `bypassPermissions` only; `dontAsk` and `auto` are not flagged as
  dangerous. (Gate 1 default.)
- F5 (`.sir/backlog.md:35`, displayed `permissionMode` vs `init.permissionMode`) is out of scope.
- Implementers and reviewers dispatch on `opus`; `sir-git` on `haiku`.
- The backlog row :39 is the row this session closes at Gate 3.
