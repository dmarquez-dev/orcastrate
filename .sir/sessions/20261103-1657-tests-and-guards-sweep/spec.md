# Tests and guards sweep

Close the 15 **Tests and guards** items in `.sir/backlog.md`. For each one, a test or guard has to catch the regression it exists for, and it is shown doing so against an injected defect. Runtime behaviour does not change.

## Context

The architect re-measured all 15 items at `main` ce1cd36. **All 15 still hold, and none is already resolved.** Several citations have moved:

| Item | Cited | Now at ce1cd36 |
|---|---|---|
| `recordAttempts` | `:236-249` | `helpers.ts:250-262`; closure at `:258-261` |
| `channels.test.ts` comment | `:84` | `:84-90` |
| `watcher.test.ts` identity test | `:249-256` | `:249-270` |

The re-measurement also found three things the backlog lines did not say:

- **D1:** `serializeSettings` never returns `''` (`src/main/helm/document.ts:206` returns `JSON.stringify(…)` plus `\n`). The empty-serialization path can only be reached with a mock. This is Gate 2 question E1.
- **D3:** the orphan marker's position *is* testable. The `unverified`/`orphan` exclusivity at `BeachcomberRow.tsx:44-45` applies to the notice versus the marker, but the path at `:100` always renders.
- **D14:** both docblocks are true today, so enforcing them needs no CSS edit.

## Definition of done

1. **D1.** Closed as moot at Gate 2 (E1), with no task. `serializeSettings` never returns `''` (`src/main/helm/document.ts:206` at ce1cd36), so the `content === '' ? null` branch the item guards against cannot be reached. The backlog line is removed at Gate 3 with this evidence.
2. **D2.** The `failure-leaf.test.ts` import scan recognises bare side-effect, double-quoted and semicolon-less imports. Its loops fail on zero statements.
3. **D3.** A test pins the orphan marker after the display path in `BeachcomberRow`.
4. **D4.** `absentControlLabels` equals exactly `[COPY.compare]`. Removing Save, Discard or Reload turns it red.
5. **D5.** A direct test makes `registerIpcHandlers` register one wire name twice. It asserts both the throw and that `ipcMain.handle` saw the channel only once.
6. **D6.** `recordAttempts`' trap forwards every argument and returns the same function on repeated reads.
7. **D7.** Every `makeManagerHarness` harness enforces the never-empty `podEvent` rule. `closePod`'s idempotence test asserts a per-channel delta over every `Pushes` channel.
8. **D8.** `roots.test.ts` asserts recursive `sizeBytes` exactly.
9. **D9.** `migration-frozen.test.ts` skips, with a visible reason, in a shallow clone. In a full clone it still runs, and a bad ref is still red.
10. **D10.** Helm watcher tests wait on a condition rather than `settle(turns = 6)`, and they are stable over 5 runs.
11. **D11.** A test holds each of the 10 `.ndjson` recordings to a frozen SHA-256 of its LF-normalised bytes. The file set is derived from the directories, not listed by hand.
12. **D12.** A stylesheet test guards `PanelBar.module.css`'s `.button[aria-current='true']` rule and its background.
13. **D13.** `tokens.test.ts` finds the end of the `:root` body by brace matching.
14. **D14.** Tests enforce the `PodBar.module.css` and `DeletePodDialog.module.css` docblock enumerations. The docblocks are unchanged.
15. **D15.** `retiredLiteralUseReport` counts `total` and `absent` on the same quote-delimited match.
16. **G1.** Each worked item names a red step or injected defect that the old test missed and the new test catches.
17. **G2.** `npm run typecheck` exits 0 at the DAG tail.
18. **G3.** `npm test` passes at the tail, with no test removed. Each modified file keeps at least its ce1cd36 test count.
19. **G4.** No runtime change:
    - No file under `src/` changes other than `*.test.ts(x)`.
    - No `.ndjson` recording changes.
    - Injection-only files are byte-identical to ce1cd36 at each task's head.

## Scope

The 15 Tests and guards backlog lines. Each closed line is removed from `.sir/backlog.md` at Gate 3, not by any task.

### Not in scope

- Every other backlog section, the 3 Ungrouped items included.
- D1's test. Gate 2 accepted it out of scope (E1) because its failing input cannot occur.
- Any production source or CSS edit. Production files appear in `owns` only so a task can inject a positive control into them, and they revert byte-for-byte.
- The architect's advisory findings. Each is a candidate for the backlog at Gate 3:
  - `tests/unit/store/migration-2.test.ts:104` also shells out to `git show`, so it still goes red in a shallow clone. The Cosmetic section already has a line to delete it.
  - `hygiene.test.ts:1325`'s retired-id offender scan uses substring `includes`, which is the same shape as D15.
  - `closePod` on an already-closed Pod re-pushes `podStatus 'closed'` (`pod-manager.ts:511-518`). It is harmless, and T4's whole-record count will pin it as expected.

## Assumptions

| Question | Answer | Rung | Evidence |
|---|---|---|---|
| D14: enforce or soften? | Enforce. The docblock text is unchanged. | 1 | Discussion's "test-side by default" decision. Existing stylesheet scanners in `hygiene.test.ts` and `*.styles.test.ts`. Both docblocks measured true at ce1cd36 by two methods (architect node walk, and `grep -nE '[0-9](px\|rem\|em)'`). |
| D11: what integrity signal? | SHA-256 per file, over the bytes with CRLF→LF, frozen to `git show ce1cd36:<p> \| sha256sum`. | 1 | `core.autocrlf=true`. `git ls-files --eol` shows all 10 as `i/lf w/crlf`, so a raw-byte hash or byte length would differ between checkouts. The architect checked on 2 files that the normalised hash equals the blob hash and the raw hash differs. |
| D11: how many recordings? | 10, derived at test time. | 1 | `git ls-files '*.ndjson' \| wc -l` returns 10. `find tests/fixtures/protocol probe/evidence -name '*.ndjson' \| wc -l` returns 10. |
| D9: what is the skip predicate? | Skip only when the clone is shallow. A missing ref in a full clone stays red. | 4 | Test discipline. The tripwire is documented at `migration-frozen.test.ts:46-62`. Refs are `<commit>:src/main/store/schema.ts` (`:64-69`), which a depth-1 clone lacks. |
| D9: what mechanism? | vitest conditional skip, not try/catch. | 1 | Discussion: "skip rather than go red". |
| D3: work it or report it? | Work it. It is reachable. | 1 | `BeachcomberRow.tsx:44-45`, `:100`, `:134`. `BeachcomberRow.test.tsx:122` builds an orphan session-record row. |
| D7: what does "every channel counted" mean? | Move the never-empty `podEvent` rule into `makeManagerHarness` (5 test files use it). Add a per-channel attempted count keyed from `createPushes`, and assert `closePod`'s delta as a whole record. A per-method table over all 14 `PodManagerApi` methods was rejected. | 1 | `.dir-sdlc/backlog.md:1715-1716`; `close-pod-lane-sweep.test.ts:36-59, 311-344`; `pod-manager.ts:511-518`. `grep -rl makeManagerHarness tests --include=*.test.ts` returns 5. |
| D11: which recording takes the injection? | `probe/evidence/foreground-shipped.ndjson`. | 1 | `grep -rln 'foreground-shipped' src tests` finds nothing, so no other test reads it. |
| D14: may an existing scanner satisfy a claim? | Yes if it is cited by file:line and shown red under injection. Tracking needs a new assertion. | 1 | The hygiene tracking census accepts any `--oc-tracking-*` (`hygiene.test.ts:1816-1817`). |
| Does `--sequence.shuffle` print the seed T4 must quote? | Yes: `Running tests with seed "…"`. | 1 | Orchestrator run of `vitest run … close-pod-lane-sweep.test.ts --sequence.shuffle` at ce1cd36 (vitest 4.1.11): 10 passed. |
| Can verification run in the worktree? | Yes, through the main checkout's `node_modules`, by parent lookup. | 1 | `state.json` `verification`: typecheck exit 0, and `npm test` 141 files / 2274 passed. |
| Is a contract needed? | No. No task consumes another task's interface. | 4 | Disjoint `owns` across all 7 tasks. |

## Contracts

None. `manifest.json` declares `contracts: []`.

## Open questions

None. Gate 2 resolved E1: D1 is closed as moot and T2 was dropped from the manifest. Task ids keep their draft numbering (T1, T3–T8), so the remaining ids are not renumbered.
