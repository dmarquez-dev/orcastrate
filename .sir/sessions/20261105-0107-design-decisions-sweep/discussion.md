# Design-decisions sweep

Close the `## Design decisions` section of `.sir/backlog.md`. For each of the 10 items, gather
current evidence. The user rules on each one at Gate 2. This session implements the cheap ones,
and the rest are closed or re-filed as sessions of their own.

## Context

After the 2026-11-04 tooling-ungrouped-sweep, `.sir/backlog.md` has empty Correctness, Tests
and guards, Prose drift, Cosmetic and structural, and Ungrouped sections. What remains is the
10 Design-decision lines (`.sir/backlog.md:25-34`) and one Tooling line (`:38`, the live-`claude`
hand-run harness). At Gate 1 the user had four choices: this sweep, the harness, the palette pass
alone, or the Helm `hold` re-verify alone as a Small. They chose this sweep.

The 10 items, as the backlog words them (every citation needs re-measuring at spec time):

1. `PanelBar` re-click-to-close: decide whether to restore the gesture on the per-panel button
   (2026-08-31-orcastrate-helm-draft-safety).
2. Helm `hold` value set: re-verify it against the current CLI. `OBSERVED_CLI_VERSION` is 2.1.235,
   at `src/main/helm/validate.ts:31` (dir-handrun-2026-10-07).
3. Palette-wide status lightness pass, decided per pair. This includes whether the hygiene guard
   asserts measured separation, and whether a stopped Pod's tab reads grey where its Matriarch
   reads tan. Worst pair: `idle`/`beached` at 1.005. Seven of 28 pairs are under 1.2
   (`src/renderer/src/styles/tokens.css:88-92`).
4. Direct Calf steering: `src/main/pod/pod-runner.ts:486` returns `{ supported: false }`.
5. `forkSession` branching: no reference anywhere in `src/`.
6. Full config manager, deferred by the MVP.
7. Adopting terminal-started Claude Code sessions, deferred by the MVP.
8. Raw terminal pane per lane, deferred by the MVP.
9. macOS and Linux validation, deferred by the MVP.
10. Repo-wide formatter adoption. There is no Prettier config. Under defaults, 318 of 318 files fail
    `--check`, and 166 of 318 still fail with `--single-quote --print-width 100`. The check has to
    run from the main checkout, never from under `.claude-worktrees/`.

The `.sir/lessons.md` lessons that bear on this session: read every literal a criterion quotes
off `git show <base>:<path>`; run a frozen grep criterion's predicted base count at Gate 2;
give a numeric scanner a signed must-match fixture.

## Decisions

- Track: Standard. Gate 1 approved 2026-11-05.
- Scope: the 10 Design-decision items only. The Tooling harness item (`.sir/backlog.md:38`) is out
  of scope and stays in the backlog.
- Every item's decision belongs to the user. The spec phase gathers evidence for each item (current
  CLI behaviour, measured contrast, current code state, and a rough cost) and presents the item at
  Gate 2 with ranked options. It decides none of them itself.
- Items whose chosen outcome is cheap are implemented in this session. The user named the Helm
  `hold` re-verify and the PanelBar re-click restore as the likely cheap ones; the palette pass
  counts as cheap only if the per-pair rulings make it so.
- The large MVP-deferred features (items 4-9) are not built here. Each is closed as declined, kept
  deferred, or re-filed as its own future session, as the user rules.
- At Gate 3, every item the user ruled on is removed from `.sir/backlog.md`. Anything re-filed or
  deferred again gets a fresh line.
- Session name: `design-decisions-sweep`.
