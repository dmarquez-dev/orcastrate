# Protocol findings — what the real CLI actually does

Captured 2026-08-19 from `claude` 2.1.235 driven through
`@anthropic-ai/claude-agent-sdk` 0.3.235 on win32, in streaming input mode with
`forwardSubagentText: true`. Every claim below cites a line of a file in
`tests/fixtures/protocol/`. The machine-readable form of the same answers is
`tests/fixtures/protocol/findings.json`; the probe that produced both is
`probe/` and is throwaway.

Nothing here was inferred from documentation. Where the approved design spec and
the observed CLI disagree, the observation wins and is called out.

---

## Open question 1 — does `parent_tool_use_id` correlate?

> *Design spec 11.1 / 4.3: does every subagent-originated message carry a
> `parent_tool_use_id` matching the `Task` tool_use that opened it, so Calf
> lanes can be routed — or must we fall back to inline regions?*

### Answer: **yes. `recommendedRoutingMode` is `"lanes"`.** Design-spec 4.3's inline fallback is **not** required.

Evidence — `01-parallel-dispatch.ndjson`:

| Line | Message | Why it matters |
| --- | --- | --- |
| 3 | `assistant`, `message.id msg_011CeBHoaANeHxzXxS7ibjFc`, `tool_use` `Agent` id `toolu_01WX1FPH7kp2Umpa7GHKHcMe` | first Calf opened |
| 6 | `assistant`, **same `message.id`**, `tool_use` `Agent` id `toolu_014RozzngRfFYKEoprURtB63` | second Calf opened **in the same assistant turn** |
| 5, 9, 11, 15, 21, 22 | `parent_tool_use_id = toolu_…HKHcMe` | Calf A's own messages (6) |
| 8, 12, 14, 16, 17, 19, 20, 26, 27 | `parent_tool_use_id = toolu_…URtB63` | Calf B's own messages (9) |
| 3, 6, 25, 30, 31 | `parent_tool_use_id: null` | Matriarch messages, never attributed to a lane |
| 32 | `result`, `subtype: success` | terminal |

Every one of the 15 subagent-originated messages carried a `parent_tool_use_id`
equal to the id of the `Agent` `tool_use` that opened it, and no Matriarch
message carried a non-null one. The field appears on message types `assistant`
and `user`.

The two lanes are genuinely **interleaved**, not sequentially segregated:
reading the subagent messages in order (lines 5–27), the owning lane changes 7 times. A router that
buffered one Calf until the other finished would be wrong.

Two notes for the implementer, both of which cost a wasted capture to learn:

- **The dispatch tool is named `Agent`, not `Task`,** in CLI 2.1.235. Match on
  both names.
- **Subagents run in the background by default.** A background dispatch returns
  an "Async agent launched successfully" `tool_result` immediately and forwards
  **no** subagent messages at all — the parent stream sees only
  `system/task_started` and, later, `system/task_notification`. `parent_tool_use_id`
  correlation is therefore a property of *foreground* dispatch
  (`run_in_background: false`). Lanes still open for background Calves, but they
  carry no transcript. See `04-orphaned-calf.ndjson`.

### Nesting

Depth 2 was observed, and it is distinguishable from depth 1 **without**
`parent_agent_id`. Evidence — `02-nested-dispatch.ndjson`:

- Line 3: Matriarch's `Agent` tool_use `toolu_…12VzRDbq` (`brancher`),
  `parent_tool_use_id: null` → depth 1.
- Line 8: an `assistant` message with `parent_tool_use_id = toolu_…12VzRDbq`
  that itself contains an `Agent` tool_use `toolu_…rmaMsubr` (`leaf`).
- Lines 9–15: messages with `parent_tool_use_id = toolu_…rmaMsubr` → **depth 2**.
- Line 18: `tool_result` closing the depth-2 Calf, carried on a message whose
  own `parent_tool_use_id` is the depth-1 Calf.

Depth is recovered by chaining: a Calf's depth is one more than the depth of the
message that emitted its opening `tool_use`. `findings.nesting.distinguishableFromDepth1`
is `true`, so T5 does **not** need to escalate.

**Ordering hazard, and it is not hypothetical.** In `02-nested-dispatch.ndjson`
the `system/task_started` for the depth-2 lane arrives on **line 7**, *before*
the `assistant` message on line 8 that contains the `Agent` tool_use opening it.
The router must tolerate a lane-open announcement preceding its dispatch block —
it cannot assume the `tool_use` has already been seen when `task_started`
arrives, and it must not drop or defer a `task_started` whose `tool_use_id` is
still unknown. The same warning is in `findings.json` `fixtures[1].notes`.

**`parent_agent_id` does not exist on the wire.** It appears nowhere in any
capture. In the SDK's types it is a field of `SessionMessage` — the shape
returned by `getSessionMessages()` when reading a transcript from disk — not of
any member of the streamed `SDKMessage` union. **Spec correction 5 in the
session spec is therefore half wrong**: nesting does need a tree, but
`parent_tool_use_id` alone builds it; there is no second field to read.

---

## Open question 2 — does the TypeScript SDK expose `SendMessage` / `TaskStop`?

> *Design spec 11.2 / 5.3: are the steering tools reachable, or is direct Calf
> steering impossible?*

### Answer: **all three are available — `SendMessage`, `TaskStop`, and `TaskOutput`.**

Evidence, from an actual attempt, not from documentation:

1. **The session advertises them.** `01-parallel-dispatch.ndjson` line 1, the
   `system`/`init` message, lists in its `tools` array:
   `… "SendMessage" … "TaskOutput", "TaskStop" …`. Line 1 of every other
   fixture says the same.

2. **They execute.** The probe drove a session that called each one. Verbatim
   responses, quoted in full in `findings.steering.evidence`:

   - `SendMessage` →
     `{"success":false,"message":"No agent named 'user' is reachable.\nCheck the spelling, or use the agent ID from a background agent's spawn result."}`
     — the tool ran and rejected the *recipient*, and told us the recipient is
     an **agent ID from a spawn result**.
   - `TaskStop` → `InputValidationError: TaskStop failed due to the following issue: An unexpected parameter \`taskId\` was provided` … `this tool's input schema is: {… "task_id": {"description": "The ID of the background task to stop. Agent-team teammates and named background agents are also accepted by agent ID or name."} …}`
   - `TaskOutput` → `Task ID is required`

   All three are argument errors from a tool that exists. The string
   **`No such tool available` appears nowhere** in the attempt.

3. The CLI volunteers the same fact unprompted. The `tool_result` for a
   background `Agent` dispatch reads:
   *"Use SendMessage with to: '<agentId>' … to continue this agent."*

**This does not change MVP behavior.** Per design spec 5.3 and the session
spec's Not-in-scope, `sendToAgent()` still returns `{ supported: false }`. The
finding is recorded so the decision to leave it unimplemented is a choice rather
than a limitation, and so sub-session 2 knows the door is open.

---

## Third question — is an agent ID present in the stream at all?

> *If false, `lanes.agent_id` (spec 4.4) is permanently null and Steer (5.3) has
> nothing to interpolate.*

### Answer: **yes, and it is available for every Calf, at the moment the lane opens.**

`findings.agentId.observed` is `true`, `availableForEveryCalf` is `true` (6 of 6
Calves across the corpus). Three independent surfaces carry the *same* value:

| Surface | Where | Example |
| --- | --- | --- |
| `system`/`task_started` → `task_id`, correlated to the dispatch by the sibling `tool_use_id` | `01-parallel-dispatch.ndjson` lines 4 and 7; `06-permission-prompt.ndjson` line 4 | `a2dd230aec02c375a` |
| `tool_use_result.agentId` on the `user` message closing the `Agent` tool_use | `01-parallel-dispatch.ndjson` line 25 | `a2dd230aec02c375a` |
| `canUseTool` callback option `agentID` | run `06`, `Write` call `toolu_…NXJgQCh5` | `a3d3c9443c6195211` |

The same id also rides `task_progress`, `task_updated`, `task_notification` and
`background_tasks_changed[].task_id`, so a lane can be tracked by it throughout.

**Use `task_started.task_id`.** It is the earliest surface — it arrives with the
lane, before any Calf output — and it is the only one present for a background
Calf that never returns. `tool_use_result.agentId` is absent for nested (depth-2)
Calves; `task_started` is not.

Note the naming: it is `task_id` on stream messages and `agentId` /`agentID` on
the tool result and permission callback. Same value, three spellings.

---

## Corrections to the session spec's "Spec corrections", from observation

The inference pass got two of five wrong. Both are recorded in
`findings.optionsVerified` with the evidence.

| # | Session spec says | Observed | Evidence |
| --- | --- | --- | --- |
| 1 | `forwardSubagentText: true` is required for subagent text | **Confirmed.** With it, subagent `assistant` messages carried 4 `text`/`thinking` blocks; with it unset, 0. `tool_use`/`tool_result` are forwarded either way. | run `03` vs control run `x-no-forward` |
| 2 | `permissionMode` is `default \| plan \| bypassPermissions` — "no `acceptEdits`" | **Wrong.** The CLI accepts `default, plan, acceptEdits, bypassPermissions, dontAsk, auto, manual`. Verbatim rejection of a control value: `error: option '--permission-mode <mode>' argument '__probe_invalid__' is invalid. Allowed choices are acceptEdits, auto, bypassPermissions, manual, dontAsk, plan.` `default` is accepted as an alias and is what the SDK's `PermissionMode` type names. | each candidate passed to the real CLI |
| 3 | The resume option is `resume` | **Confirmed.** Resuming session `30f2c781-…` through `options.resume` returned a stream reporting the same `session_id`. | run `x-resume` |
| 4 | `env` **replaces** the subprocess environment | **Confirmed — it replaces.** `PodRunner` must pass `{ ...process.env, ...envOverrides }`. The probe set `PROBE_INHERITED` on its own process, passed `env: { PROBE_MARKER }` and nothing else, and the child shell reported `INHERITED=[] PASSED=[probe-env-marker] PATHLEN=2725`: the variable that was not passed is **gone**. | run `x-env` |
| 5 | Nested subagents carry `parent_agent_id` alongside `parent_tool_use_id` | **Wrong.** `parent_agent_id` never appears on a streamed message. The tree is built from `parent_tool_use_id` alone. | all captures |

One more, not in the spec's list: the SDK's `canUseTool` signature is
`(toolName, input, options)` — three positional arguments — not
`(request, { signal })` as the session spec's Assumptions table records. The
`options` object observed in run `06` carried
`agentID, blockedPath, decisionReason, description, displayName, requestId, signal, suggestions, title, toolUseID`.

---

## What the router must tolerate

- **Unknown message types.** The complete set of `type`/`subtype` values in the
  corpus is: `assistant`, `user`, `result/success`, `rate_limit_event`,
  `system/init`, `system/task_started`, `system/task_progress`,
  `system/task_updated`, `system/task_notification`,
  `system/background_tasks_changed`, plus the invented
  `quantum_flux/unknown_to_this_router` planted in `05-malformed.ndjson` line 15.
  Several of the real ones the design spec never names. (`thinking_tokens` is
  **not** a message type — the string occurs only inside
  `usage.output_tokens_details.thinking_tokens`.)
- **Truncated and non-JSON lines mid-stream.** `05-malformed.ndjson` lines 11
  and 13, with valid lines on both sides (10/12/14). The stream must survive,
  not end.
- **A lane that never closes.** `04-orphaned-calf.ndjson`: the lane opens at
  `system/task_started` (line 5) and the `result` arrives on line 8 with no
  terminal `system/task_updated` and no `system/task_notification`. The two
  lines in between are **not** nothing, and they are the whole point: line 6 is
  the `tool_result` answering the dispatching `Agent` tool_use — but it carries
  only the launch acknowledgement, *"Async agent launched successfully"*, not
  the Calf's work — and line 7 is the Matriarch's closing text. CLI 2.1.235
  always answers a `tool_use`, even on interrupt, so "orphaned" means *lane
  still open at `result`*, never *`tool_use` with no `tool_result`*. A router
  that closes a Calf on the dispatching tool_use's `tool_result` closes this
  lane at line 6 and any test asserting the latter passes vacuously. The same
  caveat, with the assertion to write instead, is in
  `findings.json` `fixtures[3].notes` and `tests/fixtures/protocol/README.md`.

---

## Fourth question — does the CLI actually honour the foreground-dispatch hook?

Asked after the fact (verification task A1), because `src/main/pod/options.ts`
relies on a `PreToolUse` hook to force subagent dispatch into the foreground and
nothing had ever checked that CLI 2.1.235 *invokes* that hook. If it does not,
every Calf lane in the product renders empty.

### Answer: **yes. The CLI invokes the hook and applies its `updatedInput`.**

Measured live by `probe/verify-foreground.ts`, which **imports the shipped
`buildSdkOptions`, `forceForegroundDispatch` and `FOREGROUND_DISPATCH_DIRECTIVE`
from `src/main/pod/options.ts`** — it is the product's own option object that
was driven, not a reconstruction. Four runs, one trivial dispatch each, with a
prompt that says **nothing** about `run_in_background`, so a foreground dispatch
cannot be an artefact of the prompt.

| Run | hook | directive | hook invoked | subagent messages forwarded | dispatch |
| --- | --- | --- | --- | --- | --- |
| shipped | yes | yes | 1 | 6 | **foreground** |
| control | no | no | 0 | 0 | background |
| hook only | yes | no | 1 | 6 | **foreground** |
| directive only | no | yes | 0 | 6 | **foreground** |

The decisive cell is **hook only** versus **control**: same prompt, same model,
the hook the only difference. In the hook-only run the CLI called the callback
with `tool_name: "Agent"` and the callback returned

```json
{"hookSpecificOutput":{"hookEventName":"PreToolUse","updatedInput":{"description":"Report current directory","prompt":"Report the current directory name and stop.","subagent_type":"leaf","run_in_background":false}}}
```

after which six subagent-originated messages arrived carrying
`parent_tool_use_id` of the dispatching `Agent` block. The control run's model
omitted `run_in_background` entirely, and its dispatch `tool_result` read

> `Async agent launched successfully. (This tool result is internal metadata …)`

with **zero** subagent messages — the same background behaviour recorded in
`04-orphaned-calf.ndjson`, reproduced here without anyone asking for it.

Two further observations:

- **In the shipped run the hook callback returned `{}` (no opinion).** That is
  correct, not a failure: the system-prompt directive had already made the model
  emit `run_in_background: false`, and `forceForegroundDispatch` declines to
  rewrite an input that is already right. The hook was still invoked, which is
  the fact under test.
- **The directive alone was sufficient in this sample** (`directive only` ran in
  the foreground). Treat that as a single observation of model behaviour, not a
  guarantee — it depends on the model choosing to comply. The hook is the
  deterministic lever; the directive is the belt to its braces, exactly as the
  code comment claims.

Machine-readable form: `findings.json` → `foregroundDispatch`. Raw streams:
`probe/evidence/foreground-*.ndjson` (throwaway, not part of the durable corpus,
so no `fixtures[]` entry and no test depends on them).
