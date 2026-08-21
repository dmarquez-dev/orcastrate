/**
 * CONTRACT — Turn attribution, and compact tool activity with an expandable
 * result. Frozen at Gate 2.
 *
 * Items 2 and 3 of the session scope.
 *
 * Boundary between:
 *   - T2 (PRODUCER AND SOLE CONSUMER) `src/renderer/src/transcript/**`.
 *   - T4 (CONSUMER) `src/renderer/src/__tests__/**` — drives it end to end.
 *
 * NOTHING ELSE IS INVOLVED. No main change, no IPC change, no state-layer
 * change, no store change, no routing change, no `TranscriptPaneProps` change,
 * no `NormalizedEvent` change, and NO ADDITION TO `TEST_IDS` — see section 4
 * for why that last one is deliberate and not an oversight.
 *
 * ===========================================================================
 * THE ONE STRUCTURAL INVARIANT NEITHER ITEM MAY BREAK
 * ===========================================================================
 *
 * ONE EVENT, ONE `<li>`, ONE `transcript-event:<seq>`. The pane renders
 * `filterTranscriptEvents(view.events, mode).map(...)` into an `<ol>` and each
 * element carries `data-testid={testId(TEST_IDS.transcriptEvent, String(seq))}`
 * and `data-event-type={payload.type}`.
 *
 * The sketch item 3 works from —
 *
 *     TOOL
 *       WebFetch("https://api.weather.gov/stations/KRNO/observations/latest")
 *       └ 312 chars                         ▸
 *
 * — LOOKS LIKE ONE ROW PAIRING A CALL WITH ITS RESULT. IT IS NOT, AND MUST NOT
 * BE IMPLEMENTED AS ONE. `tool_use` and `tool_result` are two events with two
 * `seq` values and they are frequently not adjacent: a parallel dispatch
 * interleaves several tools, and a backfill page can arrive with a call whose
 * result is not on screen yet. Merging them into a single `<li>` would:
 *
 *   - break `filterTranscriptEvents`' SUBSEQUENCE guarantee at the DOM, which
 *     `TranscriptPane.filter.test.tsx` asserts by exact rendered-seq list;
 *   - make `transcript-event:<seq>` ambiguous or absent for one of the two,
 *     which every existing suite selects by;
 *   - require the item to reach across events, which is the join
 *     `TranscriptPaneProps.lanes` exists to avoid.
 *
 * SO: the `└` glyph and the indent belong to the `tool_result` row itself.
 * They make it READ as attached to the call above it without the two rows
 * becoming one. When the call is not on screen the result still renders, still
 * legible, still with its own summary.
 *
 * ===========================================================================
 * ITEM 2 — TURN ALIGNMENT
 * ===========================================================================
 *
 * AMENDED 2026-08-21 BY USER DECISION AT GATE 2, after a research round. This
 * section previously argued AGAINST left/right alignment and specified an
 * inset instead. The user overrode it, and the reasoning is recorded here
 * because it is better than the reasoning it replaced.
 *
 * WHAT IS ADOPTED: the user's turn is RIGHT-ALIGNED. Every other row is flush
 * left. The user's own words: "even though we have 12 row kinds, they
 * ultimately converge to 2 PRODUCERS (CC and user), therefore justifying the
 * right-aligned user content for now."
 *
 * WHY THE ORIGINAL OBJECTION DOES NOT HOLD. It rested on row KINDS; the
 * decision rests on PRODUCERS. Nothing in the transcript is authored by a
 * third party: a tool call, a tool result, a dispatch card, a lane notice, an
 * `error` and a `malformed` row are all things that happened on Claude Code's
 * side of the conversation. Attributing them to the left column asserts
 * nothing false, because the left column means "not you" rather than "Claude
 * said this in prose". THE LEFT COLUMN IS THE NON-USER PRODUCER, and that is
 * the whole of its claim.
 *
 * WHAT THE RESEARCH ROUND FOUND, since it overturned this section's premises:
 *   - Right-alignment is LIVE PRIOR ART, not a dead mobile idiom. VS Code /
 *     Copilot Chat right-aligns the user's request (`margin-left: auto`,
 *     `max-width: 90%`, `chat.requestBubbleBackground`), shipped deliberately
 *     in microsoft/vscode#249681, 2025-05-27. Vercel AI Elements, ChatGPT,
 *     Gemini and Perplexity all ship a right-offset user turn. NOTHING in the
 *     survey was found removing it.
 *   - The accessibility objection is NEUTRAL, not supporting. Right-alignment
 *     plus a visually-hidden label is a shipped, WCAG-conformant combination
 *     (Gemini's "You said" is `cdk-visually-hidden`). It argues against
 *     alignment ALONE, and this transcript already ships visible labels.
 *   - The reading-measure objection is CHEAP, not decisive: at the 1280
 *     default an inset costs ~4 characters (76 -> 72); break-even against
 *     WebAIM's ~50-character floor is W ~ 1216px. A max-width CAP is what
 *     would be expensive, so do not add one beyond what section 1 specifies.
 *   - The surviving counter-evidence, recorded honestly: 11 of 12 developer
 *     agent tools do not right-align, and every surveyed system ABANDONS
 *     alignment once a third row kind exists — Ant Design X's `Bubble.System`
 *     has no `placement` prop at all; Vercel AI Elements' `from` accepts
 *     "system" and silently styles it as the assistant. The user's
 *     two-producer framing is what answers this: the third bucket is a
 *     rendering distinction, not an authorship one, and it is carried by the
 *     row's own label and treatment rather than by its side.
 *
 * TWO CORRECTIONS TO THIS FILE'S OWN PROSE, from the same research round:
 *   - This transcript has TWELVE row kinds, not seven. `EVENT_TYPES` and the
 *     `EventType` union both carry twelve, and section 1 of this file already
 *     enumerates 1+4+7=12. The word "seven" elsewhere in this file is wrong.
 *   - `permission_decision` is the sharpest case, not `malformed`: it records
 *     THE HUMAN'S allow/deny on the normal path (`pod-runner.ts:392`) but is
 *     system-emitted on abort and on handler failure, so its authorship is
 *     genuinely mixed and path-dependent. Under the two-producer rule it
 *     renders left with everything else. This is tolerable HERE only because
 *     `permission_request` and `permission_decision` both move to
 *     `PLUMBING_EVENT_TYPES` this session and are hidden by default; if they
 *     are ever un-hidden, this is the row to revisit first.
 *
 * `TurnRole` KEEPS ITS THREE MEMBERS. The producer rule governs ALIGNMENT
 * only: `'user'` renders right, `'assistant'` and `'system'` both render left.
 * Collapsing the type to two would discard the distinction that lets a
 * `system` or `malformed` row carry its own treatment within the left column.
 */

import type { EventPayload } from '@shared/contracts/events';

// ---------------------------------------------------------------------------
// 1. Turn attribution (item 2)
// ---------------------------------------------------------------------------

/**
 * THREE ROLES, NOT TWO. Two would force every diagnostic and every piece of
 * plumbing to claim to be the assistant.
 */
export type TurnRole = 'user' | 'assistant' | 'system';

/**
 * TOTAL over `EventPayload`. Exhaustive by a `never` assignment in the default
 * branch, the same way `EventBody` already is — a thirteenth payload must
 * break `typecheck:web` here.
 *
 *   'user'      — `user_message`, and nothing else. This is the human.
 *   'assistant' — `assistant_text`, `thinking`, `tool_use`, `tool_result`.
 *                 What the model said, thought, did, and got back.
 *   'system'    — `lane_opened`, `lane_closed`, `permission_request`,
 *                 `permission_decision`, `system`, `error`, `malformed`.
 *                 Orcastrate and the runtime talking, not either party to the
 *                 conversation.
 *
 * `tool_result` IS 'assistant' EVEN THOUGH THE SDK DELIVERS IT INSIDE A `user`
 * MESSAGE. The transport is not the speaker. A tool result attributed to the
 * human would tell the reader they said something they did not.
 */
export declare function turnRoleOf(payload: EventPayload): TurnRole;

/**
 * HOW THE ROLE REACHES THE PAGE. All four channels are required; none of them
 * is optional and none may be substituted for another.
 *
 * 1. DOM — the event's `<li>` carries `data-turn-role={turnRoleOf(payload)}`.
 *    This is what CSS keys on and what a test may select by. It is NOT an
 *    accessibility channel and does not count as one.
 *
 * 2. TEXT — the visible role label already rendered by `Labelled` ("You",
 *    "Claude", …) STAYS, stays real text, and stays OUT of `aria-hidden`. It
 *    is the primary carrier for a screen reader and for anyone who cannot
 *    distinguish the colours. `TranscriptEventItem.tsx` renders these today
 *    and the labels for `user_message` and `assistant_text` — "You" and
 *    "Claude" — are unchanged, character for character.
 *
 * 3. SHAPE — AMENDED 2026-08-21 BY USER DECISION AT GATE 2, superseding the
 *    inset specified here originally. The user's `<li>` is RIGHT-ALIGNED:
 *    pushed to the trailing edge of the pane (`margin-inline-start: auto`,
 *    the mechanism VS Code ships) and capped to a `max-width` so a long
 *    prompt still wraps rather than spanning the pane. Assistant and system
 *    rows are flush left and uncapped.
 *
 *    THE CAP IS THE ONLY MEASURE CONSTRAINT — do not also inset. The research
 *    round computed the cost: at the 1280 default an inset costs ~4 characters
 *    (76 -> 72) and break-even against WebAIM's ~50-character floor is
 *    W ~ 1216px, so an inset is cheap but a cap is what actually bounds the
 *    line, and stacking both would over-constrain the half-width follower
 *    pane. Use a logical property, not `margin-left`, so the layout is not
 *    wrong under RTL.
 *
 *    ONLY `user_message` MOVES. `turnRoleOf` still returns three roles;
 *    alignment is a two-producer question and `'assistant'` and `'system'`
 *    both render left. Nothing about a tool call, a tool result, a dispatch
 *    card, an `error` or a `malformed` row changes position.
 *
 * 4. NON-COLOUR VISUAL — the user's `<li>` additionally carries a raised
 *    background (`--oc-bg-raised`) AND a border (`--oc-border-strong`).
 *    COLOUR IS NEVER THE ONLY CARRIER: remove every colour from the page and
 *    the alignment, the cap, the border and the label still distinguish the
 *    two.
 *
 * NO NEW THEME TOKEN. `--oc-bg-raised`, `--oc-border-strong`, `--oc-space-*`
 * and `--oc-radius-*` already exist in `contracts/renderer-theme.ts`.
 * `src/renderer/src/__tests__/hygiene.test.ts` forbids a hex colour, an
 * `rgb(`/`hsl(` literal, a px font-size or a hardcoded font stack anywhere
 * under `src/renderer/**` outside `styles/`, and that rule binds
 * `Transcript.module.css`. A new token would mean editing
 * `contracts/renderer-theme.ts`, which T3 owns — so the design is constrained
 * to existing tokens ON PURPOSE, to keep the two tasks disjoint.
 */

// ---------------------------------------------------------------------------
// 2. Tool call summaries (item 3)
// ---------------------------------------------------------------------------

/**
 * TOTALITY IS THE PROPERTY, and it is the same property `partitionFinishedLanes`
 * needed last session: EVERY tool renders something useful, including tools
 * nobody anticipated, including tools that do not exist yet.
 *
 * SO THE TABLE IS KEYED ON ARGUMENT NAMES, NOT ON TOOL NAMES. A table of tool
 * names is a table that is wrong the day a new tool ships and silently
 * degrades to nothing. Argument names are shared across tools — `file_path`,
 * `command`, `url`, `pattern` — so an unknown tool with a familiar argument
 * still summarises well, and an unknown tool with an unfamiliar argument falls
 * through to a stated fallback rather than to an empty string.
 *
 * THE LADDER, in order. The FIRST branch that applies wins.
 *
 *   1. `input` is a non-empty string          -> `Name("<elided input>")`
 *   2. `input` is a non-null object (or array) and some key in
 *      `PRIMARY_ARG_KEYS` is present with a primitive value, taken in the
 *      order that array declares
 *                                             -> `Name("<elided value>")`
 *   3. `input` is a non-null object with EXACTLY ONE own enumerable key whose
 *      value is a primitive                   -> `Name("<elided value>")`
 *   4. `input` is a non-null object with N own enumerable keys
 *                                             -> `Name(1 arg)` / `Name(N args)`
 *                                                and `Name(no args)` at N = 0
 *   5. anything else — null, undefined, a number, a boolean, a symbol
 *                                             -> `Name(<elided JSON or String()>)`
 *
 * THE STATED FALLBACK IS BRANCH 4. It is never an empty string, never
 * "unknown", never a raw JSON dump. Note it gets the plural right — this
 * session is fixing a plural defect and must not ship a new one.
 *
 * GUARANTEES A CONSUMER AND A TEST MAY RELY ON, for EVERY `(name, input)`
 * pair without exception:
 *   - returns a `string` with `length > 0`;
 *   - NEVER throws — a circular structure, a getter that throws, a symbol key,
 *     a `BigInt`, a 5 MB blob all return a string;
 *   - starts with the tool's display name, and when `name` is empty or not a
 *     string that display name is the literal `unknown tool`;
 *   - contains NO newline — a summary is one line by construction, so a
 *     multi-line value is collapsed to single spaces before elision;
 *   - is at most `TOOL_SUMMARY_MAX_CHARS` long AFTER the name and brackets.
 */
export declare function summarizeToolCall(name: string, input: unknown): string;

/**
 * Ordered. First match wins. Extending this array is a normal change; keying
 * on a tool name instead is not.
 */
export const PRIMARY_ARG_KEYS: readonly string[] = [
  'file_path',
  'notebook_path',
  'path',
  'url',
  'command',
  'pattern',
  'query',
  'prompt',
  'description',
  'skill',
  'subagent_type',
  'name',
  'text',
];

/** Elision budget for the value inside the brackets. Cut on code points, so a
 *  surrogate pair is never split; the ellipsis is a single '…'. */
export const TOOL_SUMMARY_MAX_CHARS = 120;

// ---------------------------------------------------------------------------
// 3. Tool results: collapsed, sized, expandable (item 3)
// ---------------------------------------------------------------------------

/**
 * TOTAL. Never throws. Returns the number the collapsed row reports.
 *
 *   - `content` is a string          -> its `.length`
 *   - `content` is null/undefined    -> 0
 *   - otherwise                      -> `JSON.stringify(content)?.length`, and
 *                                       `String(content).length` if that
 *                                       throws or returns undefined
 *
 * IT IS A SIZE, NOT A CHECKSUM. Nobody should read meaning into the exact
 * number; it exists so the reader can tell a one-line result from a wall of
 * output before deciding to open it.
 */
export declare function toolResultCharCount(content: unknown): number;

/**
 * The collapsed row's counted label. `1 char` / `312 chars` — SINGULAR AT ONE.
 * `LaneRail.tsx`'s `finishedLabel` is the local precedent and gets it right;
 * the filter toggle is the local precedent that gets it wrong and is being
 * fixed this session in `transcript-filter-amendment.ts`.
 */
export declare function toolResultSizeLabel(count: number): string;

/**
 * THE DISCLOSURE. Binding, because "collapsed and expandable" is the shape the
 * user settled at Gate 1 and the ways to get it wrong are all silent.
 *
 * - It is a real `<button type="button">`. Not a `<div onClick>`, not a
 *   `<summary>` inside a `<details>` — `<details>` cannot be driven by the
 *   `aria-expanded` assertions below and its open state is not a React-owned
 *   value.
 * - It carries `aria-expanded`, reflecting the state truthfully in both
 *   directions.
 * - Its ACCESSIBLE NAME states the action and the size:
 *     `Show tool result (312 chars)` / `Hide tool result (312 chars)`
 *   and for a call:
 *     `Show tool input` / `Hide tool input`
 *   Asserted with `getByRole('button', { name })`, NOT with `textContent` —
 *   advisory A3 of last session's T2 review is why.
 * - It carries `aria-controls` pointing at the id of the region that actually
 *   appears and disappears. That region is REMOVED FROM THE DOM while
 *   collapsed, not merely visually hidden, so `aria-expanded="false"` and the
 *   page agree.
 * - The chevron glyph ('▸'/'▾') is `aria-hidden`. It is decoration; the name
 *   carries the state.
 * - It is keyboard reachable and operable, and focus stays on it across a
 *   toggle — a control that moves focus on expand loses the reader's place.
 *
 * NOTHING IS DROPPED. Expanded, the region renders the result content through
 * the SAME `preview()` path `TranscriptEventItem.tsx` uses today — verbatim,
 * display-only, never interpreted. The same applies to a `tool_use`'s raw
 * input: it is COMPACT, not gone, and its own disclosure brings back exactly
 * what the `<pre>` shows today.
 *
 * DEFAULT STATE — collapsed, WITH ONE EXCEPTION: a `tool_result` whose
 * `isError` is true defaults to EXPANDED. Same argument that already exempts
 * `error` and `malformed` from the noise filter: a failure the user must know
 * to go looking for is a silent drop in every way that matters to them. The
 * error case must also be distinguishable WITHOUT COLOUR — the collapsed row
 * says so in words, as `TranscriptEventItem`'s "Tool result (error)" label
 * already does.
 *
 * PER-EVENT STATE, held in the item, not in the pane and not in the store.
 * Which rows a reader has opened is client interaction state
 * (`panel-provider.tsx` from the other side), and lifting it to the pane would
 * make one reader's expansion follow the lane into the other pane.
 *
 * THE `memo` ON `TranscriptEventItem` SURVIVES. State inside the memoised
 * component does not defeat it; a callback or an object created in the PANE
 * and passed down per item would. Nothing new is passed down per item.
 */
export interface ToolDisclosureContract {
  expandedInitially: boolean;
  ariaExpanded: boolean;
  ariaControls: string;
  accessibleName: string;
}

// ---------------------------------------------------------------------------
// 4. Test ids: NONE ARE ADDED, ON PURPOSE
// ---------------------------------------------------------------------------

/**
 * `TEST_IDS`, `PANE_TEST_IDS` and `TRANSCRIPT_FILTER_TEST_IDS` all live in
 * `src/renderer/src/contracts/renderer-view.ts`, WHICH T3 OWNS THIS SESSION —
 * it is deleting `laneRowPin` from that object. Two tasks editing one object
 * concurrently is the race last session's T1 was invented to prevent.
 *
 * So this item adds NOTHING to it. Everything item 2 and item 3 introduce is
 * addressable without a new id:
 *   - the turn role, by `[data-turn-role]` on the existing
 *     `transcript-event:<seq>` element;
 *   - the disclosures, by `getByRole('button', { name })` — which is the
 *     assertion the accessibility floor wants anyway, and is strictly stronger
 *     than a test id because it fails when the name regresses.
 *
 * A LIVE CONSEQUENCE, ACCEPTED. `src/renderer/src/transcript/test-ids.test.tsx`
 * is under T2's ownership and today asserts `TEST_IDS.laneRowPin`. T2 rewrites
 * it to drop those assertions; T3 deletes the id. Between the two landings
 * whichever went first is briefly red. That is the identical concession
 * `renderer-view.ts` already documents for `panelBar` and `onShowInFollower`,
 * and what makes it a failure rather than a valid resting state is that both
 * tasks' acceptance criteria require a green `typecheck:web`.
 */
