# Token sweep — close the hygiene blind spot for `letter-spacing` and `border-width`

Finish what C3 started: bring the last two bare-literal properties under a repo-wide
census with no exception list, and empty the project's final token exception pin.

## Context

C3 (`2026-10-09-orcastrate-theme-contract-decisions`, merged at `10feee6`) discovered that
the pre-existing token hygiene rule in `src/renderer/src/__tests__/hygiene.test.ts` walks
only `TOKENISED_STYLE_ROOTS` — `beachcomber/`, `helm/`, `shell/`. That is why bare
`font-weight` literals in `lanes/`, `pods/` and `transcript/` were never offenders and
survived a session whose whole subject was font-weight tokens: **the rule was never looking
at them.** C3 closed that trap for `font-weight` only, with a repo-wide census at the foot
of the file. `letter-spacing` and `border-width` are still inside the blind spot.

`PRE_TOKEN_SHELL_DECLARATIONS` is the last tolerated-declaration list in the project. Its
own docblock states its purpose: *"the exception list shrinks under review rather than
quietly outliving the problem."* All five of its entries are exactly `1px`, and
`--oc-border-hairline: 1px` has existed with 24 consumers the whole time — so the
docblock's claim that these are lengths "for which the token set has no entry" is false.
This session can empty the list and delete it.

**Kickoff re-measurement corrected five claims in the handoff brief**, including the one
that changes the session's size: the brief billed 7 bare border widths, and there are 36.
The brief counted declarations referencing no `--oc-*` token at all; the rule's actual
predicate (`borderOffenders`) flags any raw length in a `border*` value regardless of
whether a colour token is present. Converting only 7 while enabling a repo-wide census
with no exception list would turn the suite red on the 29 survivors, so the full 36 is the
only scope in which this session's own requirement holds.

## Definition of done

1. No `*.module.css` under `src/renderer/src` sets a border width to a raw length — 36
   declarations at `af12edc` become 0, every one a zero-pixel swap to
   `var(--oc-border-hairline)`.
2. No `*.module.css` under `src/renderer/src` sets `letter-spacing` to anything outside the
   `--oc-tracking-*` family — 3 declarations at `af12edc` become 0.
3. `.railHeading` (`lanes/LaneRail.module.css`) renders at `0.04em` tracking rather than
   `0.06em` — the session's one deliberate change to shipped type, authorised by E1.
4. The identifier `PRE_TOKEN_SHELL_DECLARATIONS` does not occur anywhere under `src/` (5
   occurrences at `af12edc`), and the scoped rule it pinned now tolerates nothing.
5. `__tests__/hygiene.test.ts` carries a repo-wide, two-sided, exception-list-free census
   for `letter-spacing` and one for border widths, each walking every `*.module.css` under
   `src/renderer/src`.
6. Each new census has a matcher test asserting both directions — every sample it must
   flag, and every near-miss it must not, `border-radius: 4px` and
   `letter-spacing: var(--oc-space-2)` among them.
7. Each new census is shown able to fail **against the real tree**, by an injection in a
   `*.module.css` outside `beachcomber/`, `helm/` and `shell/` — the scope trap itself.
8. No prose in a file this session touches makes a claim the session's own changes
   falsify.
9. `npm test` passes and `npm run typecheck` exits 0 over both tsconfig programs, measured
   on a quiescent tree at the DAG tail, with the counts reported as measured and the delta
   from `af12edc` stated.
10. The converted values are observed **rendered** in the real Electron app, built from
    this session's worktree — or, for any site the driver cannot reach, the limit is
    recorded with its reason rather than claimed as verified.

## Scope

The seven stylesheets carrying bare border widths (`lanes/LaneRail`, `pods/DeletePodDialog`,
`pods/NewPodDialog`, `pods/PodBar`, `shell/EmptyWorkspace`, `shell/WorkspaceLayout`,
`transcript/Transcript`), the three carrying bare `letter-spacing`, the two style tests
whose patterns match the literals being converted, `__tests__/hygiene.test.ts`,
`shell/Panels.styles.test.ts`'s falsified docblock, and a new hand-run driver under
`.dir-sdlc/handruns/`.

### Not in scope

- **The palette-wide lightness pass.** A design-decision pass needing an escalation per
  pair, not a mechanical sweep. Seven of 28 `--oc-status-*` pairs sit under 1.2 contrast
  (the roster says five; measured today, seven), worst `idle`/`beached` at 1.005. It also
  carries the open question of whether the hygiene guard should assert *measured
  separation* rather than string inequality.
- **`styles/tokens.css:87-88`'s false "five shipped pairs sit under 1.2"** — measured
  today as seven. Found at kickoff; the user chose to leave it with the palette work it
  belongs to, even though correcting a count needs no design decision. It is a prose-rot
  instance this session is deliberately not taking.
- **The other eleven prose-rot instances** in the `2026-10-09` roster. The user scoped
  prose to claims this session's own conversions falsify.
- **Adding any new token.** E1 resolved against a third tracking token.
- **Reformatting.** `npx prettier --check` already warns on three files at base; the repo
  has no `eslint.config.*`.

## Assumptions

| Question | Answer | Rung | Evidence |
|---|---|---|---|
| How many bare border widths are there really? | 36, all exactly `1px`, in 7 files across 4 directories — not the brief's 7 | 1 | Census over `*.module.css` in `src/renderer/src`; distinct-value census returns `36 1px` and nothing else; positive-controlled against `border-radius: 4px` and `border: 0` |
| Is every border conversion zero-pixel? | Yes | 1 | All 36 values are `1px`; `--oc-border-hairline: 1px` at `styles/tokens.css:144` |
| Does the token already have consumers? | 24 in `*.module.css` | 1 | `grep -rn 'var(--oc-border-hairline)' --include='*.module.css' src/renderer/src` |
| Should `border-block`/`border-inline` be in the census property list? | Yes | 1 | `beachcomber/BeachcomberPreviewDialog.module.css:61` uses `border-block`, already tokenised — so widening the list costs zero offenders and closes a real hole |
| Can the repo-wide border census reach zero? | Yes | 1 | All 36 offenders live in the 7 files owned by T1–T4; no `outline`, `border-block` or `border-inline` declaration carries a raw length |
| Is the unanchored declaration reader safe here? | Today yes, by luck; the anchored reader is required anyway | 1 | Zero custom-property declarations in any `*.module.css` (positive-controlled); `--pod-status-color` is set from `lanes/LaneRow.tsx:154`, not a stylesheet |
| What is the real baseline? | 141 test files, 2240 tests, exit 0; typecheck exit 0 on both programs | 1 | `npm test` and `npm run typecheck` run by the orchestrator at `af12edc` on a quiescent tree |
| Is `PRE_TOKEN_SHELL_DECLARATIONS` reachable from outside the hygiene test? | No — all 5 occurrences are in that one file | 1 | `grep -rn PRE_TOKEN_SHELL_DECLARATIONS src` |
| Will converting break an existing assertion? | Yes, two | 1 | `lanes/LaneRail.styles.test.ts:374` and `transcript/Transcript.styles.test.ts:72` both match the literal `1px` being converted — which is why each is owned by the task converting its stylesheet |
| Does a hand-run driver executed from the main checkout prove anything? | No | 1 | `driver/lib.mjs:8` sets `repoRoot = join(here,'..','..','..','..')`, so it would launch a build with none of this session's conversions |
| Is a green suite evidence the conversions render? | No | 1 | C3 confirmed 4 scrims and `aria-current` by hand-run but only 3 of 10 semibold sites were ever on screen; `.railHeading` — the element E1 changes — was not one of them |

## Contracts

[`contracts/token-sweep-census.ts`](contracts/token-sweep-census.ts) — the shared surface.
This session changes **no TypeScript interface**; what crosses task boundaries is textual.
Four conversion tasks run concurrently and must each write the *same* replacement text, and
the census must accept exactly what they wrote and reject exactly what they removed. A
disagreement there is invisible to every task in isolation and surfaces only as a red suite
on the tail. The contract declares the two token names, the one permitted replacement form
per property, the census property list, the scanned population, the two-sided assertion
shape, the self-check, and — most importantly — the **sample sets**: what each predicate
must flag and the near-misses it must not.

## Open questions

None. E1 (`.railHeading`'s `0.06em`, a value no token carries) was raised and resolved
before decomposition: the user chose `var(--oc-tracking-wide)`, accepting a visible
tightening from `0.06em` to `0.04em` rather than adding a one-consumer token. Recorded in
`state.json` with all three ranked options.
