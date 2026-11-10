# fork-ui-followups

Clear the fork-UI follow-ups that session `20261109-1642-fork-ui-human-checks` appended to the
Ungrouped section of `.sir/backlog.md`: fix the Pod-tab-titles-vanish bug, make the driver's O11
centring measure scorable, and tidy four driver advisories.

## Context

Session `20261109-1642-fork-ui-human-checks` built a Playwright driver,
`.dir-sdlc/handruns/2026-09-30-electron-handrun/driver/run-fork-ui.mjs`, that measured four of
five fork-UI human checks as `pass`. It appended seven backlog lines (`.sir/backlog.md:35-41`) and
trimmed an earlier one (`:34`). Its contract for the driver is
`.sir/sessions/20261109-1642-fork-ui-human-checks/contracts/fork-ui-driver.md`; its findings are in
`FINDINGS-FORK-UI.md` under the same handrun directory. Line numbers below were read from
`.sir/backlog.md` at `74e79ff` on 2026-11-09.

## Decisions

- Track: Standard (confirmed at Gate 1).
- Scope item 1 (`backlog.md:36`): find and fix the cause of Pod tab titles disappearing while the
  fork-error alert is shown (`screenshots/fork-ui-recheck/03-s4-fork-error.png` vs
  `01-s1-s2-bar.png`; noted at `FINDINGS-FORK-UI.md:102-104`). Fix lands in the renderer with a
  test, and the driver re-measures it.
- Scope item 2 (`backlog.md:37`): amend O11's control prediction (contract `fork-ui-driver.md:169`,
  half the button height) so it can fire under a wrapped error, then re-run the driver to score the
  `×` vertical centring. A `pass` closes `backlog.md:34` too; otherwise `:34` stays, re-measured.
- Scope item 3: the four driver advisories in `run-fork-ui.mjs`: `backlog.md:38` (`tol` and the
  `?? null` lookups under the null-initialised-reference rule), `:39` (O14 wording or
  implementation: it compares `capB` with `capB2`, not ring vs control), `:40` (fold
  `meta.sandboxRemoved`/`meta.precondition` into I2 or drop them), `:41` (O16's control must
  dismiss the right alert, not rely on Playwright's first match).
- Out of scope: `backlog.md:35` (⑂ reads as a fork mark, a human judgment), `:30-33` (kept
  deferred on purpose), and `:27` (broad live-`claude` harness).
- Plan for the harness blocking writes under `.dir-sdlc/handruns/` (lesson 2026-11-09): a task
  that writes a findings file there should expect the orchestrator to copy it in from scratch.
