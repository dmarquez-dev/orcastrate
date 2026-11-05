# Design-decisions sweep

Rule on each of the 10 `## Design decisions` lines in `.sir/backlog.md`, implement the cheap
rulings, and close or re-file the rest.

## Context

After `20261104-1727-tooling-ungrouped-sweep`, the Design-decisions section
(`.sir/backlog.md:25-34`, base `cc5077c`) is the only open backlog section besides the
Tooling harness line. Every item was re-measured at spec time; evidence per item is in the
Assumptions table.

**Gate 2 rulings (2026-11-05):** 1 restore, keep `aria-current`; 2 promote `hold`, delete
the caveat; 3 close as accepted; 4 keep deferred (re-file with the open security
question); 5 re-file as its own session; 6, 7 and 9 keep deferred; 8 and 10 close as declined.
Coverage gaps: `docs/first-run.md:201` added to T3 (C13); the warning plumbing is kept,
with a backlog line at Gate 3; the `requestOpen` same-key no-op is kept as a defence.

## Definition of done

- [ ] D1 — Item 1 (PanelBar re-click): ruled. Under *restore*: a click or Enter/Space on the
  open panel's own `PanelBar` button calls `onClose`, reaching the guarded
  `requestClose()`; a dirty Helm draft re-clicked raises the close confirmation.
- [ ] D2 — Item 2 (Helm `hold`): ruled. Under *promote*: `hold` validates with no issue in
  main and renderer; `HOLD_WARNING_MESSAGE`, `OBSERVED_CLI_VERSION`,
  `CROSS_SESSION_INBOUND_CONFIRMED`, `CROSS_SESSION_HOLD_CAVEAT` and
  `PANEL_TEST_IDS.helmCrossSessionCaveat` no longer exist in `src/` or `tests/`; docblocks
  cite CLI 2.1.318.
- [ ] D3 — Item 3 (palette lightness pass): ruled.
- [ ] D4 — Item 4 (direct Calf steering): ruled.
- [ ] D5 — Item 5 (`forkSession` branching): ruled.
- [ ] D6 — Item 6 (full config manager): ruled.
- [ ] D7 — Item 7 (terminal-session adoption): ruled.
- [ ] D8 — Item 8 (raw terminal pane per lane): ruled.
- [ ] D9 — Item 9 (macOS/Linux validation): ruled.
- [ ] D10 — Item 10 (repo-wide formatter): ruled.
- [ ] D11 — `.sir/backlog.md`: the ten Design-decisions lines are removed; every item ruled
  *defer* or *re-file* has one fresh line, dated and attributed to this session.
- [ ] D12 — `tsc --noEmit` exits 0 for both `tsconfig.node.json` and `tsconfig.web.json` on
  the integrated tree.
- [ ] D13 — The full vitest suite passes on the integrated tree (147 files at base).

## Scope

Items 1 and 2 are implemented (T1–T5). Items 3–10 under their recommended rulings produce no
code change; their outcome is the D11 backlog edit, made by the orchestrator at Gate 3.

### Not in scope

- The Tooling line (`.sir/backlog.md:38`, live-`claude` hand-run harness).
- Other `2.1.235` citations in `src/` (`lane/messages.ts`, `pod/options.ts`, `pod/errors.ts`,
  `pod-manager/routing-mode.ts`, `pod/pod-runner.ts:480`, `contracts/renderer-view.ts:304`):
  they record different facts measured against that build.
- Building any of the MVP-deferred features (items 4–9).
- `PanelBar.module.css` and the `aria-current` → `aria-pressed` switch (unless ruled).

## Assumptions

| Question | Answer | Rung | Evidence |
|---|---|---|---|
| Is `hold` an accepted `crossSessionInbound` value in the current CLI? | Yes, in 2.1.318 | repo/external | `claude --version` → `2.1.318`; binary `~/.local/bin/claude` embeds `VERSION:"2.1.318"`, `var Von=["accept","hold","refuse"]`, `crossSessionInbound:()=>B(Von)…'hold' parks them for your review` |
| Which sites name the hold warning/caveat? | 33 lines over 5 identifiers in `src/`+`tests/`, plus `docs/first-run.md:201` | repo | `grep -rnE` (T4 C6) = 33, partitioned 11+19+3; `git grep` over `docs/` = 1 |
| Delete `CROSS_SESSION_INBOUND_CONFIRMED` or set it to all three? | Delete | judgment | an equal second list is a second source of truth (`contracts/helm-hold.md`) |
| Does any warning producer remain after item 2? | No; plumbing stays as contract vocabulary | repo | `'warning'` producers at base: `main/helm/validate.ts:121`, `state/panel-store.ts:894` only |
| Re-click route | `onClose()` when `open === key`, else `onOpen(key)`; no signature change | repo | `PanelBar.tsx:97-105`, `App.tsx:89-98`, `renderer-panels.ts:225-270` |
| Keep `aria-current` under restore? | Yes | judgment | marks current item in a set; Pod tabs use the same idiom (`PodTab.tsx:198`) |
| Palette figures | 7 of 28 pairs < 1.2; same-surface sub-1.2 pairs: Pod `idle`/`beached` 1.005, lane `running`/`done` 1.055, lane `running`/`orphaned` 1.195 | repo | WCAG 2.x script over `tokens.css:63-111`, reproducing all published figures (1.005, 1.052, 1.796, 3.903, 2.173, 1.195, 1.206); unions `events.ts:99,122` |
| Why a stopped Pod's tab is grey | Its status becomes `closed`; lanes become `stopped` | repo | `pod-manager.ts:304` |
| Is `forkSession` available? | Yes, in the SDK | repo | `sdk.d.ts:723` (`forkSession()`), `:1547` (`forkSession?: boolean`), SDK 0.3.235 |
| Calf steering status | Deferred on product + security grounds, tools exist | repo | `pod-runner.ts:475-487`; design spec `2026-08-18-orcastrate-design.md:446-454` |
| Items 6–9 origin | MVP backlog list | repo | design spec `:437-443`; `README.md:9` |
| Formatter history | Prettier declined at the previous session's Gate 2 | repo | `.sir/sessions/20261104-1727-tooling-ungrouped-sweep/log.md` GATE 2 line |
| Can tasks run concurrently? | Mechanically yes, but serialized: three inject, T4 deletes what T2/T3 stop using | judgment | architect report; `.sir/lessons.md` (2026-11-04 injection lesson) |
| Verification commands run in the worktree? | Yes, from the main checkout's `node_modules` | repo | `state.json` `verification` |

## Contracts

- [`contracts/panel-reclick.md`](contracts/panel-reclick.md) — item 1 routing; no declaration changes.
- [`contracts/helm-hold.md`](contracts/helm-hold.md) — item 2 deletions and docblocks in
  `src/shared/contracts/helm.ts` and `src/renderer/src/contracts/renderer-panels.ts`.

## Open questions

None outside Gate 2's rulings.
