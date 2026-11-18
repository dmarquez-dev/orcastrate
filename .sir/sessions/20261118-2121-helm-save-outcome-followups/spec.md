# helm-save-outcome-followups

Goal: a rejected Helm save states the conflict once, a settled save scrolls to the banner for its own outcome, and `HelmPanel.test.tsx`'s docblock stops claiming something false. These close the three follow-ups `20261118-1810-helm-save-outcome-in-view` left in `.sir/backlog.md`.

## Context

At `c40d1bb`, a rejected save (CONFLICT) says the same thing three times:
- the conflict banner's lead, `COPY.conflictLead` (`src/renderer/src/helm/copy.ts:106`)
- main's own sentence, rendered verbatim beneath the lead (`src/renderer/src/helm/HelmNotices.tsx:133`, built at `src/main/helm/helm-service.ts:189-190`)
- the stale banner (`HelmNotices.tsx:146-155`), which the store raises on a conflict (`src/renderer/src/state/panel-store.ts:744`)

Measured in the DOM at the base, "changed" appears in 2 banners and 3 times panel-wide.

`useSaveOutcomeScroll` (`src/renderer/src/helm/useSaveOutcomeScroll.ts:37-54`) scrolls to whichever outcome banner comes first in DOM order. That goes wrong in two ways:
- A leftover scope-listing error renders above Saved, so a successful save scrolls to the error.
- A fixed "prefer Saved" order would be just as wrong. A failed save never clears `lastSave` (`panel-store.ts:741-747`), so an older Saved banner stays on screen beside the new failure.

`HelmPanel.test.tsx:9-10` claims that only `ConnectedHelmPanel` calls a hook, which is false.

## Definition of done

- [ ] D1. On a rejected save, the conflict banner says "changed" exactly once, and it is the only banner that says it. Main's sentence is not rendered anywhere in the panel. The banner holds `COPY.conflictLead` with the file's display path, `COPY.conflictAdvice`, and one Compare button.
- [ ] D2. No stale banner is shown while a conflict banner is shown. This holds in the presentational panel and, end to end, with the real store.
- [ ] D3. An on-disk change with no rejected save still shows the stale banner, and so does the state Discard leaves (conflict cleared, `stale` kept).
- [ ] D4. A successful save that settles while a scope-listing error is on screen scrolls to Saved (`helmBackupPath`).
- [ ] D5. A failed save scrolls to the banner for its own outcome: a conflict to `helmConflict`, any other failure to `helmError`. It never scrolls to an older Saved banner or an older conflict banner. The 7 existing settle tests keep their names and pass.
- [ ] D6. `useSaveOutcomeScroll.ts`'s docblock states the per-outcome rule and no longer says the first match in DOM order wins.
- [ ] D7. `grep -n "the only component" src/renderer/src/helm/HelmPanel.test.tsx` prints nothing, and the rewritten docblock makes no claim about hooks in `src/renderer/src/helm` that a grep contradicts.
- [ ] D8. The source rule `rules.ts:172` still holds: no file may both name `compare()` and run an effect. The settle's target is derived from the view, not stored. `src/main/helm/helm-service.ts` and `src/renderer/src/state/panel-store.ts` are byte-identical to `c40d1bb`. No source text this session adds cites a session id or a `.sir/sessions` path.
- [ ] D9. Human check H1: in the running app, a save rejected because the file changed on disk shows one red "Nothing was written" banner. That banner names the file, gives the Compare/Reload advice and offers Compare. No yellow "This file changed on disk" banner and no "Something went wrong" banner sit beside it, and the typed edit is still in the form. How to reach the state: open Helm on a Pod's project scope (not `~/.claude/settings.json`), change a field, edit and save that project's `.claude/settings.json` in a text editor, then press Save in Helm. The yellow stale banner may already be showing before Save is pressed, because the watcher can fire first. That is not a fail, provided it goes once the red banner appears. Keyboard focus may move off Save, because Save is disabled while saving (`HelmActionBar.tsx:72`), and that is not part of the check.
- [ ] D10. `npm --prefix <worktree> run typecheck` exits 0. `npm --prefix <worktree> test` exits 0 with at least 173 files and more than 2852 tests.
- [ ] D11. At Gate 3, the three rows this session closes are removed from `.sir/backlog.md`, if their checks pass. They are the rows of `20261118-1810-helm-save-outcome-in-view` that begin "Collapse Helm's conflict messaging", "Prefer the Saved banner" and "Correct the stale docblock". The citation re-check from `.sir/lessons.md:68` runs over the rows that stay open.
- [ ] D12. At Gate 3, one row is appended to `.sir/backlog.md` for dynamic permission modes. It carries the SDK findings and E2's answer recorded in `discussion.md`, and the open question of where the New Pod dialog gets `supportsAutoMode` before a session exists.

## Scope

Renderer only:
- `HelmNotices.tsx`, `useSaveOutcomeScroll.ts` and `HelmPanel.tsx`
- their tests: `HelmPanel.test.tsx`, `probes.ts` and the two Helm e2e files

The orchestrator makes the backlog edits (D11, D12) at Gate 3.

### Not in scope

- Building dynamic permission modes. That work is deferred to the backlog row D12 appends.
- Changing main's conflict message or the store's conflict/stale state. D8 checks this with a byte-identity test against `c40d1bb`.
- Backlog row F5, reconciling the displayed `permissionMode` with `system`/`init.permissionMode`.

## Assumptions

| Question | Answer | Rung | Evidence |
|---|---|---|---|
| How does main's duplicate sentence leave the screen: dropped in main, or not rendered by the renderer? | Not rendered. `HelmNotices` drops the `{conflict}` paragraph, and `helm-service.ts` is unchanged. `conflict` stays the store's signal that a conflict banner is up. | repo evidence | `tests/unit/helm/conflict.test.ts:53-54,156-157` pin main's message (path plus "Nothing was written"). The lead already names the file and says nothing was written (`copy.ts:106`, `HelmNotices.tsx:131`). |
| Is the stale suppression a store change or a render rule? | A render rule in `HelmNotices`: the stale banner renders only while `conflict === null`. `panel-store.ts:744` is unchanged. | repo evidence | A `helmChanged` push can set `stale` before the conflicting save (`panel-store.ts:269-275`), and a store-only fix would still show both banners then. Discard clears `conflict` and keeps `stale` (`panel-store.ts:696-701`), so the stale banner correctly comes back. |
| Which banner does a settle scroll to? | The banner for this settle's outcome, derived from the view at the settling render: no `actionError` → Saved; `actionError === conflict` → conflict; otherwise → error. | repo evidence | A save clears `actionError` when it starts (`panel-store.ts:723`). A CONFLICT sets `conflict` and `actionError` to the same message (`:745-746`). Any other failure keeps the old `conflict` (`:745`). |
| Where does any new lifecycle logic live? | In `useSaveOutcomeScroll.ts`. `HelmPanel.tsx` gains no `useEffect`, `useLayoutEffect` or `useMemo`. | repo evidence | `rules.ts:103-104,172`, and `.sir/lessons.md:102`. |
| How many tasks? | One (T1), because `HelmPanel.test.tsx` is touched by all three rows and can have only one owner. With one task, every red step and injection is the implementer's own. | judgment | Architect's report. Ownership is listed in `manifest.json`. |
| Can the toolchain build concurrently? | Yes: `tsc --noEmit` and `vitest run` emit nothing. It is moot with one task. | repo evidence | `package.json:17-19` |
| Do the tests find the real module tree from a worktree with no `node_modules`? | Yes. The worktree sits inside the repository, so resolution walks up to the main checkout's `node_modules`. | repo evidence | Setup probe: 173 files and 2852 tests passed, with the RUN line naming the worktree. |

## Contracts

None. See `contracts/README.md`: one task, no interface crosses a task boundary, and the store and main keep their shapes.

## Open questions

None.
