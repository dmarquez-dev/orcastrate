# Orcastrate — Electron hand-run test plan

**Date prepared:** 2026-09-30 · **Against:** `main` @ `3b57255` (C1 + C2 merged)
**Scope:** everything C1 and C2 changed, plus the two capabilities never driven
by hand — Helm writing `settings.json`, and Beachcomber moving files to the
recycle bin.

32 steps in six sections. Record every outcome in `RESULTS.md`.

---

## Before you start

```powershell
cd C:\Users\dmarq\Development\Repos\orcastrate\.dir-sdlc\handruns\2026-09-30-electron-handrun
.\setup.ps1
```

Then, in the repo root: `npm run dev`

### Safety rules — read these once

1. **Only ever trash entries named `oc-test-*` or `C--oc-test-blocked-repo`.**
   Beachcomber lists your real project state alongside the fixtures. Everything
   it moves goes to the **recycle bin** and is recoverable, but recovering a
   real project's session history is tedious — don't rely on it.
2. **Do not run `teardown.ps1` until `evaluate.ps1` has been run and its output
   saved.** Teardown restores your settings and deletes the fixtures; the
   evidence goes with them.
3. Helm writes to your real `~/.claude/settings.json`. `setup.ps1` backed up
   the original — the path is printed and recorded in `.handrun-state.json`.
4. If anything looks genuinely wrong — a file gone that shouldn't be, a path
   outside `C:\oc-test\` affected — **stop and record it**. That is a finding,
   not an inconvenience.

### Two facts the plan leans on

`setup.ps1` prints these; they matter for section E.

| | |
|---|---|
| Pod working directory | `C:\oc-test\blocked-repo` |
| Its encoded `projects` dir name | `C--oc-test-blocked-repo` |
| That name's **lossy decode** | `C:\oc\test\blocked\repo` |

The decode is **wrong** — `-` cannot be distinguished from a path separator.
That difference is precisely what step **E4** exists to prove.

### Legend

- **[POD]** — requires a live Pod; skip if you're not running Pods this sitting.
- **[C1]** / **[C2]** — verifies a fix from that sub-session.
- **[NEW]** — a capability never before driven by hand.

---

## Section A — launch and shell

### A1. The app launches and renders a workspace
**Do:** `npm run dev` from the repo root.
**Expect:** an Electron window. With no Pods, the empty workspace shows a single
**New Pod** button. A panel strip sits beneath the Pod bar with buttons for
**Beachcomber** and **Helm**.
**Watch for:** any console error at startup; a blank or unstyled window (jsdom
applies no stylesheet, so this is the first time the real CSS is exercised).

### A2. Both panel buttons are reachable and labelled
**Do:** Tab to the panel strip.
**Expect:** each button is focusable and announces its name plus its
description — "Review and clear Claude Code's on-disk state." for Beachcomber,
"Edit Claude Code settings for this machine and for each Pod." for Helm.

### A3. Layout survives a narrow window
**Do:** Drag the window narrow, then restore.
**Expect:** no horizontal scrollbar on the page body; panels reflow rather than
clip. **This is unverified territory** — the two layout token values were never
validated, because jsdom applies no stylesheet.

---

## Section B — Helm, user scope: the write path **[NEW]**

This is the half of the app that has never been driven by hand.

### B1. The scope picker offers the user scope
**Do:** Open **Helm**.
**Expect:** a **Settings file** group with a picker. Before you choose anything,
the File row reads **"No file chosen yet."** and the body reads **"Choose a
settings file above to start editing."**
With no Pods, expect the note **"There are no Pods yet, so the only settings
available are the ones for this machine."**
The user option reads **"All projects — This machine"**.

### B2. Loading the baseline document
**Do:** Choose **All projects — This machine**.
**Expect:** the form populates from the fixture: Model `claude-opus-5`; two
allow rules; one deny rule (`Bash(rm -rf:*)`); two environment variables
including `OC_HANDRUN` = `baseline`; the Hooks pane holding the `PreToolUse`
block as raw JSON.
The **File** row shows the absolute path to `~/.claude/settings.json`.

### B3. A save writes the file and takes a backup **[NEW]**
**Do:** Change `OC_HANDRUN` from `baseline` to `wrote-once`. Press **Save**.
**Expect:** a **Saved** banner, with a **Backup** label naming a backup path
beside the settings file.
**Then verify on disk** (new terminal):
```powershell
Get-Content $env:USERPROFILE\.claude\settings.json | Select-String OC_HANDRUN
Get-ChildItem $env:USERPROFILE\.claude\settings.json.*.bak
```
The live file must show `wrote-once`; exactly one `.bak` must exist, and it must
still contain `baseline`.
**Why it matters:** this is the first time in the project's life that Helm's
write path has run against a real file.

### B4. A second save takes a second, distinct backup **[C2]**
**Do:** Change `OC_HANDRUN` to `wrote-twice`. Save again.
**Expect:** a second `.bak` file with a **different name** from the first, the
first still holding `baseline`, the second holding `wrote-once`.
**Why it matters:** backup names are derived from a timestamp. Before C2 two
saves in the same millisecond silently clobbered the first backup. You are
unlikely to hit the same millisecond by hand — `evaluate.ps1` checks name and
payload distinctness across every backup the run produced, and flags any
`.N.bak` ordinal suffix as the collision path having fired.

### B5. A blocked backup aborts the write **[C2]**
**Do:** Quit the app. Create a *directory* where the next backup would go, then
relaunch, load the user scope, edit a field and Save:
```powershell
# Compute the name Helm will try next; easiest is to save once, note the
# name pattern, then mkdir a path of that exact shape for the next second.
New-Item -ItemType Directory "$env:USERPROFILE\.claude\settings.json.BLOCKED.bak"
```
**Expect:** if Helm's chosen backup name collides with that directory, the save
**fails** with an error banner carrying the OS message verbatim, and
`settings.json` is **unchanged**.
**Why it matters:** the rule is "a failed backup means no write." C2 rejected
both retry-style fixes precisely because they would step past an obstruction
onto a suffixed name and let the write through.
**If you cannot force the collision:** record it as *not exercised* rather than
as a pass. This step is timing-dependent by nature.

### B6. Invalid hooks JSON blocks the save
**Do:** In the Hooks pane, delete a closing brace. Press **Save**.
**Expect:** the save is **refused**. An error names the `hooks` field and quotes
the parser's own message including the offset. `settings.json` on disk is
unchanged.

### B7. `hold` saves with a warning, not an error
**Do:** Fix the hooks JSON. Set **Messages from another Claude Code session** to
**Hold**. Save.
**Expect:** the save **succeeds**, under a **Saved with warnings** heading. The
warning says `'hold'` was not confirmed in CLI **2.1.235** and that the CLI may
ignore it.
**Note:** you have CLI **2.1.277** installed. The message naming 2.1.235 is
correct — that is the build the value set was read from — but flag it if the
staleness bothers you; it's a legitimate C3 candidate.

### B8. An unreadable file makes the panel read-only
**Do:** Quit. Copy a broken fixture in, relaunch, load the user scope:
```powershell
Copy-Item .\fixtures\settings-malformed.json "$env:USERPROFILE\.claude\settings.json" -Force
```
**Expect:** heading **"This file could not be read as JSON"**, body explaining
Helm will not overwrite a file it could not read, **every field read-only**, and
**Save off**.
**Then repeat** with `settings-not-object.json` (a JSON array). Expect the same
read-only state, but reached by a different cause — "Settings must be a JSON
object." These are two distinct branches and both should be exercised.
**Restore before continuing:**
```powershell
Copy-Item .\fixtures\settings-baseline.json "$env:USERPROFILE\.claude\settings.json" -Force
```

---

## Section C — Helm draft safety **[C1]**

### C1. Closing with a dirty draft raises a confirmation
**Do:** Load the user scope. Edit any field. Click the panel strip's **close**
button.
**Expect:** a confirmation headed **"You have unsaved changes"**, body
explaining nothing has been written, and two choices: **Keep editing** and
**Discard changes and close**.
**Do:** Choose **Keep editing**. **Expect:** the panel stays open, edit intact.

### C2. Switching panels with a dirty draft raises the same confirmation
**Do:** With the draft still dirty, click the **Beachcomber** strip button.
**Expect:** the same confirmation. Choosing **Keep editing** leaves you in Helm
with the edit intact; choosing **Discard changes and close** moves you to
Beachcomber.
**Why it matters:** C1 widened this guard from close-only to close-and-switch.

### C3. A failed reload keeps the draft **[C1]**
**Do:** With a dirty draft on the user scope, make the file unreadable, then
press **Reload from disk**. (Easiest: quit is not an option here — instead
rename the file briefly from another terminal so the read fails.)
**Expect:** an error banner, **and your draft still on screen and still
editable**.
**Why it matters:** this is the exact data-loss bug C1 closed. A user following
the conflict banner's own advice used to lose their edits to an operation that
wrote nothing.
**Contrast:** a failed load for a *different* scope still clears — that is
correct, and is not this step.

### C4. An external write produces the stale notice
**Do:** With the user scope loaded and **no** local edits, overwrite the file
from another terminal:
```powershell
Copy-Item .\fixtures\settings-external-edit.json "$env:USERPROFILE\.claude\settings.json" -Force
```
**Expect:** within a moment, a **"This file changed on disk"** notice explaining
that saving still re-reads and compares first, so this is a heads-up, not a
block.
**Why it matters:** this exercises the watcher, and specifically the C2 change —
Helm now acknowledges the bytes it *wrote* rather than a post-write re-read, so
a foreign write is no longer silently adopted.

### C5. A conflicting save is refused and offers the comparison **[C1]**
**Do:** Load the user scope. Edit `OC_HANDRUN` to `mine`. Before saving,
overwrite the file externally again (as in C4). Now press **Save**.
**Expect:** heading **"Nothing was written"**, and advice that reads: your edits
are still here and still editable; **Compare with the file on disk** to see the
current contents beside them — comparing fetches, it never discards; Reload does
take the current contents and drops your edits to do it.
A **Compare with the file on disk** button is present **on this banner**.
**Do:** Press it.
**Expect:** a side-by-side headed **"The file on disk, beside your edit"** with
columns **On disk now** and **Your edit**, a **Setting** column, and per-row
markers **Unchanged** / **Differs**. Fields the file doesn't set read **Not
set**; empty lists read **None**.
**Why it matters:** C1's contract promised a side-by-side that could not be
built. This is that promise made real.

---

## Section D — the two defects C1 introduced **[C2]**

### D1. A later unrelated failure lands in the banner, not the comparison **[C2]**
**Do:** Reach a conflict (as in C5). Make the **compare** fail — easiest is to
rename the settings file from another terminal so the fetch errors — and press
**Compare with the file on disk**.
**Expect:** the compare failure renders **inside the comparison surface**.
**Then:** restore the file, and trigger an *unrelated* failure — press **Save**
against a file you have made unwritable, or otherwise force a save error.
**Expect:** the save's message appears in the **error banner**, *not* inside the
comparison surface, and appears **exactly once** anywhere on the panel.
**Why it matters:** this is the C1-introduced defect. `compareRequested` never
reset, so a later failure was captured by the comparison surface.

### D2. The comparison empty state names no unreachable control **[C2]**
**Do:** Load the user scope, make an edit so a draft exists, and ensure there is
**no conflict**. Look at the comparison surface's empty state.
**Expect, verbatim:**
> No comparison yet. When one is fetched, the current contents of the file on
> disk appear here beside your edit — and nothing you have typed is touched.

**Critically:** it must **not** tell you to press Compare, because the Compare
button exists only on the conflict banner and there is no conflict here.
Confirm by eye that **no Compare control is on screen at this moment**.

### D3. A failed scope listing says its sentence once **[C2]**
**Do:** Force `helm:scopes` to fail. Quit the app, make `~/.claude` temporarily
unreadable *or* rename it, relaunch, and open Helm.
**Expect:** the failure sentence appears **exactly once** on the panel. Before
C2 it printed twice, because the failure sets both the load error and the
action error to the same string.
**This is the step most likely to be awkward to stage.** If you cannot force it,
record *not exercised*. The e2e suite covers it; the value here is confirming it
in a real window.

---

## Section E — Beachcomber **[NEW]** — the destructive path

### E1. The scan lists all four roots
**Do:** Open **Beachcomber**.
**Expect:** while scanning, **"Scanning Claude Code's on-disk state…"**. Then
groups for `projects`, `shell-snapshots`, `file-history` and `paste-cache`, each
showing its absolute path, entry count and total size.
Your fixtures should be present: `oc-test-recorded`, `oc-test-orphan`,
`oc-test-bulky`, `oc-test-decoy` (×3 roots), and `C--oc-test-blocked-repo`
(in `projects` **and** in the three other roots).

### E2. The unverified notice sits ABOVE the path it qualifies **[C2]**
**Do:** Find the `projects` row for **`C--oc-test-blocked-repo`**.
**Expect:** a **"Path not verified"** notice reading:
> Orcastrate could not read this directory's real location, so the path below is
> a guess. It is not checked for orphan status.

and **the path rendered beneath it** — showing `C:\oc\test\blocked\repo`, the
lossy decode.
**The check:** the notice says "the path **below**". Confirm the path really is
below it. Before T5 the path rendered *above* the notice, making that sentence
false. **Also tab through the row** — a screen reader must meet the caveat
before the path.

### E3. The orphan marker appears only on a recorded path
**Do:** Look at `oc-test-orphan` (recorded cwd `C:\oc-test\this-was-deleted`,
which does not exist).
**Expect:** **"Working directory no longer exists"**.
**Contrast:** `C--oc-test-blocked-repo` must **not** carry the orphan marker
even though its guessed path also doesn't exist — a guess is never called
missing. That invariant is the reason the notice's second sentence exists.

### E4. ⭐ A Pod blocks the entry whose path was only a guess **[C2] [POD]**
**This is the single most valuable step in the plan.**

**Do:**
1. Create a Pod pointed at **`C:\oc-test\blocked-repo`** (New Pod → choose that
   folder). Let it reach a running state.
2. Return to Beachcomber and **Rescan**.
3. Find the `projects` row for **`C--oc-test-blocked-repo`**.

**Expect:** the row is **not selectable**, under a **"Cannot be selected"**
heading, and the reason names the Pod holding that directory. The checkbox is
genuinely `disabled` and the row announces itself as disabled.

**Why this is the crown jewel:** that entry's `displayPath` is
`C:\oc\test\blocked\repo` — a *guess*, and a wrong one. The Pod's actual cwd is
`C:\oc-test\blocked-repo`. **Before C2 those two strings did not match and the
entry would NOT have been blocked** — Beachcomber would have offered to bin the
session state of a directory a live Pod was working in. C2 made the comparison
exact by encoding the Pod's cwd and matching it against the directory *name*.

**If this row is selectable, stop.** That is a safety regression and the most
important finding the run could produce. Record it in full and do not trash it.

### E5. The same name under a non-projects root is NOT blocked **[C2] [POD]**
**Do:** With the Pod still running, look at **`C--oc-test-blocked-repo`** under
**`shell-snapshots`**.
**Expect:** **selectable**, not blocked.
**Why it matters:** every non-`projects` entry is labelled `decoded-name` while
actually carrying a true absolute path. The encoding comparison is gated on
`root === 'projects'` **as well as** on the path source. If this row *is*
blocked, that second half of the guard is missing — and Beachcomber would be
encoding Pod working directories against shell-snapshot filenames.

### E6. A recorded entry still blocks the old way **[POD]**
**Do:** Create a second Pod at **`C:\oc-test\plain-repo`**, rescan, and look at
`oc-test-recorded` (whose transcript records that exact cwd).
**Expect:** blocked.
**Why it matters:** C2 added the encoded comparison as a **union**, never a
replacement. Nothing blocked before may become unblocked.

### E7. Preview before removal **[NEW]**
**Do:** Stop the Pods (or leave them — blocked rows can't be selected anyway).
Select **only** `oc-test-decoy` under `paste-cache`. Press **Preview what will
be removed**.
**Expect:** heading **"Move these to the recycle bin?"**, lead text stating
nothing is removed until you confirm, an **Includes** sample list, and buttons
**Move to recycle bin** / **Cancel**.
**Do:** Press **Cancel**. **Expect:** nothing is removed; the entry is still in
the list after a rescan.

### E8. Confirming actually moves it to the recycle bin **[NEW]**
**Do:** Preview the same single `oc-test-decoy` entry again and press **Move to
recycle bin**.
**Expect:** a **"Last cleanup"** result. The entry disappears from the list.
**Then verify:** open the Windows Recycle Bin and confirm
`oc-test-decoy` is in it, **recoverable**.
**Why it matters:** this is the first time in the project's life that
Beachcomber's deletion path has run for real. The contract's claim is
"recoverable, not destroyed" — confirm that with your own eyes.
**Do not trash anything else.**

---

## Section F — PanelBar **[C1]**

C1's contract compelled a change here that removed a gesture. These steps
document the current behaviour rather than asserting it is right.

### F1. A strip button opens its panel
**Do:** With no panel open, click **Helm**. **Expect:** Helm opens.

### F2. Re-clicking the open panel's own button does nothing **[C1]**
**Do:** With Helm open **and a dirty draft**, click the **Helm** strip button
again.
**Expect:** **nothing happens.** No close, and critically **no confirmation
dialog**. The controller treats re-opening the open panel as a no-op and does
not consult the close guard.
**Why it matters:** this was compelled by the frozen contract — re-clicking
Helm's own button while dirty must not raise a dialog. The cost is that three
close routes became two.

### F3. The strip's close button closes
**Do:** With Helm open and **clean**, press the strip's close button.
**Expect:** the panel closes, and focus returns to the panel's own strip button.

### F4. Escape closes, including from the strip
**Do:** Open Helm. Press **Escape** from inside the panel. Reopen, Tab out to
the strip, and press **Escape** there too.
**Expect:** both close the panel.
**Why it matters:** with the per-panel toggle gone, these two are the only close
routes left. Confirm neither has rotted.

### F5. `aria-pressed` on a button that cannot un-press **[C1 — known wart]**
**Do:** With Helm open, inspect the Helm strip button's accessibility state.
**Expect:** `aria-pressed="true"`.
**Record your judgement:** the attribute truthfully reports open state, but the
button can no longer un-press itself, so it announces a toggle that only goes
one way. The open question for C3 is whether to keep `aria-pressed` as a state
indicator or move to `aria-current`. **Your opinion here is the deliverable.**

---

## After the run

```powershell
.\evaluate.ps1 | Tee-Object -FilePath .\evaluate-output.txt
```

Paste `evaluate-output.txt` and your filled-in `RESULTS.md` back into the
session. Then, and only then:

```powershell
.\teardown.ps1 -WhatIf     # review the plan
.\teardown.ps1             # do it
```
