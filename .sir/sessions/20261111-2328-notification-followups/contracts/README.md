# Contracts: none

This session freezes no contract file. No task consumes anything another task produces:

- T1 owns `NotificationItem.tsx` and `NotificationProvider.test.tsx` end to end. It changes a
  docblock and adds a test. The props of `NotificationItem` and the public surface of
  `notifications/index.ts` are unchanged.
- T3 owns `Notifications.module.css`, `Notifications.styles.test.ts` and the N7 wording in
  `docs/human-checks/message-alerting.md` end to end. It adds declarations under one existing
  selector. No class name is added or renamed, so no component reads anything new.
- T2 owns `PodsChrome.tsx` and the new `PodsChrome.test.tsx` end to end. It calls the existing
  `Notifier.notify` with an existing kind and key. `Notifier`, `NotificationRequest` and the
  `closePod` action are unchanged, and are already declared in source (`notifications/types.ts`,
  `contracts/renderer-state.ts`).

T2 runs after T1 and T3. The reason is the schedule, not an interface: both of them inject a
defect into a production file that T2's tests read, and T2 is the task that runs the repo-wide
commands.
