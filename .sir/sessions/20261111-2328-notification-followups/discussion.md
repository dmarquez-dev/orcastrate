# Notification follow-ups

Close the three code-level advisories that session 20261111-0156-message-alerting left in
`.sir/backlog.md` about the in-app notification region: the empty-message Text-node promise,
the silent stop of an unlisted Pod, and the invisible focus outline on the empty viewport.

## Context

The notification region shipped in 20261111-0156-message-alerting (merge `c0533d3`). Its Gate 3
appended these rows to `.sir/backlog.md`, Ungrouped section. Each anchor was re-measured at
`292bee6` during discuss:

- **Row 35, empty message.** `src/renderer/src/notifications/NotificationItem.tsx:10` says the
  message element's first child is "the one Text node React renders for a non-empty string".
  The test at `src/renderer/src/notifications/NotificationProvider.test.tsx:242` pins that only
  for non-empty messages. For `message === ''`, React renders no Text node (`{message}` sits
  inside the `role` element at `NotificationItem.tsx:53-55`), so the promise cannot hold.
  `textContent` is still `''` and nothing throws.
- **Row 37, unlisted Pod stop.** `src/renderer/src/pods/PodsChrome.tsx:164`,
  `if (title === undefined) return;`. `handleStop` reads the title from the `pods.value` row
  before the stop and returns early when the row is missing, because `closePod` resolves void.
  So a successful stop of an unlisted Pod raises no notification, and no row test covers this
  case.
- **Row 38, empty-viewport focus.** After the last item is dismissed, the empty viewport takes
  focus. `.viewport` (`src/renderer/src/notifications/Notifications.module.css:8`) has no
  padding and no minimum size, so its `:focus-visible` outline (`:20-22`) is probably
  invisible.

## Decisions

- Scope is exactly backlog rows 35, 37 and 38. Their backlog entries are removed at Gate 3 when
  they are closed.
- Track: standard. Name: `notification-followups`.
- Out of scope:
  - Row 36, the `role="status"` announce on insert. It needs Narrator observation, human check
    N6.
  - The four human checks N3, N5, N6 and N7 step 5. These need the user at the running app. A
    fix for row 38 may change what N7 step 5 observes. If it does, say so at Gate 3 and keep
    the check open; do not mark it made.
  - Row 39, the E8–E10 retry affordance, which is a feature of its own.
  - Cleaning up session-id citations in `src` (`git grep -l 20261111-0156 HEAD -- src` lists
    8 files; lessons 63–64). Offered at Gate 1 and not taken.
- Left open for spec: the behaviour choice for each row. Row 35: reject or normalise an empty
  message, or narrow the promise. Row 37: raise an untitled `Pod stopped` info, or keep the
  silence and document it. Row 38: give the focused empty viewport a visible size, or move
  focus elsewhere. Gate 1 approved the goal, not these behaviour choices. Resolve each through
  `sir-inference` and put it to Gate 2 as a decision.
- Each behaviour change gets a test that fails at base. Row 37 explicitly needs the row test
  that is missing today.
- Project lessons to apply:
  - Implementers restate a contract rule in place and never cite a session id or a
    `.sir/sessions` path in `src` (lessons 63–64).
  - The checkout uses `core.autocrlf=true`, so any hash criterion records what its named
    instrument prints (lesson 65).
  - Give the DAG tail a repo-wide `tsc` criterion, because vitest does not typecheck.
