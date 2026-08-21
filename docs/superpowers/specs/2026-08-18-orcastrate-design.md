# Orcastrate — Design Spec

**Date:** 2026-08-18
**Status:** Approved for implementation planning
**Scope:** MVP

Every claim this document makes about the Claude Code stream protocol has been
measured against `claude` 2.1.235 driven through
`@anthropic-ai/claude-agent-sdk` 0.3.235, and states the measured behavior
rather than the documented one. The per-fixture evidence lives in
`docs/protocol-findings.md` and `tests/fixtures/protocol/findings.json`; this
document does not repeat it.

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
| A Calf still open when its turn ended | **Orphaned** |
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
  PodManager          owns the set of live Pods; holds the EventStore
    PodRunner (xN)    one per open Pod; wraps one SDK query() session
      LaneRouter      splits the event stream into Matriarch + Calves
    EventStore        normalized append-only event log (SQLite) — ONE per
                      application, injected into PodManager and shared by
                      every Pod, not one per Pod
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
That callback takes **three positional arguments**, `(toolName, input,
options)`; `options` carries `agentID`, `toolUseID`, `requestId`, `signal`,
`suggestions` and the CLI's own display strings.

Per-Pod options:

- `cwd` — the Pod's working directory, chosen at creation, immutable thereafter.
- `resume` — the session id, set when reopening a persisted Pod. (The option is
  named `resume`, not `resumeSessionId`; this one was measured.) The SDK
  reference also documents `resumeSessionAt` for resuming at a specific message,
  `continue` for the most recent session, and `forkSession` to branch a resumed
  session into a new one instead of extending it — all three **documented in the
  SDK reference and not verified against CLI 2.1.235 by this session's probe**,
  which is the same source that was wrong about `acceptEdits`, `env`, and
  `parent_agent_id`. Confirm before building on any of them. See Backlog.
- `permissionMode` — user-selectable, restricted by Orcastrate to `default` |
  `plan` | `bypassPermissions`. This is a **product choice, not a platform
  limit**: the CLI accepts seven values — `default`, `plan`, `acceptEdits`,
  `bypassPermissions`, `dontAsk`, `auto`, `manual`. The three exposed modes are
  the ones whose consequences a Pod tab can honestly signal; `bypassPermissions`
  is gated behind a confirmation and a persistent warning badge. Widening the
  set later is a UI change, not a bridge change.
- `env` — **replaces** the subprocess environment; it is not merged over the
  inherited one. `PodRunner` must therefore pass
  `{ ...process.env, ...envOverrides }`, or the Pod's `claude` process launches
  with no `PATH` and nothing else it inherits today. This is the extension point
  for pointing a Pod at an alternate model backend (`ANTHROPIC_BASE_URL` /
  `ANTHROPIC_AUTH_TOKEN`, or the Bedrock/Vertex flags). MVP plumbs the
  overrides; no UI surfaces them (see Backlog).
- `forwardSubagentText: true` — required, and typed as a required literal. With
  it unset the CLI forwards a sub-agent's `tool_use` and `tool_result` blocks
  but none of its text or thinking, so every Calf lane renders empty of prose.

### 4.3 Lane routing

A Pod is a single event stream; the UI presents it as multiple lanes.

- Every Pod opens with one lane, the **Matriarch**.
- When an assistant message contains an **`Agent`** tool_use block, that block's
  `tool_use_id` opens a **Calf** lane, titled from the dispatch's
  `subagent_type` and `description`. (The dispatch tool is named `Agent` in CLI
  2.1.235, not `Task`, which is the name most documentation still uses. The
  router matches both.)
- A `system`/`task_started` message announces the same lane and carries its
  `task_id` — the agent ID (section 4.4) — correlated to the dispatch by its
  sibling `tool_use_id`. **`task_started` can arrive *before* the assistant
  message containing the `Agent` block that opens the lane**, so the router must
  be able to open a lane from either message, in either order, and must never
  drop a `task_started` whose `tool_use_id` it has not yet seen.
- Messages emitted by that sub-agent carry `parent_tool_use_id` referring back to
  the originating `tool_use_id`: `parent_tool_use_id == null` goes to the
  Matriarch, otherwise to the matching Calf.
- **Routing is a tree, not a flat map.** A Calf may itself dispatch, and depth 2
  is observed in practice. Depth is recovered by chaining `parent_tool_use_id`
  alone: a Calf's depth is one more than the depth of the message that emitted
  its opening `Agent` block. There is no second correlation field to read —
  `parent_agent_id` exists on the `SessionMessage` shape returned when reading a
  transcript back off disk, and **never appears on a streamed message**. MVP
  renders to `maxLaneDepth` 2.
- **A terminal `system`/`task_updated` closes the Calf and marks it `Done`** —
  *not* the dispatching tool_use's `tool_result`. Closing on the `tool_result`
  is not merely imprecise, it is wrong: for a background dispatch that
  `tool_result` arrives immediately and says only "Async agent launched
  successfully", so a router keyed on it retires the lane before the Calf has
  done any work.

**Sub-agents dispatch to the background by default.** A background dispatch
forwards *no* sub-agent messages at all — the parent stream sees `task_started`
and later `task_notification`, and nothing in between — so a Calf lane opened
from one has correct status and an empty transcript. `run_in_background: false`
must therefore be forced in the prompt for any dispatch Orcastrate intends to
render as a populated lane. This is the
single most load-bearing protocol fact in this document; `parent_tool_use_id`
correlation is a property of *foreground* dispatch only.

**Verified.** The `parent_tool_use_id` correlation these lanes rest on was an
assumption when this document was approved; it has since been measured against
CLI 2.1.235 and holds — every sub-agent-originated message carried the expected
id, no Matriarch message carried a non-null one, and two concurrent Calves
interleave rather than running to completion in turn. Lane routing is therefore
the shipping design, and the inline-region fallback this section previously
specified is **not** the design. `LaneRouter` still implements both branches,
because its frozen contract carries a `RoutingMode` and the store, persistence
model, and IPC surface are identical either way — the capability stays, but no
Orcastrate build selects the fallback, and none should without a fresh
measurement that overturns the one above. Evidence, per fixture and line, is in
`docs/protocol-findings.md`; the captures are the test corpus (section 9).

### 4.4 Persistence

SQLite in Electron `userData`.

- `pods` — id, title, cwd, cc_session_id, permission_mode, env_overrides (JSON),
  tab_order, created_at, last_active_at, status.
- `lanes` — id, pod_id, kind (`matriarch` | `calf`), tool_use_id, **agent_id**,
  **parent_lane_id**, **depth**, subagent_type, description, status, started_at,
  ended_at.
- `events` — id, pod_id, lane_id, seq, type, payload (JSON), created_at.

`parent_lane_id` and `depth` are in the first migration because routing is a
tree (section 4.3); a flat lanes table cannot represent a Calf that dispatched.

`agent_id` is distinct from `tool_use_id` and must be captured from day one.
`tool_use_id` correlates the stream; `agent_id` is the identifier `SendMessage`
and `TaskStop` address (see section 5.3). It is read from
`system`/`task_started`'s `task_id`, which is the earliest surface carrying it
and the only one present for both a nested Calf and a background Calf that never
returns. Capturing it later would require a schema migration and a re-parse of
stored events, so it is recorded even though MVP does not yet act on it.

Enumerated states, so the two tables agree with the lexicon:

- Pod status: `closed` | `idle` | `running` | `waiting` (on user input or a
  permission decision) | `beached`. Five values, because `idle` used to mean two
  different things — "a runner is live and between turns" and "there is no
  runner at all" — and a Pod that has never been opened, or has been closed, or
  has just come through the startup reconciliation of section 8, is `closed`.
  `status` alone is therefore authoritative about whether main holds a live
  runner: a Pod is open exactly when its status is `idle`, `running` or
  `waiting`. `beached` is also not-open, but unlike `closed` it carries a cause
  and its affordance is Reconnect rather than Open.
- Lane status: `running` | `done` | `orphaned`. `orphaned` covers two
  boundaries: a turn boundary (section 8) and a process boundary (section 8's
  startup-reconciliation row).

Orcastrate maintains its **own** normalized transcript and deliberately does not
parse `~/.claude/projects/*.jsonl` for history. That file is Claude Code's
internal format and may change without notice; depending on it would make
Orcastrate's history silently break on a CC upgrade.

Resume therefore runs on two tracks: Claude Code restores its own conversation
context from `resume`; Orcastrate restores the visible transcript from
its own store. The two are independent, and a mismatch degrades to "CC remembers
more than the UI shows", never to data loss.

Both routes back into a persisted Pod resume: **Open** (a `closed` Pod) and
**Reconnect** (a **Beached** one) each start against the stored
`cc_session_id`. They still differ in what they do to a session that is already
live — Open returns the open Pod untouched, Reconnect disposes the existing
runner first — but neither starts a fresh conversation over a Pod that has one.
The exception is a Pod that never reached its first turn and so has no
`cc_session_id`; there is nothing to resume, and it starts fresh.

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
- **Inline dispatch card.** At the point in the Matriarch transcript where an
  `Agent` dispatch fired, an inline card renders — "dispatched 3 agents" with per-agent status and
  click-to-jump. This preserves causality in the main narrative, which a purely
  detached lane list otherwise loses.

### 5.3 Steering and cancelling a Calf

**What Claude Code actually supports.** Addressing a running sub-agent is native.
The installed CLI (2.1.235) contains `SendMessage`, `TaskStop`, and `TaskOutput`.
A Task returns an **agent ID**; `SendMessage` with that ID as `to` delivers a
message to that agent, which treats it as normal task direction *including
mid-task course correction*. `TaskStop` cancels a running agent by ID. A stopped
or completed agent auto-resumes on receiving a `SendMessage`.

**Why Orcastrate does not use it directly in MVP.** These are model-facing
tools. The Matriarch calls them; the host process has no API to inject a tool
call into a Calf, and the Agent SDK exposes exactly one input stream per
session. Driving them from Orcastrate means having the Matriarch issue them on
the user's behalf, which is a design in its own right, not a wiring change.

**The tools are present in the TypeScript SDK.** All three — `SendMessage`,
`TaskStop`, `TaskOutput` — are advertised in the session's `system`/`init`
tool list and execute when called; an invocation attempt returned argument
errors from tools that exist, never `No such tool available`. This contradicts
the defect reported against `claude-agent-sdk-python` (issues #716 and #577),
which does not reproduce on the TypeScript SDK at 0.3.235. `TaskStop` takes
`task_id`, and the agent ID persisted in section 4.4 is exactly the value it
wants. Direct steering is therefore **available and deferred by choice**, not
blocked (see Backlog).

**MVP affordance — Steer.** A Calf lane offers a `Steer` action that prefills the
Pod composer with a message addressed to the Matriarch: "send this to agent
`<agent_id>`: …". This uses only the path MVP already has (the Matriarch decides
whether and how to relay), requires no new protocol, and degrades to an ordinary
user message if the Matriarch cannot comply. Upgrading Steer to a direct send
needs no data-model change — which is why `agent_id` is persisted now
(section 4.4).

**Security constraint.** No agent message, `SendMessage` included, ever
constitutes user consent for that agent. Relaying user text to a Calf cannot
clear that Calf's permission gate; permission decisions must reach the human via section 5.4.

### 5.4 Permission prompts

A tool-permission request raises an **inline card in the lane that asked**, not a
modal — a modal in a multi-Pod window blocks work unrelated to the request.
Options: Allow, Allow always, Deny with reason.

Placing the card in the *asking* lane requires the prompt to say which lane
asked. The CLI supplies this: the `canUseTool` `options` argument carries
`agentID` and `toolUseID` (section 4.2), which resolve to a lane by the same
correlation section 4.3 uses. Orcastrate's `PermissionPrompt` shape must carry
them through to the renderer — as frozen it does not, and a prompt without them
can only be rendered Pod-wide. Widening it is a required change, not an optional
one. `Allow always` writes a rule into
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
| Malformed NDJSON line | Skipped; the stream is not torn down. The SDK parses stdout itself and drops unparseable lines to its own logger, so Orcastrate never sees the raw line and cannot log it — the tolerance is real, the raw-line diagnostic is not available to us. Orcastrate's own tolerance applies one level up, to well-formed messages of unrecognized `type`. |
| Calf still open when the turn's `result` arrives | Marked **Orphaned** at that turn boundary rather than spinning indefinitely. Note this is *not* "a `tool_use` with no `tool_result`": CLI 2.1.235 answers every `tool_use` before `result`, including on interrupt, where it synthesizes an `is_error` result. The condition is a lane opened by `system`/`task_started` with no terminal `system`/`task_updated`. |
| Lane still open at process start | Marked **Orphaned** by the startup reconciliation sweep, which runs once at application start before any window exists. No Claude Code process survives an application restart, so a lane the store still records as `running` cannot ever reach `done` — the process that owned it is gone. Both Matriarch and Calf lanes are swept, every reconciled Pod keeps a durable `system` event naming what changed and why, and the Pod itself becomes `closed` (section 4.4) unless it was already **Beached**, which is left alone with its cause intact. The recovery is **Open**: opening the Pod puts its Matriarch lane back to `running`, so the sweep is reversible. Distinct from the turn-boundary row above, which orphans a Calf inside a live process; this row is about a process that no longer exists. |
| Claude Code refuses the stored `cc_session_id` at resume | The Pod opens as a **fresh** Claude Code session rather than failing or beaching: the runner is reaped, one retry runs with no `resume` option, and a durable `system` event (subtype `resume_fallback`) is appended to the Matriarch lane saying the previous conversation could not be resumed and this is a new one. Refusing to open would be worse than the loss of context, and a silent restart would be worse still — this is the one case where CC remembers *less* than the UI shows, so it is stated in the transcript. Narrow by construction: only a `RESUME_FAILED` raised when a `resume` id was actually supplied takes this path, so `CWD_MISSING` and `SPAWN_FAILED` still beach the Pod with their cause and never retry. A retry that itself fails beaches the Pod with the retry's cause and writes no notice. |
| Settings file unwritable | OS error surfaced; no partial write (atomic rename guarantees this). |
| Working directory missing at resume | Pod opens read-only in a **Beached** state with an explanation; the user may repoint or delete it. |

## 9. Testing

The bridge is the layer that carries risk and it is testable without an API key.

- **Router tests (primary).** Real NDJSON captured during the section 4.3 probe
  is stored as fixtures and replayed through the parser and `LaneRouter`.
  Assertions cover lane assignment, event ordering, interleaving of two
  concurrent Calves, nesting to depth 2, Calf close on the terminal
  `system`/`task_updated`, Orphaned detection (a lane open at `result`), and
  tolerance of malformed and unrecognized lines. The Orphaned fixture is a
  *background* dispatch, because that is the only way the real CLI produces an
  unclosed lane; an assertion phrased as "a `tool_use` with no `tool_result`"
  would pass against it vacuously while proving nothing.
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
   Orcastrate rather than by the Matriarch). **Reachable now** — all three
   steering tools exist and execute in the TypeScript SDK (section 5.3), and the
   `agent_id` they address is observable at lane open and persisted from the
   first migration, so this needs no migration and no protocol work. It is
   deferred on product grounds — the composer-prefill Steer covers the MVP case,
   and a host-issued send needs its own answer for how a user-authored message
   reaches an agent without becoming that agent's permission consent (section
   5.3, Security constraint).
7. Pod-to-Pod messaging. Claude Code routes cross-session messages through a
   local daemon (`~/.claude/daemon/`) holding a session roster and per-session
   named-pipe sockets with auth tokens. The protocol is undocumented and
   internal, so Orcastrate will not build against it; revisit only if a
   supported API appears.
8. **Pod branching via `forkSession`.** Resuming with `forkSession` continues a
   session into a *new* one instead of extending it, which maps cleanly onto
   "fork this Pod at its current state" — one conversation, two divergent Pod
   tabs, each with its own transcript. Nothing in the persistence model forbids
   it; what is missing is the UI and the `pods`-table bookkeeping for a branch's
   ancestry — and a check that the option behaves as described, since
   `forkSession` is **documented in the SDK reference and not verified against
   CLI 2.1.235 by this session's probe**. Verifying it is the first step of this
   item, not an assumption it may rest on.

## 11. Open questions for implementation

Both questions this section opened were settled by the protocol probe against
CLI 2.1.235, along with a third they implied, and the answers are folded into the
sections above. They are kept here with their resolutions because a reader may
arrive with the same doubts.

1. **Does `parent_tool_use_id` correlate as section 4.3 describes?** *Yes.*
   Lane routing ships; the inline-region fallback is retained as a router
   capability but is not the design. Nesting to depth 2 is distinguishable using
   that field alone (section 4.3).
2. **Does the TypeScript Agent SDK expose `SendMessage` / `TaskStop`?** *Yes,
   along with `TaskOutput`* — the defect reported against the Python SDK does
   not reproduce here (section 5.3). MVP behavior is unchanged; backlog item 6
   is reachable whenever it is wanted.
3. **Is an agent ID present in the stream at all?** *Yes* — on three
   independent surfaces, carrying the same value, for every Calf in the corpus
   (6 of 6), and it arrives with the lane rather than with the Calf's first
   output. The consequence matters more than the answer: `lanes.agent_id` is
   populated in practice for every Calf, including nested and background ones,
   not merely nullable-and-usually-set. Steer (section 5.3) therefore always has
   a value to interpolate, and its viability does not depend on a fallback for
   the missing-id case.
