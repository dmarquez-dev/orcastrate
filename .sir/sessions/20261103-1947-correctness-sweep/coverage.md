# Coverage

<!-- Definition of done: one row per spec.md item. `Item`, `Covering task`, and
     `Gate 2` are written at Gate 2; `End state` is written at Gate 3. -->

| Item | Covering task | Gate 2 | End state |
|---|---|---|---|
| 1 — D1 backup ordinal process-wide | T1 (C1–C5) | covered || met — T1 C1–C5 met (reviews/T1.md) |
| 2 — D2 one surface by shape | T4 (C1–C5) | covered || met — T4 C1–C5 met (reviews/T4.md) |
| 3 — D3 `podBlockerFor` names the exact match | T2 (C1–C3) | covered || met — T2 C1–C3 met (reviews/T2.md) |
| 4 — D4 non-`projects` `pathSource` | T2 (C4–C10) | covered || met — T2 C4–C10 met (reviews/T2.md) |
| 5 — D5 `_UncoveredAtSchemaHead` fires against migration 3 | T3 (C1–C5) | covered || met — T3 C1–C5 met (reviews/T3.md) |
| 6 — D6 `MIGRATION_1` pins lane kinds and event types | T3 (C6–C10) | covered || met — T3 C6–C10 met (reviews/T3.md) |
| 7 — D7 renderer `setPermissionMode` removed | T5 (C1–C6) | covered || met — T5 C1–C6 met (reviews/T5.md) |
| 8 — D8 `aria-current` cited | T6 (C1–C2) | covered || met — T6 C1–C2 met (reviews/T6.md) |
| 9 — P1 PANEL-CLOSE names the no-bridge return | T6 (C3) | covered || met — T6 C3 met (reviews/T6.md) |
| 10 — P2 Composer "impossible case" names `undefined` | T6 (C4–C5) | covered || met — T6 C4–C5 met (reviews/T6.md) |
| 11 — P3 `discrimination.test.tsx` (3 sites, widened at Gate 2) | T4 (C6) | covered || met — T4 C6 met (reviews/T4.md) |
| 12 — typecheck and suite green at tip | T7 (C1–C4) | covered || met — T7 C1–C4 met (reviews/T7.md) |

<!-- Contract operations: one row per declared contract operation. `Operation`,
     `Consuming task`, and `Gate 2` are written at Gate 2; `Implementing task`
     and `End state` are written at Gate 3. -->

| Operation | Implementing task | Consuming task | Gate 2 | End state |
|---|---|---|---|---|
| (none — no session contracts; the one interface change, the `BeachcomberPathSource` member, is produced and consumed inside T2) | | | — | — (no operations to search) |
