# Correctness sweep

Clear the 8 open Correctness items and the 3 Ungrouped docblock-prose items in `.sir/backlog.md`. That is 11 items.

## Context

The previous two sessions cleared Prose drift and Tests and guards. This session takes the Correctness section (`.sir/backlog.md:17-24`) and three prose lines from the Ungrouped section (`:65-67`). Every citation was re-measured at base `df6c3d2`, and all 11 claims still hold. None of them is closed as already resolved.

Five items change runtime behaviour: D1–D4 and D7. D5 changes a compile-time guard. D6 pins a migration's literals, and the rendered SQL stays byte-identical. D8 and P1–P3 change only comments.

## Definition of done

1. **D1.** Two `HelmService`s built by `createHelmService` on one settings file, both saving at one injected millisecond, leave two distinct backup files, each holding its own pre-save content. This is red at base, where the second backup clobbers the first.
2. **D2.** `HelmPanel` renders a failure sentence exactly once in its section in both former holes. Hole 1 is a stood compare error whose `draft` is then null. Hole 2 is a `refreshScopes` failure while the latch is `'compare'`. Both cases are red at base. The rule holds through `compareError`'s own definition, not through a reachability argument.
3. **D3.** `podBlockerFor` names the Pod matched by encoding over a Pod that matches only the decoded guess, whatever their order. This is red at base. Blocked-ness is unchanged: an entry is blocked iff either comparison matches any Pod.
4. **D4.** A non-`projects` Beachcomber entry carries a new `pathSource` value that is not `'decoded-name'`, so the "path not verified" caveat does not render for it. A `projects` entry without a session record still carries `'decoded-name'`. This is red at base.
5. **D5.** With a fifth `PermissionMode` member injected temporarily, `npm run typecheck:node` reports an error at the permission-mode schema-head guard in `schema.ts`. At base, the same injection reports none there. The guard and its prose are keyed to migration 3.
6. **D6.** `MIGRATION_1` interpolates migration-local frozen lists for lane kinds and event types. Its rendered SQL is unchanged by an injected extra member on the live `LANE_KINDS` or `EVENT_TYPES`, whereas at base it changes. `migration-frozen.test.ts` stays green.
7. **D7.** The renderer action `setPermissionMode` no longer exists in `store.ts` or in the `RendererActions` contract. The IPC channel, the preload method and the main handler are unchanged.
8. **D8.** `PanelBar.tsx`'s `aria-current` carries a comment citing WAI-ARIA 1.2 §6.7, which lists `false` as a valid value and as the default.
9. **P1.** The PANEL-CLOSE entry in `renderer-panels.ts` names `resetHelmForReopen`'s `this.api === null` early return (`panel-store.ts:336`).
10. **P2.** `Composer.styles.test.ts`'s "impossible case" sentence names the `undefined` capture, so it cannot be read as covering an empty value.
11. **P3.** The docblocks of `rules.ts:16`, `Helm.styles.test.ts:10` and `no-paths.test.ts:11` name `discrimination.test.tsx`. The last two were added at Gate 2: 3 sites at base, by `git grep` at df6c3d2.
12. **Tail.** At the session tip, `npm run typecheck` exits 0 and `npm test` exits 0.

## Scope

The 11 items above, plus the docblocks that each fix falsifies (named per task in `manifest.json`). At Gate 3, each closed item's backlog line is removed.

### Not in scope

- The other 4 Ungrouped lines (`.sir/backlog.md:68-71`) and every other backlog section.
- Cross-process Helm backup collisions. D1 makes the ordinal process-wide, not machine-wide.
- A UI affordance for changing an existing Pod's permission mode. That would be feature work, and D7 removes the unused action instead.
- Removing the `podSetPermissionMode` IPC channel, the preload method, the main handler or the runner method.
- The renderer stub's three non-`projects` rows at `src/renderer/src/test-utils/stub-api.ts:256-288`. They carry `pathSource: 'session-record'`, which matches neither base nor D4. Decided at Gate 2: carried to `.sir/backlog.md` at Gate 3.
- Two Pods that both match one `projects` name by encoding (`…\dir-ect` and `…\dir\ect`). This is undecidable from the name, and D3 keeps pod order for that case.

## Assumptions

| Question | Answer | Rung | Evidence |
|---|---|---|---|
| D1: what scope should the backup ordinal have? | Process-wide: one `BackupSequence` shared by every `Helm` instance. | 1 | `atomic-write.ts:33-39` requires the disk never be probed for a name, so sharing in memory is the only form that keeps rule 2. `createHelmService` (`helm-service.ts:268`) is the only constructor. Electron runs one main process. |
| D2: what shape closes both holes? | `compareError` is non-null only when `draft !== null` and `actionError` differs from the load error's message. | 1 | Hole 1: the comparison mounts only with a draft (`HelmPanel.tsx:152`), while the banner is suppressed whenever `compareError` is set (`:84`). Hole 2: a failed `refreshScopes` writes one sentence to both `error` and `actionError` (`panel-store.ts:551-552`). `HelmNotices.tsx:84` already deduplicates `actionError` against `loadError`. Both holes are written up at `.dir-sdlc/backlog.md:1477-1485`. |
| D3: which Pod does `podBlockerFor` name? | The exact match. An encoding match beats a match against a decoded guess. With no guess, the normalized match is already exact. | 1 | The function's own docblock (`paths.ts:86-91`) says encoding the cwd and comparing it to the on-disk name "is exact rather than conservative", whereas a decoded path is a guess (`beachcomber.ts:64-67`). |
| D4: is the fix a contract change or a renderer special case? | A contract change: a third `BeachcomberPathSource` member (the architect names it), set for every non-`projects` root. | 1 | `beachcomber.ts:66` defines `'decoded-name'` as "A GUESS". The non-`projects` `displayPath` is `join(rootPath, name)` (`service.ts:172`), which is not a guess. The renderer keys the caveat on `=== 'decoded-name'` (`BeachcomberRow.tsx:44`). The union is the app's own main↔renderer contract, not an external one. |
| D5: which migration is the permission-mode schema head? | Migration 3. | 1 | `MIGRATIONS` holds versions 1–4 (`schema.ts:645-649`). Migration 3 rebuilds `pods` with `MIGRATION_3_PERMISSION_MODES` (`:501`). Migration 4 rebuilds only `lanes` (`:594-605`). The `_AssertNever` spelling is proven non-vacuous at `:306-310`. |
| D6: will pinning rewrite migration 1's text? | No. The pinned lists are copied from today's values, and the frozen test reads its arrays from the shipped blob by name. | 1 | `tests/unit/store/migration-frozen.test.ts:100-131`. `schema.ts:192-196` deferred this pin only to keep a byte-identity failure attributable. |
| D7: wire or remove `setPermissionMode`? | Remove the renderer action and its contract member. | 1 | No component calls it (`git grep` at df6c3d2: the only callers are in `store.test.ts`). `failure-paths.e2e.test.tsx:149-150` says "No affordance changes an existing Pod's mode; the dialog's mode picker is create-time only". Wiring it would mean designing a new affordance. |
| D8: cite or omit `aria-current="false"`? | Cite. | 3 | WAI-ARIA 1.2 §6.7 `aria-current` (https://www.w3.org/TR/wai-aria-1.2/#aria-current) lists the values page, step, location, date, time, true and false, with false as the default. React renders a boolean `aria-*` as the strings `"true"` and `"false"`. |
| Scheduling: can T3 run alongside the others? | No. T3 runs alone, after T1, T2 and T4–T6, and T7 runs after T3. Decided at Gate 2. | 1 | T3 C2 temporarily injects `'dontAsk'` into `PermissionMode` (`events.ts:157`). While it is live, repo-wide `typecheck` is red, and T2, T4, T5 and T6 each carry a `typecheck` criterion. |
| Verification: can the worktree build and test? | Yes, both. | 1 | Probed at `df6c3d2` in the worktree. `npm --prefix <worktree> run typecheck` exited 0. `npm --prefix <worktree> test` ran 145 files and 2329 tests and exited 0. `git status --porcelain` was empty after the probe. |

## Contracts

See `contracts/` and `manifest.json`'s `contracts`, as the architect drafted them.

## Open questions

None.
