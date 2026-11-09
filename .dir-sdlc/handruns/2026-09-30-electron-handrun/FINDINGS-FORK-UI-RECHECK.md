# Fork UI human checks: re-check after the fix (2026-11-09)

This file records the re-run of `driver/run-fork-ui.mjs` with slug `fork-ui-recheck`, made
after the fix to the fork-error dismiss button's layout. The driver is the one that produced
`FINDINGS-FORK-UI.md`, unchanged: both reports carry driver sha256
`b7c5a8933f43bdf15751b8cf37d9c558f73b53d27ff7dc7f6cdec3dfac2ca3fd`.

The fix set `.dismissible` in `src/renderer/src/pods/PodsChrome.module.css` to
`align-items: flex-start`, so the dismiss button sits on the first line of a wrapped error.
O10 is the observation it was made for.

Every value below comes from `driven-report-fork-ui-recheck.json` (generated
2026-11-09T19:07:36.293Z, `out/main/index.js` sha256
`025d3f6f2a0103c98791b6fcab5819c44809755557e37512554fa95198c152c8`). The screenshots are in
`screenshots/fork-ui-recheck/`.

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
| O10 | 4 | pass | 2 line boxes (y 2.65-17.05 and 18.60-33.00); button y 2.65-18.60, centre 10.625; line boxes containing the centre 1 (line 1); button right of that line's right edge = true | inline flex-direction: column on the button's parent | 0 line boxes contain the button centre | 0 line boxes contain the centre |
| O11 | 4 | instrument-invalid | centre-Y difference 0.775 against line 1; tolerance 0.99999999 px from devicePixelRatio 1.0000000149011612; button height 15.95 | inline margin-top on the button equal to its measured height | difference equals half the button height within one device pixel, so exceeds the tolerance | difference 16.725; half button height 7.975; they differ by 8.750 against a tolerance of 1.000, so the control did not fire |
| O12 | 4 | pass | dark: foreground rgb(154, 162, 177), background rgb(26, 29, 35), ratio 6.573 against 4.5 | inline color on the button set to the measured background | ratio 1.00 | ratio 1.00 |
| O13 | 4 | pass | light: foreground rgb(154, 162, 177), background rgb(26, 29, 35), ratio 6.573 against 4.5; foreground identical to O12 = true; background identical to O12 = true | inline color on the button set to the measured background | ratio 1.00 | ratio 1.00 |
| O14 | 5 | pass | 7 Tab presses (bound 26 tabbables); :focus-visible true; outline solid, 1.6px, rgb(106, 169, 255); contrast 7.02 against 3.0; ring clip differs from control clip = true | added style [aria-label="Dismiss fork error"]{outline:none !important} | outline-style none; the clip is byte-identical to the control capture | outline-style none; control capture repeated byte-identical: true |
| O15 | 5 | pass | after Enter on the focused dismiss button: alert count 0, button count 0 | second failed fork of P4; Shift pressed on the focused button instead | alert count stays 1 | alert count 1 (not dismissed) after 7 Tab presses and Shift |
| O16 | 5 | pass | activeElement [data-testid="pods-chrome"]; :focus-visible true; outline solid, 1.6px, rgb(106, 169, 255); contrast 7.02 against 3.0 | a further failed fork of P4 dismissed by mouse click | chrome focused; :focus-visible false | chrome focused; :focus-visible false |

## Before and after

One observation was `defect` in the first run:

- **O10: before `defect`, after `pass`.** Before, the button was centred on the two-line
  error (box y 10.63-26.57, centre 18.59999990) and no line box contained its centre.
  After, the button's box spans y 2.65-18.60, its centre at 10.625 lies inside line 1
  (y 2.65-17.05), and the `flex-direction: column` control still drove the count to 0, so
  the instrument was shown able to fail in this run too.

O11 was `instrument-invalid` in the first run and is `instrument-invalid` again, for a
different reason (see below). The other fourteen observations were `pass` in the first run
and are `pass` here, each with its control fired as predicted.

## Summary

- **Driver exit code: 2**, equal to `meta.exitCode`. In the invocation contract's exit-code
  table, 2 means at least one observation is `not-run` or `instrument-invalid`. Here that is
  O11 alone. No observation is `defect`. The other fifteen are `pass`, and each one's control
  fired as predicted.
- **devicePixelRatio** 1.0000000149011612, read in the window. **Viewport** 1280 x 860.
- **Route per state** (all four states were reached in one launch):
  - S1 no session: `pods.create`, then reload. P1 is born `closed` with `ccSessionId` null,
    and its fork control has `data-eligibility="no-session"`.
  - S2 running: `pods.create`, reload, then from main
    `webContents.send('push:podStatus', { podId, status: 'running' })` to the one app
    window. P2's fork control has `data-eligibility="mid-turn"` and its run control
    `data-verb="stop"`.
  - S3 fork succeeded: a one-record `.jsonl` fixture in the sandbox projects directory,
    `pods.create`, `cc_session_id` written by **session-id write route 1** (from main
    through `app.evaluate`; it changed 1 row per Pod), reload, then click P3's Fork.
    `pods.list` holds a Pod with `forkedFromPodId` = P3 and a new `ccSessionId`, and the
    fixture directory's `.jsonl` count went from 1 to 2. No `claude` process was involved,
    and route 2 was not needed.
  - S4 fork failed: `pods.create`, route 1 sets `cc_session_id` to a UUID with no
    transcript, reload, click P4's Fork. The alert text starts with
    `forkSession failed for pod `, and `pods.list` has length 5 before the click and 5 after.
- **Backlog rows: are all mapped observations `pass`?**
  - Row 1, glyph (O1, O2): **yes**.
  - Row 2, disabled state (O3-O8): **yes**.
  - Row 3, ancestry tooltip (O9): **yes**.
  - Row 4, dismiss layout and contrast (O10-O13): **no**. O10, O12 and O13 pass. O11 is
    `instrument-invalid`.
  - Row 5, keyboard (O14-O16): **yes**.

## O11

O11's own measurement now has a reference: line 1 contains the button centre, and the
button centre is 0.775 px from that line's centre, inside the one-device-pixel tolerance.
Its control does not fire, though. The control pushes the button down by its own height
(15.95) and predicts the difference then equals half that height (7.975). With the error
wrapped onto two lines, the pushed-down button's centre lands near line 2 instead, and the
difference measured against line 1 is 16.725. Under the contract's verdict rule an
observation whose control did not fire is `instrument-invalid`, whatever it measured, so
O11 is recorded as it stands. Making it scoreable needs a control whose prediction holds
for a wrapped error, which is a change to the contract's O11 row, not to the app.

## Recorded alongside, not scored

- Main process: `USERPROFILE` `C:\oc-sandbox-fork-ui-recheck\home`, `userData`
  `C:\oc-sandbox-fork-ui-recheck\home\AppData\Roaming\Electron`, `CLAUDE_CONFIG_DIR` null.
- The real `~/.claude/settings.json` had the same sha256 before and after the run
  (`1d8e7e488b2364a2e0d754e94c3bceee70a8e0278f99aa3437686a18329dd215`). The sandbox root
  was removed after the app closed (`meta.sandboxRemoved` true).
- No `*recheck*` file existed under this directory before the run.
- `FINDINGS-FORK-UI.md` noted that the Pod tabs show no visible titles while the fork-error
  alert is shown. The re-run's `screenshots/fork-ui-recheck/03-s4-fork-error.png` shows the
  same. This is seen in the screenshot, not measured, and carries no verdict.
