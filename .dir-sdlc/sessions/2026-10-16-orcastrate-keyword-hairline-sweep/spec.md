# Keyword hairline sweep — finish the border-width census one keyword over

Convert the six surviving keyword `thin` border widths to `var(--oc-border-hairline)`, widen
both border-width predicates to the keyword forms, retire the false deferral prose that said
doing so was a design decision, and prove the conversion zero-pixel in the real app rather
than asserting it.

## Context

C3 closed `font-weight` and left `letter-spacing` and `border-width`. The token sweep
(2026-10-12) closed **raw-length** border widths — 36 declarations, all exactly `1px` — and
deleted `PRE_TOKEN_SHELL_DECLARATIONS`, the project's last token exception list, replacing it
with three repo-wide two-sided censuses. It left **keyword** border widths. Six survive, all
`thin`, in two files that were invisible twice over: they sit outside the three legacy roots
`beachcomber/`/`helm/`/`shell/`, so the old scoped rule never saw them, and the token sweep
never touched them.

This is the same defect class, one step along, for the third time. What makes it cheap now is
that the hand-run measured `thin` and a declared `1px` to the **same used width**, twice, on
two checkouts from two different builds — so the conversion is zero-pixel in the engine that
ships, which is the opposite of how `hygiene.test.ts` currently frames it.

**Baseline, measured by the orchestrator on the quiescent main checkout at `6914e49`:**
`Test Files 141 passed (141)`, `Tests 2248 passed (2248)`, `npm run typecheck` exit 0 over
both programs.

## Definition of done

1. The six `thin` border widths — `composer/Composer.module.css:15,44,70` and
   `permissions/PermissionCards.module.css:27,85,100` — read `var(--oc-border-hairline)`, the
   width term substituted alone, no shorthand split, no colour term changed.
2. The repo-wide census predicate flags a **bare** border-width keyword (`thin`, `medium`,
   `thick`) as an offender, as it already flags a raw length — shown able to fail by injection
   outside the three legacy roots, and shown **not** to flag the near-miss population.
3. The scoped rule's `borderOffenders` widens on the same predicate, shown able to fail by an
   injection **inside** the three roots, since those roots contain none of the six and an
   un-injected scoped run proves nothing.
4. `hygiene.test.ts` carries no claim this session falsifies — stated as that property, not as
   a list of strings to delete.
5. The hand-run driver keys each converted declaration by the **declaration**, carrying every
   selector in its group, so a declaration is reached when **any** of them renders; and the
   grouped selector that exposed this (`transcript/Transcript.module.css:45-46`) is reported
   measured rather than `not reached`.
6. A driven run measures the six conversions in the real Electron window, every width reported
   as an equality against a declared `1px` measured in the **same window**, with no pixel
   literal as an expectation anywhere. A site that proves unreachable is a recorded limit with
   a reason written before the run.
7. The stale contrast count in `styles/tokens.css:85-89` is re-derived and corrected to what is
   measured, over both the shipped population and the population that pre-dated
   `--oc-status-stopped`, with both numbers stated if they differ.
8. `npm run typecheck` exits 0 over both programs, `npx vitest run` passes repo-wide against
   the 141 / 2248 baseline, and `npm run build` exits 0 — all on the quiescent tree, on the
   DAG tail.

## Scope

Two stylesheets, two test files, `styles/tokens.css`, `hygiene.test.ts`, and the hand-run
directory. Five tasks: T1 and T2 convert, T3 corrects the count, T4 widens both predicates and
retires the prose, T5 runs the instrument and carries the repo-wide tail gates.

### Not in scope

- **The palette-wide separation pass.** Item 7 is a count correction, which needs no design
  decision. No token value changes. The open question of whether the hygiene guard should
  assert *measured* separation rather than string inequality stays on the backlog.
- **A live-`claude` hand-run harness.** Still the highest-value instrument this project lacks,
  and the reason most previously unreachable sites remain unreachable.
- **Rewriting `driver/run-token-sweep.mjs`.** Each session ships its own driver; see the Gate 2
  decision recorded against T5's criterion 10.
- **The two unenforced docblock enumerations** in `pods/PodBar.module.css:1-8` and
  `pods/DeletePodDialog.module.css:1-5`. On the backlog; this session must not add a third.

## Assumptions

| Question | Answer | Rung | Evidence |
|---|---|---|---|
| Is converting `thin` to a `1px` token a visual change? | No, in the engine that ships. `thin` and a declared `1px` resolve to the same used width — measured twice, on two checkouts. | repo | `VERIFY-MERGED-MAIN.md:58-69`; the token sweep's T6 |
| Does that make it a standards claim? | **No.** The CSS specification fixes only the `thin < medium < thick` ordering and leaves the widths UA-defined; MDN states `thin` ≡ `1px`. Every artifact repeating the claim must word it as an engine measurement on one display. | external | MDN; CSS Backgrounds and Borders |
| May the `0.8px` figure be asserted? | **Never.** It is this display's device-pixel quantization. What survives quantization is an equality between two values measured in the same window. | repo | Token sweep amendment A2; the driver's own `oneCssPx` construction |
| Do `medium` or `thick` ship in any declaration? | Not as a **bare keyword**. The unqualified form in the handoff brief is what a widened predicate gets wrong. | repo | Term-anchored census → 6, all `thin`; orchestrator reproduced independently |
| What is the load-bearing near-miss? | **`var(--oc-border-thick)`** — a token whose *name* ends in a width keyword. 7 declarations, 5 of them inside the scoped roots. A substring predicate flags all 7 and goes red on a clean tree. | repo | Unanchored reading → 13; 13 − 7 = 6. Orchestrator reproduced: 13, 7, 6 |
| What metric is `tokens.css`'s count in? | **WCAG 2.x contrast ratio** over sRGB relative luminance, not CIE lightness, despite the prose's wording — the file states its own figures that way. | repo | `tokens.css:80-86` ("WCAG contrast 1.796 against `idle`") |
| What population is it over? | The **8** shipped `--oc-status-*` tokens, read two ways. Note that "five" was written by the session that *added* `stopped`, so a correct original may have counted 7 tokens; both populations are derived. | repo | `grep -nE '^\s*--oc-status-[a-z]+\s*:'` → 8; `renderer-theme.ts` → same 8 |
| Is there a contrast helper to reuse? | No. | repo | `lanes/LaneRail.styles.test.ts:163` records that relative luminance was not needed there |
| Are the `composer/` and `permissions/` sites reachable in the hand-run? | **Unmeasured — the open question this session answers.** `.composer`/`.input`/`.send` render together with no conditional between them; `PermissionCardList` returns `null` on an empty list and a card needs a live `claude` process. Asserted nowhere; an unreachable site is a recorded limit. | repo (read, not measured) | `Composer.tsx:126,133,173`; `PermissionCardList.tsx:35` |

## Contracts

`contracts/keyword-hairline-sweep.ts` — declarations only; T4 owns the matcher, T5 owns the
driver. It carries the two sample sets (`KEYWORD_MUST_FLAG`, `KEYWORD_MUST_PASS`), the six
sites, the term-match requirement, the scoped-rule decision, the enumeration requirement, the
measurement protocol, and the exact strength the zero-pixel claim may be stated at.

## Open questions

| Question | Who resolves it | When |
|---|---|---|
| Are the six converted sites reachable in a sandboxed run with no live `claude` process? | T5, by running the instrument | At T5's run; an unreachable site is recorded with its reason, never called unmet |
| Should the hygiene guard assert *measured* colour separation rather than string inequality? | The user, in a later session | Stays on the backlog; out of scope here |
