# forkSession Pod branching

Let a user fork a Pod at its current state: one conversation becomes two divergent Pod tabs, each with its own transcript, and the `pods` table records where the branch came from.

## Context

- Design doc item 8 (`docs/superpowers/specs/2026-08-18-orcastrate-design.md:458-466`) defers Pod branching. It says three pieces are missing: the UI, the `pods`-table bookkeeping for a branch's ancestry, and a check that `forkSession` behaves as documented. The check is the first step, not an assumption the rest may rest on.
- SDK 0.3.235 offers two ways to fork:
  - the standalone `forkSession(sessionId, { dir?, upToMessageId?, title? })`, which returns `{ sessionId }` (`sdk.d.ts:708-723`; its docblock says file-history snapshots are not copied);
  - the `forkSession: true` query option, used together with `resume` (`sdk.d.ts:1543-1547`).
- `grep -rnw forkSession src | wc -l` printed 0 at the base (backlog line, 2026-11-05).
- Resuming today: `PodManager.#start` passes the stored `ccSessionId` as `resume` (`src/main/pod-manager/pod-manager.ts:606-640`, `src/main/pod/options.ts:238-241`).
- Which binary the product runs: no code passes `pathToClaudeCodeExecutable` (`options.ts:243-245`), so the product runs the SDK's built-in executable, whose `--version` prints `2.1.235 (Claude Code)`. The `claude` on PATH prints `2.1.318 (Claude Code)`.

## Definition of done

- [ ] D1. A verification record exists in `docs/`. It names SDK 0.3.235 and each CLI binary it verified, by that binary's own `--version` output. For each claim (C1–C7, T1) it states the observed result, and it states whether the documented behaviour held.
- [ ] D2. Migration 5 adds `forked_from_pod_id` and `forked_from_cc_session_id` to `pods`. A schema-4 database migrates to version 5 with every existing row's ancestry null, and `CURRENT_SCHEMA_VERSION` is 5.
- [ ] D3. The shared `Pod` type carries `forkedFromPodId` and `forkedFromCcSessionId`, and the store round-trips both.
- [ ] D4. Forking an eligible Pod creates exactly one new Pod row:
  - its `ccSessionId` is the id the SDK returned, which differs from the parent's;
  - its ancestry fields name the parent Pod and the parent's Claude Code session id;
  - its `tabOrder` is last;
  - the parent row is unchanged.
- [ ] D5. Forking a Pod that has no `ccSessionId`, or one that is mid-turn, or forking when the SDK call rejects, returns a typed error and creates no pod, lane or event row.
- [ ] D6. The fork's events read back as the parent's events up to the fork point. An event appended to either Pod afterwards does not appear on the other.
- [ ] D7. Deleting the parent leaves the fork's row, lanes and events intact. The fork's parent-pod field becomes null and its source session id is kept.
- [ ] D8. Opening the fork resumes the fork's own `ccSessionId`, never the parent's.
- [ ] D9. The `pod:fork` IPC channel is validated, handled and exposed to the renderer, and its errors arrive as the repo's typed IPC failures.
- [ ] D10. Each Pod tab has a Fork control:
  - activating it forks the Pod, and the new tab appears last and is selected;
  - when the Pod is ineligible, the control is disabled and states why.
- [ ] D11. A fork's tab shows which Pod it was forked from, or that its parent was deleted.
- [ ] D12. `npm run typecheck` and `npm test` pass repo-wide at the session's tip.
- [ ] D13. Design doc item 8 names the standalone `forkSession` as the chosen mechanism, states the verification verdict, and links the verification record. (Added at Gate 2, decision 3.)

## Scope

All three pieces design item 8 names, in this order:

1. **T1, the live verification.** It is a precondition, so every other task depends on it.
2. **T2, the ancestry schema and an atomic store-level fork.**
3. **T3, the manager, SDK port and IPC surface.**
4. **T4, the tab UI.**

**If T1 refutes any claim for either binary**, T2–T4 are not dispatched. The refutation is raised as an escalation, and its fallback is to verify the `forkSession: true` resume option instead (`sdk.d.ts:1543-1547`).

### Not in scope

- Forking from an earlier message (`upToMessageId`): the fork is always taken at the Pod's current state.
- Undo or file-history snapshots in the fork, which the SDK does not copy (`sdk.d.ts` `forkSession` docblock).
- Cleaning up an orphaned fork transcript left behind when the store write fails after the SDK call succeeded. That file is left for Beachcomber.
- A tree or graph view of ancestry. The only ancestry the UI shows is the tab's "Forked from" description.
- The four backlog items Gate 1 kept deferred: Calf steering, the config manager, terminal-session adoption, and macOS/Linux validation.

## Assumptions

| Question | Answer | Rung | Evidence |
|---|---|---|---|
| Which SDK mechanism forks? | The standalone `forkSession(ccSessionId, { dir: pod.cwd })`, called in main. The new id exists before any CLI spawns, so the fork's row carries its own `ccSessionId` from birth, and opening the fork uses the existing resume path unchanged. | 1 | `sdk.d.ts:708-723`; `pod-manager.ts:606-640`; `options.ts:238-241` |
| What if T1 refutes the docs? | T2–T4 stop, and an escalation proposes the `resume` + `forkSession: true` option as the fallback mechanism. | 1 | `sdk.d.ts:1543-1547`; design doc :458-466 |
| Which CLI does T1 verify? | Both the SDK built-in (2.1.235, which the product drives) and PATH `claude` (2.1.318). Decided at Gate 2 (E1). | 1 | `options.ts:243-245`; `sdk.d.ts:1775-1777`; `claude.exe --version` → `2.1.235 (Claude Code)`; `claude --version` → `2.1.318 (Claude Code)` |
| What does T1's live run cost and touch? | About 3 model turns per binary on the user's account. Its sessions run in a scratch cwd outside the repo, so their transcripts land in that cwd's `~/.claude/projects/` directory. For C7 it moves its own source transcript out and back, and touches no other session file. | 4 | T1 criteria; `probe/README.md` (PROBE_SCRATCH convention) |
| Ancestry schema shape | Two nullable `TEXT` columns added by `ALTER TABLE ADD COLUMN`. `forked_from_pod_id` has a named FK to `pods(id)` `ON DELETE SET NULL` and its own index. `forked_from_cc_session_id` survives the parent's deletion. Both are immutable after creation. | 1 | `src/main/store/schema.ts:713-718`; architect measured ADD COLUMN + named FK accepted on a STRICT table with the repo's better-sqlite3 (SQLite 3.53.4) |
| What does the fork's transcript show? | A copy of the parent's lanes and events up to the fork point, with ids remapped and `seq` preserved. A lane `running` in the parent is written `stopped` in the fork. The two Pods diverge after that. Decided at Gate 2 (decision 2). | 4 | design doc :458-466 ("one conversation, two divergent Pod tabs"); `src/shared/contracts/events.ts:247-287` (lane refs in payloads) |
| Is the fork opened automatically? | No. It is born `closed`, and forking starts no process. Opening it is the ordinary `pods.open`. | 4 | `pod-manager.ts:453-466` |
| When is a Pod eligible to fork? | When it has a `ccSessionId` and its status is `closed`, `idle` or `beached`. `running`, `waiting`, and any status this build does not know count as mid-turn. | 1 | `schema.ts:40-46`; positive-form rule as at `src/shared/contracts/ipc.ts:322-333` |
| Error codes | Mid-turn and no-session → `CONFLICT`; an SDK rejection → `IO`. No new codes. | 1 | `src/main/ipc/errors.ts:55-67` (RESUME_FAILED folded into an existing code) |
| Fork title | `<parent title> (fork)` | 1 | `sdk.d.ts:731` (the SDK's own derived-title convention) |
| IPC argument shape | A bare `PodId`, like `open`, `close` and `reconnect` | 1 | `src/preload/api.ts:100-103` |
| How is the SDK injected? | An optional `PodManagerDeps` fork port that defaults to an adapter in `src/main/pod/`, so `src/main/index.ts` is unchanged | 1 | `pod-manager.ts:124` (`isDirectory?` precedent) |
| Where does the fork's tab go? | `tabOrder = max + 1`, computed in the store transaction. `listPods().length` is not "last" once tab orders have gaps. | 1 | `pod-manager.ts:394` |
| Fork control when ineligible | Always present, using `aria-disabled` rather than `disabled`, so a keyboard user can reach the stated reason | 1 | session `disciplines/frontend.md` (accessibility floor) |
| Can tasks build concurrently in one worktree? | Yes: `tsc --noEmit` and vitest write no shared output. It orders nothing, because the DAG is a strict chain T1→T2→T3→T4. | 1 | `package.json` scripts; `tsconfig.node.json` |
| Which `Pod` literals does the type change break? | `stub-api.ts:117`, `tests/unit/ipc/pod-deletion.test.ts:288` and `tests/unit/pod-session/remover.test.ts:34`. All three are owned by T2, and any further site is an escalation. | 1 | `grep -rln lastActiveAt` plus a second literal-shape grep (architect). The orchestrator checked the two other `lastActiveAt` hits: `pod-manager.ts:327` and `relaunch.e2e.test.tsx:324` are `updatePod` patches, not literals. |

## Contracts

- [`contracts/store-fork.ts`](contracts/store-fork.ts): the `Pod` ancestry fields, `ForkPodInput`, and `EventStore.forkPod`, all-or-nothing.
- [`contracts/fork-surface.ts`](contracts/fork-surface.ts): `pod:fork`, `OrcastrateApi.pods.fork`, the error codes, and `forkEligibility`.

## Open questions

None. Gate 2 settled all three decisions:

1. T1 verifies both binaries (E1).
2. The fork copies the parent's transcript up to the fork point.
3. T1 also updates design doc item 8 (D13).
