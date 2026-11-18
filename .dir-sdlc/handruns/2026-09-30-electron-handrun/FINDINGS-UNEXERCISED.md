# Findings: the unexercised steps (2026-11-17)

Session `20261117-2333-handrun-unexercised-steps`. Driver `driver/run-unexercised.mjs`,
reports `driven-report-unexercised.{json,md}` and `driven-report-unexercised-control.{json,md}`,
screenshots under `screenshots/unexercised/` and `screenshots/unexercised-control/`.

The 2026-10-07 run listed four steps as not exercised (`FINDINGS.md`, "Not exercised, and
why"): B5, the same-millisecond backup collision, D3 and A3 (narrow-window layout). This run
drives three of them in the real Electron window. Every number below is read from the two
committed JSON reports or from the driver's console summary line; nothing here is a prediction.

## Dropped at Gate 1: the same-millisecond collision

The user dropped the same-millisecond backup collision at Gate 1. Two hand saves cannot land
in one millisecond (`TESTPLAN.md:120-122`), so a driven hand-run adds nothing a hand could
reach. It stays covered by `tests/unit/helm/write-safety.test.ts`, whose cases at :131 and :168
keep two backups apart when two saves, or two services, land in the same millisecond. It is
not attempted here and is not a pass.

## Results

Real run (slug `unexercised`), as the driver printed it:
`==== UNEXERCISED RUN (unexercised): exit 0; 8 pass, 0 fail, 0 instrument-invalid of 8 ====`.
Precondition O1 pass. Every control fired and every undo was verified (each observation's
`fired: true`, `undoVerified: true` in the JSON).

| Obs | Step | Verdict | Measured | Control | Control observed |
|---|---|---|---|---|---|
| O2 | B5 clock freeze (C1) | pass | main's `new Date()` read `2031-02-03T04:05:06.789Z` while frozen; the save settled `saved`; exactly 1 new `settings.json.*` entry, `settings.json.2031-02-03T04-05-06-789Z.bak`, equal to the expected name; the Saved banner names it; it holds the pre-save bytes | main's clock read before the freeze and after the restore | before `2026-11-17T23:52:29.964Z`, after `2026-11-17T23:52:30.062Z`; restored constructor true |
| O3 | B5 blocked backup (C2) | pass | frozen at `2031-02-03T04:05:07.321Z` with a directory at `settings.json.2031-02-03T04-05-07-321Z.bak`: save settled `error`; the helm-error banner contains main's own `copyFileSync` text, `EPERM: operation not permitted, copyfile '<home>\.claude\settings.json' -> '<home>\.claude\settings.json.2031-02-03T04-05-07-321Z.bak'`; settings.json sha256 `c2f738cc…8de00` before and after; ordinal siblings none; new entries none; the obstruction still a directory with 0 entries | the `.<n>.bak` sibling scan with a decoy `….7.bak` written, then removed | 1 with the decoy, 0 after removal |
| O4 | D3 bridge check (C3) | pass | `window.orcastrate.helm.listScopes()` in the second launch: `ok: false`, code `INTERNAL`, message `ELOOP: too many symbolic links encountered, stat '<home>\.claude\settings.json'` | the same call in the first launch's healthy home | `ok: true`, 1 scope |
| O5 | D3 sentence once (C3) | pass | after opening Helm: the helm-error banner appeared; O4's message occurs **1** time in the helm-panel's `textContent` and 1 time in `<body>`; the banner holds 2 `<p>` (the heading and the one message) | a clone of the message `<p>` appended to the banner, counted, removed | 2 with the clone, 1 after removal |
| O6 | A3 minimum (C4) | pass | `getMinimumSize()` 940x600, equal to `minWidth: 940` at `src/main/window.ts:18`; `setSize(940)` gave 942x800, `setSize(800)` gave 942x800 | `setSize(1000)` | 1000x800 |
| O7 | A3 width 1280 (C4) | pass | window 1280x800, content 1266x763, `innerWidth` 1266; root scrollWidth 1266 = clientWidth 1266, no horizontal overflow; 0 elements past the right edge; Pod tab selected, Helm open | a div clientWidth + 200 px wide appended to `<body>` | root scrollWidth 1466 vs clientWidth 1266; 1266 after removal |
| O8 | A3 width 1100 (C4) | pass | window 1100x800, content 1086x763; root scrollWidth 1086 = clientWidth 1086; 0 elements past the right edge; Pod tab selected, Helm open | the same div | 1286 vs 1086; 1086 after removal |
| O9 | A3 minimum width (C4) | pass | requested 940, window 942x800, content 928x763; root scrollWidth 928 = clientWidth 928; 0 elements past the right edge; Pod tab selected, Helm open | the same div | 1128 vs 928; 928 after removal |

`<home>` abbreviates the sandbox home under the implementer's scratch directory; the full
paths are in the JSON.

"Pod open" here means a Pod created through `window.orcastrate.pods.create` and its tab
selected after a reload (`aria-current="true"`, `podTabSelected` above). No `claude` process
was spawned, as in every earlier driven run.

### How the clock freeze reaches Helm

Helm's clock is `now: () => new Date()` (`src/main/index.ts:168`), bundled as
`now: () => /* @__PURE__ */ new Date()` in `out/main/index.js`, so each save reads the global
`Date` at call time. The driver replaces `globalThis.Date` in the main process through
`electronApp.evaluate` with a subclass whose no-argument constructor and `Date.now()` return
the fixed instant, saves once, and puts the original constructor back. O2 is the proof that
this reaches Helm: the backup carries `backupStamp(T1)` exactly (`stampSource`
`src/main/helm/atomic-write.ts:48`, read by the driver from the source). The freeze is in place
only for the length of one save; O2's control shows the real clock before and after.

### How the scopes failure is staged

`listScopes` stats each scope file and rethrows anything that is not ENOENT
(`src/main/helm/revision.ts:63-71`). TESTPLAN D3 suggests renaming `~/.claude`; that yields
ENOENT, which Helm reads as "absent", so it cannot fail the listing. A junction at
`<home>/.claude/settings.json` pointing at itself makes the stat throw ELOOP; a junction needs
no privilege on Windows. It is staged in its own throwaway sandbox before the second launch,
and the driver's own `statSync` on it threw `ELOOP` before launch (`setup.scopesStaging`).

## The must-fail control: slug `unexercised-control`

`--skip-obstruction`: the directory at the second instant's backup path is never created. As
the driver printed it:
`==== UNEXERCISED RUN (unexercised-control): exit 1; 7 pass, 1 fail, 0 instrument-invalid of 8 ====`.

- **O3 `fail`, as predicted**: the save settled `saved`, no helm-error banner, settings.json
  sha256 changed from `c2f738cc…8de00` to `c37e125d…bf597`, and a new entry
  `settings.json.2031-02-03T04-05-07-321Z.bak` (a file) appeared. Its control fired (1 decoy
  sibling, 0 after removal), so the fail is valid. With the obstruction absent, nothing else
  in the route stops the write, so O3's pass in the real run is produced by the obstruction.
- O2 passed again with the same backup name, so the freeze is reproducible across launches.
- O4-O9 passed, with the same measured widths as the real run.

A second control, `--skip-freeze` (slug `unexercised-control-skip-freeze`), was run with its
report written to the implementer's scratch directory, not committed: exit 2; O2 `fail` with the
backup named after the real clock (`settings.json.2026-11-17T23-53-07-487Z.bak` against the
expected `settings.json.2031-02-03T04-05-06-789Z.bak`), and O3 `instrument-invalid` with reason
"C1's positive control (O2) did not pass, so B5 is not attempted". That is the path C1 requires
when the freeze does not reach Helm, and it shows O2 can fail.

## Findings

### F-U1. A save's outcome banner is out of view when Save is pressed (advisory)

Measured as context, not as a verdict. Helm renders every banner above the form
(`src/renderer/src/helm/HelmPanel.tsx:99`, `<HelmNotices …>`) and Save at the bottom
(`src/renderer/src/helm/HelmActionBar.tsx:71`). After Playwright clicked Save, which scrolls it
into view, no part of either outcome banner lay inside the visible area:

- O2 (successful save): `helm-backup-path` top -796, bottom -691, against a visible band
  70-763 (`backupBannerInViewAfterSave`).
- O3 (failed save): `helm-error` top -935, bottom -814, against the same band
  (`errorBannerInViewAfterSave`).

`screenshots/unexercised/b5-blocked-backup.png` is the window at that moment: the form's
bottom with Save focused, and no sign the save failed. `b5-error-banner.png` is the same state
after the driver scrolled the banner into view. The banners are `live="alert"` /
`live="status"`, so a screen reader announces them; a sighted user at the bottom of the form
sees nothing change. No `scrollIntoView` call exists under `src/renderer/src/helm` outside
tests (Grep for `scrollIntoView` in that directory). Whether this is a defect is a product call.
Ranked options:

1. Move focus to the outcome banner (or scroll it into view) when a save settles. Evidence:
   `judgment`; `HelmCloseConfirm.tsx:56` already moves focus programmatically in this panel.
2. Render the save outcome beside the action bar as well as at the top. Evidence: `judgment`.
3. Leave as is and record it as known. Evidence: `judgment`.

### F-U2. A failed scope listing also says "found no settings files" (advisory)

Seen in `screenshots/unexercised/d3-scopes-failed.png`, not measured by the driver: beneath
the ELOOP banner the picker reads "Orcastrate found no settings files to edit."
(`src/renderer/src/helm/copy.ts:53`), rendered whenever the scope list is empty
(`src/renderer/src/helm/HelmScopePicker.tsx:101`), including when the listing failed rather
than came back empty. It does not repeat the failure sentence, so O5's count is unaffected.
Ranked options:

1. Suppress `scopeNone` while the listing is in its error phase. Evidence: `judgment`;
   `src/renderer/src/state/panel-store.ts:546-551` already sets `phase: 'error'`.
2. Leave it. Evidence: `judgment`.

### F-U4. After a failed save, the earlier "Saved" banner still shows (advisory)

Seen in `screenshots/unexercised/narrow-940-after-b5.png` and `b5-error-banner.png`, not
measured by the driver: after O3's failed save the panel shows "Something went wrong" with the
EPERM text and, directly beneath it, "Saved — Backup …settings.json.2031-02-03T04-05-06-789Z.bak"
from O2's earlier save. `backupDisplayPath` is documented as "Non-null once a save has landed
for the scope on screen" (`src/renderer/src/helm/HelmNotices.tsx:39`) and rendered at :157, so
this is the documented behaviour; side by side, the two banners can read as "the save that just
failed was saved". Ranked options:

1. Clear `backupDisplayPath` when a later save on the same scope fails. Evidence: `judgment`.
2. Keep it, and label it with which save it belongs to. Evidence: `judgment`.
3. Leave it. Evidence: `judgment`.

### F-U3. The narrowest outer width is 942, not 940 (no defect)

`getMinimumSize()` reports 940, and requests for 940 and for 800 both produced an outer width
of 942 at the display's 1.25 scale factor (`meta.display.scaleFactor`). O6 judges the clamp
against the width the minimum request yields in the same window, so this is recorded, not
failed. Why the OS settles on 942 DIP is not determined here.

## For the human check (H1, Gate 3)

The driver measures overflow and does not judge appearance. Screenshots are viewport captures
at device pixels (scale 1.25), so a 1266 CSS-px viewport is about 1583 px wide.

| Width requested / outer | File | A passing layout | A failing layout |
|---|---|---|---|
| 1280 / 1280 | `screenshots/unexercised/narrow-1280.png` | Pod tab `UX narrow pod` at top left; Beachcomber / Helm strip; Helm's column centered with dark gutters either side; File row path wraps inside its box; Remove buttons aligned at the right of each rule row | Anything cut off at the right edge, a horizontal scrollbar, text overlapping |
| 1100 / 1100 | `screenshots/unexercised/narrow-1100.png` | As above with narrower gutters; Helm column the same width (helm-panel clientWidth 865 at every width) | As above |
| 940 / 942 | `screenshots/unexercised/narrow-940.png` | Helm column nearly fills the window with thin gutters; inputs and Remove buttons still on one row; the long sandbox path wraps; vertical scrollbar at the right of the column | Remove buttons pushed off-row or clipped, the path running past the box, the panel strip's CLOSE HELM truncated |
| 940 / 942, after B5 | `screenshots/unexercised/narrow-940-after-b5.png` | The form after the failed save, scrolled to its top: the "Something went wrong" banner with the EPERM text and both long paths wrapping inside it, the earlier "Saved" banner beneath (F-U4), then the form; same column fit as above | A path running past the banner's right edge, either banner clipped |

`c1-clock-frozen-save.png`, `c1-backup-banner.png`, `b5-blocked-backup.png`,
`b5-error-banner.png` and `d3-scopes-failed.png` are evidence for O2, O3, F-U1, F-U4, O5 and
F-U2 and are not part of H1.

## Safety

Both launches of each run used `buildSandbox(<root>).env` with `CLAUDE_CONFIG_DIR` removed; the
sandbox roots were under the implementer's scratch directory (`meta.sandboxRoot`) and removed
at exit (`meta.sandboxRemoved: true` in both committed reports). Main reported `USERPROFILE`,
`APPDATA` and `userData` inside each launch's sandbox and `CLAUDE_CONFIG_DIR` unset, and Helm's
File row showed the sandbox settings path (precondition O1). Unlike earlier drivers, this one
never hashes or lists the real `~/.claude`: it is neither read nor written. The clock freeze was
undone after each save and the undo verified (restored constructor true). No production file was
edited; every control was a sandbox file, an appended DOM node, or a window size.

## Summary

- B5: the clock freeze reaches Helm (O2), and a directory at the frozen instant's backup path
  makes the save fail with main's own EPERM text, leaves settings.json byte-identical and
  creates no `.N.bak` (O3). The skip-obstruction control fails O3 as predicted. **Exercised and
  passing.**
- D3: a self-referencing junction fails `helm:scopes` with ELOOP (O4, bridge-checked), and the
  sentence appears exactly once on the panel (O5). **Exercised and passing.**
- A3: the window clamps at its minimum, and at 1280, 1100 and the minimum the root never
  overflows horizontally (O6-O9). Appearance is H1.
- Same-millisecond collision: dropped at Gate 1; unit-covered.
- Three advisory findings (F-U1, F-U2, F-U4) and one recorded measurement (F-U3); no code
  changed.
