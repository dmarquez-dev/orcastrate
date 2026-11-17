# Forced load failure

Make the two open Retry-control human checks from session 20261112-0151-workspace-load-retry performable, so the user makes them at Gate 3 and their backlog rows can close, without building the planned dev switch.

## Context

- `.sir/backlog.md` holds two "Human check not made" rows from 20261112-0151-workspace-load-retry: (H1) the Retry button "reads as a button next to the message" and tabbing to it shows its `.action:focus-visible` ring unclipped by the item's border; (H2) the Retry control is "visible and legible in both the light and the dark theme". Both say nothing in the app can force the E8/E9/E10 load failure that renders Retry.
- Gate 1 chose an `ORCASTRATE_DEV_FAIL_LOAD` env var in main (E1), conditional on this phase first checking whether the app's own IPC can already force the failure. **It can, for E8 and E9.** Deleting a Pod with `window.orcastrate.pods.delete({ podId, deleteSession: false })` from the DevTools console bypasses the renderer store's `deletedPods` tombstone (`src/renderer/src/state/store.ts:249`, written only at `:705`), and no push tells the window, so the tab stays. Activating that never-activated tab runs `lanes.list` and `events.read` (`store.ts:790-805`), and main's `#requirePod` throws `no Pod with id <id>` for both (`src/main/pod-manager/pod-manager.ts:1114-1131`, `:1657`). `WorkspaceAlerts.tsx:95-103` then raises E8 and E9, each with Retry. So **the switch is not built and no production code changes.**
- The app has **no light theme**: one dark palette in a single `:root` block (`src/renderer/src/styles/tokens.css:14-16`, held by `tokens.test.ts:85-87`), and the only `prefers-color-scheme` text in `src/` is that comment. H2's "light theme" can only mean the OS light/dark preference the window sees, which no rule reads (precedent `FINDINGS-FORK-UI.md`, O12/O13). Whether that closes H2 is the user's call at Gate 3.

## Definition of done

Criterion ranges are recorded here so Gate 3 can join each item to its criteria.

1. A new driver `driver/run-forced-load-failure.mjs` exists under `.dir-sdlc/handruns/2026-09-30-electron-handrun/`, runs in a sandboxed profile against the worktree's own build, binds each report to its bundle and its own sha256, records its plan before running, and exits 2 on a bad invocation. (T1 C1-C7)
2. In that run, the console-delete route is measured against its prediction (a `fail` is a Gate 3 finding, per T1 C24): it leaves a stale tab, and clicking it raises exactly two error notifications reading `no Pod with id <target id>`, each with one Retry button between the message and the ×, while the live Pod raises none. (T1 C8-C13)
3. H1 is measured: Retry has its own border, background and pointer cursor; it sits right of the message; keyboard Tab reaches it with `:focus-visible`; the ring is painted at `--oc-border-thick` (2px) and lies inside the item's padding box and every clipping ancestor. Each measurement has an in-window control that fired. (T1 C14-C19)
4. H2 is measured: Retry's contrast is at least 4.5 under the emulated dark and light preferences, and its colours are identical under both. (T1 C20-C22)
5. At least four screenshots (dark and light, focused and unfocused); an exit code that reflects the verdicts; a `--skip-delete` run that fails O3 and exits non-zero; and every control undone. (T1 C23-C26)
6. `FINDINGS-FORCED-LOAD-FAILURE.md` records the verdict table, the skip-delete run, the E8/E9 attribution and that no route forces E10, with no `.sir/backlog.md` line numbers. (T1 C27-C28)
7. Where the harness blocks a write under `.dir-sdlc/handruns/`, the file arrives through the orchestrator's verbatim copy, with its sha256 recorded in `reviews/<task-id>.md`. (T1 C29, T2 C20)
8. No path under `src/` or `tests/` changes, so the switch is not built. (T1 C30, orchestrator half in `reviews/T1.md`)
9. `HUMANCHECKS-FORCED-LOAD-FAILURE.md` exists with the sections Before you start, Setup, H1, H2 and Cleanup. Its Setup covers `npm run dev`, the console, free titles, creating two Pods, the reload, and a title-guarded delete the user confirms first. It names every side effect of each step. (T2 C1-C10)
10. The recipe's H1 and H2 say what to look at. H2 states the single palette and how to switch the preference. Both cite the driven verdicts and screenshots. The recipe also states that E10 has no route, and it covers cleanup, including closing the `npm run dev` terminal. (T2 C11-C15)
11. The recipe cites no `.sir/backlog.md` line numbers, and every `src/…:<line>` it cites has been checked. (T2 C16-C17)
12. The handrun `README.md` gains one "Later runs in this directory" bullet for this run, and none of its existing lines change. (T2 C18-C19)
13. Gate 3: the user makes H1 and the result is recorded. (orchestrator; report and `coverage.md`)
14. Gate 3: the user makes H2 and the result is recorded. (orchestrator; report and `coverage.md`)
15. If both pass, the two 20261112-0151-workspace-load-retry "Human check not made" rows are removed from `.sir/backlog.md`. The end state reads "removed after approval". (orchestrator; `coverage.md`)

## Scope

One driver run plus its findings (T1), then the human-checks recipe that cites them (T2). Both are files under `.dir-sdlc/handruns/2026-09-30-electron-handrun/`.

### Not in scope

- The `ORCASTRATE_DEV_FAIL_LOAD` switch and its four tests. They lapse because the app's own IPC forces the failure (held by T1 C30).
- Forcing E10 (`app.routingMode`): no route exists, and neither row needs it.
- A light theme, or any change to the palette.
- Every other `.sir/backlog.md` row.

## Assumptions

| Question | Answer | Rung | Evidence |
|---|---|---|---|
| Can the app's own IPC force a Retry-bearing failure? | Yes, E8 and E9, by deleting a Pod from the console and then activating its stale tab | repo | `store.ts:249,705,790-805`; `pod-manager.ts:1114-1131,1657`; `WorkspaceAlerts.tsx:95-103`; preload `on:` channels carry no deletion push |
| Is the switch built? | No, per discussion.md's conditional decision | discussion | `discussion.md` Decisions; E1 |
| How is the theme switched? | It isn't: the app has one dark palette. "Light/dark" means the emulated or OS `prefers-color-scheme`, which no rule reads | repo | `tokens.css:14-16`; `tokens.test.ts:85-87`; `git grep prefers-color-scheme e539917 -- src` prints 1 line (the comment), and the `prefers-reduced-motion` near-miss matches 7 files |
| How does a person switch the preference? | DevTools Rendering, "Emulate CSS media feature prefers-color-scheme", or the Windows app mode. Not run in this session | judgment | — |
| What is the recipe's file name? | `HUMANCHECKS-FORCED-LOAD-FAILURE.md` in the handrun directory, following its `UPPERCASE-<SLUG>.md` names | repo | directory listing; Gate 1 named `.dir-sdlc/handruns/` |
| Can the driver run from the worktree? | Yes: playwright, electron and electron-vite resolve upward to the main checkout's `node_modules` | repo | the architect's `require.resolve` from the driver directory |
| Can the build run from the worktree? | Yes: `npm --prefix <worktree> run build` exits 0, writes `out/` (gitignored) and leaves the tree clean | repo | the spec-phase probe, `state.json` `verification` |
| Can two builds run at once in one worktree? | No: there is one `out/`, which the driver launches. Only T1 builds, and T2 follows T1 | repo | `driver/lib.mjs:7-8`; `package.json` `build` |
| Which defects are injected? | None into any file. T1's controls are in-window only (inline styles, an added `<style>`, a detached node, emulated media) | repo | manifest T1 C26 |
| What are the throwaway Pods titled? | `HC load companion`, `HC load live` (driver only) and `HC load target` | repo | precedent `docs/human-checks/chrome-alert-width.md` |
| What contrast threshold applies? | 4.5 | repo | `run-fork-ui.mjs` O12/O13 |
| May a harness-blocked write be copied in without a stop? | Yes: the orchestrator copies the agent's scratch text verbatim and records the sha256 in `reviews/<task-id>.md` (Gate 2 D2) | user | Gate 2 answer |
| What does a `fail` measurement mean for T1? | It is a Gate 3 finding, not an unmet criterion: C11-C22 are met by a valid measurement whose control fired (Gate 2 D3, C24) | user | Gate 2 answer |
| Why does the recipe create two Pods? | The first tab auto-activates (`store.ts:629-633`) and activation loads only once (`store.ts:798`), so the target must be a later tab | repo | as cited |

## Contracts

None. No runtime declaration crosses a task boundary: T2 reads T1's committed files by the names the manifest fixes.

## Open questions

- Whether "identical under both preferences, contrast ≥ 4.5" closes H2's "both themes" wording. The user decides at Gate 3.
