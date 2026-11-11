# Message alerting

Research the best mechanism for alerting the user to events (error, informational, success) in
Orcastrate's Electron app, build it, and move the Pod tab header's in-row alerts onto it, so that
every data-altering action reports success or information and every unrecoverable failure always
reports an error. Closes `.sir/backlog.md:36` and settles `:35`.

## Context

- `.sir/backlog.md:36` (20261110-1857-chrome-alert-width, high priority, raised by the user at that
  session's Gate 3): research the best native alerting mechanism (toasts are one candidate, others
  open) and build it; reconsider the in-row alerts in the Pod tab header — `.alertRow`
  (`src/renderer/src/pods/PodsChrome.module.css:81`), the fork-error `.dismissible` (`:49`) and
  `.reorderRow` (`src/renderer/src/pods/PodBarPanel.module.css:30`); every data-altering action
  should produce an informational or success message; every unrecoverable failure (a missing
  directory, a conversation that cannot be forked, and the like) must always produce an error.
- `.sir/backlog.md:35` (same session): measure an open-error or pods-error alert shown together
  with a long reorder alert, because the zero-basis `.reorderRow` inflates the panel's basis.
- Current alert surface, from `grep` of `src/` for `role="(alert|status)"|aria-live` at `7489152`
  (about 30 sites): the three Pod-header alerts (`PodsChrome.tsx:287`, `:300`, `:317`;
  `PodBarPanel.tsx:102`), inline form errors (`Composer.tsx:161`, `NewPodDialog.tsx:207`, `:320`,
  `DeletePodDialog.tsx:171`, `PermissionCard.tsx:173`), pane status/error lines (TranscriptPane,
  HelmPanel, HelmComparison, Beachcomber), and the live regions `PodBar.tsx:156`,
  `PermissionCardList.tsx:40`.
- No toast or notification mechanism exists today; the design spec
  (`docs/superpowers/specs/2026-08-18-orcastrate-design.md`) does not mention one.
- `src/renderer/src/transcript/startup-reconciliation.test.tsx:113` records an earlier decision:
  "No modal, no toast, no dismissible banner" for startup reconciliation.

## Decisions

- Track: Standard. Session name `message-alerting`. Approved at Gate 1 as presented.
- Scope is `.sir/backlog.md:36` in full: research, then build the mechanism, then migrate the Pod
  tab header's in-row alerts (`.alertRow`, the fork-error `.dismissible`, `.reorderRow`) onto it.
- The research's output decides the mechanism (in-app toasts, Electron/OS `Notification`, or a
  combination); the spec phase records the choice and its evidence. "Native" is not presumed to
  mean OS notifications.
- `.sir/backlog.md:35` is settled through `:36`: if those alerts leave the tab-header row, the row
  is closed as moot; if any in-row alert remains, it is re-measured.
- Working assumption (not a user decision): inline form errors bound to a field or dialog
  (Composer, NewPodDialog, DeletePodDialog, PermissionCard) stay inline; the spec phase decides
  which events route to the new mechanism.
- Coverage requirement from the backlog row: every data-altering action produces an info or
  success message, and every unrecoverable failure always produces an error message. The spec
  phase enumerates the actions and failures.
- The startup-reconciliation "no toast" decision (`startup-reconciliation.test.tsx:113`) must be
  revisited explicitly by the spec, not silently overridden.
