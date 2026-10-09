# Driven hand-run — findings

**2026-10-07 · build `3b57255` · Electron 43.4.0 · Playwright 1.63.0**
**110 of 111 checks passed across 24 steps, 0 steps errored.**

Executed by Playwright driving the real Electron app (`_electron.launch`) against
a sandboxed home. The real `~/.claude` was never read or written — asserted at
the end of every run and passing.

---

## F1 — BLOCKING: the Helm file watcher is never armed, so "This file changed on disk" can never appear

**Severity: real defect, user-visible capability missing. Found by the hand-run; no existing test could have caught it.**

### What was observed

With the user scope loaded, an external process overwrote
`~/.claude/settings.json` twice. The renderer subscribed directly to the
`helmChanged` push channel.

```
selected scopeId : user
external write done, polling 15s...
pushes received  : 0
stale notice at  : NEVER within 15s
retrying with a second write and a longer settle...
pushes after 2nd : 0
stale after 2nd  : no
panel mentions "changed on disk": false
```

### Root cause, verified in source

`HelmService.watch(scopeId)` is the **only** path that arms the watcher
(`src/main/helm/helm-service.ts:239-248`). Nothing in the application calls it:

- `grep -rn "\.watch(" src/` returns only the two calls **inside `watch()`'s own
  body** and the `fs.watch` inside `watcher.ts`.
- There is **no `helmWatch` IPC channel** — `grep -rn "helmWatch\|helm:watch" src/`
  returns nothing. `handlers.ts` registers only `helmScopes`, `helmLoad`, `helmSave`.
- `load()` and `save()` do **not** arm it — the only `watcher.*` calls in
  `helm-service.ts` are the constructor, `acknowledgeOwnWrite`, `watch()` and
  `dispose()`.
- The only callers anywhere are `tests/unit/helm/watcher.test.ts` and
  `tests/unit/ipc/channels.test.ts`.

The production wiring passes `watchEnabled: true` (`src/main/index.ts`), which
makes the feature *look* enabled. The frozen contract documents the behaviour as
intended, not optional (`src/shared/contracts/helm.ts:57-58`):

> ADVISORY: `HelmService.watch` — a best-effort `fs.watch` on the loaded file
> that emits `HelmChangedPush`, so the form goes stale IMMEDIATELY

### Consequences

1. **`COPY.staleHeading` / `staleBody` are unreachable.** The "This file changed
   on disk" notice cannot render in the shipped app.
2. **C2's item-3 fix is correct but currently unreachable.** Sub-session C2
   changed `acknowledgeOwnWrite` to acknowledge the bytes Helm actually wrote,
   closing a window where a foreign write was adopted as Helm's own. That fix is
   right — and it guards a push path that never executes, because the watcher is
   never armed. Its user-visible benefit is zero until this is fixed.
3. Conflict detection at save time is **unaffected**. `save()` re-reads and
   compares independently of the watcher, which is why C5 passes and why this is
   a missing *advisory* capability rather than a safety hole. The contract is
   explicit that "THE WATCH IS NEVER A GUARD".

### Why no test caught it

Every watcher test constructs `HelmWatcher` or `HelmService` directly and calls
`watch()` itself, so the method is thoroughly covered — in isolation. Nothing
asserts that the *application* ever calls it. This is precisely the
implementer-with-no-consumer shape DIR's coverage check exists to catch, and it
slipped through because `helm.watch` was never a declared contract operation in
C1's or C2's session contracts, so `coverage.md` never had a row for it.

### Suggested remediation (for C3 to rank)

1. Arm it where the scope is selected — have the `helmLoad` handler call
   `deps.helm.watch(scopeId)` after a successful load, and `watch(null)` when the
   panel closes. Smallest change; keeps the renderer ignorant of watching.
2. Add an explicit `helmWatch` channel the renderer calls on scope selection.
   More ceremony, but makes the lifecycle visible in the contract.
3. Accept and document that the stale notice is not shipped, and delete the
   unreachable copy — the honest option if watching is not wanted.

**Add a regression test that asserts the application arms the watcher**, not just
that the watcher works once armed.

---

## Confirmed working — the C1 and C2 fixes all verified in a real window

| Fix | Step | Evidence |
|---|---|---|
| T5 — notice renders **above** the path it qualifies | E2 | Document order asserted on live DOM: `notice@5 path@6`. Rendered path is the lossy decode `C:\oc\sandbox\repos\blocked\repo` |
| **C2 Pod blocking by encoded cwd** ⭐ | E4 | Row blocked, checkbox genuinely `disabled`, `aria-disabled="true"` — while its displayed path is a *wrong guess* that does not equal the Pod cwd |
| C2 R4 — both halves of the guard | E5 | The identically-named entry under `shell-snapshots`, `file-history` and `paste-cache` is **not** blocked and stays selectable |
| C2 — union, not replacement | E6 | `oc-test-recorded` still blocks via its recorded cwd |
| C2 — `comparisonEmpty` names no absent control | D2 | Empty state present, **no Compare control rendered at that moment** (`count=0`) |
| C2 — failure routing | D1 | Failed compare lands in the comparison surface; the *next*, unrelated failure lands in the banner (`comparisonError=0`), appearing exactly once |
| C1 — close guard | C1 | "You have unsaved changes", Keep editing preserves the draft |
| C1 — guard widened to panel **switch** | C2 | Same confirmation on switching to Beachcomber |
| C1 — failed reload keeps the draft | C3 | Reload against an `EISDIR` failure: draft survived, field still editable |
| C1 — conflict side-by-side | C5 | "Nothing was written", nothing written to disk, Compare on the banner, table shows both values, draft survived |
| Helm write path **(never hand-run before)** | B3/B4 | File written, valid JSON, trailing newline, backup holds pre-save content; second save produced a **distinct** backup name and payload |
| Beachcomber trash **(never hand-run before)** | E7/E8 | Cancel removed nothing; confirm moved the fixture to the recycle bin — "Moved 1 item to the recycle bin" |
| PanelBar no-op re-click | F2 | Panel stays open, **no dialog**, draft untouched |
| Close routes | F3/F4 | Strip close and Escape both work |

---

## F2 — Confirmed in the real UI: the "path not verified" caveat shows on paths that are not guesses

Already filed from C2 review; now **visually confirmed**. Under `shell-snapshots`,
`file-history` and `paste-cache`, every entry renders:

> PATH NOT VERIFIED — Orcastrate could not read this directory's real location,
> so the path below is a guess.

…above a path that is a **true absolute path**, e.g.
`C:\oc-sandbox\home\.claude\shell-snapshots\C--oc-sandbox-repos-blocked-repo`.
`buildEntry` labels every non-`projects` entry `pathSource: 'decoded-name'`.
The sentence is simply false for three of the four roots. **C3 candidate.**

---

## F3 — `aria-pressed` announces a toggle that cannot un-press (confirmed)

`panel-bar-open:helm` reports `aria-pressed="true"` while open and the closed
panel reports `"false"` — truthful as a state indicator. But F2 confirms the
same button cannot un-press itself. The C3 decision between keeping
`aria-pressed` and moving to `aria-current` stands; this run supplies the
evidence for it.

---

## F4 — The `hold` warning names CLI 2.1.235; 2.1.277 is installed

Not a defect — 2.1.235 is the build the confirmed value set was read from — but
the sentence will read as stale to anyone running a newer CLI. Worth a decision
in C3 about whether to re-verify against the current build.

---

## Not exercised, and why

| Step | Reason |
|---|---|
| B5 — a blocked backup aborts the write | The backup name derives from the save-time clock, so the collision is not reachable interactively. Covered by `tests/unit/helm/write-safety.test.ts` with an injected clock, including an obstruction test. **Not a pass.** |
| B4 — same-millisecond collision | Same reason: two saves in one millisecond are not reachable by hand. The run proved the weaker property (two saves → two distinct backups, distinct payloads). |
| D3 — a failed `helm:scopes` prints once | Could not be staged without making the sandbox home unreadable mid-run, which breaks the app for every later step. Covered by the e2e suite. **Not a pass.** |
| A3 — narrow-window layout | Not attempted in this pass; needs a human eye on reflow. |

---

## Harness bugs found and fixed during the run — recorded so they are not mistaken for app defects

Four initial failures were **my test harness**, not the app. Each is listed
because an unexplained red in a report is worse than none.

1. **`innerText` excludes input values.** Allow/deny/env rules render as
   `<input value=…>`; asserting on panel text found nothing. Fixed by reading
   `input.value`.
2. **`innerText` applies `text-transform`.** `.comparisonHead` and
   `.comparisonVerdict` are `text-transform: uppercase`, so the headings arrive
   as "ON DISK NOW" / "DIFFERS". Fixed with case-insensitive comparison.
3. **The preload bridge returns `IpcResult<T>`, not `T`.** `pods.create` resolves
   to `{ ok, value }`, so `pod?.id` was always undefined — while the Pod was in
   fact created, as E4's blocked row proved. Fixed to unwrap.
4. **Save is disabled on a *pristine* draft.** "Save disabled right after a clean
   reload" is correct behaviour, not a stuck read-only state. Fixed to assert
   that Save enables once an edit is made.
5. **The error banner opens with a decorative glyph.** Counting occurrences of
   the banner's first line counted `"!"`. Fixed to use the longest line.

## One environment trap, for whoever runs this next

Pointing `USERPROFILE` at a bare directory makes Electron abort with
`0xC0000003` **before any application JS runs** — no output at all, not even
main's first log line. Chromium cannot derive its profile without the standard
`AppData\Roaming` / `AppData\Local` pair. `driver/sandbox.mjs` creates that
skeleton; the comment there explains why. `--user-data-dir=<path>` also works,
but the skeleton additionally isolates the Pod sqlite store so each run starts
with no Pods.
