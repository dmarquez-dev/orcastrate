# Backlog

<!-- Project-level, not session-level. Append one line per item at Gate 3,
     after approval: the date, the session id, and the action in a
     sentence. Never create this file when there is nothing to append. -->

<!-- Example: 2026-10-26 oauth-login Defer rate-limiting the refresh endpoint to a later session. -->

<!-- Seeded 2026-10-29 from the open items of the previous framework's backlog
     (.dir-sdlc/backlog.md and .dir-sdlc/handoff-after-keyword-sweep.md), every
     file:line citation re-measured against the tree that day. Session ids
     dir-audit-2026-10-09, dir-handrun-2026-10-07 and dir-handoff-2026-10-26
     name DIR blocks that had no session of their own. -->

## Correctness

## Tests and guards

## Prose drift

## Cosmetic and structural

## Design decisions

2026-09-01 2026-08-31-orcastrate-helm-draft-safety Decide whether to restore the re-click-to-close gesture on `PanelBar`'s per-panel button, removed because the frozen contract forbade a dialog on re-click; the strip close button and Escape both survive.
2026-10-07 dir-handrun-2026-10-07 Decide whether to re-verify Helm's `hold` value set against the current CLI, since the warning names `OBSERVED_CLI_VERSION` 2.1.235 (`src/main/helm/validate.ts:31`) and reads as stale.
2026-10-09 dir-audit-2026-10-09 Run the palette-wide status lightness pass, with the user deciding per pair, including whether the hygiene guard should assert measured separation and whether a stopped Pod's tab should read grey where its Matriarch reads tan; worst shipped pair `idle`/`beached` 1.005, seven of 28 pairs under 1.2 (`src/renderer/src/styles/tokens.css:88-92`).
2026-10-09 dir-audit-2026-10-09 Decide on direct Calf steering, still unimplemented (`src/main/pod/pod-runner.ts:486` returns `{ supported: false }`).
2026-10-09 dir-audit-2026-10-09 Decide on `forkSession` branching, which has no reference anywhere in `src/`.
2026-10-09 dir-audit-2026-10-09 Decide on the full config manager deferred by the MVP.
2026-10-09 dir-audit-2026-10-09 Decide on adopting terminal-started Claude Code sessions, deferred by the MVP.
2026-10-09 dir-audit-2026-10-09 Decide on a raw terminal pane per lane, deferred by the MVP.
2026-10-09 dir-audit-2026-10-09 Decide on macOS and Linux validation, deferred by the MVP.
2026-11-04 20261104-1727-tooling-ungrouped-sweep Decide whether to adopt a formatter repo-wide. The repository has no Prettier config or dependency; under Prettier 3.9.10 defaults, 318 of 318 tracked `src/` and `tests/` `.ts`/`.tsx` files fail `--check` (`npx prettier --list-different --end-of-line auto`, batched over `git ls-files`), and 166 of 318 still fail with `--single-quote --print-width 100`. Run from a cwd under the git-ignored `.claude-worktrees/`, Prettier skips every file and reports success, so run the check from the main checkout.

## Tooling

2026-10-26 dir-handoff-2026-10-26 Build a live-`claude` hand-run harness, checking first whether the app's own IPC can reach a state; still unexercised are `B5`, the same-millisecond backup collision, `D3`, and narrow-window layout.

## Ungrouped (Gate 3 appends land here)
