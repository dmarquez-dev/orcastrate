# C3 — theme-contract members, PanelBar's open-state attribute, and two prose repairs

Resolve the five items sub-sessions C1 and C2 deferred: give the theme contract the
two members its consumers have been working around, move `PanelBar` off an attribute
that describes a toggle it no longer is, and make two false docblocks true.

## Context

Sub-session C3 of the Large routing over the 2026-08-20 backlog block. Its scope was
handed over in `.dir-sdlc/handoff-c3.md`, written at `9c8ad46`; every citation in that
brief was re-verified against `41f274e` at kickoff and all of them held. Two of the
five items had their **breadth** wrong, and both were corrected before decomposition:

- The opaque scrim is **four sites, not one**. The brief named `.confirmScrim`'s sole
  consumer correctly and the defect's extent incorrectly. A census of all eleven
  `var(--oc-bg-app)` CSS consumers found four full-window scrims sharing one identical
  declaration triple, and `beachcomber/BeachcomberPreviewDialog.module.css:8-10`
  records the missing alpha layer as the cause for itself *and* for `NewPodDialog`.
- The amendment target for the clearing list is the **live** contract
  (`src/renderer/src/contracts/renderer-panels.ts:406-411`), not C1's frozen session
  artifact, which carries the same list and which this project never edits.

Three of the five items were decisions rather than implementations, and all four
escalations (E1–E4) were raised as one batch and signed at kickoff. Nothing in this
spec re-opens them.

The theme contract has been amended twice before, both times additions-only, and the
second amendment's own comment records the rationale this session reuses: six
renderer directories independently reached for bare values "because `TOKENS` had
nothing to offer, and every reviewer called it a token-set gap rather than a
deviation" (`contracts/renderer-theme.ts:140-148`). Five directories did the same
thing with `font-weight: 600`; four did it with an opaque scrim.

## Definition of done

**E1 — the semibold weight**

1. `TOKENS` declares `weightSemibold: '--oc-weight-semibold'`, additions-only, under
   an amendment comment stamped with this session's slug.
2. `styles/tokens.css` defines `--oc-weight-semibold: 600` exactly once, inside its
   single `:root` block, in the existing weights group so the ramp reads 400/500/600/700.
3. All **ten** bare `font-weight: 600` declarations consume the token instead, at the
   ten named selectors; no `*.module.css` under `src/renderer/src` sets
   `font-weight: 600` afterwards.
4. The **five** remaining bare `font-weight` declarations take their existing
   `--oc-weight-regular` / `--oc-weight-bold` tokens, so no `*.module.css` sets
   `font-weight` to a literal anywhere. Zero pixel change — those tokens are already
   defined at exactly `400` and `700`.
5. `PRE_TOKEN_SHELL_DECLARATIONS` no longer pins the `EmptyWorkspace` font-weight
   entry, leaving its five border entries, and the hygiene suite passes.
6. That pin's docblock and the file header carry **no claim this change falsifies** —
   the criterion is the absence of a falsified claim, not the deletion of an
   enumerated set of strings.

**E2 — the overlay token**

7. `TOKENS` declares `overlayScrim: '--oc-overlay-scrim'` as a new family, not an
   `--oc-bg-*`, under the same stamped amendment comment.
8. `tokens.css` defines the overlay with an alpha strictly between 0 and 1 and
   introduces no new colour literal.
9. All **four** full-window scrims declare `background: var(--oc-overlay-scrim)`, so a
   dialog veils the window instead of hiding it.
10. The **seven** legitimate `var(--oc-bg-app)` surfaces are unchanged.
11. `BeachcomberPreviewDialog.module.css`'s "opaque rather than translucent" paragraph
    is rewritten to state what is true once the token exists.
12. A two-sided census in `hygiene.test.ts` guards both conversions against
    regression, with CSS comments stripped, and each new matcher is proved able to
    fire against a synthetic violation and its clean twin. The font-weight half is
    the **universal** rule — no `*.module.css` sets `font-weight` to a non-token,
    with no exception list — and it walks every `*.module.css` under
    `src/renderer/src`, not the three directories the existing offender scan covers.

**E3 — PanelBar's open-state attribute**

13. The open panel's button exposes `aria-current="true"` and no other panel button
    does; no `aria-pressed=` remains in `PanelBar.tsx`.
14. `PanelBar.module.css`'s open-state rule selects on the new attribute.
15. `aria-pressed` survives untouched on the seven files carrying genuine two-state
    toggles.
16. Both rationale docblocks — `PanelBar.tsx:31` and `PanelBar.module.css:8-11` —
    name the attribute that now carries the state, and keep the argument that the
    state is expressed once in the accessibility tree with colour merely following it.
17. The test case C1's criterion 11 protected is edited under E3's sanction, still
    asserts open state is carried non-visually, and its name claims no more than its
    assertions check.

**E4 — the clearing list**

18. The live `incoming` clearing list names the panel-close whole-state reset as a
    fifth clearing event, stamped with this session's slug, and the word `EXHAUSTIVE`
    becomes true rather than being removed.
19. `resetHelmForReopen`'s own docblock names `incoming` alongside the document and
    the draft.
20. T2's diff changes no executable statement, type, signature or exported value, and
    C1's frozen `helm-draft-safety.ts` is untouched.

**Item 5 — the criterion-6 reading**

21. `HelmPanel.tsx`'s docblock above the comparison gate records which reading of
    C1's T4 criterion 6 governs, naming the discipline rule the criterion
    transcribed and the unreachability finding that settles it.
22. The comparison gating is byte-identical to the task's `startRef`.

**Session gates**

23. `npm run typecheck` passes, covering both `typecheck:node` and `typecheck:web`.
24. `npm test` on the quiescent tree reports 0 failures, at least 141 test files and
    at least 2233 tests.
25. No task's diff contains a file outside that task's `owns` globs, stated
    path-scoped.

## Scope

The five items the handoff brief verified, as corrected above. Three tasks, all
`frontend` domain, 16 explicitly-named owned files with no wildcards and no
intersection between any pair.

### Not in scope

- **The `compareRequested` latch and `COPY.comparisonEmpty`** — closed by C2 and
  verified closed in code at kickoff.
- **The four "unconsumed tokens"** (`borderThick`, `trackingTight`, `weightRegular`,
  `weightMedium`) — void as scope. They have 22 real `var()` declarations; the check
  that called them unconsumed grepped the TypeScript identifiers where stylesheets
  only ever write the CSS variable name.
- **The entire `2026-09-30` backlog block** — C2's own eleven deferrals
  (`BackupSequence` per-instance state, the empty-serialization pin, the two
  unreachable invariant holes, `blockedBy` identity, the `noUncheckedIndexedAccess`
  discipline gap, three test/CI concerns, three cosmetics). The handoff brief's scope
  line named this block while its verified item list did not cover it; the user
  settled the boundary at Gate 1 in favour of the verified five.
- **`panel-close-guard.tsx`'s criterion-2 phrasing note** — a recorded lesson about
  phrasing criteria against behaviour rather than identifiers, not work.

## Assumptions

| Question | Answer | Rung | Evidence |
|---|---|---|---|
| Which reading of C1's T4 criterion 6 governs? | The one C1's reviewer took. The criterion transcribed a discipline rule about the states **of a fetch**, not about whether the surface mounts before a fetch is possible. `HelmComparison` declares all three states whenever a draft exists; with no scope chosen there is no fetch, no pending edit and no file. | 1 | `disciplines/frontend.md` "Data fetching" — "Every fetch has a declared loading state, a declared error state, and a declared empty state"; `helm/HelmPanel.tsx:118-124`; C1's finding that `draft === null && incoming !== null` is unreachable |
| What is the overlay token called, and which family does it join? | `--oc-overlay-scrim` / key `overlayScrim`, a new family rather than an `--oc-bg-*`. The `--oc-bg-*` ramp is five surfaces back-to-front; a scrim sits above all five and veils rather than backs. | 1 | `contracts/renderer-theme.ts:97-107`, which makes exactly this families-stay-apart argument for `--oc-action-*` vs `--oc-status-*` |
| What is the overlay's value? | `color-mix(in srgb, var(--oc-bg-app) 70%, transparent)` — derives the hue from the existing token and adds only alpha, so no new colour literal is invented anywhere. | 1 | `beachcomber/BeachcomberPreviewDialog.module.css:8-10` records "inventing one would be a color literal" as the blocker; this answers it on its own terms. Verified safe against `styles/tokens.test.ts:30`'s `declaredNames` regex — the nested `var(--oc-bg-app)` is preceded by `(` and followed by `)`, so it matches neither the `(^\|[;{])` prefix nor the trailing `:` |
| Is `color-mix()` available at runtime? | Yes. | 3 | Electron 43 ships Chromium ≥140; `color-mix()` is supported from Chromium 111. No test in the suite evaluates CSS — every style suite reads stylesheets as text — so nothing depends on it either way |
| Is T2 `frontend` or `architecture`? | `frontend`. Every file it touches is under `src/renderer/`, and the session composed no `architecture.md`, so an architecture-domain task would be dispatched with no discipline at all. | 1 | The three owned paths; `disciplines/` holds backend, database, frontend, test |
| Is the 141-file / 2233-test baseline measured this session? | **Yes, measured — this row was `Attributed` when the spec was signed and was upgraded mid-session.** The orchestrator ran `npm test` in the worktree at `5ba2f3e`, after T1 and T2 were committed and before T3 was dispatched — the one moment the tree sits at exactly the pre-T3 state and is quiescent. Result: `Test Files 141 passed (141)`, `Tests 2233 passed (2233)`, 82.29s. This confirms the handoff brief's attributed figure exactly, and is consistent with T1 and T2 adding no test files. `npm run typecheck` exited 0 over both programs at the same ref, so any T3 typecheck failure is attributable to T3. | 1 — measured | `npm test` and `npm run typecheck` at `5ba2f3e`, this session |

## Contracts

**None.** `contracts/` is empty and `manifest.json` declares no `contracts` array.
`dir-contracts` is explicit: "If only one task will ever touch an interface, it does
not belong in `contracts/`." T3 is both the sole writer and the sole consumer of both
new `TOKENS` members — it adds the keys, defines the properties, and writes all
fourteen `var()` call sites — so there is no inter-task boundary to freeze. The token
names, the value and the full site inventory are carried verbatim in T3's acceptance
criteria, which is the only artifact `dir-reviewer` judges against.

E4 adds no operation either: it is prose inside an existing field's docblock.

## Open questions

**None.** Two were open when this spec was drafted; both were decided at Gate 2 and
are folded into the manifest above.

| Question | Decision |
|---|---|
| Do the five bare non-600 `font-weight` declarations join T3, letting the new hygiene census be the universal rule instead of one scoped to the literal `600`? They are a different defect — bare literals whose tokens already exist, so converting them changes zero pixels — and sat outside E1's signed answer, which is why the architect declined to expand it. | **Yes.** `pods/PodBar.module.css` becomes T3's 11th owned file, all five convert, and criterion 12's font-weight half becomes universal with no exception list. |
| T3's criterion 11 enumerated three strings to delete from the pin's docblock, but the change falsifies more of it than those three — the opening line `THE DECLARATIONS THIS RULE FINDS THAT THIS TASK DOES NOT FIX`, and the claim that fixing them `belongs to whoever owns shell/, with the weight decision made deliberately`. As drafted, it was satisfiable while leaving the docblock's first line false. | **Broadened.** The criterion is now the absence of any claim this task falsifies, with the five known instances named as instances rather than as the obligation. |

