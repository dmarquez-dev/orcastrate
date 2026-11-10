# chrome-alert-squeeze

Make sure no alert in the Pod-bar `.chrome` row squeezes the Pod tabs. Measure each case with the hand-run driver, and fix the CSS wherever a measurement shows a squeeze.

## Context

The previous session, `20261109-2239-fork-ui-followups`, made two changes to the fork-error alert:

- It gave the alert a zero flex basis (`.dismissible { flex: 1 1 0 }`, `src/renderer/src/pods/PodsChrome.module.css:41`).
- It clamped the alert to two lines, so a long message no longer collapses the Pod tab titles.

It also left two follow-ups in `.sir/backlog.md`.

**`.sir/backlog.md:35` (the fork error).** The fork-error row has never been measured with the Pod tabs alone filling or overflowing `.chrome`.

- `.chrome > :first-child` is `flex: 1 1 auto` (`PodsChrome.module.css:15`).
- `.dismissible` has a zero basis and no `min-width: 0`.

So under negative free space the panel shrinks alone, and the row still takes its min-content width (the dismiss button plus about one glyph under `overflow-wrap: anywhere`). Driver observation O17 runs with 5 tabs and leftover space, so it does not cover this case. The check this item names is that `podBarWidthAlertShown` differs from `podBarWidthReference` in a `driven-report-*.json`, read with `python -I`.

**`.sir/backlog.md:36` (the open-error and pods-error alerts).** These are bare `<p className={styles.listError} role="alert">` children of `.chrome` (`src/renderer/src/pods/PodsChrome.tsx:282` and `:309`). `.listError` (`PodsChrome.module.css:18`) sets no `flex`, so each alert keeps the default `0 1 auto` basis of its whole one-line message. That is the mechanism that squeezed the tabs under the fork error. It is unmeasured.

The driver is the Playwright fork-UI hand-run harness that the previous session amended and ran with `--slug fork-ui-followups`. Its findings and screenshots live under `.dir-sdlc/handruns/2026-09-30-electron-handrun/`.

## Decisions

- Track: **Standard** (approved at Gate 1, 2026-11-10).
- Scope is backlog rows `:35` and `:36` only. Gate 3 closes both rows, provided the measurements that close them are recorded.
- `:35`: add a driver observation that fills or overflows `.chrome` with Pod tabs, shows the fork error, and compares the Pod-bar width with and without the alert. Change the CSS only if that measurement shows the row takes width from the panel.
- `:36`: measure whether the open-error and pods-error alerts shrink the Pod bar. If either one does, bound it the way the fork error is bounded: zero basis, two-line clamp, and `title` carrying the whole message. Keep each alert's text a direct text node and keep `role="alert"`.
- **Measure first, then fix.** Each fix lands only behind a measurement that shows the defect, and each closing row cites a measured `pass` from the driver report.
- Not in scope:
  - the three human checks (`.sir/backlog.md:34`, `:37`, `:38`)
  - the Tooling live-`claude` harness item (`:27`)
  - the kept-deferred design items (`:30`-`:33`)
- Lessons to carry into this session (from `.sir/lessons.md`):
  - Give every path in a `sir-git` brief in Git Bash form.
  - Plan at Gate 2 for copying findings files written under `.dir-sdlc/handruns/` from scratch.
  - Count `:a-b` ranges as b−a+1.
  - Count table fields with `python -I`.
