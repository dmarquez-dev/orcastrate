sir-sdlc 1.0.42 — Gate 3 report — Small

**Decisions needed:** none.

## 2. Acceptance criteria

- **C1** · met · red step, reviewer-reproduced: with the guard line (`store.ts:791`) removed, "setActivePod for a deleted Pod leaves the active Pod where it was" failed with `expected 'pod-2' to be 'pod-1'`; with the guard in place it passes.
- **C2** · met · red step, reviewer-reproduced: the stub records `lanes.list(podId)` and `events.read({podId,…})` under the keys `readsFor` filters on, so the test can see a read; without the guard it failed with `expected { lanes: 1, events: 1 } to deeply equal { lanes: +0, events: +0 }`.
- **C3** · met: the tombstone is added only after a successful delete (`store.ts:705`), the new "still activates a Pod whose delete failed" test passes, the `'ghost'` test in `workspace-provider.test.tsx` is unchanged and passed in the full run, and the guard fires only for a non-null id.
- **C4** · met: the docblock above `store.ts:790` states the rule (no-op for a deleted Pod, nothing reset to null, no reads, only tombstoned ids refused); `grep -n "\.sir\|20261116"` on `store.ts` returned nothing.
- **C5** · met · reviewer-reproduced: `npm --prefix … test` exited 0 with 173 test files and 2843 tests passed, the RUN line naming the repository; `npm --prefix … run typecheck` exited 0.
- **C6** · applied after approval: removing row 43 of `.sir/backlog.md` (20261116-1932-deleted-pod-runtime-guard, "`setActivePod` can still make a deleted Pod's id the `activePodId`"). `grep -n "store(\.test)?\.ts"` over `.sir/backlog.md` matches only that row, so no other open row cites a file this session changes.

**Human checks:** none for this session. Two open from earlier sessions, both still with no route, because nothing in the app can force a workspace load to fail:

- From 20261112-0151-workspace-load-retry, "Human check not made: with a workspace load failing": check that the Retry button reads as a button and that its focus ring is not clipped. Needs a way to make `lanes.list`, `events.read` or `app.routingMode` fail first.
- From 20261112-0151-workspace-load-retry, "definition-of-done item 38": check that the Retry control is legible in both the light and the dark theme. Needs the same failing load.

## 3. What ran

- **T1** · sir-frontend-engineer, then sir-reviewer · frontend · opus / opus · 1 review · 0 rounds · uncommitted until approval

Change surface, from `git diff --stat HEAD -- src/renderer/src/state/store.ts src/renderer/src/state/store.test.ts .sir/backlog.md`: 2 files changed, 80 insertions, 1 deletion (`store.test.ts` +71, `store.ts` +9 −1). No new files: `git status --short` over the same list shows only the two modified files. Run `git diff HEAD -- src/renderer/src/state/store.ts src/renderer/src/state/store.test.ts` for the full diff. The backlog edit is applied after approval.

## 4. Advisory findings

- **Test and CI concerns** · 1: the in-thread T1 review notes that the delete-failed and `setActivePod(null)` tests pass with or without the guard. They guard against the fix refusing too much, not against it missing, and C3 asks for no red step.
