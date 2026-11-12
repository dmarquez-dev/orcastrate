# Notification follow-ups

Close the three code-level advisories that session 20261111-0156-message-alerting left in
`.sir/backlog.md` about the in-app notification region: the empty-message Text-node promise,
the silent stop of an unlisted Pod, and the invisible focus outline on the empty viewport.

## Context

The notification region shipped in merge `c0533d3`. Three of the backlog rows that merge's Gate 3
appended name code defects. All anchors were re-measured at `292bee6`:

- **Empty message.** The `NotificationItem.tsx` docblock (`:9-11`) promises that the message
  element's first child is "the one Text node React renders for a non-empty string". React
  renders no Text node for `''`. This was measured with the worktree's react 19.2.8 under
  jsdom: `childNodes` is 0 and `textContent` is `""`. The promise is pinned only for non-empty
  messages.
- **Unlisted Pod stop.** `PodsChrome.tsx` `handleStop` reads the title from `pods.value` before
  the stop, then returns without notifying when the row is missing (`:164`). **No rendered
  control reaches this branch.** `PodsChrome` passes `onClose={handleStop}` and
  `tabs={pods.value}` from the same render. `PodBarPanel` resolves its optimistic order through
  the current `tabs` and falls back to `tabs` when an id is missing. `PodBar` renders one tab
  per row. So the fix is defensive, and its test reaches the handler through a mocked
  `PodBarPanel`.
- **Empty-viewport focus.** After the last item is dismissed, focus goes to the empty
  `.viewport`. That rule has no padding and no minimum size, so its `:focus-visible` outline
  outlines a box with no size.

## Definition of done

1. A notification with an empty message is rendered as given for every kind. It does not
   throw, is not rejected and is not rewritten. Its message element has no child nodes and
   `textContent` `''`.
2. The `NotificationItem` docblock states what holds for an empty message (no child nodes,
   `textContent` `''`). It no longer promises a Text node for every message.
3. No existing notification-region test is weakened.
4. A successful stop of a Pod that is not in the Pod list raises exactly one info notification.
   Its text is exactly `Pod stopped` and its key is `pod-close`.
5. An unlisted stop still calls `closePod` with that Pod's id.
6. A listed stop still raises `Pod stopped: <title>`, and the S6 end-to-end test still passes.
7. A failed unlisted stop raises the IPC error message verbatim as an error, and no
   `Pod stopped`.
8. The comments in `handleStop` describe the new behaviour and do not claim that the branch is
   reachable from the rendered bar. The code handles the unlisted case without `!`, without
   `as` and without throwing.
9. While the empty viewport is focused (`:focus-visible`), it has a minimum width and height of
   at least 16px, taken from `--oc-space-*` tokens. Its outline declaration is unchanged, and
   the stylesheet never removes the outline.
10. The unfocused viewport's size is unchanged, so it does not become a fixed box that
    intercepts clicks.
11. N7 step 5 predicts the new focused size and still says the size was not measured, and N7
    stays open. Every `Notifications.module.css` line citation in the human-checks file is
    correct.
12. No `src` file gains a session-id citation or a `.sir/sessions` citation.
13. Every new test's name states its condition and its outcome.
14. `npm run typecheck` exits 0 repo-wide, and unscoped `npm test` exits 0.
15. At Gate 3, the three backlog rows this session closes are removed from `.sir/backlog.md`.
    They are identified by their text: the empty-message row, the unlisted-stop row and the
    empty-viewport-focus row. No other row is removed.

## Scope

The three behaviour fixes above, each with a test, and the N7 step 5 wording that the viewport
fix makes false. T1 and T3 run in parallel, and T2 runs after both and carries the repo-wide
gates.

### Not in scope

- The `role="status"` announce-on-insert row. It needs a Narrator observation (human check N6).
- Human checks N3, N5, N6 and N7 step 5. They need the user at the running app. T3 rewords N7
  step 5's prediction but does not make the check, and Gate 3 keeps that check open.
- The E8–E10 retry affordance.
- Removing the existing session-id citations in `src`. Eight files carry one at base, including
  `notifications/types.ts:3`. This session only guarantees that it adds none (criterion C27).

## Assumptions

| Question | Answer | Rung | Evidence |
|---|---|---|---|
| Row 1: reject, normalise, or narrow the promise for an empty message? | Narrow the promise. The message is rendered as given, and the docblock states the empty case. **Gate 2 decision D1.** | repo | Prior frozen contract `.sir/sessions/20261111-0156-message-alerting/contracts/notifications.ts` (an empty string "is a caller defect; the provider renders it as given and does not throw"); `types.ts` `message` "Shown verbatim" |
| Row 2: what should an unlisted successful stop do? | Raise an untitled info `Pod stopped` with key `pod-close`, and still call `closePod`. **Gate 2 decision D2.** | repo | `PodsChrome.tsx` `handleStop`; the backlog row's own question |
| Is the unlisted-stop branch reachable from the UI? | No. The test reaches it through `vi.mock('./PodBarPanel')`. | repo | `PodsChrome.tsx:342,350,157`; `PodBarPanel.tsx:64-73`; `PodBar.tsx:94-102`; precedent `shell/App.panelSlots.test.tsx:22` |
| Row 3: size the focused viewport, or move focus? | Add `min-width` and `min-height` of at least 16px under `.viewport:focus-visible` only. **Gate 2 decision D3.** | repo | `Notifications.module.css:8-22`; `tokens.css:136-141` (4, 8, 12, 16, 24, 32 px) |
| What counts as a "visible" minimum size? | A `--oc-space-4` (16px) floor. 4–12px is too close to the bare outline square. | judgment | — |
| Can tasks run concurrently? | Scoped vitest runs can. Repo-wide commands cannot overlap an injection. So T1 and T3 run in parallel, and T2 runs after both. | repo | `package.json` (`tsc --noEmit`, so no build output); `vitest.config.ts` (one project); T1's and T3's scoped suites do not read each other's injection sites (`Notifications.styles.test.ts:4-5,13-14`) |
| Which files does each task inject defects into? | T1: `NotificationItem.tsx`. T3: `Notifications.module.css` and `.viewport` only. T2: `PodsChrome.tsx`. T2's tests read the first two, so T2 runs after T1 and T3. | repo | manifest C2, C11, C21, C22 |
| Session-id census baselines | 8 files in `src` match `2026111`, `.sir/sessions` appears in 1 file (`types.ts`), and `PodsChrome.tsx` has 1 match. | repo | `git grep -l --untracked 2026111 -- src \| wc -l` printed 8. The cross-check `git grep -l "20261111-0156" 292bee6 -- src \| wc -l` printed 8. |
| Must N7's wording change? | Yes. Step 5's "no padding / about 4 px" becomes false, and the added declarations move its CSS line citations (7 citations). | repo | `grep -o 'Notifications.module.css:[0-9-]*' docs/human-checks/message-alerting.md` printed 7 lines |
| Verification commands | `npm run typecheck`, `npm test` and `npm run build` all ran in the worktree with exit 0, and the build left the tree clean. | repo | `state.json` `verification` |

## Contracts

None. See [contracts/README.md](contracts/README.md): no task consumes anything another task
produces.

## Open questions

None outside the Gate 2 decisions.
