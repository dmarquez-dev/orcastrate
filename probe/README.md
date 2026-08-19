# `probe/` — THROWAWAY

This directory is **not part of the application**. Nothing under `src/` imports
it, nothing under `tests/` imports it, and it is not built by
`electron-vite build`. It exists only to have produced the durable artefacts in
`tests/fixtures/protocol/`, and is left unmaintained afterwards. Deleting it
does not affect the build, the tests, or the app.

What is durable is the output, not this code:

| Durable (keep, tests depend on it) | Throwaway (this directory) |
| --- | --- |
| `tests/fixtures/protocol/*.ndjson` | `probe/run-probe.ts` |
| `tests/fixtures/protocol/findings.json` | `probe/agents/*.md` |
| `docs/protocol-findings.md` | `probe/package.json` |

## What it does

Drives the real `claude` CLI through `@anthropic-ai/claude-agent-sdk` in
**streaming input mode** with `forwardSubagentText: true`, and writes every SDK
message it receives, verbatim, as one JSON value per line. The only mutation is
the redaction required by `src/shared/contracts/fixture-corpus.md` §2.

It then derives `findings.json` from those captures — it does not hand-write
any answer. Every boolean in `findings.json` is computed from the streams in
`tests/fixtures/protocol/` or from a real invocation of the CLI.

The probe prompts are deliberately trivial ("report the current directory name
and stop"). The probe observes **dispatch shape**, not work.

## Re-running it

```sh
# Live. Spends real tokens: ~9 short sessions.
PROBE_SCRATCH=/some/scratch/dir node probe/run-probe.ts

# Replays the cached runs under $PROBE_SCRATCH/raw and only re-derives
# findings.json. Costs nothing.
PROBE_REUSE=1 PROBE_SCRATCH=/some/scratch/dir node probe/run-probe.ts
```

To re-shoot a single capture, delete just its cache file
(`$PROBE_SCRATCH/raw/<name>.json`) and run with `PROBE_REUSE=1`.

| Env var | Default | Meaning |
| --- | --- | --- |
| `PROBE_SCRATCH` | `<tmpdir>/orcastrate-probe` | working dir for the probe sessions, run cache, and evidence dump. Never inside the repo. |
| `PROBE_CLI` | resolved from `PATH` (`where claude` / `which claude`); if that fails, unset, and the SDK uses the CLI binary it bundles | the CLI binary to drive. No absolute path is hardcoded anywhere in this directory. |
| `PROBE_REUSE` | unset | `1` replays cached runs instead of calling the CLI |

Node ≥ 23.6 runs the `.ts` file directly (native type stripping). `probe/package.json`
exists only to mark this directory ESM.

## The runs

| Run | Fixture | What it forces |
| --- | --- | --- |
| `01-parallel-dispatch` | yes | two `Agent` tool_use blocks in **one** assistant message |
| `02-nested-dispatch` | yes | a subagent that itself dispatches a subagent (depth 2) |
| `03-tool-result-close` | yes | one subagent completing normally |
| `04-orphaned-calf` | yes | a **background** dispatch, so the Calf lane is still open at `result` |
| `05-malformed` | yes | derived from 03 by hand-corrupting lines (the one file §2 exempts) |
| `06-permission-prompt` | yes | a subagent that WRITES, under `permissionMode: 'default'`, so `canUseTool` fires |
| `x-no-forward` | no | control: the same run with `forwardSubagentText` unset |
| `x-steering` | no | actually calls `SendMessage` / `TaskStop` / `TaskOutput` |
| `x-env` | no | passes only `{ PROBE_MARKER }` as `env` and prints `$PATH` length |
| `x-resume` | no | resumes run 03's session through `options.resume` |

`--permission-mode` values are enumerated by passing each candidate to the CLI
with `--help`; commander validates the choice before any model call, so that
check costs nothing.

## Two things worth knowing before you re-run it

1. **The dispatch tool is called `Agent` in CLI 2.1.235**, not `Task`. The
   analysis accepts both names.
2. **Agents run in the background by default.** A background dispatch returns
   an "Async agent launched" ack immediately and forwards **no** subagent
   messages into the parent stream. Every prompt here that needs real nesting
   says `run_in_background: false` explicitly. Drop that and the probe silently
   captures nothing.
