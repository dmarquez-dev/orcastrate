# Pod command-list pull channel

A renderer reloaded while main keeps running shows each open Pod's slash-command list straight
away, by pulling it over a new `pod:commands` invoke channel, instead of showing no suggestions
until the next `push:podCommands` or a reopen. Closes backlog row F4.

## Context

- At e7fed6b the renderer store learns a Pod's command list only from the push subscription
  `api.on.podCommands` (`src/renderer/src/state/store.ts:325`, handler `onPodCommands` at `:517`).
  `INVOKE_CHANNELS` (`src/shared/contracts/ipc.ts:93-116`, 22 members) has no read for it.
- Main keeps one `SlashCommandState` per session (`src/main/pod-manager/slash-commands.ts`;
  `#lastReported` holds the last visible list it reported). Pushes leave through
  `#publishCommands`, `src/main/pod-manager/pod-manager.ts:898-902` (docblock `:888-897`), which
  drops anything for a disposed session.
- `PodCommandsPush` (`ipc.ts:329-334`) says each push is a whole snapshot, pushes for one Pod
  arrive in emit order, and no push carries a revision. Gate 1's E1 settled the ordering between
  a pull and a push: **push wins**.
- `src/main/ipc/handlers.ts:311-317` throws at boot if any `INVOKE_CHANNELS` member is
  unhandled, so the contract change and the handler land in one task.

## Definition of done

1. `INVOKE_CHANNELS` declares `podCommands: 'pod:commands'` (23 members), and
   `OrcastrateApi.pods.commands(podId)` is declared with a docblock giving its answers and errors.
2. `PodCommandsPush`'s docblock states the pull ordering rule in place.
3. `pod:commands` answers an open Pod's current visible list: equal to its last push, with the
   terminal commands removed.
4. An open Pod with no catalog yet answers `[]`.
5. A Pod with no live session answers `[]`, including after a close, and after a reopen before
   the new session's read settles.
6. A malformed id answers `INVALID_ARGUMENT` and an unknown id `NOT_FOUND`; the channel never
   rejects; the read emits no push and logs nothing.
7. The new method keeps the existing openness prohibition (no openness field on its return or
   its arguments).
8. The preload bridge forwards `pods.commands` to `'pod:commands'` with the bare id.
9. The renderer's stub API implements `pods.commands`: default `[]`, recorded in
   `calls.podCommands`, failable through `failInvoke`.
10. The store pulls once per Pod from the first successful `pods.list` in `start()`, all pulls
    issued together, and issues no pull when that list fails.
11. A Pod switch or a later `refreshPods` issues no pull.
12. A pull answer becomes that Pod's list; an empty answer is the shared `NO_SLASH_COMMANDS`, and
    commits no state when the list is already empty.
13. Push wins: an answer is dropped if a push for that Pod arrived after the pull was sent.
14. A push that arrived before the pull was sent, or a push for another Pod, does not drop the
    answer.
15. A failed pull is silent: no state change and no notification.
16. A freshly mounted renderer whose main already holds a list shows that Pod's list on `/`, with
    no push and no turn sent.
17. The renderer's error-discipline and failure-path classifications include the channel, with
    counts and prose that match the code.
18. No docblock still says the list arrives only by push.
19. No shipped file cites a session id or a `.sir/` path.
20. `npm run typecheck` exits 0.
21. `npm test` exits 0, with more than 2792 tests.
22. Human check (the orchestrator carries it to Gate 3, per Gate 2's D1): with a Pod open under `npm run dev`, reload the renderer (Ctrl+R) and type `/`.
    Predicted: the suggestion list opens with that Pod's commands, without a turn being sent
    first. Before this change the same steps show no list.
23. Backlog row F4 is removed from `.sir/backlog.md` in Gate 3's backlog edit, if the work lands.
    The end state is recorded after approval, per Gate 2's D2.

## Scope

The shared IPC contract (`src/shared/contracts/ipc.ts`), the preload bridge, the main handler and
its PodManager read, `SlashCommandState`, the renderer store, the renderer stub API, the
failure-path sweep, five docblocks the change makes false, and tests at each layer, including the
race where a push lands while a pull is in flight.

### Not in scope

- A revision field on `PodCommandsPush`, or any change to it or `EVENT_CHANNELS` (E1). T1's C1
  checks that both are byte-unchanged.
- A pull on a Pod switch, on a later `refreshPods`, or for a Pod created after start. T2's D4a
  and D4b check the first two.
- Recovery when start's own `pods.list` fails. A later successful `refreshPods` issues no pull, so
  the list waits for that Pod's next push. This is a consequence of the Gate 1 default, and Gate 2
  (D3) kept it. No criterion checks for it, because nothing is built here.
- A timeout or cancellation on the pull. Main answers it synchronously, and no other store invoke
  carries one.

## Assumptions

| Question | Answer | Rung | Evidence |
|---|---|---|---|
| Ordering between a pull answer and a push for the same Pod | Push wins: the store drops the answer if a push for that Pod arrived after the pull was sent | user (Gate 1, E1) | `discussion.md`, Decisions; `state.json` E1 |
| Channel name and shape | `pod:commands`, one Pod per call, `podId` in, `SlashCommandInfo[]` out | user (Gate 1 default) | `discussion.md`; per-Pod `pod:*` channels at `ipc.ts:94-104` |
| What a Pod with no list answers | `[]` | user (Gate 1 default) | `discussion.md`; `NO_SLASH_COMMANDS` at `store.ts:166-172` |
| When the store pulls | Once per Pod from start's first successful `pods.list`; never on a switch | user (Gate 1 default) | `discussion.md` |
| What a failed pull does | Nothing: no notification, no state change | user (Gate 1 default) | `discussion.md` |
| What an unknown Pod id answers | `NOT_FOUND` through `#requirePod`, as `listLanes` and `readEvents` do | repo | `pod-manager.ts:1108-1115`, `:1639-1643` |
| How an empty answer is stored | As `NO_SLASH_COMMANDS`, and not committed when the list is already empty, so existing tests whose `pods.list` returns Pods see no new state | repo | `store.ts:166-172` (single-identity rule) |
| The `INVOKE_CHANNELS` key | `podCommands`, the camel case of the wire name. `EVENT_CHANNELS` already uses the same key for `'push:podCommands'`; the objects are separate and the wire names differ | repo | `ipc.ts:93-116` convention, `ipc.ts:128` |
| Main-side method names | `SlashCommandState.current()` and `PodManagerApi.listSlashCommands(podId)` | judgment | `listLanes` precedent, `pod-manager.ts:157` |
| `current()` returns a copy, not the internal array | Yes | discipline | backend discipline, Layering ("exposes behavior, not its internal state") |
| Does the backend async rule (cancellation plus timeout across a process boundary) apply to the pull? | Not encoded: main's read is synchronous and no store invoke carries one | judgment | backend discipline, Async; `store.ts` `safeInvoke` callers |
| Does the frontend rule that every fetch declares an error state apply? | Overridden by the settled silent-failure default | user (Gate 1 default) | frontend discipline, Data fetching; `discussion.md` |
| Can tasks build concurrently? | Yes, by the toolchain (`tsc --noEmit`, vitest's cache only), but there is nothing to run in parallel: T2 cannot compile without T1's `ipc.ts` declarations | repo | `package.json:16-18`; `handlers.ts:311-317` |
| Which tests go red between T1 and T2 | Predicted, not measured: `typecheck:web` on `stub-api.ts`, plus `stub-api.test.ts`, `failure-paths.e2e.test.tsx` and `store.test.ts:321` until T2 lands. T1's gates are scoped to exclude the renderer | judgment | architect's report; T1 C13, C14 |

## Contracts

- [`contracts/pod-commands-pull.ts`](contracts/pod-commands-pull.ts): the `INVOKE_CHANNELS`
  addition, `OrcastrateApi.pods.commands` with its answers and errors, the ordering guarantees,
  the push-wins rule, when the renderer pulls, and that a failure is silent.

## Open questions

None.
