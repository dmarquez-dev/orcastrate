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

## Tooling

2026-10-26 dir-handoff-2026-10-26 Build a live-`claude` hand-run harness, checking first whether the app's own IPC can reach a state; still unexercised are `B5`, the same-millisecond backup collision, `D3`, and narrow-window layout.

## Ungrouped (Gate 3 appends land here)
2026-11-05 20261105-0107-design-decisions-sweep Kept deferred: direct Calf steering (`src/main/pod/pod-runner.ts:486` still returns `{ supported: false }`); the steering tools exist, and the open question is how a user-authored message sent by the host reaches an agent without becoming that agent's permission consent (`docs/superpowers/specs/2026-08-18-orcastrate-design.md:444-452`).
2026-11-05 20261105-0107-design-decisions-sweep Kept deferred: the full config manager (MCP servers, hooks builder, agent/skill browsing), MVP-deferred at `docs/superpowers/specs/2026-08-18-orcastrate-design.md:438`.
2026-11-05 20261105-0107-design-decisions-sweep Kept deferred: adopting terminal-started Claude Code sessions by scanning `~/.claude/projects/`, MVP-deferred at `docs/superpowers/specs/2026-08-18-orcastrate-design.md:437`.
2026-11-05 20261105-0107-design-decisions-sweep Kept deferred: macOS and Linux validation, MVP-deferred at `docs/superpowers/specs/2026-08-18-orcastrate-design.md:443`.
2026-11-09 20261109-1642-fork-ui-human-checks Human check not made at Gate 3: run `npm run dev` in the repository root, or open `.dir-sdlc/handruns/2026-09-30-electron-handrun/screenshots/fork-ui-recheck/O1-fork.png`, and check that the ⑂ on a Pod tab reads as a fork mark; driver O1 proves only that it is not the missing-glyph box and not blank.
2026-11-10 20261109-2239-fork-ui-followups Measure the fork-error row when the Pod tabs alone fill or overflow `.chrome`: `.chrome > :first-child` is `flex: 1 1 auto` (`src/renderer/src/pods/PodsChrome.module.css:15`) and `.dismissible` is `flex: 1 1 0` (`:41`) with no `min-width: 0`, so with negative free space the panel shrinks alone and still gives up the row's min-content width (the dismiss button plus about one glyph under `overflow-wrap: anywhere`); no driver observation covers it (O17 runs with 5 tabs and leftover space; check with `python -I` over `driven-report-fork-ui-followups.json` that `podBarWidthAlertShown` differs from `podBarWidthReference`).
2026-11-10 20261109-2239-fork-ui-followups Check whether the open-error and pods-error alerts squeeze the Pod tabs as the fork error did: both are bare `<p className={styles.listError} role="alert">` children of `.chrome` (`src/renderer/src/pods/PodsChrome.tsx:282`, `:309`), and `.listError` (`PodsChrome.module.css:18`) sets no `flex`, so each keeps the default `0 1 auto` basis of its whole one-line message; unmeasured (spec Not-in-scope item of this session).
2026-11-10 20261109-2239-fork-ui-followups Human check not made at Gate 3: run `npm run dev` in the repository root, make a fork fail, and hover the clamped fork-error text; check that the native tooltip shows main's whole message (`title={forkError}`, `src/renderer/src/pods/PodsChrome.tsx:294`); no driver observation measures it.
2026-11-10 20261109-2239-fork-ui-followups Human check not made at Gate 3: open `.dir-sdlc/handruns/2026-09-30-electron-handrun/screenshots/fork-ui-followups/03-s4-fork-error.png` and check that the two-line clamped fork error ending in "…" is acceptable as the only visible text.
