# Backlog

<!-- Project-level, not session-level. Append one line per item at Gate 3,
     after approval: the date, the session id, and the action in a
     sentence. Never create this file when there is nothing to append. -->

<!-- Example: 2026-10-26 oauth-login Defer rate-limiting the refresh endpoint to a later session. -->

<!-- Seeded 2026-10-29 from the open items of the previous framework's backlog
     (.dir-sdlc/backlog.md and .dir-sdlc/handoff-after-keyword-sweep.md), every
     file:line citation re-measured against the tree that day. Session ids
     dir-audit-2026-10-09, dir-handrun-2026-10-07 and dir-handoff-2026-10-26
     name DIR blocks that had no session of their own. -->

## Correctness

## Tests and guards

## Prose drift

## Cosmetic and structural

## Design decisions

## Tooling

2026-10-26 dir-handoff-2026-10-26 Build a live-`claude` hand-run harness, checking first whether the app's own IPC can reach a state; still unexercised are `B5`, the same-millisecond backup collision, `D3`, and narrow-window layout.

## Ungrouped (Gate 3 appends land here)
2026-11-05 20261105-0107-design-decisions-sweep Kept deferred: direct Calf steering (`src/main/pod/pod-runner.ts:486` still returns `{ supported: false }`); the steering tools exist, and the open question is how a user-authored message sent by the host reaches an agent without becoming that agent's permission consent (`docs/superpowers/specs/2026-08-18-orcastrate-design.md:444-452`).
2026-11-05 20261105-0107-design-decisions-sweep Kept deferred: the full config manager (MCP servers, hooks builder, agent/skill browsing), MVP-deferred at `docs/superpowers/specs/2026-08-18-orcastrate-design.md:438`.
2026-11-05 20261105-0107-design-decisions-sweep Kept deferred: adopting terminal-started Claude Code sessions by scanning `~/.claude/projects/`, MVP-deferred at `docs/superpowers/specs/2026-08-18-orcastrate-design.md:437`.
2026-11-05 20261105-0107-design-decisions-sweep Kept deferred: macOS and Linux validation, MVP-deferred at `docs/superpowers/specs/2026-08-18-orcastrate-design.md:443`.
2026-11-06 20261106-0120-fork-hardening Human check not made at Gate 3: run `npm run dev` in the repository root, make a fork fail, and check that the `×` dismiss button is vertically centred on the error's first line (same-line and contrast were measured `pass` by session 20261109-1642-fork-ui-human-checks; its O11 centring measure is `instrument-invalid` because the control cannot fire under a wrapped error).
2026-11-09 20261109-1642-fork-ui-human-checks Human check not made at Gate 3: run `npm run dev` in the repository root, or open `.dir-sdlc/handruns/2026-09-30-electron-handrun/screenshots/fork-ui-recheck/O1-fork.png`, and check that the ⑂ on a Pod tab reads as a fork mark; driver O1 proves only that it is not the missing-glyph box and not blank.
2026-11-09 20261109-1642-fork-ui-human-checks Fix the Pod tab titles disappearing while the fork-error alert is shown: compare `.dir-sdlc/handruns/2026-09-30-electron-handrun/screenshots/fork-ui-recheck/03-s4-fork-error.png` with `01-s1-s2-bar.png` (titles visible in 01, absent in 03); noted unscored at `FINDINGS-FORK-UI.md:102-104`.
2026-11-09 20261109-1642-fork-ui-human-checks Amend the fork-UI driver's O11 control prediction (half the button height, `.sir/sessions/20261109-1642-fork-ui-human-checks/contracts/fork-ui-driver.md:169`) so it can fire under a wrapped error, then re-run `node .dir-sdlc/handruns/2026-09-30-electron-handrun/driver/run-fork-ui.mjs` to score the `×` centring; T2 measured the control at 16.725 px against a 15.95 px button.
2026-11-09 20261109-1642-fork-ui-human-checks In `run-fork-ui.mjs`, bring `tol` (derived from `const winFacts`, lines 506-509) and the `const x = … ?? null` in-window lookups under the null-initialised-reference rule, e.g. by putting `tol` in each observation's `refs`.
2026-11-09 20261109-1642-fork-ui-human-checks Reword or re-implement O14's "byte-identical to the control capture" in `run-fork-ui.mjs`: the driver compares two successive captures under the control (`capB` ≡ `capB2`, lines 1020 and 1045), not the ring capture against the control.
2026-11-09 20261109-1642-fork-ui-human-checks Either fold `meta.sandboxRemoved` and `meta.precondition` (`run-fork-ui.mjs:365-366`) into the driver report contract I2 or drop them; they are additions beyond I2's shape.
2026-11-09 20261109-1642-fork-ui-human-checks Make O16's control in `run-fork-ui.mjs:1121` dismiss the right alert: `win.click(DISMISS)` can run while O15's Shift-control alert is still in the DOM and relies on Playwright's first match.
