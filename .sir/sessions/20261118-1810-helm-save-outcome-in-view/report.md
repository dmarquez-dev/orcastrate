sir-sdlc 1.0.46 — Gate 3 report — Small

**Decisions needed:** none blocking. Both escalations (E1 at Gate 1, E2 mid-task) were answered, and neither deferred anything to the backlog. Gate 3 asks a disposition on 5 findings in section 4.

## 2. Acceptance criteria

- **C1** · met: `useSaveOutcomeScroll.ts:48-53` scrolls only when `wasSaving.current && !saving`, and only on a `helmBackupPath`/`helmError`/`helmConflict` match inside the panel `<section>`. The call sits behind a `typeof … === 'function'` guard, and neither that file nor `HelmPanel.tsx` contains `focus`. React commits the DOM before a passive effect runs, and `panel-store.ts:741-764` sets `saving: false` in the same patch as `lastSave`/`actionError`/`conflict`, so the banner is present when the effect queries for it. Reviewer's reading note: "an element that contains HelmNotices' output" was judged as C2 and C3 make it concrete (an element containing the outcome's test id), which the banner `div` satisfies (`Notice.tsx:36-38`). No wrapper element was added.
- **C2** · met · red step, reviewer-reproduced: the test asserts one call and `target.contains(helmBackupPath)`. The reviewer served the base `f3b98df` `HelmPanel.tsx` through a scratch vitest `load` plugin, with the checkout untouched, and got "3 failed | 56 passed (59)". All three scroll-positive tests failed on "expected to be called 1 times, but got 0 times", which matches the implementer's red step.
- **C3** · met: "scrolls the error banner into view when the save fails" goes from `saving: true` to `saving: false` with an `actionError` and no `lastSave`, then asserts one call on an element containing `helmError`. The reviewer's base run also reddens it.
- **C4** · met · injected defect: tests (a), (b) and (c) are present, and (b) changes both `dirty` and `selectedScopeId` while `saving` stays false. Changing `settled` to `!saving` at the single site `useSaveOutcomeScroll.ts:48` failed (a) and (b), shown in `T1/settle-injected.log`. The revert was confirmed with `cmp` before the next step.
- **C5** · met · reviewer-reproduced: after the change, `npm test` gave Test Files 173 passed (173), Tests 2852 passed (2852), and `npm run typecheck` exited 0. Before the change, typecheck exited 0 on the reviewer's `git archive f3b98df` export. The before-change test count, 173 files and 2845 tests, is the implementer's claim with no log, consistent with 2852 minus the 7 new tests.
- **C6** · met · amended (A1): `git status --porcelain -- src` lists exactly the three named files. `HelmPanel.tsx` has no `useEffect`/`useLayoutEffect`/`useMemo`, the effect is at `useSaveOutcomeScroll.ts:47`, and the `rules.ts:172` guard passes in the full suite.
- **C7** · applied after approval: the Gate 3 backlog edit removes the F-U1 row. `grep -nE "HelmPanel(\.test)?\.tsx:[0-9]|useSaveOutcomeScroll" .sir/backlog.md` prints nothing, so no open row cites a line this diff moved.

**Human checks**, against the main checkout since Small works in place. Launch with `npm --prefix C:/Users/dmarq/Development/Repos/orcastrate run dev`. That command was read from `package.json:11` (`electron-vite dev`) and not run, because running it opens an Electron window on your desktop.

- **H1**, a Saved banner comes into view:
  1. Launch the app and open Helm.
  2. Make the window short enough that the Helm panel scrolls, then scroll to the bottom so Save is visible and the top of the panel is not.
  3. Edit any field and press Save.
  4. Pass: the panel scrolls up on its own until the green Saved banner and its backup path are fully in view, and nothing outside the Helm panel scrolls or shifts. Fail: the banner stays out of view, or the surrounding window layout moves.
  5. The Gate 1 prediction said keyboard focus stays on Save. The reviewer notes that Save is disabled while saving (`HelmActionBar.tsx:72`, `disabled={saveOff}`), so focus may be lost then, and this change does not move it either way. A focus change is not a fail for H1.
- **H2**, a conflict banner comes into view:
  1. With a scope open and the panel scrolled to the bottom, edit a field. Do not save yet.
  2. Outside Orcastrate, edit and save that scope's `settings.json` file.
  3. Press Save in Helm.
  4. Pass: the panel scrolls up until the conflict banner, including its Compare button, is in view. Fail: it stays out of view.

## 3. What ran

- **T1** · sir-frontend-engineer, then sir-reviewer · frontend · opus / opus · 1 review · 0 rounds · 1 redispatch (the implementer was re-dispatched after E2, not after a crash) · uncommitted

The first implementer dispatch stopped blocked on the source rule at `rules.ts:172` ("names compare() in a file that also runs a React effect"). It raised E2, which you answered with the new hook file, and a second dispatch moved the effect there.

**Amendments: 1.** A1 (from E2) changed C6. Before: "C6: `git diff --name-only` lists only src/renderer/src/helm/HelmPanel.tsx and src/renderer/src/helm/HelmPanel.test.tsx." After: "C6: `git status --porcelain -- src` lists only src/renderer/src/helm/HelmPanel.tsx, src/renderer/src/helm/HelmPanel.test.tsx and the new src/renderer/src/helm/useSaveOutcomeScroll.ts, and the save-settle effect lives in useSaveOutcomeScroll.ts, so HelmPanel.tsx runs no React effect itself."

**Change surface**, in the working tree against `HEAD`, uncommitted: 117 insertions and 2 deletions across 2 tracked files, plus 55 lines in 1 new file, 174 in all. The stat came from `git diff --stat HEAD -- src/renderer/src/helm/HelmPanel.tsx src/renderer/src/helm/HelmPanel.test.tsx src/renderer/src/helm/useSaveOutcomeScroll.ts`. `git status --short` over the same list shows `src/renderer/src/helm/useSaveOutcomeScroll.ts` as untracked (`??`). The diff cannot show that file, so its 55 lines were counted with `wc -l`. To see the tracked changes in full, run `git diff HEAD -- <that list>`.

## 4. Advisory findings

- contract gaps: 2
  - `useSaveOutcomeScroll.ts:34`: "rendered by `HelmNotices` and nothing else" holds today. The three test ids are rendered only at `HelmNotices.tsx:104,120,161`, and `probes.ts` only reads them. The claim stays true only as long as nothing else renders those ids.
  - `HelmPanel.test.tsx:9`: the existing docblock says "the only component in this directory that calls a hook is `ConnectedHelmPanel`". That was already false at base (`useState`), and it is more so now. The line is outside the diff.
- correctness risks: 2
  - `useSaveOutcomeScroll.ts:51`: the scroll target is the first outcome banner in the DOM. A successful save clears `actionError` (`panel-store.ts:759`) but not a scope-listing `loadError`. That error renders at `helmError` above Saved, so it would be scrolled into view instead, and with `block: 'nearest'` (`:53`) a tall notice stack can leave Saved out of view.
  - `useSaveOutcomeScroll.ts:53`: `scrollIntoView` scrolls every scrollable ancestor, not only `.panel` (`Helm.module.css:29`). `nearest` keeps that to a minimum, but only a real window shows whether the outer layout shifts. H1 checks for that.
- session conduct: 1
  - T1: the implementer captured no exit code for the before-change typecheck and wrote no log for the before-change test run. The reviewer supplied the before typecheck, and the before test count rests on arithmetic.
- test and CI concerns: 1
  - `HelmPanel.test.tsx`: the `Element.prototype.scrollIntoView` spy is restored correctly. The descriptor is undefined under jsdom, and `afterEach` deletes the property, so nothing leaks to other suites.
