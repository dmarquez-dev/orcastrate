# Fork UI human checks

Close the five "Human check not made at Gate 3" rows in `.sir/backlog.md`'s Ungrouped
section, left by `20261105-1907-fork-session-branching` (three rows) and
`20261106-0120-fork-hardening` (two rows). A Playwright `_electron` driver runs each check
against the built app, so every check is asserted or measured and nobody has to eyeball it.

## Context

The five rows, as the backlog words them:

1. The ⑂ Fork glyph on a Pod tab renders as a fork mark, not a missing-glyph box, at the same
   size as ▶ and × (`src/renderer/src/pods/PodTab.tsx:31` defines `FORK = '⑂'`).
2. On a Pod with no session, and on a running Pod, the Fork control is dimmed, has a
   not-allowed cursor, and shows the reason tooltip on hover.
3. After a fork, hovering the fork's tab shows the native tooltip "Forked from <parent title>"
   (`src/renderer/src/pods/fork-control.ts:51-66`).
4. When a fork fails, the `×` dismiss button sits on the same line as the error text,
   vertically centred, and is readable in light and dark themes
   (`src/renderer/src/pods/PodsChrome.tsx:295`).
5. Tabbing to `Dismiss fork error` shows a visible focus ring, Enter closes the alert, and the
   ring then appears on the Pods chrome container.

jsdom e2e tests (`src/renderer/src/__tests__/pod-fork.e2e.test.tsx`) already cover the text
and the behaviour. Layout, glyph rendering, computed cursor and opacity, the native tooltip
attribute, and focus-ring visibility need a real Chromium.

The project already has a driven hand-run harness:
`.dir-sdlc/handruns/2026-09-30-electron-handrun/driver/`. It uses `sandbox.mjs`, `smoke.mjs`,
and one driver per session (`run.mjs`, `run-c3.mjs`, `run-token-sweep.mjs`,
`run-keyword-sweep.mjs`), and it launches `out/main/index.js` after `npm run build`. Things
the project has already learned about the harness, so the spec does not rediscover them:

- Redirecting `USERPROFILE` alone aborts Electron with `0xC0000003`. `sandbox.mjs` builds the
  `AppData\Roaming` and `AppData\Local` skeleton, and redirecting `APPDATA`/`LOCALAPPDATA`
  also moves the Pod store, so each run starts with no Pods.
- `createPod` spawns nothing; `openPod` spawns `claude`. Create Pods through
  `window.orcastrate.pods.create(...)`. The preload bridge returns `IpcResult<T>`, which is
  `{ ok, value }`.
- Before calling a state unreachable, check whether the main process can produce it by
  sending the app's own IPC push events (`push:laneChanged` and the like). This matters for
  the "running Pod" case of check 2 and the "fork fails" state of checks 4 and 5.
- Never assert a pixel literal. Compare two values measured in the same window, such as the
  glyph's box against ▶ and ×. Initialise every reference to `null` so an unset reference
  fails instead of passing.
- `innerText` leaves out `<input>` values and applies `text-transform`.
- Every "found nothing" gets a positive control with a predicted number. A missing-glyph
  check, in particular, has to be shown able to fail.

## Decisions

- Track: Standard. The output is five separate claims, each checked on its own, so Standard
  applies even though few files change.
- Session name: `fork-ui-human-checks`.
- Scope: all five rows above. A check that turns up a real defect gets the defect fixed in
  this session, with a regression test where jsdom can express one. A check that passes
  closes its row with the measured evidence.
- Instrument: a new driver following the one-driver-per-session convention. Earlier drivers
  stay byte-identical. The spec decides where the new driver lives and reuses `sandbox.mjs`
  rather than copying it.
- Each check gets a positive control: a substitution or injection, recorded in the run's
  findings, that shows the check can report failure.
- Out of scope, and still deferred in the backlog: the Tooling live-`claude` hand-run harness
  row and the four MVP deferrals (Calf steering, config manager, terminal-session adoption,
  macOS/Linux validation).
- At Gate 3, each of the five rows is removed only if its check ran and passed, or if its
  defect was fixed and re-checked. A check that could not be run stays in the backlog with
  the reason.
