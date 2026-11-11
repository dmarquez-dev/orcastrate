# Human checks: message alerting

Session `20261111-0156-message-alerting`. These are eight checks for you to run by hand
before Gate 3. N1-N7 cover this session's change. N8 is optional. Each is something the
jsdom tests cannot show, because jsdom does no layout, paints nothing and runs no screen
reader. Tell the orchestrator the result of each one, in your own words.

## What changed, in one paragraph

Outcomes now appear in one notification region at the window's bottom-right corner
(`src/renderer/src/notifications/Notifications.module.css:9-12`), mounted once around the
whole app (`src/renderer/src/App.tsx:48`). Creating, deleting, forking, starting,
reconnecting, stopping and reordering Pods each report success or info there, and every
failure of those actions that used to sit in the Pod tab header is now an error there.
A success or info notification leaves on its own after 6000 ms
(`src/renderer/src/notifications/NotificationProvider.tsx:42`), and waits while the pointer
is over the region or focus is in it (`:219-221`). An error stays until you dismiss it. Each
notification has a × button named "Dismiss notification"
(`src/renderer/src/notifications/NotificationItem.tsx:57`). The region sits above the
dialog scrims: its `z-index` is 3 (`src/renderer/src/notifications/Notifications.module.css:10`),
the New Pod and Delete scrims are 1 (`src/renderer/src/pods/NewPodDialog.module.css:3`,
`src/renderer/src/pods/DeletePodDialog.module.css:11`) and Helm's close confirmation is 2
(`src/renderer/src/helm/Helm.module.css:406`).

## Before you start: this runs against your real data

`npm run dev` runs the app against your real profile and your real Claude home. There is no
sandbox. Your Pods live in `orcastrate.db` in the app's user-data folder
(`src/main/index.ts:119`), and the Claude home is `%USERPROFILE%\.claude`
(`src/main/index.ts:47`).

No step in this file asks you to type anything into the developer tools console, and no
step reorders your tabs.

These are the steps in this file that create, delete or edit something in your profile,
your Claude home, or the folders this file has you make:

- **Starting the app** (Setup step 1) does what every start does: it marks every Pod that is
  not stopped with an error as closed (`src/main/pod-manager/pod-manager.ts:337-339`), and
  Electron writes its own files in the user-data folder.
- **Setup step 3** creates two empty folders on your disk.
- **N1 steps 1 and 4** each create one throwaway Pod, `HC alert` and `HC spare`: one new row
  each in `orcastrate.db`.
- **N2 step 1** deletes one of those empty folders.
- **N2 steps 2 and 5, N4 step 3, N6 step 2 and N7 step 1**, and N3 step 1 and N5 step 1
  if they have you click it again, each try to start `HC alert`, find its folder gone, and mark it stopped with an error
  (`src/main/pod-manager/pod-manager.ts:809`). That write also sets `HC alert`'s last-used
  stamp (`last_active_at`) to now, because it passes none
  (`src/main/pod-manager/pod-manager.ts:1539`; `src/main/store/sqlite-event-store.ts:224-228`).
  It touches no other Pod. Nothing is started: the folder is checked before any process is
  spawned (`src/main/pod/pod-runner.ts:172`, `:236`).
- **N5 step 6** types into Helm's Model field and then discards the edit. Helm writes a
  settings file only when you press Save (`src/main/helm/helm-service.ts:167`). No step in
  this file presses Save.
- **N6 step 4** deletes the throwaway Pod `HC spare`, through the Delete dialog, with its
  checkbox left unticked, so nothing in your Claude home is touched.
- **N8 (optional), step 1** makes the deleted folder again. **Step 2** starts a real Claude
  Code process for `HC alert`, and main saves its status as `idle`
  (`src/main/pod-manager/pod-manager.ts:813`), which sets that Pod's `last_active_at` to now
  as well. No message is sent, so no turn runs. Whether Claude Code writes files of its own
  under `%USERPROFILE%\.claude` when it starts with no message was not checked. **Step 4**
  stops it.
- **Cleanup** deletes `HC alert` (and `HC spare`, if N6 was skipped) and the two folders.

If you would rather not run N8, skip it and say so. N6 uses a success notification instead,
which carries the same role as an info one.

## Setup

1. Open a terminal and run `npm run dev` in the repository root. Before the session merges,
   that is the session worktree, `.claude-worktrees/20261111-0156-message-alerting`; after
   it merges, it is the main checkout.
2. Wait for the Orcastrate window to open. It opens at 1280 by 800 px
   (`src/main/window.ts:16-17`); leave it at that size for now.
3. In File Explorer, create two new empty folders. The first name is long on purpose: it
   makes the error message in N2-N4 long. For example:
   `C:\hc\orcastrate-human-check-notification-region-missing-folder-with-a-deliberately-long-name`
   and `C:\hc\orcastrate-human-check-spare`.

## N1 A success notification leaves on its own

1. In the Pod bar, click the **+** button (its name is "New Pod",
   `src/renderer/src/pods/PodBar.tsx:147`). In the New Pod dialog, type the **Title**
   `HC alert` (`src/renderer/src/pods/NewPodDialog.tsx:169`), click **Browse…** (`:203`)
   and choose the long-named folder from Setup step 3. Leave **Permission mode** (`:214`)
   as it is and click **Create** (`:335`).
2. The dialog closes and a notification reading `Pod created: HC alert` appears at the
   bottom-right corner of the window, with a ✓ mark before it
   (`src/renderer/src/pods/PodsChrome.tsx:326-330`;
   `src/renderer/src/notifications/NotificationItem.tsx:22`).
3. Move the mouse over the notification and keep it there for at least 10 seconds. The
   notification stays. Move the mouse away from it. About 6 seconds later it leaves by
   itself.
4. Do the same as step 1 again with the Title `HC spare` and the
   `orcastrate-human-check-spare` folder. This time do not touch the `Pod created: HC spare`
   notification. About 6 seconds after it appears, it leaves by itself.

**Passes when:** each `Pod created` notification leaves by itself about 6 seconds after it
appears, and the first one stays while the mouse is over it.

**Backlog:** `this session`. Nothing in the backlog asks for this check.

## N2 An error stays until you dismiss it

1. In File Explorer, delete the long-named folder. Leave the app running.
2. On the `HC alert` tab, click its run control, the ▶ button named "Open HC alert"
   (`src/renderer/src/pods/PodTab.tsx:328`; `src/renderer/src/pods/run-control.ts:49`). The
   app tries to start the Pod and finds the folder gone. An error notification appears at
   the bottom-right corner with a ! mark before it
   (`src/renderer/src/notifications/NotificationItem.tsx:20`). Its text is main's message,
   unchanged (`src/renderer/src/pods/PodsChrome.tsx:224`), and it starts with
   `cwd is not accessible:` (`src/main/pod/pod-runner.ts:236`).
3. Do not touch it, and wait at least 30 seconds. It is still there.
4. Click its × button, named "Dismiss notification". The notification goes.
5. Click the `HC alert` run control again. It is now named "Reconnect HC alert, stopped with
   an error" (`src/renderer/src/pods/run-control.ts:45`). The same error appears again.
   Leave it on screen for N3.

**Passes when:** the error stays for 30 seconds with nothing touched, leaves when you click
its ×, and comes back when the run control is clicked again.

**Backlog:** `this session`. Nothing in the backlog asks for this check.

## N3 Where the region sits, and that it covers no Pod tab

1. Keep the error from N2 step 5 on screen. If it is gone, click the `HC alert` run control
   again.
2. Look at where the notification is. It should sit in the window's bottom-right corner,
   with its right and bottom edges about 16 px in from the window's edges
   (`src/renderer/src/notifications/Notifications.module.css:11-12`; `--oc-space-4` is
   16 px, `src/renderer/src/styles/tokens.css:139`).
3. Look at the Pod bar, the top row of the window (`src/renderer/src/shell/WorkspaceLayout.module.css:9`),
   and the panel strip under it. The notification covers no Pod tab, no part of the Pod bar
   and no part of the panel strip.
4. Make the window as small as it goes: drag its bottom-right corner up and to the left
   until it stops. Its minimum size is 940 by 600 px (`src/main/window.ts:18-19`). Check
   steps 2 and 3 again at that size. Then make the window large again, or maximise it, and
   check them once more.
5. Note what the notification is drawn over at the bottom-right corner (for example part of
   the composer), and say so in your answer. That is expected: the region is taken out of
   the page's flow and drawn on top of whatever is in that corner.

**Passes when:** at every window size you tried, the notification sits in the bottom-right
corner and covers no Pod tab, no part of the Pod bar and no part of the panel strip.

**Backlog:** `this session`. Nothing in the backlog asks for this check.

## N4 A long error is shown whole, and the Pod tabs keep their width

1. Click the error's × to dismiss it. Leave the window at the size you ended N3 with.
2. Take a screenshot of the Pod bar (`Windows+Shift+S`), so you can compare the Pod tabs
   afterwards.
3. Click the `HC alert` run control ("Reconnect HC alert, stopped with an error"). The error
   appears again.
4. Read the message. It should be shown whole: the full folder path, every character of it,
   with nothing cut off and no "…" at the end. A long message wraps onto as many lines as
   it needs inside the notification (`overflow-wrap: anywhere`,
   `src/renderer/src/notifications/Notifications.module.css:46`), whose width is at most
   480 px (`max-width`, `:15`; `--oc-lane-rail-width` is 240 px,
   `src/renderer/src/styles/tokens.css:190`). You do not need to hover to read it.
5. Compare the Pod bar with your screenshot from step 2. Every Pod tab title is as wide as
   before, and nothing new has appeared in the Pod bar row.

The measurement this settles is moot. The backlog request from session
`20261110-1857-chrome-alert-width` asked to "measure an open-error or pods-error alert shown
together with a long reorder alert", because a long reorder alert would have widened the
Pod bar and narrowed the alert beside it. No alert remains in the tab-header row now. The
open, pods-list, fork and reorder errors all go to the notification region instead.
`grep -rn 'role="alert"' src/renderer/src/pods --include=*.tsx` finds three, and all three
are inside the dialogs, not in the header: two in the New Pod dialog
(`src/renderer/src/pods/NewPodDialog.tsx:207`, `:320`) and one in the Delete Pod dialog
(`src/renderer/src/pods/DeletePodDialog.tsx:171`). So there is no alert left in the row to
measure together with another.

**Passes when:** the whole message is readable without hovering, with nothing cut off, and
the Pod tab titles are as wide as in your screenshot.

**Backlog:** `20261110-1857-chrome-alert-width`, the request to measure an open-error or
pods-error alert shown together with a long reorder alert. This check closes it as moot,
because no alert remains in the tab-header row.

## N5 An error is drawn above the dialog scrims

No step in the app raises a new error while one of these dialogs is open, because each
dialog's scrim covers every control that could raise one. So each step below opens the
dialog while an error is already showing. That tests the same thing: the region is drawn
after the whole app (`src/renderer/src/App.tsx:48`;
`src/renderer/src/notifications/NotificationProvider.tsx:212-224`) and above every scrim
(see "What changed"), whenever its notification was raised.

1. Keep the error from N4 on screen. If it is gone, click the `HC alert` run control again.
2. Click **+**. The New Pod dialog opens and the rest of the window is dimmed by its scrim.
3. Look at the error notification. It is still in the bottom-right corner, at full
   brightness, not dimmed, and drawn on top of the scrim. Apart from the dialog itself,
   it is the only thing in the window that is not dimmed, and it dims nothing of its own:
   the region has no background (`src/renderer/src/notifications/Notifications.module.css:8-18`).
   Click **Cancel** (`src/renderer/src/pods/NewPodDialog.tsx:327`).
4. On the `HC spare` tab, click its × button, named "Delete HC spare"
   (`src/renderer/src/pods/PodTab.tsx:385`). The Delete Pod dialog opens. Check the same as
   step 3. Then click **Cancel** (`src/renderer/src/pods/DeletePodDialog.tsx:36`). Do not
   click **Delete** here.
5. In the panel strip under the Pod bar, click **Helm**
   (`src/renderer/src/shell/PanelBar.tsx:115`). The Helm panel opens. The error is still at
   the bottom-right corner.
6. In Helm's **Model** field (`src/renderer/src/helm/copy.ts:67`), type `x`. Do not press
   **Save**. Click **Close Helm** at the right end of the panel strip
   (`src/renderer/src/shell/PanelBar.tsx:132`). A confirmation opens, headed "You have
   unsaved changes" (`src/renderer/src/helm/copy.ts:159`), and dims the rest of the window.
   Check the same as step 3. Then click **Discard changes and close** (`:163`). Your edit is
   thrown away and nothing is written. If the Model field cannot be typed into, skip steps
   5 and 6 and say so.

**Passes when:** with each of the three dialogs open, the error notification is at the
bottom-right corner, at full brightness on top of the scrim, and the rest of the window
outside the dialog is dimmed once, by that dialog's scrim alone.

**Backlog:** `this session`. Nothing in the backlog asks for this check.

## N6 A screen reader announces an error assertively and a success politely

An error's message has `role="alert"`, and a success or info message has `role="status"`
(`src/renderer/src/notifications/NotificationItem.tsx:25-29`). A screen reader should
read an alert at once, cutting into whatever it was saying, and read a status when it has
finished what it was saying.

1. Dismiss any notification on screen with its ×. Turn on Narrator with
   `Windows+Control+Enter`.
2. Click the `HC alert` run control ("Reconnect HC alert, stopped with an error"). Narrator
   should read the error message straight away, without your moving focus to it.
3. Dismiss the error with its ×.
4. On the `HC spare` tab, click "Delete HC spare". In the Delete Pod dialog, leave the
   checkbox unticked if one is shown, and click **Delete**
   (`src/renderer/src/pods/DeletePodDialog.tsx:37`). The dialog closes, the tab goes, and a
   notification reading `Pod deleted: HC spare` appears
   (`src/renderer/src/pods/PodsChrome.tsx:281`). Narrator should read it once it has
   finished reading anything else, without your moving focus to it.
5. Turn Narrator off with `Windows+Control+Enter`.

Some screen readers do not read a status message that appears together with its own
container. That is a belief, not checked here, and it is the reason for this check: if
Narrator reads nothing at step 4, that is a fail; say so.

**Passes when:** Narrator reads the error at step 2 straight away and reads the success at
step 4, both without focus moving to them.

**Backlog:** `this session`. Nothing in the backlog asks for this check.

## N7 The focus outline on a dismiss control and on the empty region

1. Click the `HC alert` run control again. The error appears.
2. Click once on the error's text, not on its ×. Then press `Tab`. Focus should land on the
   notification's × button. If it lands somewhere else, keep pressing `Tab` until it reaches
   the ×.
3. Look at the ×. It shows a blue outline (`src/renderer/src/notifications/Notifications.module.css:63-65`;
   `--oc-border-thick` is 2 px, `src/renderer/src/styles/tokens.css:164`; `--oc-focus-ring`,
   `:57`).
4. Press `Enter`. The notification goes. It was the only one, so focus moves to the region
   itself (`src/renderer/src/notifications/NotificationProvider.tsx:187-188`), which shows
   the same outline (`src/renderer/src/notifications/Notifications.module.css:20-22`).
5. Look at the bottom-right corner, about 16 px in from each edge. The region is empty now
   and has no padding, so, from reading its CSS, its outline should be only a small blue
   square about 4 px across. This size was not measured.

**Passes when:** you see the outline on the × at step 3 and an outline at the bottom-right
corner at step 4. Say whether the step-4 outline is big enough to notice.

**Backlog:** `this session`. Nothing in the backlog asks for this check.

## N8 (optional) Info notifications from a real start and stop

This check starts a real Claude Code process; see "Before you start".

1. In File Explorer, create the long-named folder again, with the same name it had in Setup
   step 3.
2. Click the `HC alert` run control ("Reconnect HC alert, stopped with an error"). The Pod
   starts. A notification reading `Pod reconnected: HC alert` appears, with an i mark before
   it (`src/renderer/src/pods/PodsChrome.tsx:228-232`;
   `src/renderer/src/notifications/NotificationItem.tsx:21`). If an error was still on
   screen, it goes when the click starts the Pod (`src/renderer/src/pods/PodsChrome.tsx:216`).
3. Do not touch it. About 6 seconds later it leaves by itself.
4. Click the ❚❚ run control, named "Stop HC alert" (`src/renderer/src/pods/PodTab.tsx:328`).
   A notification reading `Pod stopped: HC alert` appears
   (`src/renderer/src/pods/PodsChrome.tsx:165`), and about 6 seconds later it leaves by
   itself.

**Passes when:** both info notifications appear with the i mark and leave by themselves.

**Backlog:** `this session`. Nothing in the backlog asks for this check.

## Cleanup

A running Pod has no × button; if you ran N8 and `HC alert` is still running, stop it first
with its ❚❚ button.

1. On the `HC alert` tab, click its × button, named "Delete HC alert". In the Delete Pod
   dialog, leave the checkbox unticked if one is shown, and click **Delete**.
2. If you skipped N6, delete `HC spare` the same way.
3. In File Explorer, delete the folders from Setup step 3 that are still there.
