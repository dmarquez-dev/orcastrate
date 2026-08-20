# Resolved unknowns — 2026-08-20-orcastrate-workspace-refinement

## U1. Pane model: fixed-primary vs interchangeable panes

**Status:** researched at the user's direction during sub-session A's Gate 1; the
decision itself is an escalation and belongs to this session's Gate 2.

**Question.** Should the Matriarch always occupy the primary pane, with one
toggleable Calf pane beside it, replacing today's `selectedLaneId` /
`pinnedLaneId` pair and its swap-on-pin rules?

**Verdict from the research round: adopt the proposed *behaviour*, reject the
proposed *state shape*.**

### Evidence for the behaviour

Four Anthropic surfaces independently converge on one-orchestrator-plus-one-viewed-worker:

- Claude Code CLI subagent panel — one row for the main session, one per fork,
  a single transcript view, and an explicit "path back to `main`".
  https://code.claude.com/docs/en/sub-agents
- Claude Code agent teams — default moved from per-teammate split panes to
  in-process (rail + one viewed teammate) at v2.1.179. Also documents, under
  Limitations: "**Lead is fixed**: the main session is the lead for its
  lifetime. You can't promote a teammate to lead or transfer leadership."
  https://code.claude.com/docs/en/agent-teams
- Claude Desktop Code tab — the tasks pane is the rail and "Click any entry to
  see its output in **the** subagent pane". One follower.
  https://code.claude.com/docs/en/desktop
- `/workflows` — scales to 1,000 agents and still renders a drill-down
  hierarchy, not tiles. https://code.claude.com/docs/en/workflows

Role asymmetry is the textbook trigger for a fixed role, and Orcastrate's is
total: the composer is Pod-bound and Calf lanes are read-only. Microsoft's
peer-comparison guidance states it directly — "Don't allow users to edit or
markup changes across both screens in a dual view"
(https://learn.microsoft.com/en-us/dual-screen/design/dual-view) — and VS Code
reached the same place independently, omitting the composer from subagent chats
"so the worker transcript stays view-only".
https://code.visualstudio.com/docs/copilot/agents/subagents

**The swap rule has no prior art anywhere in the survey.** Where a rail
selection must resolve against an existing split, the shipped answer is
uniformly focus-based replacement — Claude Desktop: "While the split is active,
clicking another sidebar session replaces whichever pane has focus"; JetBrains:
"If focus is in the left split, the file will be opened in the existing right
split". Deleting swap is worth doing on its own merits.

### Evidence against reserving the slot — the honest counter-case

- **No tool with a real orchestrator gives it a structurally undisplaceable
  pane.** Warp has a true parent/child model and has the parent and children
  *time-share one pane*, with the parent pill as a return target.
  https://docs.warp.dev/platform/orchestration/ Antigravity uses `Esc` to
  teleport back to the primary thread. Every real implementation of "the
  orchestrator is always available" is a **navigation guarantee**, not a
  **layout constraint**.
- **The two closest analogues tile read-only worker transcripts as peers.**
  VS Code's Agents window lets subagent chats be dragged into horizontal or
  vertical groups; Cursor 3.1 shipped tiling whose stated purpose is to
  "compare outputs across agents". https://cursor.com/changelog/3-1
- **Free-form models grow stability bolt-ons, and that is the better-tested
  direction.** VS Code's answer to unwanted replacement was per-view pinning —
  any slot can opt into stability — not a reserved pane #0.

### The state shape to adopt instead of a boolean

`pinnedLaneId: LaneId | null` → `boolean` is the one move to avoid: a boolean
cannot represent two Calves, so growth to N means a *second* contract amendment
and a *second* round of test rewrites. Three systems converge on the shape that
does not have that problem — VS Code's ordered `ViewColumn`s plus relative
`Active`/`Beside`, Zellij's layouts selected by pane *count*
(https://zellij.dev/documentation/swap-layouts.html), and Claude
Desktop/JetBrains focus-relative replacement:

```ts
/** The lane in the primary pane. Non-null. Today: always the Matriarch. */
primaryLaneId: LaneId;

/** Lanes in follower panes, in display order. Today: length 0 or 1. */
followerLaneIds: readonly LaneId[];
```

- The `pinnedLaneId !== selectedLaneId` invariant becomes ordinary list
  uniqueness: no lane appears twice. Adding an already-visible lane focuses it
  rather than duplicating it — one rule, at any N.
- Today's policy is two assertions, not two shapes:
  `primaryLaneId === matriarchLaneId` and `followerLaneIds.length <= 1`.
- Selection rule: clicking a Calf replaces the *focused* follower. At length 1
  that degenerates to "clicking a Calf updates the Calf pane, always".
- Growing to N is a cap change plus an active-follower index. No contract
  amendment, no invariant change; existing tests still hold at length 1.
- Past ~4 followers, collapse rather than tile — the pattern agent teams,
  `/workflows`, and Zellij's stacked panes all use.
- `WorkspaceLayoutProps`' `primary` / `split` slots survive unchanged; `split`
  becomes `followerLaneIds[0]`.

### Open questions the research could not settle

1. How often Calf-vs-Calf comparison actually happens in Orcastrate — measurable
   only from this project's own session logs, and the single fact that decides
   whether the reserved slot ever bites.
2. Why agent teams' default moved from split panes to in-process at v2.1.179.
   The changelog states the change, not the reason; the docs note split panes are
   unsupported in VS Code's integrated terminal, Windows Terminal, and Ghostty,
   so portability may be the whole story.
3. Whether "pin" is simply the wrong word. Cursor uses it for rail ordering,
   VS Code for "prevent replacement"; no surveyed tool uses it to mean what
   Orcastrate means. **Judgment, not fact** — but a plausible contributor to the
   unpredictability, independent of the underlying model.

### Addendum — second research stream

Corroborates the above and adds one synthesis point worth carrying into Gate 2:
**neither model ships pure anywhere in the survey.**

- VS Code started free-form for editors and **retrofitted** stability twice
  because free-form kept evicting what the user wanted kept. The v1.60 origin
  story is explicit: terminals moved into the editor area and "By default, files
  open in the active editor group, which meant terminals would be hidden even
  when active." Locked groups were the answer, and their state "is persisted and
  restored across restarts". https://code.visualstudio.com/updates/v1_60
  Pinned tabs (v1.46) solve the sibling problem at tab level.
  https://code.visualstudio.com/updates/v1_46
- vim, otherwise free-form, carves out a singleton role-typed window: "There can
  be only one preview window (per tab page)", with `'previewheight'` and
  `'winfixheight'`. https://vimhelp.org/windows.txt.html
- tmux ships `main-vertical` **alongside** `tiled` and `even-*`, not instead of
  them. https://man.openbsd.org/tmux.1
- Microsoft's `TwoPaneView` names the question a fixed primary actually answers:
  `PanePriority` "specif[ies] which pane is shown when there is space for only
  one pane." A free-form model has no way to answer it.
  https://learn.microsoft.com/windows/apps/develop/ui/controls/two-pane-view
- Apple's split view is explicitly asymmetric and causal — "changes in one view
  controller drive changes in the content of another" — and is a master-detail
  control, not a peer-comparison one.
  https://developer.apple.com/documentation/uikit/uisplitviewcontroller
- NN/g confirms peer comparison is a genuine, working-memory-bound need that
  master-detail does not satisfy: "Comparison is one of the most critical
  activities users perform on the web", and "Human short-term memory is limited".
  https://www.nngroup.com/articles/comparison-tables/

**Correction to a premise in the research brief:** the phrase "main pane" does
not appear in Zellij's documentation. The fixed-primary *structure* is real and
shipped in `default.swap.kdl` — `children` in the large slot with secondaries
beside it — but the vocabulary is not Zellij's.
https://github.com/zellij-org/zellij/blob/main/zellij-utils/assets/layouts/default.swap.kdl

**Why this strengthens rather than weakens the recommendation.** The
`primaryLaneId` + `followerLaneIds[]` shape is the one that lets Orcastrate sit
where every mature tool actually sits — a default arrangement plus a relaxable
policy — instead of committing to either pole. A boolean commits to one pole
permanently.
