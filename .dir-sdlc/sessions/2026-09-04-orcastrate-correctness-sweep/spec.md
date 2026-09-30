# Spec — 2026-09-04-orcastrate-correctness-sweep

Sub-session **C2** of the Large routing over the 2026-08-20 backlog block.
Track: **Standard**. Base: `main` @ `d9d95cb`. Branch: `dir/2026-09-04-orcastrate-correctness-sweep`.

## Goal

Clear nine backlog items: seven behavioural defects, one contract comment that
contradicts shipped behaviour, and one module-boundary extraction. Six of the
nine are correctness risks; two of those were introduced by sub-session C1
itself. This is a correctness sweep, not a feature — every item has a known
site and a known shape, and no new product surface is added.

## Definition of done

1. **Two Helm saves inside one millisecond produce two distinct backups.**
   `backupPathFor` is fully determined by the injected clock and
   `copyFileSync` clobbers, so today the first backup is silently destroyed.
2. **Beachcomber blocks a Pod holding a directory whose recorded path is a
   guess.** `blockerFor` keys on `displayPath`, which for a `projects` entry
   with no cwd-bearing transcript is `decodeDirectoryName(name)`.
3. **A foreign write landing between Helm's `rename` and its acknowledgement
   still produces a change push.** Today `acknowledgeOwnWrite` adopts the
   post-rename re-read, so those bytes are taken as Helm's own.
4. **A failure renders on exactly one surface.** `compareRequested` never
   resets, so an unrelated later failure prints inside the comparison surface.
5. **The comparison empty state does not name a control that is not on
   screen.** `COPY.comparisonEmpty` advertises a Compare button that exists
   only on the conflict banner.
6. **A failed `helm:scopes` says its sentence once.** It currently sets both
   `Loadable.error` and `actionError`, and `HelmNotices` dedupes only against
   `conflict`.
7. **A Beachcomber row states the path is unverified before showing it.**
   DOM order only; the copy is frozen and still renders verbatim.
8. **`src/shared/contracts/beachcomber.ts`'s `refused` documentation matches
   shipped behaviour** — the service throws `NOT_FOUND` for an unknown or
   stale id and never emits a `refused` entry for one.
9. **`IpcFailure` is reachable without transitively loading `src/main/pod`
   and `src/main/store`,** and the consumers that need only `IpcFailure`
   import it from the leaf.

## Assumptions

| # | Assumption | Basis | Rung |
|---|---|---|---|
| A1 | Item 8 is a **comment-only amendment to a frozen shared contract**, authorised by the user at Gate 1 as session scope rather than raised as a new escalation. The service behaviour is correct and does not change. | User decision at Gate 1; `beachcomber.ts:301` and the file header already require `NOT_FOUND` | user |
| A2 | The fix for item 1 must preserve `backupPathFor(target, now)`'s determinism in `now` for the first backup at a stamp. Three sites recompute it (`tests/unit/helm/write-safety.test.ts:49,87,136`) and the module docblock declares the property. | repo | 1 |
| A3 | `COPYFILE_EXCL`-with-retry and probe-for-a-free-name are both rejected for item 1: neither can distinguish Helm's own earlier backup from an obstruction, and `write-safety.test.ts` has a test that `mkdirSync`s a directory *at* the backup path to prove the write aborts. Either would step past it and weaken rule 7. The sequence is carried in memory instead. | repo | 1 |
| A4 | Item 2's exact fix is reachable: `encodeCwdForProjects` already ships at `src/main/pod-session/paths.ts:28` and is exported from that barrel, and `tests/unit/beachcomber/no-destructive-api.test.ts` forbids `electron` and `pod-manager` imports but permits `pod-session`. The encoded comparison is a **union** with the existing one, so nothing blocked today becomes unblocked. | repo | 1 |
| A5 | `buildEntry` labels **every non-`projects`** entry `pathSource: 'decoded-name'` while giving it a true absolute path, so item 2's new comparison is gated on `root === 'projects' && pathSource === 'decoded-name'`, both halves. | repo | 1 |
| A6 | Removing the post-rename `readSnapshot` in item 3 is safe: `document` comes from a separate `await this.load(...)`, `backupDisplayPath` from the backup, and `warnings` from validation computed before the write. It has no other consumer. | repo | 1 |
| A7 | Item 6's fix **requires** rewriting the `toHaveLength(2)` pin at `src/renderer/src/__tests__/failure-paths.e2e.test.tsx:1283`, whose own comment at line 1275 authorises exactly that. T4 owns that file. A reviewer must not read that failing pin as a regression. | repo | 1 |
| A8 | No test pins `COPY.comparisonEmpty`'s text — every hit is on the test id — and no row-order assertion exists outside `src/renderer/src/beachcomber/`. | repo | 1 |
| A9 | Typecheck baselines on the untouched worktree: `npx tsc -p tsconfig.web.json --noEmit` gives 24 `error TS`, all 24 `TS6307`; `npm run typecheck:node` gives zero. Measured twice — by the architect, and independently by the orchestrator. | measured | 1 |
| A10 | `tsconfig.web.json` includes only `src/renderer/src/**` and `src/shared/**`, so the mandated web gate does not cover the five main-process items at all. `npm run typecheck:node` is carried alongside it as the sharper gate. | repo | 1 |

## Decomposition

Six tasks, 14 `owns` globs, 90 acceptance criteria. Waves:
**(T1 ‖ T4 ‖ T5) → (T2 ‖ T3) → T6.**

| id | agent / domain | items | dependsOn |
|---|---|---|---|
| T1 | `dir-architect` / architecture | 8, 9 | — |
| T2 | `dir-backend-engineer` / backend | 1, 3 | T1 |
| T3 | `dir-backend-engineer` / backend | 2 | T1 |
| T4 | `dir-frontend-engineer` / frontend | 4, 5, 6 | — |
| T5 | `dir-frontend-engineer` / frontend | 7 | — |
| T6 | `dir-test-engineer` / test | joined proof + repo gates | T1–T5 |

T2 and T3 depend on T1 for one reason only: a re-export does not isolate an
importer. `import { IpcFailure } from '../ipc/errors'` still loads `errors.ts`,
which still loads `../pod` and `../store`. Isolation becomes true only when the
consumer imports the leaf — and two consumers live in T2's and T3's globs, so
each swaps its own one-line import after T1 creates the module.

## Not in scope

Deferred to sub-session **C3**:

- `font-weight: 600` has no token (`shell/EmptyWorkspace.module.css`).
- Four tokens with no consumer: `borderThick`, `trackingTight`, `weightRegular`, `weightMedium`.
- `Helm.module.css` `.confirmScrim` is opaque; dimming needs an overlay/alpha token added to the frozen theme contract.
- The `PanelBar` pair: the lost third close route, and `aria-pressed` announcing a toggle that cannot be un-pressed.
- Naming `resetHelmForReopen`'s whole-state reset in the Helm contract's clearing list.
- The two C1 criterion-phrasing gaps (`HelmPanel.tsx:113`'s empty state; `panel-close-guard.tsx`'s unsatisfiable literal form).

Item-local exclusions found during decomposition:

- **Cross-process backup racing.** Item 1's fix is bounded to this service's own writes; a second Orcastrate process writing the same file in the same millisecond is not covered. `save`'s re-read-and-compare (rule 3) remains the guarantee there.
- **Non-`projects` entries are labelled `pathSource: 'decoded-name'`** despite carrying true absolute paths, so `BeachcomberRow` renders the "path not verified" caveat on `shellSnapshots`, `fileHistory` and `pasteCache` rows whose paths are not guesses. Candidate for C3.
- **Adding a second Compare affordance** rather than changing the copy, for item 5.

## Known consequence of the ownership rule

T6's criterion 13 forbids it from touching a file it does not own. A repo-wide
gate failure originating in T1–T5's code therefore becomes a blocking finding
on T6 that T6 cannot itself remediate; it carries to Gate 3. That is the
correct trade — the alternative is a test task silently editing another task's
implementation — but it is stated here rather than discovered at review.
