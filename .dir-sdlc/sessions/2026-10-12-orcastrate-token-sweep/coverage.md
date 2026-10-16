# Coverage — 2026-10-12-orcastrate-token-sweep

Written at Gate 2, before the approval that freezes `manifest.json`. The `Gate 2` column is
complete; `End state` is written at Gate 3.

**Provenance deviation, recorded rather than glossed.** `dir-architect` produced the draft
`manifest.json` and `contracts/token-sweep-census.ts` and then died mid-dispatch on an API
rate limit (session limit, HTTP 429) while writing its report, so **its coverage mapping
was never returned**. This mapping is the orchestrator's own derivation, not the
architect's. Two consequences stated plainly: the normal division of labour — architect
derives, orchestrator writes down — did not happen here, and the orchestrator also authored
the definition of done this table joins against. Guard applied: the definition of done was
written from the scope the user approved at Gate 1, not read back off the criteria, so the
join below can still report a hole. It found none, which is a weaker statement than an
architect-derived mapping finding none.

## Definition of done

| Item | Covering task | Gate 2 | End state |
|---|---|---|---|
| 1. No `*.module.css` sets a border width to a raw length (36 → 0) | T1 (7), T2 (14), T3 (10), T4 (5); enforced by T5 | covered | **met** — T1 c1-3, T2 c1-3, T3 c1-3, T4 c1-3 all met; T5 c2 enforces it repo-wide. 36 = 7+14+10+5 confirmed per file against `af12edc`, independently re-counted by three reviewers |
| 2. No `*.module.css` sets `letter-spacing` outside `--oc-tracking-*` (3 → 0) | T1 (1), T2 (1), T3 (1); enforced by T5 | covered | **met** — T1 c4, T2 c4, T3 c4 met; T5 c1 enforces it. Distinct-value census at tip returns `17 var(--oc-tracking-wide)` + `2 var(--oc-tracking-tight)`, zero offenders |
| 3. `.railHeading` renders at `0.04em`, not `0.06em` (E1) | T1 converts; T6 observes it rendered | covered | **met** — T1 c4 met; **T6 c4/c5 measured it in the running window**: `letter-spacing 0.44px` against its own `font-size 11px` (= 0.04 × font-size exactly), and an in-page override back to `0.06em` moved it to `0.66px`. The session's one visible change is confirmed by measurement, not by grep |
| 4. `PRE_TOKEN_SHELL_DECLARATIONS` gone from `src/`; scoped rule tolerates nothing | T4 | covered | **met** — T4 c4 (5 → 0 occurrences, measured both ways) and c5 (`toEqual([])`, with `expect(` 106→106, `it(` 28→28, `describe(` 10→10 proving nothing was weakened); c6 red step reproduced by the reviewer |
| 5. Repo-wide, two-sided, exception-free census for both properties | T5 | covered | **met** — T5 c1, c2 met, plus c10 (amendment A1) adding a third census for unterminated `var(--oc-*)` references |
| 6. Matcher tests assert both directions, including the near-misses | T5 | covered | **met** — T5 c4, c5, c10 met; all of `BORDER_MUST_FLAG`/`BORDER_MUST_PASS`/`TRACKING_MUST_FLAG`/`TRACKING_MUST_PASS` asserted in both directions, `border-radius: 4px` and `outline-offset: 2px` included |
| 7. Each census shown able to fail against the real tree, outside the three legacy roots | T5 | covered | **met** — T5 c6, c7, c11: three red steps injected into `transcript/Transcript.module.css`, each reproduced independently by the reviewer. On the tracking injection **the scoped rule stayed green**, demonstrating the scope trap rather than arguing it |
| 8. No prose in a touched file makes a claim the session falsifies | T1, T2, T3, T4 (incl. `Panels.styles.test.ts`), T5 (`hygiene.test.ts` prose) | covered | **met, after one revision round** — T1 c7, T2 c5/c6, T3 c7, T4 c7/c8 met in round 1. **T5 c13 was `not met` in round 1** (it asserted the session "converted every remaining bare border width", while six keyword widths remain) and met in round 2, which also records the survivors by file and count |
| 9. `npm test` green and `npm run typecheck` exit 0 over both programs, quiescent, at the tail | T5; T6's `npm run build` re-runs both typecheck programs | covered | **met** — T5 c14/c15, re-measured by its reviewer: **141 test files, 2248 tests, exit 0**; `typecheck:node` 0 and `typecheck:web` 0 reported separately. Base `af12edc` was 141/2240, so **+8 tests, +0 files**, reconciling with 8 new `it(` blocks. T6 c3's `npm run build` exit 0 re-ran both programs |
| 10. Converted values observed rendered, or the limit recorded per unreached site | T6 | covered | **met** — T6 c4, c8, c9, c10 met: all 7 converted stylesheets carry at least one measured value, **21 of this session's 39 sites measured**, and the remaining 18 recorded with a reason each. **T6 c6 was `not met` on the letter of its Gate 2 text and is `met` under amendment A2** (escalation E3, resolved at Gate 3): no 1px border computes to `1px` in that window — a declared literal included — so the criterion now requires the same used width as a live literal-`1px` reference. The substance was measured throughout: `.podBarRegion` at `0.8px`, equal to that reference, with a measured ladder and a token-resolution control collapsing the border to `0px`/`none` |

Every item has a covering task. No row was closed by declaring it out of scope; the four
items the user placed out of scope are in `spec.md`'s `### Not in scope` and are
deliberately absent from this table rather than marked covered.

## Contract operations

`contracts/token-sweep-census.ts` declares no callable function. It is a **conformance
contract**: type-level declarations fixing the exact replacement text the four concurrent
conversion tasks must each write, and the predicate behaviour plus sample sets the census
must satisfy. Its rows are listed because each must have a task responsible for honouring
it, which is the question this table asks.

**Every row below carries the predicted end state `not called`, and that prediction is the
point.** `.dir-sdlc/` is outside both tsconfig programs — `tsconfig.web.json` includes only
`src/renderer/src/**/*` and `src/shared/**/*`, `tsconfig.node.json` only
`electron.vite.config.ts`, `vitest.config.ts`, `src/main`, `src/preload`, `src/shared`,
`tests` and `probe` — and no file under `src/` or `tests/` imports any session contract
(measured: zero, the one `dir-sdlc` hit under `src/` being a prose comment). A `*.module.css`
could not import a TypeScript declaration in any case. So the Gate 3 whole-word search will
find no call site for any of these names, and that is conformance working as designed, not
coverage the session lost. Recording the prediction now is what keeps thirteen `not called`
rows from reading at Gate 3 as the sharpest row on the table thirteen times over.

| Operation | Implementing task | Consuming task | Gate 2 | End state |
|---|---|---|---|---|
| `BorderWidthTokenName` | — (no definition site in the change surface) | T1, T2, T3, T4 | covered — predicted `not called` | `not called` — **prediction confirmed** |
| `TokenisedBorderWidth` | — | T1, T2, T3, T4 | covered — predicted `not called` | `not called` — **prediction confirmed** |
| `TrackingTokenName` | — | T1, T2, T3 | covered — predicted `not called` | `not called` — **prediction confirmed** |
| `TokenisedTracking` | — | T1, T2, T3 | covered — predicted `not called` | `not called` — **prediction confirmed** |
| `BORDER_WIDTH_PROPERTIES` | — | T5 | covered — predicted `not called` | `not called` — **prediction confirmed** |
| `DeclarationReader` | — | T5 | covered — predicted `not called` | `not called` — **prediction confirmed** |
| `OffenderLine` | — | T5 | covered — predicted `not called` | `not called` — **prediction confirmed** |
| `BORDER_MUST_FLAG` | — | T5 | covered — predicted `not called` | `not called` — **prediction confirmed** |
| `BORDER_MUST_PASS` | — | T5 | covered — predicted `not called` | `not called` — **prediction confirmed** |
| `TRACKING_MUST_FLAG` | — | T5 | covered — predicted `not called` | `not called` — **prediction confirmed** |
| `TRACKING_MUST_PASS` | — | T5 | covered — predicted `not called` | `not called` — **prediction confirmed** |
| `CensusScope` | — | T5 | covered — predicted `not called` | `not called` — **prediction confirmed** |
| `CensusSelfCheck` | — | T5 | covered — predicted `not called` | `not called` — **prediction confirmed** |
| `CensusAssertionShape` | — | T5 | covered — predicted `not called` | `not called` — **prediction confirmed** |
| `ScopedRuleAfterPinDeletion` | — | T4 | covered — predicted `not called` | `not called` — **prediction confirmed** |

Every declared row has a consuming task. There is no operation with an implementer and no
consumer.

## How the end-state search was run, and why 15 `not called` rows are the expected result

The search used the range `git diff --name-only $(git merge-base main HEAD)..HEAD`, which
resolved to base `af12edc` and the 11 source files the session changed, plus the 13 files of
the T6 commit searched directly because they were untracked at the time the first pass ran.
Each operation name was matched **as a whole word** (`git grep -w`). All 15 returned zero
hits in both passes.

**The search was positive-controlled in both passes**, because this project's standing rule
is that a command reporting "found nothing" is evidence only once it has been seen reporting
something: `allModuleStylesheets` — a name that must appear in a touched file — was found in
`src/renderer/src/__tests__/hygiene.test.ts`, and `oc-border-hairline` was found in two of
T6's deliverables.

**No row has an `Implementing task`, and that is correct rather than missing.** The column is
filled from the definition site the search locates, and for this contract there is no
definition site inside the change surface: `contracts/token-sweep-census.ts` is a
**conformance contract**, consumed by tasks writing text that conforms to it rather than by
any file importing it. `.dir-sdlc/` lies outside both tsconfig programs — `tsconfig.web.json`
includes only `src/renderer/src/**/*` and `src/shared/**/*`, `tsconfig.node.json` only
`electron.vite.config.ts`, `vitest.config.ts`, `src/main`, `src/preload`, `src/shared`,
`tests` and `probe` — no file under `src/` or `tests/` imports any session contract, and a
`*.module.css` could not import a TypeScript declaration in any case.

So all 15 rows are `not called`, every one of them a **confirmed** prediction written at
Gate 2 before the search ran. That is what makes this table readable: `not called` is
normally the sharpest row here, and fifteen of them would otherwise invite exactly the wrong
conclusion.
