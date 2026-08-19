# Orcastrate sub-session 1 — Protocol probe and bridge foundation

**Goal:** stand up the Electron/React/TypeScript project and build the Claude Code
bridge — `PodRunner`, `LaneRouter`, `EventStore` — against protocol behavior
captured from the real CLI rather than assumed from documentation.

## Context

The repository contains one commit: the approved design spec at
`docs/superpowers/specs/2026-08-18-orcastrate-design.md`. There is no code, no
build config, and no project conventions to infer.

Orcastrate MVP decomposes into three sub-sessions. This is the first, and it
gates the other two: design spec section 4.3 specifies a fallback rendering
(inline regions instead of Calf lanes) if `parent_tool_use_id` does not correlate
as assumed, and the UI sub-session cannot be decomposed until that is settled.

The inference pass found **five errors in the approved design spec** (section
"Spec corrections" below). All five are the documented SDK disagreeing with the
spec, not open choices. They are folded into the contracts so an implementer
reading only a contract cannot reintroduce them.

## Definition of done

1. `npm install`, `npm run build`, `npm run typecheck`, and `npm test` all
   succeed from a clean checkout on Windows, with `strict: true` and no `any`
   introduced to satisfy the contracts.
2. `npm run dev` opens a window whose `BrowserWindow` has `contextIsolation:
   true`, `nodeIntegration: false`, `sandbox: true`, rendering a placeholder with
   no Pod, lane, transcript, or composer UI.
3. `window.orcastrate` exposes exactly the `OrcastrateApi` shape from
   `contracts/ipc.ts` — no extra channels, no `ipcRenderer` reachable from the
   renderer, and every subscriber returns a working unsubscribe.
4. Six NDJSON fixtures plus `findings.json` exist under
   `tests/fixtures/protocol/`, captured from `claude` 2.1.235, containing no
   credential, token, or absolute home path.
5. `findings.json` answers both design-spec section 11 questions from observed
   behavior: whether `parent_tool_use_id` correlates, and whether the TypeScript
   SDK exposes `SendMessage` / `TaskStop`, each with quoted evidence.
6. `docs/protocol-findings.md` states each question, its answer, and the fixture
   file and line that evidence it.
7. `EventStore` persists `pods`, `lanes` (including `agent_id`, `parent_lane_id`,
   `depth` in the first migration), and `events`; `seq` is per-Pod, gap-free, and
   assigned in the insert transaction; `appendMany` is all-or-nothing; `migrate()`
   is idempotent.
8. `LaneRouter` implements the mode named by `findings.recommendedRoutingMode`,
   not the mode the design spec assumed, and `ingest()` never throws on any input.
9. In inline fallback mode, `lane_opened` / `lane_closed` are still emitted and
   `agentId` is still recorded, so the store, persistence model, and IPC surface
   are byte-identical to lanes mode.
10. The router does no I/O and is deterministic: replaying one fixture twice
    through freshly constructed routers yields identical output.
11. The fixture-replay suite covers all six design-spec section 9 assertions plus
    nesting and determinism, runs in the default `npm test`, and fails loudly if a
    named fixture is missing.
12. The assembled main-process pipeline delivers `PodRunner` → `LaneRouter` →
    `EventStore` → `push:podEvent` with ascending gap-free `seq`, no IPC handler
    ever rejects, and a permission prompt is settleable only by
    `permission:respond`.

## Scope

Project scaffolding; the throwaway protocol probe and its durable capture corpus;
`EventStore`; `PodRunner`; `LaneRouter`; the router test suite; main-process IPC
handlers and `PodManager` behind the frozen preload surface.

### Not in scope

All renderer UI — Pod bar, lane rail, transcript, composer, permission cards,
Steer (sub-session 2); Beachcomber and Helm (sub-session 3). `src/renderer/`
receives a placeholder in T1 and is untouched thereafter. Direct Calf steering
stays unimplemented: `sendToAgent()` returns `{ supported: false }` even if the
probe finds `SendMessage` available, per design spec 5.3.

## Assumptions

| Question | Answer | Rung | Evidence |
| --- | --- | --- | --- |
| SDK package name | `@anthropic-ai/claude-agent-sdk` | 3 | https://code.claude.com/docs/en/agent-sdk/typescript |
| Does streaming input mode exist as assumed? | Yes — `prompt` accepts `AsyncIterable<SDKUserMessage>`; exposes `interrupt()`, `setPermissionMode()`, `streamInput()` | 3 | ibid., "Streaming Input Mode" |
| `canUseTool` signature | `(request, { signal }) => Promise<CanUseToolResult>` | 3 | ibid., "Permission Callback" |
| Is `parent_tool_use_id` on SDK messages? | Yes, on `SDKUserMessage` and `SDKAssistantMessage`, "set for subagent messages" | 3 | ibid., "`parent_tool_use_id` Field" |
| Build tooling | electron-vite | 4 | No repo or doc evidence; Vite alignment with the React renderer, first-class main/preload/renderer separation |
| Test runner | Vitest | 4 | No repo or doc evidence; one transform pipeline serves build and test |
| Directory layout `src/{main,preload,renderer,shared}`, `tests/`, `probe/` | 4 | Greenfield repo; electron-vite documented default layout, extended |
| Package manager | npm with `package-lock.json` | 4 | No lockfile or config present; zero-config default |
| IPC failure as `IpcResult` envelope, never a rejected promise | 4 | Judgment: Electron IPC rejections lose error type across the bridge, so `IpcErrorCode` would not survive to the renderer |
| Router is pure, no I/O | 4 | Judgment, load-bearing: it is what lets T6 replay fixtures without SQLite or a live CLI, and why T5 and T6 are separable |
| `maxLaneDepth` default 2 | 4 | Judgment: the probe captures depth 2; deeper nesting is unbounded and the rail has no affordance for it |

## Spec corrections

**Status after T2 measured the real CLI (2.1.235).** The list below was derived
from the SDK documentation before any code ran. The probe tested each against
the binary. Where documentation and measurement disagree, **measurement wins** —
this section records the measured truth, not the original claim.

| # | Original claim | Verdict | Evidence |
| --- | --- | --- | --- |
| 1 | `forwardSubagentText: true` required | **Confirmed** | A/B control run: 4 subagent text blocks with it, 0 without |
| 2 | `permissionMode` has no `acceptEdits` | **WRONG** | The CLI's own rejection message enumerates `acceptEdits, auto, bypassPermissions, manual, dontAsk, plan`. Reproduced independently by the reviewer. The contract keeps three values by **product choice**, not because the others do not exist |
| 3 | Resume option is `resume` | **Confirmed** | Round-trip replay returned the same `session_id` |
| 4 | `env` replaces rather than merges | **Confirmed** | `INHERITED=[] PASSED=[probe-env-marker]` — a variable set on the probe's own process was absent from the child while the passed one arrived. (An earlier probe run reported the opposite from `PATHLEN`, which discriminated nothing because Git Bash rebuilds `PATH` for itself) |
| 5 | Routing needs a tree, via `parent_agent_id` | **Half wrong** | A tree is needed, but `parent_agent_id` never appears on the wire — it belongs to the disk-read `SessionMessage` shape. Depth is recovered by chaining `parent_tool_use_id` alone |

**Measured facts the documentation did not contain**, and which no correction
anticipated:

6. **Subagents run in the background by default.** A dispatch returns
   `{"isAsync":true,"status":"async_launched"}` and the turn ends having
   forwarded zero subagent messages. `run_in_background: false` must be forced in
   the prompt or **every Calf lane renders empty**. This is the single most
   load-bearing finding of the probe.
7. **The dispatch tool is named `Agent`, not `Task`**, in CLI 2.1.235.
8. **`canUseTool` takes three positional arguments** — `(toolName, input,
   options)` — not `(request, { signal })` as the Assumptions table records.
9. **`system/task_started` can precede the `assistant` tool_use that opens it**
   (observed in `02-nested-dispatch.ndjson`, line 7 before line 8). The router
   must tolerate a lane-open whose `tool_use_id` it has not yet seen.
10. **The CLI cannot emit a Calf with no `tool_result` at turn end.** Every
    `tool_use` is answered before `result`, including on interrupt (a synthetic
    `is_error` result). The Orphaned condition is instead *a lane opened by
    `task_started` with no terminal `task_updated` when `result` arrives*.

Items 6-10 are recorded in `tests/fixtures/protocol/findings.json`, which is the
channel T5 and T6 read.

Folded into the contracts; the design spec itself should be amended to match.

1. **`forwardSubagentText: true` is required** for subagent text to be forwarded
   as messages. Unset, Calf lanes receive nothing. Typed as a required literal
   `true` on `PodRunnerOptions`.
2. **`permissionMode` has no `acceptEdits`.** The SDK enum is
   `default | plan | bypassPermissions`.
3. **The resume option is `resume`**, not `resumeSessionId`.
4. **`env` replaces the subprocess environment** rather than merging; `PodRunner`
   must pass `{ ...process.env, ...envOverrides }` or every Pod launches without
   `PATH`.
5. **Design spec 4.3's flat map is wrong for nesting.** Nested subagents carry
   `parent_agent_id` alongside `parent_tool_use_id`; routing needs a tree.

## Contracts

Frozen at Gate 2. `contracts/events.ts` (normalized event, Pod, and Lane shape —
also consumed by sub-sessions 2 and 3) · `contracts/event-store.ts` ·
`contracts/lane-router.ts` (including `RoutingMode`) · `contracts/pod-runner.ts` ·
`contracts/ipc.ts` (the complete preload surface — also consumed by sub-sessions 2
and 3) · `contracts/fixture-corpus.md` (fixture layout, NDJSON format,
`findings.json` schema).

## Open questions

| Question | Who resolves it | When |
| --- | --- | --- |
| Does `parent_tool_use_id` correlate, and is nesting distinguishable from depth 1? | T2, from the capture | Before T5 starts; T5 stops and escalates if nesting is indistinguishable |
| Does the TypeScript SDK expose `SendMessage` / `TaskStop`? | T2, from an actual attempt | Before T4; does not change MVP behavior, only records the fact |
| Is an agent ID present in the stream at all? | T2 (`findings.agentId.observed`) | Before sub-session 2 is decomposed — if false, `lanes.agent_id` is permanently null and Steer has nothing to interpolate |
| ~~Is `bypassPermissions` exposed in the New Pod dialog?~~ | **Resolved at Gate 2** | The user chose to expose all three modes, with `bypassPermissions` behind a confirmation and a persistent warning badge on the Pod tab. The enum keeps all three values. The confirmation and badge are sub-session 2 scope; nothing in sub-session 1 changes. |
| What happens for tool calls needing approval that never reach `canUseTool`? | User, when sub-session 2 is decomposed | Not blocking here; T7 must only avoid hanging |
