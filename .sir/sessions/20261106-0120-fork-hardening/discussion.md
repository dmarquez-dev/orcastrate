# fork-hardening

Close the six advisories that session `20261105-1907-fork-session-branching` left in
`.sir/backlog.md` (lines 35–40), at `main` `4301c23`.

## Context

The fork feature merged in `42b59be`. Its Gate 3 appended nine backlog lines. Six of them are
code, test or doc follow-ups and belong to this session. The other three (lines 41–43) are human
`npm run dev` checks and stay in the backlog. On 2026-11-06 the orchestrator re-read every
citation below against the tree and found each one where the backlog line says.

- `src/main/store/sqlite-event-store.ts:291`: `const remap = (id: LaneId): LaneId => laneMap.get(id) ?? id;`
- `src/main/pod-manager/pod-manager.ts:549`: `ccSessionId = await this.#forkSession(...)` is passed to `this.#store.forkPod` unchecked.
- `src/renderer/src/pods/PodsChrome.tsx:95`: `setForkError(null)` runs only at the start of `handleFork`.
- `src/renderer/src/pods/fork-control.ts:65`: the `forkedFromPodId !== null` + `titleOf` → `undefined` branch returns `FORKED_FROM_DELETED`. `src/renderer/src/__tests__/pod-fork.e2e.test.tsx:351` covers only the null-parent branch.
- `docs/superpowers/specs/2026-08-18-orcastrate-design.md:464`: item 8 says `forkSession` "returns its id before any CLI process runs". `probe/verify-fork-session.ts` shows only that the fork transcript exists before the first resume (C2).
- `src/main/store/sqlite-event-store.ts:582`: `remapPayloadLanes` re-serializes with `JSON.stringify`. The "nothing else in the payload changes" wording lives in the previous session's frozen contract (a session artifact, which stays unedited) and in the test comment at `tests/unit/store/fork.test.ts:360`.

## Decisions

- Track: Standard. Session name `fork-hardening`. Scope is backlog lines 35–40. Lines 41–43 (human checks) are out of scope and stay in the backlog.
- Item 36 (remap fallback): an id missing from `laneMap` must make `forkPod` fail loudly with an `EventStoreError` that rolls back the transaction. It must not fall back to the parent's lane id.
- Item 37 (fork id guard): `PodManager.forkPod` rejects a fork-port result that is empty or equals the parent's `ccSessionId`, throws an `IpcFailure`, and writes nothing to the store.
- Item 38 (sticky alert): add a dismiss control (×) to the fork-error alert that clears it. Keep clearing it when the next fork starts. No auto-expiry timer.
- Item 39 (unlisted parent): add a test for `forkAncestryFor`'s non-null-but-unlisted-parent branch. Keep the branch's behavior ("Forked from a deleted Pod"), since the doc comment above it records the refetch race it exists for.
- Item 40 (design doc): reword item 8 at `docs/superpowers/specs/2026-08-18-orcastrate-design.md:464` so it claims only what `probe/verify-fork-session.ts` shows: the fork transcript exists before the first resume.
- Item 35 (payload bytes): payload equality is meaning-only. Keep `JSON.stringify`. Write the guarantee, "equivalent JSON, lane ids remapped; not byte-identical", where the code states its contract (the `forkPod` / `remapPayloadLanes` doc comment) and in the test comment at `tests/unit/store/fork.test.ts:360`. Leave the previous session's frozen contract unedited.
- At Gate 3, remove backlog lines 35–40 and keep lines 41–43.
