# Human checks: forced load failure

Session `20261117-1751-forced-load-failure`. These are two checks for you to run by hand
at Gate 3. Both are checks session `20261112-0151-workspace-load-retry` left open, because
nothing in the app could make the workspace loads fail that show a **Retry** button. Tell
the orchestrator the result of each one, in your own words.

## What this file checks

A workspace load that fails raises an error notification with a **Retry** button. The
failures are E8 (`lanes.list`), E9 (`events.read`) and E10 (`app.routingMode`). This file
forces E8 and E9 with the app's own console commands: you create a throwaway Pod, reload
the window so it shows the Pod's tab, delete the Pod from the console so main no longer
has it while its tab stays on screen, and then click that tab. Both reads fail with
`no Pod with id <id>`, and two error notifications appear, each with Retry. The hand-run
driver `driver/run-forced-load-failure.mjs` did the same thing in a sandbox; its results
are in `FINDINGS-FORCED-LOAD-FAILURE.md` and are quoted under H1 and H2.

No step in this file forces E10. Main answers `app.routingMode` from a value it already
holds (`register(INVOKE_CHANNELS.appRoutingMode, () => manager.routingMode)`,
`src/main/ipc/handlers.ts:239`), and the window reads it at start-up
(`src/renderer/src/state/store.ts:430`), so no input from the window can make it fail.
Neither backlog row needs E10: E8 and E9 raise the same notification with the same Retry
button.

## Before you start: this runs against your real data

`npm run dev` runs the app against your real profile and your real Claude home. There is no
sandbox. Your Pods live in `orcastrate.db` in the app's user-data folder
(`src/main/index.ts:119`), and the Claude home is `%USERPROFILE%\.claude`
(`src/main/index.ts:47`).

**Setup step 11 deletes a Pod from the console. That call asks for no confirmation and
cannot be undone.** Steps 9 to 11 make sure it can only delete the Pod titled
`HC load target`, and you check the id by eye before you press Enter.

What each step that runs a command or changes data writes:

- **Starting the app** (Setup step 1) does what every start does. Main runs the start-up
  reconciliation (`src/main/index.ts:135`, `src/main/pod-manager/pod-manager.ts:316-358`):
  every lane still recorded as running is marked orphaned, with a reconciliation event
  written for its Pod, and every Pod whose status is neither `closed` nor `beached` is set to
  `closed`, keeping its `last_active_at` as it was (`pod-manager.ts:355`). Electron also
  writes its own files in the user-data folder.
- **`pods.list`** (Setup steps 4 and 9) reads only.
- **`pods.create`** (Setup steps 6 and 7) writes one new Pod row each: status `closed`, its
  tab order the number of Pods that already exist, `created_at` and `last_active_at` set to
  now. It writes no other row, starts no process and writes no file in the Claude home
  (`src/main/pod-manager/pod-manager.ts:418-431`,
  `src/main/store/sqlite-event-store.ts:167-193`).
- **`location.reload()`** (Setup step 8, Cleanup step 1) reloads the window only. Main keeps
  running, so the start-up reconciliation does not run again.
- **`pods.delete` with `deleteSession: false`** (Setup step 11) stops nothing, because the
  Pod was never opened and has no runner (`src/main/pod-manager/pod-manager.ts:1015-1017`).
  It deletes the Pod's row, and its lanes and events go with it
  (`src/main/store/sqlite-event-store.ts:238-244`). No conversation file is touched
  (`src/main/ipc/handlers.ts:152-158`). The window is not told, so the Pod's tab stays.
- **Clicking the stale tab, and Retry** (H1 steps 1 and 6) issue `lanes.list` and
  `events.read`, reads that fail because main has no such Pod. Nothing is written
  (`src/main/pod-manager/pod-manager.ts:1114-1131`, `:1655-1658`).
- **Cleanup step 2** deletes the Pod `HC load companion` through its × button, with the
  conversation-file checkbox left unticked: its row, lanes and events, as above.

No step in this file rewrites another Pod's row or its `last_active_at`, beyond what the
start-up reconciliation in the first bullet does on every start of the app, and that keeps
every `last_active_at` as it was.

## Setup

1. Open a terminal and run `npm run dev` in the repository root. Before the session merges,
   that is the session worktree, `.claude-worktrees/20261117-1751-forced-load-failure`;
   after it merges, it is the main checkout.
2. Wait for the Orcastrate window to open. Do not click any Pod tab yet.
3. Open the developer tools console. Press `Control+Shift+I`. If nothing opens, press `Alt`
   to show the menu bar (it is hidden, `autoHideMenuBar: true`, `src/main/window.ts:21`) and
   choose View, then Toggle Developer Tools. Then click the **Console** tab. This rests on
   Electron's default menu: the app sets no `Menu` anywhere in `src/`, so the default should
   apply. It was not run in this session.
4. Check the two titles are free. In the console, type
   `(await window.orcastrate.pods.list()).value.map((p) => [p.title, p.id])` and press
   Enter. This is `window.orcastrate.pods.list()` (`src/preload/api.ts:94`). It prints one
   `[title, id]` pair per Pod. **If any Pod is already titled `HC load companion` or
   `HC load target`, stop here** and tell the orchestrator: steps 9 to 11 pick the Pod to
   delete by that title.
5. Choose a folder for the two Pods' `cwd`. It must be an absolute path to a folder that
   already exists. The repository root from step 1 is one. A relative path is refused
   (`src/main/ipc/validate.ts:106-108`), and a folder that does not exist is refused with
   `CWD_MISSING` (`src/main/pod-manager/pod-manager.ts:419-421`). Inside the quotes below,
   write each backslash twice, for example `'C:\\Users\\you\\orcastrate'`. Nothing runs in
   that folder: neither Pod is ever opened.
6. Create the companion Pod first. Type
   `await window.orcastrate.pods.create({ title: 'HC load companion', cwd: '<your folder>', permissionMode: 'default' })`
   and press Enter. This is `window.orcastrate.pods.create` (`src/preload/api.ts:95`). The
   answer starts `{ ok: true, value: {`. If it says `ok: false`, read its message, fix the
   folder and try again.
7. Create the target Pod second, the same way:
   `await window.orcastrate.pods.create({ title: 'HC load target', cwd: '<your folder>', permissionMode: 'default' })`.
   Expand the answer's `value` and **write down its `id`**. You check against it in step 10.

   Why two Pods, and why the target is second: when the window loads, it activates the
   first Pod by tab order (`src/renderer/src/state/store.ts:629-633`), and activating a Pod
   starts its loads only once per Pod (`store.ts:798`). If the target were activated before
   it is deleted, its loads would succeed, and clicking it afterwards would load nothing
   and raise nothing. So the target must be a later tab than the first one, and **you must
   not click the `HC load target` tab before step 11 has deleted it**. If you have no Pods
   of your own, `HC load companion` is the first tab and is the one activated; otherwise
   your own first Pod is.
8. Reload the window: type `location.reload()` in the console and press Enter. A Pod
   created from the console is not added to the window's Pod list, which the window reads
   at start-up (`src/renderer/src/state/store.ts:374`), so the two new tabs appear only after
   a reload. Find them by their titles, `HC load companion` and `HC load target`: they need
   not be the last two tabs. Do not click either.
9. In the console, type
   `(await window.orcastrate.pods.list()).value.filter((p) => p.title === 'HC load target').map((p) => p.id)`
   and press Enter. It prints the id of every Pod titled exactly `HC load target`. It must
   print exactly one id.
10. Check that id, character for character, against the id you wrote down in step 7. If it
    does not match, or step 9 printed no id or more than one, stop here and tell the
    orchestrator. Do not go on to step 11.
11. **Warning: the next command asks for no confirmation and cannot be undone.** It deletes
    the one Pod titled `HC load target`, and refuses if there is not exactly one. Type
    `await (async () => { const matches = (await window.orcastrate.pods.list()).value.filter((p) => p.title === 'HC load target'); if (matches.length !== 1) return 'Refused: ' + matches.length + ' Pods are titled HC load target. Nothing was deleted.'; return window.orcastrate.pods.delete({ podId: matches[0].id, deleteSession: false }); })()`.
    This is `window.orcastrate.pods.delete({ podId, deleteSession: false })`
    (`src/preload/api.ts:100`). Press Enter only after step 10 matched. The answer should
    be `{ ok: true, value: { podId: '<the id>', podDeleted: true, session: 'not-requested', sessionError: null } }`.
    The `HC load target` tab stays on screen: the window is not told.

## H1 The Retry button and its focus ring

1. Click the `HC load target` tab. Two red error notifications appear at the window's
   bottom-right corner (`src/renderer/src/notifications/Notifications.module.css:8-12`).
   Each reads `no Pod with id <id>`, with the id you wrote down
   (`src/main/pod-manager/pod-manager.ts:1657`). One is the failed `lanes.list`, the other
   the failed `events.read`. Each has a **Retry** button between the message and the ×
   (`src/renderer/src/notifications/NotificationItem.tsx:77-95`). They stay until you
   dismiss them (`src/renderer/src/notifications/types.ts:12`); do not dismiss them with
   their ×, because H2 needs them too.
2. Look at **Retry** in each notification. It has its own thin border, a background darker
   than the notification's red-tinted one, and the mouse pointer turns into a hand over it.
   It sits to the right of the message, on the same line, before the ×. Decide whether it
   reads to you as a button next to the message.
3. Now reach Retry with the keyboard, by the route the driver used (O8): click once on the
   message text of the upper notification, not on Retry or the ×. That puts focus on the
   notification area. Then press `Tab` once. Focus moves to the upper notification's Retry.
   If it does not, keep pressing `Tab` until Retry shows a ring.
4. Look at the ring. It is the `.action:focus-visible` rule
   (`src/renderer/src/notifications/Notifications.module.css:79-81`): a solid outline in the
   focus-ring blue (`--oc-focus-ring`, `src/renderer/src/styles/tokens.css:57`) at the
   thick border width (`--oc-border-thick: 2px`, `tokens.css:164`), drawn a little outside
   Retry's own border. It should be a whole rectangle, all four sides unbroken, inside the
   notification's red border. "Clipped by the item's border" would look like a side of the
   ring missing, cut off flat, or hidden where it meets the notification's border, so that
   the ring is not a closed rectangle.
5. Compare with the driver's screenshots:
   `.dir-sdlc/handruns/2026-09-30-electron-handrun/screenshots/forced-load-failure/02-after-target-click.png`
   (the whole window after the target's tab was clicked),
   `.dir-sdlc/handruns/2026-09-30-electron-handrun/screenshots/forced-load-failure/viewport-dark-retry-focused.png`
   (the two notifications, the upper Retry focused) and
   `.dir-sdlc/handruns/2026-09-30-electron-handrun/screenshots/forced-load-failure/O9-ring-clip-focused.png`
   with
   `.dir-sdlc/handruns/2026-09-30-electron-handrun/screenshots/forced-load-failure/O9-ring-clip-unfocused.png`
   (the ring's rectangle with and without focus).
6. With Retry focused, press `Enter`. The notification disappears and comes straight back,
   because the retried load fails again for the same reason. It comes back under the same
   key (`src/renderer/src/shell/WorkspaceAlerts.tsx:15-23`), so there are still two
   notifications, not three. It may come back at the bottom of the stack rather than at
   the top.

What the driver measured (`driven-report-forced-load-failure.json`, a 1280 by 860 window at
a display scale factor of 1.25):

- O5 `pass`: each of the 2 notifications holds 1 Retry, after the message and before the ×.
- O6 `pass`: Retry's top border is `solid`, 0.8px wide; its cursor is `pointer`; its
  background is rgb(26, 29, 35) against the notification's rgb(58, 31, 34).
- O7 `pass`: Retry's left edge is at 1181.01 px, right of the message's right edge at
  1173.01 px, and the two overlap vertically.
- O8 `pass`: after a mouse click on the first notification's message, which focused the
  notification area, 1 `Tab` press put focus on Retry with `:focus-visible` true.
- O9 **`fail`**: the ring is `solid`, but its computed width is **1.6px** against the 2px
  that `--oc-border-thick` resolves to; its offset is also 1.6px. The ring is painted: the
  focused capture differs from the unfocused one. The same window reports Retry's 1px
  border as 0.8px. `FINDINGS-FORCED-LOAD-FAILURE.md` notes that all three widths equal
  `floor(declared x 1.25) / 1.25`, which is consistent with Chromium snapping widths to
  whole device pixels at a 1.25 display scale, so the ring would be 2 device pixels wide;
  the run records that and does not prove it. The `fail` is the literal 2px comparison,
  not a missing or clipped ring. Whether it matters is your call.
- O10 `pass`: the ring's outer edges (left 1177.81, right 1230.19, top 768.40, bottom
  793.80) lie inside the notification's padding box (top 763.60, bottom 798.60).
- O11 `pass`: the only ancestor that clips its overflow is `body`, and it contains the
  ring; 0 clipping ancestors.

**Passes when:** Retry looks to you like a button beside the message, and when you reach it
with `Tab` its blue ring is a whole rectangle that the notification's border does not cut
off.

**Backlog:** `20261112-0151-workspace-load-retry`, the row asking you to check that the
Retry button "reads as a button next to the message" and that tabbing to it shows its
`.action:focus-visible` ring unclipped by the item's border.

## H2 Retry under the light and the dark preference

Orcastrate has one colour palette and no light theme. `tokens.css` says so
(`src/renderer/src/styles/tokens.css:14-16`: exactly one `:root` block, no
`prefers-color-scheme` override, "a single dark surface palette"), and it is a single
`:root` block, held by `src/renderer/src/styles/tokens.test.ts:85-87`. The only
`prefers-color-scheme` text in `src/` is that comment: at authoring,
`MSYS_NO_PATHCONV=1 git -C C:/Users/dmarq/Development/Repos/orcastrate grep -n -E "prefers-color-scheme" e539917 -- src`
printed 1 line, `tokens.css:15`, while the near-miss `prefers-reduced-motion` matched lines
in 7 files. So "the light and the dark theme" can only mean the light or dark preference
the window sees, and no rule in the app reads it: Retry should look the same under both.

1. Keep the two notifications from H1 on screen. If you dismissed both with their ×, this
   file gives you no way to bring them back: clicking the target's tab again loads nothing,
   because a Pod's loads start only once (`src/renderer/src/state/store.ts:798`). Tell the
   orchestrator instead.
2. Switch the window to the light preference, by either route. **Neither was run in this
   session.**
   - Developer tools: in the developer tools, press `Control+Shift+P`, type `rendering`
     and choose **Show Rendering**. In the Rendering panel, find **Emulate CSS media
     feature prefers-color-scheme** and choose `prefers-color-scheme: light`. This affects
     only this window, and only while the developer tools are open.
   - Windows: Settings, Personalization, Colors, **Choose your mode** (or **Choose your
     default app mode**), set to Light. The app sets no `nativeTheme` source of its own
     (no `nativeTheme` in `src/`), so the window should follow Windows. This changes every
     app that follows the Windows setting.
3. Under light, look at both notifications, with Retry unfocused, then focused as in H1
   step 3. Check that Retry's label is easy to read against its background, that its border
   and the focus ring are visible, and note the colours of the label, its background, its
   border and the notification.
4. Switch to the dark preference (`prefers-color-scheme: dark`, or Windows mode Dark) and
   look at the same things.
5. Compare the two. Since no rule reads the preference, you should see no difference.
6. Put the preference back: in the Rendering panel choose **No emulation**, or set Windows
   back to the mode you had.
7. Compare with the driver's screenshots, taken under each emulated preference:
   `.dir-sdlc/handruns/2026-09-30-electron-handrun/screenshots/forced-load-failure/viewport-light-unfocused.png`,
   `.dir-sdlc/handruns/2026-09-30-electron-handrun/screenshots/forced-load-failure/viewport-dark-unfocused.png`,
   `.dir-sdlc/handruns/2026-09-30-electron-handrun/screenshots/forced-load-failure/viewport-light-retry-focused.png`
   and
   `.dir-sdlc/handruns/2026-09-30-electron-handrun/screenshots/forced-load-failure/viewport-dark-retry-focused.png`.

What the driver measured (`driven-report-forced-load-failure.json`; the driver switched the
preference with Playwright's `emulateMedia`, which you cannot use by hand):

- O12 `pass`: under the dark preference, Retry's text rgb(232, 234, 238) on its background
  rgb(26, 29, 35) has a contrast ratio of 14.016 (threshold 4.5).
- O13 `pass`: under the light preference, the same rgb(232, 234, 238) on rgb(26, 29, 35),
  ratio 14.016 (threshold 4.5).
- O14 `pass`: Retry's text colour, background colour and top-border colour (rgb(69, 77,
  91)), and the notification's background (rgb(58, 31, 34)), are identical under both
  preferences; the window saw each preference, and the emulation was reset afterwards.

Whether "identical under both, readable under both" closes the row's "both themes" wording
is the open question for Gate 3.

**Passes when:** under both the light and the dark preference, you can read Retry's label
easily against its background, and its border and focus ring are visible.

**Backlog:** `20261112-0151-workspace-load-retry`, the row asking you to check that the
Retry control is "visible and legible in both the light and the dark theme".

## Cleanup

1. Reload the window first: type `location.reload()` in the console and press Enter. The
   window reads the Pod list again, and the stale `HC load target` tab disappears. Do not
   try to delete that tab with its × before the reload: main no longer has the Pod, so the
   window's delete gets main's failure back and returns it
   (`src/renderer/src/state/store.ts:700-701`).
2. Delete `HC load companion`: click its × button (named `Delete HC load companion`,
   `src/renderer/src/pods/PodTab.tsx:385`). In the Delete Pod dialog, leave the checkbox
   "Also move this Pod's Claude Code conversation file to the recycle bin."
   (`src/renderer/src/pods/DeletePodDialog.tsx:35`) unticked; it starts unticked
   (`DeletePodDialog.tsx:87`). Click **Delete** (`DeletePodDialog.tsx:37`).
3. If you changed the Windows mode or the Rendering emulation in H2 and have not put it
   back, do it now.
4. In the terminal running `npm run dev`, press `Control+C` to stop it, then close that
   terminal. Before the merge, the session worktree's folder cannot be removed while a
   terminal is open in it.
