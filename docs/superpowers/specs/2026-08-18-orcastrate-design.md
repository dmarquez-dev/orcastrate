# Orcastrate — Design Spec

**Date:** 2026-08-18
**Status:** Approved for implementation planning
**Scope:** MVP

## 1. Purpose

Orcastrate is a native desktop dashboard for Claude Code. It replaces the
single-terminal experience with a multi-session workspace: named, persistent
conversations organized as tabs, each exposing the sub-agents it dispatched as
individually inspectable views, plus GUI administration of Claude Code's
settings files and accumulated on-disk state.

The problems it solves:

1. Multiple concurrent Claude Code sessions are hard to track in terminals, and
   terminal tabs carry no meaningful title or status.
2. Sub-agent output interleaves into one scrolling stream, so it is difficult to
   follow what any single agent is doing.
3. Claude Code's settings live in hand-edited JSON across several locations.
4. `~/.claude/` accumulates session and cache directories with no built-in way to
   review or remove them.

Windows is the primary target. macOS and Linux are supported by the chosen stack
and are expected to work, but only Windows is validated for MVP.

## 2. Lexicon

Orcastrate uses a consistent orca-themed vocabulary for entities and for
exceptional states. Routine states stay literal, because they are scanned
constantly and must not require decoding.

| Concept | Name |
| --- | --- |
| A session/conversation with Claude Code | **Pod** |
| The top-level agent lane within a Pod | **Matriarch** |
| A sub-agent lane within a Pod | **Calf** |
| A Pod whose CC process died unexpectedly | **Beached** |
| A Calf whose `tool_result` never arrived | **Orphaned** |
| Leftover session directories and caches on disk | **Flotsam** |
| The cleanup panel | **Beachcomber** |
| The settings editor panel | **Helm** |

Routine statuses remain literal: `Running`, `Waiting`, `Idle`, `Done`. New
concepts introduced later should extend this scheme; new *steady* states should
not be themed.

## 3. Stack

- **Electron** — main process (Node) owns all filesystem access and child
  processes.
- **React + TypeScript** — renderer, view layer only.
- **`@anthropic-ai/claude-agent-sdk`** — the Claude Code bridge. The TypeScript
  SDK spawns the `claude` binary with `--output-format stream-json`, so
  Orcastrate inherits the user's real CLI installation, plugins, and settings
  rather than reimplementing them.
- **`better-sqlite3`** — local persistence in Electron `userData`.

Rejected alternatives and why: .NET MAUI has no Linux target, so cross-platform
later would mean rewriting the UI layer rather than retargeting. Tauri would
require hand-rolling the stream protocol in Rust. Driving the interactive TUI
through a PTY gives perfect fidelity but reduces output to an ANSI character
stream, making per-agent routing a screen-scraping problem.

**Security posture:** the renderer runs with `contextIsolation: true`,
`nodeIntegration: false`, and `sandbox: true`. All filesystem and process
capability is reached through a narrow, explicitly enumerated preload IPC
surface. The renderer never receives a path it can act on directly.

## 4. Architecture

### 4.1 Process layout

```
Electron main
  PodManager          owns the set of live Pods
    PodRunner (xN)    one per open Pod; wraps one SDK query() session
      LaneRouter      splits the event stream into Matriarch + Calves
      EventStore      normalized append-only event log (SQLite)
  AdminService        Beachcomber + Helm filesystem operations
  <-> IPC (preload, typed, enumerated)
Renderer (React)
  Pod bar -> Lane rail -> Transcript + Composer
  Beachcomber / Helm panels
```

### 4.2 PodRunner

Each Pod holds exactly one long-lived Agent SDK `query()` call in **streaming
input mode**: the `prompt` argument is an async generator that Orcastrate pushes
user messages into, so a single session spans many turns. Streaming input mode
is also the mode in which the `canUseTool` callback is available, so the
multi-turn session and the permission dialog are served by the same mechanism.

Per-Pod options:

- `cwd` — the Pod's working directory, chosen at creation, immutable thereafter.
- `resumeSessionId` — set when reopening a persisted Pod.
- `permissionMode` — `default` | `acceptEdits` | `plan`, user-selectable.
- `env` — an environment overlay merged over the inherited environment. This is
  the extension point for pointing a Pod at an alternate model backend
  (`ANTHROPIC_BASE_URL` / `ANTHROPIC_AUTH_TOKEN`, or the Bedrock/Vertex flags).
  MVP plumbs the overlay; no UI surfaces it (see Backlog).

### 4.3 Lane routing

A Pod is a single event stream; the UI presents it as multiple lanes.

- Every Pod opens with one lane, the **Matriarch**.
- When an assistant message contains a `Task` tool_use block, that block's
  `tool_use_id` opens a **Calf** lane, titled from the Task's `subagent_type`
  and `description`.
- Messages emitted by that sub-agent carry `parent_tool_use_id` referring back to
  the originating `tool_use_id`. Routing is therefore a map lookup:
  `parent_tool_use_id == null` goes to the Matriarch, otherwise to the matching
  Calf.
- The corresponding `tool_result` closes the Calf and marks it `Done`.

**Load-bearing assumption.** The `parent_tool_use_id` correlation is what makes
per-agent lanes possible, and it has not yet been verified against the installed
CLI (2.1.235). The first implementation task is a throwaway protocol probe: run
one Pod that dispatches two agents in parallel, capture the raw NDJSON, and
confirm the field's presence and semantics. The captured output becomes the test
fixture corpus (section 9).

**Fallback if the assumption fails.** Calves are not promoted to lanes; instead
the Task tool block renders as an expandable inline region in the Matriarch
transcript. This is a UI degradation, not a redesign — the event store, the
persistence model, and the IPC surface are unchanged.

### 4.4 Persistence

SQLite in Electron `userData`.

- `pods` — id, title, cwd, cc_session_id, permission_mode, env_overrides (JSON),
  tab_order, created_at, last_active_at, status.
- `lanes` — id, pod_id, kind (`matriarch` | `calf`), tool_use_id, **agent_id**,
  subagent_type, description, status, started_at, ended_at.
- `events` — id, pod_id, lane_id, seq, type, payload (JSON), created_at.

`agent_id` is distinct from `tool_use_id` and must be captured from day one.
`tool_use_id` correlates the stream; `agent_id` is the identifier `SendMessage`
and `TaskStop` address (see section 5.3). Capturing it later would require a
schema migration and a re-parse of stored events, so it is recorded even though
MVP does not yet act on it.

Enumerated states, so the two tables agree with the lexicon:

- Pod status: `idle` | `running` | `waiting` (on user input or a permission
  decision) | `beached`.
- Lane status: `running` | `done` | `orphaned`.

Orcastrate maintains its **own** normalized transcript and deliberately does not
parse `~/.claude/projects/*.jsonl` for history. That file is Claude Code's
internal format and may change without notice; depending on it would make
Orcastrate's history silently break on a CC upgrade.

Resume therefore runs on two tracks: Claude Code restores its own conversation
context from `resumeSessionId`; Orcastrate restores the visible transcript from
its own store. The two are independent, and a mismatch degrades to "CC remembers
more than the UI shows", never to data loss.

## 5. User interface

### 5.1 Shell

Three regions:

- **Pod bar** (top) — one tab per Pod showing the user-supplied title and a
  status indicator. Drag to reorder. `+` opens the New Pod dialog: title,
  working-directory picker, permission mode, optional env overrides. The title is
  Orcastrate's alone and is never sent to Claude Code.
- **Lane rail** (left, within the active Pod) — Matriarch pinned at top, Calves
  beneath. Each row shows agent type, description, status, elapsed time, and an
  unread indicator. A list rather than a second row of tabs: nesting tabs inside
  tabs makes it ambiguous which level owns the content region, and sub-agents are
  machine-created and bursty — a single fan-out can open eight lanes and retire
  them in under a minute, which would thrash a tab bar. A list row also carries
  live status; a tab carries roughly one dot.
- **Transcript + composer** (center) — the selected lane's messages, with the
  composer docked below.

### 5.2 Lane interaction rules

- **The composer is bound to the Pod, not the lane.** Not because sub-agents
  cannot receive input — they can (section 5.3) — but because *Orcastrate* cannot
  address a Calf directly. Only the Matriarch can. A per-lane composer would
  imply a direct channel that does not exist. Calf lanes are read-only.
- **Pin to split.** A lane may be pinned, which opens it in a split pane beside
  the current transcript instead of replacing it. This covers watching two agents
  at once without introducing a second tab level.
- **Inline dispatch card.** At the point in the Matriarch transcript where a Task
  fired, an inline card renders — "dispatched 3 agents" with per-agent status and
  click-to-jump. This preserves causality in the main narrative, which a purely
  detached lane list otherwise loses.

### 5.3 Steering and cancelling a Calf

**What Claude Code actually supports.** Addressing a running sub-agent is native.
The installed CLI (2.1.235) contains `SendMessage`, `TaskStop`, and `TaskOutput`.
A Task returns an **agent ID**; `SendMessage` with that ID as `to` delivers a
message to that agent, which treats it as normal task direction *including
mid-task course correction*. `TaskStop` cancels a running agent by ID. A stopped
or completed agent auto-resumes on receiving a `SendMessage`.

**Why Orcastrate cannot use it directly.** These are model-facing tools. The
Matriarch calls them; the host process has no API to inject into a Calf. The
Agent SDK exposes exactly one input stream per session.

**Known defect.** `SendMessage` is currently unavailable in SDK mode:
`claude-agent-sdk-python` issues #716 (the CLI emits an agent-ID hint, but the
tool is absent from the SDK toolset, so the caller gets
`No such tool available: SendMessage`) and #577 (agent-team variant). Both were
open as of 2026-08-18 and were observed on the Python SDK; the TypeScript SDK is
unverified. **MVP must not depend on this mechanism.**

**MVP affordance — Steer.** A Calf lane offers a `Steer` action that prefills the
Pod composer with a message addressed to the Matriarch: "send this to agent
`<agent_id>`: …". This uses only the supported path (the Matriarch decides
whether and how to relay), requires no new protocol, and degrades to an ordinary
user message if the Matriarch cannot comply. If the SDK gap closes, Steer is
upgraded to a direct send with no data-model change — which is why `agent_id` is
persisted now (section 4.4).

**Security constraint.** No agent message, `SendMessage` included, ever
constitutes user consent for that agent. Relaying user text to a Calf cannot
clear that Calf's permission gate; permission decisions must reach the human via section 5.4.

### 5.4 Permission prompts

A tool-permission request raises an **inline card in the lane that asked**, not a
modal — a modal in a multi-Pod window blocks work unrelated to the request.
Options: Allow, Allow always, Deny with reason. `Allow always` writes a rule into
the project's `.claude/settings.json` permissions, the same file the Helm panel
manages.

A Pod with a pending request shows a distinct badge on its Pod tab, so a
backgrounded Pod waiting on the user is visible without switching to it.
`Esc` interrupts the active Pod's current turn.

## 6. Beachcomber (cleanup)

Enumerates Claude Code's on-disk state, entirely in the main process.

- `~/.claude/projects/` — each directory name is decoded back to the original
  working directory path. Rows show decoded path, size, session count, and
  last-modified. A row whose decoded path no longer exists on disk is flagged as
  an **orphan**.
- Also covered: `~/.claude/shell-snapshots/`, `~/.claude/file-history/`,
  `~/.claude/paste-cache/`.

Rules:

- Multi-select with a preview of exactly what will be removed before any action.
- Deletion goes to the OS recycle bin via Electron `shell.trashItem`. Orcastrate
  never performs an unrecoverable recursive delete.
- Any directory backing a currently open Pod is hard-blocked from selection.

## 7. Helm (settings)

Form-driven editing of:

- `~/.claude/settings.json` (user scope)
- `<pod cwd>/.claude/settings.json` and `settings.local.json` (project scope)

Fields surfaced as forms: model, `permissions.allow` / `permissions.deny`, `env`,
and `crossSessionInbound` (`accept` | `hold` | `refuse`) — the policy governing
whether messages sent from another Claude Code session are delivered to this one,
held for review, or rejected. It is included because it is a genuine security
control that is otherwise only reachable by hand-editing JSON.
Hooks are exposed as a validated raw-JSON pane rather than a builder UI — a
partial builder would misrepresent what hooks can express.

Write safety:

- Writes are atomic: write to a temporary file in the same directory, then
  rename.
- A timestamped backup is taken before each write.
- The file is re-read and compared immediately before writing. If it changed
  since load, the user gets a conflict warning rather than a silent overwrite.
- Filesystem permission errors surface the underlying OS error verbatim.

`~/.claude.json` (global CLI config and MCP server entries) is out of MVP scope.

## 8. Failure handling

| Failure | Behavior |
| --- | --- |
| CC process exits unexpectedly | Pod marked **Beached** with exit code; a Reconnect action re-resumes from the last known `cc_session_id`. The transcript is Orcastrate's own, so nothing is lost. |
| Malformed NDJSON line | Logged with the raw line and skipped; the stream is not torn down. |
| Calf with no `tool_result` | Marked **Orphaned** at the next turn boundary rather than spinning indefinitely. |
| Settings file unwritable | OS error surfaced; no partial write (atomic rename guarantees this). |
| Working directory missing at resume | Pod opens read-only in a **Beached** state with an explanation; the user may repoint or delete it. |

## 9. Testing

The bridge is the layer that carries risk and it is testable without an API key.

- **Router tests (primary).** Real NDJSON captured during the section 4.3 probe
  is stored as fixtures and replayed through the parser and `LaneRouter`.
  Assertions cover lane assignment, event ordering, interleaving of two
  concurrent Calves, Calf close on `tool_result`, Orphaned detection, and
  malformed-line tolerance.
- **Beachcomber unit tests.** Directory-name decoding and orphan detection
  against a synthetic `~/.claude` tree, including paths with spaces and drive
  letters. Deletion is tested against an injected trash function; no test deletes
  real files.
- **Helm round-trip tests.** Load, modify, write, reload preserves unmanaged keys
  and formatting-insensitive equality, plus an explicit external-modification
  conflict case.
- **Renderer tests.** React Testing Library over the event reducer and lane rail.

No end-to-end harness in MVP.

## 10. MVP scope

**In:**

1. Persistent, resumable Pods with user-supplied titles.
2. Lane routing into Matriarch and Calves, with pin-to-split and inline dispatch
   cards.
3. Streaming transcript rendering and a Pod-bound composer.
4. Interactive permission prompts via `canUseTool`, and turn interrupt.
5. Steer action on Calf lanes (composer prefill addressed to the Matriarch).
6. Beachcomber cleanup panel.
7. Helm settings editor.

**Backlog (explicitly deferred):**

1. Adopting sessions started from the terminal by scanning `~/.claude/projects/`.
2. Full config manager: MCP server management, hooks builder, agent/skill
   browsing.
3. Per-Pod alternate model backend UI — the env plumbing exists in MVP; only the
   configuration surface is deferred.
4. Raw terminal pane per lane.
5. macOS and Linux validation.
6. Direct Calf steering and cancel (`SendMessage` / `TaskStop` issued by
   Orcastrate rather than by the Matriarch), gated on the SDK defect in section
   5.3 being fixed. `agent_id` is persisted in MVP so this needs no migration.
7. Pod-to-Pod messaging. Claude Code routes cross-session messages through a
   local daemon (`~/.claude/daemon/`) holding a session roster and per-session
   named-pipe sockets with auth tokens. The protocol is undocumented and
   internal, so Orcastrate will not build against it; revisit only if a
   supported API appears.

## 11. Open questions for implementation

1. Whether `parent_tool_use_id` is present and correlates as described in section
   4.3. Resolved by the first implementation task; the fallback is specified
   there.
2. Whether the TypeScript Agent SDK exposes `SendMessage` / `TaskStop`, or shares
   the defect reported against the Python SDK (section 5.3). MVP does not depend
   on the answer; it determines only whether backlog item 6 is reachable. Worth
   checking during the same probe, since the probe already dispatches sub-agents.
