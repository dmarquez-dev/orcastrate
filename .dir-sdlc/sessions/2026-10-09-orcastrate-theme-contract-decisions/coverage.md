# Coverage mapping — 2026-10-09-orcastrate-theme-contract-decisions

The `Gate 2` column was written at Gate 2, before the approval that froze
`manifest.json`. The `End state` column was filled at Gate 3 from the per-criterion
verdicts in `reviews/T1.md`, `reviews/T2.md` and `reviews/T3.md` — a join over evidence
the session already produced, gathering nothing new.

**All 25 rows are `met`, and none is `attributed`.** Every row was re-derivable at the
gate: the suite and both typecheck programs ran green on the final tree, and no row rests
on a measurement that could not be repeated.

Session commit range, derived from the manifest's `baseBranch`:
`git merge-base main dir/2026-10-09-orcastrate-theme-contract-decisions` →
`41f274eaaa74ae73d8c642e16a13450cd4d2a6d4`, with three commits — `56abc4b`, `5ba2f3e`,
`10feee6` — and a change surface of **17 files, 474 insertions, 57 deletions**.

## Definition of done

| Item | Covering task | Gate 2 | End state |
|---|---|---|---|
| 1 — `TOKENS` declares `weightSemibold`, additions-only, slug-stamped | T3 (c1, c2) | covered | met |
| 2 — `tokens.css` defines `--oc-weight-semibold: 600` once, in the weights group | T3 (c3) | covered | met |
| 3 — all ten bare `font-weight: 600` declarations consume the token | T3 (c5) | covered | met |
| 4 — the five remaining bare declarations take their existing tokens; no literal `font-weight` anywhere | T3 (c6) | covered — scope widened at Gate 2 | met |
| 5 — `PRE_TOKEN_SHELL_DECLARATIONS` releases the font-weight entry; hygiene passes | T3 (c10) | covered | met |
| 6 — that pin's docblock and the file header carry no claim this change falsifies | T3 (c11) | covered — criterion broadened at Gate 2 | met |
| 7 — `TOKENS` declares `overlayScrim` as a new family, slug-stamped | T3 (c1, c2) | covered | met |
| 8 — overlay alpha strictly between 0 and 1, no new colour literal | T3 (c3, c4) | covered | met |
| 9 — all four full-window scrims take the overlay token | T3 (c7) | covered | met |
| 10 — the seven legitimate `var(--oc-bg-app)` surfaces unchanged | T3 (c8) | covered | met |
| 11 — `BeachcomberPreviewDialog`'s opaque-scrim paragraph rewritten true | T3 (c9) | covered | met |
| 12 — regression census for both conversions, each matcher proved able to fire; font-weight half universal | T3 (c12, c13) | covered — made universal at Gate 2 | met |
| 13 — open panel's button exposes `aria-current="true"`; no `aria-pressed=` in `PanelBar.tsx` | T1 (c1) | covered | met |
| 14 — `PanelBar.module.css` selects on the new attribute | T1 (c2) | covered | met |
| 15 — `aria-pressed` survives on the seven genuine-toggle files | T1 (c4) | covered | met |
| 16 — both rationale docblocks name the attribute that now carries the state | T1 (c5, c6) | covered | met |
| 17 — the C1-protected test edited under E3's sanction, still non-visual, name matches | T1 (c3, c7) | covered | met |
| 18 — live clearing list names the whole-state reset, slug-stamped, `EXHAUSTIVE` made true | T2 (c1, c2) | covered | met |
| 19 — `resetHelmForReopen` docblock names `incoming` | T2 (c3) | covered | met |
| 20 — no executable change in T2's diff; C1's frozen artifact untouched | T2 (c4, c7) | covered | met |
| 21 — `HelmPanel` docblock records the governing reading of criterion 6 | T2 (c5) | covered | met |
| 22 — the comparison gating is byte-identical | T2 (c6) | covered | met |
| 23 — `npm run typecheck` passes over both programs | T3 (c14) | covered | met |
| 24 — `npm test` quiescent: 0 failures, ≥141 files, ≥2233 tests | T3 (c15) | covered | met |
| 25 — no task's diff contains a file outside its `owns` globs, path-scoped | T1 (c4), T2 (c7), T3 (c16) | covered | met |

**No uncovered rows.** 25 of 25 items carry a task.

## Contract operations

**No rows.** This session freezes no contract: `contracts/` is empty and
`manifest.json` declares no `contracts` array, because `dir-contracts` excludes an
interface only one task will ever touch, and T3 is both sole writer and sole consumer
of the two new `TOKENS` members. E4 adds no operation — it is prose inside an existing
field's docblock.

Recorded here rather than left blank because the absence is a decision, not an
omission. The two new members are covered as definition-of-done items 1–3 and 7–9,
whose criteria assert their call sites two-sidedly by count — ten `var(--oc-weight-semibold)`
sites and four `var(--oc-overlay-scrim)` sites, each with a positive control. That is
stronger evidence of consumption than the Gate 3 end-state search would produce, and
it avoids the false alarm the search would otherwise generate: both members are
defined and consumed inside a single task's ownership set, which the owns-scoped
discard would read as `not called`.

### End state — the search that was not run, and what replaced it

**No contract-operation search was run at Gate 3, because there are no rows to search.**
The Gate 3 end-state search is defined over the operations a *frozen contract* declares;
this session froze none, so there is no operation whose call site could be hunted and no
row that could come back `not called`. Recording that explicitly rather than leaving the
section silent: a reader should be able to tell a search that found nothing from a search
that was never applicable.

What the search exists to catch — an operation with an implementer and no consumer — was
instead established directly, by count, on the final tree:

| New member | Call sites | Measured by |
|---|---|---|
| `--oc-weight-semibold` | **10** | `grep -rno "var(--oc-weight-semibold)" src/renderer --include="*.module.css" \| wc -l` |
| `--oc-overlay-scrim` | **4** | `grep -rno "var(--oc-overlay-scrim)" src/renderer --include="*.module.css" \| wc -l` |

Both counts match the criteria exactly (T3 c5 and c7), both were asserted two-sidedly by
the implementer and independently reproduced by the reviewer, and both are now additionally
guarded by the new repo-wide census in `hygiene.test.ts` — which fails if a `font-weight`
anywhere stops coming from a `--oc-weight-*` token, or if a full-window rule stops painting
from the overlay. So neither member is a declaration nothing reaches.

**What this does not prove**, stated for the same reason the search's own caveat exists: a
call site shows something consumes the token, not that a user can see it. The ten weight
sites are headings and labels rendered on ordinary surfaces, and the four scrims were
confirmed to cover the window by the census's `position: fixed` + `inset: 0` predicate —
but no part of this session put the veiled dialogs in front of a human eye. The 2026-10-07
driven hand-run is the instrument that would, and it has not been re-run against these
changes. That is a Gate 3 item, not a coverage claim.
