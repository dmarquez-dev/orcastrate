# Coverage

| Item | Covering task | Gate 2 | End state |
|---|---|---|---|
| C1 | T1 | covered | met (C1-a, C1-b) |
| C2 | T3 | covered | met (C2-collapse, -select, -discard, -reload, -preserved) |
| C3 | T1 | covered | met (C3) |
| C4 | T2 | covered | met (C4-copy, -source, -preserved) |
| C5 | T1 (producer), T2 (render) | covered | met (T1: C5-shape, -preview, -trash, -fixtures, -preserved; T2: C5-preview-render, -result-render, -structure) |
| C6 | T4 | covered | met (C6-primary, -follower, -comment, C67-resolver, C67-background-only) |
| C7 | T4 | covered | met (C7-inner, -calf, -matriarch, -selected-primary, -selected-follower) |
| C8 | T4 | covered | met (C8) |
| C9 | T6 | covered | met (C9-bars, -allows, -real) |
| C10 | T7 | covered | met (C10-delete, -orphans, -kept, -subsumed, four prose criteria) |
| C11 | T5 | covered | met (all 18 T5 criteria) |
| U1 | T6 | covered | met (U1-quoted, -must-match, -near-miss, -real) |
| U2 | T6 | covered | met (U2-two-term through U2-doc-and-real, 8 criteria) |
| U3 | T7 (U3-moot) | covered; predicted `moot` | met (U3-moot); prediction confirmed |
| Tail | T8 | covered | met (Tail-typecheck, Tail-suite) |
| Backlog | orchestrator. No task has write access to `.sir/backlog.md`, and the line removal happens at Gate 3 | uncovered; orchestrator, filled from `git diff <base>..HEAD -- .sir/backlog.md` after the Gate 3 backlog edit, one removed line per closed item | met (orchestrator row): `git diff -- .sir/backlog.md` before the artifact commit shows 14 item lines removed (11 Cosmetic-and-structural, C1–C11; 3 Ungrouped, U1–U3), plus one blank line, and 2 lines appended (`git diff --numstat` shows 2 additions and 15 deletions) |

| Operation | Implementing task | Consuming task | Gate 2 | End state |
|---|---|---|---|---|
| `BeachcomberPreviewRefusal.displayPath` (in `preview().refused` and `trash().refused`) | T1 (definition `src/shared/contracts/beachcomber.ts:256`) | T2 | covered; producer T1 | called: `src/renderer/src/beachcomber/BeachcomberRefusals.tsx:41`, absent at base `e2e81e1` (whole-word `git show <tip>:<path> \| grep -nw displayPath` over `git diff --name-only e2e81e1..d90d008`) |
