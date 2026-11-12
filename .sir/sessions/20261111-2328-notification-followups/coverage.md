# Coverage

| Item | Covering task | Gate 2 | End state |
|---|---|---|---|
| 1. Empty message rendered as given for every kind; no child nodes, `textContent` `''` | T1 (C1, C2, C7) | covered | met — `reviews/T1.md` C1, C2, C7 met |
| 2. `NotificationItem` docblock states the empty case; no Text-node promise for every message | T1 (C3) | covered | met — `reviews/T1.md` C3 met |
| 3. No existing notification-region test weakened | T1 (C5), T3 (C10) | covered | met — `reviews/T1.md` C5 met, `reviews/T3.md` C10 met |
| 4. Unlisted successful stop raises exactly one info `Pod stopped`, key `pod-close` | T2 (C17, C18, C20) | covered | met — `reviews/T2.md` C17, C18, C20 met |
| 5. Unlisted stop still calls `closePod` with that id | T2 (C19) | covered | met — `reviews/T2.md` C19 met |
| 6. Listed stop still raises `Pod stopped: <title>`; S6 passes | T2 (C21, C26) | covered | met — `reviews/T2.md` C21, C26 met |
| 7. Failed unlisted stop raises the IPC message verbatim as an error, no `Pod stopped` | T2 (C22) | covered | met — `reviews/T2.md` C22 met |
| 8. `handleStop` comments describe new behaviour, no reachability claim; no `!`, no `as`, no throw | T2 (C23, C24) | covered | met — `reviews/T2.md` C23, C24 met |
| 9. Focused viewport has min width and height ≥ 16px from `--oc-space-*`; outline unchanged, never removed | T3 (C8, C9, C10, C13) | covered | met — `reviews/T3.md` C8, C9, C10, C13 met |
| 10. Unfocused viewport size unchanged | T3 (C11) | covered | met — `reviews/T3.md` C11 met |
| 11. N7 step 5 predicts the new size, still unmeasured, N7 open; every CSS line citation correct | T3 (C14, C15) | covered | met — `reviews/T3.md` C14, C15 met |
| 12. No `src` file gains a session-id or `.sir/sessions` citation | T1 (C4), T3 (C16), T2 (C27) | covered | met — `reviews/T1.md` C4, `reviews/T3.md` C16, `reviews/T2.md` C27 met |
| 13. Every new test's name states its condition and outcome | T1 (C6), T3 (C12), T2 (C25) | covered | met — `reviews/T1.md` C6, `reviews/T3.md` C12, `reviews/T2.md` C25 met |
| 14. `npm run typecheck` and unscoped `npm test` exit 0 | T2 (C28, C29) | covered | met — `reviews/T2.md` C28, C29 met |
| 15. The three closed backlog rows, and no others, are removed from `.sir/backlog.md` at Gate 3 | orchestrator: a task has no write to `.sir/backlog.md` at Gate 3 | uncovered — orchestrator's (accepted at Gate 2); evidence: `git diff` of `.sir/backlog.md` in the artifact commit, counted in the Gate 3 report | met — applied after approval; `git diff -U0 -- .sir/backlog.md` removes 4 rows and adds 1: the three closed rows (empty message, unlisted stop, empty-viewport outline) and the open N6 row rewritten with its citation `:53` → `:54`, per Gate 3's fix-now; no other row touched; `grep -c 'Human check not made' .sir/backlog.md` prints 4 |

No contract operations: this session freezes no contract (`contracts/README.md`).

| Operation | Implementing task | Consuming task | Gate 2 | End state |
|---|---|---|---|---|
