# First run

Orcastrate has never been launched. Every one of its 1392 tests is unit or jsdom;
`npm run build` succeeds, but no session has opened a window, and no code path
below has been observed against a real Electron runtime, a real filesystem, or a
real Claude Code install.

This document is the first launch: what to do, in what order, what to watch, and
what each thing would mean if it went wrong. The expectations under **Ground
truth** were measured on this machine on 2026-08-20 and are specific to it.

---

## 1. Before you start

**The app reads and writes your real Claude Code state. There is no sandbox and
no override.** `CLAUDE_HOME` is `join(homedir(), '.claude')`, computed once at
module scope (`src/main/index.ts:46`) and handed to both panel services. Nothing
reads an environment variable to redirect it. So on first launch:

- **Beachcomber** enumerates your actual `~/.claude/projects/`,
  `shell-snapshots/`, `file-history/` and `paste-cache/` — 254 MB across four
  roots, 250 MB of it in `projects/`.
- **Helm** edits your actual `~/.claude/settings.json`, and the actual
  `.claude/settings.json` of any Pod's working directory.

Two things make that safe enough to do deliberately:

- **Deletion goes to the recycle bin, never `unlink`.** `shell.trashItem` is the
  application's single deletion capability, injected at
  `src/main/index.ts:55-56`, and a source scan asserts no other removal primitive
  exists anywhere under `src/main/beachcomber/`. Anything you trash is
  recoverable from the recycle bin.
- **Helm takes a timestamped backup before every write, and aborts the write if
  the backup fails.** It also re-reads and compares the file against the copy you
  loaded, refusing with `CONFLICT` rather than overwriting a change it did not
  see.

Still worth doing first, because it costs nothing:

```bash
cp ~/.claude/settings.json ~/.claude/settings.json.prelaunch
```

Do **not** bother copying `~/.claude/projects/` — it is 250 MB and the recycle
bin already covers you.

**Creating a Pod spawns a real Claude Code session** through the agent SDK, with
real token cost. Nothing in sections 3–5 requires one; the Pod scenarios are
section 6.

---

## 2. Launch

```bash
npm ci          # only if node_modules is absent
npm run dev     # electron-vite dev
```

### If you get `Error: Electron uninstall`

This happened on the first real launch, and it is worth recognising because
everything *looks* fine until the moment Electron is actually spawned: main,
preload and renderer all build, the dev server starts, and only then does
`getElectronPath()` throw.

The cause is that electron's `postinstall` never ran, so the ~350 MB binary was
never downloaded. Confirm with:

```bash
ls node_modules/electron/dist        # missing entirely
cat node_modules/electron/path.txt   # missing
```

Fix by running the installer directly — it is the same script `npm ci` would
have run:

```bash
node node_modules/electron/install.js
```

Then verify you have a binary that actually starts, rather than one that merely
exists:

```bash
node -e "console.log(require('child_process').execFileSync('node_modules/electron/dist/electron.exe',['--version'],{encoding:'utf8'}))"
# v43.4.0
```

**Two things about this are worth internalising.** First, `npm ci` exited 0 with
no error and no electron postinstall line at all — the install did not fail, it
simply never fired, so there is nothing in the log to search for. Second,
`better-sqlite3` working is not evidence that install scripts ran: v13 ships
prebuilds for all eight platforms inside the package, which is why 1392 tests
can pass against an install that never executed a single script.

**`npm ci` succeeding and `npm run build` succeeding are both compatible with an
app that cannot launch.** The first genuinely load-bearing check is the one that
spawns Electron.

Then, in the app window, open DevTools (`Ctrl+Shift+I`) and keep the console
visible for the whole session. Main-process logs go to the terminal you launched
from; renderer logs go to that console. You want both.

**Where state lands:** the SQLite database is created at
`%APPDATA%\orcastrate\orcastrate.db` (`app.getPath('userData')`). On a first run
it does not exist; the store creates and migrates it. If you want a clean slate
later, quitting the app and deleting that file is the whole reset.

---

## 3. Smoke checks, in order

Cheapest and most reversible first. Stop at the first failure — each one gates
the next.

| # | Check | Expected | If it fails |
|---|---|---|---|
| 1 | Window opens | The workspace shell with a Pod bar, a panel strip beneath it, and the "No Pod open" empty state | Main-process crash — read the terminal, not the console |
| 2 | **Bridge is present** — in DevTools, `Object.keys(window.orcastrate)` | 8 keys, including `beachcomber` and `helm` | The preload bridge did not attach. Nothing else will work |
| 3 | Panel strip renders | Two buttons, labelled from the frozen contract, plus a close affordance once a panel is open | — |
| 4 | **Both panels open with zero Pods** | Beachcomber and Helm each render; the empty state is replaced; Pod bar and strip stay | This is T9's criterion 5 and the only path needing no Pod |
| 5 | Escape closes a panel | Panel closes, focus returns to the button that opened it | — |

Check 2 is the one worth dwelling on: **it is exactly the check T8 could not
perform.** Its criterion asked whether both namespaces were observable on
`window.orcastrate` at runtime, and it reported honestly that it had no display
and could not look. This is that observation, finally made.

---

## 4. Ground truth for this machine

Measured 2026-08-20, directly against `~/.claude/projects/`. Beachcomber's
`projects` root should agree with all of it.

| Fact | Value |
|---|---|
| Project directories | **20** |
| `projects/` total size | ~250 MB |
| Entries flagged **orphan** | **8** — all cleaned-up worktrees under `dir-ect`, `dungeon-master`, and `dir-calc` |
| Entries with **no `cwd` record** | **4** — `…-Repos-dm-auth`, `…-Repos`, `D--`, `D--Cert-Planning` |

**The invariant to check with your eyes: none of those 4 may be marked an
orphan.** They have no session record, so their path is a decoded guess, and a
guess can never be shown to be missing. Each should instead carry the notice:

> Orcastrate could not read this directory's real location, so the path below is
> a guess. It is not checked for orphan status.

**`D--Cert-Planning` is the case worth looking at hardest.** It has no `cwd`
record, and *neither* candidate decoding exists on disk — `D:\Cert-Planning` and
`D:\Cert\Planning` are both absent. The design as originally written decoded the
directory name and checked whether the result existed, which would have flagged
this entry as an orphan and offered it for deletion. What shipped must show it as
unverified and **not** an orphan. If you see an orphan marker on that row, the
safety property this session was built around is broken, and nothing else in
Beachcomber should be trusted until it is understood.

---

## 5. Read-only scenarios

Nothing here writes or deletes.

**5a. Beachcomber survey.** Open Beachcomber. Confirm four root groups, the
counts above, and that sizes look plausible. Spot-check two or three rows against
the real path — you know where your own repos are.

**5b. The lossy-name check.** Find `C--Users-dmarq-Development-Repos-dir-ect`.
Its displayed path should be `C:\Users\dmarq\Development\Repos\dir-ect`, read from
the transcript — not `…\Repos\dir\ect`, which is what decoding the name alone
would produce. That single row is the whole reason the path resolution was
rewritten.

**5c. Helm, user scope.** Open Helm, select the user scope. Your
`~/.claude/settings.json` has **no `permissions` key**, so this exercises the
absent-key path against real data: the allow and deny lists should render empty
rather than erroring. Your real keys (`enabledPlugins`, `effortLevel`,
`autoUpdatesChannel`, and the rest) are unmanaged — they should not be visible in
the form, and they must survive any later save untouched.

**5d. `crossSessionInbound`.** Three radio options. `hold` must carry, verbatim:

> Not confirmed against Claude Code 2.1.235. Only "accept" and "refuse" were
> observed in the CLI.

Leave the value alone for now.

---

## 6. Write scenarios

In increasing order of consequence.

**6a. Helm save, user scope.** Change `model` to anything, save. Then check:

- a timestamped backup appeared **beside** `~/.claude/settings.json`;
- the backup's contents are the *pre-save* file;
- the panel names the backup path;
- **every unmanaged key survived** — diff against `settings.json.prelaunch`. Only
  `model` should differ.

**6b. Blocked-row protection.** Create a Pod with its working directory set to
this repo. Reopen Beachcomber and rescan. The `…-Repos-orcastrate` row must now
be blocked: `aria-disabled`, an inert checkbox, and a refusal naming the Pod by
title. Try to select it anyway — it must not respond to click or keyboard.

Note the blocking is deliberately **wider** than the design: every Pod Orcastrate
knows about blocks its directory, not only "open" ones, because `Pod.status`
cannot distinguish open-and-quiet from closed. You will not be able to trash a
Pod's `projects` entry without deleting the Pod first, and the refusal says so.

**6c. Preview.** Select one or two of the 8 orphans — the dead worktrees are the
safest possible choice, since the directories they point at no longer exist.
Preview. Confirm the totals equal the sum of the listed items, that sample names
are bare filenames, and that a blocked row you tried to include appears under
refusals rather than items.

**6d. The first real deletion.** With the preview open, confirm. Then:

- check the **recycle bin** actually contains the directory;
- confirm the row is gone from the refreshed scan;
- restore it from the recycle bin if you want your state back.

There is no route from a row to a deletion without a confirmed preview — that is
asserted two ways in the test suite, but this is the first time it will be true
of a running app.

---

## 7. The scenario this session was designed around

**Everything above is a warm-up for this one.** It is the case Helm's entire
write-safety design exists for, and the one no test could observe end to end.

1. Create a Pod whose working directory is a project with a `.claude/` folder.
2. In Helm, select that Pod's **project** scope and start editing — add an allow
   rule, do not save.
3. Leave the draft open. Switch to the Pod and get it to request a tool
   permission, then click **Allow always**.
4. The CLI now writes `permissions` into that same `.claude/settings.json`, from
   inside the running app, one pane away from your open draft.
5. Go back to Helm and save.

**Expected:** the save is refused with a conflict that names the file and states
that nothing was written. The CLI's rule survives byte-for-byte. Your draft stays
on screen and editable. Reloading and saving again is the override — and it is one
you make after seeing what you would have overwritten.

**What to watch for as it happens:** the panel should also go stale *before* you
save, because a filesystem watcher emits an advisory push. **The staleness banner
is a courtesy; the conflict refusal is the guarantee.** If the banner does not
appear but the save still refuses, that is a watcher problem, not a safety
problem, and the ordering matters when you report it.

---

## 8. What to watch for throughout

Each of these is a known finding with a named cause, so recognising one saves you
a debugging session.

### Expected, already understood

| Symptom | Why |
|---|---|
| The unverified-path notice reads "the path **below** is a guess" but sits **below** the path | Known: the copy is frozen and rendered verbatim; the fix is DOM order. `BeachcomberRow.tsx:77` |
| Closing Helm loses an unsaved draft | Known and deliberate. Closing resets the panel; nothing is lost at save time, but the close button is unforgiving. Backlogged |
| A failed **reload** also loses the draft | Known and backlogged as data loss — you followed the banner's advice and lost work to an operation that wrote nothing |
| A failed scope load shows one error sentence twice | Known: `HelmNotices.tsx` does not dedupe the way `BeachcomberError` does. Backlogged |
| A refusal says why but not which entry | Known cosmetic gap |
| Panel strip looks cramped, or the form measure looks wrong | `--oc-panel-bar-height: 32px` and `--oc-panel-max-width: 880px` were never seen rendered. **This run is their first validation** — if they look wrong, they are wrong, and `styles/tokens.css` is a one-line change |

### Genuinely unexpected — stop and capture

| Symptom | What it means |
|---|---|
| **An orphan marker on any of the 4 no-record rows** | The false-orphan guard is broken. Do not trash anything |
| **A row's path differs from the `cwd` in its transcript** | Path resolution fell back to decoding when it should not have |
| **Any deletion that does not land in the recycle bin** | Something other than `trashItem` removed it — the most serious possible failure here |
| **A Pod's directory selectable while that Pod exists** | The blocking comparison failed. Note whether that row shows the unverified notice: blocking compares against the displayed path, which for a no-record entry is a guess, and that gap is a known backlog item |
| **Helm writes without a backup appearing** | The backup-then-write ordering broke |
| **A save that succeeds after an out-of-band change** | Conflict detection did not fire. This is the guarantee; treat it as critical |
| **Unmanaged keys missing after a save** | Round-trip preservation broke — restore from the backup beside the file |
| A permission card appears on the Matriarch lane naming an `agentId` | The documented `canUseTool` attribution race — see `docs/known-issues/canusetool-attribution-race.md` |

---

## 9. If something goes wrong

Capture, in this order:

1. The **terminal** output (main process) and the **DevTools console** (renderer)
   — the two halves live in different places and one alone is usually not enough.
2. `git rev-parse HEAD` — so the report names the code that ran.
3. For a Beachcomber issue: the offending row's displayed path, whether it
   carried the unverified notice, and the actual directory name under
   `~/.claude/projects/`.
4. For a Helm issue: the file, the backup beside it, and whether the operation
   claimed success.

A full reset is `npm run dev` after quitting and deleting
`%APPDATA%\orcastrate\orcastrate.db`. That discards Orcastrate's own transcripts
and Pod list; it does not touch `~/.claude`.
