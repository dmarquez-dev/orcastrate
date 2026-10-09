# Coverage — 2026-10-09-orcastrate-guard-hardening

Written at Gate 2, before the approval that freezes `manifest.json`. The
`End state` column is filled at Gate 3.

## Definition of done

| Item | Covering task | Gate 2 | End state |
|---|---|---|---|
| D1 — per-fixture baseline measured; no iteration satisfiable by an empty replay; `04-orphaned-calf`'s zero recorded not guarded | T1 (c1, c2, c3, c5) | covered | met |
| D2 — kept transcript pane carries a positive control; durable and lane-rail halves preserved | T2 (c2, c4) | covered | met |
| D3 — both dead `PodId` constants deleted | T2 (c1) | covered | met |
| D4 — `errors.test.ts` shuffle-clean at 3+ seeds; no sibling-written state; coverage claim still falsifiable | T3 (c1, c2, c3) | covered | met |
| D5 — control-byte rule walks `src/`, `tests/`, `probe/`; per-root non-emptiness guard; extension filter decided | T4 (c1, c2, c3, c5) | covered | met |
| D6 — one declaring module for both marker constants, under `src/shared/`, read by producer and filter; duplication rationale deleted | T5 (c1, c2, c3, c4) | covered | met |
| D7 — chain pinned within each tsconfig program; single-definition scan with a checked exemption list | T5 (c5, c6) | covered | met |
| D8 — no user-visible behaviour change; marker value and reason sentence character-identical to `a186f06` | T5 (c9) | covered | met — SHA-256 identical, 187 chars |
| D9 — every fix demonstrated by a red step, plus confirmation the same injection left `a186f06` green | T1 c4; T2 c3; T3 c3, c4; T4 c4; T5 c7, c8 | covered | met — all five |
| D10 — `npm run typecheck` both programs and repo-wide `npx vitest run`, run last on a quiescent tree | T4 (c7, c8) | covered | met — 141 files / 2233 tests |

Ten items, ten covered, none closed by declaring it out of scope.

## Contract operations

| Operation | Implementing task | Consuming task | Gate 2 | End state |
|---|---|---|---|---|

**Empty by design, not by omission.** No contract is declared: the session's one
new interface is declared and consumed entirely within T5, so there is no
inter-task boundary to freeze. See `spec.md` § Contracts.

## Orchestrator's consistency check

Run against the frozen-candidate manifest before Gate 2, per the `dir` skill —
within each task, not across tasks.

**Contradicting pair — one, in T5. RESOLVED at Gate 2.** T5 c4's three permitted
categories for a remaining bare `'startup_reconciliation'` literal excluded the
positive value pin at `transcript-filter.test.ts:191`, which T5 c5 mandates
keeping — so satisfying c4's census required deleting the line c5 protects.
**User decision: keep `:191` and widen c4**, which now carries a fourth category,
"a positive value pin on the marker", with `:191` named as its one instance.

**Overlapping pair — one, in T5. RESOLVED at Gate 2.** T5 c5's two `toBe`
reference pins and T5 c6's single-definition scan guard the same regression by
different mechanisms, and once c2 and c3 make both sites re-export the shared
binding, c5's pins compare a value to itself and cannot fail on this session's
own output. **User decision: drop the reference pins and rely on c6**, which
catches a reappearing copy directly and repository-wide. c5's `:191` literal-pin
clause survives.

**Ordering clause — one, in T1. RESOLVED at Gate 2.** T1 c5 required the corpus
assertion to run *before* the survival loop. There is no data dependency — the
loop calls `calfPromptTexts()`, a pure function over the fixture file — so the
ordering was cosmetic, and mandating an execution order in the session that
exists to delete order-dependence is self-contradictory. **User decision: drop
the clause**; the criterion now requires only that both pre-existing tests be
preserved and still pass.

**Vacuity pass.** Eight criteria are satisfied by the tree at `a186f06`: T1 c5,
T2 c4, T2 c5, T3 c2 (its "the six `it` blocks keep their own assertions" half),
T4 c5, T4 c6, T5 c9, T5 c10. Every one is a deliberate preserved-behaviour or
do-not-break assertion, which `dir`'s vacuity test explicitly carves out. **No
vacuity finding.**
