# Prose drift sweep

Correct 19 comments, docblocks, test titles and Markdown lines so each matches the code at `main` d500429, changing no executable code.

## Context

`.sir/backlog.md` carries 17 **Prose drift** items and 2 documentation items in **Ungrouped**, logged between 2026-10-09 and 2026-11-02. The architect re-measured each one at d500429:

- 17 still hold.
- 2 are already resolved by 9cf090d: `hygiene.test.ts` "shell four" and the "five literals" / "four other" counts.

They are closed with a preserved-state check rather than an edit. One item (U2) overstates its own premise. The `openPod` docblock names no cause for a null `ccSessionId`; only `reconnectPod` says "never reached its first turn". Both still gain the rejected-resume case.

## Definition of done

1. `renderer-state.ts` AMENDMENT docblock (d500429:298) says three fields follow, not four.
2. `PodTab.tsx:228-229` names `POD_STATUS_LABEL[status]`. `grep -cE '(^|[^_A-Z])STATUS_LABEL'` returns 0 on the file.
3. `PodTab.test.tsx` `STATUS_WORD` docblock names `POD_STATUS_LABEL` and attributes it to `pod-status.ts`, not to "PodTab's own". The same grep returns 0.
4. The `pod-stop.e2e.test.tsx:480` title names `Idle`, not `Running`, as the before-stop state. "from Running to Stopped" is absent.
5. The `PodTab.source.test.ts` docblock says, in the present tense, that `styles/raw.d.ts` declares the `?raw` form. It drops the `activity/raw.d.ts` and "T3 moves" wording.
6. The `helm/rules.ts` header states that the old `font-weight:\s*(?!var\()` pattern fires on clean code, rather than "matches nothing".
7. `src/main/index.ts` carries no "Criterion N" reference. `grep -c 'Criterion [0-9]'` returns 0.
8. The `tokens.css` Status header lists the four `LaneStatus` members, `stopped` included.
9. The `tokens.css` `stopped` comment no longer says the 1.796 `stopped`/`idle` pair clears the 2.173 precedent.
10. Design spec §4.4's "never to data loss" paragraph cross-references the §8 rejected-resume row.
11. The `renderer-panels.ts` `incoming` clearing list names the failed `compare()` write (`panel-store.ts:663`), or cross-references the preamble's "or the last request failed".
12. The `renderer-panels.ts` panel-close entry states the guard `resetHelmForReopen` applies: replace only when `phase !== 'idle'` (`panel-store.ts:337`).
13. `hygiene.test.ts` shell module-stylesheet count. Already resolved: it still reads "the shell five", matching `find` counts of 2, 1 and 5, and is not edited.
14. `hygiene.test.ts` bare-literal counts. Already resolved: "fourteen … across five files" and "the five other bare literals" are unchanged.
15. `FINDINGS-TOKEN-SWEEP.md` gains a dated correction covering `:272`, `:147` and the driver's `:501` TS-4 pointer. It adds lines only.
16. The `Composer.styles.test.ts` docblock distinguishes an `undefined` group (impossible) from the empty capture `"border: "` (reachable; read as a non-offender).
17. The `tokens.css` KNOWN AND ACCEPTED text states that `running`/`orphaned` (1.195) sits 0.005 inside 1.2. The figure is derived afresh by a named command.
18. The `resume-fallback.ts` `abandonedCcSessionId` doc says the id is nulled before the retry and stays null if the retry fails.
19. The `openPod` and `reconnectPod` docblocks name the rejected-resume case for a null `ccSessionId`.
20. No executable change. For each edited file, the comment- and whitespace-normalised text equals the d500429 text. The one exception is the `pod-stop` title literal.
21. `npm run typecheck` exits 0 at the tail, and `npm test` passes with nonzero file and test counts.

## Scope

The 19 backlog items above, plus the one sentence at `hygiene.test.ts:807-810` that fixing `rules.ts` would otherwise make false (Gate 2 decision E1). Removing closed backlog lines happens at Gate 3, not in any task.

### Not in scope

- Every other backlog section.
- Any change to runtime behaviour, test assertions, or CSS values.
- The `.dir-sdlc/` driver, `driver/run-token-sweep.mjs`, which is byte-frozen history.
- **Deferred at Gate 2; append each to `.sir/backlog.md` at Gate 3:**
  - `helm/discrimination.test.tsx:7-8` repeats `rules.ts`'s false "matches nothing" claim.
  - `pod-manager.ts` still carries stale "Criterion N" numbering at `:211`, `:386`, `:439`, `:465`, `:971`, `:1417` and `:1464` (d500429).
  - Design spec `:243-245` says the only fresh start is a Pod that "never reached its first turn", the same drift as U2.

## Assumptions

| Question | Answer | Rung | Evidence |
|---|---|---|---|
| Do the backlog line numbers still point at the cited prose? | Mostly. Each item was located afresh. Moved items: `hygiene` (now `:941`, `:1342`, `:1514`, `:1550`) and design §4.4 (now `:233-237`) | 1 | Architect's per-item re-measurement at d500429 (grep / `ls` / `node -e`) |
| Are items 13 and 14 already resolved? | Yes, by 9cf090d. They are closed with a preserved-state criterion | 1 | `git log -S`. `find … -name '*.module.css' \| wc -l` returns 2/1/5. Two differently shaped greps at `10feee6^` agree on 14 across 5 files |
| What is the contrast margin for item 17? | `running`/`orphaned` 1.1949, which is 0.0051 under 1.2. The nearest pair above is `done`/`stopped` at 1.2062 | 1 | Architect's `contrast.mjs` over the 8 `--oc-status-*` declarations (the predicate matched 8, and `grep -c` agrees). It reproduced every stated figure (1.796, 3.903, 1.052, 2.173, 1.005, 7/28, 6/21). T2 re-derives it in-session |
| Does the old lookahead fire on clean code? | Yes. `/font-weight:\s*(?!var\()/` tests `true` on `font-weight: var(--oc-weight-bold);` | 1 | `node -e`, and `hygiene.test.ts:931` asserts `broken.test(clean)` is `true` |
| Does `BORDER_WIDTH_DECL` reach an empty capture? | Yes: `.a{border:;}` gives `[["border",""]]` | 1 | `node -e` at d500429 |
| What does "appended" mean for FINDINGS? | Added without editing existing lines, placed per Gate 2 decision E3 | 1 | Precedent `## Correction — 2026-10-20` at `FINDINGS:21-25` |
| How is "no executable change" checked without git in the implementer? | A pre-edit scratch copy, compared with N(base) = N(head). N strips `/* */` and `//` comments (rules.ts:51's strip) and collapses whitespace, plus a discrimination check | 4 | Architect's `strip-probe.mjs`: every phrase to be corrected vanishes under N; the `pod-stop` title survives, as expected |
| Can the verification commands run in the worktree with no `node_modules`? | Yes. Module resolution walks up to the main checkout's `node_modules` | 1 | `state.json` `verification`: typecheck exit 0, with `tsc --listFilesOnly` reading 218 worktree files and 0 outside it; `npm test` 141 files / 2274 passed |
| Do the 6 tasks need a contract? | No. They share no interface | 4 | Disjoint `owns`, and every edit is prose |

## Contracts

None. `manifest.json` declares `contracts: []`.

## Open questions

None. Gate 2 resolved all four:
- E1: T4 includes the `hygiene.test.ts:807-810` follow-on.
- E2 and E4: every piece of adjacent drift is deferred to the backlog at Gate 3.
- E3: the FINDINGS correction goes directly above `## Correction — 2026-10-20`.
