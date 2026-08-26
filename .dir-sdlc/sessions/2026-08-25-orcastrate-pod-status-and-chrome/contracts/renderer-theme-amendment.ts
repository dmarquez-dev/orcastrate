/**
 * CONTRACT — amendment to the frozen `renderer-theme.ts` token set. Frozen at
 * Gate 2.
 *
 * Boundary between T3 (the ONLY task that writes `renderer-theme.ts`,
 * `contract-runtime.ts` and `styles/tokens.css`) and T5 / T6, which consume
 * these names from their own `*.module.css` files. Nothing else in this session
 * may add, rename or remove a token.
 *
 * ADDITIONS ONLY. Nothing above is renamed, revalued or removed, so no existing
 * component's appearance changes as a side effect of this task.
 *
 * WHY IT IS A CONTRACT CHANGE AT ALL. `renderer-theme.ts` is frozen and its own
 * docblock states the rule: "A component needing a token that does not exist
 * STOPS AND ESCALATES rather than inventing a literal — an invented literal is
 * invisible until the theme changes and then it is everywhere."
 * `renderer-theme.ts` carries one `--oc-status-*` token per status and has NO
 * green and NO yellow action colour. This session needs both, plus a token for
 * the fourth `LaneStatus`. All three are escalations that resolve here.
 */

// ===========================================================================
// 1. The five new tokens
// ===========================================================================

/**
 * Appended to `TOKENS` in `src/renderer/src/contracts/renderer-theme.ts`.
 *
 * `statusStopped` is the fourth `LaneStatus`' hue — see
 * `contracts/lane-stopped-status.ts`. It joins the seven existing
 * `--oc-status-*` tokens and is therefore covered by the exhaustiveness and
 * distinctness rules in section 3.
 *
 * The four `action*` tokens are a NEW FAMILY, deliberately not `--oc-status-*`.
 * They name what a CONTROL does, not what a Pod IS, and keeping the families
 * apart is what stops "run" from being read as a status hue and what keeps the
 * `--oc-status-*` distinctness rule meaning what it means. `--oc-danger` /
 * `--oc-danger-bg` is the same shape one family over, and the delete control
 * already consumes exactly that pair — the run and stop controls get their own
 * pair each so the three controls are described the same way.
 */
export const ADDED_TOKENS = {
  /** The fourth `LaneStatus`: the Pod that owns this lane was stopped. */
  statusStopped: '--oc-status-stopped',

  /** Foreground of the run control (Open / Reconnect). Green. */
  actionRun: '--oc-action-run',
  /** Hover surface behind the run control. */
  actionRunBg: '--oc-action-run-bg',
  /** Foreground of the stop control. Yellow. */
  actionStop: '--oc-action-stop',
  /** Hover surface behind the stop control. */
  actionStopBg: '--oc-action-stop-bg',
} as const;

/**
 * The values `styles/tokens.css` declares on `:root`. Pinned here rather than
 * left to taste, so the token task and the two consuming tasks cannot disagree
 * about what "green" was, and so the distinctness rule in section 3 is
 * satisfiable by construction.
 *
 * EXISTING VALUES, for the distinctness argument — do not change any of them:
 *   --oc-status-idle     #7c8598   --oc-status-running   #4da3ff
 *   --oc-status-waiting  #e6a33c   --oc-status-done      #4bb87a
 *   --oc-status-beached  #d95c5c   --oc-status-orphaned  #a97fd6
 *   --oc-status-closed   #4a5060   --oc-danger           #ff6b6b
 *
 * AMENDED 2026-08-25 by escalation E1, after Gate 2 froze this file. The value
 * was `#8f8577`. T3's review measured it against the neighbours this paragraph
 * named and found the LIGHTNESS half of the claim false: `#8f8577` vs `idle`
 * is a WCAG contrast ratio of 1.022, against 2.173 for the `closed`/`idle` pair
 * cited below as the precedent. Separation was hue-only, so a stopped lane and
 * an idle lane read as one swatch in greyscale. The user chose to re-pin rather
 * than to soften the claim.
 *
 * `--oc-status-stopped: #c0b39d` is chosen to separate from the two quiet
 * neutrals it sits nearest — `idle` (#7c8598, cool) and `closed` (#4a5060, dark
 * cool) — by HUE and by LIGHTNESS both. Measured: 1.796 against `idle` and
 * 3.903 against `closed`. It is quiet on purpose: a deliberately stopped lane is
 * a routine resting state and must not compete with `waiting`, which needs a
 * human — and lightening it pushes against that, which the gate weighed.
 *
 * KNOWN AND ACCEPTED, recorded so nobody re-derives it: `#c0b39d` measures 1.052
 * against `waiting` (#e6a33c); both are warm. This is not a regression the
 * amendment introduces so much as the palette's existing shape — the worst pair
 * among the seven SHIPPED tokens is `idle` vs `beached` at 1.005, and five
 * shipped pairs sit under 1.2. This palette is hue-differentiated throughout,
 * and "survives greyscale" is not a property any pair of it has. The amendment
 * fixes the semantically adjacent pair, where confusing two resting states costs
 * something; the systemic question is carried to the backlog, not settled here.
 *
 * `--oc-action-run` is a warmer, more saturated green than `--oc-status-done`
 * (#4bb87a) so a control never reads as a status swatch; `--oc-action-stop` is
 * a clearer yellow than `--oc-status-waiting` (#e6a33c), which is amber. The
 * two `*-bg` values are dark, low-chroma surfaces built to the same recipe as
 * `--oc-danger-bg` (#3a1f22): the hue of their foreground, dropped to a panel
 * lightness, so a hover reads as the control's own colour rather than as grey.
 */
export const ADDED_TOKEN_VALUES = {
  '--oc-status-stopped': '#c0b39d', // AMENDED 2026-08-25 by E1; was #8f8577
  '--oc-action-run': '#35c46b',
  '--oc-action-run-bg': '#173a26',
  '--oc-action-stop': '#e0c341',
  '--oc-action-stop-bg': '#3a3418',
} as const;

// ===========================================================================
// 2. `statusToken` widens — and it is a DECLARE/IMPLEMENT PAIR
// ===========================================================================

/**
 * TWO hand-written duplicates of one union, in two files, with NOTHING in the
 * type system connecting them:
 *
 *   `renderer-theme.ts:142-144`   `export declare function statusToken(status: …)`
 *   `contract-runtime.ts:27-34`   `export type AnyStatus = …`
 *
 * Widening one without the other does not break the build. It breaks the CALL
 * SITES, somewhere else, later. `__tests__/hygiene.test.ts`'s "keeps
 * statusToken declared and implemented over the same union" is the only thing
 * that catches it, and it parses both with `/'([a-z]+)'/g` — which is why the
 * new member had to be a single lowercase word.
 *
 * BOTH gain `'stopped'`, in ONE task, in ONE commit:
 *
 *     status: 'idle' | 'running' | 'waiting' | 'beached' | 'closed'
 *           | 'done' | 'orphaned' | 'stopped',
 *
 * `STATUS_TOKENS` in `contract-runtime.ts` is
 * `Readonly<Record<AnyStatus, string>>`, so it stops compiling until
 * `stopped: TOKENS.statusStopped` is added. That is the one real guard in the
 * chain; do not weaken the annotation to land the change.
 */
export const STATUS_TOKEN_UNION = [
  'idle',
  'running',
  'waiting',
  'beached',
  'closed',
  'done',
  'orphaned',
  'stopped',
] as const;

// ===========================================================================
// 3. The two guards that must be widened WITH the tokens, never after
// ===========================================================================

/**
 * `src/renderer/src/__tests__/hygiene.test.ts`, "declares one distinct value
 * per status, idle and closed included", asserts the sorted `--oc-status-*`
 * names in `tokens.css` equal an explicit seven-name array and that every
 * declared value is its own. Adding `--oc-status-stopped` FAILS it until the
 * array becomes eight — that is the guard doing its job, not a broken test. The
 * distinctness assertion is NOT relaxed to make room; `#c0b39d` is chosen so it
 * does not have to be (AMENDED 2026-08-25 by E1; was `#8f8577`).
 *
 * `src/renderer/src/shell/WorkspaceLayout.test.tsx`, "maps every status in both
 * status unions to its own token", carries the same seven names as a `const`
 * array and asserts one distinct token per status. It becomes eight.
 *
 * BOTH FILES ARE OWNED BY THE TOKEN TASK for exactly this reason: a token added
 * in one task and a guard widened in another means a window in which the guard
 * is red for a reason no reviewer can attribute.
 *
 * The rules NOT touched, and which every consuming task still answers to:
 *   - "hardcodes no colour outside styles/" — the five values above are
 *     declared in `styles/tokens.css` and nowhere else. A consuming stylesheet
 *     writes `var(--oc-action-run)`, never `#35c46b`.
 *   - `*.styles.test.ts` suites assert "references only tokens that the frozen
 *     TOKENS map names" against `Object.values(TOKENS)`, so a consumer of a
 *     token missing from `renderer-theme.ts` fails there.
 */
export const WIDENED_GUARDS = [
  'src/renderer/src/__tests__/hygiene.test.ts',
  'src/renderer/src/shell/WorkspaceLayout.test.tsx',
] as const;

// ===========================================================================
// 4. What a consumer may and may not do with a colour token
// ===========================================================================

/**
 * COLOUR IS NEVER THE SOLE CARRIER OF MEANING. This is the accessibility floor,
 * it is a binding discipline rule, and for the Pod tab controls it is a
 * SHIPPED, ASSERTED property that must keep passing:
 * `PodTab.test.tsx` reaches every control by ACCESSIBLE NAME — `Stop <title>`,
 * `Open <title>` / `Reconnect <title>`, `Delete <title>` — and never by class or
 * by computed style.
 *
 * So a task consuming `--oc-action-run` or `--oc-action-stop`:
 *   - MUST leave the `aria-label` of each control exactly as it is today, and
 *     must leave `runControlFor`'s verb choice alone.
 *   - MUST leave the `data-icon` shapes distinct — `play` / `pause` / `delete`
 *     — because shape is the second carrier and the one a test can assert.
 *   - MUST NOT introduce a control whose only difference from another is hue.
 *
 * Colour is the THIRD carrier here, exactly as `PodBar.module.css`'s delete
 * comment already says of red. Adding green and yellow makes the set
 * consistent; it must not make any of them load-bearing.
 */
export const COLOUR_IS_NEVER_THE_ONLY_CARRIER = true;
