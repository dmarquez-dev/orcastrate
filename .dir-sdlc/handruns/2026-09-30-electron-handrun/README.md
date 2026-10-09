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

## Running it

```bash
npm run build          # the driver launches out/main/index.js
node .dir-sdlc/handruns/2026-09-30-electron-handrun/driver/smoke.mjs   # sanity
node .dir-sdlc/handruns/2026-09-30-electron-handrun/driver/run.mjs     # the suite
```

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
