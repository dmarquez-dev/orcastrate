# Fork UI follow-ups: tab titles, the clamped alert, and a scorable O11 (2026-11-09)

This file records the run of `driver/run-fork-ui.mjs` with slug `fork-ui-followups`. It was
made after the renderer fix that keeps the Pod tab titles at full width while the fork-error
alert is shown. That fix gave the alert's row a zero flex basis (`.dismissible { flex: 1 1 0 }`),
clamped the message to two lines inside the Pod-bar row, and made the full message the
alert's `title`.

**The driver was amended in place for this run**, so its sha256
(`0df3f088384c1baf1a10f8a47c599d1e9a6edbaeed683f97ff0f861286134128`) differs from the one
recorded by `FINDINGS-FORK-UI.md` and `FINDINGS-FORK-UI-RECHECK.md`. The amendments:

- **Row 6 is new.** O17 measures the Pod tab title widths while the alert is shown. O18
  checks that the alert's text is painted inside the Pod-bar row.
- **O10** counts only *painted* line boxes. These are the text's client rects clipped by
  every overflow ancestor below the chrome, the same way O18 clips them. The two-line clamp
  leaves the hidden lines laid out, and on the raw line set the control's displaced button
  landed inside a hidden line.
- **O11**'s control is now `position: relative; top: <h>px`, and it predicts that the signed
  difference shifts by `h`.
- **O14**'s prediction is reworded to state what the code computes.
- **O16**'s control clicks the dismiss button in the row of the alert its own failed fork
  produced.
- `tol` and every lookup that can yield null start as `null`, and each one is listed in the
  refs of the observations that read it.

Every value below comes from `driven-report-fork-ui-followups.json` (generated
2026-11-10T01:17:22.949Z, `out/main/index.js` sha256
`025d3f6f2a0103c98791b6fcab5819c44809755557e37512554fa95198c152c8`). The screenshots are in
`screenshots/fork-ui-followups/`.

## Verdicts

| Obs | Backlog row | Verdict | Measured | Control | Predicted | Observed |
|---|---|---|---|---|---|---|
| O1 | 1 | pass | 12x12 clip of P1's fork span: fork differs from U+0378 reference = true; fork differs from transparent-ink capture = true; decision "fork mark"; U+0379 byte-identical to U+0378 = true | U+0379 substituted into the fork span's text node, same clip, same decision | decision reports "missing glyph"; U+0379 byte-identical to the U+0378 reference | decision "missing glyph"; U+0379 byte-identical to U+0378 reference: true |
| O2 | 1 | pass | font-size fork 12, play 12, delete 12; text-range height 16/16/16; font-size pairs equal 2 of 2; text-range height pairs equal 2 of 2; box height 12/12/12 unscored | inline font-size on the fork span set to twice its computed value | 0 of 2 text-range height pairs equal | 0 of 2 text-range height pairs equal (fork text-range height 32 at 24px) |
| O3 | 2 | pass | P1 (no-session): fork opacity 0.5, run opacity 1 | same measurement on P3 before its fork (eligible) | fork opacity equals run opacity (not dimmed) | P3 fork opacity 1, run opacity 1: equal, not dimmed |
| O4 | 2 | pass | P1 fork cursor not-allowed | same measurement on P3 before its fork | pointer | pointer |
| O5 | 2 | pass | P1 hovered title "There is no conversation to fork yet." equals fork-control.ts:25 | same hover on P3's fork control before its fork | null | null |
| O6 | 2 | pass | P2 (mid-turn): fork opacity 0.5, run opacity 1 | same measurement on P3 before its fork | fork opacity equals run opacity (not dimmed) | P3 fork opacity 1, run opacity 1: equal, not dimmed |
| O7 | 2 | pass | P2 fork cursor not-allowed | same measurement on P3 before its fork | pointer | pointer |
| O8 | 2 | pass | P2 hovered title "This Pod is mid-turn. Fork it once the turn ends." equals fork-control.ts:28 | same hover on P3's fork control before its fork | null | null |
| O9 | 3 | pass | fork's tab hovered title "Forked from P3 parent", as fork-control.ts:66 builds it | same hover on P3's own tab | null | null |
| O10 | 4 | pass | 10 raw line boxes, 3 painted (y 2.65-17.05; 18.60-33.00; 34.55-34.55); alert box y 2.65-34.55; button y 2.65-18.60, centre 10.625; painted line boxes containing the centre 1 (line 0); button right of that line's right edge = true | inline flex-direction: column on the button's parent | 0 painted line boxes contain the button centre | 0 painted line boxes contain the centre (button centre 34.550; alert box y -5.33-26.57; 2 painted of 9 raw; 1 raw line would have contained it, unscored) |
| O11 | 4 | pass | signed centre-Y difference 0.775 against painted line 0; tolerance 0.99999999 px; button height h 15.95 | inline position: relative; top: h px on the dismiss button; line 0 re-measured under it | difference under control minus difference without it equals h within tolerance, and the absolute difference under control exceeds tolerance | signed difference under control 16.725; shift 15.950; shift minus h 0.000; absolute 16.725 against tolerance 1.000 |
| O12 | 4 | pass | dark: foreground rgb(154, 162, 177), background rgb(26, 29, 35), ratio 6.573 against 4.5 | inline color on the button set to the measured background | ratio 1.00 | ratio 1.00 |
| O13 | 4 | pass | light: foreground rgb(154, 162, 177), background rgb(26, 29, 35), ratio 6.573 against 4.5; identical to O12 = true (both) | inline color on the button set to the measured background | ratio 1.00 | ratio 1.00 |
| O14 | 5 | pass | 7 Tab presses (bound 26); :focus-visible true; outline solid 1.6px rgb(106, 169, 255); contrast 7.02 against 3.0; ring clip differs from control clip = true | added style [aria-label="Dismiss fork error"]{outline:none !important} | outline-style none; the painted-ring decision on two successive captures both under the control reports not painted | outline-style none; not painted (byte-identical: true) |
| O15 | 5 | pass | after Enter on the focused dismiss button: alert count 0, button count 0 | second failed fork of P4; Shift on the focused button instead | alert count stays 1 | alert count 1 after 7 Tab presses and Shift |
| O16 | 5 | pass | activeElement pods-chrome; :focus-visible true; outline solid 1.6px rgb(106, 169, 255); contrast 7.02 against 3.0 | further failed fork of P4, dismissed by mouse click on the dismiss button in that alert's own row | chrome focused; :focus-visible false; the clicked alert is absent afterwards | before the click 1 fork-error alert and 1 dismiss button; hit-test on the button true; clicked alert absent true; chrome focused, :focus-visible false |
| O17 | 6 | pass | 5 tabs in both; title widths reference = alert shown: P1 69.95, P2 57.788, P3 50.95, P4 48.925, fork 82.4; pod-bar width 1280 then 1098.25; tolerance 0.99999999 px | inline max-width on pod-bar set to half its width (549.125px) | at least 1 title narrower than its reference by more than tolerance | all 5 titles 0 wide; 5 of 5 narrower |
| O18 | 6 | pass | 10 raw line boxes, 3 non-empty after clipping by the alert p (overflow hidden); clipped y 2.65-17.05, 18.60-33.00, 34.55-34.55; pods-chrome box y 0.00-37.20, x 0-1280; largest overhang -2.65 | inline position: relative; top: 37.2px on the alert row | at least 1 non-empty clipped line box outside the chrome box by more than tolerance | 3 of 3 outside, largest overhang 34.55 |

## Summary

- **Driver exit code: 0**, equal to `meta.exitCode`. All eighteen observations are `pass`, and
  each one's control fired as predicted.
- **devicePixelRatio** 1.0000000149011612, read in the window. **Viewport** 1280 x 860.
- **Route per state** (all four states were reached in one launch):
  - S1 no session: `pods.create`, then reload. P1's fork control has
    `data-eligibility="no-session"`.
  - S2 running: `pods.create`, reload, then from main
    `webContents.send('push:podStatus', { podId, status: 'running' })` to the one app
    window. P2's fork control is `mid-turn` and its run control `data-verb="stop"`.
  - S3 fork succeeded: a one-record `.jsonl` fixture in the sandbox projects directory,
    `pods.create`, `cc_session_id` written by **session-id write route 1**, reload, then
    click P3's Fork. The fork Pod has `forkedFromPodId` = P3 and a new `ccSessionId`. The
    fixture `.jsonl` count went from 1 to 2. No `claude` process was involved.
  - S4 fork failed: `pods.create`, route 1 sets `cc_session_id` to a UUID with no
    transcript, reload, then click P4's Fork. The alert text starts with
    `forkSession failed for pod `, and `pods.list` has length 5 before and after.
- **Backlog rows: are all mapped observations `pass`?**
  - Row 1, glyph (O1, O2): **yes**.
  - Row 2, disabled state (O3-O8): **yes**.
  - Row 3, ancestry tooltip (O9): **yes**.
  - Row 4, dismiss layout and contrast (O10-O13): **yes**.
  - Row 5, keyboard (O14-O16): **yes**.
  - Row 6, tab titles and the alert inside the row while it is shown (O17, O18): **yes**.
- **O11: `pass`.** The button centre is 0.775 px below the centre of painted line 0, within the
  0.99999999 px tolerance. The control shifted the signed difference by 15.950, equal to the
  button height 15.95, so the instrument was shown able to fail. Under the rule set for this
  session, the backlog entry for the O11 centring check (backlog.md:34) **closes**.
- **Before and after:**
  - O11: in `driven-report-fork-ui-recheck.json` it was `instrument-invalid` (the
    `margin-top` control moved the difference to 16.725 against a predicted 7.975). Now it is
    `pass`, with the control firing.
  - Tab titles: in `FINDINGS-FORK-UI-RECHECK.md:103-105` they were seen missing in the S4
    screenshot, unmeasured and unscored. Now they are measured as O17, `pass`: all five
    titles keep their no-alert widths exactly, and `screenshots/fork-ui-followups/03-s4-fork-error.png`
    shows them.

## Recorded alongside, not scored

- O10 and O11 now use the painted line set. O11's containing line is still index 0, and its
  values (0.775, 15.95, 16.725) are the same as in an earlier, superseded run of the amended
  driver this session that used the raw line set. That run's report was overwritten by this one.
- The third painted (O10) and clipped (O18) box, y 34.55-34.55, is a sliver at the bottom
  edge of the alert's clipping box (alert box y 2.65-34.55, line 2 starts at 34.55). Its
  height rounds to 0.00 at two decimals. It passed the strict non-empty test
  (`right > left` and `bottom > top`), so it counts as painted.
  It cannot contain the button centre at 10.625. Under O10's control the alert box ends at
  26.57 and line 2 starts at 26.58, so there is no sliver at all (2 painted lines). It
  changes neither decision.
- Main process: `USERPROFILE` `C:\oc-sandbox-fork-ui-followups\home`, `userData`
  `C:\oc-sandbox-fork-ui-followups\home\AppData\Roaming\Electron`, `CLAUDE_CONFIG_DIR` null.
  The real `~/.claude/settings.json` had the same sha256 before and after the run
  (`1d8e7e488b2364a2e0d754e94c3bceee70a8e0278f99aa3437686a18329dd215`). The sandbox root was
  removed after the app closed (`meta.sandboxRemoved` true).
- With the alert shown, the message lays out on 10 lines (O18 raw line boxes), with x from
  1106.25 to at most 1241.46. The clamp paints 2 of them. The full message is the alert's
  `title`.
