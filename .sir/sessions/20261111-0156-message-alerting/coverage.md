# Coverage

| Item | Covering task | Gate 2 | End state |
|---|---|---|---|
| 1 notifications exports | T1 | covered | met |
| 2 errors persist | T1 | covered | met |
| 3 transients auto-dismiss | T1 | covered | met |
| 4 roles, dismiss, marker, focus | T1 | covered | met |
| 5 one viewport, outside pods-chrome | T4 | covered | met |
| 6 S1 create | T5 | covered | met |
| 7 S2 delete | T5 | covered | met |
| 8 S3 fork | T5 | covered | met |
| 9 S4 open | T5 | covered | met |
| 10 S5 reconnect | T5 | covered | met |
| 11 S6 close | T5 | covered | met |
| 12 S7 reorder | T5 | covered | met |
| 13 S8 interrupt | T4 | covered | met |
| 14 E1 pods.list | T5 | covered | met |
| 15 E2 open | T5 | covered | met |
| 16 E3 reconnect | T5 | covered | met |
| 17 E4 fork | T5 | covered | met |
| 18 E5 reorder | T5 | covered | met |
| 19 E6 close | T5 | covered | met |
| 20 E7 interrupt | T4 | covered | met |
| 21 E8 lanes.list | T4 | covered | met |
| 22 E9 events.read | T4 | covered | met |
| 23 E10 app.routingMode | T4 (needs T2) | covered | met |
| 24 routingModeError field | T2 | covered | met |
| 25 SURFACELESS_CHANNELS is the unreachable pair | T3 (writes), T5 C14 (green) | covered | met |
| 26 in-row markup and rules gone | T5 | covered | met |
| 27 inline surfaces unchanged | T3 C15, T5 C24 | covered | met |
| 28 R1 reconciliation stays quiet | T3, T4 | covered | met |
| 29 startup-reconciliation.test.tsx byte-identical | orchestrator | uncovered; orchestrator's: no task owns the file. Evidence: `git show <tip>:src/renderer/src/transcript/startup-reconciliation.test.tsx` piped to `sha256sum` equals `101d1b8b…cde4b`, recorded in this file | met, the orchestrator's own row, run at Gate 3. The evidence as Gate 2 wrote it does not hold: `git show c200154:<path> \| sha256sum` prints `900f554c…17c3fa7`, the hash of the LF blob, while `101d1b8b…cde4b` is the hash of the CRLF working-tree checkout (6219 bytes against the blob's 6082). Run with the instrument corrected: `git show 7489152:<path> \| sha256sum` also prints `900f554c…17c3fa7`, so the tip blob equals the base blob. `git diff --name-only 7489152..c200154 -- <path> \| wc -l` prints 0. `sha256sum` of the worktree copy prints `101d1b8b…cde4b`. Control: `printf x \| sha256sum` prints a different hash, `2d711642…` |
| 30 human-checks doc | T6 | covered | met |
| 31 typecheck, test, build green | T6 | covered | met |
| 32 backlog row "measure alert beside long reorder alert" removed as moot | orchestrator | uncovered; orchestrator's: the Gate 3 backlog edit. End state `met at Gate 3 backlog edit`, written after approval; evidence is the merged `.sir/backlog.md` diff, recorded in this file | met at Gate 3 backlog edit: the row was removed from `.sir/backlog.md` as moot. After the edit, `grep -c "20261110-1857-chrome-alert-width" .sir/backlog.md` prints 0. Before the edit it held 2 rows: this one and row 33's |
| 33 backlog row "native alerting mechanism" removed as done | orchestrator | uncovered; orchestrator's: as row 32 | met at Gate 3 backlog edit: the row was removed as done, by the same edit and the same grep as row 32 |

| Operation | Implementing task | Consuming task | Gate 2 | End state |
|---|---|---|---|---|
| `NotificationProvider` | T1 | T4 | covered; predicted called | called: `src/renderer/src/App.tsx`. Prediction confirmed |
| `useNotify` | T1 | T4, T5 | covered; predicted called | called: `src/renderer/src/App.tsx`, `src/renderer/src/pods/PodsChrome.tsx`, `src/renderer/src/shell/WorkspaceAlerts.tsx`. Prediction confirmed |
| `Notifier.notify` | T1 | T4, T5 | covered; predicted called | called: `src/renderer/src/App.tsx:247`, `src/renderer/src/shell/WorkspaceAlerts.tsx:46`, `src/renderer/src/pods/PodsChrome.tsx`. Prediction confirmed |
| `Notifier.dismiss` | T1 | T4, T5 | covered; predicted called | called: `src/renderer/src/App.tsx:244`, `src/renderer/src/shell/WorkspaceAlerts.tsx:48`, `src/renderer/src/pods/PodsChrome.tsx`. Prediction confirmed |
| `NotificationProviderProps` | T1 | T4 (via JSX props) | covered; predicted not called: consumers pass props through JSX and never name the type | called: `src/renderer/src/notifications/NotificationProvider.tsx`, the provider's own parameter type. The first search over the session diff found nothing once T1's files were set aside. The second search, over the whole repository, has no ownership discard and found the provider's signature. Prediction refuted. No consumer outside `notifications/` names the type, which is what the prediction said |
| `NOTIFICATION_TEST_IDS` | T1 | T3, T4, T5 tests | covered; predicted called | called: `src/renderer/src/notifications/NotificationItem.tsx`, found by the whole-repository second search. The first search found only T1's files and test files. Outside `notifications/`, only tests use it. Prediction confirmed |
| `WorkspaceStore.routingModeError` | T2 | T4 | covered; predicted called | called: `src/renderer/src/shell/WorkspaceAlerts.tsx:73`. Prediction confirmed |
