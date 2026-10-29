# Census root hygiene

Make the six source-scanning test files under `src/renderer/src` locate the tree they scan from their own file location, so a run whose cwd is another valid checkout fails loudly instead of silently measuring the wrong commit; bundle four precision fixes in `hygiene.test.ts`.

## Context

Six test files take their scan root from `process.cwd()`. Vitest's `--root` does not change cwd, so a run with cwd in a *different valid* checkout scans that checkout. The existing non-empty guards only tell "a tree" from "no tree": the handoff's Case B (cwd = a worktree at `6914e49`, root on `main`) went 1 failed / 36 passed with six phantom offenders and both non-empty guards green. The geometry is live in this session too. With cwd in the main checkout and `--root` on the session worktree, two of the six files passed today (2 files / 7 tests) while reading the main checkout's tree.

The repo already has a self-locating idiom, `fileURLToPath(new URL(…, import.meta.url))` (`tests/router/helpers.ts:27`). It can't be imported statically in these six files: `tsconfig.web.json` sets `"types": []` and the renderer hygiene forbids a literal `node:` specifier.

## Definition of done

- [ ] DoD1: None of the six files calls `process.cwd()` in code; each derives its scan root from its own `import.meta.url`.
- [ ] DoD2: Each of the six carries a guard that fails with a message containing `root mismatch` when the tree it scans is not the tree that contains the file. The guard is shown red in the mismatched geometry before the root conversion, green in the correct geometry, and green in both after.
- [ ] DoD3: A guard in `hygiene.test.ts` fails on any `*.test.ts(x)` under `src/renderer/src` whose code calls `process.cwd()`. It has a positive control, a `declare const process` near-miss, and a demonstrated injection.
- [ ] DoD4: With cwd = main checkout and `--root` = worktree, all six files pass. Their per-file counts match the cwd = worktree run.
- [ ] DoD5: The `BORDER_PROPERTIES` docblock and constant agree about the logical border forms. The docblock is narrowed (pinned at Gate 2) and names the logical forms as held by `CENSUS_BORDER_PROPERTIES`; the constant is unchanged.
- [ ] DoD6: The retired-test-id exemption self-check passes only when every code occurrence of the retired literal in the exempt file is the argument of an absence assertion.
- [ ] DoD7: The prose counts at `hygiene.test.ts` base `:850`, `:1170`, `:1341–1342`, `:1376` and `:1434–1435` (the last added at Gate 2) state the measured figures in the Assumptions table.
- [ ] DoD8: `npm run typecheck` (node and web) exits 0 and the full suite passes with no test removed, skipped or weakened.

## Scope

The six files named in the Assumptions table, and `src/renderer/src/__tests__/hygiene.test.ts` for DoD3, DoD5, DoD6 and DoD7. Two tasks, serialized because both own `hygiene.test.ts`: T1 (roots, guards, red/green), then T2 (reintroduction guard, bundled fixes, DAG tail).

### Not in scope

- `process.cwd()` under `tests/`. Those are Pod `cwd` options, plus `git show <blob sha>`, which reads content-addressed bytes and gives the same result from any checkout of this repo.
- The `toBeGreaterThanOrEqual(7)` floor at `hygiene.test.ts:852`. It is a floor, not a total; the measured total is 8.
- The palette pass, the commit-msg hook and the hand-run harness (handoff §4).
- Handoff Case B as an extra content-differing control. Skipped at Gate 2: the equality guard discriminates on geometry alone.

## Assumptions

| Question | Answer | Rung | Evidence |
|---|---|---|---|
| How many files derive a scan root from `process.cwd()`? | Six, all under `src/renderer/src`. Five use `ROOT = process.cwd().replace(…)` and one uses an `isolation.test.ts` template string. | 1 | Grep `process\.cwd\(\)` repo-wide (excl. `node_modules`, worktrees): src hits `hygiene.test.ts:94`, `Beachcomber.hygiene.test.ts:43`, `no-paths.test.ts:49`, `wording.test.ts:50`, `tool-summary.test.ts:43`, `isolation.test.ts:37` |
| Are the `tests/` hits the same defect? | No (near-miss). They are Pod `cwd` options, and `git show` by blob SHA is content-addressed. | 1 | `tests/unit/store/migration-2.test.ts:79`, `migration-frozen.test.ts:101`, `tests/unit/pod/errors.test.ts:46` |
| Does a `process.cwd` predicate risk false positives? | Yes, against the seven `declare const process` declarations (the six files plus `__tests__/harness.tsx:88`, which declares only `on`/`off`). The predicate must require the call. | 1 | Grep `declare const process` over `src/renderer/src` |
| Does `import.meta.url` typecheck under the renderer's compiler options? | Yes, as `string`, via lib.dom. | 1 | Scratch tsc 7.0.2 with `tsconfig.web.json`'s options: exit 0. Positive control `const n: number = import.meta.url` failed TS2322, exit 1 |
| How is `fileURLToPath` reached? | Through a dynamic import whose specifier is not a literal, the way these files already reach `node:fs`. | 1 | `Beachcomber.hygiene.test.ts:13-17,37-41`; `hygiene.test.ts:198-211,302-313` |
| Is `import.meta.url` a `file:` URL under jsdom? | Assumed yes. T1's red/green runs include the jsdom file `hygiene.test.ts`, which verifies it. | 4 | `hygiene.test.ts:1` carries `@vitest-environment jsdom` |
| Can a prefix check serve as the guard? | No. The worktree is nested inside the main checkout, so `startsWith` holds in the mismatched geometry. The guard is an equality. | 1 | `git worktree list`: `orcastrate/.claude-worktrees/census-root-hygiene` |
| Is the instrument runnable in the task's own conditions? | Yes. The worktree has no `node_modules` and resolves through the main checkout's. | 1 | Probes 2026-10-29: `npm --prefix <wt> test` 141 files / 2252 tests; `npm --prefix <wt> run typecheck` exit 0; cwd=main `vitest run --root <wt> wording + isolation` 2 files / 7 tests |
| Can result agreement across the two trees discriminate this session? | No. Both trees hold identical content, so the guards do the discriminating, and agreement (DoD4) is preserved behaviour. | 1 | Same probe; `git -C <wt> rev-parse HEAD` = `main` = `5e5e7d4` |
| How many shell module stylesheets are there? | 5 (`a11y`, `EmptyWorkspace`, `PanelBar`, `PanelRegion`, `WorkspaceLayout`). Beachcomber has 2 and Helm 1. | 1 | `ls src/renderer/src/shell/*.module.css` and `find … -name '*.css'` agree |
| How many bare `font-weight` declarations did the conversion remove? | Repo-wide 15 in 6 files: ten `600`, four `700`, one `400`. In `lanes/`, `pods/` and `transcript/`: 14 across 5 files. The 15th is `shell/EmptyWorkspace.module.css:15`. | 1 | Anchored `font-weight:` not `var(` over `*.module.css` at `10feee6^`. Near-miss: 25 `var(` weights excluded. At HEAD, 0 bare. Agrees with `.dir-sdlc/handoff-token-sweep.md:161` (one 400, four 700) |
| Are there logical border forms in the tree? | One: `BeachcomberPreviewDialog.module.css:61` `border-block`, already held by `CENSUS_BORDER_PROPERTIES`. | 1 | Grep `border-(block\|inline)…:` over `src/**/*.css` |
| Where does the retired literal appear in the exempt file? | Once in code: `LaneRail.test.tsx:180`, inside `queryAllByTestId(…)).toHaveLength(0)`. `:127` is a different string (near-miss). | 1 | Grep `lane-row\|pin` over the file |
| Are there stale "five" counts beyond the four sites? | Yes, one more: `hygiene.test.ts:1434-1435`, which repeats `:1170`'s figure. `:768`, `:771` and `:1994` count border widths, a different population. | 1 | `grep -n -i "\bfive\b\|four other"` over the file at base |

## Contracts

None. No declaration crosses a task boundary (`contracts/README.md`).

## Open questions

None outside Gate 2's decisions.
