# Handoff — sub-session C3

Written 2026-10-09 at `9c8ad46`, for a session starting with no context.
**Every citation below was re-verified against the code on the day this was
written**, because the one thing this project has proved repeatedly is that a
handed-down scope goes stale silently. Line numbers are as of `9c8ad46`.

## Start here

1. Read `.dir-sdlc/backlog.md`. Prefer its **`2026-10-09 — pre-C1 backlog audit`**
   roster over the historical blocks: the blocks carry the reasoning, the roster
   carries the work with citations.
2. C3's scope is the **`2026-09-01`** block (sub-session C1's deferrals) plus the
   **`2026-09-30`** block (C2's). Both are annotated and trustworthy.
3. Use `dir:dir`. Standard track. Worktree at `.claude-worktrees/<slug>` — **inside**
   the repo; sibling placement broke module resolution for seven agents in one
   session and is the reason that path is mandatory.

Baseline at `9c8ad46`: **141 test files, 2233 tests, all passing**;
`npm run typecheck` clean on both programs; working tree clean; `main` =
`origin/main`.

## What C3 actually is, verified

### 1. The `font-weight: 600` token — the only item with real breadth

**10 declarations across 5 files**, counted this session:

| File | Count |
|---|---|
| `lanes/LaneRail.module.css` | 2 (`:24`, `:162`) |
| `pods/DeletePodDialog.module.css` | 2 (`:34`, `:42`) |
| `pods/NewPodDialog.module.css` | 2 (`:36`, `:143`) |
| `shell/EmptyWorkspace.module.css` | 1 (`:15`) |
| `transcript/Transcript.module.css` | 3 (`:85`, `:318`, `:356`) |

The token set offers 400/500/700 (`--oc-weight-regular`/`-medium`/`-bold`). Adding
a 600 is **a visual decision, not a mechanical swap** — which is why T10 pinned it
rather than changing it. Decide whether 600 becomes a token or these ten sites
move to 500/700.

**This carries a mandatory edit.** `PRE_TOKEN_SHELL_DECLARATIONS` is a two-sided
pin that fails when the defect it pins is fixed. It now lives at
`src/renderer/src/__tests__/hygiene.test.ts:631`, asserted at `:713` — **not
`:628`, which is where yesterday's roster put it.** It moved twice on 2026-10-09
(`7410c82`, then `9c8ad46`). Re-grep before citing it; it will move again.

### 2. `.confirmScrim` is opaque

`src/renderer/src/helm/Helm.module.css:413` sets `background: var(--oc-bg-app)` —
fully opaque, so the close-confirmation hides the panel behind it rather than
veiling it. Sole consumer: `src/renderer/src/helm/HelmCloseConfirm.tsx:90`. A
translucent scrim needs a token that does not exist yet, so this and item 1 are
the same decision wearing two hats: **does the theme contract gain members, and
which?**

### 3. The `PanelBar` `aria-pressed` decision

The backlog cites `PanelBar.tsx:78`; it is now **`PanelBar.tsx:83`**, with the
rationale docblock at `:31`. The attribute truthfully reports open state, but the
button can no longer un-press itself — the per-panel button always requests an
open, which the controller no-ops, because the frozen contract requires that
re-clicking the open panel's own button must not raise a dialog.

**Decide between keeping `aria-pressed` as a state indicator and moving to
`aria-current`.** Changing it means editing `PanelBar.test.tsx:50-59`
(`'carries the open state on aria-pressed, not on colour alone'`), which C1's
criterion 11 protected — so the edit is sanctioned only by a deliberate decision,
not by an implementer's judgment. The 2026-10-07 driven hand-run supplied
evidence here; read its block in the backlog before deciding.

### 4. `resetHelmForReopen` is an unnamed fifth clearing site

`src/renderer/src/state/panel-store.ts:329` (called from `:313` when
`helmMounts === 0`). It replaces the whole Helm state via `newHelmState(null)`, so
`incoming` goes null alongside `document` and `draft`. **The behaviour is correct**
— the frozen contract's clearing list names "exactly four events" and this is a
whole-state reset, not a fifth event. **The fix is to name the whole-state reset in
the contract, not to change the code.** A contract amendment, so it needs an
escalation.

### 5. One criterion-phrasing gap

`src/renderer/src/helm/HelmPanel.tsx` — criterion 6 required a declared empty state
for the comparison surface; with `draft === null` no surface renders at all. Judged
met at review because the reviewer traced the store and established that
`draft === null && incoming !== null` is unreachable, so the gating never hides a
comparison that has data. **The criterion's letter admits the other reading; decide
which it meant.** Prose-and-criterion work, no behaviour change.

## Two items are already closed — do not re-scope them

Both were recorded closed in the `2026-09-01` block's **header** while their own
bullets sat un-struck. I annotated the bullets on 2026-10-09 and verified both in
code; if you are reading an older copy of the backlog, these are the trap:

- **`HelmPanel.tsx` `compareRequested` never resets** — closed by C2. A resetting
  `lastAction` latch (`HelmPanel.tsx:62`, read at `:73`) replaced the one-way flag.
- **`COPY.comparisonEmpty` names an absent affordance** — closed by C2.
  `copy.ts:154-155` now describes when a comparison appears and names no button.

**The four "unconsumed tokens" are also void as scope.** `borderThick`,
`trackingTight`, `weightRegular` and `weightMedium` have **22 real `var()`
declarations** across Beachcomber, Helm, LaneRail, PodBar, PanelBar and
BeachcomberPreviewDialog. A 2026-10-09 re-check that called them unconsumed had
grepped the TypeScript identifiers where stylesheets only ever write the CSS
variable name. C3 is one item smaller than the older notes imply.

## Constraints that are not optional

- **Give the last task a repo-wide `tsc` criterion** covering both programs. Vitest
  transpiles without typechecking, so every scoped suite passes regardless of type
  errors. This project lost a session to that gap, and C3 touches the theme
  contract.
- **`npm test` is only a reliable gate on a quiescent tree.** One session saw 8
  phantom failures that were a concurrent peer mid-write. Put suite-wide numbers on
  the DAG tail.
- **Write "exactly one changed file" criteria path-scoped.** The unscoped form is
  unsatisfiable in a shared worktree, where peers hold uncommitted work by design.
  It appeared in four of five tasks last session and two implementers flagged it.
- **Positive-control anything that reports "I found nothing."** Check the exit code,
  not just empty output. Three nested failures of this on 2026-10-09: a grep against
  the wrong string, a `grep -lP` that exits 2 in this harness and matches nothing
  whatever the files contain, and the over-general claim in the docblock that fixed
  it. When the claim is about a CSS token, grep the `--oc-*` variable.
- **Use the Edit tool for content containing backslashes.** A quoted heredoc
  collapsed `\\x00` to `\x00` and wrote a literal null byte into a source file on
  2026-10-09. The control-byte rule caught it within minutes.
- **Read every commit message back against its diff.** Three consecutive `dir-git`
  messages drifted from their diffs on 2026-10-09 — one omitted half its change, one
  claimed the session fixed "start/stop races" when no race was involved, one called
  a known defect newly discovered. Staged paths were correct all three times; only
  the prose drifted. History is never rewritten, so the read-back is the only
  control.
- **When a session closes a backlog item, annotate the block it came from**, not only
  its own. That split is what made the pre-C1 audit necessary, and it recurred inside
  a block the audit had already called trustworthy.

## Shape I would suggest, not a decision

Items 1 and 2 are one decision about the theme contract and want one task plus an
escalation. Item 3 is a decision with a protected test edit. Item 4 is a contract
amendment with no code change. Item 5 is prose. That is plausibly three tasks and
two escalations — but the architect owns decomposition, and the user signs it at
Gate 2.
