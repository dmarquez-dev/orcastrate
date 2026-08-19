# Protocol fixture corpus — provenance

Real output from the real CLI. Nothing here was hand-authored except the
corruptions in `05-malformed.ndjson`, which the contract explicitly permits.

| | |
| --- | --- |
| Captured | 2026-08-19 (UTC), `findings.capturedAt` is authoritative |
| CLI | `claude` 2.1.235, a user-local install resolved from PATH at `<HOME>/.local/bin/claude.exe` (written with the `<HOME>` placeholder per fixture-corpus.md §2) |
| SDK | `@anthropic-ai/claude-agent-sdk` 0.3.235 |
| Node | v25.2.1 |
| OS | Windows 11 Pro 10.0.26200 (`process.platform === 'win32'`) |
| Model | `claude-sonnet-5` for the Matriarch, `haiku` for the trivial Calves |
| Command | `PROBE_SCRATCH=<scratch> node probe/run-probe.ts` |
| Session options | `forwardSubagentText: true`, streaming input mode, `settingSources: []`, `cwd` = an empty scratch directory |

Format and redaction rules: `src/shared/contracts/fixture-corpus.md` §2.
Machine-readable answers: `findings.json` (§3).
Narrative: `docs/protocol-findings.md`.

## Files

| File | Lines | Calves | Max depth | What it is |
| --- | --- | --- | --- | --- |
| `01-parallel-dispatch.ndjson` | 32 | 2 | 1 | two Calves opened by **two `Agent` tool_use blocks of one assistant message** (`message.id msg_011CeBHoaANeHxzXxS7ibjFc`, lines 3 and 6), messages interleaved (7 lane switches across lines 5–27) |
| `02-nested-dispatch.ndjson` | 24 | 2 | 2 | depth 2: the `Agent` tool_use on line 8 is itself inside a message with a non-null `parent_tool_use_id` |
| `03-tool-result-close.ndjson` | 20 | 1 | 1 | one Calf opening and closing normally |
| `04-orphaned-calf.ndjson` | 8 | 1 | 1 | a **background** dispatch — see the caveat below |
| `05-malformed.ndjson` | 23 | 1 | 1 | `03` with line 11 truncated, line 13 non-JSON, line 15 a valid object of unknown `type`; lines 10/12/14/16 are valid |
| `06-permission-prompt.ndjson` | 16 | 1 | 1 | `permissionMode: 'default'` and a Calf that WRITES, so `canUseTool` fires (`Write`, `agentID a3d3c9443c6195211`) |

## Caveat on `04-orphaned-calf.ndjson` — read this before writing its test

The contract asks for "a Calf with no `tool_result` at turn end". **CLI 2.1.235
cannot produce that.** Every `tool_use` it emits is answered before the turn's
`result` message, including on interrupt — an interrupted `Agent` call receives
a synthetic `is_error: true` `tool_result` reading *"The user doesn't want to
proceed with this tool use."* That was observed directly; the probe tried the
interrupt path and the `maxTurns: 1` path before settling here.

What this fixture captures instead is the real orphan condition the router must
survive: a **background** dispatch. The lane opens
(`system/task_started`, `task_id a5ae6133e7fdf87aa`, line 5) and the turn's
`result` (line 8) arrives while the Calf is still running — no
`task_updated{status:'completed'}`, no `task_notification`. The `Agent`
`tool_use` on line 3 *is* answered on line 6, but only by the launch
acknowledgement ("Async agent launched successfully"), not by the Calf's work.

So assert **"a lane opened by `task_started` with no terminal `task_updated`
when `result` arrives"**, not "a `tool_use` with no `tool_result`". The latter
is unfalsifiable against this CLI.

## Determinism (contract §4)

Assert on structure and correlation: lane assignment, depth, open/close pairing,
ordering, counts. Never on model prose, timings, token counts, cost, or the
literal id values — those change on every re-run. `session_id` and
`tool_use_id` are deliberately **not** redacted, because correlation tests need
them; they are per-capture, so compare them to each other, never to a constant.
