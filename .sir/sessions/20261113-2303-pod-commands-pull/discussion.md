# Pod command-list pull channel

Close backlog F4 (`.sir/backlog.md:39`): a renderer reloaded while main keeps running shows each
open Pod's slash-command list straight away, by pulling it, instead of showing no suggestions
until the next `push:podCommands` or a reopen.

## Context

- At e7fed6b the renderer store learns a Pod's command list only from the push subscription
  `api.on.podCommands` (`src/renderer/src/state/store.ts:325`, handler `onPodCommands` at
  `:517`). `INVOKE_CHANNELS` (`src/shared/contracts/ipc.ts:93-116`) has no read for it.
- Main keeps one `SlashCommandState` per session (`src/main/pod-manager/slash-commands.ts`,
  constructed at `src/main/pod-manager/pod-manager.ts:756`), which already holds the last
  reported visible list (`#lastReported`). Pushes leave through the disposed-checked choke
  point at `pod-manager.ts:891-901`.
- `PodCommandsPush`'s docblock (`ipc.ts:329-334`) says each push is a whole snapshot, pushes
  for one Pod arrive in emit order, and no push carries a revision. The backlog row named the
  blocker as "no ordering rule exists between pull and push"; E1 below settles it.
- Previous sessions in this thread of work: 20261112-2120-composer-slash-autocomplete,
  20261113-1926-slash-command-hardening, 20261113-2203-composer-list-closing.

## Decisions

- Track: Standard (Gate 1, approved by the user in the reply "Approved").
- E1 (reason `ambiguous`, raised at Gate 1, answered through the choice dialog): **push wins**.
  The store drops a pull answer if any push for that Pod arrived after the pull was sent. No
  change to `PodCommandsPush`; no revision field. The rationale given and accepted: this mirrors
  the `#replaced` rule `SlashCommandState` applies to its own late initial read, and Electron
  delivers the invoke reply and the pushes to one renderer in order, so a push seen first is at
  least as new as the reply. Rejected option: a per-Pod revision counter on pushes and pull
  answers.
- Defaults the user let stand at Gate 1 (settled):
  - Channel `pod:commands`, one Pod per call, taking a `podId` and answering
    `SlashCommandInfo[]`, in the per-Pod style of the existing `pod:*` channels.
  - A Pod with no list yet (closed, or no catalog read back) answers `[]`, the same as the
    renderer's existing empty default.
  - The store pulls once for every Pod that `refreshPods` returns during `start()`, not on every
    Pod switch.
  - A failed pull is silent: no notification, and the list stays empty until a push arrives.
- Scope: the contract, the preload bridge, the stub API, the main-side handler and its
  registration (the file is found at spec), the renderer store, and tests at each layer,
  including the race where a push lands while a pull is in flight.
- Human check (1): with a Pod open under `npm run dev`, reload the renderer (Ctrl+R), type `/`,
  and see the list without sending a turn.
- Close backlog row F4 (`.sir/backlog.md:39`) at Gate 3 if the work lands.
