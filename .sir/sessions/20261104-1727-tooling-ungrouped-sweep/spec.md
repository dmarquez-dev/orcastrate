# Tooling and Ungrouped sweep

Close every remaining Tooling and Ungrouped backlog item except the live-`claude` hand-run
harness: four fixes, two behaviour changes decided at Gate 1, and two items closed without code.

## Context

Base is `main` at `c5692ee`. `.sir/backlog.md` holds 4 Tooling and 4 Ungrouped items
(`grep -n` over lines 35-46). Gate 1 decided all eight: seven close here, the hand-run
harness stays. Re-measured in the session worktree at spec time (2026-11-04):

- `src/main/pod-manager/pod-manager.ts:510`: `closePod`'s guard is
  `pod !== null && pod.status !== 'beached'`, so a `closed` Pod re-runs the sweep,
  `updatePod` and the `podStatus 'closed'` push. `#stopRunningLanes` is already idempotent
  by its `'running'` filter (its own doc comment, `:523-536`).
- `src/renderer/src/pods/DeletePodDialog.tsx:96` calls
  `useDialogFocus(fallbackFocusRef, { open: podId !== null })`; the hook's effect
  (`src/renderer/src/shell/use-dialog-focus.ts:81-91`) depends on `[open, fallback, initialFocus]`,
  so a `podId` change A→B while open moves no focus.
- `src/renderer/src/pods/PodsChrome.tsx:206` gives `.chrome` `tabIndex={-1}`;
  `PodsChrome.module.css` has no focus rule; only the global
  `:focus-visible` (`styles/global.css:60`, outward 2px offset) reaches it.
- **Prettier.** The repository has no Prettier config and no Prettier dependency. Under
  Prettier 3.9.10 defaults, **318 of 318** tracked `src/` and `tests/` `.ts`/`.tsx` files
  fail `--check` (`--list-different --end-of-line auto`, batched over `git ls-files`), the
  dominant diff being `'` → `"`. With `--single-quote --print-width 100`, 166 of 318 still
  fail. Run from a worktree under the git-ignored `.claude-worktrees/`, Prettier 3 also
  skips every file and reports success without having checked anything.

## Definition of done

- [ ] D1. `.sir/disciplines/frontend.md` exists: a project discipline fragment (imperative rule list, per `sir-disciplines`) requiring an explicit guard that throws a named error when indexing or destructuring yields `T | undefined` under `noUncheckedIndexedAccess` (`tsconfig.web.json:24`), and stating that a non-null assertion or a type cast is not such a guard.
- [ ] D2. `.sir/config.json` registers that fragment as `"disciplines": { "frontend": ["frontend"] }`, keeps `git.branchPrefix` `"agent/"` and its `$comment`, and parses as JSON.
- [ ] D3. In `src/renderer/src/test-utils/stub-api.ts`, the three non-`projects` Beachcomber rows carry `pathSource: 'absolute-path'`, and the file contains no `'session-record'` on a non-`projects` row.
- [ ] D4. `PodsChrome.module.css` gives `.chrome` a `:focus-visible` rule drawn with `var(--oc-focus-ring)` and the inset `var(--oc-border-thick)` idiom of `shell/PanelBar.module.css:49-52`, introducing no colour literal and no new custom property; a test asserts the rule.
- [ ] D5. `closePod` on an already-`closed` Pod pushes no `podStatus`, calls no `updatePod`, and sweeps no lane; a `beached` Pod is still untouched; a first close still sweeps before it pushes.
- [ ] D6. `tests/unit/pod-manager/close-pod-lane-sweep.test.ts`'s whole-record count reflects D5, and a test fails if the re-push returns.
- [ ] D7. With `DeletePodDialog` open on Pod A, changing `pod` to Pod B without passing through `null` moves focus to the dialog element; open, trap and return-on-close behaviour is unchanged, and `NewPodDialog` and `BeachcomberPreviewDialog` behave as before.
- [ ] D8. `npm run typecheck:node` and `npm run typecheck:web` exit 0, and the full `vitest run` passes, on the session branch.
- [ ] D9. No `commit-msg` hook, `.githooks/` directory or `core.hooksPath` setting is added (orchestrator, from the session diff).
- [ ] D10. Gate 3 removes the seven closed items from `.sir/backlog.md` (Tooling: discipline, Prettier, commit-msg hook; all four Ungrouped) and appends one Design-decisions line: decide whether to adopt a formatter repo-wide, citing the 318/318 and 166/318 counts above (orchestrator).

## Scope

The seven items in D1-D10. The Prettier and commit-msg hook items close with no code change (Gate 2: Prettier declined because its premise was false, with the formatter question moved to the backlog; Gate 1: hook declined). Gate 2 also put a retitle of one stale e2e test title (`pod-stop.e2e.test.tsx:666`) into T1.

### Not in scope

- The live-`claude` hand-run harness (Tooling, its own session).
- All eight Design-decision backlog items.
- Formatting any file, and adding any formatter config.

## Assumptions

| Question | Answer | Rung | Evidence |
|---|---|---|---|
| For an already-closed Pod, skip only the push, or the sweep and `updatePod` too? | Skip the whole block: guard becomes not-`beached` and not-`closed`. The sweep finds nothing on a closed Pod and `updatePod` would rewrite the same value. | repo | `pod-manager.ts:510-518`; `#stopRunningLanes` doc `:523-536` ("IDEMPOTENT BY THE FILTER") |
| Which focus idiom does the PodsChrome container use? | `:focus-visible`, `outline: var(--oc-border-thick) solid var(--oc-focus-ring)`, `outline-offset: calc(var(--oc-border-thick) * -1)`: the inset ring the repo already uses for edge-flush elements. | repo | `shell/PanelBar.module.css:49-52`; `styles/global.css:55-64` |
| Does adding the fragment require touching `.sir/config.json`? | Yes. A fragment composes only when the config's `disciplines` map names it, so Gate 1's condition for editing the config is met. | repo | `sir-disciplines` Resolution, step 2 |
| How is a Prettier check made to see worktree files? | `--ignore-path <worktree>/.prettierignore` (absent file) and `--end-of-line auto` (working copies are CRLF, `core.autocrlf=true`). | repo | probe runs at spec time; `git ls-files --eol` |
| How does `useDialogFocus` learn of an A→B switch? | One new optional `DialogFocusOptions` member in the effect's deps; `DeletePodDialog` passes `podId`, not the `pod` object; omitted, behaviour is today's. | repo | `use-dialog-focus.ts:58-91`; three callers, two untouched |
| Can T1–T5 run concurrently? | Yes. Both typechecks are `--noEmit --composite false` and write nothing; vitest's only shared write is its order cache. No build step appears in any criterion. | repo | `tsconfig.node.json`, `tsconfig.web.json`, `package.json` scripts |
| Can a closed, never-opened Pod produce zero pushes? | Yes: `#dispose` returns at once with no session. | repo | `pod-manager.ts:809-811` |
| Can a `closed` Pod hold a `running` lane at runtime? | No; only at boot, where `reconcileStartup` orphans it. After T1 a user close no longer sweeps such a lane. | repo | `pod-manager.ts` boot sweep; no test pins the runtime case |
| How large does T6's full run get? | 147 files: 146 at spec time plus `PodsChrome.styles.test.ts`, the only new file any ownership set allows. | repo | spec-time `vitest run` summary; `owns` sets |
| Does the throw-rule apply where absence is legitimate? | No. T5 C2 scopes it to "absence would be a defect", so early returns on an empty list (`use-dialog-focus.ts:101`) stay legal. | judgment | confirmed by the user at Gate 2 |

## Contracts

See `contracts/`.

## Open questions

None. The Prettier item was decided at Gate 2: declined, with a Design-decisions backlog line on whether to adopt a formatter repo-wide.
