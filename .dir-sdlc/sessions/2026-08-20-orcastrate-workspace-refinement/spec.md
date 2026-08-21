# Orcastrate workspace refinement (sub-session B)

Turn the hand-verified MVP workspace into one that is predictable to drive: a fixed
Matriarch pane, a transcript that shows the conversation, and affordances for the
three Pod operations that today have no caller.

## Context

The MVP shipped across three DIR sessions and was first driven by hand on 2026-08-20.
Nothing here is a defect: every item comes from that run or from the two verb questions
the backlog settled afterwards. Baseline at `cd2696b`, verified in this session's
worktree: **103 test files, 1562 tests, exit 0**.

Three things about the workspace made it harder to drive than it needed to be. Panes
swap unpredictably, because `selectedLaneId` and `pinnedLaneId` are interchangeable and
carry a never-equal invariant, so pinning the selected lane can only mean *swap*. The
transcript shows everything the CLI emits — **53 of 109 events were `system`** against
11 `assistant_text` on the first run. And four invoke channels have no affordance
calling them at all.

## Definition of done

**Pane model**

1. `PodSessionView` carries `primaryLaneId: LaneId`, `followerLaneIds: readonly LaneId[]`
   and `focusedFollowerIndex`; `selectedLaneId` and `pinnedLaneId` are gone with no
   compatibility alias, so every call site fails to compile until it is found.
2. `showLane` / `hideLane` replace `selectLane` / `pinLane` / `unpinLane`. Clicking a Calf
   already in a follower pane focuses it; clicking any other Calf replaces the focused
   follower in place. Neither opens a third pane.
3. Swap-on-pin is unreachable: pin lane B, select lane B, and the Matriarch is still
   `primaryLaneId`. The same sequence run against pre-session code is observed to swap.
4. `primaryLaneId === matriarchOf(lanes).id` and `followerLaneIds.length <= 1` hold after
   every action and every push, as **assertions** — no action writes `primaryLaneId`.
5. `WorkspaceLayoutProps` is unchanged; `split` is fed from `followerLaneIds[0] ?? null`.

**Transcript**

6. The default mode renders zero `system`, `thinking`, `lane_opened` and `lane_closed`
   events, and renders `error` and `malformed`. Against current code, all 53 render.
7. `error` and `malformed` are visible in **both** modes.
8. The toggle is always present in both panes, never disabled, and names its count in
   words ("Show 42 hidden system events").
9. Revealing restores events at their seq position, not appended at the end.
10. Filtering never changes `unreadEventCount`, `highWaterSeq`, or anything the state
    layer holds. `filterTranscriptEvents` returns a subsequence and never mutates input.
11. Each pane holds its own mode.

**Rail**

12. The Matriarch row has **no** pin control — absent, not disabled.
13. The pin control is an icon carrying `aria-pressed`, with an accessible name that
    differs between its two states.
14. Finished lanes collapse behind a counted disclosure and are absent from the DOM while
    collapsed; expanding restores them **in rail order**. Nothing is omitted from
    `PodSessionView.lanes`.
15. A lane never collapses if it is the Matriarch, is in a pane, has `awaitingPermission`,
    or has unread events.

**Pod chrome**

16. The tab carries **two distinct controls**: a run/stop control that is a **play** icon
    when the Pod is stopped and a **pause** icon when it is running, and a **red delete**
    control present *only* when the Pod is stopped. An opened Pod has no delete control in
    the DOM at all. Neither control is distinguished by colour alone — the delete
    affordance is asserted by accessible name, not by class or style.
16a. The stop control's accessible name reads "Stop &lt;title&gt;", not "Close" — the Pod row
    survives, and reopening resumes the conversation, which is what makes pause the honest
    icon.
17. The confirmation states that transcript history is removed permanently, and offers an
    optional session-file deletion that defaults off and is **absent** when
    `ccSessionId` is null.
18. A failed session removal keeps the dialog open with the error verbatim while the Pod's
    tab is already gone — `podDeleted: true` with `session: 'failed'` is a success envelope.
19. A beached Pod's run control is named "Reconnect &lt;title&gt;, stopped with an error";
    a closed Pod's is "Open &lt;title&gt;". Design §8's cause-carrying affordance survives.
20. `PodsChrome.tsx`'s claim that a beached Pod "answers `pods.open` with an error" is
    deleted; a wording test asserts the string appears nowhere under `src/renderer/**`.
21. Creating a Pod records exactly one invocation, `pods.create`, and zero `pods.open`.
    The new tab renders `'closed'` with a working Open control and the composer's existing
    `not-opened` sentence.

**Main**

22. `pods.delete` takes `DeletePodRequest` with a **required** `deleteSession` boolean and
    returns `PodDeletionResult`. The channel string `'pod:delete'` is unchanged.
23. `src/main/pod-session/**` implements `PodSessionRemover` against injected deps only —
    no `electron`, no `pod-manager`, no `store` import.
24. The session file resolves as `<claudeHome>/projects/<encoded cwd>/<ccSessionId>.jsonl`,
    encoding forward, never decoding.
25. All five removal outcomes are exercised against a temp tree and a recording fake, with
    `'trashed'` asserting the fake received the **file** path and not its parent directory.
26. The port never rejects; a rejecting `TrashItem` yields `{ outcome: 'failed', error }`.
27. Deletion order is asserted: Pod row deleted, then `TrashItem` — never the reverse.
28. `no-destructive-api.test.ts` is widened over `src/main/pod-session/**` and **watched
    failing** against a temporarily added `unlinkSync`.

**Whole suite**

29. `npx vitest run` green, `typecheck:node` and `typecheck:web` pass, final count stated
    against the 1562 baseline.
30. Every new assertion in `src/renderer/src/__tests__/**` is watched failing before it is
    trusted, and the task report states what was changed to make it fail.

## Scope

Items 1–7 of the backlog's sub-session B set: pane model, transcript noise filter, Pod
delete affordance, pinning UX, clearing finished lanes, Open-vs-Reconnect, and
create-always-starts.

### Not in scope

- Sub-session C — Helm and Beachcomber panel polish. Deferred by the user on 2026-08-20.
- Direct Calf steering (`SendMessage` / `TaskStop`). Reachable, not blocked; deferred for
  UX design that does not exist yet.
- The `RESUME_FAILED` regex breadth at `src/main/pod/errors.ts:63` and the inert
  `_UncoveredAtSchemaHead` twin at `src/main/store/schema.ts:210-212`. Both are live
  backlog items; neither is on this session's surface. T3 uses the **validated**
  `_AssertNever<T extends never>` spelling so this session adds no fourth inert guard.
- More than one Calf pane. The shape admits it; the policy asserts `length <= 1`.

## Assumptions

| Question | Answer | Rung | Evidence |
|---|---|---|---|
| Which state shape for the pane model? | `primaryLaneId` + `followerLaneIds`, not a boolean | 5 | Gate 1 decision, 2026-08-20; research in `resolved-unknowns.md` |
| Does the Matriarch-always-primary behaviour have prior art? | Yes — four Anthropic surfaces converge; the swap rule has none anywhere in the survey | 3 | `resolved-unknowns.md`, citations to sub-agents, agent-teams, desktop, workflows docs |
| Clear finished lanes by filtering the snapshot or the renderer? | Renderer-side collapse | 1 | `TranscriptPaneProps.lanes` is the registry every dispatch card's per-agent rows derive from; omitting done lanes silently degrades finished dispatch cards to count-only form |
| Are `error` and `malformed` "noise"? | No — visible in both modes | 1 | Spec 5.2 requires `malformed` renderable; the measured problem is `system` (53 of 109), so excluding two types costs nothing |
| Which `_AssertNever` spelling? | Generic-constraint, per `src/main/store/schema.ts` | 1 | T0 of the last session proved the empty-array-literal form never fires |
| Can optional props be used across concurrent tasks? | Yes, with criteria that make an absent control a failure | 1 | `renderer-view.ts` already made this concession for `panelBar`/`panel` |
| Does deleting a session file need a new deletion primitive? | No — `TrashItem` takes a path and `shell.trashItem` accepts files | 1 | `src/main/beachcomber/`; the one-deletion-capability invariant is asserted by a source scan |
| Is the cwd→directory encoding safe to compute? | Yes, forward only | 1 | `src/main/beachcomber/paths.ts` — decoding is ambiguous by construction |

## Contracts

- `contracts/renderer-panes.ts` — items 1, 4, 5. The amended state and view seams, the
  four-branch `showLane` resolution order, the `LaneRowVm` fields, the finished-lane
  partition with its four never-collapse rules, three new test ids.
- `contracts/pod-deletion.ts` — item 3. `DeletePodRequest` / `PodDeletionResult`, the
  five-outcome `PodSessionRemovalOutcome`, the `PodSessionRemover` port, the two IPC error
  cases, the ordering rule, and the dialog's required copy.
- `contracts/pod-verbs.ts` — items 6 and 7. The Open-vs-Reconnect decision with its
  evidence, `runControlFor`, and the full invocation map.
- `contracts/transcript-filter.ts` — item 2. Three event-type sets partitioning
  `EventType`, `filterTranscriptEvents` / `hiddenEventCount` with subsequence guarantees.

## Open questions

Four were carried to Gate 2. **The first three were answered there on 2026-08-20 and are
recorded as decided; only the fourth remains open.** Gate 2 also added a fifth decision the
user raised unprompted — the play/pause/delete iconography now in definition-of-done items
16 and 16a, folded into T4 rather than deferred because T4 already owns that surface.

1. **Session deletion targets one file, not the project directory.** The backlog says
   "removing a directory under `~/.claude/projects/`". That directory is keyed by working
   directory, not by Pod, and holds one `<sessionId>.jsonl` per session ever run there —
   other Pods' and the user's own CLI sessions included. The manifest specifies trashing
   `<ccSessionId>.jsonl` alone. *Resolved by: the user, at Gate 2.*
2. **Open and Reconnect both survive.** Three ranked options in the architect's report;
   the manifest encodes option 1. *Resolved by: the user, at Gate 2.*
3. **Create no longer opens, with no "Create and open" checkbox.** Changes a behaviour the
   user had yesterday. *Resolved by: the user, at Gate 2.*
4. **How often Calf-vs-Calf comparison actually happens** — the one fact that decides
   whether reserving the primary pane ever bites. Measurable only from this project's own
   session logs, and unresolved by the research round. *Resolved by: use, not this session.
   The list shape is what keeps the answer cheap either way.*
