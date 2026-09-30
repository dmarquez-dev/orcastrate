# Coverage — 2026-09-04-orcastrate-correctness-sweep

`Item` / `Operation`, `Covering task` / `Consuming task`, and `Gate 2` were
written at Gate 2. `Implementing task` and `End state` were written at Gate 3.

Change surface, derived from
`git diff --name-only $(git merge-base main dir/2026-09-04-orcastrate-correctness-sweep)..HEAD`:
**24 files changed, 1586 insertions(+), 136 deletions(-)**, merge-base `d9d95cb`.

## Definition of done

| Item | Covering task | Gate 2 | End state |
|---|---|---|---|
| 1 — two saves in one millisecond produce two distinct backups | T2 (criteria 1–7) | covered | **met** — `reviews/T2.md` records criteria 1–7 met; P2 determinism preserved, the three recompute sites unmodified (exactly one removed line in that test file, the import) |
| 2 — Beachcomber blocks a Pod whose directory path was a guess | T3 (criteria 1–7, 9, 11) | covered | **met** — `reviews/T3.md` records all 14 met; union property proved load-bearing by a reviewer mutation |
| 3 — a foreign write between rename and ack still pushes | T2 (criteria 8–11) | covered | **met** — `reviews/T2.md` criteria 8–11 met; criterion 11 met on the code, with the limitation recorded as Advisory 1 |
| 4 — a failure renders on exactly one surface | T4 (criteria 1–8) | covered | **met** — `reviews/T4.md` records all 23 met; criterion 7's non-derivability argument tested, not accepted |
| 5 — the empty state names no control that is off screen | T4 (criteria 9–11) | covered | **met** — `reviews/T4.md` criteria 9–11 met; `grep` for the old sentence returns 0 hits |
| 6 — a failed `helm:scopes` says its sentence once | T4 (criteria 12–18) | covered | **met** — `reviews/T4.md` criteria 12–18 met; the mandatory `toHaveLength(2)` → `(1)` pin rewrite landed and was correctly not raised as a finding |
| 7 — the row states the path is unverified before showing it | T5 (criteria 1–7) | covered | **met** — `reviews/T5.md` rounds 1 and 2 record all 12 met |
| 8 — `refused` documentation matches shipped behaviour | T1 (criteria 7–9) | covered | **met** — `reviews/T1.md` criteria 7–9 met; comment-only proved by a reviewer-authored, falsifiability-tested stripper (2666 chars both sides) |
| 9 — `IpcFailure` reachable without `src/main/pod` and `src/main/store` | T1 (criteria 1–6), adopted by T2 c.12 and T3 c.10 | covered | **met** — `reviews/T1.md` criteria 1–6 met; `reviews/T2.md` c.12 and `reviews/T3.md` c.10 confirm both consumers import the leaf |

**All nine met. No item not met, none out of scope.**

## Contract operations

| Operation | Implementing task | Consuming task | Gate 2 | End state |
|---|---|---|---|---|
| §9 `IpcFailure` from the leaf module | **T1** (`src/main/ipc/failure.ts`) | T2, T3 | covered | **called** — `src/main/helm/helm-service.ts` (T2) and `src/main/beachcomber/service.ts` (T3), both surviving every discard |
| §9 `invalidArgument` / `notFound` / `cwdMissing` | **T1** (`src/main/ipc/failure.ts`) | T1 | covered | **not called** *(owns-scoped; see note below)* |
| §1 backup naming — `backupPathForSequence`, `BackupSequence` | **T2** (`src/main/helm/atomic-write.ts`) | T2 | covered | **not called** *(owns-scoped; see note below)* |
| §2 Pod blocking — `podBlockerFor` | **T3** (`src/main/beachcomber/paths.ts`) | T3 | covered | **not called** *(owns-scoped; see note below)* |
| §3 own-write acknowledgement — `acknowledgeOwnWrite` | **T2** (`src/main/helm/watcher.ts`) | T2 | covered | **not called** *(owns-scoped; see note below)* |
| §4 compare-error routing (Q1–Q4) | **T4** | T4, re-proved end-to-end by T6 | covered | **called** — exercised through the real store, provider, shell and panels by `correctness-sweep.e2e.test.tsx` test 1 |
| §5 empty-state copy (S1–S4) | **T4** | T4, re-proved end-to-end by T6 | covered | **called** — same suite, test 3, asserting on rendered text and rendered control labels |
| §6 notice deduplication (U1–U6) | **T4** | T4, re-proved end-to-end by T6 | covered | **called** — same suite, test 2 |
| §7 row order (V1–V5) | **T5** | T5, re-proved end-to-end by T6 | covered | **called** — same suite, test 4 |
| §8 `refused` documentation (W1–W4) | **T1** | T1 | covered | documentation only — no runtime operation to call |

### Note on the four `not called` rows — these are false alarms, and here is why

The search discards, in order: the definition site; **every hit in a file owned
by the same task that owns the definition site**; and hits inside test files.
For these four operations the definition and *all* of its consumers are
deliberately owned by one task, so the owns-scoped discard empties the survivor
set even though the operations are genuinely reached.

Checked rather than assumed:

- **`invalidArgument` / `notFound` / `cwdMissing`** — a repo-wide
  `grep -rlnw` over `src/` and `tests/`, excluding `src/main/ipc/`,
  `pod-manager.ts` and the leaf test, returns **nothing**. Their only consumers
  are `src/main/ipc/validate.ts` and `src/main/pod-manager/pod-manager.ts`, both
  inside T1's ownership — which is not an accident but the **point of item 9**:
  those consumers had to move to the leaf, so the task that created the leaf
  necessarily owned them. `validate.ts` feeds `handlers.ts`, the live IPC
  surface, so the application does reach them.
- **`podBlockerFor`** — called from `src/main/beachcomber/service.ts`'s
  `buildEntry`, a sibling file inside T3's ownership.
- **`backupPathForSequence` / `BackupSequence`** — called from
  `src/main/helm/helm-service.ts`'s `save`, a sibling inside T2's ownership.
- **`acknowledgeOwnWrite`** — called from the same `save`, same ownership.

This was recorded at Gate 2: the architect's mapping stated that §9 is the only
section with consumers outside its authoring task. Nothing regressed between
Gate 2 and Gate 3; the check is behaving conservatively by design, and the
design prefers a false alarm at a gate to a silent pass.

**No operation has an implementer and no real caller.**
