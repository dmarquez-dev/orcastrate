# Electron hand-run — 2026-10-07

The hand-run owed since sub-session C1. Orcastrate's Helm panel writes
`~/.claude/settings.json` and its Beachcomber panel moves files to the recycle
bin, and **neither had ever been driven outside jsdom**.

**It has now been run — automated, against the real Electron app.**
**110 of 111 checks passed. The one failure is a real defect.**

→ **Read `FINDINGS.md` first.**

## What happened

Playwright drives the actual built app via `_electron.launch`, so this is the
real main process, the real preload bridge, the real renderer and real
filesystem writes — not jsdom. Assertions are made by the harness, not by eye,
and 27 screenshots were captured for the things only a human can judge.

The headline finding is one no existing test could have caught:
**Helm's file watcher is never armed in the shipped app**, so the "This file
changed on disk" notice can never appear — and C2's `acknowledgeOwnWrite` fix,
though correct, currently guards a path that never executes. Details, root
cause and three ranked remediations are in `FINDINGS.md`.

## Files

| File | What it is |
|---|---|
| **`FINDINGS.md`** | **The deliverable.** The defect, what passed, what was not exercised, and the harness bugs found along the way. |
| `driven-report.md` / `.json` | Machine-generated per-step, per-check results. |
| `screenshots/` | 27 full-page captures from the real window. |
| `driver/run.mjs` | The suite: 24 steps across sections B–F. |
| `driver/sandbox.mjs` | Builds the throwaway home. Read the `AppData` comment before changing it. |
| `driver/smoke.mjs` | Proof the sandbox redirect actually works. Run this first if anything breaks. |
| `driver/probe-watcher.mjs` | The focused probe that root-caused the watcher defect. |
| `driver/lib.mjs` | Launch, assert, screenshot, report. |
| `TESTPLAN.md` | The 32-step **manual** plan. Still the reference for intent, and the fallback for steps a script cannot judge. |
| `RESULTS.md` | Capture template for a manual sitting. |
| `setup.ps1` / `teardown.ps1` / `evaluate.ps1` | For a manual run against the **real** home. Not needed for the driven run. |
| `fixtures/` | Settings in five states: baseline, external-edit, malformed, not-an-object, hold. |

## Later runs in this directory

**Each session that drives the app ships its own driver and its own artifacts, and leaves
the earlier ones untouched.** A completed driver is the record of its own run, so it is
never edited to say what a later run found; a later run writes a dated correction into the
earlier findings instead. The naming convention is
`driver/run-<slug>.mjs`, `FINDINGS-<SLUG>.md`, `driven-report-<slug>.md` / `.json` and
`screenshots/<slug>/` — so `ls driver/run*.mjs` is the list of runs, not a table here that
can go stale. That command returned four at the time of writing: the 2026-10-07 run above
(unslugged: `run.mjs`, `FINDINGS.md`, `driven-report.*`), plus `c3`, `token-sweep` and
`keyword-sweep`.

- **`FINDINGS-FORCED-LOAD-FAILURE.md`** (2026-11-17) — the two Retry-control human checks
  left open by `20261112-0151-workspace-load-retry`, made performable by forcing the E8 and
  E9 load failures through the app's own IPC (a Pod deleted from the console, then its stale
  tab clicked). Slug `forced-load-failure`: exit 1, 12 of 13 observations pass, 1 fails (O9,
  the focus ring computes to 1.6px against the 2px `--oc-border-thick`, consistent with
  device-pixel snapping at a 1.25 display scale), every control fired. Slug
  `forced-load-failure-skip-delete` (the must-fail control, the delete skipped): exit 2,
  0 of 13 observations pass, O3 fails as predicted and the other 12 are
  instrument-invalid. The hand recipe for the two checks is
  `HUMANCHECKS-FORCED-LOAD-FAILURE.md`.
- **`FINDINGS-CHROME-ALERT-WIDTH.md`** (2026-11-10) — how much of the Pod-bar row the
  open-error, pods-error and reorder alerts get, before and after the width policy. Slug
  `chrome-alert-width-base` (before): exit 1, the open-error and pods-error alerts got less
  than the space the Pod tabs leave free (O24, O30), and the reorder alert narrowed every
  Pod tab title (O25) and took more than the free space (O27). Slug `chrome-alert-width`
  (after): 32 observations, all pass, every control fired; exit 0. O28 and O31 confirm the
  open-error and pods-error rows keep only their min-content width when the tabs overflow.
  **Exception to the rule above, again:** `run-fork-ui.mjs` was amended in place again for
  these runs, so its sha256 differs from the one `driven-report-chrome-alert-squeeze.json`
  records.
- **`FINDINGS-CHROME-ALERT-SQUEEZE.md`** (2026-11-10) — the open-error and pods-error alerts
  in the Pod-bar row, before and after the fix. Slug `chrome-alert-squeeze-base` (before):
  exit 1, the two alerts squeezed every Pod tab title to 0 wide (O19, O22) and the pods-error
  text was painted above the row (O23). Slug `chrome-alert-squeeze` (after): 23 observations,
  all pass, every control fired; exit 0. O21 confirms the fork-error row keeps only its
  min-content width when the tabs overflow. **Exception to the rule above, again:**
  `run-fork-ui.mjs` was amended in place for these runs, so its sha256 differs from the one
  `driven-report-fork-ui-followups.json` records.
- **`FINDINGS-FORK-UI-FOLLOWUPS.md`** (2026-11-09) — the fork-UI follow-ups: Pod tab titles
  keep their width while the fork-error alert is shown (O17), and the alert is painted inside
  the Pod-bar row (O18). 18 observations, all pass, every control fired; exit 0. O11 is now
  scorable and passes. **Exception to the rule above:** `run-fork-ui.mjs` was amended in place
  for this run, so its sha256 differs from the one both earlier fork-UI reports record.
- **`FINDINGS-FORK-UI.md`** (2026-11-09) — the five fork-UI human checks, 16 observations
  each with an in-window control, driven by `run-fork-ui.mjs`: 14 pass, 1 defect (O10, the
  dismiss button straddles a two-line fork error), 1 instrument-invalid (O11); exit 2.
  Backlog rows 1, 2, 3 and 5 measured all-pass; row 4 not.
- **`FINDINGS-KEYWORD-SWEEP.md`** (2026-10-20) — the six `thin` border widths tokenised by
  `2026-10-16-orcastrate-keyword-hairline-sweep`, all six measured on screen, 70/70 checks.
  It also closes the **grouped-selector enumeration defect**: `run-keyword-sweep.mjs` keys
  each site by the DECLARATION and carries every selector in its group, so a declaration
  written under a comma-grouped selector is reached when any of them renders.
  `FINDINGS-TOKEN-SWEEP.md` carries the matching dated correction.
- **`FINDINGS-TOKEN-SWEEP.md`** (2026-10-12) — 36 border widths and 3 `letter-spacing`
  values, 52/52. `VERIFY-MERGED-MAIN.md` is its re-run against merged `main`.
- **`FINDINGS-C3.md`** — the C3 sub-session's run.

## Running it

```bash
npm run build          # the driver launches out/main/index.js
node .dir-sdlc/handruns/2026-09-30-electron-handrun/driver/smoke.mjs   # sanity
node .dir-sdlc/handruns/2026-09-30-electron-handrun/driver/run.mjs     # the suite
```

A later run is launched the same way, with its own driver — e.g.
`node .dir-sdlc/handruns/2026-09-30-electron-handrun/driver/run-keyword-sweep.mjs`. Note
that `smoke.mjs` writes into the shared `screenshots/` root and `lib.mjs`'s `writeReport()`
hardcodes `driven-report.*`, both of which belong to the 2026-10-07 run; a slugged driver
writes its own report and screenshots and leaves those alone.

Requires `playwright` (dev-dependency, installed for this). No browser download
is needed — `_electron` uses the Electron already in `node_modules`.

## Safety

The driven run **never touches your real `~/.claude`**. It builds a throwaway
home at `C:\oc-sandbox` and redirects `USERPROFILE`, `APPDATA`, `LOCALAPPDATA`
and `TEMP` into it, so the app's `CLAUDE_HOME` *and* its Pod sqlite store both
land in the sandbox. Every run ends by asserting the real `settings.json` is
byte-identical and that no stray backup appeared beside it. Both pass.

Deletion is Electron's `shell.trashItem` — the recycle bin, recoverable — and
only a sandbox fixture was ever moved.

### Two things that cost time, so you don't repeat them

- **`USERPROFILE` alone is not enough.** Pointing it at a bare directory makes
  Electron abort with `0xC0000003` before any app JS runs — no output at all.
  Chromium needs the `AppData\Roaming` / `AppData\Local` skeleton to derive its
  profile. `sandbox.mjs` creates it.
- **`app.getPath('home')` is the wrong probe.** Electron resolves it through the
  Windows shell API and returns the *real* profile even when `USERPROFILE` is
  redirected. The app uses `os.homedir()`, which does read the env var. Assert on
  what the UI renders instead.

## Why a sandbox was viable after all

The earlier manual plan targeted the real home, reasoning that Pod-dependent
scenarios needed a live `claude` process that a sandbox would break. That was
wrong: `createPod` **spawns nothing** — it validates the cwd and writes a store
record (`pod-manager.ts:390`), and `openPod` is what spawns. Since Pod *blocking*
and project-scope Helm read `listPods()`, they work with a created Pod and no
child process. That is what made E4 — the crown-jewel safety check — reachable
in a fully isolated run.
