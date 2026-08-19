# CONTRACT — Protocol fixture corpus and probe findings. Frozen at Gate 2.

Boundary between **T2** (the probe, which produces these files) and **T5 /
T6** (the router and its tests, which consume them). T2 and T5 cannot talk to
each other, so this file is the entire agreement about what T2 leaves behind.

The probe *script* is throwaway. Everything described here is **durable** — it
is the whole test corpus for spec section 9 and it outlives the script that
produced it.

---

## 1. File layout

```
probe/                              THROWAWAY. Deleted or left unmaintained
  run-probe.ts                      after T2. No other task imports it.
  agents/*.md                       subagent definitions used by the probe
  README.md                         how to re-run it, if ever needed

tests/fixtures/protocol/            DURABLE. The test corpus.
  README.md                         provenance: CLI version, date, OS, command
  findings.json                     machine-readable answers (schema in §3)
  01-parallel-dispatch.ndjson       two Calves dispatched concurrently
  02-nested-dispatch.ndjson         depth-2: an agent that spawns an agent
  03-tool-result-close.ndjson       a Calf that completes normally
  04-orphaned-calf.ndjson           a Calf with no tool_result at turn end
  05-malformed.ndjson               hand-edited: valid lines + broken lines
  06-permission-prompt.ndjson       a turn where canUseTool fired
```

`docs/protocol-findings.md` — the human-readable narrative of the same
findings, T2-owned, referenced by Gate 2.

## 2. NDJSON file format

- One JSON value per line, UTF-8, `\n` endings, trailing newline.
- Each line is the **raw SDK message, verbatim**. No wrapping envelope, no
  reordering, no pretty-printing, no added fields.
- Lines appear in the order the SDK yielded them.
- **Redaction is the one permitted mutation.** Absolute paths under the
  probe's `cwd`, the user's home directory, and any value that looks like a
  token or key are replaced with the literal placeholders `<CWD>`, `<HOME>`,
  `<REDACTED>`. Redaction must not change a line's JSON shape or key set.
  Session ids and tool_use ids are **not** redacted — the tests correlate on them.
- `05-malformed.ndjson` is the sole exception to "verbatim": it is derived from
  a real capture by hand-corrupting lines. It must contain at least one
  truncated JSON line, one line of non-JSON text, and one syntactically valid
  JSON object with an unknown `type`. Valid lines must surround the broken ones
  on both sides, so the test proves the stream survives rather than ends.

Each capture must contain at least one complete turn: the `system` init message
through the terminal `result` message.

## 3. `findings.json`

The probe's answers to spec section 11, in a form T5 can read and T6 can assert
against. This shape is the contract; T5 must not infer answers from the raw
NDJSON.

```jsonc
{
  "schemaVersion": 1,
  "capturedAt": "2026-08-18T00:00:00.000Z",
  "cliVersion": "2.1.235",
  "sdkVersion": "<resolved @anthropic-ai/claude-agent-sdk version>",
  "platform": "win32",

  // -- Open question 1 (spec 11.1 / 4.3) ---------------------------------
  "parentToolUseId": {
    // true only if EVERY subagent-originated message in
    // 01-parallel-dispatch carried a parent_tool_use_id matching the
    // tool_use_id of the Task block that opened it, AND no Matriarch
    // message carried a non-null one.
    "correlates": true,
    "fieldPath": "parent_tool_use_id",
    "messageTypesCarryingIt": ["assistant", "user"],
    "notes": "free text; required when correlates is false"
  },

  // Drives LaneRouterOptions.mode in contracts/lane-router.ts.
  // 'lanes' iff parentToolUseId.correlates === true, else 'inline'.
  "recommendedRoutingMode": "lanes",

  // -- Nesting (resolved-unknowns.md design implication) -----------------
  "nesting": {
    "depth2Observed": true,
    // null when depth-2 dispatch produced no distinguishing field.
    "parentAgentIdFieldPath": "parent_agent_id",
    // true when depth-2 messages are distinguishable from depth-1 messages
    // by field content alone. If false, the router cannot build a tree and
    // T5 escalates.
    "distinguishableFromDepth1": true,
    "notes": ""
  },

  // -- agent_id (spec 4.4 / 5.3) -----------------------------------------
  "agentId": {
    "observed": true,
    // where on the message the agent id appears; null when never observed
    "fieldPath": "...",
    // true when every Calf could be assigned an agent_id from the stream
    "availableForEveryCalf": true
  },

  // -- Open question 2 (spec 11.2 / 5.3) ---------------------------------
  "steering": {
    "sendMessageAvailable": false,
    "taskStopAvailable": false,
    "taskOutputAvailable": false,
    // verbatim error text if the tool was absent, e.g.
    // "No such tool available: SendMessage"
    "evidence": "..."
  },

  // -- Option-shape confirmations (resolved-unknowns corrections) ---------
  "optionsVerified": {
    // false here means Calf lanes get nothing; blocks T5.
    "forwardSubagentTextRequired": true,
    "permissionModeValues": ["default", "plan", "bypassPermissions"],
    "resumeOptionName": "resume",
    "envReplacesEnvironment": true
  },

  "fixtures": [
    { "file": "01-parallel-dispatch.ndjson", "lines": 0, "turns": 1,
      "calvesOpened": 2, "maxDepth": 1 }
    // one entry per .ndjson file
  ]
}
```

**Consumers may rely on:** `findings.json` exists, parses, and has
`schemaVersion === 1` with every key above present. A field the probe could not
determine is set to `null` with the reason recorded in the sibling `notes`, and
is **never omitted**.

**T5's obligation:** read `recommendedRoutingMode` from this file and build
against it. If it is `"inline"`, T5 implements the spec 4.3 fallback and does
**not** implement lane promotion. If `nesting.distinguishableFromDepth1` is
`false`, T5 stops and escalates rather than guessing a tree shape.

## 4. Determinism note for T6

Captures are real CLI output and therefore contain real timestamps, session
ids, and model text. Tests must assert on **structure and correlation** —
lane assignment, ordering, open/close pairing, counts — never on model prose,
timings, or token counts. A test that would break when the probe is re-run
against the same CLI version is a broken test.
