# Driven hand-run — results

Generated 2026-10-09T18:05:11.892Z
Build `3b57255` · Electron 43.4.0 · Playwright 1.63.0

**112/112 checks passed.** 0 step(s) errored.

| Step | Title | Checks | Verdict |
|---|---|---|---|
| B2 | The baseline document loads into the form | 5 | PASS |
| B3 | A save writes the file and takes a backup  [NEW capability] | 8 | PASS |
| B4 | A second save takes a second, distinct backup  [C2] | 6 | PASS |
| B6 | Invalid hooks JSON blocks the save | 2 | PASS |
| B7 | crossSessionInbound=hold saves, with a warning not an error | 4 | PASS |
| B8 | An unparseable file makes the panel read-only | 8 | PASS |
| C1 | Closing with a dirty draft raises the panel-owned confirmation  [C1] | 5 | PASS |
| C2 | Switching panels with a dirty draft raises the same guard  [C1] | 2 | PASS |
| C3 | A failed reload KEEPS the draft  [C1 — the data-loss fix] | 3 | PASS |
| C4 | An external write raises the stale notice  [C2 watcher] | 2 | PASS |
| C5 | A conflicting save is refused and the comparison is reachable  [C1] | 12 | PASS |
| D2 | The comparison empty state names no unreachable control  [C2 defect] | 4 | PASS |
| D1 | A later unrelated failure goes to the banner, not the comparison  [C2 defect] | 4 | PASS |
| E1 | Beachcomber scans and lists all four roots | 8 | PASS |
| E2 | The unverified notice precedes the path it qualifies  [C2 / T5] | 5 | PASS |
| E3 | The orphan marker appears only on a recorded path | 2 | PASS |
| E4 | A Pod blocks the entry whose path was only a guess  [C2 — the crown jewel] | 5 | PASS |
| E5 | The same name under a NON-projects root is not blocked  [C2 R4] | 6 | PASS |
| E6 | A recorded entry still blocks the old way  [C2 union, not replacement] | 2 | PASS |
| E7 | Preview, then cancel, removes nothing  [NEW capability] | 6 | PASS |
| E8 | Confirming moves it to the recycle bin  [NEW capability — destructive] | 4 | PASS |
| F2 | Re-clicking the open panel's own button is a no-op, and raises NO dialog  [C1] | 3 | PASS |
| F5 | aria-pressed on a button that cannot un-press  [C1 known wart] | 2 | PASS |
| F3/F4 | The remaining close routes still work | 2 | PASS |
| SAFETY | The real home was never touched | 2 | PASS |

## B4 — A second save takes a second, distinct backup  [C2]

- note: Same-millisecond collision is not reachable by hand; the unit suite covers it with an injected clock.

  - `screenshots/B4-second-save.png`

## B6 — Invalid hooks JSON blocks the save

- note: Save control disabled: true

  - `screenshots/B6-invalid-hooks.png`

## B7 — crossSessionInbound=hold saves, with a warning not an error

- note: Installed CLI is 2.1.277; the message names 2.1.235, the build the value set was read from.

  - `screenshots/B7-hold-warning.png`

## B8 — An unparseable file makes the panel read-only

- note: Save disabled on a pristine draft is correct behaviour, not a stuck read-only state.

  - `screenshots/B8a-malformed.png`
  - `screenshots/B8b-not-an-object.png`

## D2 — The comparison empty state names no unreachable control  [C2 defect]

- note: This is the pairing that made the old copy wrong: surface present, control absent.

  - `screenshots/D2-empty-state.png`

## E2 — The unverified notice precedes the path it qualifies  [C2 / T5]

- note: rendered path = C:\oc\sandbox\repos\blocked\repo
- note: real Pod cwd  = C:\oc-sandbox\repos\blocked-repo

  - `screenshots/E2-notice-order.png`

## E3 — The orphan marker appears only on a recorded path

- note: A guess is never called missing — that invariant is why the notice has a second sentence.

## E4 — A Pod blocks the entry whose path was only a guess  [C2 — the crown jewel]

- note: createPod spawns nothing — it validates the cwd and writes a store record.
- note: row text: C--oc-sandbox-repos-blocked-repoPath not verifiedOrcastrate could not read this directory's real location, so the path below is a guess. It is not checked for orphan status.C:\oc\sandbox\repos\blocked\repo276 B · 2 files · 2 sessions · modified 2026-10-09Canno
- note: Pre-C2 this row would NOT have blocked: its displayPath is a wrong guess that does not equal the Pod cwd.

  - `screenshots/E4-pod-blocking.png`

## E5 — The same name under a NON-projects root is not blocked  [C2 R4]

- note: Gated on root === projects AND pathSource === decoded-name. This proves the first half is live.

## E6 — A recorded entry still blocks the old way  [C2 union, not replacement]

- note: Nothing blocked before C2 may become unblocked; the new comparison is a union.

  - `screenshots/E6-recorded-blocked.png`

## E8 — Confirming moves it to the recycle bin  [NEW capability — destructive]

- note: result: Last cleanup Moved 1 item to the recycle bin.
- note: Removal is shell.trashItem — the OS recycle bin, recoverable. Only a sandbox fixture was moved.

  - `screenshots/E8-trashed.png`

## F2 — Re-clicking the open panel's own button is a no-op, and raises NO dialog  [C1]

- note: Compelled by the frozen contract; the cost is that three close routes became two.

## F5 — aria-pressed on a button that cannot un-press  [C1 known wart]

- note: Truthful as a state indicator, but F2 shows the control cannot un-press itself. aria-current is the alternative.
