# Permission modes from the SDK

Offer every permission mode `@anthropic-ai/claude-agent-sdk` declares for new Pods, with Orcastrate's
`PermissionMode` derived from the SDK's union and every runtime list held exact over it at build time.

## Context

SDK 0.3.235 declares `PermissionMode = 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan' | 'dontAsk' | 'auto'`
(`node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts:2193`). Orcastrate hand-pins four of them at
`src/shared/contracts/events.ts:157`, `src/main/pod/options.ts:29`, `src/main/ipc/validate.ts:76`,
`src/main/store/schema.ts` (live list `:75`, migration 3's pinned list `:280-285`, the schema-head guards
`:331-333` and `:345-347`) and `src/renderer/src/contracts/renderer-view.ts:175`, all read at base `3bb3007`.
Migrations 4 and 5 already exist (`schema.ts:768-774`), so the widening is migration **6**, and migration 5's
docblock (`schema.ts:727-735`) binds any later `pods` rebuild to carry both ancestry columns, the named FK
`fk_pods_forked_from_pod_id` and the index `idx_pods_forked_from`.

`ModelInfo.supportsAutoMode` (`sdk.d.ts:1283`) is not on the `system`/`init` message; it arrives in the
initialize handshake's `models` (`SDKControlInitializeResponse`, `sdk.d.ts:3718-3723`), which
`Query.supportedModels()` returns. `supportedCommands()` (`src/main/pod/sdk-bridge.ts:87-89`) is the in-repo
precedent for pulling per-Pod SDK data into main and pushing it to the renderer.

Source: backlog row "Offer every SDK permission mode" recorded by session 20261118-2121-helm-save-outcome-followups.

## Definition of done

1. `PermissionMode` in `events.ts` is a type-only alias of the SDK's `PermissionMode`.
2. Removing a mode from a local copy of the union fails `npm run typecheck` (injected, red step).
3. Adding a mode to a local copy of the union fails `npm run typecheck` (injected, red step).
4. The runtime guard accepts all six modes and rejects `manual`.
5. The IPC validator accepts six, rejects `manual`, and builds its message from `ALLOWED_PERMISSION_MODES`.
6. Migration 6 widens the `pods.permission_mode` CHECK to six without losing rows, the ancestry columns, the named FK or the index.
7. Migration 3 and `MIGRATION_3_PERMISSION_MODES` are not edited.
8. The permission-mode and pod-status schema-head guards are keyed to migration 6.
9. `PERMISSION_MODE_OPTIONS` holds six entries; `danger` is true on `bypassPermissions` only.
10. Main reads each Pod's `supportedModels()` answer and latest `init` model, caches the latest defined answer, and pushes it when it changes.
11. The renderer holds the latest pushed value (`null` before any push) and exposes it through `useAutoModeSupport()`.
12. With nothing cached, the New Pod dialog lists all six modes.
13. The dialog hides `auto` when the flag is false and shows it when true or null.
14. A selected `auto` that becomes hidden reverts to `default` and is never submitted.
15. Every docblock the session writes states its rule in place; no file under `src/` or `tests/` cites a session id or `.sir/` path.
16. `npm run typecheck` and the full suite pass at the tip.
17. The backlog row "Offer every SDK permission mode" is removed from `.sir/backlog.md` in the Gate 3 artifact commit.

## Scope

All six modes reach every layer: type, runtime guard, IPC validator, SQLite CHECK (via migration 6), and the
New Pod dialog. Auto-mode support is read in main, cached app-wide, pushed to the renderer, and used to hide
`auto` in the dialog.

### Not in scope

- F5: displayed `permissionMode` versus `init.permissionMode` (its own backlog row).
- Danger treatment for `dontAsk` or `auto`.
- A model picker, or any per-Pod `model` option.
- A pull of the cached flag on renderer start (the flag is push-only; see Assumptions).
- `tests/unit/store/migration-frozen.test.ts`'s `SHIPPED_BLOB` having no entry for migration 5 — carried to the backlog at Gate 3.

## Assumptions

| Question | Answer | Rung | Evidence |
|---|---|---|---|
| Which migration widens the CHECK? | Migration 6, a `pods` rebuild carrying both ancestry columns, the named FK and the index; migration 3 is never edited. The discussion said "migration 4"; 4 and 5 already exist. | repo | `src/main/store/schema.ts:768-774`, `:727-735` |
| What does "cached from another running Pod's `init`" mean? | The initialize handshake: `Query.supportedModels()` (the `models` list) together with the model id on the Pod's latest `system`/`init` message. | repo | `sdk.d.ts:3718-3723`, `:1283`; `src/main/pod/sdk-bridge.ts:84-89` |
| Which `ModelInfo` entry decides? | Entries whose `value` or `resolvedModel` equals the Pod's latest `init` model id; any `supportsAutoMode: true` gives true, else any `false` gives false, else unknown (show `auto`). | user | Gate 2 D1; `sdk.d.ts` ~:1253; `tests/fixtures/protocol/01-parallel-dispatch.ndjson:1` |
| How does the flag reach the renderer? | One new push channel, `push:autoModeSupport`; no invoke channel is added (stays 23). | repo | `tests/unit/ipc/channels.test.ts:45,51`; `failure-paths.e2e.test.tsx:604` |
| What does a renderer reload see? | `null`, so `auto` shows, until main's cached value next changes. | judgment | push-only design; the user's "when nothing is cached, show `auto`" |
| How long does the cache live? | The main process's lifetime; it outlives the Pod that produced it; the latest defined answer wins; `null` is never pushed. | judgment | — |
| What happens if the models read fails or times out? | One warn naming the Pod; the cache is unchanged; the dialog shows `auto`. | repo | `#readSlashCommands`, `src/main/pod-manager/pod-manager.ts:854-892` |
| Is `manual` accepted anywhere? | No. It is not in the SDK union and stays rejected at every layer. | repo | `sdk.d.ts:2193`; `events.ts:135-139` |
| How is "exact in both directions" spelled? | `satisfies readonly PermissionMode[]` plus `_AssertNever<Exclude<…>>` through a generic constraint, never an empty-array assignment. | repo | `schema.ts:306-314`, `:96-107` |
| Can tasks run concurrently? | The toolchain could, but T1→T2→T3 run in series: they are type-coupled through `src/shared`, and T1's injections into `events.ts` turn both typecheck programs red while they are live. | repo | `tsconfig.node.json`, `tsconfig.web.json` (`--noEmit`); manifest `dependsOn` |
| What order does the dialog show? | default, acceptEdits, plan, dontAsk, auto, bypassPermissions — the danger option stays last. | judgment | Gate 2 |

## Contracts

- [`contracts/permission-modes.ts`](contracts/permission-modes.ts) — the union, `ALLOWED_PERMISSION_MODES`, `requirePermissionMode`, `PERMISSION_MODE_OPTIONS` and the two new options (T1 → T3).
- [`contracts/auto-mode-support.ts`](contracts/auto-mode-support.ts) — `AutoModeSupport`, `useAutoModeSupport()`, and the stub emit seam (T2 → T3).

## Open questions

None outside Gate 2.
