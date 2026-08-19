# KNOWN LIMITATION: the `canUseTool` attribution race

**Status: known limitation, not a fixed bug.** Nothing in this repository closes
this race. Both real fixes are behaviour changes that were deliberately left out
of scope for this session (see [Why it is not fixed](#why-it-is-not-fixed)).
This document exists so that an engineer who meets the warning below in a real
log can find the code, recognise the shape, and not spend an afternoon on it.

## Symptom

A permission prompt raised by a **Calf** is rendered on the **Matriarch** lane.
The prompt still works — it is answerable, it is never dropped, and the tool
call proceeds or is denied correctly — but it appears on the wrong lane, so the
user sees the Matriarch asking to run a command that a background subagent
actually wants to run.

## Mechanism

`canUseTool` is invoked by the SDK **out of band from stream ingestion**. It is
a callback the SDK calls when a tool needs permission; it is not a message on
the NDJSON stream, and it carries no ordering relationship to the stream at all.

Attribution of a prompt to a lane is done by `PodManager.#attributePrompt`
(`src/main/pod-manager/pod-manager.ts`), which has exactly two indexes to work
with:

| index | source | populated by |
| --- | --- | --- |
| `LaneRouter.agentIds()` | `system/task_started.task_id` | ingesting `system/task_started` |
| `LaneRouter.getLaneByToolUseId()` (the router's `byToolUseId`) | the dispatching `Agent`/`Task` tool_use block, or `system/task_started.tool_use_id` | ingesting the dispatch block or `task_started` |

**Both indexes are populated only by ingesting `task_started` or the dispatch
block.** Neither is populated by anything `canUseTool` itself sees.

So a Calf's **first tool prompt can arrive before the ingestion that would
identify it**. When that happens the supplied `agentId`/`toolUseId` resolves
against neither index, `#attributePrompt` falls through to its final `return`,
and the prompt is attributed to the Matriarch.

From the payload alone this is **indistinguishable from the correct no-id
case** — a genuine Matriarch prompt that legitimately carries no `agentId` and
no `toolUseId` also lands on the Matriarch by the same `return`. The renderer
cannot tell the two apart, and neither can a test that inspects the resulting
event.

## The only observable signal

There is exactly one: the warning `#attributePrompt` emits when an id *was*
supplied but resolved to no lane. That branch is what separates the race from
the benign no-id case, because the benign case supplies no id and therefore logs
nothing.

- **File:** `src/main/pod-manager/pod-manager.ts`
- **Symbol:** `PodManager.#attributePrompt` (the `this.#log.warn` inside it)

The exact text it emits:

```
[orcastrate] permission request ${prompt.requestId} for pod ${session.podId} named ${unresolved.join(' and ')}, which matches no lane in this Pod; attributed to the Matriarch
```

`unresolved` is `agentId <id>`, `toolUseId <id>`, or both joined by `and`,
depending on which the prompt supplied. So a real log line reads, for example:

```
[orcastrate] permission request req-7 for pod pod-3 named agentId a381eac5e0ec75778, which matches no lane in this Pod; attributed to the Matriarch
```

**If this warning appears naming an `agentId`, this race is the first thing to
suspect.** The id was real; the indexes were merely late. The warning is
otherwise a drift detector and is expected to stay silent on every normal turn —
the fixture suite asserts the warn logger is never called during a clean drive.

The fixture tests cannot reproduce the race: they drive the stream to completion
before raising a prompt, so ingestion has always already happened by the time
`canUseTool` is called. That is a property of the harness, not evidence that the
race cannot occur in production.

## Why it is not fixed

Two fixes would actually close it, and both change behaviour rather than
observability:

1. **Await ingestion of the owning dispatch.** Before answering an attribution
   query, wait until the `task_started` or dispatch block carrying the supplied
   id has been ingested. This makes `#attributePrompt` asynchronous and couples
   the permission path to stream progress, including deciding what to do when
   the dispatch never arrives.
2. **Park the prompt until the lane materializes.** Hold the prompt out of the
   UI until the lane it names exists, then deliver it to that lane. This delays
   a user-visible prompt on a timer the user does not control, and needs its own
   timeout and fallback.

Each changes when a prompt becomes visible and on which lane, which is a
behaviour change in the permission surface. **Both are deliberately out of scope
for this session.** No workaround for the race was added to
`src/main/pod-manager/`, and no test was added that pretends to cover it.
