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
2026-11-05 20261105-0107-design-decisions-sweep Decide whether to keep or remove Helm's dormant warning plumbing (`HelmValidationSeverity 'warning'`, `HelmSaveResult.warnings`, `warningIssues` at `src/main/helm/validate.ts:113`, consumed at `src/main/helm/helm-service.ts:240`, renderer notice tested only synthetically): no producer remains, since `grep -rnE "severity: *'warning'" src --exclude='*.test.*'` prints nothing.
2026-11-05 20261105-1907-fork-session-branching Human check not made at Gate 3: run `npm run dev` in the repository root and check that the ⑂ Fork glyph on a Pod tab shows as a fork mark (not a missing-glyph box) at the same size as ▶ and ×.
2026-11-05 20261105-1907-fork-session-branching Human check not made at Gate 3: run `npm run dev` in the repository root and check that, on a Pod with no session and on a running Pod, the Fork control looks dimmed with a not-allowed cursor and that hovering shows the reason tooltip.
2026-11-05 20261105-1907-fork-session-branching Human check not made at Gate 3: run `npm run dev` in the repository root, fork a Pod, hover the fork's tab, and check that the native tooltip reads "Forked from <parent title>".
2026-11-06 20261106-0120-fork-hardening Human check not made at Gate 3: run `npm run dev` in the repository root, make a fork fail, and check that the `×` dismiss button sits on the same line as the error text, vertically centred, and is readable in both light and dark themes.
2026-11-06 20261106-0120-fork-hardening Human check not made at Gate 3: run `npm run dev` in the repository root, make a fork fail, and Tab to the `Dismiss fork error` control. Check that the focus ring is visible, that Enter closes the alert, and that the ring then appears on the Pods chrome container.
