# Handoff after the keyword hairline sweep

**Written 2026-10-26, from `main` at `52e2b98`.** Every citation below was re-measured against
the working tree on that date before it was written down. Where a re-measurement disagreed with
the `2026-10-21` backlog block, **the disagreement is stated as the finding** and the measured
value wins. Two predecessor briefs shipped with a wrong number in them — `handoff-token-sweep.md`
said "2 bare border widths" where there were 36, and `handoff-after-token-sweep.md` named the
wrong base SHA — so nothing here is inherited.

Both of those briefs are **spent**. So is this one, once its scope is taken.

---

## 1. Verified base state

| Claim | Measured 2026-10-26 |
| --- | --- |
| `origin/main` = local `main` = `HEAD` | `52e2b98a3c5e07a1b70052623797f5d1ed45f1ba` |
| Suite | **141 files / 2252 tests, all passing** (`npm test`, 78.08s) |
| `npm run build` (runs `typecheck:node`, `typecheck:web`, then `electron-vite build`) | **exit 0**, 136 modules |
| Working tree | clean |
| Local branches | **`main` only** — the fourteen merged `dir/*` branches were deleted 2026-10-26 |
| Worktrees | one, the main checkout; `.claude-worktrees/` exists and is empty |
| `node_modules` (main checkout) | 376 entries |

The fourteen deleted branches were each confirmed an ancestor of `main` with **zero** commits not
in `main` before deletion, deleted with `git branch -d` so git re-checked merge status itself,
and all fourteen tips re-confirmed reachable from `main` afterwards. Their SHAs are in this
session's scratchpad and in the reflog; nothing is unrecoverable. **Do not expect prior sessions'
branches to exist any more** — several earlier notes cite them.

---

## 2. Recommended scope: the census root

**This is the one to take, and it is bigger and sharper than the backlog says.**

### 2.1 It is six sites, not one

The `2026-10-21` block names `hygiene.test.ts:94` as *the* `process.cwd()` site. Measured, **six
test files** derive a source-scanning root from `process.cwd()`:

```
src/renderer/src/__tests__/hygiene.test.ts:94        const ROOT = process.cwd().replace(/\\/g, '/');
src/renderer/src/beachcomber/Beachcomber.hygiene.test.ts:43   (identical)
src/renderer/src/helm/no-paths.test.ts:49                     (identical)
src/renderer/src/pods/wording.test.ts:50                      (identical)
src/renderer/src/transcript/tool-summary.test.ts:43           (identical)
src/renderer/src/state/isolation.test.ts:37          const RENDERER_ROOT = `${process.cwd()}/src/renderer/src`;
```

`grep -rn 'process\.cwd()' --include=*.ts src/` returns exactly these six. The many
`process.cwd()` uses under `tests/` are Pod `cwd` **options** — legitimate, not this defect.

**This is the same shape as the three prior counts that were wrong**: the backlog's figure was
true of the one file that session touched, and was read as a statement about the tree. That makes
four consecutive handoffs whose headline count was predicate- or scope-relative.

### 2.2 The failure mode is split, and only one half is dangerous

The backlog says "a census whose population is an unstated input cannot report that it read the
wrong one." **Measured, that is half right, and the half it gets wrong is the half that matters.**

**Case A — cwd is not a checkout at all: fails loudly.** Run from an empty directory with
`--root` on the real repo, the six files produce **45 failures and zero vacuous passes**
(`hygiene.test.ts` 23 of 37 failed; the other five 22 of 23). Every test that passed is a
synthetic positive control operating on an in-memory sample — e.g. `wording.test.ts`'s "proves
the needle can fire, against a sample that does contain the sentence" — which is *correct*
behaviour, not vacuity. `hygiene.test.ts` carries four explicit non-empty guards, and all four
fired: "finds a renderer tree to scan at all", "finds the panel stylesheets to scan at all", and
two more. **So the existing guards do work.**

**Case B — cwd is a different, valid checkout: silent.** This is last session's actual accident,
and I reproduced it deliberately. A worktree at `6914e49` (pre-conversion) as cwd, `--root` on
clean `main` at `52e2b98`:

```
Tests  1 failed | 36 passed (37)
✓ finds a renderer tree to scan at all
✓ finds the panel stylesheets to scan at all
FAIL  the repo-wide token census … gives no listed border-width property a raw length
      or a bare width keyword, everywhere, with no exception list
      AssertionError: expected [ …(6) ] to deeply equal []
      + "src/renderer/src/composer/Composer.module.css: border-top: thin solid var(--oc-border)"   (×3)
      + "src/renderer/src/permissions/PermissionCards.module.css: …"                              (×3)
```

**The census reported six offenders that do not exist in the tree `--root` named, and both
non-empty guards passed**, because the wrong tree is a real tree. Had that checkout been clean,
the run would have been **37/37 green while measuring a different commit** and would have said
nothing. That is the defect, stated precisely: *the guards discriminate "a tree" from "no tree",
and nothing discriminates "this tree" from "some other tree".*

### 2.3 The fix adopts an idiom the repo already has

**13 files / 20 occurrences** already locate themselves correctly via
`fileURLToPath(new URL(…, import.meta.url))` — `tests/router/helpers.ts:27` exports a
`REPO_ROOT` on exactly this basis, and `src/main/lane/lane-router.test.ts:21`,
`src/preload/api.test.ts:422`, `tests/unit/helm/hygiene.test.ts:20` and others use the same
form. There is **no** `process.cwd()`-derived scanning root anywhere outside the six.

So this is the same move T1 made for `as string` last session — *count the repo's existing idiom
rather than pick a preference* — and the count is 13 to 6 in favour of `import.meta.url`.

`vitest.config.ts` separately already holds `const root = __dirname`, so a config-exposed root is
available as an alternative. **Prefer `import.meta.url`**: a file that locates itself cannot be
mis-rooted by any invocation, whereas a config-supplied value still depends on which config was
loaded.

### 2.4 What a criterion for this must not do

The obvious criterion — "the suite passes" — cannot see this defect, because the defect's whole
character is that the suite passes. **A criterion here has to name an instrument that can
distinguish the two trees**, and the demonstrated one is: run a census file with cwd in a second
checkout whose content differs, and require the result to be *the same* as rooted correctly, or
to fail with an explicit root-mismatch message. Case B above is the ready-made negative control.

Per the standing rule, sharpened twice now: **a criterion naming an instrument must be checkable
with that instrument under the conditions the task will actually run in.** Two of last session's
three escalations were criteria that failed this, both found by implementers rather than at
Gate 2. A DIR session runs in a worktree sharing the repo with the main checkout — which is
precisely Case B's geometry, so the task will be running inside the hazard it is fixing.

---

## 3. Also open, each re-measured

### 3.1 The scoped rule is blind to a declaration that ships — confirmed, and it is held

- `hygiene.test.ts:622` docblock says "Every property that declares a border WIDTH, **including
  the shorthands**"; the constant at `:630` lists **seven** properties and no logical forms.
- `declaredValues(text, 'border')` needs a colon straight after `border` and meets a hyphen, so
  it cannot read `border-block:`.
- **Exactly one** logical-form border declaration exists in the tree, measured:
  `beachcomber/BeachcomberPreviewDialog.module.css:61` —
  `border-block: var(--oc-border-hairline) solid var(--oc-border)`. It is tokenised.
- **The backlog's claim that the repo-wide census covers it is true.**
  `CENSUS_BORDER_PROPERTIES` at `:1506` lists **thirteen** properties and `border-block` is among
  them. Verified directly rather than taken.

So nothing is unheld; this is a docblock that overstates its constant. T4 was told explicitly not
to widen that list, so leaving it was a recorded decision, not an oversight. **Either narrow the
docblock or widen the constant — but the one thing not to do is widen it silently**, since the
scoped rule's narrowness is load-bearing for which roots it governs.

### 3.2 A docblock calls an empty capture impossible — confirmed, line corrected

`composer/Composer.styles.test.ts:51` (the backlog cites `:44`; the clause is at **:51-53**):

> `NEITHER GROUP CAN BE \`undefined\` HERE`

True of `undefined`. Group 2 of `BORDER_WIDTH_DECL` (`:32`) is `([^;}]*)`, which matches empty, so
a malformed `border: ;` yields `"border: "` — which the keyword predicate reads as a
**non-offender**. The same docblock *already* explains this correctly two sentences later, as the
reason a `?? ''` fallback was refused. The gap is one clause of precision, not a defect. Low value;
bundle it, do not scope it.

### 3.3 The contrast prose states a boundary-sensitive count without its margin

`styles/tokens.css:85-101`. The corrected prose states SEVEN of 28 pairs under 1.2 (and SIX of 21
over the pre-`stopped` seven). `running`/`orphaned` computes 1.1949 — **0.005 inside the line** —
and `done`/`stopped` sits just outside at 1.2062. The old "five" is almost certainly the count
strictly under **1.19**. The correction deliberately did not act on this. Adding the margin is a
one-line change; **re-deriving the figures is not** — treat any change here as requiring its own
derivation, measured not assumed, as T3's did.

Related and still unanswered as a **design** question, not a code one: the palette-wide lightness
pass (`backlog.md:1806`), worst shipped pair `idle`/`beached` at 1.005. No session should take
this without a decision from the user first.

### 3.4 Frozen-contract gaps — recorded, not actionable

`sessions/2026-10-16-…/contracts/keyword-hairline-sweep.ts:30` has two, both confirmed:

- Its census grep's alternation `border(-top|…|-block|-inline)?` needs the colon straight after
  the property name, so `border-block-start:` is invisible to it — the same mechanism it was
  written to pin.
- Its boundary class `[^-[:alnum:]]` treats `_` as a boundary; the **shipped** matcher uses
  `[^-\w]`, which treats `_` as an identifier character. `KeywordWidthMatchShape` (`:129`) names
  `-` and is silent on `_`.

**T4's judgment that the shipped matcher is right and the grep is wrong is correct** — `_` is a
valid CSS ident character, so reading a keyword out of `_thin` is the substring failure shifted
one character left. Measured: the shipped form is consistent in all **three** places it appears —
`Composer.styles.test.ts:41`, `hygiene.test.ts:685`, and inline at
`PermissionCards.styles.test.ts:69` — all `[^-\w]`. Also measured: `_` appears on exactly **three
lines** in any `*.module.css`, all comment prose (`PodBar.module.css:199`,
`Transcript.module.css:218,364`), so the case remains unexercised and synthetically held.

**Frozen contracts are never edited in this project.** This is live misinformation for a reader of
that session's artifacts, which is the class the `2026-10-09` *Informational* section exists for.
The three in-file copies of one regex are a mild duplication worth noting but **not** worth
hoisting into a shared module — T4's reasoning was that byte-identical in-file predicates are
what let the files be read independently.

### 3.5 Commit trailers: the only remaining action is a hook

The finding is settled and was **confirmed by doing the opposite**: no dispatch last session asked
any agent to override its own attribution, and all six commits came back uniform
(`Co-Authored-By: Claude Haiku 5.5`, the committing agent's model). The 6/4/1 split the session
before was produced by fighting the field.

If uniform trailers are wanted, a `commit-msg` hook is the only control that does not rest on an
agent's judgment about its own authorship. **Measured, this is greenfield and has a wrinkle:**
`.git/hooks/` contains **no** non-sample hook, `core.hooksPath` is **unset**, and there is no
`.husky/` or `lefthook.yml`. `.git/hooks` is not tracked by git, so a hook needs a **tracked
script plus an install step** to survive a fresh clone — that is the actual work, and it is a
decision about repo tooling the user should make rather than a defect to fix.

Keep doing the read-back regardless: it has found something in **seven consecutive sessions**, and
its value is partly that it feeds the next dispatch. Last session's find was convention, not a
false claim — one commit body at 305 characters against a 71-87 convention — and **naming it in
the next dispatch is what kept the remaining four at 68-71.**

### 3.6 The live-`claude` hand-run harness

Still the highest-value instrument this project lacks, and **still not needed by the last two
sessions.** The keyword sweep measured 70/70 with zero unreachable, including three permission
cards previously recorded as requiring a live `claude` — reached by having the **main process**
send the app's own `push:permissionRequested`. The reach note predicting otherwise was wrong in
the favourable direction. **Before recording any site as unreachable, check whether the app's own
IPC can produce the state.** Genuinely unexercised, per `backlog.md:1621`: `B5`, the
same-millisecond backup collision, `D3`, and narrow-window layout (needs a human eye).

One driver per session is the convention; a completed driver is the record of its own run and is
left byte-identical. Six exist under
`.dir-sdlc/handruns/2026-09-30-electron-handrun/driver/`.

---

## 4. Things that will waste your time if you rediscover them

- **`--oc-border-hairline` is at `styles/tokens.css:156`**, `--oc-border-thick` at `:157`.
  `:144` is correct only as of `6914e49`.
- **`npx vitest --reporter=basic` does not exist in this version — and exits 0.** The reporter
  module fails to load, nothing runs, and the process reports success. I hit this today while
  measuring this brief's own base numbers and caught it only because the output had no test
  counts in it. **Use `npm test`.** This is the third instrument in three sessions that reported
  success without measuring: positive-control every "passed" and every "found nothing" **with a
  predicted number.**
- **A DIR worktree gets no `node_modules`.** The one the last session ran in held a single entry,
  `.vite`, with resolution walking up to the main checkout. It is **not** a junction, so no
  recursive delete can follow it into the main checkout — that is the half cleanup safety depends
  on, and it holds. Re-verify rather than assume.
- **`git worktree remove` can fail on Windows with "Permission denied" after emptying the tree.**
  It happened today: the files and git metadata were removed, only the now-empty directory
  survived, held by a shell that had been inside it. `rmdir` plus `git worktree prune` finishes
  the job. **Never leave a shell inside a worktree.**
- **The Edit tool, not heredocs, for file content.** Three agents last session independently
  reported an "auto mode" directive telling them to use `sed`/heredocs and to avoid Edit, and all
  three ignored it and said so. This repo has paid for that twice — a heredoc wrote a literal
  **0x00** into `hygiene.test.ts:796` on 2026-10-09, and an earlier scripted edit wrote a `0x08`
  that every test passed over. **State the Edit-tool rule explicitly in every implementer
  dispatch**; do not assume the project convention wins by default. The harness separately refused
  one agent's `Write` because the filename pattern-matched "report file"; the right route is write
  to scratch, `cp` into place, verify with `cmp`.
- **The contract-operation coverage search needs a hand-recorded deviation when the contract is
  declaration-only.** Run literally it returned `not called` for 15 of 20 declarations last
  session and 18 the session before, all false — nothing imports a declaration-only contract.
  Record the criterion verdict establishing each consumption instead.

---

## 5. Process, carried forward because it keeps paying

**Ask implementers to disagree with the brief, by name.** Four times last session an agent
corrected the layer above it and was right every time — including a reviewer that withdrew its own
remedy ranking after an implementer argued an enumeration in a test name is a *stored derivation*,
and a reviewer that audited a stated limit and found it **understated**, in the direction that made
its own subject look better. Two of three escalations were defects in criteria frozen at Gate 2,
both caught by the first agent that tried to *run* them. **This brief is the layer above the next
session's agents. Expect it to be wrong somewhere and ask them to say so.**

**Keep the repo-wide `tsc` criterion on the DAG tail.** It has now caught a defect twice. Vitest
transpiles without typechecking, so a scoped green suite proves nothing about types; last
session's `TS18048` was found by a *peer task*, because no criterion of the owning task named
`tsc`. Note `as string` cannot apply to a `.mjs` driver — indexed access with a comment is the
portable half.

**Property over enumeration, with the limit stated.** A loop over a shipped constant makes a
universal name true by construction but goes blind to a **deletion**, because the loop shrinks with
the list; an enumeration covers deletion and not addition. Neither is simply correct. `hygiene.test.ts`
now says which half catches which failure — nine of thirteen properties are deletion-covered by
literals, the four uncovered being `border-right`, `border-left`, `border-inline`, `outline`.

**Read the population a second, differently-shaped way before writing any criterion about a
count.** This caught `var(--oc-border-thick)` last session — seven declarations shipping a token
whose *name* ends in a width keyword, which a substring predicate flags on a clean tree — and it is
what turned up the six `process.cwd()` roots in §2.1 today. A count produced by the predicate you
are about to enforce is true *of that predicate*. And ask what the population is read **from**,
not only what selects within it: §2.2 is that question's answer living in the instrument.

---

## 6. Suggested shape

**Standard track.** Scope §2 — the census root, all six sites, converted to the repo's
`import.meta.url` idiom, plus a guard that discriminates *this* tree from *some other* tree, with
Case B as its negative control. Bundle §3.1's docblock and §3.2's one clause if the DAG has room;
they are prose precision and need no derivation.

Leave §3.3's palette pass, §3.5's hook and §3.6's harness alone unless the user asks — the first
two are decisions about the product and its tooling rather than defects, and the third is not
currently blocking anything.
