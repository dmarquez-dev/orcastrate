# Fork UI human checks: findings (2026-11-09)

This file covers the five "human check not made" rows left by the two fork sessions. Each was measured against the
built app by `driver/run-fork-ui.mjs` (slug `fork-ui`). Every observation has an in-window
positive control, and the driver's `PLAN` table holds each control's prediction, written before the run.
An observation whose control did not fire is `instrument-invalid`, whatever it measured.

Every value below comes from `driven-report-fork-ui.json` (generated
2026-11-09T18:43:03.263Z, driver sha256 `b7c5a8933f43bdf15751b8cf37d9c558f73b53d27ff7dc7f6cdec3dfac2ca3fd`,
`out/main/index.js` sha256 `025d3f6f2a0103c98791b6fcab5819c44809755557e37512554fa95198c152c8`).
The screenshots are in `screenshots/fork-ui/`.

## Verdicts

| Obs | Backlog row | Verdict | Measured | Control | Predicted | Observed |
|---|---|---|---|---|---|---|
| O1 | 1 | pass | 12x12 clip of P1's fork span: fork differs from U+0378 reference = true; fork differs from transparent-ink capture = true; decision "fork mark"; instrument check U+0379 byte-identical to U+0378 reference = true | U+0379 substituted into the fork span's text node, same clip, same decision | decision reports "missing glyph"; U+0379 byte-identical to the U+0378 reference | decision "missing glyph"; U+0379 byte-identical to U+0378 reference: true |
| O2 | 1 | pass | font-size fork 12px, play 12px, delete 12px; text-range height fork 16, play 16, delete 16; devicePixelRatio 1.0000000149011612 (tolerance 0.99999999 px); font-size pairs equal 2 of 2; text-range height pairs equal 2 of 2; box height 12/12/12 recorded, unscored | inline font-size on the fork span set to twice its computed value | 0 of 2 text-range height pairs equal | 0 of 2 text-range height pairs equal (fork text-range height 32 at 24px; box height pairs 2 of 2, unscored) |
| O3 | 2 | pass | P1 (no-session): fork opacity 0.5, run opacity 1 | same measurement on P3 before its fork (eligible) | fork opacity equals run opacity (not dimmed) | P3 fork opacity 1, run opacity 1: equal, not dimmed |
| O4 | 2 | pass | P1 fork cursor not-allowed | same measurement on P3 before its fork | pointer | pointer |
| O5 | 2 | pass | P1 hovered title (hit span[data-icon="fork"], holder the fork control) "There is no conversation to fork yet." equals fork-control.ts:25 | same hover on P3's fork control before its fork | null | null |
| O6 | 2 | pass | P2 (mid-turn): fork opacity 0.5, run opacity 1 | same measurement on P3 before its fork | fork opacity equals run opacity (not dimmed) | P3 fork opacity 1, run opacity 1: equal, not dimmed |
| O7 | 2 | pass | P2 fork cursor not-allowed | same measurement on P3 before its fork | pointer | pointer |
| O8 | 2 | pass | P2 hovered title "This Pod is mid-turn. Fork it once the turn ends." equals fork-control.ts:28 | same hover on P3's fork control before its fork | null | null |
| O9 | 3 | pass | fork's tab hovered title "Forked from P3 parent"; P3's title "P3 parent"; expected per fork-control.ts:66 | same hover on P3's own tab | null | null |
| O10 | 4 | defect | 2 line boxes (y 2.65-17.05 and 18.60-33.00); button y 10.63-26.57, centre 18.59999990; line boxes containing the centre 0 | inline flex-direction: column on the button's parent | 0 line boxes contain the button centre | 0 line boxes contain the centre |
| O11 | 4 | instrument-invalid | centre-Y difference null (no containing line from O10); tolerance 0.99999999 px from devicePixelRatio 1.0000000149011612; button height 15.95; nearest line centre 7.20 px away (recorded, not scored) | inline margin-top on the button equal to its measured height | difference equals half the button height within one device pixel, so exceeds the tolerance | not measurable under control |
| O12 | 4 | pass | dark: foreground rgb(154, 162, 177), background rgb(26, 29, 35), ratio 6.573 against 4.5 | inline color on the button set to the measured background | ratio 1.00 | ratio 1.00 |
| O13 | 4 | pass | light: foreground rgb(154, 162, 177), background rgb(26, 29, 35), ratio 6.573 against 4.5; foreground identical to O12 = true; background identical to O12 = true | inline color on the button set to the measured background | ratio 1.00 | ratio 1.00 |
| O14 | 5 | pass | 7 Tab presses (bound 26 tabbables); :focus-visible true; outline solid, 1.6px, rgb(106, 169, 255); contrast 7.02 against 3.0; ring clip differs from control clip = true | added style [aria-label="Dismiss fork error"]{outline:none !important} | outline-style none; the clip is byte-identical to the control capture | outline-style none; control capture repeated byte-identical: true |
| O15 | 5 | pass | after Enter on the focused dismiss button: alert count 0, button count 0 | second failed fork of P4; Shift pressed on the focused button instead | alert count stays 1 | alert count 1 (not dismissed) after 7 Tab presses and Shift |
| O16 | 5 | pass | activeElement [data-testid="pods-chrome"]; :focus-visible true; outline solid, 1.6px, rgb(106, 169, 255); contrast 7.02 against 3.0 | a further failed fork of P4 dismissed by mouse click | chrome focused; :focus-visible false | chrome focused; :focus-visible false |

## Summary

- **Driver exit code: 2**, equal to `meta.exitCode`. In the invocation contract's exit-code
  table, 2 means at least one observation is `not-run` or `instrument-invalid`. Here that is O11.
  O10 is `defect`. The other fourteen observations are `pass`, and each one's control
  fired as predicted.
- **devicePixelRatio** 1.0000000149011612, read in the window. **Viewport** 1280 x 860.
- **Route per state** (all four states were reached in one launch):
  - S1 no session: `pods.create`, then reload. P1 is born `closed` with `ccSessionId` null, and its
    fork control has `data-eligibility="no-session"`.
  - S2 running: `pods.create`, reload, then from main
    `webContents.send('push:podStatus', { podId, status: 'running' })` to the one app
    window. P2's fork control has `data-eligibility="mid-turn"` and its run control
    `data-verb="stop"`.
  - S3 fork succeeded:
    1. A one-record `.jsonl` fixture is written to the sandbox projects directory for `plain-repo`.
    2. `pods.create`.
    3. `cc_session_id` is written by **session-id write route 1**: from main through
       `app.evaluate`, with `better-sqlite3` required relative to `out/main/index.js`. It changed 1 row per Pod.
    4. Reload, then click P3's Fork.

    Result: `pods.list` holds a Pod with `forkedFromPodId` = P3 and a new `ccSessionId`, and the fixture directory's
    `.jsonl` count went from 1 to 2. No `claude` process was involved, and route 2 was not needed.
  - S4 fork failed: `pods.create`, then route 1 sets `cc_session_id` to a UUID with no
    transcript, then reload and click P4's Fork. The alert text starts with
    `forkSession failed for pod ` and ends `not found in project directory for C:\oc-sandbox-fork-ui\repos\plain-repo`.
    `pods.list` has length 5 before the click and 5 after.
- **Backlog rows: are all mapped observations `pass`?**
  - Row 1, glyph (O1, O2): **yes**.
  - Row 2, disabled state (O3-O8): **yes**.
  - Row 3, ancestry tooltip (O9): **yes**.
  - Row 4, dismiss layout and contrast (O10-O13): **no**. O10 is `defect` and O11 is
    `instrument-invalid`. O12 and O13 pass.
  - Row 5, keyboard (O14-O16): **yes**.

## What the two non-pass observations mean

**O10 (defect).** At 1280 px the IO error wraps onto two lines. The dismiss button is
centred vertically on the two-line block, so its centre lands on the boundary between the
lines. Line 1's text ends at y 17.05, line 2's starts at 18.60, and the centre is at
18.59999990, 4.8e-7 px above the top of line 2. By the containment the contract specifies, no
line contains it, and that strict verdict stands. The run also records, unscored, that
widening containment by one device pixel would count 1 line. Either way, the button
straddles both lines (its box spans y 10.63-26.57) and is centred on neither: the nearest
line centre is 7.20 px away. See `screenshots/fork-ui/03-s4-fork-error.png`.

**O11 (instrument-invalid).** Its reference is the line box from O10 that contains the
button centre. No such line box exists, so the reference stayed `null`. The rule therefore makes the
observation `instrument-invalid`, not `pass`.

**O2 (amended before this run).** Under the amended contract, O2 compares computed font-size and
text-range height, taken over each span's text node. The element box height is recorded but not scored,
because the shared `[data-icon]` rule in `src/renderer/src/pods/PodBar.module.css` fixes the
box at the same size for all three glyphs. In the previous run, that fixed box stopped
the doubled-font-size control from firing. The text-range height does respond to the control: it reads 16 for each glyph and
32 for the fork glyph when the control is applied.

## Recorded alongside, not scored

- Main process: `USERPROFILE` `C:\oc-sandbox-fork-ui\home`, `userData`
  `C:\oc-sandbox-fork-ui\home\AppData\Roaming\Electron`, `CLAUDE_CONFIG_DIR` null.
- The real `~/.claude/settings.json` had the same sha256 before and after the run
  (`1d8e7e488b2364a2e0d754e94c3bceee70a8e0278f99aa3437686a18329dd215`). The sandbox root
  was removed after the app closed (`meta.sandboxRemoved` true).
- O14's prediction says the clip is "byte-identical to the control capture". The driver
  reads this as follows: with the control applied, a second capture of the same clip is byte-identical to
  the first, so the clip comparison is able to report "no ring". The ring check itself compares
  the capture without the control against the capture with it, and those two differ.
- Seen in the screenshots but not measured, with no verdict attached: while the fork-error
  alert is shown, the Pod tabs lose their visible titles
  (`screenshots/fork-ui/03-s4-fork-error.png` against `01-s1-s2-bar.png`).
