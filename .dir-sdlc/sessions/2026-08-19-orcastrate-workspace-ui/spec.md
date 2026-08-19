# Orcastrate workspace UI (sub-session 2)

Build the UI a user actually touches — app shell, Pod bar, lane rail, transcript,
composer, permission cards — on top of the preload surface sub-session 1 froze.

## Context

Sub-session 1 shipped the whole main process: the SQLite `EventStore`, the
`PodRunner` (one long-lived SDK session per Pod), the `LaneRouter` that splits a
Pod's stream into a Matriarch lane and Calf lanes, the IPC handlers, and the
`window.orcastrate` preload bridge. What it did not ship is any UI:
`src/renderer/src/App.tsx` is a 33-line placeholder whose own docblock says not
to grow it.

The frozen `contracts/ipc.ts` from that session is the complete, explicitly
enumerated capability list for the renderer — `contextIsolation: true`,
`nodeIntegration: false`, `sandbox: true`. Anything not in that file is not
reachable from the renderer, and no method in it accepts or returns a filesystem
path the renderer may act on.

This session renders spec section 5 against that surface, and carries four
decisions the previous session's Gate 3 settled (see Scope).

## Definition of done

**Shell and Pods**

1. The app window shows a Pod bar across the top, a lane rail on the left, a
   transcript in the center, and a composer docked below it.
2. The Pod bar shows one tab per Pod with its user-supplied title and a status
   indicator; tabs drag to reorder, and the new order is committed through
   `pods.update`'s `tabOrder`, reverting to server order if that call fails.
3. `+` opens the New Pod dialog collecting title, working directory, permission
   mode, and optional env overrides. The directory is obtained only through
   `dialog.pickDirectory` — there is no editable `cwd` input in the dialog — and
   a cancelled pick is not an error.
4. The dialog offers exactly four permission modes: `default`, `acceptEdits`,
   `plan`, `bypassPermissions`.
5. A Pod with a pending permission request shows a badge on its tab that is
   visible while a *different* Pod is active.

**Lanes and transcript**

6. The lane rail is a list, not a second tab row, with the Matriarch pinned at
   index 0 and Calves beneath, each row showing agent type, description, status,
   elapsed time, and an unread indicator.
7. A `LaneChangedPush` replaces the lane list wholesale — it is a snapshot, not
   a delta, and a push omitting a known lane removes that row.
8. The transcript renders the selected lane's events in ascending `seq`, with no
   duplicate `seq`, merging paged backfill from `events.read` with live
   `push:podEvent` batches. Every `EventType` in the frozen union renders,
   including `malformed` (raw line shown, not skipped) and `error`.
9. An inline dispatch card renders in the Matriarch transcript at the point the
   dispatch fired, showing "dispatched N agents" with per-agent status and
   click-to-jump. It is detected by `payload.dispatchedLaneId !== undefined`,
   never by tool name.
10. Pinning a lane opens it in a split pane beside the current transcript rather
    than replacing it. The split pane has no composer of its own.

**Composer and permissions**

11. The composer is bound to the Pod, not the lane: selecting a Calf lane leaves
    its text and enabled state unchanged. Calf lanes are read-only.
12. `Esc` interrupts the Pod's current turn and does not clear the draft.
13. `Steer` on a Calf lane with an `agentId` prefills the composer with a message
    addressed to the Matriarch and sends nothing.
14. A permission request raises an inline card **in the lane that asked** —
    in document flow, not a modal, not an overlay, not a focus trap. Options are
    Allow, Allow always, and Deny with reason; Deny is disabled until the reason
    holds non-whitespace text.
15. A card is removed only by a `permissionResolved` push for its `requestId`,
    never optimistically. Outcome `aborted` clears it silently with no error.

**Correctness and hygiene**

16. `src/renderer/src/state/**` is the only place in the renderer that
    references `window.orcastrate`, enforced by a test over the source tree.
17. No renderer action rejects or throws: every invoke failure surfaces as
    `{ ok: false, error }`, and a preload promise that rejects outright becomes
    `INTERNAL` rather than an unhandled rejection.
18. Every `on*` subscription is unsubscribed on unmount, asserted by mounting,
    unmounting, and checking each `Unsubscribe` ran exactly once.
19. No file under `src/renderer/**` imports a `node:` builtin, `electron`, or
    `better-sqlite3`; no file outside `styles/` carries a hardcoded color, font
    stack, or `px` font-size.
20. `npm test` and `npm run typecheck` pass.

**The four carried decisions**

21. `system/task_progress` routes to the Calf named by its `tool_use_id`, with a
    Matriarch fallback when that resolves to no lane. Every other `system`
    subtype keeps its current Matriarch routing — `task_started` especially,
    since moving it would force premature lane materialization.
22. The `bypassPermissions` badge reads exactly "This Pod will never ask you
    about anything." — true, because the SDK shadows `canUseTool` entirely in
    that mode and such a Pod raises no cards at all. Generic danger wording
    fails this item.
23. `docs/known-issues/canusetool-attribution-race.md` documents the ordering
    race as a known limitation, quotes the exact `#attributePrompt` warning that
    is its only observable signal, and names both out-of-scope real fixes. No
    attribution behavior changes and no test pretends to cover it.
24. `PermissionMode` is four values across the contract, the runtime guard, the
    IPC validator, and the SQLite `CHECK` constraint — the last via a **new
    migration 2**, with `MIGRATION_1`'s DDL pinned to the literal three-mode list
    it shipped with.

## Scope

**In:** everything in the definition of done — spec section 5 in full, plus the
four decisions carried from the previous session's Gate 3, plus the
`PermissionMode` widening those decisions require.

### Not in scope

- **Beachcomber and Helm.** `OrcastrateApi.beachcomber` and `.helm` stay
  `?: never`. Populating them is sub-session 3 and would be a contract change.
- **Direct Calf steering.** `SendMessage` / `TaskStop` issued by Orcastrate
  rather than by the Matriarch. Reachable, deferred on product grounds; MVP
  ships composer-prefill Steer only.
- **Fixing the `canUseTool` ordering race.** Both real fixes — awaiting
  ingestion of the owning dispatch, or parking the prompt until the lane
  materializes — are behavior changes. This session documents the race and
  changes nothing.
- **Any new runtime dependency.** `dependencies` stays exactly
  `@anthropic-ai/claude-agent-sdk` and `better-sqlite3`. Two test-only
  devDependencies are added.
- **Exposing every CLI permission mode.** The CLI accepts seven; Orcastrate
  exposes four by product decision. The others stay rejected, and the negative
  test coverage is re-pointed at one of them rather than deleted.

## Assumptions

| Question | Answer | Rung | Evidence |
|---|---|---|---|
| Does the renderer have a styling convention? | No — no CSS file, no CSS-in-JS, no Tailwind anywhere. Use CSS Modules plus one global token sheet; add no styling dependency. | 1 | `src/renderer/` holds only `index.html`, `main.tsx`, `App.tsx`; `App.tsx` uses inline styles and says not to grow it |
| How do renderer component tests run? | Per-file jsdom opt-in via `// @vitest-environment jsdom`, exactly as the repo already instructs. `vitest.config.ts` is not edited. | 1 | `vitest.config.ts` docblock; its `include` already covers `*.test.tsx`; `jsdom` 30 installed |
| Is `@testing-library/react` available? | No — adding it and `user-event` as devDependencies completes a convention the repo already declared. | 1 | `package.json` devDependencies |
| Can a permission card render in the asking lane? | Yes, with no contract change. Spec 5.4 calls this widening "required", but it was already applied. | 1 | `PermissionRequestedPush` in frozen `ipc.ts` carries `laneId` |
| Is there a state-management library? | No. React primitives only; pushes already deliver snapshots. | 1 | `package.json` dependencies are the SDK and `better-sqlite3` |
| How do renderer files reach the frozen contracts? | The `@shared/*` alias. | 1 | `tsconfig.web.json` `paths`; `vitest.config.ts` `resolve.alias` |
| Where do renderer contracts and tests live? | `src/renderer/src/contracts/` and `src/renderer/src/__tests__/`, not `src/shared/` or `tests/` — both of those are inside `tsconfig.node.json`'s include, and a file importing `react` there fails `typecheck:node`. | 1 | `tsconfig.node.json` include list |
| How is the dispatch card detected? | By `payload.dispatchedLaneId !== undefined`, never by tool name — the tool is `Agent` on CLI 2.1.235 and `Task` on older ones. | 1 | `src/shared/contracts/events.ts:184` |
| How far does the `PermissionMode` widening actually reach? | Four places, not three: the contract, `src/main/pod/options.ts`, `src/main/ipc/validate.ts`, and the SQLite `CHECK` constraint — which needs a new migration, because `MIGRATION_1`'s DDL interpolates `PERMISSION_MODES` and would otherwise be silently rewritten. | 1 | `src/main/store/schema.ts:32,57,89`; `MIGRATIONS` docblock at :151 "Append new entries; never edit a shipped one" |

## Contracts

Three drafts, frozen at Gate 2. They are the seams *between this session's
tasks*; the preload surface itself is `ipc.ts`, already frozen, and is imported
rather than restated.

- `contracts/renderer-state.ts` — what T5 produces and T4/T6/T7 consume:
  `ActionResult` (never rejects), `Loadable`, `PodTabVm`, `LaneRowVm`,
  `TranscriptView` (ascending-`seq`, deduped, append-stable), `BackfillState`,
  `PermissionCardVm` and its removal rule, `ComposerState`, `steerPrefill`,
  `WorkspaceActions`, and the focused hooks.
- `contracts/renderer-view.ts` — component seams: `WorkspaceLayoutProps`,
  `PodBarProps`, `NewPodDialogProps`, `PERMISSION_MODE_OPTIONS` (four modes),
  `BYPASS_PERMISSIONS_WARNING`, `LaneRailProps`, `TranscriptPaneProps` (with the
  `permissionSlot` that lets T7's cards nest inside T6's transcript),
  `DispatchCardProps`, `ComposerProps`, `PermissionCardListProps`, and
  `TEST_IDS` — the seam that lets T8 write tests without seeing the markup.
- `contracts/renderer-theme.ts` — `TOKENS`, the CSS-Modules-only rule,
  `statusToken`.

## Open questions

One, and it is the escalation carried into Gate 2 rather than an unresolved
item: **widening `PermissionMode` to four values.** It is a change to a contract
frozen by a previous session, and its blast radius includes a SQLite migration.
Resolved by the user at Gate 2, before any dispatch. T1's first acceptance
criterion instructs the implementer to stop and report if it was not approved.
