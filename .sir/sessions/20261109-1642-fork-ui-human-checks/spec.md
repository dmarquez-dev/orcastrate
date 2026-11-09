# Fork UI human checks

Close the five "Human check not made at Gate 3" rows in `.sir/backlog.md` (lines 34–38 at
`fea8246`). A Playwright `_electron` driver asserts or measures each one against the built
app, with a positive control for every check.

## Context

Two fork sessions (`20261105-1907-fork-session-branching`, `20261106-0120-fork-hardening`)
shipped the Pod-tab Fork control, the fork's ancestry tooltip, and the fork-error alert. The
jsdom e2e suite (`src/renderer/src/__tests__/pod-fork.e2e.test.tsx`) covers their text and
behaviour. Five properties need a real Chromium: glyph rendering and size, computed
opacity and cursor, the native `title` tooltip, inline layout of the dismiss button, and
focus-ring visibility. The project's driven hand-run harness at
`.dir-sdlc/handruns/2026-09-30-electron-handrun/driver/` already launches the built app in
a sandboxed home, so this session adds one driver to it and does not build a new harness.

## Definition of done

`H` = `.dir-sdlc/handruns/2026-09-30-electron-handrun`.

1. `H/driver/run-fork-ui.mjs` exists and imports `sandbox.mjs` rather than copying it.
2. Every earlier handrun artifact is byte-identical to base: 80 files, hash `a9edbb25…c9ca`
   (`README.md` excepted; it gains one bullet).
3. The driver launches the worktree's `out/main/index.js` with the sandbox redirect in force,
   and the real `~/.claude/settings.json` is unchanged across the run.
4. The four states are reached by the routes contract I3 names: S1 no session, S2 running,
   S3 fork succeeded, S4 fork failed.
5. Check 1: the ⑂ glyph is measured not to be a missing-glyph box, and its size is the same
   as ▶ and × (O1, O2).
6. Check 2: on S1 and S2, the Fork control is measured dimmed, `not-allowed`, and exposing
   the reason `title` (O3–O8).
7. Check 3: the fork's tab exposes `Forked from <parent title>` (O9).
8. Check 4: the dismiss `×` is on the error text's line, vertically centred, and at
   least 4.5:1 contrast under dark and light colour-scheme preferences (O10–O13).
9. Check 5: Tab reaches `Dismiss fork error` with a visible ring, Enter closes the alert,
   and focus lands on the Pods chrome with a visible ring (O14–O16).
10. Every observation has an in-window positive control whose prediction was written before
    the run, and the observed result is recorded beside it.
11. `H/FINDINGS-FORK-UI.md` records a verdict per observation, mapped to backlog rows 1–5.
12. No verdict compares against a pixel literal, and every measured reference starts `null`.
13. Each `defect` verdict is fixed in this session with a regression test shown able to fail,
    or escalated per contract I5.
14. Each fixed defect is re-checked by the unchanged driver and now passes.
15. `npm run typecheck` and `npm test` exit 0 at the session tip.
16. At Gate 3, each of backlog rows 34–38 is removed only if all of its observations are
    `pass` (directly, or after a fix and re-check). Otherwise it stays, with the reason.
17. `H/README.md`'s "Later runs" list gains one bullet for this run, and no existing line
    changes.

## Scope

The five checks, the driver that measures them, fixes for any defect it finds inside the
Pods renderer files T2 owns, and the Gate 3 backlog edit.

### Not in scope

- The Tooling live-`claude` hand-run harness row and the four MVP deferrals (Calf steering,
  config manager, terminal-session adoption, macOS/Linux validation). These stay deferred.
- Adding a light theme. Contract I5 makes this an escalation if a check calls for it.
- Any change to an earlier driver or to `sandbox.mjs` or `lib.mjs`. DoD 2 checks this.

## Assumptions

| Question | Answer | Rung | Evidence |
|---|---|---|---|
| Where does the driver live, and what are its outputs called? | `H/driver/run-fork-ui.mjs`. Outputs are `FINDINGS-FORK-UI.md`, `driven-report-fork-ui.{md,json}`, and `screenshots/fork-ui/`. | repo | `H/README.md:47-52` (naming convention `run-<slug>.mjs`) |
| Can the driver use `lib.mjs`'s screenshot and report helpers? | No. `shot()` and `writeReport()` write to tracked earlier-run paths. The driver may import `launch`, `step`, `check`, `note` and the other helpers. | repo | `H/driver/lib.mjs:9-10`, `:44-48`, `:107-150`; 48 tracked PNGs under `H/screenshots/` (`git ls-files`) |
| Does a fork need a live `claude`? | No. `defaultForkSession` calls the SDK's standalone `forkSession`, which copies a transcript file, so a sandbox `.jsonl` fixture is enough. | repo | `src/main/pod/fork-session.ts:10-12` |
| How does a Pod get a `ccSessionId` without `claude`? | The driver writes `cc_session_id` on the Pod's row. `#requirePod` re-reads the row on every call. | repo | `pod-manager.ts:1314-1316`, `:1547-1550`; `store/schema.ts:568` |
| How is a running Pod produced? | Main sends `push:podStatus { status: 'running' }`, which the renderer applies. | repo | `src/renderer/src/state/store.ts:378` |
| How is a fork made to fail? | Use a session UUID that has no transcript. The SDK rejects, main wraps the error as `IO`, and the alert shows it. | repo | `pod-manager.ts:551-556`; `PodsChrome.tsx:104` |
| What counts as "the tooltip"? | The `title` attribute on the element under the hover point (`elementFromPoint` then `closest('[title]')`). Chromium draws the native bubble outside the page. | repo + judgment | `discussion.md:26`; `fork-control.ts:51-66` |
| What does "readable" mean? | WCAG 2.x contrast: at least 4.5 for text and at least 3.0 for a focus indicator. | external | WCAG 2.2 SC 1.4.3, SC 1.4.11 |
| Does the app have a light theme? | No. One dark palette and no `prefers-color-scheme` rule, so O13 measures under an emulated light preference, records that the colours are identical to dark, and closes the light half of row 4 on that measurement (decided at Gate 2, D2). | repo | `src/renderer/src/styles/tokens.css:12-16`; `grep prefers-color-scheme` over renderer CSS found 1 match, which is that comment |
| Where is the sandbox? | `C:\oc-sandbox-<slug>`, outside the worktree, removed after the run (T1 C33). Allowed outside the worktree and scratch directory (decided at Gate 2, D3). | repo | `H/driver/smoke.mjs:30-32` (MAX_PATH reason); every earlier driver uses `C:\oc-sandbox*` |
| Can two tasks build or drive Electron concurrently? | No. Both use the one `out/`, so T1 → T2 → T3 run serially. | repo | `package.json:12`; `lib.mjs:49-50` |
| Which files do tasks inject defects into? | T1 into none; its controls are in-window only (T1 C29). T2 into its own production files, only to show a regression test can fail. T3 into none. | judgment | contract I4, I5 |
| How is a found defect handled without amending the manifest? | T2 is a pre-declared conditional fix task: if there is no `defect`, it writes nothing. A fix that needs an unowned file, a token change or a product decision is escalated. | judgment | `discussion.md` Decisions ("A check that turns up a real defect gets the defect fixed in this session") |
| Do packages resolve in the worktree? | Yes, from the main checkout's `node_modules`. Typecheck, tests and build all ran there. | repo | verification record in `state.json` |

## Contracts

- [`contracts/fork-ui-driver.md`](contracts/fork-ui-driver.md): I1 invocation and exit codes,
  I2 outputs and report shape, I3 states and routes, I4 observations and controls, I5 the
  defect-handling rule.

## Open questions

- These five unknowns are settled by T1's run, not before it. Each one is recorded in the
  run, and none can turn into a false pass:
  - whether `app.evaluate` can obtain `require` (I3 has a fallback route);
  - the minimum SDK fixture (S3 is judged by its outcome);
  - whether unassigned code points render identically (O1's instrument check);
  - whether the long IO error wraps at 1280 px (O10 or O11 may surface a real defect);
  - the Electron launch from the worktree (T1 C1).
