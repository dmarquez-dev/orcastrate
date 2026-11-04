# Coverage

| Item | Covering task | Gate 2 | End state |
|---|---|---|---|
| D1. Discipline fragment `.sir/disciplines/frontend.md` | T5 (C1–C4) | covered | met (`reviews/T5.md` C1–C4) |
| D2. Fragment registered in `.sir/config.json` | T5 (C5–C7) | covered | met (`reviews/T5.md` C5–C7) |
| D3. Stub non-`projects` rows carry `'absolute-path'` | T4 (C1–C3) | covered | met (`reviews/T4.md` C1–C3) |
| D4. `.chrome:focus-visible` inset ring | T3 (C1–C5) | covered | met (`reviews/T3.md` C1–C5) |
| D5. `closePod` on a closed Pod: no push, no `updatePod`, no sweep | T1 (C2–C7, C12) | covered (C12 added at Gate 2: retitle `pod-stop.e2e.test.tsx:666`) | met (`reviews/T1.md` C2–C7, C12) |
| D6. Whole-record count reflects D5 | T1 (C1) | covered | met (`reviews/T1.md` C1) |
| D7. `DeletePodDialog` re-focuses on A→B | T2 (C1–C6) | covered | met (`reviews/T2.md` C1–C6) |
| D8. Typechecks and full suite pass | T1 C10–11, T2 C7–8, T3 C7–8, T4 C5–6, T6 C1–C3 | covered | met (all eleven named criteria met in `reviews/T1.md`, `T2.md`, `T3.md`, `T4.md`, `T6.md`) |
| D9. No `commit-msg` hook, `.githooks/` or `core.hooksPath` added | orchestrator: no task has git | uncovered → orchestrator; evidence: `git diff --name-only main...agent/20261104-1727-tooling-ungrouped-sweep` lists no hook path, and `git config --get core.hooksPath` exits 1 in the main checkout (exits 1 at spec time); predicted `met` | met, confirmed (orchestrator-run at Gate 3 on tip 3e0b5a0: the `git diff --name-only` lists 12 files, the full stat count of `git diff --stat c5692ee..3e0b5a0`, and none is under `.githooks/` or `.git/hooks/` or named `commit-msg`; `git config --get core.hooksPath` printed nothing, exit=1) |
| D10. Gate 3 removes the seven closed items from `.sir/backlog.md` and appends the formatter Design-decisions line | orchestrator: a Gate 3 action | uncovered → orchestrator; evidence: the `.sir/backlog.md` diff in the artifact commit (7 lines removed, 1 added under Design decisions); predicted `met` | met, confirmed (orchestrator-run at Gate 3: `git diff --numstat -- .sir/backlog.md` printed `1 8`, the 8 being 7 dated item lines plus 1 blank line, counted by `git diff -- .sir/backlog.md` piped to `grep -cE '^-[0-9]{4}-'` → 7 and `'^\+[0-9]{4}-'` → 1; removed: 3 Tooling (discipline, Prettier, commit-msg hook) and all 4 Ungrouped; added: the formatter line under Design decisions; the hand-run harness line stays) |

| Operation | Implementing task | Consuming task | Gate 2 | End state |
|---|---|---|---|---|
