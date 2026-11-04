<!-- frozen: 20261103-2240-cosmetic-structural-sweep, Gate 2 -->

# Contracts

One cross-task interface in this session.

| File | Producer | Consumer | Source-tree owner of the shipped declaration |
|---|---|---|---|
| `beachcomber-refusal.ts` | T1 (adds `displayPath` to `BeachcomberPreviewRefusal`, fills it in `refusalFor`) | T2 (renders it in `BeachcomberRefusals.tsx`) | `src/shared/contracts/beachcomber.ts` (T1) |

No other task boundary carries an interface. The hook C11 changes (`useDialogFocus`) is built and consumed entirely inside T5. T1 and T2 share test fixture files, but they run one after the other (T2 depends on T1), so the fixtures are sequential ownership and not an interface.
