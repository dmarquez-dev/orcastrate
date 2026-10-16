# Verification re-run — the token sweep, on merged `main`

Run 2026-10-16 by the orchestrator, directly, against **`main` at `b3f4982`** — after the
session `2026-10-12-orcastrate-token-sweep` was merged (`e73d2c4`) and pushed.

**Result: 52/52 checks passed, 0 step errors, driver exit 0.** Identical to the run T6
performed against the session worktree.

## What this re-run was for, and what it is not

T6 had already measured the conversions, so this is **not** new evidence that they render.
It tests two things T6's own criterion 2 identified as able to fail silently:

1. **Did the merge preserve the conversions?** `main` before the merge built
   `out/renderer/assets/index-DLsXrONq.css`, carrying `letter-spacing: 0.06em`. After the
   merge `main` builds **`index-0uCezQ_O.css`** — byte-identical content, and therefore an
   identical Vite content hash, to the bundle T6 measured from the worktree. The merge
   changed no renderer CSS.
2. **Is the driver reusable from the main checkout?** `driver/lib.mjs:8` sets
   `repoRoot = join(here, '..', '..', '..', '..')`, four levels up from the driver file — so
   a driver run from the main checkout launches the *main* build. Before the merge that
   would have confirmed nothing, which is exactly why T6's criterion 2 required the worktree
   build. After the merge, the main checkout **is** the thing under test, and the driver
   works there unmodified.

## Procedure, as the handrun README prescribes

```
npm run build                                 # exit 0, both typecheck programs ahead of the bundle
node .../driver/smoke.mjs                     # exit 0 — sandbox redirect verified
node .../driver/run-token-sweep.mjs           # exit 0 — 52/52
```

The smoke check's final assertion is the one that matters for safety: **`real ~/.claude/settings.json byte-identical`**. Sandbox root `C:\oc-sandbox-token-sweep`.

## The two runs differ in five lines, and none is a measurement

Diffing the regenerated report against T6's committed one, the **complete** set of
differences across both the `.md` and the `.json` is:

| Difference | Why |
|---|---|
| `generatedAt` timestamp | the run happened later |
| `repoRoot` (3 occurrences) | worktree path → main checkout path, which is the point of the re-run |
| three `createPod` Pod UUIDs | randomly generated per run, non-deterministic by nature |

**Every other line is byte-identical**, verified by diffing both files with the timestamp and
`repoRoot` lines excluded: all 52 check results, `.railHeading` at `letter-spacing: 0.44px`
against `font-size: 11px`, the `0.66px` override control, `.bypassBadge` at `0.44px`, every
border at `0.8px` against the live literal-`1px` reference, the quantization ladder
(`1px→0.8, 2px→1.6, 3px→2.4, 4px→4, 5px→4.8`), all seven CSS-Modules hash signatures, the
`60` hairline references counted in the bundle, and the whole coverage table — 21 of this
session's 39 sites measured, the other 18 each with its reason.

So the run is deterministic in everything that carries meaning, and the merge is observably
clean.

## The `thin` observation reproduced

TS-9, again outside the acceptance criteria: on synthetic elements in this window,
`thin = 0.8px`, `medium = 2.4px`, `thick = 4.8px`, and a declared `1px = 0.8px`, with
`devicePixelRatio = 1.0000000149011612`.

**`thin` computes to the same used width as a declared `1px` in this engine**, so converting
the six surviving `thin` border widths in `composer/Composer.module.css` and
`permissions/PermissionCards.module.css` is a **zero-pixel** change here — a consistency
change, not a visual one. Reproduced on a second run, from a different checkout, on the same
display. Still an engine measurement rather than a standards claim: the CSS specification
fixes only the `thin < medium < thick` ordering and leaves the widths UA-defined.

## What this re-run did NOT prove

- **Nothing new about the 18 unreachable sites.** They remain unreachable for the same
  reasons, most needing a live `claude` process. A live-`claude` harness is still the
  highest-value instrument this project lacks.
- **Nothing about other displays.** Every pixel figure here, including the `thin`
  equivalence, is this display's device-pixel quantization. The conclusions that matter are
  *equalities between two values measured in the same window*, which is why they survive the
  quantization — but a figure like `0.8px` is not portable and should never be hardcoded.
- **Nothing about the grouped-selector gap.** `transcript/Transcript.module.css:45`'s
  `.filterToggle, .unpin` is still enumerated only as `.unpin` and still reported "not
  reached" though `.filterToggle` renders unconditionally. That backlog item is unaffected by
  this run, which reproduces the gap rather than closing it.

## Artifacts

T6's committed `driven-report-token-sweep.md`/`.json` and `screenshots/token-sweep/` are
**the reviewed record and were deliberately restored** after this run overwrote them — the
reviewer judged those files, and replacing them with a later run would discard the artifact
that was signed off. `git checkout --` restored both reports plus
`screenshots/smoke-04-beachcomber.png`, which belongs to the 2026-10-07 hand-run and was
overwritten incidentally by this run's smoke check. This document is the record of the
re-run instead, which is additive.
