# Coverage

| Item | Covering task | Gate 2 | End state |
|---|---|---|---|
| D1. Non-agent `task_started` registers no lane; no `lane_opened`/`lane_closed`; queries gain nothing | T1 (C1-C5, C7) | covered | met (T1 C1-C5, C7 met; reviews/T1.md) |
| D2. Those messages stay Matriarch `system` events | T1 (C2, C6) | covered | met (T1 C2, C6 met; reviews/T1.md) |
| D3. `'local_agent'` and absent `task_type` open lanes as before; fixture replay passes | T1 (C8-C10) | covered | met (T1 C8-C10 met; reviews/T1.md) |
| D4. Bash non-zero exit renders collapsed, `Tool result (exit N)`, no `styles.failed` | T2 (C1-C5, C11, C12) | covered | met (T2 C1-C5, C11, C12 met; reviews/T2.md) |
| D5. Every other `isError` result keeps the error treatment | T2 (C6-C10) | covered | met (T2 C6-C10 met; reviews/T2.md) |
| D6. `ToolDisclosure` and `TranscriptEventItem` comments accurate | T2 (C14) | covered | met (T2 C14 met; reviews/T2.md) |
| D7. Broadcast never throws; skips crashed and unusable frames; others still delivered | T3 (C2-C7, C9) | covered | met (T3 C2-C7, C9 met; reviews/T3.md) |
| D8. Failing send logged once per webContents per episode, no payload | T3 (C10-C14) | covered | met (T3 C10-C14 met; reviews/T3.md) |
| D9. `render-process-gone` logged with reason, exit code, id | T3 (C15, C16) | covered | met (T3 C15, C16 met; reviews/T3.md) |
| D10. Destroyed skips preserved; `index.ts` wiring and comments accurate | T3 (C8, C16-C18) | covered | met (T3 C8, C16-C18 met; reviews/T3.md) |
| D11. Migrations 5 and 6 in `SHIPPED_BLOB` and `it.for`; pass unskipped | T4 (C1-C3) | covered | met (T4 C1-C3 met; reviews/T4.md) |
| D12. One-character edits fail only their own migration case; `schema.ts` ends byte-identical | T4 (C4-C6) | covered | met (T4 C4-C6 met; reviews/T4.md) |
| D13. Migration-frozen docblocks name 1-6 | T4 (C7) | covered | met (T4 C7 met; reviews/T4.md) |
| D14. Full suite 183 files passing, typecheck 0, no session path under `src` | T5 (C1-C3) | covered | met (T5 C1-C3 met; reviews/T5.md) |
| D15. Backlog row "Give migrations 5 and 6 the frozen-blob tripwire" removed in the records commit | orchestrator | uncovered; Gate 2 D1: orchestrator's. Evidence: the records commit's diff of `.sir/backlog.md` removes that row and no other. Gate 3 end state reads `pending (removed in the records commit)` | met (applied after approval: the "Give migrations 5 and 6 the frozen-blob tripwire" row removed from `.sir/backlog.md`, no other row removed, in the records commit) |
| H1. Human check: Bash calls open no lane | human check (code from T1) | uncovered; Gate 2 D2: human check at Gate 3, run from `npm --prefix <worktree> run dev` in a new Pod per spec.md H1, with its subagent control | met (human check H1 passed, observed against `npm --prefix <worktree> run dev`) |
| H2. Human check: non-zero Bash exit shows as E1 describes | human check (code from T2) | uncovered; Gate 2 D2: human check at Gate 3, same Pod, per spec.md H2, with its failing-Read control | met (human check H2 passed on its own criterion, read back, observed against `npm --prefix <worktree> run dev`) |

| Operation | Implementing task | Consuming task | Gate 2 | End state |
|---|---|---|---|---|
