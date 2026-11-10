# Chrome alert width: how much of the Pod-bar row the alerts get (2026-11-10)

This file records two runs of `driver/run-fork-ui.mjs`:

- **`chrome-alert-width-base`**, made before any renderer change. It found that the
  open-error and pods-error alerts took less than the space the Pod tabs leave free (O24,
  O30), and that the reorder alert took width from the Pod tab titles (O25) and more than
  the free space in the panel (O27).
- **`chrome-alert-width`**, made after the renderer fix. The fix applies one width policy:
  while an alert row is shown beside the Pod tabs, the tabs keep their content width and
  the alert row takes all the space left over. In `PodsChrome.module.css`,
  `.chrome:has(> .alertRow) > :first-child { flex-grow: 0 }` stops the Pod bar panel growing
  while an open-error or pods-error row is shown; the fork-error row (`.dismissible`) is not
  named, so it is unchanged. In `PodBarPanel.tsx` the reorder alert is wrapped in a row of
  its own (`.reorderRow { flex: 1 1 0 }`), clamped to two lines
  (`.reorderRow > .reorderError`), and given the full message as its `title`; in
  `PodBarPanel.module.css`, `.panel:has(> .reorderRow) > :first-child { flex-grow: 0 }`
  stops the Pod bar growing while it is shown.

**The driver was amended in place again for these runs**, so its sha256
(`d970b2a03cce7f88cc3d6e7d11082732b12c29d5ac8b089d38c42615fc7ac174`) differs from the one
`driven-report-chrome-alert-squeeze.json` records
(`de9ec99c218a1b3af7aca641e56bba08b3ebe6b1abc865a14445fde8f75356b1`). The amendments add three
states and nine observations:

- **S8** shows the reorder alert with the Pod tabs leaving free space: in main, the
  `pod:update` handler is replaced by one that fails with the store's own not-found message.
- **S9** shows the open-error alert with the Pod tabs alone overflowing the chrome.
- **S10** shows the pods-error alert with the Pod tabs alone overflowing the chrome, reached
  by raising the window's zoom.
- **O24**, **O27** and **O30** (backlog row 9) score the width policy for the open-error,
  reorder and pods-error alerts. **O25** and **O26** (row 11) measure the Pod tab titles and
  the painted text while the reorder alert is shown. **O28**, **O29**, **O31** and **O32**
  (row 10) check that the open-error and pods-error rows keep only their min-content width,
  and stay painted inside the row, when the tabs overflow.

Backlog rows, named by the session that wrote them:

- Row 9: `20261110-1618-chrome-alert-squeeze`, "Decide how much width the open-error and
  pods-error alerts get".
- Row 10: `20261110-1618-chrome-alert-squeeze`, "Measure the open-error and pods-error alerts
  when the Pod tabs alone overflow `.chrome`".
- Row 11: `20261110-1618-chrome-alert-squeeze`, "Measure `PodBarPanel`'s reorder alert".

Both runs used the same driver bytes. The fix run's values come from
`driven-report-chrome-alert-width.json` (generated 2026-11-10T21:24:05.592Z), and the base
run's from `driven-report-chrome-alert-width-base.json` (generated 2026-11-10T20:11:31.472Z).
Both record `out/main/index.js` sha256
`025d3f6f2a0103c98791b6fcab5819c44809755557e37512554fa95198c152c8`. The renderer CSS sha256
is `66295bbb9950c8725f13806b1ec0a07eb5c6c711d44eca6aa491afa3cc2a57ba` in the base run and
`641cede7711626a203dae26605a416b28080f9e20d42176808e1a7b499a8d1ad` in the fix run. The
screenshots are in `screenshots/chrome-alert-width-base/` and `screenshots/chrome-alert-width/`.

## Verdicts (fix run)

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
| O10 | 4 | pass | 10 raw line boxes, 3 painted (y 2.65-17.05; 18.60-33.00; 34.55-34.55); alert box y 2.65-34.55; button y 2.65-18.60, centre 10.625; painted line boxes containing the centre 1; button right of that line's right edge = true | inline flex-direction: column on the button's parent | 0 painted line boxes contain the button centre | 0 painted line boxes contain the centre (button y 26.58-42.53, centre 34.550; alert box y -5.33-26.57; painted line boxes 2, raw 9; raw line boxes containing the centre 1, unscored) |
| O11 | 4 | pass | signed centre-Y difference 0.7749991416931152 against painted line 0; tolerance 0.999999985098839 px; button height 15.949999809265137 | inline position: relative; top: h px on the dismiss button; line 0 re-measured under it | difference under control minus difference without it equals h within tolerance, and the absolute difference under control exceeds tolerance | signed difference under control 16.725; shift 15.950; shift minus h 0.000 against tolerance 1.000; absolute 16.725 |
| O12 | 4 | pass | dark: foreground rgb(154, 162, 177), background rgb(26, 29, 35), ratio 6.573 against 4.5 | inline color on the button set to the measured background | ratio 1.00 | ratio 1.00 |
| O13 | 4 | pass | light: foreground rgb(154, 162, 177), background rgb(26, 29, 35), ratio 6.573 against 4.5; identical to O12 = true (both) | inline color on the button set to the measured background | ratio 1.00 | ratio 1.00 |
| O14 | 5 | pass | 7 Tab presses (bound 26); :focus-visible true; outline solid 1.6px rgb(106, 169, 255); contrast 7.02 against 3; painted clip differs from control clip = true | added style [aria-label="Dismiss fork error"]{outline:none !important} | outline-style none; the painted-ring decision on two successive captures both under the control reports not painted | outline-style none; not painted (byte-identical: true) |
| O15 | 5 | pass | after Enter on the focused dismiss button: alert count 0, button count 0 | second failed fork of P4; Shift on the focused button instead | alert count stays 1 | alert count 1 after 7 Tab presses and Shift |
| O16 | 5 | pass | activeElement pods-chrome; :focus-visible true; outline solid 1.6px rgb(106, 169, 255); contrast 7.02 against 3 | further failed fork of P4, dismissed by mouse click on the dismiss button in that alert's own row | chrome focused; :focus-visible false; the clicked alert is absent afterwards | before the click 1 fork-error alert and 1 dismiss button; hit-test on the button true; clicked alert absent true; chrome focused, :focus-visible false |
| O17 | 6 | pass | 5 tabs in both; title widths reference = alert shown: P1 69.95, P2 57.788, P3 50.95, P4 48.925, fork 82.4; pod-bar width 1280 then 1098.25; tolerance 0.999999985098839 px | inline max-width on pod-bar set to half its width (549.125px) | at least 1 title narrower than its reference by more than tolerance | all 5 titles 0 wide; 5 of 5 narrower |
| O18 | 6 | pass | 10 raw line boxes, 3 non-empty after clipping by the alert p (overflow hidden); clipped y 2.65-17.05, 18.60-33.00, 34.55-34.55; pods-chrome box y 0.00-37.20, x 0.00-1280.00; largest overhang -2.6500000953674316 | inline position: relative; top: 37.20000076293945px on the alert row | at least 1 non-empty clipped line box outside the chrome box by more than tolerance | 3 of 3 outside, largest overhang 34.55000114440918 |
| O19 | 8 | pass | open-error alert (S5): 6 tabs in both; title widths reference = alert shown: P1 69.95, P2 57.788, P3 50.95, P4 48.925, fork 82.4, P5 68.213; 0 narrower than reference by more than tolerance; pod-bar width 1280 then 1126.325; alert width 153.675 | inline max-width on pod-bar set to half its width (563.163px) | at least 1 title narrower than its reference by more than tolerance | all 6 titles 0 wide; 6 of 6 narrower |
| O20 | 8 | pass | open-error alert: 7 raw line boxes, 3 non-empty after clipping by the alert p (overflow hidden); painted y 2.65-17.05, 18.60-33.00, 34.55-34.55, x from 1134.33; pods-chrome box y 0.00-37.20, x 0.00-1280.00; largest overhang -2.6500000953674316 | inline position: relative; top: 37.2px on the alert's row (div .alertRow) | at least 1 non-empty painted line box outside the chrome box by more than tolerance | 3 of 3 outside, largest overhang 34.55 |
| O21 | 7 | pass | fork-error row (S6, 7 tabs, 1 Pod added): row width 41, row min-content width 41, difference 0; 4 painted line boxes; pod-bar width 1280 then 1239 (difference -41), unscored | inline flex: 0 0 82px (twice the min-content width) on the alert row | the row's width exceeds the min-content width by more than tolerance | row width 82, exceeds 41 by 41 |
| O22 | 8 | pass | pods-error alert (S7): 5 tabs in both; title widths reference = alert shown: P1 69.95, P2 57.788, P3 50.95, P4 48.925, fork 82.4; 0 narrower than reference by more than tolerance; pod-bar width 940.513 then 940.513; alert width 287.337; reorder alert "refused" 52.15 wide at both | inline max-width on pod-bar set to half its width (470.256px) | at least 1 title narrower than its reference by more than tolerance | all 5 titles 0 wide; 5 of 5 narrower |
| O23 | 8 | pass | pods-error alert: 6 raw line boxes, 3 non-empty after clipping by the alert p (overflow hidden); painted y 2.65-17.05, 18.60-33.00, 34.55-34.55, x from 1000.66; pods-chrome box y 0.00-37.20, x 0.00-1280.00; largest overhang -2.6500000953674316 | inline position: relative; top: 37.2px on the alert's row (div .alertRow) | at least 1 non-empty painted line box outside the chrome box by more than tolerance | 3 of 3 outside, largest overhang 34.55 |
| O24 | 9 | pass | open-error alert (S5): w 153.675 (the alert's row), c 1280 (pods-chrome clientWidth), b 1126.325 (S5's reference panel max-content width), c - b 153.675, abs(w - (c - b)) 0 against tolerance 0.999999985098839; panel width 1126.325, computed flex-grow 0 | inline flex-grow: 1 on the panel | abs(w - (c - b)) exceeds tolerance | computed flex-grow 1: w 76.838, c - b 153.675, abs(w - (c - b)) 76.837 against tolerance 1 |
| O25 | 11 | pass | reorder alert (S8): 6 tabs in both; title widths reference = alert shown: P1 69.95, P2 57.788, P3 50.95, P4 48.925, fork 82.4, P5 68.213; 0 narrower than reference by more than tolerance; pod-bar width 1280 then 1126.325; reorder alert "updatePod: no pod with id 192a59c6-0cec-4232-a139-f44cbd8c6d00" (M8, 62 characters) 153.675 wide; panel max-content width 1126.325, pods-chrome clientWidth 1280 | inline max-width on pod-bar set to half its width (563.163px) | at least 1 title narrower than its reference by more than tolerance | all 6 titles 0 wide; 6 of 6 narrower |
| O26 | 11 | pass | reorder alert: 3 raw line boxes, 3 non-empty after clipping by the alert p (overflow hidden); painted y 2.65-17.05, 18.60-33.00, 34.55-34.55, x from 1134.33; pods-chrome box y 0.00-37.20, x 0.00-1280.00; largest overhang -2.6500000953674316 | inline position: relative; top: 37.2px on the alert's panel child (div .reorderRow) | at least 1 non-empty painted line box outside the chrome box by more than tolerance | 3 of 3 outside, largest overhang 34.55 |
| O27 | 9 | pass | reorder alert (S8): w 153.675 (the alert's panel child, div .reorderRow), c 1280 (the panel's clientWidth), b 1126.325 (S8's reference pod bar max-content width), c - b 153.675, abs(w - (c - b)) 0 against tolerance 0.999999985098839; pod bar width 1126.325, computed flex-grow 0 | inline flex-grow: 1 on pod-bar | abs(w - (c - b)) exceeds tolerance | computed flex-grow 1: w 76.838, c - b 153.675, abs(w - (c - b)) 76.837 against tolerance 1 |
| O28 | 10 | pass | open-error row (S9, 7 tabs): row width 25.475, row min-content width 25.475, difference 0; 4 painted line boxes; pod-bar width 1280 then 1254.525 (difference -25.475), unscored; panel max-content width 1306 against pods-chrome clientWidth 1280 | inline flex: 0 0 50.95px (twice the min-content width) on the row | the row's width exceeds the min-content width by more than tolerance | row width 50.95, exceeds 25.475 by 25.475 |
| O29 | 10 | pass | open-error alert (S9): 118 raw line boxes, 4 non-empty after clipping by the alert p (overflow hidden); painted y 2.65-17.05, 18.60-33.00, 18.60-33.00, 34.55-34.55, x from 1262.53; pods-chrome box y 0.00-37.20, x 0.00-1280.00; largest overhang -2.6500000953674316 | inline position: relative; top: 37.2px on the alert's row (div .alertRow) | at least 1 non-empty painted line box outside the chrome box by more than tolerance | 4 of 4 outside, largest overhang 34.55 |
| O30 | 9 | pass | pods-error alert (S7): w 287.337 (the alert's row), c 1280 (pods-chrome clientWidth), b 992.663 (S7's reference panel max-content width), c - b 287.337, abs(w - (c - b)) 0 against tolerance 0.999999985098839; panel width 992.663, computed flex-grow 0 | inline flex-grow: 1 on the panel | abs(w - (c - b)) exceeds tolerance | computed flex-grow 1: w 143.675, c - b 287.337, abs(w - (c - b)) 143.662 against tolerance 1 |
| O31 | 10 | pass | pods-error row (S10, zoom 1.4, tolerance 0.7142857036420279, 5 tabs): row width 25.473, row min-content width 25.473, difference 0; 3 painted line boxes; pod bar max-content width 937.759 against pods-chrome clientWidth 914; pod-bar width 866.339, unscored | inline flex: 0 0 50.9464px (twice the min-content width) on the row | the row's width exceeds the min-content width by more than tolerance (re-read at the zoom) | row width 50.946, exceeds 25.473 by 25.473 (tolerance 0.714) |
| O32 | 10 | pass | pods-error alert (S10): 224 raw line boxes, 3 non-empty after clipping by the alert p (overflow hidden); painted y 2.77-17.62, 18.71-33.57, 18.71-33.57, x from 896.81; pods-chrome box y 0.00-37.43, x 0.00-914.29; largest overhang -2.767857313156128 | inline position: relative; top: 37.4286px on the alert's row (div .alertRow) | at least 1 non-empty painted line box outside the chrome box by more than tolerance (re-read at the zoom) | 4 of 4 outside, largest overhang 34.661 |

## Before and after the fix

| Obs | Backlog row | Alert | Base verdict | Fix-run verdict |
|---|---|---|---|---|
| O24 | 9 | open error | defect | pass |
| O25 | 11 | reorder | defect | pass |
| O26 | 11 | reorder | pass | pass |
| O27 | 9 | reorder | defect | pass |
| O28 | 10 | open error | pass | pass |
| O29 | 10 | open error | pass | pass |
| O30 | 9 | pods error | defect | pass |
| O31 | 10 | pods error | pass | pass |
| O32 | 10 | pods error | pass | pass |

## Summary

- **Exit codes.** The base run exited **1**, equal to its `meta.exitCode` (1). The fix run
  exited **0**, equal to its `meta.exitCode` (0). In the fix run all thirty-two
  observations are `pass`, and each one's control fired as predicted. In the base run O1-O23
  were `pass`, as were O26, O28, O29, O31 and O32. O24, O25, O27 and O30 were `defect`, and
  every control fired.
- **devicePixelRatio** 1.0000000149011612, read in the window, in both runs. **Viewport**
  1280 x 860 in both.
- **Routes for S8, S9 and S10** (all ten states were reached in one launch, in both runs):
  - S8 reorder error: reload after O24 (clears the open error; 6 Pod tabs). The free-space
    reference is taken with no alert shown and the mouse parked: panel max-content width
    1126.325 against the `pods-chrome` `clientWidth` 1280, and the pod bar's max-content
    width 1126.325 against the panel's `clientWidth` 1280. In main, the `pod:update` handler
    is replaced by one resolving `NOT_FOUND` with **M8**, the prefix
    `updatePod: no pod with id ` read from `src/main/store/sqlite-event-store.ts:233`
    followed by P5's id. In the fix run M8 is
    `updatePod: no pod with id 192a59c6-0cec-4232-a139-f44cbd8c6d00`, **62 characters**
    (also 62 in the base run). P1's tab is focused and `Control+ArrowRight` pressed. 1
    reorder alert equal to M8 is shown, 0 alerts outside the panel, 6 Pod tabs, and
    `pods.list` has length 6 before and after.
  - S9 open error with the tabs overflowing: in S6's state (1 Pod added, 7 tabs), reload
    (clears the fork error). The overflow reference is taken with no alert shown: panel
    max-content width 1306 against `clientWidth` 1280. Then P5's run control
    (`data-verb="reconnect"`) is clicked. Main raises `CWD_MISSING` before any spawn. 1
    open-error alert is shown, and `pods.list` has length 7 before and after.
  - S10 pods error with the tabs overflowing: in S7's final state (the pods-error alert still
    shown, no reload), the window's zoom is raised by `webContents.setZoomFactor` in steps of
    0.1 from 1.0. The tabs alone overflowed at **zoom factor 1.4** (`tol`
    0.7142857036420279): pod bar max-content width 937.759 against the `pods-chrome`
    `clientWidth` 914. 1 alert equal to M7 is shown, with 5 Pod tabs. The zoom reached was
    1.4 in the base run too.
- **Backlog rows: are all mapped observations `pass` in the fix run?**
  - Row 9, how much width the open-error, pods-error and reorder alerts get (O24, O27, O30):
    **yes**.
  - Row 10, the open-error and pods-error alerts with the Pod tabs alone overflowing (O28,
    O29, O31, O32): **yes**.
  - Row 11, the reorder alert (O25, O26): **yes**.
- **The width policy, as measured** (`w` the alert's row, `c` the containing row's
  `clientWidth`, `b` the reference max-content width of what the alert shares that row with):
  - O24 (open error): base run `w` 76.838, `c` 1280, `b` 1126.325, `c - b` 153.675; fix run
    `w` **153.675**, `c` 1280, `b` 1126.325, `c - b` 153.675.
  - O27 (reorder): base run `w` 308.337, `c` 1280, `b` 1126.325, `c - b` 153.675; fix run
    `w` **153.675**, `c` 1280, `b` 1126.325, `c - b` 153.675.
  - O30 (pods error): base run `w` 143.675, `c` 1280, `b` 992.663, `c - b` 287.337; fix run
    `w` **287.337**, `c` 1280, `b` 992.663, `c - b` 287.337.
  - In the fix run each alert row is exactly the free space (`abs(w - (c - b))` 0 in all
    three). In the base run the open-error and pods-error rows got less than the free space
    (the panel still grew into it), and the reorder alert more (it took width from the Pod
    bar).
- **The overflow case (O28, O31, fix run).**
  - O28, open error at zoom 1.0: the row's width **25.475**, its min-content width
    **25.475**. `podBarWidthReference` **1280**, `podBarWidthAlertShown` **1254.525**,
    difference **-25.475**. The Pod bar gave up exactly the row's min-content width.
  - O31, pods error at zoom 1.4: the row's width **25.473**, its min-content width
    **25.473**. No `podBarWidthReference` is recorded (S10 has no alert-free reference), so
    no difference is either; `podBarWidthAlertShown` is 866.339.
  - Both match the base run (O28 25.475 and 25.475, difference -25.475; O31 25.473 and
    25.473): the policy changes nothing when the tabs already overflow.
- **Tab title widths with the reorder alert shown, one Pod tab (P1), reference then alert
  shown (O25):** base run 69.95 then **43.138**; fix run 69.95 then **69.95**. In the base
  run 6 of 6 tab titles were narrower than their reference by more than the tolerance; in
  the fix run 0 of 6 were.

## Recorded alongside, not scored

- **The reorder alert is now clamped.** In the base run the reorder alert was a bare
  paragraph in the panel row, 308.337 wide, laid out on 2 line boxes with no clipping
  ancestor. In the fix run it is 153.675 wide, laid out on 3 raw line boxes, and clipped by
  the alert `p` (overflow hidden) to the same painted boxes as the other alerts: y
  2.65-17.05, 18.60-33.00, and a 34.55-34.55 sliver at the clip's bottom edge.
- **O22 moved with the reorder fix.** S7 shows the reorder alert ("refused") beside the
  pods-error alert. With the reorder policy, the Pod bar keeps its content width in the
  panel, so `podBarWidthReference` is 940.513 in the fix run (1227.85 in the squeeze
  session's fix run, per `FINDINGS-CHROME-ALERT-SQUEEZE.md`), and the pods-error alert's
  width is 287.337.
- **O24, O27 and O30's controls.** In the base run the element each control styles already
  computed `flex-grow: 1`, so the inline `flex-grow: 1` changed nothing there. In the fix
  run it computes `flex-grow: 0`, and the control moves `w` to 76.838 (O24, O27) and
  143.675 (O30), the base run's own values for O24 and O30.
- Main process, fix run: `USERPROFILE` `C:\oc-sandbox-chrome-alert-width\home`, `userData`
  `C:\oc-sandbox-chrome-alert-width\home\AppData\Roaming\Electron`, `CLAUDE_CONFIG_DIR`
  null. The real `~/.claude/settings.json` had the same sha256 before and after the run
  (`1d8e7e488b2364a2e0d754e94c3bceee70a8e0278f99aa3437686a18329dd215`). The sandbox root was
  removed after the app closed (`meta.sandboxRemoved` true).
