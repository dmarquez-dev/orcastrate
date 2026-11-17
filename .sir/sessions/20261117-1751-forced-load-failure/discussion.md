# Forced load failure

Give the running app a dev-only way to make one workspace load fail on demand: E8 `lanes.list`, E9 `events.read` or E10 `app.routingMode`. Those three failures are the only notifications that carry a Retry action. With them forcible, the two Retry-control checks in `.sir/backlog.md` (session 20261112-0151-workspace-load-retry, the two rows starting "Human check not made") can be made at Gate 3, and both rows can close.

## Context

- The backlog has two open human checks from 20261112-0151-workspace-load-retry. (1) The Retry button reads as a button next to the message, and tabbing to it shows its thick focus ring (`.action:focus-visible` in `src/renderer/src/notifications/Notifications.module.css`), not clipped by the item's border. (2) Definition-of-done item 38 of that session: the Retry control is visible and legible in both the light and the dark theme. Both rows say nothing in the app can force such a failure.
- The renderer issues these loads through `safeInvoke` in `src/renderer/src/state/store.ts`: `api.app.routingMode()` (:430), `api.events.read(...)` (:1030) and `api.lanes.list(podId)` (:1190), line numbers at `e539917`. Main answers `app:routingMode` at `src/main/ipc/handlers.ts:239`.
- `grep` for `process.env.` or `import.meta.env` across `src/` printed nothing at `e539917`, so the app has no runtime switch of any kind today.
- Every other open backlog row is out of scope. Row 27 (the live-`claude` harness) is large. Rows 30-33 are kept deferred. Rows 36-40 are blocked. Row 42 is a watch item. Row 41's small features are left for a later Small session.

## Decisions

- Track: **Standard** (Gate 1, approved).
- E1 (escalation, reason `ambiguous`), answered at Gate 1 on the recommended option: the switch is an **environment variable read in main**, e.g. `ORCASTRATE_DEV_FAIL_LOAD=lanes|events|routing`. The setting makes the IPC handler for that one load reject, so the renderer's real failure and Retry path runs unchanged. It is read only when `app.isPackaged` is false, so a packaged build can never reach it. The other options were a renderer-only `import.meta.env.DEV` flag in `safeInvoke` and a test-only render with no production code; both were declined. The spec phase carries E1 into `state.json`'s `escalations` with this answer.
- The switch is **off by default** and is the **only** runtime switch the spec introduces.
- Tests must show four things: the switch is inert when unset; it is inert when packaged; it is inert for an unrecognized value; and each recognized value fails exactly its one load and no other.
- **Spec checks first** whether the app's own IPC or DevTools can already force one of these failures, per the hand-run harness lesson. If one can, the session shrinks to the recipe and the checks, and the switch is not built.
- A human-checks recipe for both backlog rows goes under `.dir-sdlc/handruns/`. It says how to start `npm run dev` with the variable set, and what to look at in the light theme and the dark theme. Plan at Gate 2 for the harness possibly blocking a write there, per lesson 2026-11-09. The user makes both checks at Gate 3. If they pass, Gate 3's backlog edit removes both rows.
- Behaviour change for users: none. The switch is unreachable in a packaged build, and inert when unset.
