# Resolved unknowns — 2026-08-21-orcastrate-transcript-readability

## U1. Turn style: is right-alignment of the user's turn best practice, or a mobile idiom?

**Status:** researched at the user's direction after Gate 2, which approved everything in
`manifest.json` **except** this. `contracts/transcript-turns.ts` is frozen with a
left-inset answer already written into it; this round tests that answer rather than
assuming it. The decision is the user's.

**Question.** Should Orcastrate's transcript right-align the user's turn against a
left-aligned assistant, as the user proposed — and is that pattern current desktop
practice or an inherited mobile convention?

**Verdict from the research round: the mechanism the contract adopted is right, but the
brief's stated reason for it is wrong on the central fact. Right-alignment is not a dead
mobile idiom. It is live prior art in the single closest analogue Orcastrate has.**

---

### Evidence *for* right-alignment — the case the brief did not expect

**The closest analogue in existence adopted it, deliberately, in 2025.** VS Code / GitHub
Copilot Chat — an IDE agent transcript carrying tool calls, the nearest thing to
Orcastrate's problem — right-aligns the user's request:
`margin-left: auto`, `align-items: flex-end`, `max-width: 90%`, with
`background-color: var(--vscode-chat-requestBubbleBackground)`. It arrived in PR
[#249681, "chat bubbles for requests"](https://github.com/microsoft/vscode/pull/249681),
merged 2025-05-27, and is in shipped stable (verified against a local 1.134 install and
against `main`). The PR's own review thread discusses bubble margins, alignment and the
resulting layout shift on the Undo Requests button — this was a considered layout change,
not an accident. Its inline-chat variant is explicitly excluded by a
`:not(.chat-widget > .interactive-session)` guard, so VS Code applies the bubble to the
panel transcript specifically.

*Fetch-integrity note:* an independent fetch of
`src/vs/workbench/contrib/chat/browser/widget/media/chat.css` returned
`background-color: var(--vscode-chat-requestBubbleBackground)` and
`border-left: 3px solid var(--vscode-chat-requestBorder)` and reported **no** alignment
rule — while cautioning that "complete rules aren't fully isolated." The PR and the local
install outrank a summarized fetch, and the `border-left` is most likely the
high-contrast-theme rule. **The alignment finding is solid; the exact selector text is the
one thing worth re-reading by hand if it ever matters.**

**VS Code's public theme API confirms the vocabulary, and confirms the cost.** The
versioned
[theme-color reference](https://code.visualstudio.com/api/references/theme-color)
documents `chat.requestBubbleBackground` ("Background color of the chat request bubble"),
`chat.requestBackground`, `chat.requestBorder`, `chat.requestCodeBorder` ("Border color of
code blocks within the chat request bubble"), and `chat.avatarBackground` /
`chat.avatarForeground`. Only the *request* gets a bubble token; there is no response-side
equivalent, and no alignment token at all.

**The reference component library for AI-native apps right-aligns too.** Vercel AI
Elements (`packages/elements/src/message.tsx`) sets, for `from === 'user'`,
`"is-user ml-auto justify-end"` on the message root and
`"group-[.is-user]:ml-auto group-[.is-user]:rounded-lg group-[.is-user]:bg-secondary
group-[.is-user]:px-4 group-[.is-user]:py-3"` on the content — against an assistant that
is bare, flush-left, full-width.
https://raw.githubusercontent.com/vercel/ai-elements/main/packages/elements/src/message.tsx

**Every consumer AI surface that could be measured does a version of it.** Measured off
the live DOM at a 1440px viewport:

- **ChatGPT** — user wrapper `flex w-full flex-col items-end`; bubble `rounded-[22px]
  px-4 py-2.5`, `max-width: (--user-chat-width, 70%)`, `background: rgba(233,233,233,.5)`.
  Measured: 296px bubble flush to the right edge of a 640px column. Assistant: `w-full`,
  transparent, no radius.
- **Gemini** — `user-query-container` at `justify-content: flex-end`; bubble
  `border-radius: 40px`, `padding: 20px 28px`, `max-width: 452px` against a 760px column.
  (Verified on the public share render, https://g.co/gemini/share/317e8aa52101.)
- **Perplexity** — ancestor `flex justify-end`; bubble `bg-subtle rounded-2xl p-3`,
  measured 226px flush right against a 720px column.

So the brief's framing — "a mobile-messaging idiom that desktop agent tools have moved
away from" — **is not what the evidence shows.** Desktop moved *toward* it. Nothing in the
survey shows any product removing right-alignment.

---

### Evidence *against* — the honest counter-case

**1. Eleven of twelve developer agent tools do not right-align.** Across VS Code, Zed,
Cline, Cursor, Warp, JetBrains AI Assistant, Junie, Antigravity, Claude Code CLI, Aider,
Codex CLI and Gemini CLI, **VS Code is the only one.** What the other eleven do instead:

| | User turn | Row kinds |
|---|---|---|
| **Cursor** | Full-width tinted, hairline-bordered block, flush left | Muted collapsed summary rows; plan artifacts as bordered chevron cards |
| **Warp** | Circular initial avatar in a left gutter, **pink left accent bar**, `↳` glyph | "Thought for 1 second ›" collapses; `✓ Completed` step rows; red accent bar for command blocks |
| **JetBrains AI** | Full-width rounded block one step lighter than the pane, **no avatar** | Wrench icon + monospace tool name, args in a bordered card, chevron at right |
| **Antigravity** | Full-width bordered box, revert/rewind icon at the right edge | Artifacts leave the transcript entirely, into a review pane |
| **Zed** | "a dark, lightly bordered box" | Left rules and indents |

Warp is the only one documenting its devices in prose: "Agent conversation views are
identified with an **alternative background color**"; "you'll see both the **pink highlight
bar on the left side of the block** and a **bent follow-up arrow (↳) next to your input**."
https://docs.warp.dev/agents/local-agents/interacting-with-agents/ Its block model
distinguishes input from output "into one atomic unit" by weight and vertical position
inside one shared box — never alignment. https://docs.warp.dev/terminal/blocks
For Cursor, JetBrains and Antigravity the alignment reading is **inferred from official
docs and changelog screenshots, not from prose** — those docs say nothing about alignment.

**2. VS Code paid for its bubble by deleting the user's identity marker.** It is the only
tool in the set that removed the request avatar and name header (`header-disabled {
display: none }`) to make room. Everywhere else the identity marker and the container
coexist, or the identity marker *is* the whole mechanism — Warp's gutter initial,
JetBrains' bold "⛭ Junie" name row. That is a direct trade against Orcastrate's
`Labelled` "You"/"Claude" text, which the frozen contract requires to stay.

**3. Alignment is a one-bit channel, and it is abandoned the moment a third row kind
exists.** This is where the survey is genuinely unanimous, and it is the strongest single
result of the round:

- **Ant Design X** is the cleanest proof: `Bubble` takes `placement: 'start' | 'end'` —
  two values, no third — and **`Bubble.System` has no `placement` prop at all**, styled
  `{ width: '100%', justifyContent: 'center' }`. `system` and `divider` are reserved role
  names in `Bubble.List`. They *removed* alignment from the API rather than adding a third
  value to it. https://x.ant.design/components/bubble
- **IBM Carbon AI Chat** — user at `justify-content: flex-end`; the system message source
  comment reads "Standalone system message (no bubble, centered between messages)". Errors
  are a *third* treatment again: a left icon gutter (`margin-inline-start: -16px`) plus
  `$text-error`, no bubble, no alignment change.
  https://github.com/carbon-design-system/carbon-ai-chat
- **Salesforce SLDS Chat** — `.slds-chat-listitem_outbound { justify-content: flex-end }`,
  but `.slds-chat-event { justify-content: center; text-align: center; width: 100%; }`
  with flanking rules and an icon. **Errors are events**
  (`<ChatEvent hasError symbol="error">`), not a third alignment.
  https://lightningdesignsystem.com/components/chat
- **Fluent / Teams** — `ChatMyMessage` is `alignSelf: 'end'` with no avatar slot;
  `ChatMessage` is flex-start with one, and `avatarLessContainer { marginLeft: 40px }`
  preserves the gutter even when the avatar is hidden. Extra kinds ride the existing row
  as `decoration: 'important' | 'urgent' | 'mention'` →
  `borderLeft: 3px solid` + coloured icon + uppercase label.
- **Vercel AI Elements** — `from` is typed `UIMessage["role"]` **including `"system"`, and
  system gets no styling at all**: it silently falls into the assistant branch. This is
  precisely argument 1's failure mode, shipped. Its other row kinds are alignment-free
  components: `Tool` is `"group not-prose mb-4 w-full rounded-md border"` — a full-width
  bordered `Collapsible` with a status badge (Pending / Running / Completed / Error /
  Denied); `Reasoning` is `cn("not-prose mb-4")`, full-width left; `Task` nests via
  `"border-muted border-l-2 pl-4"`.
- **Atlassian's `@atlaskit/comment`** has no alignment prop at all; kind rides "a
  **lozenge** at the top of the comment."
- **Material 3 and Shopify Polaris ship no chat component at all** — no evidence either
  way, in either direction.

Where transcripts genuinely carry many row kinds, the encoding is a **left gutter**, and
it is specified literally. irssi's `themes/default.theme`: `line_start = "-!- "` on every
non-speech line, `msgnick = "<$0$1-> "`, `action_core = " * $*"`, `notice = "-$*-"`,
`error = "%R$*%n"`. WeeChat formalises it into a prefix *column* — `prefix_error "=!="`,
`prefix_join "-->"`, `prefix_quit "<--"` — and `weechat.look.prefix_align` aligns that
gutter **shared across all kinds**, the exact opposite of using alignment to separate them.
CI viewers do the same with four other channels: GitHub Actions' `::error::` / `::warning::`
/ `::notice::` route severity out of the log stream into annotations, `::group::` gives
"an expandable entry" whose contents are "indented below", `::debug::` gates visibility
behind `ACTIONS_STEP_DEBUG`. Buildkite is the sharpest: three group kinds by line prefix,
where `~~~` is "visually de-emphasized through the use of non-bold text" — **a row kind
encoded by font weight.**

**4. Zed's users say background + border alone is too weak.** The live discussion
[zed#53162](https://github.com/zed-industries/zed/discussions/53162) opens with "both user
input and AI responses render with the same background/border styling, making it difficult
to distinguish who wrote what," and a maintainer concedes "the user message
border/background can be visually close to the surrounding panel and assistant content."
The proposed tokens are `assistant.user.message.background` / `.border` / `.border_radius`
/ `.padding` — **and no participant proposes right-aligning.** This cuts both ways: it is
evidence that a box alone under-delivers, *and* evidence that even people actively unhappy
with the box do not reach for alignment.

**5. A channel nobody in the brief listed: typeface.** Zed splits
`agent_ui_font_family` (agent responses) from `agent_buffer_font_family` (the message
editor **and user messages**). https://zed.dev/docs/visual-customization

---

### The accessibility position, stated precisely

**Alignment is not conveyed to assistive technology, but that is not an argument against
alignment — only against alignment *alone*.** The brief's argument 3 is true and
misaimed.

- WCAG 1.3.1: "Information, structure, and relationships conveyed through presentation can
  be programmatically determined or are available in text."
  https://www.w3.org/WAI/WCAG22/Understanding/info-and-relationships.html
- WCAG 1.3.3 names "visual location" among sensory characteristics that must not be relied
  on alone — **but its scope is "instructions provided for understanding and operating
  content", not content identity**, so it is suggestive here rather than binding.
  https://www.w3.org/WAI/WCAG22/Understanding/sensory-characteristics.html

**There is no ARIA pattern for a chat transcript.** The APG's 30 patterns include Feed,
Grid, Log-adjacent live regions and Window Splitter — but no chat, conversation or
transcript pattern. https://www.w3.org/WAI/ARIA/apg/patterns/ The available machinery is
`role="log"` (ARIA23: "The region is marked with `role="log"` so that new additions are
announced by ATs" — https://www.w3.org/WAI/WCAG21/Techniques/aria/ARIA23.html) and the
Feed pattern's `role="article"` with "`aria-labelledby` referring to elements inside the
article that can serve as a distinguishing label."
https://www.w3.org/WAI/ARIA/apg/patterns/feed/

**The shipped answer for speaker identity is a text label, and it is often visually
hidden.** Microsoft's Bot Framework Web Chat settled on narrating "**Bot said:**" /
"**You said:**", changed "User said" → "You said" for clarity, moved announcements to a
separate hidden live region, and concluded "It is okay to not having `role="log"` or
`role="feed"` on our transcript, `role="list"` and `role="listitem"` should be sufficient."
https://github.com/microsoft/BotFramework-WebChat/issues/3236 Gemini ships exactly this:
its only "You said" string is `<span class="cdk-visually-hidden">`, computed
`clip: rect(0,0,0,0)`, `width: 1px`. Fluent documents `ChatMyMessage`'s `author` slot as
"Invisible author name for screen reader."

**Two consequences.** First: right-alignment plus a visually-hidden label is a
WCAG-conformant, shipped combination — the accessibility objection does not by itself rule
it out. Second, and more useful: **Orcastrate is already ahead of all of them.**
`TranscriptEventItem.tsx` renders "You" / "Claude" / "Thinking" / "Tool: …" as *visible*
real text via `Labelled`, and `TranscriptPane.tsx:225-228` already carries
`role="log" aria-live="polite" aria-relevant="additions"` plus an `aria-label` — more than
Vercel AI Elements' `conversation.tsx`, which has `role="log"` and nothing else.

---

### Reading measure: the arithmetic, computed from this repo

The relevant guidance, and it does bound both ends:

- **WCAG 1.4.8**: "Width is no more than 80 characters or glyphs (40 if CJK)"; separately,
  "Text is not justified" — a rule about *justification*, not about right-alignment.
  https://www.w3.org/WAI/WCAG21/Understanding/visual-presentation.html
- **WebAIM**: "fewer than around 50 or more than around 120 characters per line will
  likely introduce difficulty," and "Left-aligned text is almost always the easiest to
  read." https://webaim.org/techniques/textlayout/
- **Baymard**: 50–75 CPL; "if a line is too short the eye will have to travel back too
  often, breaking the reader's rhythm." https://baymard.com/blog/line-length-readability
- **Butterick**: 45–90 characters — and notably **does not warn about short lines at all**.
  https://practicaltypography.com/line-length.html
- Ling & van Schaik (2007, *Displays* 28(2):60–67) found left-aligned beat **justified** on
  accuracy and speed. It did **not** test right-alignment; do not cite it as if it did.
  https://www.sciencedirect.com/science/article/abs/pii/S0141938207000133
- The British Dyslexia Association style guide's "left align text, without justification.
  This makes it easier to find the start and finish of each line" is the closest thing to a
  direct argument, and it too is aimed at justification.
  (Direct PDF fetch returned 403; quote taken from the search index — **treat as
  second-hand until read from the PDF.**)

Now the repo's own numbers. `window.ts` opens at **1280×800** with **minWidth 940**;
`WorkspaceLayout.module.css:85` splits into `minmax(0,1fr) minmax(0,1fr)` — **equal**
halves — behind a 240px lane rail, with 12px list padding each side. Character widths
below are **estimates** (sans ≈ 0.5em at `--oc-text-md` 13px → 6.5px; mono ≈ 0.6em at
`--oc-text-sm` 12px → 7.2px) — *judgment, not measurement*.

| | pane usable | prose full-width | code (mono) | prose at a 70% cap |
|---|---|---|---|---|
| **W = 1280** (default, split) | 496px | **~76 ch** | ~66 cols | **~53 ch** |
| **W = 940** (minWidth, split) | 326px | **~50 ch** | ~43 cols | **~35 ch** |

Break-even for a 70% cap against WebAIM's ~50-character floor: **W ≈ 1216px.**

**So argument 2 is conditionally true, and the condition is now known.** At the default
window a capped user turn sits at ~53 characters — just inside the floor. Near `minWidth`
it falls to ~35, which is mobile measure. And the split pane is already at ~43 mono columns
for code at `minWidth`, *before* anything narrows.

**But the contract's actual mechanism is much cheaper than a 70% cap.**
`contracts/transcript-turns.ts` specifies an inset "by at least `--oc-space-6`" = 24px
(verified: `tokens.css:68`, and `bgRaised`/`borderStrong`/`space6` all present in
`contracts/renderer-theme.ts` — the "no new token" claim **holds**). The inset alone costs
~4 characters at the default window (76 → 72) and only crosses the floor near `minWidth`
(50 → 46, or ~43 once a raised block's padding and border are counted). **It is the
additional max-width cap, not the inset, that would be expensive.** Note that AI Elements
caps at `max-w-[95%]` with `w-fit` — shrink-to-fit for short messages, effectively
uncapped for long ones — not the 60–75% the bubble literature assumes.

**One primary-source counterweight worth weighing:** `chat.requestCodeBorder` — "Border
color of code blocks within the chat request bubble" — exists because VS Code *expects code
inside the human's turn*. In a coding agent the user pastes stack traces and diffs. Any cap
on the user's measure is a cap on those too, and Orcastrate renders `user_message` through
`.eventText` (prose styling, `pre-wrap`), not through `.eventCode`.

---

### The hybrid that shipped products actually use

Converged across VS Code, Zed, Cursor, Warp, JetBrains, Antigravity, AI Elements, Carbon,
SLDS and Fluent — **a container plus a label, with alignment optional and never
load-bearing**:

1. **A container on the user's turn** — background + border + radius + padding. Universal.
   The one thing every tool in the survey does.
2. **An identity marker** — visible name row (JetBrains), gutter avatar (Warp), or
   visually-hidden text (Gemini, Fluent). Being *removed* from the user row, not added:
   VS Code deleted its; JetBrains and Cursor never had one.
3. **A left gutter for row kind** — accent bar, prefix glyph, or icon. Warp's pink and red
   accent bars, Fluent's `borderLeft: 3px`, SLDS's event icon, irssi's `-!- `.
4. **Full-width collapsible cards for tool activity**, with a status badge and a chevron —
   explicitly *outside* the alignment axis.
5. **A left rule plus indent for nested content** — AI Elements' `border-l-2 pl-4`, Zed's
   `border_l_1()`. This corroborates the frozen contract's `└`-glyph-and-indent choice for
   `tool_result` as two rows rather than one merged row.

Orcastrate's frozen contract already sits inside this convention on every point. Its one
divergence is direction: it insets from the **left** with a capped measure (block's *left*
edge fixed), where AI Elements and VS Code use `ml-auto` (block's *right* edge fixed, left
edge floating with content length). **Judgment, not a cited finding:** a fixed left edge is
the better of the two here, because consecutive right-anchored blocks start at different x
positions — though note the limit of that argument, which is that lines *within* a single
block still share a left edge either way, so the raggedness is between blocks, not within
them.

---

### Corrections to premises in the research brief

**1. "Seven row kinds" is wrong — there are twelve.** `EVENT_TYPES` in
`src/main/store/schema.ts:65-78` and the `EventType` union in
`src/shared/contracts/events.ts` both carry **twelve** members: `user_message`,
`assistant_text`, `thinking`, `tool_use`, `tool_result`, `lane_opened`, `lane_closed`,
`permission_request`, `permission_decision`, `system`, `error`, `malformed`. The brief's
seven collapses `thinking` into assistant, merges the two permission types, bundles
`lane_opened`/`lane_closed`/`system`, and drops `error` as distinct from `malformed`.
`TranscriptEventItem.tsx` renders all twelve and its own comment says so ("adding a
thirteenth payload to the contract breaks `typecheck:web`"), as does T2's first acceptance
criterion ("CORRECT FOR ALL TWELVE `EventType` MEMBERS"). **The error is also in the frozen
contract's prose**: `contracts/transcript-turns.ts` says "a transcript of seven row kinds"
while its own section 1 enumerates 1 + 4 + 7 = 12. Comment-only, no type or signature
affected — correctable at Gate 3 exactly as amendment E2 was.

**2. The `malformed` objection is real but understated, and it points the other way too.**
The brief says the non-conversation rows "default to reading as 'assistant' — which is
false for `malformed`." True. But `permission_decision` is the sharper case: in the normal
path it records **the human's** answer — `pod-runner.ts:392` emits the user's
`allow` / `allow_always` / `deny` with their reason. It is *also* emitted by the system on
abort (`:381`, "the turn was interrupted before the user answered") and on handler failure
(`:404`). **Its authorship is mixed and path-dependent, so no static alignment can be
correct for it.** The frozen contract maps it to `'system'`, which is a defensible reading
of a mixed-authorship row and does not need to change — but it is worth knowing that the
row is not purely machine-authored, and that a two-bucket scheme would misattribute it in
*both* directions depending on the path taken.

**3. "Desktop agent tools have moved away from right-alignment" is false.** They moved
toward it. VS Code adopted it in May 2025; ChatGPT, Gemini and Perplexity all ship the
right-offset form today. No product in the survey was found removing it. The true statement
is narrower and stronger: *no product uses alignment to encode more than two buckets.*

**4. Argument 3 as phrased doesn't do the work asked of it.** "Alignment carries nothing to
assistive technology" is an argument against alignment *alone*, not against alignment.
Since Orcastrate already ships visible "You"/"Claude" labels, argument 3 is **neutral** on
the question actually being decided.

**5. The mobile-messaging pedigree is weaker than assumed.** Apple's HIG has **no Messages
page** — both `/human-interface-guidelines/messages` URLs 404 — and Apple never documents
adding sender names or avatars in group threads. The only bubble distinction Apple's user
docs draw is *colour*, not side: "messages appear in green bubbles instead of blue ones"
(https://support.apple.com/guide/iphone/iphb10c80fc5). Where Apple does use alignment it is
for field roles *inside* one bubble (`caption` vs `trailingCaption` in
`MSMessageTemplateLayout`). **Do not rest the argument on mobile group chat.** Rest it on
Ant Design X, Carbon, SLDS, irssi/WeeChat and the CI viewers, which specify their encodings
literally.

---

### Open questions the research could not settle

1. **What Claude.ai and Claude Desktop actually do.** Both are behind authentication with
   no reachable public share render, and no snapshot exists. Deliberately *not* asserted
   from memory. This is the most decision-relevant gap, since Orcastrate hosts Claude Code
   — resolvable in about a minute from the user's own logged-in browser.
2. **Microsoft Copilot web** — hard sign-in wall, no guest mode, no archived share pages.
   Unverified.
3. **Whether the exact VS Code selector right-aligns in the default theme** or whether the
   `border-left` rule seen in `chat.css` is the high-contrast path. The PR, the theme
   tokens and a local 1.134 install all agree on the bubble; only the summarized CSS fetch
   dissented. Low stakes, but it is the one place two sources disagree.
4. **Why VS Code deleted the request header when it added the bubble** — whether the
   avatar and name were judged redundant, or merely in the way. PR #249681 shows the
   header hidden and mentions a future header redesign, but not the reasoning. This is the
   single fact that would tell us whether container-plus-label is genuinely additive or
   whether the two compete for the same signal.
5. **Whether Orcastrate users ever run the split at `minWidth`.** The measure objection is
   ~4 characters at 1280 and decisive at 940; which regime matters is a usage question this
   project's own session logs could answer and the survey cannot.
6. **Whether the user's turn should be allowed to carry code at full measure.** VS Code's
   `chat.requestCodeBorder` says yes in principle; Orcastrate renders `user_message` as
   prose. Not in scope for T2's frozen criteria, but it is the case where a capped measure
   would hurt most.
