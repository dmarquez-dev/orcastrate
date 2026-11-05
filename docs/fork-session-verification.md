# `forkSession` verification

A live check of the Agent SDK's **standalone** `forkSession(sessionId, { dir })`
(`@anthropic-ai/claude-agent-sdk`, `sdk.d.ts:708-741`) against both CLI binaries
that could be driving Orcastrate. It is the precondition design doc item 8
(Pod branching) names: the mechanism is verified before anything is built on it.

**Overall verdict: held.** Every claim C1–C7 held for both binaries.

All values below are copied from `probe/evidence/fork-session.json`, which the
probe writes itself; nothing in that file is hand-written.

## What was verified

| | |
| --- | --- |
| SDK | `@anthropic-ai/claude-agent-sdk` **0.3.235** (read at run time from its `package.json`) |
| Binary `sdk-builtin` | the SDK's built-in executable, no `pathToClaudeCodeExecutable`. This is what the product drives: `src/main/pod/options.ts:243-245` sets the option only when one is supplied, nothing under `src/` supplies one, and `sdk.d.ts:1775-1777` says the built-in executable is used otherwise. `--version` printed **`2.1.235 (Claude Code)`** |
| Binary `path-claude` | the `claude` on PATH, passed as `pathToClaudeCodeExecutable`. `--version` printed **`2.1.318 (Claude Code)`** |
| Evidence generated | `2026-11-05T19:43:38.755Z` |

Each binary's own `system`/`init` message reported the same version on every
turn (`2.1.235` and `2.1.318` respectively; `initClaudeCodeVersions` in the
evidence), so the binary that answered is the binary whose `--version` is shown.

## How it was checked

`probe/verify-fork-session.ts` runs the whole claim set once per binary, each
with its own freshly created source session, in a working directory outside the
repository (`PROBE_SCRATCH`, default `<tmpdir>/orcastrate-probe`):

1. **Source turn.** A new session is told to remember a nonce generated at
   random for that run (`nonce-` + 16 hex characters) and to reply `OK`.
2. **Fork.** The source transcript is hashed, `forkSession(sourceId, { dir: <cwd> })`
   is called, and the source is hashed again. The fork's transcript is looked
   for before any resume.
3. **Fork turn.** The fork is resumed through `query` with `options.resume`
   (the option the product's resume uses, `src/main/pod/options.ts:238-241`)
   and asked for the value it was told to remember. The prompt does not contain
   the nonce, so only the copied history can supply it. Every `session_id` on
   the streamed messages is recorded.
4. **Fork turn, source moved.** The source transcript (and only that file) is
   moved out of its projects directory, the fork is resumed and asked again,
   and the source is moved back and re-hashed.

Every transcript path is derived by the shipped `sessionFilePath(<claude home>,
<cwd>, <session id>)` from `src/main/pod-session/paths.ts`, with `<claude home>`
being `join(homedir(), '.claude')` as in `src/main/index.ts`.

## Claims and results

### C1 — the id `forkSession` returns differs from the source session id

| Binary | Source id | Fork id | Verdict |
| --- | --- | --- | --- |
| sdk-builtin | `5661a6b8-038c-4a85-878d-7ff78cbf4912` | `05b811be-9d69-4716-8b26-2e31de3ff0bd` | held |
| path-claude | `c6ac4145-caa6-4da5-ba8c-008ae9b3dd40` | `14805c7e-ece9-451d-a26e-bc704ec88357` | held |

### C2 — a transcript exists at `sessionFilePath(<claude home>, <cwd>, <fork id>)` once `forkSession` resolves, before any resume

| Binary | Exists after `forkSession`, before resume | Bytes | Verdict |
| --- | --- | --- | --- |
| sdk-builtin | yes | 8346 | held |
| path-claude | yes | 11109 | held |

The fork transcript then grew with each resumed turn (sdk-builtin 8346 → 16708 →
21969 bytes; path-claude 11109 → 20422 → 26482 bytes), so the resumed turns were
written to the fork's own file.

### C3 — the source transcript's sha256 is identical immediately before and immediately after `forkSession`

| Binary | sha256 before | sha256 after | Verdict |
| --- | --- | --- | --- |
| sdk-builtin | `5d51f278343c169d2b38a15b15ca4fbf382ce1f01c844936bae0e722935c905a` | `5d51f278343c169d2b38a15b15ca4fbf382ce1f01c844936bae0e722935c905a` | held |
| path-claude | `6a0cda1832df9923b4d1e609c71d87e1581e4a4b6ff59277cb2bd8ef3f251eee` | `6a0cda1832df9923b4d1e609c71d87e1581e4a4b6ff59277cb2bd8ef3f251eee` | held |

### C4 — a turn sent to the resumed fork asking for the remembered value is answered with the nonce

| Binary | Nonce | Fork reply | Verdict |
| --- | --- | --- | --- |
| sdk-builtin | `nonce-6addf848796d5728` | `nonce-6addf848796d5728` | held |
| path-claude | `nonce-df3a1247f4e48652` | `nonce-df3a1247f4e48652` | held |

No prompt sent to a fork contains its run's nonce: each run sent two fork-side
prompts, both the fixed text *"What is the exact value I asked you to remember
earlier in this conversation? Reply with only that value and nothing else."*

### C5 — after that turn to the fork, the source transcript's sha256 still equals its pre-fork value

| Binary | sha256 before fork | sha256 after the fork turn | Verdict |
| --- | --- | --- | --- |
| sdk-builtin | `5d51f278343c169d2b38a15b15ca4fbf382ce1f01c844936bae0e722935c905a` | `5d51f278343c169d2b38a15b15ca4fbf382ce1f01c844936bae0e722935c905a` | held |
| path-claude | `6a0cda1832df9923b4d1e609c71d87e1581e4a4b6ff59277cb2bd8ef3f251eee` | `6a0cda1832df9923b4d1e609c71d87e1581e4a4b6ff59277cb2bd8ef3f251eee` | held |

### C6 — every `session_id` carried by the resumed fork's messages equals the fork id, not the source id

| Binary | Messages carrying a `session_id` (both fork turns) | Distinct values observed | Verdict |
| --- | --- | --- | --- |
| sdk-builtin | 48 | `05b811be-9d69-4716-8b26-2e31de3ff0bd` (the fork id) | held |
| path-claude | 10 | `14805c7e-ece9-451d-a26e-bc704ec88357` (the fork id) | held |

The two binaries stream different message mixes (2.1.235 emits `thinking_tokens`
system messages; 2.1.318 emits `session_title_changed`), which is why the counts
differ; every message listed in `forkSessionIdsObserved` carries the fork id.

### C7 — with the source transcript moved out of its projects directory, a resumed fork still answers with the nonce

| Binary | Source present during the turn | Fork reply | Source sha256 after moving it back | Equals pre-fork | Verdict |
| --- | --- | --- | --- | --- | --- |
| sdk-builtin | no | `nonce-6addf848796d5728` | `5d51f278343c169d2b38a15b15ca4fbf382ce1f01c844936bae0e722935c905a` | yes | held |
| path-claude | no | `nonce-df3a1247f4e48652` | `6a0cda1832df9923b4d1e609c71d87e1581e4a4b6ff59277cb2bd8ef3f251eee` | yes | held |

The probe moves and restores no session file other than the source transcript
it created in that run; it refuses to restore over a file that appeared at the
source path while the original was moved away.

## What this establishes

A fork made with the standalone `forkSession` is a self-contained session: it
has its own id and its own transcript from the moment the call resolves, it
carries the source's history, resuming it through the ordinary `resume` path
continues the fork and not the source, and it does not read or write the source
transcript afterwards. That is what lets a forked Pod row carry its own
`ccSessionId` from birth and be opened by the existing resume path unchanged.

## Refutation rule

A claim refuted for either binary refutes the documented behaviour for that
binary. It stops every task that depends on this verification, and it is raised
to the orchestrator as an escalation whose fallback is resuming with the
`forkSession: true` query option (`node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts:1543-1547`).
No claim was refuted in this run.

## Re-running it

```sh
node probe/verify-fork-session.ts
```

`PROBE_SCRATCH` and `PROBE_CLI` behave as for the other probes (`probe/README.md`).
Each run regenerates `probe/evidence/fork-session.json` with fresh nonces and
session ids.

**Cost:** the run recorded here spent **6 live model turns**, 3 per binary,
counted from the `prompts` arrays in `probe/evidence/fork-session.json` (one
source prompt and two fork prompts per binary; `totalLiveTurns` in the same
file).
