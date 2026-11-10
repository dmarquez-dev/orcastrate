# Fork UI follow-ups

Fix the Pod tab titles vanishing while the fork-error alert is shown, make the driver's O11
centring measure scorable, and clear the four driver advisories in `run-fork-ui.mjs`.

## Context

Session `20261109-1642-fork-ui-human-checks` measured the fork UI with a Playwright driver,
`H/driver/run-fork-ui.mjs` (`H` = `.dir-sdlc/handruns/2026-09-30-electron-handrun`), and left
seven follow-ups at `.sir/backlog.md:34-41` (read at `74e79ff`). Three are in scope here:

- **Tab titles (`:36`).** In `.chrome`, the Pod bar panel is `flex: 1 1 auto`
  (`PodsChrome.module.css:13-16`). The fork-error row `.dismissible` (`:32-36`) keeps
  `flex: 0 1 auto`, so its basis is the message's full one-line width. Both shrink in
  proportion to their bases, so a long error takes width from the bar, and the `overflow:hidden`
  `.title` spans (`PodBar.module.css:106-112`) collapse first. This is the architect's reading,
  and T1 C1 confirms or refutes it. Once the bar keeps its width, a long error wraps past the
  38px row (`tokens.css:189`), so the fix must also bound the alert. Gate 2 (E1) decided to
  clamp the visible text to the row, with the full message as the alert's `title`.
- **O11 (`:37`, closes `:34` on a `pass`).** Under `align-items: flex-start`,
  `margin-top: h` moves the button by `h` relative to the text, not by `h/2`. The recheck
  measured 0.775 + 15.95 = 16.725 exactly. The new control is `position: relative; top: h`,
  and it is predicted to shift the signed difference by `h`.
- **Driver advisories (`:38-41`):** `tol` and seven `const … ?? null` lookups come under the
  null-initialised-reference rule; O14's wording is fixed (the code is right); `meta`'s two
  extra keys are folded into the report contract; O16's control clicks the dismiss button of
  the alert it produced.

## Definition of done

1. The cause of the vanishing tab titles is named at `file:line` in the base code and removed
   in the renderer. A stylesheet-text regression test is shown failing with one fix
   declaration reverted.
2. While the fork-error alert is shown, each Pod tab's title keeps its no-alert width within
   one device pixel. This is driver O17, `pass`, with a control that fired.
3. The fork-error alert's text is not painted outside the Pod-bar row. This is driver O18,
   `pass`, with a control that fired.
4. The full fork-error message stays available as the alert's `title`, verbatim.
5. The DOM hooks the driver reads are kept (contract §A): the alert's message is a direct
   text node of the alert, and `Dismiss fork error` is a native button next to the alert,
   not inside it. The existing fork e2e tests pass unmodified.
6. O11 is scorable: its amended control fires, its verdict is `pass` or `defect`, and its
   PLAN no longer says "half the button height".
7. `tol` and every `const x = … ?? null` lookup in the driver start as `null` and are listed
   in the `refs` of each observation that reads them.
8. O14's prediction wording states what the code computes. "byte-identical to the control
   capture" is gone from the driver.
9. `meta`'s fourteen keys, `sandboxRemoved` and `precondition` among them, are the contract's
   I2 shape.
10. O16's control dismisses the alert its own failed fork produced, and records the alert and
    button counts just before the click.
11. O1–O10 and O12–O16 still `pass`, each with a control that fired.
12. Every earlier handrun artifact is byte-identical to base: 106 files, hash
    `b7be6357…d38d`. The amended driver and `README.md` are excepted.
13. `H/FINDINGS-FORK-UI-FOLLOWUPS.md` records O1–O18 with verdicts, and `H/README.md` gains
    one bullet saying that the driver was amended in place.
14. `npm run typecheck` and `npm test` exit 0 at the session tip.
15. At Gate 3 the orchestrator edits `.sir/backlog.md`. It removes each of `:36-41` whose
    task criteria are met. It removes `:34` only if O11 is `pass`; otherwise `:34` stays,
    rewritten with the re-measured values. The orchestrator fills this item after approval.

## Scope

T1 changes the Pods renderer (`PodsChrome`, `PodBarPanel` and `PodBar` stylesheets and
tests, and `pod-fork.e2e.test.tsx`). T2 changes the fork UI driver, writes this run's new
report, screenshots and findings files, and adds the README bullet.

### Not in scope

- `backlog.md:35`: whether ⑂ reads as a fork mark, which is a human judgment.
- `backlog.md:30-33`: the four MVP deferrals, kept deferred.
- `backlog.md:27`: the broad live-`claude` hand-run harness.
- Whether the open-error and pods-error `listError` alerts, which share the fork error's row,
  squeeze the tabs the same way (architect's A6). If it is still unmeasured at Gate 3, it is
  carried to the backlog.
- Any change to `tokens.css`. If a fix needs a new or changed token, T1 C8 makes it an
  escalation.

## Assumptions

| Question | Answer | Rung | Evidence |
|---|---|---|---|
| What does "titles visible" mean as a measurement? | Each title keeps its no-alert width within `tol`, rather than merely being non-zero (O17). | judgment | `FINDINGS-FORK-UI-RECHECK.md:103-105`; `screenshots/fork-ui-recheck/01` vs `03` |
| Does this run overwrite the earlier fork-UI reports? | No. The new slug `fork-ui-followups` writes to new paths, and T2 C19 checks every earlier artifact's bytes. | repo | `run-fork-ui.mjs:49`, `:77-78`; hash re-run by the orchestrator at base: `b7be6357…d38d`, 106 files |
| Amend the driver in place, or copy it? | In place, as decided at Gate 2 (E2). README.md:44-47 says a completed driver is never edited, so the README bullet records the exception. | repo | `backlog.md:38-41`; `discussion.md` scope item 3; `README.md:44-52` |
| Why did O11's control read 16.725 px? | `margin-top: h` under `align-items: flex-start` shifts the button by `h`, not `h/2`: 0.775 + 15.95 = 16.725. | repo | `driven-report-fork-ui-recheck.json` O11; commit `c66e1e7` |
| Can the toolchain build concurrently in this worktree? | No. `npm run build` writes `out/`, the driver reads `out/main/index.js` and writes under `H`, and vitest writes `node_modules/.vite`. T2 runs after T1. | repo | `run-fork-ui.mjs:31`; lessons.md:33 |
| Which tasks inject defects into owned files? | T1 only: it reverts one fix declaration (C3) and wraps `{forkError}` in a `<span>` (C6), one scoped run each, then restores. T2's controls run in the window only. Nothing runs concurrently with T1. | repo | manifest T1 C3, C6; T2 C14 |
| Can T2's driver run break T1's repo-wide gates? | No. vitest includes `tests/**` and `src/**` only, and neither tsconfig includes `.dir-sdlc/`. | repo | `vitest.config.ts:19`; `tsconfig.node.json:2-10`; `tsconfig.web.json:2` |
| Does tab selection change a title's width between O17's reference and its measurement? | No. `.tabItemActive` sets only `background`. | repo | `PodBar.module.css:49-51`, `:106-112` |
| What if the harness blocks T2's edits under `H`? | T2 writes the text to scratch, the orchestrator copies it in, and the sha256 values must match (T2 C17). | repo | lessons.md:49 |
| Do packages resolve in the worktree? | Yes, from the main checkout's `node_modules`. Typecheck, tests and build all ran. | repo | verification record in `state.json` |

## Contracts

- [`contracts/fork-ui-driver-followups.md`](contracts/fork-ui-driver-followups.md): §A the
  fork-error row DOM hooks (T1 keeps them, T2 reads them); §B the driver invocation and
  `meta` shape, amending the prior I1 and I2; §C rows O11, O14, O16, O17 and O18, amending
  the prior I4.

## Open questions

None. Gate 2 settled four decisions:
- E1: clamp the visible text, with the full message as the alert's `title`.
- E2: amend the driver in place.
- Contract §B and §C are read by the orchestrator at Gate 3.
- DoD 15 is the orchestrator's, filled after approval.
