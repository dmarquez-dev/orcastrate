# Hand-run results — 2026-09-30

**Run by:** · **Date:** · **Build:** `main` @ `3b57255` · **CLI:** 2.1.277

Mark each step `PASS`, `FAIL`, `PARTIAL`, or `NOT EXERCISED`. A step you could
not stage is **NOT EXERCISED** — never a pass. Notes matter more than the verdict:
"looked fine" tells the next reader nothing.

---

## Verdict summary

| Step | Verdict | One-line note |
|---|---|---|
| A1 launch and render | | |
| A2 strip buttons labelled | | |
| A3 narrow window | | |
| B1 scope picker | | |
| B2 baseline loads | | |
| B3 **save writes + backup** | | |
| B4 second backup distinct | | |
| B5 blocked backup aborts write | | |
| B6 invalid hooks blocks save | | |
| B7 `hold` warns but saves | | |
| B8 unreadable file → read-only | | |
| C1 close with dirty draft | | |
| C2 switch with dirty draft | | |
| C3 failed reload keeps draft | | |
| C4 stale notice on external write | | |
| C5 conflict → compare side-by-side | | |
| D1 later failure → banner not comparison | | |
| D2 empty state names no absent control | | |
| D3 scopes failure prints once | | |
| E1 four roots listed | | |
| E2 notice above path | | |
| E3 orphan marker placement | | |
| E4 ⭐ **Pod blocks the guessed entry** | | |
| E5 non-projects same name not blocked | | |
| E6 recorded entry still blocks | | |
| E7 preview then cancel | | |
| E8 **confirm → recycle bin** | | |
| F1 strip button opens | | |
| F2 re-click is a no-op, no dialog | | |
| F3 strip close closes | | |
| F4 Escape closes (both places) | | |
| F5 `aria-pressed` judgement | | |

**Totals:** PASS ___ · FAIL ___ · PARTIAL ___ · NOT EXERCISED ___

---

## Detail — fill in for anything not a clean PASS

### Step ID:
**What I did:**
**What I expected:**
**What actually happened:**
**Exact text on screen (quote it):**
**Reproducible?** yes / no / didn't retry

---

## The three questions only a hand-run can answer

**1. Does it look right?** jsdom applies no stylesheet, so this run is the first
time the real CSS has ever been seen. Spacing, contrast, the two unvalidated
layout token values, the confirmation scrim (known to be **opaque** rather than
dimmed — a C3 item). Write what you actually saw.

>

**2. Did anything feel wrong that no step asked about?** Latency, focus jumps,
a control that was hard to find, wording that read oddly in situ.

>

**3. F5 — `aria-pressed` or `aria-current`?** Your call; C3 needs a direction.

>

---

## Anything that scared you

Unexpected file disappearance, a path outside `C:\oc-test\` touched, a real
project entry affected, an error you could not explain. **Record it even if you
recovered from it.**

>

---

## Recycle bin check

- [ ] `oc-test-decoy` (paste-cache) present in the recycle bin after E8
- [ ] Nothing else of mine ended up there
- [ ] Items restored / left in bin (circle one)

---

## Attach

- [ ] `evaluate-output.txt`
- [ ] Screenshots of anything that failed
- [ ] Console output if the app logged errors
