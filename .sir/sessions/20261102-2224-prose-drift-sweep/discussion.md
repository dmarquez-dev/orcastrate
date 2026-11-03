# Prose drift sweep

Clear every open **Prose drift** item in `.sir/backlog.md`, plus the two documentation items in its **Ungrouped** section. That makes 19 comment, docblock and doc corrections, each of which has to match the code as it stands today.

## Context

The user is clearing `.sir/backlog.md`'s refinement work one unit at a time. At Gate 1 there were four candidate units: Prose drift, Tests and guards, Cosmetic and structural, and Correctness. The user picked Prose drift. Section counts come from an `awk` tally over `.sir/backlog.md` on 2026-11-02: Prose drift 17, Tests and guards 15, Cosmetic and structural 11, Design decisions 9, Correctness 8, Tooling 4, Ungrouped 2.

The 17 Prose drift items cite these locations:

- `src/renderer/src/contracts/renderer-state.ts:298`
- `src/renderer/src/pods/PodTab.tsx:229`
- `src/renderer/src/pods/PodTab.test.tsx:310`
- `src/renderer/src/__tests__/pod-stop.e2e.test.tsx:480`
- `src/renderer/src/pods/PodTab.source.test.ts:25-26`
- `src/renderer/src/helm/rules.ts:7-10`
- `src/main/index.ts:96`
- `src/renderer/src/styles/tokens.css:60`, `:80-82` and `:88-92`
- `docs/superpowers/specs/2026-08-18-orcastrate-design.md:237`
- `src/renderer/src/contracts/renderer-panels.ts:411-426` and `:419-426`
- `src/renderer/src/__tests__/hygiene.test.ts:850`, `:1170`, `:1376` and `:1341-1342`
- `.dir-sdlc/handruns/2026-09-30-electron-handrun/FINDINGS-TOKEN-SWEEP.md`
- `src/renderer/src/composer/Composer.styles.test.ts:51-53`

The two Ungrouped items are:

- the `abandonedCcSessionId` doc at `src/main/pod-manager/resume-fallback.ts:63-67`
- the `openPod`/`reconnectPod` docblocks in `src/main/pod-manager/pod-manager.ts`

The full wording of each item is on its backlog line.

## Decisions

- Track: Standard. One concern, but 19 independent, individually checkable claims, so it goes through the full pipeline per scope routing's "count the judgments" rule.
- Session name: `prose-drift-sweep`.
- Scope: exactly the 17 Prose drift lines and the 2 Ungrouped lines. Nothing in any other backlog section.
- Prose only. No change to runtime behaviour, test assertions, or CSS values. A comment, docblock, test title or Markdown line may change; executable code may not, except for a test's name string, which is prose.
- Every citation is re-measured against the current tree before it is edited. Line numbers date from 2026-10-09 to 2026-11-02 and may have moved. If an item's claim no longer holds, it is closed as already resolved, not edited.
- Any figure that has to be restated (contrast ratios, margins, counts) is derived afresh and attributed to the command that produced it, never edited in from the backlog line. This follows the backlog's own instruction on the `tokens.css:88-92` item.
- `.dir-sdlc/` is history. The `FINDINGS-TOKEN-SWEEP.md` item gets a dated correction appended, and its original text is left as is.
- Each closed item's backlog line is removed at Gate 3. Any item found invalid is reported, not silently dropped.
