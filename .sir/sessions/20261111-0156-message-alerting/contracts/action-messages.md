<!-- frozen: 20261111-0156-message-alerting, Gate 2 -->
# Contract: which outcome raises which notification

Boundary between the tasks that raise notifications (T4: `App.tsx` and
`shell/WorkspaceAlerts.tsx`; T5: `pods/PodsChrome.tsx`) and the task that tests
them (T3: `__tests__/message-alerting.e2e.test.tsx`). The mechanism is
`contracts/notifications.ts`.

Rules for every row:

- `{title}` is the affected Pod's `title`, inserted as is. For S3 it is the
  NEW Pod's title (`forkPod`'s resolved value).
- An error row's message is `IpcError.message` VERBATIM, with nothing added.
- `{podId}` in a key is the Pod's id.
- No message text in this file contains a `|`, so no cell needs an escape.
- T3 writes every wording below as a LOCAL literal in its test file. It does not
  import wording from a product file: a test that imports the string it checks
  cannot detect a wording change.
- The row id (S1, E4, R1 ...) begins the title of the one `it` in T3's file
  that checks that row.

## Table A: data-altering action succeeds

| Row | Action and outcome | Kind | Message, exactly | Key | Raised by |
|-----|--------------------|------|------------------|-----|-----------|
| S1 | `createPod` resolves ok | success | `Pod created: {title}` | `pod-create` | T5 |
| S2 | `deletePod` resolves ok with `session` not `'failed'` | success | `Pod deleted: {title}` | `pod-delete` | T5 |
| S3 | `forkPod` resolves ok | success | `Pod forked: {title}` | `pod-fork` | T5 |
| S4 | `openPod` resolves ok | info | `Pod started: {title}` | `pod-open` | T5 |
| S5 | `reconnectPod` resolves ok | info | `Pod reconnected: {title}` | `pod-open` | T5 |
| S6 | `closePod` resolves ok | info | `Pod stopped: {title}` | `pod-close` | T5 |
| S7 | `reorderPods` resolves ok | success | `Pod order saved` | `pod-reorder` | T5 |
| S8 | `interruptPod` resolves ok | info | `Interrupt sent` | `pod-interrupt` | T4 |

A success row shares its key with the same action's error row, so a successful
retry replaces a standing error instead of sitting beside it.

## Table B: unrecoverable failure

Every row's notification is kind `error`. For E1-E6 the Pod header
(`data-testid="pods-chrome"`) contains no `role="alert"` element afterwards.

| Row | Failure | Key | Cleared by `dismiss(key)` when | Raised by |
|-----|---------|-----|--------------------------------|-----------|
| E1 | `pods.list` fails (`pods.phase === 'error'`) | `pods-load` | `pods.phase` leaves `'error'` | T5 |
| E2 | `openPod` resolves `ok: false` | `pod-open` | the next run-control activation starts | T5 |
| E3 | `reconnectPod` resolves `ok: false` | `pod-open` | the next run-control activation starts | T5 |
| E4 | `forkPod` resolves `ok: false` | `pod-fork` | the next Fork activation starts | T5 |
| E5 | `reorderPods` resolves `ok: false` | `pod-reorder` | the next reorder starts | T5 |
| E6 | `closePod` resolves `ok: false` | `pod-close` | the next stop starts | T5 |
| E7 | `interruptPod` resolves `ok: false` | `pod-interrupt` | the next interrupt starts | T4 |
| E8 | the active Pod's `lanes.list` fails (`useLaneRail().phase === 'error'`) | `lanes-load:{podId}` | that Pod's lane phase leaves `'error'` | T4 |
| E9 | the active Pod's `events.read` backfill fails (`session.backfill.phase === 'error'`) | `events-load:{podId}` | that Pod's backfill phase leaves `'error'` | T4 |
| E10 | `app.routingMode()` fails (`routingModeError !== null`) | `routing-mode` | never; there is no retry | T4 |

## Table C: what stays quiet

| Row | Situation | Notifications in the viewport |
|-----|-----------|-------------------------------|
| R1 | A Pod's backfill carries the startup-reconciliation `system` event (`STARTUP_RECONCILIATION_SUBTYPE`) and no action has been taken | none |

## Outcomes reported where the user acted (no notification)

These already put a message on screen at the place the user acted, and this
session does not move them. No task raises a notification for them.

- `createPod` fails: `NewPodDialog` keeps the dialog open with main's message (`NewPodDialog.tsx:319-323`).
- `pickDirectory` fails: next to Browse (`NewPodDialog.tsx:206-210`).
- `deletePod` fails, or deletes the Pod but cannot bin its session file: the confirmation stays open with the message (`DeletePodDialog.tsx:170-174`).
- `sendComposer` fails: under the composer (`Composer.tsx:161`). It succeeds: the composer clears and the sent text appears as a transcript row.
- `respondToPermission` fails: on the card (`PermissionCard.tsx:173`). It succeeds: the card is removed by the `permissionResolved` push.
- Helm `save` succeeds: the `Saved` notice, `role="status"` (`HelmNotices.tsx:157-168`). Helm actions fail: `HelmNotices` renders `actionError`.
- Beachcomber `trashPreviewed` succeeds: the result summary, `role="status"` (`BeachcomberResult.tsx:45-50`). Beachcomber actions fail: `BeachcomberError` (`BeachcomberError.tsx:30`).
