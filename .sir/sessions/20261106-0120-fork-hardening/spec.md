# fork-hardening

Close the six advisories (`.sir/backlog.md` lines 35–40) that session `20261105-1907-fork-session-branching` left behind, from `main` `4301c23`.

## Context

The fork feature merged in `42b59be`. The previous session's Gate 3 left six code, test and doc follow-ups in the backlog:

- **Line 36.** `forkPod`'s lane remap falls back to the parent's id (`src/main/store/sqlite-event-store.ts:291`).
- **Line 37.** `PodManager.forkPod` passes the fork port's id to the store unchecked (`src/main/pod-manager/pod-manager.ts:549`).
- **Line 38.** The fork-error alert can't be dismissed (`src/renderer/src/pods/PodsChrome.tsx:95`).
- **Line 39.** `forkAncestryFor`'s unlisted-parent branch has no test (`src/renderer/src/pods/fork-control.ts:65-66`).
- **Line 40.** Design doc item 8 overclaims (`docs/superpowers/specs/2026-08-18-orcastrate-design.md:464`).
- **Line 35.** The payload-equality guarantee is unstated (`remapPayloadLanes`, `JSON.stringify`).

Every Gate 1 decision in `discussion.md` stands. One correction to it: the "nothing else in the payload changes" wording also lives in the shipped `src/shared/contracts/event-store.ts:221-222`, not only in the prior frozen contract and the test comment.

## Definition of done

**Store: missing lane reference (T1)**
1. `forkPod` throws `EventStoreError` `IO` and writes no pod, lane or event row when the parent holds an event whose `lane_id` names another Pod's lane.
2. `forkPod` throws `EventStoreError` `IO` and writes no row when the parent holds a lane whose `parentLaneId` names another Pod's lane.
3. `forkPod` throws `IO` and writes no row when it copies a `lane_opened` event whose `payload.lane.id` names no parent lane.
4. `forkPod` throws `IO` and writes no row when it copies a `lane_opened` event whose `payload.lane.parentLaneId` names no parent lane.
5. `forkPod` throws `IO` and writes no row when it copies a `lane_closed` event whose `payload.laneId` names no parent lane.
6. `forkPod` throws `IO` and writes no row when it copies a `tool_use` event whose `payload.dispatchedLaneId` names no parent lane.
7. The missing-lane error message begins `forkPod:` and contains the missing LaneId and the parent PodId.
8. The `EventStore.forkPod` doc comment in `src/shared/contracts/event-store.ts` lists the missing-lane `IO` case among its errors.

**Payload equality, stated (T1)**
9. The `EventStore.forkPod` doc comment states `equivalent JSON, lane ids remapped; not byte-identical` and no longer says "nothing else in the payload changes".
10. The `remapPayloadLanes` doc comment states `equivalent JSON, lane ids remapped; not byte-identical`, and the function still uses `JSON.stringify`.
11. The comment at `tests/unit/store/fork.test.ts:360` states the same guarantee and no longer says "Nothing else in the payload changes".

**PodManager: fork-id guard (T2)**
12. `PodManager.forkPod` rejects with `IpcFailure` `IO` when the fork port returns `''`.
13. With the fork port returning `''`, `store.forkPod` is never called and no row is written.
14. `PodManager.forkPod` rejects with `IpcFailure` `IO` when the fork port returns the parent's `ccSessionId`.
15. With the fork port returning the parent's `ccSessionId`, `store.forkPod` is never called and no row is written.
16. The fork-id rejection message contains `forkSession`, the parent PodId and the parent's `ccSessionId`.
17. A fork-id rejection logs no warning.
18. The `PodManager.forkPod` docblock names an empty or source-equal fork id as an `IO` rejection that writes nothing.
19. A new test shows that, through `PodManager.forkPod` with the real store, a dangling lane reference rejects with `IpcFailure` `IO` whose message contains the lane id and writes no row. The test is shown failing under an injected defect in the translation.
20. A new test shows that, in that case, the orphaned-session warning names the session id the fork port returned. The test is shown failing under an injected defect.

**Renderer (T3)**
21. A failed fork shows a button named exactly `Dismiss fork error` with the alert.
22. The button's visible glyph is `×`, inside an `aria-hidden` element.
23. Clicking the button removes the fork-error alert.
24. Pressing Enter on the focused button removes the alert.
25. Pressing Space on the focused button removes the alert.
26. After dismissal, focus is on the Pods chrome container (`PODS_CHROME_TEST_ID`).
27. The button sits outside the `role="alert"` element, whose text stays exactly main's message.
28. Starting a new fork after a failed one removes the alert while the new call is pending, and a test shows it.
29. No timer call appears in `PodsChrome.tsx` or in any `ForkErrorAlert*` file.
30. The dismiss button has a `:focus-visible` outline rule using `--oc-border-thick` and `--oc-focus-ring`, asserted in `PodsChrome.styles.test.ts`.
31. A test shows that a fork whose `forkedFromPodId` names an unlisted Pod reads "Forked from a deleted Pod", and an injected defect at `fork-control.ts:66` makes that test fail.
32. `src/renderer/src/pods/fork-control.ts` is unchanged.

**Design doc (T4)**
33. The design doc no longer contains "before any CLI process runs".
34. Design doc item 8 states that the fork transcript exists once `forkSession` resolves, before the first resume.
35. Item 8 makes no claim about CLI processes during `forkSession`.
36. Item 8 keeps its mechanism, its verdict and its link, and no other line of the doc changes.

**Session tip**
37. Repo-wide `npm run typecheck` exits 0 at the session tip.
38. Repo-wide `npm test` exits 0 at the session tip.

**Session guarantees (orchestrator, filled at Gate 3; Gate 2 decision D3)**
39. No file under `.sir/sessions/20261105-1907-fork-session-branching/` changes in the session's commit range.
40. At Gate 3, `.sir/backlog.md` no longer holds lines 35–40 and still holds the three human-check lines (41–43).

## Scope

The six backlog items 35–40, as decided at Gate 1. T1 changes the store and its shipped contract comment. T2 changes `PodManager.forkPod`. T3 adds the dismiss control and the ancestry test. T4 rewords the design doc.

### Not in scope

- Backlog lines 41–43 (human `npm run dev` checks). They stay in the backlog.
- The previous session's frozen contract `.sir/sessions/20261105-1907-fork-session-branching/contracts/store-fork.ts`. It stays unedited.
- Changing `forkAncestryFor`'s behavior.
- Byte-identical payload copying. `JSON.stringify` stays.
- Whitespace-only fork ids. Only `''` counts as empty.
- An auto-expiry timer on the fork-error alert.
- Cleaning up the orphaned SDK session file after a store failure. The existing warning names it.

## Assumptions

| Question | Answer | Rung | Evidence |
|---|---|---|---|
| Which `EventStoreErrorCode` does the missing-lane failure use? | `IO`: corruption of stored data, matching forkPod's other stored-data faults. `NOT_FOUND` would read as "unknown Pod". | 1 | `src/shared/contracts/event-store.ts:62-68`; `src/main/store/sqlite-event-store.ts:532`, `:564`; `src/main/pod-manager/pod-manager.ts:527-529`, `:581`; `src/main/ipc/errors.ts:47-50` |
| Which `IpcFailure` code does the fork-id guard use? | `IO`, matching the port-rejection path. `INTERNAL` is the catch-all, and `UNSUPPORTED` means "this build cannot read it". | 1 | `src/main/pod-manager/pod-manager.ts:550-556`; `src/main/ipc/errors.ts:44-45`, `:90` |
| Does the fork-id guard log the orphaned-session warning? | No. A source-equal id makes no new file, and an empty id gives the warning nothing to name. The port-rejection path doesn't log either. | 1 | `src/main/pod-manager/pod-manager.ts:550-556`, `:573-577` |
| What counts as an "empty" fork id? | `=== ''` only. | 4 | `discussion.md` Decisions says only "empty"; recorded here as a rung-4 reading |
| Where does focus go after dismissal? | The Pods chrome container, which is focusable (`tabIndex={-1}`) and already the destination of last resort. | 1 | `src/renderer/src/pods/PodsChrome.tsx:45-49`, `:255-256` |
| Where does the dismiss button sit relative to `role="alert"`? | Outside it. Two tests assert the alert's `textContent` with `toBe(message)`, and T3 doesn't own one of them. | 1 | `src/renderer/src/__tests__/failure-paths.e2e.test.tsx:774`; `src/renderer/src/__tests__/pod-fork.e2e.test.tsx:324` |
| Can the dangling-lane cases be built through the public API? | Yes. The lane foreign keys cross Pods, `createLane` checks only that the Pod exists, and payload lane ids are free JSON. Each case succeeds silently at the base, which gives each test a natural red step. | 1 | `src/main/store/schema.ts:415`, `:448`; `src/main/store/sqlite-event-store.ts:291`, `:349-350` |
| Does T1 edit the shipped `src/shared/contracts/event-store.ts`? | Yes. It is "where the code states its contract" (Decision, item 35). The prior session's `.sir` contract stays untouched. | 1 | `discussion.md` Decisions; `.sir/sessions/20261105-1907-fork-session-branching/manifest.json` T2 owned this file |
| Which agents take the store and doc tasks? | sir-database-engineer for the store and sir-backend-engineer for the doc, as in the prior manifest. | 1 | `.sir/sessions/20261105-1907-fork-session-branching/manifest.json` |
| Is the PodManager fork-id guard a contract? | No. No task in this session calls `PodManager.forkPod`, so the guard is pinned in T2's criteria. The IPC layer passes an `IpcFailure`'s code through unchanged. | 1 | `src/main/ipc/errors.ts:92-93`; sir-contracts: an operation belongs in a contract only if another task calls it |
| Can tasks run `npm test` or `npm run typecheck` concurrently in the worktree? | Yes. Typecheck writes nothing (`--noEmit`), and store tests use a temp dir per test. This fact orders nothing. The T1→T2→T3 chain comes from each injector running the repo-wide suite. | 1 | `package.json:16-18`; `tests/unit/store/helpers.ts:32-36` |
| Do the worktree's verification commands run? | Yes. The worktree has no installed packages; `tsc` and `vitest` resolve from the main checkout's `node_modules` (`.claude-worktrees/` sits inside the repo). | 1 | Probe this phase: `npm exec -- tsc --version` printed `Version 7.0.2`; `npm test` printed 155 files / 2510 tests passed |
| Which shell has the `rg` the criteria name? | Git Bash (ripgrep 14.1.1). PowerShell has none on its PATH. | 1 | `which rg` in Bash this phase; `rg` "not recognized" in PowerShell |
| Does T4's file feed any test? | No. | 1 | `rg "orcastrate-design\|superpowers/specs"` over `src`, `tests`, `probe` printed 0 matches (architect) |

## Contracts

- [`contracts/store-fork-missing-lane.ts`](contracts/store-fork-missing-lane.ts): `EventStore.forkPod` refuses a lane reference it can't remap. It throws `EventStoreError` `IO`, writes nothing, and states what the IPC caller sees. It restates the payload-equality guarantee. T1 implements it; T2 consumes it.

## Open questions

None. Gate 2 settled D1–D3, and each answer was the recommended option.
