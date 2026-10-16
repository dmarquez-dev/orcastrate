# Handoff — after the token sweep

Written 2026-10-16 at `main` = `origin/main` = `b3f4982`, for a session starting with no
context. **Every citation below was measured against the code on the day this was written**,
not copied from the backlog — because the last two handoffs each shipped with measurements
wrong, and re-measuring at kickoff is what caught both.

**This brief corrects two of its own predecessors' errors**, marked ⚠ where they appear.

## Start here

1. `main` = `origin/main` = `b3f4982`, working tree clean, everything pushed.
2. Baseline, measured today: **141 test files, 2248 tests passing**; `npm run typecheck`
   exit 0 on both programs; `npm run build` exit 0.
3. Read `.dir-sdlc/backlog.md`'s **`2026-10-15`** block (the token sweep's) and the
   **`2026-10-09`** audit roster. The blocks carry reasoning; the roster carries work.
4. Use `dir:dir`, Standard track. Worktree at `.claude-worktrees/<slug>` — **inside** the
   repo. And **never leave a shell inside it**, or `git worktree remove` fails with a
   misleading "in use" error.
5. `.dir-sdlc/handoff-token-sweep.md` is **spent** — do not scope from it. Its central
   measurement was wrong by 5×.

## What the token sweep closed, so you do not re-scope it

36 raw-length border widths and 3 `letter-spacing` literals now come from tokens.
**`PRE_TOKEN_SHELL_DECLARATIONS` is deleted** — the project's last token exception list.
Three repo-wide, two-sided, exception-free censuses stand in its place, covering
`letter-spacing`, border widths over nine properties (including the logical forms
`border-block`/`border-inline` the old rule never read), and **unterminated `var(--oc-*)`
references**. Each was shown able to fail by injection *outside* `beachcomber/`/`helm/`/`shell/`.

`.railHeading`'s tracking tightened `0.06em → 0.04em` by user decision (escalation E1) and
**was measured on screen** at `0.44px` against its own `font-size: 11px`. The hand-run was
re-run against merged `main` on 2026-10-16 and reproduced 52/52 with every measurement line
byte-identical — see `.dir-sdlc/handruns/2026-09-30-electron-handrun/VERIFY-MERGED-MAIN.md`.

## The recommended scope: finish the border-width census, one keyword over

**This is the same defect class, one step along, for the third time — and it is now cheap and
proven safe.**

C3 closed `font-weight` and left `letter-spacing` and `border-width`. The token sweep closed
*raw-length* border widths and left *keyword* border widths. **Six survive**, measured today:

| Site | Declaration |
|---|---|
| `composer/Composer.module.css:15` | `border-top: thin solid var(--oc-border)` |
| `composer/Composer.module.css:44` | `border: thin solid var(--oc-border)` |
| `composer/Composer.module.css:70` | `border: thin solid var(--oc-border-strong)` |
| `permissions/PermissionCards.module.css:27` | `border: thin solid var(--oc-status-waiting)` |
| `permissions/PermissionCards.module.css:85` | `border: thin solid var(--oc-border)` |
| `permissions/PermissionCards.module.css:100` | `border: thin solid var(--oc-border-strong)` |

`medium` and `thick` appear in no declaration — the alternation was run and matched neither,
so "the keyword `thin`" is measured, not assumed.

**These two files were invisible twice over**: they sit outside the three legacy roots, so the
old scoped rule never saw them, and the token sweep never touched them.

⚠ **The deferral prose in `hygiene.test.ts` overstates the cost, and correcting it is part of
the item.** Its "WHAT THE WIDENING DID NOT REACH" paragraph says widening the predicate
"would change six shipped borders' pixels, which is a design decision and not a test
change". **That is probably false.** The hand-run measured, twice, on two checkouts:
`thin = 0.8px`, and a declared `1px = 0.8px` — **the same used width**. So the conversion is
**zero-pixel in the engine that ships**, which makes this a mechanical consistency sweep, not
a design pass needing an escalation per site.

Two honest limits on that, both of which belong in the spec's Assumptions table rather than
being quietly dropped:

- The CSS specification fixes only the `thin < medium < thick` ordering and leaves the widths
  UA-defined. MDN states `thin` ≡ `1px`. The measurement is an engine fact on one display,
  not a standards claim.
- The `0.8px` figure itself is this display's device-pixel quantization. **Never hardcode
  it.** What survives quantization is an *equality between two values measured in the same
  window*, which is how both the driver and this conclusion are built.

So: convert the six to `var(--oc-border-hairline)`, widen the census predicate to the keyword
forms, delete the now-false deferral paragraph, and **re-run the hand-run to confirm
zero-pixel rather than asserting it** — the driver is already checkout-portable and the
`composer/` and `permissions/` sites' reachability is an open question this brief has not
measured.

### Also in scope, and cheap, because it is the same instrument

**`transcript/Transcript.module.css:45` is a grouped selector** — `.filterToggle, .unpin` —
and the driver enumerates it only as `.unpin`, reporting "not reached — needs a SPLIT pane".
But `.filterToggle` renders unconditionally in the pane header (`TranscriptPane.tsx:175-181`)
and the run measured `.pane` and `.paneHeader` as rendered in that very state. **The
declaration was on screen and measurable.** This understates coverage, which is the
conservative direction, and it is bounded: the 6-line context above every hairline
declaration in all 7 converted files was grepped for comma-grouped selectors and this is the
only one. Fix is declaration-keyed enumeration, or enumerating every selector in a group.

This matters more than its size because it is **the instrument reproducing the very failure
the session was about**: a coverage gap that reports itself as a limit. The hand-run's own
first pass hit the same shape when an ambiguous class anchor silently dropped a whole
stylesheet, reporting a site "not reached" while it was plainly visible in the screenshot
that same step had just taken.

## Standing, and better as its own session

**The palette-wide lightness pass.** ⚠ **Re-measure before scoping: the roster says five
pairs under 1.2 and the 2026-10-12 handoff measured seven, and this brief has not
re-derived either number.** The worst shipped pair is `idle`/`beached` at 1.005. It carries
the open question of whether the hygiene guard should assert *measured separation* rather
than string inequality — and a third prose instance of the stale count lives in
`styles/tokens.css` around `:87-88` ("five shipped pairs sit under 1.2"), inside a
"KNOWN AND ACCEPTED (do not re-derive)" block. Correcting a count needs no design decision,
so that one line can be fixed independently of the pass; the token sweep deliberately left it
when the user scoped prose to claims its own conversions falsified.

**A live-`claude` hand-run harness.** The single highest-value instrument this project does
not have. 18 of the token sweep's 39 converted sites could not be measured, and most need a
real `claude` process: every `transcript/` event class, lane rows and their status dots, the
split pane. `createPod` spawns nothing — `openPod` is what spawns — so the gap is narrower
than it looks and is documented in the handrun README's "Why a sandbox was viable after all".

## Constraints that are not optional

- **Positive-control anything reporting "found nothing", by exit code** — and understand the
  rule as *"positive-control the instrument you are about to trust"*, which includes the
  orchestrator's own commands. Six instances last session. The sixth was the orchestrator
  reporting 290 NUL bytes in a file that had none, because bash collapses `$'\x00'` to the
  empty string and `grep -c ''` matches every line.
- **A census validates its predicate, not only its total.** The handoff brief's "2 bare
  border widths" and the orchestrator's "36, all exactly `1px`" were both true *of their
  predicate* and both missed the six keyword widths. A second, differently-shaped reading —
  a distinct-value census rather than a re-run of the same grep — is what found them.
- **A criterion naming a *rendered* quantity must say what it is measured against, never a
  literal.** T6's criterion 6 demanded "a computed border width of 1px" when no `1px` border
  computes to `1px` on the display under test, and contradicted criterion 4 of the same task,
  which forbade exactly that. It needed amendment A2 at Gate 3. **The Gate 2 count-simulation
  step C3 asked for did run and still missed it**, because `1px` does not look like a number
  anyone needs to simulate.
- **Give the last task a repo-wide `tsc` criterion** over both programs. Vitest transpiles
  without typechecking.
- **Suite-wide numbers only on the DAG tail**, on a quiescent tree. Path-scope any "exactly
  one changed file" criterion.
- **Prefer a property over an enumeration** in any prose criterion. "The docblock carries no
  claim this task falsifies" has now caught a blocking finding in two consecutive sessions;
  an enumeration of known instances is not a specification of the obligation.
- **Use the Edit tool for file content.** Never heredocs, `sed -i` or redirects.
- **Read every commit message back against its diff**, every time. It has found something in
  six consecutive sessions.
- **Do not try to make `dir-git` write the session's attribution in the commit trailer.**
  ⚠ The `Co-Authored-By` line records **the model of the agent that ran the commit**, because
  every agent gets its own harness attribution instruction naming its own model. Asked to
  write a different name, agents split — last session, **identical** precedence wording
  produced compliance on one commit and a refusal on the next, and the refusal was
  principled: writing another model's name "would have been a false authorship claim".
  Tally across that session's 11 commits: 6 `Claude Opus 5`, 4 `Claude Haiku 5.5`, 1 merge
  with none. **Either accept the mixture, or add a `commit-msg` hook** — the only control that
  does not rest on an agent's judgment. **Read the trailers back before the push** with
  `git log --format="%h %(trailers:key=Co-Authored-By,valueonly)"`, because after a push a fix
  needs a force-push and is not worth it. Two doc-only commits were spent learning this; see
  the `2026-10-15` block's tooling entry, which records both superseded claims.
- **Beware a `node_modules` junction in the worktree.** A worktree has no dependencies; if
  you junction them from the main checkout to build, **remove the junction before cleanup** —
  a recursive delete that follows it would destroy the main checkout's real `node_modules`.
- **Annotate the originating backlog block on closure**, not only the new one.
