# Handoff — the token sweep (C3's shape, one property over)

Written 2026-10-12 at `31d4851`, for a session starting with no context.
**Every citation below was measured against the code on the day this was written**,
not copied from the backlog — because the last handoff proved that a brief's *warnings*
survive while its *measurements* drift. Two of C3's five items arrived with their breadth
wrong, and re-measuring at kickoff is what caught both.

**This brief already corrects three roster errors.** They are marked ⚠ where they appear.

## Start here

1. `main` = `origin/main` = `31d4851`, working tree clean, everything pushed.
2. Baseline, measured: **141 test files, 2240 tests passing**; `npm run typecheck` exit 0
   on both programs.
3. Read `.dir-sdlc/backlog.md`'s **`2026-10-12`** block (C3's) and the **`2026-10-09`**
   audit roster. The blocks carry reasoning; the roster carries work.
4. Use `dir:dir`, Standard track. Worktree at `.claude-worktrees/<slug>` — **inside** the
   repo. And **`cd` back out of it before cleanup**, or `git worktree remove` fails with a
   misleading "in use" error; the orchestrator's own shell is what holds the lock.
5. The C1/C2/C3 Large routing is **finished**. There is no queued sub-session.
   `.dir-sdlc/handoff-c3.md` is spent — do not scope from it.

## The recommended scope, and why it is one session

**C3 closed `font-weight`. The same defect is still open for `letter-spacing` and
`border-width`, hidden by the same scope trap, and closing it empties the project's last
token exception list.**

C3 discovered that the pre-existing hygiene rule walks only `TOKENISED_STYLE_ROOTS` —
`beachcomber/`, `helm/`, `shell/` — which is why five bare `font-weight` literals in
`lanes/`, `pods/` and `transcript/` were never offenders. C3 fixed that **for
`font-weight` only**, with a new repo-wide census. The identical blind spot still covers
the other two properties the old rule checks.

Measured now, across every `*.module.css` under `src/renderer/src`:

### 1. Two bare border widths — zero-pixel conversions

| Site | Declaration |
|---|---|
| `lanes/LaneRail.module.css:277` | `border: 1px solid var(--pod-status-color)` |
| `pods/PodBar.module.css:121` | `border: 1px solid var(--pod-status-color)` |

`--oc-border-hairline: 1px` exists (`styles/tokens.css:144`) and already has **24
consumers**. Both conversions change zero pixels.

### 2. The five pinned shell declarations — also zero-pixel, and they empty the pin

`PRE_TOKEN_SHELL_DECLARATIONS` in `__tests__/hygiene.test.ts` now holds exactly five
entries after C3 released the sixth. **All five are `1px`:**

```
shell/EmptyWorkspace.module.css: border: 1px solid var(--oc-border-strong)
shell/WorkspaceLayout.module.css: border-bottom|left|right|top: 1px solid var(--oc-border)
```

Every one is an exact-value duplicate of `--oc-border-hairline`. ⚠ **The docblock's claim
that these are lengths "for which the token set has no entry" is false** — the token
exists and the same tree uses it 24 times. Converting all five lets the list, its
docblock and the two-sided assertion be **deleted outright**, which is the stated purpose
of that pin: *"the exception list shrinks under review rather than quietly outliving the
problem."* This session can finish it.

### 3. Three bare letter-spacings — two zero-pixel, one real decision

| Site | Value | Token? |
|---|---|---|
| `pods/PodBar.module.css:209` | `0.04em` | **exactly `--oc-tracking-wide`** |
| `transcript/Transcript.module.css:181` | `0.04em` | **exactly `--oc-tracking-wide`** |
| `lanes/LaneRail.module.css:25` | `0.06em` | **no token at this value** |

16 declarations already use `var(--oc-tracking-*)`; these three do not. The first two are
mechanical. **The third is this session's E1** — same shape as C3's `font-weight: 600`: a
value the token set has no entry for, so it is a visual decision, not a swap. Either add a
third tracking token or move the site to `0.04em`, which is a visible change. Escalate it;
do not let an implementer round it.

### 4. The universal census, extended

Extend C3's census in `__tests__/hygiene.test.ts` so `letter-spacing` and `border-width`
join `font-weight` under the repo-wide rule with **no exception list**. C3's version is
the model, including its self-check that the file list is non-empty and reaches outside
the three legacy roots. Keep that guard — a census that silently scans nothing passes.

### 5. Two stale docblocks, which this change falsifies further

- `pods/PodBar.module.css:1-5` — ⚠ **the roster cites this as the location of the
  bare-lengths claim and that is right, but its companion is not recorded.** The claim is
  false on *two* counts today: `--oc-border-thick` exists and **the same file uses it at
  `:152` and `:172`**, and "the only bare lengths are hairline border widths" is itself
  false because `:209` is a bare `letter-spacing`.
- `pods/DeletePodDialog.module.css:1-4` — ⚠ **not in the roster at all.** It repeats the
  claim ("the only bare lengths are hairline border widths, as in `PodBar.module.css`")
  while that file contains **no bare lengths whatsoever**. Measured: zero.

Both become fully false once this session converts the sites. Use C3's criterion-11
wording — *the absence of any claim this task falsifies*, not a list of strings to delete.
That phrasing is what caught C3's only blocking finding.

## Also standing, and better as its own session

**The palette-wide lightness pass.** Re-measured from `styles/tokens.css` today across the
eight `--oc-status-*` values:

| Pair | Contrast |
|---|---|
| `idle` / `beached` | **1.005** |
| `waiting` / `stopped` | 1.052 |
| `running` / `done` | 1.055 |
| `waiting` / `done` | 1.146 |
| `idle` / `orphaned` | 1.182 |
| `beached` / `orphaned` | 1.188 |
| `running` / `orphaned` | 1.195 |

⚠ **The roster says "five pairs under 1.2". Measured: seven**, of 28 pairs. The headline
`idle`/`beached` at 1.005 is correct. Keep this separate from the token sweep — it is a
design-decision pass with user escalations per pair, and it carries the open question of
whether the hygiene guard should assert *measured separation* rather than string
inequality.

## The prose-rot sweep — twelve instances, citations re-verified today

Individually trivial, collectively this project's most repeated defect class. **Three of
the roster's line numbers have drifted; two are corrected here:**

| Claim | Roster says | Verified today |
|---|---|---|
| `contracts/renderer-state.ts` "The four fields below" | `:298` | `:298` ✓ |
| `pods/PodTab.tsx` `STATUS_LABEL[status]` | `:229` | `:229` ✓ |
| `pods/PodTab.test.tsx` "Duplicated from" | `:310` | `:310` ✓ |
| `__tests__/pod-stop.e2e.test.tsx` "from Running to Stopped" | `:466` | ⚠ **`:480`** |
| `pods/PodTab.source.test.ts` future tense re `raw.d.ts` | `:25-26` | `:25` ✓ |
| `helm/rules.ts` lookahead stated backwards | `:7-8` | `:8` ✓ |
| `src/main/index.ts` stale "Criterion 5" | `:94` | ⚠ **`:96`** |
| `__tests__/hygiene.test.ts` "the shell four" | `:709` | `:709` ✓ — **five, not four** |

`styles/tokens.css`'s two prose items (the Status block header, and the assembled
`stopped`/`idle` sentence) were cited at `:43` and `:63-65`; **C3 added ~27 lines to that
file, so both have moved — re-grep before citing.**

## Constraints that are not optional

- **Give the last task a repo-wide `tsc` criterion** over both programs. Vitest
  transpiles without typechecking.
- **Suite-wide numbers only on the DAG tail**, on a quiescent tree.
- **Path-scope any "exactly one changed file" criterion.**
- **Simulate every criterion's own stated count against the tree the change will
  produce.** C3 froze two defective criteria — one arithmetically impossible, one
  asserting "five directories" while naming four — and both were caught downstream rather
  than at Gate 2. Vacuity and pairwise checks do not catch a wrong number.
- **Positive-control anything reporting "found nothing", by exit code**, and confirm any
  phrase you grep from source sits on **one line**. Five instances this session,
  including a reviewer's own probe returning 0 where 15 existed. Two more specific traps
  seen: a quoted heredoc collapsing `\s*` to a bare `s` inside a template literal, and
  `grep -rc` output being split on a **Windows drive-letter colon**, which silently
  zeroes a count.
- **Use the Edit tool for file content.** Never heredocs, `sed -i` or redirects.
- **Read every commit message back against its diff.** `dir-git`'s prose drifted for the
  fourth consecutive session while its staged paths were correct every time — C3's
  `10feee6` claims "five 400→regular, four 700→bold" where the diff shows one and four.
  History is never rewritten, so the read-back is the only control.
- **Annotate the originating backlog block on closure**, not only the new one.

## Verification you now have, and what it does not cover

C3's visual changes **were driven and confirmed** — `.dir-sdlc/handruns/2026-09-30-electron-handrun/FINDINGS-C3.md`,
32/32, with `driver/run-c3.mjs` reusable. All four scrims composite, the `aria-current`
rename still paints, and the semibold token resolves.

**But only 3 of the 10 semibold sites were on screen.** `.railHeading`, `.agentType`,
`.subject`, `.bypassWarning`, `.paneTitle`, `.dispatchCount` and `.dispatchAgentType`
were never rendered — the last three need a live `claude` process. If this session
converts more stylesheet values, the same limit applies: extend `run-c3.mjs` rather than
assuming a green suite covers appearance.
