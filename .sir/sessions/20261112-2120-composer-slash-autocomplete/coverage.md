# Coverage

<!-- Definition of done: one row per spec.md item. `Item`, `Covering task`, and
     `Gate 2` are written at Gate 2; `End state` is written at Gate 3. -->

| Item | Covering task | Gate 2 | End state |
|---|---|---|---|
| 1 Initial read, non-blocking, 10 s timeout, warn | T1 | covered | met (T1 C12, C16-C19) |
| 2 `commands_changed` replaces; late read discarded | T1 | covered | met (T1 C20, C21) |
| 3 Terminal commands hidden | T1 | covered | met (T1 C22-C24) |
| 4 Per-Pod push, first always, then on change, none after dispose | T1 | covered | met (T1 C16, C25-C29) |
| 5 Preload `on.podCommands`; 7 push, 22 invoke channels | T1 | covered | met (T1 C1-C4) |
| 6 Renderer keeps per-Pod lists; `useSlashCommands` makes no IPC call | T3 | covered | met (T3 C60-C68) |
| 7 Leading `/` opens at most 5 prefix matches, listbox semantics | T4, T5 | covered | met (T4 C81-C90, T5 C121) |
| 8 Arrow, Tab, Enter, mousedown, Escape behaviour | T4 | covered | met (T4 C91-C100) |
| 9 Closed list keeps base keys; disabled never shows it | T4 | covered | met (T4 C101-C104) |
| 10 Renderer hard-codes no command names | T5 | covered | met (T5 C125, T4 C106) |
| 11 Local command output renders as assistant text | T2 | covered | met (T2 C40-C42) |
| 12 Bypassed-turn result text shown once, no duplicate reply | T2 | covered | met (T2 C43-C49) |
| 13 Fixture corpus yields no new `assistant_text` | T2 | covered | met (T2 C51) |
| 14 End to end, push to dropdown to accept to send | T5 | covered | met (T5 C121-C124) |
| 15 typecheck, whole suite, build pass | T5 | covered | met (T5 C129-C131 at 1a9f70f; re-run by the orchestrator at d19a224: typecheck exit 0, npm --prefix <wt> test 170 files / 2745 tests, build exit 0) |
| 16 No shipped file cites `.sir/` or the session id | T1–T5 | covered | met (T1 C35, T2 C57, T3 C73, T4 C111, T5 C132) |
| 17 H1 dropdown placement and content on a real Pod | none | uncovered; D2: Gate 3 human check (user), state and action in spec.md item 17 | met by human check H1 (user, Gate 3, npm run dev in the session worktree at 1a9f70f) |
| 18 H2 `/context` output visible | none | uncovered; D2: Gate 3 human check (user), state and action in spec.md item 18 | met by human check H2 (user, Gate 3, npm run dev in the session worktree at 1a9f70f) |
| 19 H3 `/theme` unavailable text visible | none | uncovered; D2: Gate 3 human check (user), state and action in spec.md item 19 | met by human check H3 (user, Gate 3, npm run dev in the session worktree at 1a9f70f) |
| 20 H4 empty `/compact` reason visible | none | uncovered; D2: Gate 3 human check (user), state and action in spec.md item 20 | met by human check H4 (user, Gate 3, npm run dev in the session worktree at 1a9f70f) |
| 21 H5 `doctor` not offered after first turn | none | uncovered; D2: Gate 3 human check (user), state and action in spec.md item 21 | met by human check H5 (user, Gate 3, npm run dev in the session worktree at 1a9f70f) |
| 22 Gate 3 appends follow-up rows F1–F6 | orchestrator | uncovered; D2: orchestrator's, evidence `git diff <merge-base>..main -- .sir/backlog.md` read after the Gate 3 edit; end state worded `appended at Gate 3` (the edit follows approval) | applied after approval (orchestrator; evidence is the Gate 3 backlog edit) |

<!-- Contract operations: one row per declared contract operation. `Operation`,
     `Consuming task`, and `Gate 2` are written at Gate 2; `Implementing task`
     and `End state` are written at Gate 3. -->

| Operation | Implementing task | Consuming task | Gate 2 | End state |
|---|---|---|---|---|
| `SlashCommandInfo` | T1 | T3, T4, T5 | covered | called: src/renderer/src/composer/Composer.tsx |
| `PodCommandsPush` | T1 | T3 | covered | called: src/renderer/src/state/store.ts |
| `EVENT_CHANNELS.podCommands` | T1 | T3 | covered | called: src/main/pod-manager/pushes.ts (found by the whole-repository second search; absent at base) |
| `OrcastrateApi.on.podCommands` | T1 | T3 | covered | called: src/renderer/src/state/store.ts |
| `useSlashCommands` | T3 | T5 | covered | called: src/renderer/src/App.tsx |
| `ComposerProps.commands` | T4 | T5 | covered | called: src/renderer/src/App.tsx |
| stub `on.podCommands` / `emit.podCommands` | T3 | T5 | covered | called (test seam): src/renderer/src/__tests__/slash-commands.e2e.test.tsx |
