# Cosmetic and structural sweep

Close the 11 open **Cosmetic and structural** backlog items and the 3 Ungrouped test-guard items (C1–C11, U1–U3), each re-measured against `main` `e2e81e1` before it is worked.

## Context

The backlog is being cleared one section at a time. Prose drift, Tests and guards, and Correctness are done. This unit is 14 small items in renderer CSS, copy, a Helm latch, a dialog-focus hook, three test guards, one superseded migration test, and two main-side tidies. Each item's citation was re-read with `git show main:<path>`. All 14 still hold in substance, with these corrections:

- **C11** says the two Pod dialogs have "none of" the hook's three behaviours. That is false for focus-on-open: `DeletePodDialog.tsx:89-93` and `NewPodDialog.tsx:68-81` both move focus on open. What they lack is the Tab trap and the focus restore. Both dialogs are also always mounted by `PodsChrome.tsx:219,228` and return `null` while closed, and the hook captures and restores on mount and unmount, so it cannot be adopted as-is.
- **C2** says only `'compare'` has a test. That is stale: `HelmPanel.test.tsx:603` covers a save after a failed compare. The scope-select, discard and reload release paths are the untested ones.
- **U1** has drifted from `:1331` to `:1360`.
- **C10** deleting the test makes prose false in three more files: `schema.ts:164-166`, `migration-3.test.ts:26-29` and `migration-frozen.test.ts:41-44`.
- **C5** has a sixth construction site, `stub-api.ts:362/366`.

## Definition of done

- [ ] **C1.** The `decodeDirectoryName` docblock (base `paths.ts:53-58`) sits directly above its function. No docblock is orphaned above `PodBlockingSubject`.
- [ ] **C2.** Helm's comparison latch is two-valued. Scope-select, discard and reload each have a test proving they release the claim.
- [ ] **C3.** `src/main/ipc/index.ts` re-exports from `./validate` in exactly one statement, with the same seven names.
- [ ] **C4.** The "Select all in …" label comes from a `copy.ts` function and renders byte-identically.
- [ ] **C5.** A Beachcomber refusal carries its entry's `displayPath`, produced in main. Both the preview list and the result list render it.
- [ ] **C6.** A hovered selected Matriarch paints a surface distinct from its unhovered one. The adjacent comment no longer says the Matriarch "darkens" on selection, which was added at Gate 2.
- [ ] **C7.** Lane hover paints the full `.row` swimlane, not `.rowMain`. Selected rows still read as selected while hovered.
- [ ] **C8.** The lane status `.dot` declares `flex: none`.
- [ ] **C9.** The LaneRow no-clock guard bars the state, effect and subscription hooks, and no longer bars `useRef`. It carries must-match and near-miss fixtures.
- [ ] **C10.** The subsumed migration-1 byte-identity test and its orphaned helpers are gone. Prose that pointed at it now points at `migration-frozen.test.ts`.
- [ ] **C11.** `use-dialog-focus.ts` lives in `shell/`. Both Pod dialogs trap Tab and restore focus, to the opener or else a fallback, on close. Beachcomber's behaviour is unchanged.
- [ ] **U1.** The retired-id offender scan matches quote-delimited literals only, with must-match and near-miss fixtures.
- [ ] **U2.** The PodBar border-width predicate accepts a multi-value `border-width` whose every term is a width token or `0`, with fixtures for both directions.
- [ ] **U3.** U3 is closed as moot by C10's deletion.
- [ ] **Tail.** Repo-wide `npm run typecheck` exits 0 and the full `npm test` exits 0, with the change in test count attributed.
- [ ] **Backlog.** At Gate 3, each closed item's line is removed from `.sir/backlog.md`. This is the orchestrator's row; see `coverage.md`.

## Scope

The 14 items above.

### Not in scope

- The other 2 Ungrouped lines, the Design decisions section, and the Tooling section of `.sir/backlog.md`.
- Any new design token. C6 uses an existing `--oc-*` surface.

## Assumptions

| Question | Answer | Rung | Evidence |
|---|---|---|---|
| C2: collapse or test? | Collapse to a boolean latch, and test the three untested release sites. | 1 | `HelmPanel.tsx:62,84`. The only read is `=== 'compare'`, so `'other'` and `null` are never distinguished. |
| C4: how is a parameterised sentence expressed in `copy.ts`? | A function exported beside `COPY`, which keeps string values only. | 1 | `helm/copy.ts:30` `scopeOptionText` |
| C5: which field names a refusal's entry? | A new required `displayPath` on `BeachcomberPreviewRefusal`, filled by main's `refusalFor`. A renderer-side lookup by id is rejected. | 1 | `contracts/beachcomber.ts:35-39`: ids are opaque and minted per scan. `:294-299`: the trash result carries a fresh scan, so its ids cannot be looked up. Precedent: `BeachcomberTrashFailure` at `:281-286`. |
| C5: does the rendered path need a `copy.ts` entry? | No. `displayPath` is data, rendered in its own element beside `reason`, and no new sentence is introduced. | 1 | `beachcomber/copy.ts:12-13`: `displayPath` is read off the view model and never duplicated in copy. Precedent: the trash-failure row at `BeachcomberResult.tsx:59-65`. |
| C6: which token is the selected Matriarch's hover surface? | `--oc-bg-selected` | 1 | `tokens.css:25-29`. It is the only surface distinct from both the selected Matriarch's `--oc-bg-hover` and the unselected Matriarch's `--oc-bg-raised`. |
| C7: how does hover reach the full width? | Move hover from `.rowMain:hover` to `.row:hover`. A hovered selected Calf stays `--oc-bg-selected`. Hover rules set `background` only. | 1 | `LaneRail.module.css:77-88`, the `.row` docblock. PodBar precedent: `PodBar.module.css:59-71` and `PodBar.styles.test.ts:179-193`. |
| C7: an unselected Matriarch hovered paints `--oc-bg-hover`, the same as a selected Matriarch unhovered. Acceptable? | Yes. It follows from the existing token assignment, and selection is also carried by `aria-current`. | 4 | `LaneRail.module.css:137-143`. Judgment. |
| C9: what does the narrowed guard still bar? | `useState`, `useReducer`, `useSyncExternalStore`, `useEffect` and `useLayoutEffect`, each as a whole identifier. It allows `useRef`, `useMemo` and `useId`. | 4 | The `LaneRow.source.test.ts:4-10` docblock: "no timer, no clock". Judgment about which hooks can hold or tick a value. |
| C10: is the test really subsumed? | Yes. `migration-frozen.test.ts` renders migration 1 from the same blob `96f6e925…:src/main/store/schema.ts`, and it skips in a shallow clone. | 1 | `migration-frozen.test.ts:65,147` against `migration-2.test.ts:58`, verified with `git show main:`. |
| C11: how does an always-mounted dialog adopt the hook? | The hook captures on open and restores on close, not on mount and unmount. The design is left to T5. Beachcomber's tests pass unmodified. | 1 | `PodsChrome.tsx:219,228`. `use-dialog-focus.ts:54-66`. |
| C11: does each dialog keep its open-focus target? | Yes. New Pod focuses its title field and Delete focuses the dialog. C11 adds the trap and the restore. | 1 | `NewPodDialog.tsx:66-78`, `DeletePodDialog.tsx:85-92`, and the existing test `NewPodDialog.test.tsx:216-219` |
| C11: where does focus fall back when the opener is gone? | `PodsChrome`'s outermost element, given `tabIndex={-1}` | 1 | Precedent: Beachcomber's `panelRef` at `BeachcomberPanel.tsx:40-41,78`. The alternative needs a ref threaded through `PodBar`. |
| U2: relax or document? | Relax. `border-width` accepts 1–4 terms, each a width token or `0`. Per-side longhands stay single-valued. | 1 | The `PodBar.module.css:2-4` docblock permits per-side values. `PodBar.styles.test.ts:448-452` |
| U2: relax the logical axis longhands too? | `border-block-width` and `border-inline-width` accept 1–2 terms. | 4 | Judgment from the CSS Logical Properties grammar. No source was cited. |
| Can tasks build and test concurrently in one worktree? | Yes. Both typechecks are `--noEmit`, and store tests use temp directories. Repo-wide commands are ordered away from tasks that inject defects through `dependsOn`. | 1 | `package.json` typecheck scripts, as reported by the architect |

## Contracts

- [`contracts/README.md`](contracts/README.md): the index.
- [`contracts/beachcomber-refusal.ts`](contracts/beachcomber-refusal.ts): `BeachcomberPreviewRefusal { id; displayPath; reason }`. T1 produces it and T2 consumes it.

## Open questions

None.
