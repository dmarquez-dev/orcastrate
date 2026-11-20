# Coverage

| Item | Covering task | Gate 2 | End state |
|---|---|---|---|
| 1. `PermissionMode` is a type-only alias of the SDK's | T1 (C1) | covered | met (T1 25/25 met, reviews/T1.md round 2) |
| 2. Removing a mode fails typecheck (injected) | T1 (C9) | covered | met (T1 25/25 met; C9 reviewer-reproduced) |
| 3. Adding a mode fails typecheck (injected) | T1 (C10, C4) | covered | met (T1 25/25 met; C10 reviewer-reproduced, C4 amended by A1 to "Shown in C10") |
| 4. Runtime guard accepts six, rejects `manual` | T1 (C3, C5, C6) | covered | met (T1 25/25 met) |
| 5. IPC validator accepts six, rejects `manual`, message from the list | T1 (C7, C8) | covered | met (T1 25/25 met) |
| 6. Migration 6 widens the CHECK without losing rows, ancestry, FK or index | T1 (C11–C17, C21, C22) | covered | met (T1 25/25 met; C17a reviewer-reproduced) |
| 7. Migration 3 and `MIGRATION_3_PERMISSION_MODES` not edited | T1 (C18) | covered | met (T1 25/25 met) |
| 8. Schema-head guards keyed to migration 6 | T1 (C19, C20) | covered | met (T1 25/25 met) |
| 9. Six options; danger on `bypassPermissions` only | T1 (C23, C24); T3 (F6) | covered | met (T1 25/25 met; T3 12/12 met) |
| 10. Main reads, caches and pushes auto-mode support | T2 (B1–B12) | covered | met (T2 18/18 met; B7 and B11 reviewer-reproduced) |
| 11. Renderer holds the pushed value and exposes `useAutoModeSupport()` | T2 (B13–B16) | covered | met (T2 18/18 met) |
| 12. Nothing cached: dialog lists six | T3 (F2, F8); T1 (C24) | covered | met (T3 12/12 met; T1 25/25 met) |
| 13. Dialog hides `auto` on false, shows on true or null | T3 (F3, F4, F7, F8, F9) | covered | met (T3 12/12 met; F7 reviewer-reproduced) |
| 14. Hidden `auto` selection reverts to `default`, never submitted | T3 (F5) | covered | met (T3 12/12 met) |
| 15. Docblocks state rules in place; no session id or `.sir/` path in `src/` or `tests/` | T1 (C2, C6); T2 (B17); T3 (F10) | covered | met (T1 25/25, T2 18/18, T3 12/12 met; B17 and F10 reviewer-reproduced) |
| 16. Typecheck and full suite green at the tip | T3 (F11, F12); also T1 (C25), T2 (B18) | covered | met (T3 12/12 met; reviewer ran typecheck exit 0 and `npm test` 181 files / 2926 tests at 3e22e1f) |
| 17. Backlog row "Offer every SDK permission mode" removed in the Gate 3 artifact commit | orchestrator | uncovered — orchestrator's (Gate 2 D3 e): evidence is `git show <artifact commit> -- .sir/backlog.md`, recorded in `report.md`; end state `met after approval`, since the edit follows approval | met, applied after approval: `grep -c "Offer every permission mode the SDK declares" .sir/backlog.md` printed 0 after the Gate 3 edit (16 dated rows, from 12), and the artifact commit carries that edit |

| Operation | Implementing task | Consuming task | Gate 2 | End state |
|---|---|---|---|---|
| `PermissionMode` | T1 | T3 | covered | called (pre-existing), `src/renderer/src/pods/NewPodDialog.tsx` |
| `PermissionModeOption` | T1 | T3 | covered | called, `src/renderer/src/pods/NewPodDialog.tsx:66` |
| `PERMISSION_MODE_OPTIONS` | T1 | T3 | covered | called (pre-existing), `src/renderer/src/pods/NewPodDialog.tsx` |
| `ALLOWED_PERMISSION_MODES` | T1 | T1 (own task only) | uncovered — own-task member, kept in the contract as fixed text; no consumer, not searched at Gate 3 (Gate 2 D3 d) | out of scope |
| `requirePermissionMode` | T1 | T1 (own task only) | uncovered — own-task member, kept in the contract as fixed text; no consumer, not searched at Gate 3 (Gate 2 D3 d) | out of scope |
| `DONT_ASK_OPTION` | T1 | T1 (own task only) | uncovered — own-task member, kept in the contract as fixed text; no consumer, not searched at Gate 3 (Gate 2 D3 d) | out of scope |
| `AUTO_OPTION` | T1 | T1 (own task only) | uncovered — own-task member, kept in the contract as fixed text; no consumer, not searched at Gate 3 (Gate 2 D3 d) | out of scope |
| `AutoModeSupport` | T2 | T3 | covered | called, `src/renderer/src/state/store.ts` (whole-repo fallback search; absent at base) |
| `useAutoModeSupport` | T2 | T3 | covered | called, `src/renderer/src/pods/PodsChrome.tsx:51` |
| `StubAutoModeSupportEmit` | T2 | T3 | covered | called (test seam), `src/renderer/src/__tests__/auto-mode-option.e2e.test.tsx:32` (`api.emit.autoModeSupport`; the interface name itself appears only in `stub-api.ts`) |
