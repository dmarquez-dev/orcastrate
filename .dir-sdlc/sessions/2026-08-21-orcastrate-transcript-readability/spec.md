# Orcastrate transcript readability

Make the transcript read like a conversation: the user's own words present and
distinguishable, tool calls compact with results one click away, and permissions out of
the way.

## Context

Sub-session B shipped the conversation-by-default filter and the new pane model, and was
driven by hand on 2026-08-21 — the first time that code met a real window and a real CLI.
Four findings came out of it. Three are decision reversals against B's own backlog; one is a
defect that 1731 unit and jsdom tests did not catch, because no test types into the app.

Baseline at `b2c3caf`: **113 test files, 1731 tests, exit 0**, both typechecks clean.

**The defect.** `PodManager.send()` (`pod-manager.ts:700-701`) pushes the user's text into
the runner's input queue and appends **nothing** to the store. Every `user_message` event in
existence comes from `lane-router.ts:276`, which fires only when the SDK echoes a `user`
message back. `user_message` is already in `CONVERSATION_EVENT_TYPES` and
`TranscriptEventItem.tsx:39` already renders it — there is nothing to render.

**The risk is the opposite of the obvious one.** Decomposition inspected every `user`
message in all six `tests/fixtures/protocol/*.ndjson`: all **seven** with
`parent_tool_use_id: null` are tool-result carriers, not one is a text block — the CLI does
**not** echo the human's prompt back in this corpus. Meanwhile all **seven** `user` text
blocks carry a **non-null** `parent_tool_use_id`: they are *Calf opening prompts*, and
`01-parallel-dispatch.ndjson` lines 5 and 8 carry identical text to each other. So a dedupe
written as "drop a `user_message` matching something we sent" would silently delete a Calf's
first row from a durable store. **The hazard is over-suppression, not doubling**, and every
bound in the contract fails toward over-showing.

## Definition of done

**The user's prompt (T1)**

1. A successful `send()` appends a `user_message` event to the Pod's Matriarch lane, before
   the runner can produce anything in reply. A failed send appends nothing.
2. The echo filter requires **five simultaneous conditions** — event type, Matriarch lane
   read *before* `#routeLane` restamping, exact `===` text match, unexpired, unconsumed —
   and consumes one-shot FIFO.
3. `PENDING_ECHO_CAP = 10` and `PENDING_ECHO_TTL_MS = 60_000`; exceeding either fails toward
   **over-showing**, never toward suppression.
4. A Calf's opening prompt is never suppressed, proved against the real corpus — including
   `01-parallel-dispatch.ndjson`'s two identical texts at lines 5 and 8, both of which must
   survive.
5. `LaneRouter` is not edited. The filter wraps `router.ingest`'s output at
   `pod-manager.ts:989`, never `#persist`, so the self-append cannot filter itself. The
   router's purity test and `tests/router/**` stay green.

**The transcript (T2)**

6. User turns are visually distinct from assistant turns **without relying on colour or
   alignment alone**, and the distinction is carried to assistive technology by the existing
   real-text "You"/"Claude" labels.
7. Tool calls render compactly — `TOOL` / `Name("primary arg")` — with a **total**
   summarizer: every tool produces something useful, unanticipated tools included, via a
   stated fallback ladder.
8. Tool results collapse to a one-line summary (`└ 312 chars ▸`) and expand on click.
   Nothing is dropped; this is a render concern only, no routing or storage change.
9. `isError: true` results default to **expanded**.
10. `permission_request` and `permission_decision` move from `CONVERSATION_EVENT_TYPES` to
    `PLUMBING_EVENT_TYPES` — 4/2/6 across the three sets. They stay renderable behind the
    toggle, so spec 5.2 holds.
11. The partition and disjointness guards are **re-proved by scratch-directory `tsc` probes**
    because the tuple contents change. The `as const satisfies` spelling is frozen; the
    `const x: T[] = []` form is forbidden by name.
12. The filter toggle's count reads "Show 1 hidden system event" in the singular.

**The rail (T3)**

13. The lane-rail pin control is gone: no `lane-row-pin` in any row, any routing mode.
    `TEST_IDS.laneRowPin` and `LaneRowVm.canPin` are **deleted**, not retained, so every call
    site fails to compile.
14. **The inline-mode rule `canPin` was carrying moves into `showLane` as a new step 0** —
    clear unread, open nothing. Without it, deleting `canPin` turns a rail click in inline
    mode into a duplicate pane where yesterday nothing happened.
15. The follower pane's own `transcript-unpin` is unaffected.

**Whole suite (T4)**

16. `npx vitest run` green across the whole suite; `typecheck:node` and `typecheck:web` pass;
    the final count is stated against the **1731 baseline at `b2c3caf`**.
17. Every new assertion is watched failing before it is trusted, with what was changed to
    make it fail stated in the task report.

## Scope

The four findings from the 2026-08-21 hand-run. Nothing else.

### Not in scope

- Sub-session C — Helm and Beachcomber panel polish.
- Renaming the toggle's user-facing noun. It still reads "system events" though the hidden
  set now includes permissions; only the plural is fixed.
- The four backlog items promoted at B's Gate 3 — the unpinned marker copy, the
  `transcript-filter.ts` §1 contract defect, the `closePod` coverage gap, the dialog focus
  hook. All still open.

## Assumptions

| Question | Answer | Rung | Evidence |
|---|---|---|---|
| Does the CLI echo the human's typed prompt back? | No — not in any of the six fixture corpora | 1 | All 7 `user` messages with `parent_tool_use_id: null` are tool-result carriers; not one is a text block |
| Can a dedupe key on text alone? | No | 1 | `01-parallel-dispatch.ndjson:5,8` carry identical text on two different Calf lanes |
| Where does the filter attach? | Wrapping `router.ingest`'s output at `pod-manager.ts:989` | 1 | Attaching at `#persist` would let the self-append filter itself |
| Should tool results be hidden or collapsed? | Collapsed and expandable | 5 | User decision at Gate 1, 2026-08-21 |
| Drop permissions or move them behind the toggle? | Move to plumbing | 5 | User decision at Gate 1; spec 5.2 requires every `EventType` renderable |
| Which exhaustiveness spelling? | `as const satisfies`, generic-constraint `_AssertNever` | 1 | B's T3 proved the `readonly EventType[]` annotation makes the guard vacuous, by compiler probe |
| Do optional-prop concessions apply again? | Yes — T2's `test-ids.test.tsx` and T3's deletion land concurrently, one briefly red | 1 | The concession `renderer-view.ts` already documents for `panelBar` |

## Contracts

- `contracts/user-prompt-persistence.ts` — the append, its ordering, and the five-condition
  de-dup rule with its caps and failure direction.
- `contracts/transcript-turns.ts` — `TurnRole`, the `summarizeToolCall` totality ladder,
  `toolResultCharCount`, and the disclosure contract.
- `contracts/transcript-filter-amendment.ts` — the 4/2/6 move, the frozen guard spelling, and
  the six required label strings.
- `contracts/lane-pin-removal.ts` — the four deletions and the `showLane` amendment.

## Open questions

Three, all carried to Gate 2; none blocks dispatch once answered.

1. **The inline-mode rule moving into `showLane`** is a behavioural change the user did not
   ask for — it exists to prevent a regression that deleting `canPin` would otherwise
   introduce. *Resolved by: the user, at Gate 2.*
2. **Left/right alignment was rejected as the mechanism** in favour of an inset,
   narrower-measure user turn. The user suggested right-alignment explicitly.
   *Resolved by: the user, at Gate 2.*
3. **`isError: true` results defaulting to expanded** extends the Gate 1 settlement.
   *Resolved by: the user, at Gate 2.*
