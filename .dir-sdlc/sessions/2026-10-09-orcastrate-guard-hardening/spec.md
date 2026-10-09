# Guard hardening — close the assertions that cannot fail

Make five Orcastrate guards falsifiable, changing no user-visible behaviour.

## Context

The 2026-10-09 backlog audit checked every pre-`2026-09-01` bullet against the
code and left a roster of what survived. Five of those items are the same defect
in five places: **an assertion that passes whether or not the property it names
holds.** They are not stylistic — each one guards a property the project has
already paid to establish:

- the echo filter never deleting a Calf's opening prompt, pinned by a test that
  holds when the replay ingests nothing;
- `closePod` sweeping one Pod's lanes and not the store's, whose *rendered* half
  holds when the pane renders nothing;
- every documented `EventStoreError` code being reachable, asserted from a `Set`
  three sibling tests fill — reproduced failing under `--sequence.shuffle` this
  session;
- the control-byte rule, which exists because a scripted edit once wrote a
  literal `0x08` into a source file where every test stayed green and only
  `od -c` revealed it, scanning `src/` and not the `tests/` and `probe/` trees
  that carry the same exposure;
- the `startup_reconciliation` marker, duplicated main-to-renderer for a
  documented and legitimate reason, but pinned only against hard-coded literals,
  so a rename at the producer silently returns the reconciliation notice to
  being hidden by the transcript filter — the exact regression escalation E5 was
  raised to prevent.

The last one is the only item that touches shipped code.

## Definition of done

| # | Outcome |
|---|---|
| D1 | `tests/unit/ipc/user-prompt.test.ts`'s prompt-survival loop asserts a per-fixture baseline count **measured in this session**, so no iteration can be satisfied by a replay that ingested nothing. `04-orphaned-calf.ndjson`'s legitimate zero is recorded as zero, not guarded against. |
| D2 | The kept transcript **pane** in `pod-stop.e2e.test.tsx` carries a positive control, so `expect(laneClosedRows(keptPrimary)).toEqual([])` can no longer be satisfied by a pane that rendered nothing. The durable and lane-rail halves of the narrowness proof survive intact. |
| D3 | The two dead `PodId` constants in `pod-stop.e2e.test.tsx` are gone. |
| D4 | `tests/unit/store/errors.test.ts` passes under `--sequence.shuffle` at three or more seeds, no assertion reads state a sibling `it` wrote, and the all-four-codes claim still fails when a code's provocation is removed. |
| D5 | The control-byte hygiene rule walks `src/`, `tests/` and `probe/`, each root with its own measured non-emptiness guard, with the extension filter decided and the reason recorded. |
| D6 | `'startup_reconciliation'` and the reconciliation reason sentence each have exactly one declaring module, under `src/shared/`, read by both the main producer and the renderer filter. The duplication rationale that justified the copy is deleted with the copy. |
| D7 | The producer → shared → filter chain is pinned within each tsconfig program, and a single-definition scan with a checked exemption list fails if a second declaration reappears. |
| D8 | No user-visible behaviour changed: the marker's value and the reason sentence are character-identical to `a186f06`. |
| D9 | **Every** fix is demonstrated by a red step — an injected defect or a reproduced order-dependent failure — with the command and the quoted failure, **and** with confirmation that the same injection left the tree at `a186f06` green. |
| D10 | `npm run typecheck` (both programs) and a repository-wide `npx vitest run` pass, run last and on a quiescent tree. |

D9 is the item that makes the rest mean anything. Every other line here can be
satisfied by a test that passes; only D9 demands evidence that the test can fail.

## Scope

Five files of test and guard code, plus one new shared module and the two shipped
files that stop duplicating it:

- `tests/unit/ipc/user-prompt.test.ts`
- `src/renderer/src/__tests__/pod-stop.e2e.test.tsx`
- `tests/unit/store/errors.test.ts`
- `src/renderer/src/__tests__/hygiene.test.ts`
- `src/shared/startup-reconciliation-notice.ts` (new),
  `src/main/pod-manager/startup-reconciliation.ts`,
  `src/renderer/src/transcript/**`, `tests/unit/pod-manager/**`

### Not in scope

- **Any other item on the audit roster.** The roster holds six correctness items,
  fifteen test-and-guard items, eleven stale-prose instances and eight cosmetics.
  This session takes five and leaves the rest where a later session can read them.
- **A repository-wide order-dependence fix.** Measured this session at seed
  `20261009`: `tests/unit/store/errors.test.ts:119` was the **only** shuffle
  failure in 140 test files and 2228 tests. The fix is bounded to that file by
  measurement, not by assumption.
- **Cleaning control bytes out of `tests/` or `probe/`.** Measured this session:
  there are none. The widened rule passes immediately; if it does not, a control
  byte arrived during this session and that is a finding, not a cleanup.
- **Editing anything under `src/shared/contracts/`.** Those nine files are frozen
  contracts from earlier sessions.
- **`src/main/pod-manager/index.ts`.** Its re-exports must keep resolving to the
  same values, so it is deliberately untouched.
- **The `log.md` history gap.** Three merged sessions have no entry
  (`workspace-refinement`, `transcript-readability`, `correctness-sweep`), as do
  the 2026-10-07 hand-run and the audit itself. Recorded here because it was
  found during this session's setup; fixing it is a documentation job, not this.

## Assumptions

| Question | Answer | Rung | Evidence |
|---|---|---|---|
| Can a `tests/**` file import the renderer's `transcript-filter.ts` to pin the marker against the producer? | **No.** This killed the additive option for D6/D7. | 1 | `tsconfig.node.json` declares no `paths`, and `@shared` appears nowhere in `tests/`, `probe/`, `src/main/`, `src/preload/` or `src/shared/`. Compiling the file under the node program's options yields `transcript-filter.ts(13,49): error TS2307: Cannot find module '@shared/contracts/events'`. The option would require adding a `paths` mapping to a config the whole node program shares, and would make a `tests/` file the first thing in the repo to import `src/renderer`. |
| Where does the single marker definition live, then? | `src/shared/startup-reconciliation-notice.ts`, at the `src/shared/` **root**, not under `contracts/`. | 1 | Both `tsconfig.node.json` and `tsconfig.web.json` include `src/shared/**`. It is the boundary the marker actually crosses. No frozen contract file is touched. |
| Is `src/shared/` currently contracts-only? | **Yes** — nine `.ts` contracts and one `.md`, nothing else. This module is its first non-contract member, and its docblock must say so. | 1 | `find src/shared -type f`. |
| Is the order-dependence in `errors.test.ts` the only one in the repo? | **Yes**, at seed `20261009`. | 1 | Whole repo under `--sequence.shuffle --sequence.seed=20261009`: 1 failed, 2227 passed (2228 tests), 139/140 files; the single failure is `errors.test.ts:119` with `provoked` empty. |
| Do `tests/` and `probe/` currently carry control bytes? | **No** — zero files. | 1 | Scan over both trees with the rule's own character class; 0 hits. |
| What does the widened control-byte walk actually cover? | `tests/` and `probe/` hold 67 `.ts`, 10 `.ndjson`, 5 `.md`, 3 `.json`, and no `.tsx`/`.css`/`.html`. The current filter `/\.(ts\|tsx\|css\|html)$/` covers the 67 and skips 18. | 1 | File-extension census of both trees. Whether to widen the filter is T4's decision, with its reason recorded. |
| Is `KEPT_POD` dead, and is it the only one? | Dead, and **not** the only one — `STOPPED_POD` at `:270` is dead too. Both have exactly one occurrence: their own declaration. | 1 | `grep -c` returns 1 for each. `git log -S KEPT_POD` returns only `dac2f65`, the commit that introduced the suite, so it was dead on arrival rather than orphaned later. `noUnusedLocals` is off in both tsconfigs, which is why `tsc` never said so. |
| Does the `resume_fallback` notice have the same duplication? | **No.** `RESUME_FALLBACK_SUBTYPE` is main-only with no renderer copy, so D6's pattern has no sibling case to fix. | 1 | `grep -rn RESUME_FALLBACK` across `src/`. |
| Is the whole suite green and typechecking at `a186f06`? | Yes. 140 test files, 2228 tests; `npm run typecheck` clean on both programs. | 1 | Measured this session on a quiescent tree. |

## Contracts

**None.** `contracts/` is empty and the manifest declares no `contracts` array.

The session's one new interface — the shared marker module — is declared and
consumed entirely inside T5, including its single-definition scan, which is why
that scan was placed under `tests/unit/pod-manager/` rather than in T4's hygiene
file. There is no inter-task boundary left to freeze, and `dir-contracts` is
explicit that an interface only one task will ever touch does not belong in
`contracts/`. The module's path and exports are pinned by T5's acceptance
criteria 1–3 instead.

## Open questions

Two, both for Gate 2, neither blocking dispatch:

1. **T4's extension filter.** Widening it covers 18 more files; leaving it costs
   a recorded reason that must be a property of those files rather than "the last
   incident was a `.ts` file". The original incident was a *scripted* edit, and
   `.json` is scripted-edited too. T4 criterion 2 forces the choice either way.
2. **`src/shared/` gains its first non-contract module.** That is the convention
   consequence of the D6 decision above, and it is the user's to ratify.
