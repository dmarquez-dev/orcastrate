# chrome-alert-width

Close `.sir/backlog.md` rows `:37`, `:38` and `:39`, the three alert-width rows left by `20261110-1618-chrome-alert-squeeze`, and end with a human validation pass. The user runs that pass from steps this session provides. It covers both this session's changes and the human checks still pending in the backlog.

## Context

- `20261110-1618-chrome-alert-squeeze` put the open-error and pods-error alerts in an `.alertRow` wrapper. The wrapper is `flex: 1 1 0` (`src/renderer/src/pods/PodsChrome.module.css:71`) and has a two-line clamp, with the full message in `title`. That stopped the alerts from squeezing the tab titles. The cost is that, with 6 Pod tabs, the open-error alert is 76.838 px wide and shows about two words ("cwd is not / accessible:…"). The pods-error alert is 143.675 px wide. Source: `measured.alertWidth` of O19 and O22 in `.dir-sdlc/handruns/2026-09-30-electron-handrun/driven-report-chrome-alert-squeeze.json`.
- No driver observation measures these alerts when the Pod tabs alone overflow `.chrome`. O19 and O22 run with leftover space, and O21 covers only the fork error (backlog `:38`).
- `PodBarPanel`'s `.reorderError` (`src/renderer/src/pods/PodBarPanel.module.css:13-18`) sets no `flex`. It therefore keeps a `0 1 auto` basis, the whole width of its message, inside the panel. Nothing has measured it (backlog `:39`).
- The measuring instrument is the fork-UI driven hand-run harness under `.dir-sdlc/handruns/2026-09-30-electron-handrun/`. Its practice, from memory and lessons: key a site by its declaration, measure widths as an equality within the same window, predict a control to fire, and check the app's own IPC before calling a site unreachable.

## Decisions

1. Track: **Standard**. Approved at Gate 1, 2026-11-10T19:16Z.
2. Scope is backlog rows `:37`, `:38` and `:39`.
3. `:38` and `:39` are measured first, with new driver observations, each with a control predicted to fire. CSS changes only where a measurement shows a squeeze, or where the `:37` width policy requires one.
4. The `:37` width policy is the user's decision. The spec phase presents 2–3 ranked options at Gate 2, grounded in the measured room. The decision is not made here.
5. A **human validation pass** is in scope. This was added by the user at Gate 1. The session provides numbered, step-by-step instructions (run `npm run dev` in the repository root, what to trigger, what to look at, and what passes). The user carries them out before the session closes. The pass covers:
   - (a) this session's visible changes (alert widths and clamps, and the reorder alert);
   - (b) the pending human checks in `.sir/backlog.md`: `:34` (⑂ reads as a fork mark), `:35` (fork-error tooltip shows the whole message), `:36` (two-line clamped fork error is acceptable), `:40` (open-error and pods-error clamp and tooltip) and `:41` (whether the ~77 px clamp tells the user enough; this check may be superseded by this session's `:37` change, so judge it against the new width).
   Gate 3 records each check's result as the user reports it. A check that passes closes its backlog row. A check that fails, or is not made, stays in the backlog or becomes a new row, with the user's observation recorded.
6. Out of scope: the hand-run harness tooling row (`:27`), slash-command autocomplete (`:42`), and the kept-deferred design items (`:30`–`:33`).
