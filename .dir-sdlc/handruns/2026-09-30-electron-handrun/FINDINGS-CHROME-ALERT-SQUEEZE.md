# Chrome alert squeeze: the open-error and pods-error alerts in the Pod-bar row (2026-11-10)

This file records two runs of `driver/run-fork-ui.mjs`:

- **`chrome-alert-squeeze-base`**, made before any renderer change. It found that the
  open-error and pods-error alerts squeeze the Pod tab titles to zero width.
- **`chrome-alert-squeeze`**, made after the renderer fix. The fix wraps each of the two
  alerts in a row of its own (`.alertRow { flex: 1 1 0 }`), clamps the message to two lines
  inside the Pod-bar row (`.alertRow > .listError`), and makes the full message the alert's
  `title`. This is the treatment the fork-error alert's row (`.dismissible`) already had.

**The driver was amended in place again for these runs**, so its sha256
(`de9ec99c218a1b3af7aca641e56bba08b3ebe6b1abc865a14445fde8f75356b1`) differs from the one
`driven-report-fork-ui-followups.json` records
(`0df3f088384c1baf1a10f8a47c599d1e9a6edbaeed683f97ff0f861286134128`). The amendments add three
states and five observations:

- **S5** shows the open-error alert: P5's cwd is removed and its run control clicked, with the
  Pod tabs leaving free space in the row.
- **S6** shows the fork-error alert with the Pod tabs alone overflowing the chrome.
- **S7** shows the pods-error alert: in main, the `pod:update` and then the `pod:list`
  handlers are replaced by ones that fail, with the Pod tabs leaving free space.
- **O19** and **O22** (backlog row 8) measure the Pod tab title widths while the open-error
  and the pods-error alert are shown. **O20** and **O23** (row 8) check that those alerts'
  text is painted inside the Pod-bar row. **O21** (row 7) checks that the fork-error row
  shrinks to its min-content width when the tabs overflow.

Both runs used the same driver bytes. The fix run's values come from
`driven-report-chrome-alert-squeeze.json` (generated 2026-11-10T17:34:36.886Z), and the base
run's from `driven-report-chrome-alert-squeeze-base.json` (generated 2026-11-10T17:09:27.961Z).
Both record `out/main/index.js` sha256
`025d3f6f2a0103c98791b6fcab5819c44809755557e37512554fa95198c152c8`. The renderer CSS sha256
is `9f238352b28f8fc6a4ae29c0057aa253d801d875ee1272f78e7e5f1135f0ea04` in the base run and
`66295bbb9950c8725f13806b1ec0a07eb5c6c711d44eca6aa491afa3cc2a57ba` in the fix run. The
screenshots are in `screenshots/chrome-alert-squeeze-base/` and `screenshots/chrome-alert-squeeze/`.

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
| O10 | 4 | pass | 10 raw line boxes, 3 painted (y 2.65-17.05; 18.60-33.00; 34.55-34.55); alert box y 2.65-34.55; button y 2.65-18.60, centre 10.625; painted line boxes containing the centre 1 (line 0); button right of that line's right edge = true | inline flex-direction: column on the button's parent | 0 painted line boxes contain the button centre | 0 painted line boxes contain the centre (button centre 34.550; alert box y -5.33-26.57; 2 painted of 9 raw; 1 raw line would have contained it, unscored) |
| O11 | 4 | pass | signed centre-Y difference 0.775 against painted line 0; tolerance 0.99999999 px; button height h 15.95 | inline position: relative; top: h px on the dismiss button; line 0 re-measured under it | difference under control minus difference without it equals h within tolerance, and the absolute difference under control exceeds tolerance | signed difference under control 16.725; shift 15.950; shift minus h 0.000; absolute 16.725 against tolerance 1.000 |
| O12 | 4 | pass | dark: foreground rgb(154, 162, 177), background rgb(26, 29, 35), ratio 6.573 against 4.5 | inline color on the button set to the measured background | ratio 1.00 | ratio 1.00 |
| O13 | 4 | pass | light: foreground rgb(154, 162, 177), background rgb(26, 29, 35), ratio 6.573 against 4.5; identical to O12 = true (both) | inline color on the button set to the measured background | ratio 1.00 | ratio 1.00 |
| O14 | 5 | pass | 7 Tab presses (bound 26); :focus-visible true; outline solid 1.6px rgb(106, 169, 255); contrast 7.02 against 3.0; ring clip differs from control clip = true | added style [aria-label="Dismiss fork error"]{outline:none !important} | outline-style none; the painted-ring decision on two successive captures both under the control reports not painted | outline-style none; not painted (byte-identical: true) |
| O15 | 5 | pass | after Enter on the focused dismiss button: alert count 0, button count 0 | second failed fork of P4; Shift on the focused button instead | alert count stays 1 | alert count 1 after 7 Tab presses and Shift |
| O16 | 5 | pass | activeElement pods-chrome; :focus-visible true; outline solid 1.6px rgb(106, 169, 255); contrast 7.02 against 3.0 | further failed fork of P4, dismissed by mouse click on the dismiss button in that alert's own row | chrome focused; :focus-visible false; the clicked alert is absent afterwards | before the click 1 fork-error alert and 1 dismiss button; hit-test on the button true; clicked alert absent true; chrome focused, :focus-visible false |
| O17 | 6 | pass | 5 tabs in both; title widths reference = alert shown: P1 69.95, P2 57.788, P3 50.95, P4 48.925, fork 82.4; pod-bar width 1280 then 1098.25; tolerance 0.99999999 px | inline max-width on pod-bar set to half its width (549.125px) | at least 1 title narrower than its reference by more than tolerance | all 5 titles 0 wide; 5 of 5 narrower |
| O18 | 6 | pass | 10 raw line boxes, 3 non-empty after clipping by the alert p (overflow hidden); clipped y 2.65-17.05, 18.60-33.00, 34.55-34.55; pods-chrome box y 0.00-37.20, x 0-1280; largest overhang -2.65 | inline position: relative; top: 37.2px on the alert row | at least 1 non-empty clipped line box outside the chrome box by more than tolerance | 3 of 3 outside, largest overhang 34.55 |
| O19 | 8 | pass | open-error alert (S5): 6 tabs in both; title widths reference = alert shown: P1 69.95, P2 57.788, P3 50.95, P4 48.925, fork 82.4, P5 68.213; 0 narrower than reference by more than tolerance; pod-bar width 1280 then 1203.162; alert width 76.838 | inline max-width on pod-bar set to half its width (601.581px) | at least 1 title narrower than its reference by more than tolerance | all 6 titles 0 wide; 6 of 6 narrower |
| O20 | 8 | pass | open-error alert: 17 raw line boxes, 3 non-empty after clipping by the alert p (overflow hidden); clipped y 2.65-17.05, 18.60-33.00, 34.55-34.55, x from 1211.16; pods-chrome box y 0.00-37.20, x 0-1280; largest overhang -2.65 | inline position: relative; top: 37.2px on the alert's row (div .alertRow) | at least 1 non-empty painted line box outside the chrome box by more than tolerance | 3 of 3 outside, largest overhang 34.55 |
| O21 | 7 | pass | fork-error row (S6, 7 tabs, 1 Pod added): row width 41, row min-content width 41, difference 0; 4 painted line boxes; pod-bar width 1280 then 1239 (difference -41), unscored | inline flex: 0 0 82px (twice the min-content width) on the alert row | the row's width exceeds the min-content width by more than tolerance | row width 82, exceeds 41 by 41 |
| O22 | 8 | pass | pods-error alert (S7): 5 tabs in both; title widths reference = alert shown: P1 69.95, P2 57.788, P3 50.95, P4 48.925, fork 82.4; 0 narrower than reference by more than tolerance; pod-bar width 1227.85 then 1084.175; alert width 143.675; reorder alert "refused" 52.15 wide at both | inline max-width on pod-bar set to half its width (542.088px) | at least 1 title narrower than its reference by more than tolerance | all 5 titles 0 wide; 5 of 5 narrower |
| O23 | 8 | pass | pods-error alert: 14 raw line boxes, 3 non-empty after clipping by the alert p (overflow hidden); clipped y 2.65-17.05, 18.60-33.00, 34.55-34.55, x from 1144.33; pods-chrome box y 0.00-37.20, x 0-1280; largest overhang -2.65 | inline position: relative; top: 37.2px on the alert's row (div .alertRow) | at least 1 non-empty painted line box outside the chrome box by more than tolerance | 3 of 3 outside, largest overhang 34.55 |

## Before and after the fix

| Obs | Backlog row | Alert | Base verdict | Fix-run verdict |
|---|---|---|---|---|
| O19 | 8 | open error | defect | pass |
| O20 | 8 | open error | pass | pass |
| O21 | 7 | fork error | pass | pass |
| O22 | 8 | pods error | defect | pass |
| O23 | 8 | pods error | defect | pass |

## Summary

- **Exit codes.** The base run exited **1**, equal to its `meta.exitCode` (1). The fix run
  exited **0**, equal to its `meta.exitCode` (0). In the fix run all twenty-three
  observations are `pass`, and each one's control fired as predicted. In the base run O1-O18
  were `pass`, as were O20 and O21. O19, O22 and O23 were `defect`, and every control fired.
- **devicePixelRatio** 1.0000000149011612, read in the window, in both runs. **Viewport**
  1280 x 860 in both.
- **Routes for S5, S6 and S7** (all seven states were reached in one launch, in both runs):
  - S5 open error: `pods.create` P5 "P5 cwd gone" with its cwd a directory under the sandbox
    root, which is then removed. Reload (6 Pod tabs). The free-space reference is taken with
    no alert shown: panel max-content width 1126.325 against the `pods-chrome` `clientWidth`
    1280. Then P5's run control (`data-verb="open"`) is clicked. Main raises `CWD_MISSING`
    before any spawn. 1 open-error alert is shown, starting `cwd is not accessible: `, and
    `pods.list` has length 6 before and after.
  - S6 fork error with the tabs overflowing: reload (clears the open error). Pods
    `P<n> overflow` are created one at a time, each followed by a reload, until the panel
    overflows. **S6 added 1 Pod** (7 tabs). The panel max-content width was then **1306**
    against the `pods-chrome` `clientWidth` **1280** (with 0 added it was 1126.325 against
    1280). Then P4's Fork is clicked, and 1 fork-error alert is shown.
  - S7 pods error: `pods.delete({ podId, deleteSession: false })` for P5 and the 1 Pod S6
    added, then reload (5 Pod tabs). In main, the `pod:update` handler is replaced by one
    resolving `refused`. P1's tab is focused and `Control+ArrowRight` pressed, so the reorder
    alert shows `refused`. The free-space reference is taken: panel max-content width 992.663
    against `clientWidth` 1280. Then the `pod:list` handler is replaced by one resolving M7
    (`pods.list failed (hand-run driver substitution): ` followed by S4's alert text), and
    `Control+ArrowRight` is pressed again. 1 alert equal to M7 is shown, with 5 Pod tabs.
- **Backlog rows: are all mapped observations `pass` in the fix run?**
  - Row 7, the fork-error row with the Pod tabs overflowing the chrome (O21): **yes**.
  - Row 8, the open-error and pods-error alerts (O19, O20, O22, O23): **yes**.
- **O21, the check backlog.md:35 names.** `podBarWidthReference` **1280**,
  `podBarWidthAlertShown` **1239**, difference **-41**. The row's measured min-content width
  is **41**, and its width is 41. The Pod bar gave up exactly the row's min-content width and
  no more. The values are the same in the base run (1280, 1239, -41, min-content 41). The tab
  titles do narrow, for example P1 from 66.088 to 59.987. With the tabs already overflowing,
  any width the row takes comes out of the panel, and the row takes only its minimum.
- **Tab title widths, one Pod tab (P1), reference then alert shown:**
  - O19 (open error): base run 69.95 then **0**; fix run 69.95 then **69.95**.
  - O22 (pods error): base run 69.95 then **0**; fix run 69.95 then **69.95**.
  - In the base run every tab title in both states was narrower than its reference by more
    than the tolerance (6 of 6 in O19, 5 of 5 in O22). In the fix run none was (0 of 6, 0 of 5).

## Recorded alongside, not scored

- **The alerts now take only the free space.** With a zero flex basis, the alert's row gets
  only what the Pod tabs leave. The open-error alert's width went from 565.013 (base) to
  76.838 (fix), and the Pod bar's from 714.987 to 1203.162. The pods-error alert went from
  768.638 to 143.675, and the Pod bar from 459.212 to 1084.175. At 76.838 px the open-error
  message lays out on 17 lines (O20 raw line boxes), and the clamp paints 2 of them.
  `screenshots/chrome-alert-squeeze/05-s5-open-error.png` shows "cwd is not / accessible:..."
  at the right end of the row. The full message is the alert's `title`.
- **O23's base defect.** In the base run the pods-error message was unclamped. Its 3 painted
  lines started at y -5.33, above the `pods-chrome` box (y 0.00-37.20), by 5.325 px. The base
  O20 alert, which was also unclamped, laid out on 2 lines within the box (largest overhang
  -2.65), so it passed. In the fix run both alerts are clipped by the alert `p` (overflow
  hidden). Their painted boxes are the same three as the fork-error alert's: y 2.65-17.05,
  18.60-33.00, and a 34.55-34.55 sliver at the clip's bottom edge, as noted in
  `FINDINGS-FORK-UI-FOLLOWUPS.md`.
- O17 and O18 measure the fork-error alert in S4, which the fix did not change. Their values
  are the same as in `FINDINGS-FORK-UI-FOLLOWUPS.md`.
- Main process, fix run: `USERPROFILE` `C:\oc-sandbox-chrome-alert-squeeze\home`, `userData`
  `C:\oc-sandbox-chrome-alert-squeeze\home\AppData\Roaming\Electron`, `CLAUDE_CONFIG_DIR`
  null. The real `~/.claude/settings.json` had the same sha256 before and after the run
  (`1d8e7e488b2364a2e0d754e94c3bceee70a8e0278f99aa3437686a18329dd215`). The sandbox root was
  removed after the app closed (`meta.sandboxRemoved` true).
