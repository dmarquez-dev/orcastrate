# Coverage mapping — 2026-10-16-orcastrate-keyword-hairline-sweep

Coverage **as mapped at Gate 2, amended where an amendment changed a criterion, and checked at
Gate 3.** The `Gate 2` column was written before the approval that froze `manifest.json`; the
`End state` column was filled at Gate 3 from `reviews/<task-id>.md` and from the session's diff.

Produced by `dir-architect` in its decomposition report and written down by the orchestrator, which
holds the user's Gate 2 decisions.

## Definition of done

| Item | Covering task | Gate 2 | End state |
|---|---|---|---|
| 1. The six conversions read `var(--oc-border-hairline)` | T1 (`composer/`, 3), T2 (`permissions/`, 3) | covered | **met** — T1 #1-4 and T2 #1-4, each `met`; both reviewers reproduced the term-anchored census and the near-miss discrimination |
| 2. Repo-wide census flags a bare width keyword, two-sided | T4 | covered | **met** — T4 #1-3 `met`; shown able to fail by injection outside the three roots, offender line printed |
| 3. Scoped `borderOffenders` widens, injected inside the three roots | T4 | covered | **met** — T4 #4-5 `met`; `borderOffenders` and `censusBorderOffenders` now call one shared `isOffendingBorderWidth`, so the two cannot drift |
| 4. `hygiene.test.ts` carries no claim this session falsifies | T4 | covered | **met** — T4 #6 `met`; the reviewer searched the file itself rather than taking the implementer's list of three, and found no surviving falsified claim |
| 5. Driver keys by declaration, carries every selector in the group | T5 | covered | **met** — T5 #1-3 `met`; shown able to report `not reached` by replacing the selector list with absent class names, absence itself positive-controlled |
| 6. Driven run measures the six, same-window equality, no pixel literal | T5 | covered; **predicted `partially measured`** — `permissions/` reachability is the session's open question | **met — and the prediction is REFUTED.** All six measured on screen, zero unreachable. The three `permissions/` sites were reachable without a live `claude` process: the main process sends the app's own `push:laneChanged` and `push:permissionRequested` and the card renders. The search's answer stands; the prediction is recorded as refuted rather than overwritten |
| 7. `tokens.css` contrast count re-derived and corrected | T3 | covered | **met** — T3 #1-8 `met`; derived blind by Gate 2 decision, and four independent instruments agree on 7 under 1.2 over the 8 shipped tokens and 6 over the pre-`stopped` 7 |
| 8. Repo-wide `tsc`, suite counts, `npm run build`, on the quiescent tail | T5 | covered | **met** — T5 #11-13 `met`, all three reproduced by the reviewer: typecheck exit 0 over both programs, `141 files / 2252 tests` against the 141/2248 baseline, build exit 0 rebuilding to the same CSS hash the run recorded |

**Uncovered rows: none**, at Gate 2 or at Gate 3. No item was retired as out of scope.

**One prediction was written at Gate 2 and it was refuted.** Item 6's cell predicted `partially
measured` because `PermissionCardList` returns `null` on an empty card list and a card was believed
to need a live `claude` process. It does not. Recording the refutation is the point of having
written the prediction down before the run.

## Contract operations

### The deviation from the literal search, stated rather than applied silently

The Gate 3 rule is a content search over the session's touched files for each declared operation's
name, matched as a whole word, with anything surviving the three discards recorded as `called` and
nothing surviving recorded as `not called`.

**Run literally here, that search returns `not called` for fifteen of the twenty declarations, and
every one of those fifteen would be false.** This contract is **declaration-only by design** — its
own header states "DECLARATIONS ONLY. Every sample set below is a declared error case, not an
implementation" — so nothing imports it and no name is referenced at a call site. Implementers
consume it by **asserting its content**, and the reviewers verified that consumption against named
criteria.

Measured: `git grep -w` over the sixteen touched files finds only `KEYWORD_WIDTH_SITES` (4 files),
`BORDER_WIDTH_KEYWORDS`, `KEYWORD_MUST_FLAG`, `KEYWORD_MUST_PASS` and `SiteEnumerationRequirement`
(1 file each).

So the end state below records, for each declaration, **the criterion verdict that establishes its
consumption**, and marks whether its name also appears. This is the same hand-recorded deviation
the token sweep made in its own `coverage.md`, where the literal discard would have marked all
eighteen of its operations `not called`. **Fifteen false `not called` rows against the sharpest row
on the table is not a false alarm a gate absorbs; it is a check the reader learns to override.**

`Implementing task` is empty throughout: a declaration-only contract has no definition site in the
implementation for the search to locate.

| Operation | Implementing task | Consuming task | Gate 2 | End state |
|---|---|---|---|---|
| `BorderWidthTokenName`, `TokenisedBorderWidth` | | T1, T2 (write the text); T4 (must-pass sample) | covered | **consumed** — T1 #1 and T2 #1 `met`: the exact replacement text written at all six sites. Name not referenced |
| `ThickBorderTokenName` | | T4 (near-miss assertion); T1, T2 (negative control) | covered | **consumed** — T4 #2 `met`, the `var(--oc-border-thick)` sample asserted individually; T1 #4 and T2 #4 used it as the negative control. Name not referenced |
| `KEYWORD_WIDTH_SITES` | | T1, T2 (the sites they convert); T5 (enumerates all six) | covered | **consumed, and named** in 4 touched files. T5 #4 `met`, KS-7 asserting `contractRows.length === 6` |
| `BORDER_WIDTH_KEYWORDS` | | T4 | covered | **consumed, and named.** T4 #1 `met`: all three keywords, `medium` and `thick` synthetic-only and stated as such |
| `KeywordWidthMatchShape` | | T4 | covered | **consumed** — T4 #1-2 `met`; the term-match property holds, and T2's reviewer verified `[^-\w]` treats `-` as an identifier character on both sides across ten cases. Name not referenced |
| `DeclarationReader` | | T4 | covered | **consumed** — T4 #2 `met`; neither reader was changed, which is what forced amendment **A2** rather than a code change. Name not referenced |
| `ScopedRuleDecision` | | T4 | covered | **consumed** — T4 #4 `met`; `borderOffenders` widened on the same predicate. Name not referenced |
| `KEYWORD_MUST_FLAG` | | T4 | covered | **consumed, and named.** T4 #1 `met`: all five samples asserted individually |
| `KEYWORD_MUST_PASS` | | T4; T1, T2 | covered | **consumed, and named.** T4 #2 `met` (amended): all seven clear the census, six clear the scoped rule, the asymmetry asserted both directions and both value kinds |
| `CensusScope`, `CensusAssertionShape` | | T4 | covered | **consumed** — T4 #9 `met`: no exception list reintroduced, every census assertion still compares against `[]`. Names not referenced |
| `CensusSelfCheck` | | T4 | covered | **consumed** — T4 #10 `met`: non-empty, names files outside the three roots, strictly wider than `panelStylesheets()`. Name not referenced |
| `SiteEnumerationRequirement` | | T5 | covered | **consumed, and named.** T5 #1-3 `met`; the property holds for a one-member group and the grouped instance alike, with no special case |
| `HandrunSite`, `ConvertedSiteMap` | | T5 | covered | **consumed** — T5 #1 and #4 `met`: every site carries its selector group and its sides, reach notes written before the run. Names not referenced |
| `MeasurementProtocol` | | T5 | covered | **consumed** — T5 #5-6 `met`; the reviewer grepped **every** `px` occurrence in the 1156-line driver and found no pixel literal used as an expectation. Name not referenced |
| `ZeroPixelClaimStrength` | | T1, T4, T5 | covered | **consumed** — T1 #8, T4 #7 and T5 #7 all `met`; T5's reviewer independently verified the named display. Name not referenced |
| `LightnessMetric`, `LightnessHelperAvailability` | | T3 | covered | **consumed** — T3 #3 `met`: WCAG 2.x contrast ratio over sRGB relative luminance, computed as a one-off because no helper exists. Names not referenced |

**No declaration is unconsumed, and no row is `not called` on the honest reading.** Every one
traces to a criterion a reviewer judged `met`.

**What a consumption does not prove**, on the same terms the call-site rule carries: that the
contract's own prose is correct. Two of its claims were falsified during the session and are
recorded as advisory findings — its header-(a) census grep cannot reach the logical longhands, and
its `[^-[:alnum:]]` boundary class disagrees with the shipped matcher about `_`.
