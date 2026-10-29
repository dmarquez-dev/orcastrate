# Discussion — census-root-hygiene

## Goal

Make the six source-scanning test files locate the tree they scan from their own file
location rather than from `process.cwd()`, so that a run with cwd in a different valid
checkout can no longer silently measure the wrong commit. Bundle four small precision fixes
in `src/renderer/src/__tests__/hygiene.test.ts`, the file the main item already touches.

Track: **Standard** (six files, a shared root-derivation idiom, and a new root guard).

## Context

- Source of scope: `.sir/backlog.md`. The main item is line 27; the bundled items are lines
  41, 46, 62 and 63. The full measured brief for the main item is
  `.dir-sdlc/handoff-after-keyword-sweep.md` §2 (lines 40–122); bundling guidance is §4
  (around line 299).
- Re-measured at Gate 1 (Grep `process\.cwd\(\)` over `src/`, 2026-10-29): exactly six hits —
  - `src/renderer/src/__tests__/hygiene.test.ts:94`
  - `src/renderer/src/beachcomber/Beachcomber.hygiene.test.ts:43`
  - `src/renderer/src/helm/no-paths.test.ts:49`
  - `src/renderer/src/pods/wording.test.ts:50`
  - `src/renderer/src/transcript/tool-summary.test.ts:43`
  - `src/renderer/src/state/isolation.test.ts:37` (different shape: `RENDERER_ROOT` template)
  The `process.cwd()` uses under `tests/` are Pod `cwd` options, not this defect (per the
  handoff §2.1); spec should confirm that predicate rather than trust it.
- Lessons file: seeded-backlog session ids are DIR ids; resolve them under
  `.dir-sdlc/sessions/`.

## Decisions settled at Gate 1

1. **Scope is the recommended bundle**, chosen by the user over "census root only",
   "prose-drift sweep", and "test-guard hardening":
   - **Main:** replace the `process.cwd()` root in all six files with the repo's
     `fileURLToPath(new URL(…, import.meta.url))` idiom (`tests/router/helpers.ts:27` exports a
     `REPO_ROOT` on that basis; handoff counts 13 files / 20 occurrences already using it).
     Prefer `import.meta.url` over the `vitest.config.ts` `__dirname` root — a self-locating
     file cannot be mis-rooted by any invocation.
   - **Plus a guard** that discriminates *this* tree from *another valid* tree (the existing
     non-empty guards only discriminate "a tree" from "no tree").
   - **Bundled, `hygiene.test.ts`:**
     - backlog :46 — narrow the `BORDER_PROPERTIES` docblock (`:623`, "including the
       shorthands") or widen the constant (`:630`) to the logical forms, never silently.
     - backlog :41 — make the retired-test-id exemption self-check (`:1129-1140`) prove
       purpose rather than presence, by checking the surrounding call in the exempt file
       (`lanes/LaneRail.test.tsx:180`).
     - backlog :62 — correct "the shell four" at `:850`; the shell has five module stylesheets.
     - backlog :63 — tighten "five literals" at `:1170` and `:1376` (14 bare declarations
       across 5 files) and "the four other bare literals" at `:1341-1342` (five).
   All line numbers are as of the seeding on 2026-10-29 and must be re-measured in spec.
2. **Session name:** `census-root-hygiene`.

## Constraints the spec must honour

- **The criterion for the main item cannot be "the suite passes"** — the defect's whole
  character is that the suite passes. It must name an instrument that distinguishes two
  trees: run a census file with cwd in a second checkout whose content differs, and require
  the result to equal the correctly-rooted result or fail with an explicit root-mismatch
  message. Handoff §2.2 **Case B** is the negative control (worktree at `6914e49` as cwd,
  `--root` on `main`: 1 failed / 36 passed with six phantom offenders and both non-empty
  guards green).
- **The task will run inside the hazard it fixes**: SIR implements in a worktree that shares
  the repo with the main checkout — Case B's geometry. Any criterion naming an instrument must
  be checkable with that instrument under exactly those conditions (lesson: test a criterion
  against the conditions it will run in).
- Counts in criteria (sites, literals, stylesheets) are re-derived in spec with a stated
  predicate, a matching case and a near-miss, not copied from the backlog.
- Vitest does not typecheck: the DAG tail needs a repo-wide `tsc` criterion.
- Out of scope (handoff §4): the palette pass, the commit-msg hook, the hand-run harness.
