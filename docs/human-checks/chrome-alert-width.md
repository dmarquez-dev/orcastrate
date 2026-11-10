# Human checks: chrome alert width

Session `20261110-1857-chrome-alert-width`. These are eight checks for you to run by
hand before Gate 3. H1-H5 cover this session's change. H6-H8 are checks earlier sessions
left in the backlog. Tell the orchestrator the result of each one, in your own words.

## What changed, in one paragraph

While an open-error or pods-error alert is shown beside the Pod tabs, the tabs now keep
their own width and the alert takes all the space left over. Before, the alert and the tab
panel split the leftover space, so the alert got about half of it. The reorder alert, shown
inside the Pod bar when a reorder fails, follows the same rule: the Pod bar keeps its width
and the alert gets the rest. The fork-error alert is unchanged. When the Pod tabs alone do
not fit in the row, nothing changes: the alert shrinks to its narrowest possible width. The
rules are `src/renderer/src/pods/PodsChrome.module.css:24` and
`src/renderer/src/pods/PodBarPanel.module.css:18`.

## Before you start: this runs against your real data

`npm run dev` runs the app against your real profile and your real Claude home. There is no
sandbox. Your Pods live in `orcastrate.db` in the app's user-data folder
(`src/main/index.ts:119`), and the Claude home is `%USERPROFILE%\.claude`
(`src/main/index.ts:47`).

These are the steps in this file that create, delete or edit something in your profile,
your Claude home, or the folders this file has you make:

- **Starting the app** (Setup step 1, and H7 step 9) does what every start does: it marks
  every Pod that is not stopped with an error as closed
  (`src/main/pod-manager/pod-manager.ts:337-339`), and Electron writes its own files in the
  user-data folder.
- **Setup steps 4-6** create three empty folders on your disk and two throwaway Pods.
- **H1 step 1** deletes one of those empty folders.
- **H1 step 2, H2 step 1 and H5 step 2** each mark the throwaway Pod "HC open error" as
  stopped with an error (`src/main/pod-manager/pod-manager.ts:809`). Nothing is started:
  the error is raised before any process is spawned (`src/main/pod/pod-runner.ts:171`).
- **H2 step 3** may create more throwaway Pods, if you choose to add Pods there.
- **H4 step 3** deletes the throwaway Pod "HC reorder".
- **H4 step 5** rewrites the tab position of every Pod you have, as any reorder does. You
  can move tabs back with `Control+ArrowLeft` and `Control+ArrowRight` afterwards.
- **H5 step 1** creates more throwaway Pods.
- **H7 steps 1-5** create a throwaway Pod, open it, send it one message and stop it. That
  runs a real Claude Code turn on your account, with real token cost, and writes one
  conversation file under `%USERPROFILE%\.claude\projects`.
- **H7 step 10** moves that conversation file out of its folder. **H7 step 13** puts it back.
- **H7 step 11** asks main to fork; when the fork fails, main writes no Pod, lane or event
  row (`src/main/pod-manager/pod-manager.ts:533`).
- **Cleanup** deletes every throwaway Pod and the folders, and its step 5 reorders your
  tabs back.

If you would rather not do H4 or H7, skip them and say so: each names a screenshot that
stands in.

## Setup

1. Open a terminal and run `npm run dev` in the repository root. Before the session merges,
   that is the session worktree, `.claude-worktrees/20261110-1857-chrome-alert-width`;
   after it merges, it is the main checkout.
2. Wait for the Orcastrate window to open. If you can, make the window 1280 px wide or wider.
   The fix run measured at 1280 px.
3. Note how many Pod tabs you already have. The fix run had 6.
4. In File Explorer, create three new empty folders. Long names make the error messages
   long, which H2 needs. For example:
   `C:\hc\orcastrate-human-check-open-error-folder`, `C:\hc\orcastrate-human-check-spare`
   and `C:\hc\orcastrate-human-check-fork`.
5. In the Pod bar, click the **+** button (its name is "New Pod",
   `src/renderer/src/pods/PodBar.tsx:147`; the button is `src/renderer/src/pods/PodBar.tsx:149`).
   In the New Pod dialog, type the
   **Title** `HC open error` (`src/renderer/src/pods/NewPodDialog.tsx:169`), click
   **Browse…** (`:203`) and choose the `orcastrate-human-check-open-error-folder` folder.
   Leave **Permission mode** as it is and click **Create** (`:335`).
6. Do the same again with the Title `HC reorder` and the `orcastrate-human-check-spare`
   folder.

## H1 The open-error alert's width

1. In File Explorer, delete the folder `orcastrate-human-check-open-error-folder`. Leave the
   app running.
2. On the `HC open error` tab, click its run control, the ▶ button named "Open HC open
   error" (`src/renderer/src/pods/PodTab.tsx:328`, `:332`;
   `src/renderer/src/pods/run-control.ts:49`). The app tries to start the Pod, finds the
   folder gone, and shows the open error at the right of the Pod-bar row. It starts with
   `cwd is not accessible:` (`src/main/pod/pod-runner.ts:236`;
   `src/renderer/src/pods/PodsChrome.tsx:166`).
3. Look at how wide the red message is. It should fill all the space between the **+**
   button and the right edge of the window.
4. Compare it with the fix run's screenshot,
   `.dir-sdlc/handruns/2026-09-30-electron-handrun/screenshots/chrome-alert-width/05-s5-open-error.png`,
   and the one from before this session's fix,
   `.dir-sdlc/handruns/2026-09-30-electron-handrun/screenshots/chrome-alert-squeeze/05-s5-open-error.png`.

What was measured, at a 1280 px window with 6 Pod tabs: in this session's fix run
(`driven-report-chrome-alert-width.json`, O24) the alert was 153.675 px wide, which is
exactly the space left over (1280 - 1126.325). In the squeeze session's fix run
(`driven-report-chrome-alert-squeeze.json`, O19) it was 76.838 px. This run's O24 control,
which put the old growth back, measured 76.838 px again. Your width depends on your window
and your tabs.

**Passes when:** you judge that the message, at the width the app gives it, with the full
text only on hover, tells you enough. This is your judgment; the fix run already shows the
width follows the rule.

**Backlog:** `20261110-1618-chrome-alert-squeeze`, the row asking you to judge whether the
~77 px two-line clamp "tells the user enough" when the full message is only on hover.

## H2 The open-error alert's two-line clamp and tooltip

1. Keep the open error from H1 on screen. If it is gone, click the `HC open error` run
   control again. It is now the ▶ button named "Reconnect HC open error, stopped with an
   error" (`src/renderer/src/pods/run-control.ts:45`), and it shows the same error.
2. Look at the red message. It should be at most two lines, inside the Pod-bar row, with
   the second line ending in an ellipsis ("…"). Nothing should spill below the row.
3. If the whole message fits without an ellipsis, it is not long enough to test the clamp.
   Make the window narrower (its minimum width is 940 px, `src/main/window.ts:18`) or add
   Pods, then click the run control again.
4. Hold the mouse still over the red message. A tooltip should appear with the whole
   message, including the full folder path (`title={openError}`,
   `src/renderer/src/pods/PodsChrome.tsx:287`).

**Passes when:** the message is two lines at most, inside the Pod-bar row, ends in "…" when
it is cut short, and the hover tooltip shows the whole message.

**Backlog:** `20261110-1618-chrome-alert-squeeze`, the row asking you to "trigger a long open
error and a long pods error" and check the two-line clamp and the tooltip. This section
covers the open-error half; H3 covers the pods-error half.

## H3 The pods-error alert's two-line clamp and tooltip

No step in the app's UI makes `pods.list` fail, so this check cannot be made by hand in the
app.

Why: the pods-error alert shows only when the Pod list's phase is `'error'`
(`src/renderer/src/pods/PodsChrome.tsx:314`). The one place that happens while the app runs
is a failed `pods.list` (`src/renderer/src/state/store.ts:465`). The only other place is
when the window has no bridge to main at all, at start (`src/renderer/src/state/store.ts:214`),
which a normal start never hits. Main answers `pods.list` straight from its store
(`src/main/ipc/handlers.ts:121`, `src/main/pod-manager/pod-manager.ts:392-393`), so it
fails only when the store itself fails to read.

What stands in:

1. Open the fix run's screenshot
   `.dir-sdlc/handruns/2026-09-30-electron-handrun/screenshots/chrome-alert-width/07-s7-pods-error.png`.
   The driver made `pods.list` fail on purpose. Check the message is at most two lines,
   inside the Pod-bar row.
2. For the tooltip, the jsdom test `src/renderer/src/__tests__/chrome-alerts.e2e.test.tsx`
   checks that the pods-error alert carries the whole message as its `title` (its test "the
   pods-error alert carries the whole message as its title"). The screenshot cannot show
   the tooltip: a tooltip only appears on a live hover, and the test checks the attribute,
   not what Windows draws.

**Passes when:** the screenshot shows the pods error at most two lines inside the Pod-bar
row, and you accept the test as the evidence for the tooltip.

**Backlog:** `20261110-1618-chrome-alert-squeeze`, the row asking you to "trigger a long open
error and a long pods error". Together with H2 this closes it.

## H4 The reorder alert

This check needs the window's developer tools console. It was not run in this session.

1. Open the developer tools. Press `Control+Shift+I`. If nothing opens, press `Alt` to show
   the menu bar (it is hidden, `autoHideMenuBar: true`, `src/main/window.ts:21`) and choose
   View, then Toggle Developer Tools. The app sets no menu of its own (no `Menu` anywhere in
   `src/`), so Electron's default menu should apply; this is a belief, not checked here.
   Click the **Console** tab.
2. Type `(await window.orcastrate.pods.list()).value.map((p) => [p.title, p.id])` and press
   Enter. This is `window.orcastrate.pods.list()` (`src/preload/api.ts:92`; exposed as
   `orcastrate` at `src/preload/index.ts:20`), whose answer is `{ ok: true, value: [...] }`
   (`src/shared/contracts/ipc.ts:67`). Find the row for `HC reorder` and copy its id.
3. Type `await window.orcastrate.pods.delete({ podId: '<the id>', deleteSession: false })`,
   with the id pasted in, and press Enter. This is
   `window.orcastrate.pods.delete({ podId, deleteSession: false })`
   (`src/preload/api.ts:98`). Main deletes the Pod, but the window does not know yet: the
   `HC reorder` tab stays on screen.
4. Click any Pod tab that is not the last one on the right, so it has focus.
5. Press `Control+ArrowRight` (`src/renderer/src/pods/PodTab.tsx:218-220`). The app
   saves the new order for every tab (`src/renderer/src/state/store.ts:518-534`), including
   `HC reorder`, which main no longer has.
   That one fails with main's own message, `updatePod: no pod with id <id>`
   (`src/main/store/sqlite-event-store.ts:233`). The app then reloads the Pod list
   (`src/renderer/src/state/store.ts:528`), so the `HC reorder` tab disappears, and the red
   reorder alert appears inside the Pod bar.
6. Check the Pod tab titles: none should be cut shorter than before the alert appeared.
7. Check the alert fills the space between the **+** button and the right edge, at most two
   lines, inside the row.
8. Hold the mouse over the alert: the tooltip shows the whole message
   (`title={reorderError}`, `src/renderer/src/pods/PodBarPanel.tsx:102`).

If you cannot open the console, use the fix run's screenshot instead:
`.dir-sdlc/handruns/2026-09-30-electron-handrun/screenshots/chrome-alert-width/08-s8-reorder-error.png`.

What the fix run measured (`driven-report-chrome-alert-width.json`, 6 Pod tabs, 1280 px):
O25 `pass`, no tab title narrower than its width with no alert (0 of 6); O26 `pass`, the
message painted inside the Pod-bar row; O27 `pass`, the alert 153.675 px wide, exactly the
space the Pod bar leaves (1280 - 1126.325).

**Passes when:** what you see matches the fix run's O25-O27 verdicts: the tab titles keep
their width, the message stays inside the Pod-bar row in at most two lines, and the alert
takes all the space the Pod bar leaves.

**Backlog:** `this session`. Nothing in the backlog asks for this check.

## H5 The open-error and pods-error alerts with the Pod tabs overflowing the row

1. Add throwaway Pods until the tabs no longer fit in the row: click **+**, give each a
   Title such as `HC overflow 1`, `HC overflow 2` and so on, choose the
   `orcastrate-human-check-spare` folder, and click **Create**. You know the tabs overflow
   when the tab list can be scrolled sideways or the last tab is cut off (the tab list
   scrolls, `overflow-x: auto`, `src/renderer/src/pods/PodBar.module.css:27`). Instead of
   adding Pods you can make the window narrower; its minimum width is 940 px
   (`src/main/window.ts:18`).
2. Trigger the open error as in H1: click the `HC open error` run control (now named
   "Reconnect HC open error, stopped with an error").
3. Look at the red alert. With no space left over, it should be a narrow column at the right
   end of the row, at its narrowest possible width: about 25 px in the fix run, which
   painted about one character per line. Its text should still be inside the row.
4. Hold the mouse over it: the tooltip still shows the whole message.
5. For the pods error with the tabs overflowing, there is no route from the UI (see H3).
   Open the fix run's screenshots instead:
   `.dir-sdlc/handruns/2026-09-30-electron-handrun/screenshots/chrome-alert-width/09-s9-overflow-open-error.png`
   for the open error, and
   `.dir-sdlc/handruns/2026-09-30-electron-handrun/screenshots/chrome-alert-width/10-s10-overflow-pods-error.png`
   for the pods error.

What the fix run measured (`driven-report-chrome-alert-width.json`): O28 `pass`, with 7 Pod
tabs whose content was 1306 px wide in a 1280 px row, the open-error row was 25.475 px wide
and its min-content width was 25.475 px, a difference of 0; O29 `pass`, its text painted
inside the row. O31 `pass`, the same for the pods error at zoom 1.4: 25.473 px against a
min-content width of 25.473 px; O32 `pass`, painted inside the row.

**Passes when:** the alert is no wider than its narrowest possible width (the fix run's O28
measured the row's width equal to its min-content width), its text stays inside the row,
and the tooltip shows the whole message.

**Backlog:** `this session`. Nothing in the backlog asks for this check.

## H6 The ⑂ fork mark

1. Look at any Pod tab. After the ▶ or ❚❚ run control there is a small button named "Fork
   <title>" (`src/renderer/src/pods/fork-control.ts:38`). Its mark is the ⑂ character
   (`src/renderer/src/pods/PodTab.tsx:31`, drawn at `:365-367`).
2. Decide whether the ⑂ reads to you as a fork mark.
3. If you are not running the app, open
   `.dir-sdlc/handruns/2026-09-30-electron-handrun/screenshots/fork-ui-recheck/O1-fork.png`
   instead.

**Passes when:** the ⑂ on a Pod tab reads to you as a fork mark.

**Backlog:** `20261109-1642-fork-ui-human-checks`, the row asking you to check that the ⑂ on
a Pod tab "reads as a fork mark".

## H7 The fork-error tooltip

A fork fails when Claude Code cannot find the Pod's conversation file. This is what the
hand-run driver's S4 did: its Pod named a conversation with no file, and the fork failed
with `forkSession failed for pod <id> (session <id>): Session <id> not found in project
directory for <folder>` (`driven-report-chrome-alert-width.json`, S4). By hand, you make a
real conversation and then move its file away. Each step is checked against the code below.
This route was not run in this session.

1. Click **+**. Type the Title `HC fork`, click **Browse…** and choose the
   `orcastrate-human-check-fork` folder. Under **Permission mode** choose **Plan only**
   ("Claude plans without executing tools", `src/renderer/src/contracts/renderer-view.ts:189-190`).
   Click **Create**.
2. On the `HC fork` tab, click the ▶ run control named "Open HC fork". This starts a real
   Claude Code process.
3. In the composer ("Message this Pod. Enter sends, Shift+Enter adds a line.",
   `src/renderer/src/composer/Composer.tsx:147`) type `Reply with the single word ok.` and
   press Enter.
4. Wait for the reply. Claude Code reports its conversation id, and main saves it on the Pod
   (`src/main/pod-manager/pod-manager.ts:1316`).
5. Click the ❚❚ run control named "Stop HC fork" (`src/renderer/src/pods/PodTab.tsx:328`).
6. The window learns the conversation id only from a fresh copy of the Pod; the status
   push it gets while the Pod runs carries the status alone
   (`src/renderer/src/state/store.ts:378-388`). Until then the Fork button's tooltip says
   "There is no conversation to fork yet." (`src/renderer/src/pods/fork-control.ts:25`).
   Restarting the app is the simplest way to get a fresh copy.
7. Close the Orcastrate window. The app quits (`src/main/index.ts:256-258`).
8. If the terminal is still running `npm run dev`, stop it with `Control+C`.
9. Run `npm run dev` again. The new window reads the Pod list on start
   (`src/renderer/src/state/store.ts:295`), so the `HC fork` Pod now has its conversation id.
   A stopped Pod with a conversation can be forked (`src/shared/fork-eligibility.ts:37-39`).
10. In File Explorer, open `%USERPROFILE%\.claude\projects`. Find the folder whose name ends
    in `orcastrate-human-check-fork`. It holds one `.jsonl` file, the conversation from step
    3, because nothing else has ever run in that new folder. (The folder naming is Claude
    Code's, not this app's, and was not checked in this session.) Move that file to your Desktop.
    Do not delete it.
11. On the `HC fork` tab, click the ⑂ button named "Fork HC fork". Main asks Claude Code to
    fork the conversation in that folder (`src/main/pod-manager/pod-manager.ts:551`), which
    fails, and main reports `forkSession failed for pod …`
    (`src/main/pod-manager/pod-manager.ts:555`). The red fork-error alert appears in the
    Pod-bar row, with a × button to dismiss it. No Pod is created.
12. Hold the mouse still over the red fork-error text. A tooltip should show main's whole
    message (`title={forkError}`, `src/renderer/src/pods/PodsChrome.tsx:300`).
13. Move the `.jsonl` file from your Desktop back into the folder you took it from.

**Passes when:** the hover tooltip shows main's whole message, starting `forkSession failed
for pod` and ending with the folder path.

**Backlog:** `20261109-2239-fork-ui-followups`, the row asking you to make a fork fail and
"hover the clamped fork-error text".

## H8 The two-line clamped fork error

1. Open
   `.dir-sdlc/handruns/2026-09-30-electron-handrun/screenshots/fork-ui-followups/03-s4-fork-error.png`.
2. If you ran H7, look at the live fork-error alert from H7 step 11 as well.
3. Decide whether the two-line message ending in "…" is acceptable as the only text you see
   without hovering.

**Passes when:** you find the two-line clamped fork error ending in "…" acceptable as the
only visible text.

**Backlog:** `20261109-2239-fork-ui-followups`, the row asking whether the two-line clamped
fork error ending in "…" "is acceptable as the only visible text".

## Cleanup

1. For each throwaway Pod still listed (`HC open error`, every `HC overflow` Pod, and
   `HC fork`), click its × button named "Delete <title>"
   (`src/renderer/src/pods/PodTab.tsx:385`). In the Delete Pod dialog, click **Delete**
   (`src/renderer/src/pods/DeletePodDialog.tsx:37`). A running Pod has no × button; stop it
   first with its ❚❚ button.
2. For `HC fork` only, the dialog also offers a checkbox, "Also move this Pod's Claude Code
   conversation file to the recycle bin." (`src/renderer/src/pods/DeletePodDialog.tsx:35`).
   Tick it to remove the conversation file from H7 as well.
3. `HC reorder` was already deleted in H4. If you skipped H4, delete it the same way.
4. In File Explorer, delete the folders from Setup step 4.
5. If H4 changed the order of your own tabs, put them back with `Control+ArrowLeft` and
   `Control+ArrowRight` on a focused tab.
