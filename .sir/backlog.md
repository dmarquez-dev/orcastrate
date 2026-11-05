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
2026-11-05 20261105-1907-fork-session-branching Decide whether a fork's remapped event payloads must stay byte-identical: `remapPayloadLanes` writes them back with `JSON.stringify` (`src/main/store/sqlite-event-store.ts:582`), so they keep their meaning but not their stored text, and the store-fork contract says only "nothing else in the payload changes".
2026-11-05 20261105-1907-fork-session-branching Make `forkPod`'s lane remap fail loudly on an unmapped id: `const remap = (id: LaneId): LaneId => laneMap.get(id) ?? id` (`src/main/store/sqlite-event-store.ts:291`) silently leaves a payload lane reference pointing at the parent's lane.
2026-11-05 20261105-1907-fork-session-branching Guard `PodManager.forkPod` against a fork port that returns an empty id or the parent's own `ccSessionId`: the result of `this.#forkSession(...)` (`src/main/pod-manager/pod-manager.ts:549`) goes into `store.forkPod` unchecked.
2026-11-05 20261105-1907-fork-session-branching Let a refused fork's alert be dismissed or expire: `setForkError(null)` runs only when the next fork starts (`src/renderer/src/pods/PodsChrome.tsx:95`), so the `role="alert"` paragraph stays on screen until then.
2026-11-05 20261105-1907-fork-session-branching Test, or reconsider, `forkAncestryFor`'s non-null-but-unlisted parent branch, which renders "Forked from a deleted Pod" (`src/renderer/src/pods/fork-control.ts:65`): `src/renderer/src/__tests__/pod-fork.e2e.test.tsx:351` covers only the null-parent branch.
2026-11-05 20261105-1907-fork-session-branching Reword design doc item 8's claim that `forkSession` "returns its id before any CLI process runs" (`docs/superpowers/specs/2026-08-18-orcastrate-design.md:464`): `probe/verify-fork-session.ts` shows only that the fork transcript exists before the first resume (C2).
2026-11-05 20261105-1907-fork-session-branching Human check not made at Gate 3: run `npm run dev` in the repository root and check that the ⑂ Fork glyph on a Pod tab shows as a fork mark (not a missing-glyph box) at the same size as ▶ and ×.
2026-11-05 20261105-1907-fork-session-branching Human check not made at Gate 3: run `npm run dev` in the repository root and check that, on a Pod with no session and on a running Pod, the Fork control looks dimmed with a not-allowed cursor and that hovering shows the reason tooltip.
2026-11-05 20261105-1907-fork-session-branching Human check not made at Gate 3: run `npm run dev` in the repository root, fork a Pod, hover the fork's tab, and check that the native tooltip reads "Forked from <parent title>".
