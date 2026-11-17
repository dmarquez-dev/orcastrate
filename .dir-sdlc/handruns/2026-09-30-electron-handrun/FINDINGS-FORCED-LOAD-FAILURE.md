# Findings: forced load failure (2026-11-17)

Session `20261117-1751-forced-load-failure`. Driver `driver/run-forced-load-failure.mjs`,
reports `driven-report-forced-load-failure.{json,md}` and
`driven-report-forced-load-failure-skip-delete.{json,md}`, screenshots under
`screenshots/forced-load-failure/` and `screenshots/forced-load-failure-skip-delete/`.

This run makes the two Retry-control human checks left open by session
`20261112-0151-workspace-load-retry` performable: `retry-button` (Retry reads as a button
next to the message, and Tab reaches it with a ring the item does not clip) and
`retry-themes` (Retry is legible under the light and the dark preference). Every number
below is read from the two committed JSON reports; nothing here is a prediction.

## The route

No production code was changed. The failure is forced through the app's own IPC:

1. Three Pods are created through `window.orcastrate.pods.create` (`src/preload/api.ts:95`),
   titled `HC load companion`, `HC load live` and `HC load target`, all with the sandbox's
   `repos/plain-repo` as `cwd`, and the renderer is reloaded. The report records their ids
   and the tab order 0, 1, 2 in that order.
2. After the reload the first tab by order, `HC load companion`, is selected
   (`aria-current="true"`), auto-activated by `src/renderer/src/state/store.ts:629-633`; so
   neither later Pod has been activated (precondition O1, pass in both runs).
3. `window.orcastrate.pods.delete({ podId: <target>, deleteSession: false })`
   (`src/preload/api.ts:100`) answered
   `{ ok: true, value: { podDeleted: true, session: 'not-requested', sessionError: null } }`
   (`src/main/ipc/handlers.ts:152-158`). The call bypasses the renderer store, so its
   `deletedPods` tombstone is never written and no push tells the window: the target's tab
   is still rendered (O2).
4. `HC load live`'s tab is clicked, then the target's stale tab. Activation issues
   `lanes.list` and `events.read` once (`store.ts:790-805`); for the target main refuses
   both with `no Pod with id <id>` (`src/main/pod-manager/pod-manager.ts:1657`, the
   `#requirePod` lookup), and two error notifications appear, each with Retry.

### How O3's two items are attributed to E8 and E9

The DOM carries no key: both items are `[data-testid="notification"][data-kind="error"]`
with the identical message `no Pod with id <target id>`, and the notification key is held
by the provider, not rendered. The attribution rests on the source:
`src/renderer/src/shell/WorkspaceAlerts.tsx:95-103` holds exactly two `usePodLoadAlert`
calls, `'lanes-load'` fed by the lane rail's phase and error (E8) and `'events-load'` fed by
the active session's backfill phase and error (E9), and each raises one keyed `error`
notification with a `Retry` action whose message is `IpcError.message` verbatim. Both reads
answer with main's one `#requirePod` message, so one item is E8 and the other E9; which DOM
position holds which is not observable from the window, and no verdict here depends on it.

### The live Pod raises nothing

`HC load live` was clicked before the target, so its `lanes.list` and `events.read` were
issued before the target's and have answered by the time the target's two items are
present. In the run, 0 error items existed after the live click and before the target
click (`setup.liveActivation.errorItemsBeforeTargetClick`), a direct `lanes.list` for the
live Pod answered `ok: true`, and at the moment O3's two items were present 0 notification
items contained the live Pod's id (O4).

### No route forces E10

E10 is `app.routingMode()` failing. Its handler is
`register(INVOKE_CHANNELS.appRoutingMode, () => manager.routingMode)`
(`src/main/ipc/handlers.ts:239`): it takes no argument and returns a field fixed when the
PodManager was constructed, so neither this delete route nor any other input from the
window makes it fail. This run does not force E10, and neither backlog row needs it.

## Verdict table: `forced-load-failure` run

Exit code 1 (`meta.exitCode`): 12 observations `pass`, 1 `fail` (O9), 0
`instrument-invalid`; every control fired and every undo was verified (counted from the
JSON report's `observations`). O1 is a precondition with no control: pass, selected tab
`HC load companion`.

| Obs | Backlog row | Verdict | Measured | Control | Control observed | Fired |
|---|---|---|---|---|---|---|
| O2 | retry-button | pass | delete ok true, podDeleted true, session not-requested; target tab still rendered | the same tab-presence probe for a fresh UUID | absent | true |
| O3 | retry-button | pass | 2 matching error items (condition met within the 15000 ms timeout), both reading `no Pod with id <target id>` | O4's must-not-fire count: items containing HC load live's id | 0 | true |
| O4 | retry-button | pass | 0 items contain HC load live's id; 2 error items in total | the same count keyed on the target's id | 2 | true |
| O5 | retry-button | pass | each of the 2 items holds 1 Retry, after the message `<p>` and before the dismiss button | first item's Retry detached, probe rerun, reattached | 0 buttons while detached; reattached, 1 Retry, same node | true |
| O6 | retry-button | pass | border-top solid, 0.8px; cursor pointer; background rgb(26, 29, 35) against the item's rgb(58, 31, 34) | inline `border-style: none; background: transparent` | border none, width 0; effective background equals the item's | true |
| O7 | retry-button | pass | Retry left 1181.01 at or right of message right 1173.01 (tol 1.00); vertical extents overlap | inline `flex-direction: column` on the item | not adjacent | true |
| O8 | retry-button | pass | starting point: mouse click on the first item's message `<p>`, which focused the notification viewport; 1 Tab press; Retry focused, `:focus-visible` true | the same probe before any press | Retry not focused, `:focus-visible` false | true |
| O9 | retry-button | **fail** | outline solid, **1.6px** against `--oc-border-thick` 2px; outline-offset 1.6px; focused ring clip differs from the unfocused clip | added `<style>` giving that button `outline: none !important` | outline-style none; control capture byte-identical to the unfocused capture | true |
| O10 | retry-button | pass | ring outer box l 1177.81 r 1230.19 t 768.40 b 793.80 inside item padding box t 763.60 b 798.60 | inline `padding: 0` on the item | ring outside the padding box | true |
| O11 | retry-button | pass | ancestors checked (overflow not visible): `body` (hidden/hidden), contains the ring; 0 clipping | inline `overflow: hidden; padding: 0` on the item | clipping ancestor: the item | true |
| O12 | retry-themes | pass | dark: rgb(232, 234, 238) on rgb(26, 29, 35), ratio 14.016 (threshold 4.5) | inline color set to the measured background | ratio 1.00 | true |
| O13 | retry-themes | pass | light: rgb(232, 234, 238) on rgb(26, 29, 35), ratio 14.016 (threshold 4.5) | inline color set to the measured background | ratio 1.00 | true |
| O14 | retry-themes | pass | color, background-color, border-top-color and the item's background-color identical under both; the window saw each preference; emulateMedia reset to null | added `<style>` with `@media (prefers-color-scheme: light)` setting that button's color to rgb(1, 2, 3) | under dark no difference; under light `color` differs | true |

### O9: the one `fail`, as measured

The ring is painted (the focused clip differs from the unfocused one, and the control's
clip is byte-identical to the unfocused one), it is solid, and it is not clipped (O10,
O11). What fails is the literal comparison: the computed `outline-width` is `1.6px`, not
the `2px` that `--oc-border-thick` resolves to in the same window.

The same window reports, on the same button, a computed `border-top-width` of `0.8px` for
`--oc-border-hairline: 1px`, and an `outline-offset` of `1.6px` for the global `2px`
(`src/renderer/src/styles/global.css:62`). The report's `meta.display` records a display
scale factor of 1.25 and a page zoom factor of 1, while `window.devicePixelRatio` reads
1.0000000149011612. All three widths equal `floor(declared x 1.25) / 1.25`, the same
pattern `FINDINGS-KEYWORD-SWEEP.md` recorded for border widths in this harness and left
unexplained. That arithmetic is consistent with Chromium snapping used widths to whole
device pixels at a 1.25 scale; this run records it and does not prove it. Under that
reading the ring is 2 device pixels wide, and the `2px` token cannot compute to `2px` on
this display, so the `fail` says more about the criterion's literal equality than about
the stylesheet. Whether it closes the `retry-button` row is the Gate 3 call.

## The `forced-load-failure-skip-delete` run (the must-fail control)

Same states, but the target is never deleted. Exit code 2 (`meta.exitCode`).

- O1 pass: `HC load companion` selected after the reload.
- O2 `instrument-invalid` by design: the delete is not performed, so it is not measured and
  its control is not run.
- **O3 `fail`**: 0 matching error items when the 15000 ms condition timed out
  (`waitedConditionMet: false`); 0 notification items of any kind. Its control fired
  (0 items contain HC load live's id). This is the result the whole-run control predicts:
  with the target still in main's store, both reads succeed and nothing is raised, so the
  2 items of the normal run are produced by the delete and by nothing else in the route.
- O4 `instrument-invalid`: its control, the target-keyed count, measured 0 where 2 was
  predicted, as it must when no item exists.
- O5-O14 `instrument-invalid`: no item to measure, so no control was run.

## Safety

Both runs launched the app with `buildSandbox(<root>).env`; the sandbox roots were
directories under the implementer's scratch directory, recorded in `meta.sandboxRoot`, and
removed at exit (`meta.sandboxRemoved: true`). Main reported `USERPROFILE`, `APPDATA` and
`userData` inside the sandbox and `CLAUDE_CONFIG_DIR` unset. The real
`%USERPROFILE%\.claude\settings.json` sha256 was identical before and after each run
(`meta.realSettingsSha256`). No control edited a file: each was an inline style, an added
`<style>`, a detached node or emulated media, and each was undone and the undo verified
before the next observation.

## Summary

- The console-delete route forces E8 and E9 in the real window: a stale tab, then exactly 2
  error notifications reading `no Pod with id <target id>`, each with one Retry between the
  message and the dismiss button, and nothing for the live Pod. The skip-delete run shows
  the items come from the delete.
- `retry-button`: Retry is drawn as its own control (border, background distinct from the
  item's, pointer cursor), sits right of the message, is reached by one Tab press with
  `:focus-visible`, and its painted ring stays inside the item's padding box with no
  clipping ancestor. One literal comparison fails: the ring computes to 1.6px, not the
  token's 2px, consistent with device-pixel snapping at the display's 1.25 scale (O9).
- `retry-themes`: contrast 14.016 under both preferences, and every measured colour is
  identical under both, because the app has a single dark palette
  (`src/renderer/src/styles/tokens.css:14-16`). Whether that closes the row's "both themes"
  wording is the Gate 3 call.
- E10 has no route and is not forced.
