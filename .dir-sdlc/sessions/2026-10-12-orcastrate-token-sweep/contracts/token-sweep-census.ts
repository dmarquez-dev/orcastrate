/**
 * TOKEN SWEEP — THE SHARED SURFACE BETWEEN THE CONVERSIONS AND THE CENSUS.
 * Frozen at Gate 2 of 2026-10-12-orcastrate-token-sweep. Base `af12edc`.
 *
 * This session changes no TypeScript interface. The surface that genuinely
 * crosses task boundaries is textual: four conversion tasks (T1-T4) run
 * CONCURRENTLY and must each write the SAME replacement text, and the
 * repo-wide census (T5) must accept exactly what they wrote and reject
 * exactly what they removed. A disagreement there is invisible to every task
 * in isolation and shows up only as a red suite on the tail.
 *
 * DECLARATIONS ONLY. The sample sets below are the contract's error cases —
 * the near-misses a census predicate must NOT flag are where this project's
 * censuses have gone wrong before (a reviewer probe returned 0 offenders
 * where 15 existed, 2026-10-09). They are declared, not implemented: T5 owns
 * the matcher code.
 *
 * MEASURED AT `af12edc`, in the session worktree, and the numbers below are
 * the population these rules are frozen against:
 *   - 36 border declarations carry a raw length, every one of them exactly
 *     `1px`, in 7 files across 4 directories (`lanes/`, `pods/`, `shell/`,
 *     `transcript/`). Command:
 *     `grep -rnE '(^|[;{])[[:space:]]*(border|border-top|border-right|border-bottom|border-left|border-width|outline)[[:space:]]*:[^;}]*[0-9](\.[0-9]+)?(px|rem|em|pt|ch)' --include='*.module.css' src/renderer/src`
 *     Distinct-value census of the same population: `36 1px`, nothing else.
 *   - 19 `letter-spacing` declarations exist; 16 already name an
 *     `--oc-tracking-*` token and 3 do not.
 *   - 69 `border-radius` declarations exist and NONE is in the offender set.
 *     That is the predicate's positive control, by eye, in both directions.
 *   - 1 `border-block` declaration exists and already names the token, so
 *     widening the property list to the logical forms costs zero offenders.
 *   - 0 custom-property declarations (`--x: …`) exist in any `*.module.css`,
 *     which is why the UNANCHORED reader happens to be safe today; the
 *     anchored one required below is safe by construction instead.
 */

// ---------------------------------------------------------------------------
// 1. The two tokens, and the exact text the conversions write
// ---------------------------------------------------------------------------

/** `styles/tokens.css:144` — `--oc-border-hairline: 1px`. 24 consumers at `af12edc`. */
export type BorderWidthTokenName = '--oc-border-hairline';

/** `styles/tokens.css:151` — `--oc-tracking-wide: 0.04em`. */
export type TrackingTokenName = '--oc-tracking-wide';

/**
 * THE ONLY FORM A CONVERSION WRITES for a border width. The replacement is a
 * TEXTUAL SUBSTITUTION of the width term alone: the literal `1px` becomes
 * this string and nothing else on the line changes. No conversion splits a
 * shorthand into longhands, reorders a value, or introduces a `border-width`
 * declaration beside an existing `border` shorthand.
 */
export type TokenisedBorderWidth = `var(${BorderWidthTokenName})`;

/**
 * THE ONLY FORM A CONVERSION WRITES for tracking. Two of the three sites
 * replace an exact `0.04em` and change no pixels. The third,
 * `lanes/LaneRail.module.css:25`'s `.railHeading`, replaces `0.06em` and IS A
 * VISIBLE CHANGE to shipped type — tracking tightens from 0.06em to 0.04em,
 * authorised by escalation E1. No new tracking token is added by any task.
 */
export type TokenisedTracking = `var(${TrackingTokenName})`;

// ---------------------------------------------------------------------------
// 2. The repo-wide census predicates
// ---------------------------------------------------------------------------

/**
 * The properties the repo-wide border-width census reads. `border-radius` is
 * absent and MUST remain unreachable: a radius is a length but not a border
 * width, and it has its own `--oc-radius-*` tokens.
 */
export declare const BORDER_WIDTH_PROPERTIES: readonly [
  'border',
  'border-top',
  'border-right',
  'border-bottom',
  'border-left',
  'border-width',
  'border-block',
  'border-inline',
  'outline',
];

/**
 * Both new rules read declarations with the ANCHORED reader
 * (`anchoredValues`, `hygiene.test.ts`'s census-section helper), not the
 * unanchored `declaredValues`. The anchored reader requires a declaration
 * boundary before the property name, so a custom property named
 * `--oc-border` can never be read as a `border`, and a longhand can never be
 * read as the shorthand it is spelled inside.
 */
export type DeclarationReader = 'anchoredValues';

/**
 * An offender line, in the shape every census in `hygiene.test.ts` already
 * emits: a repo-relative path, then the declaration as found.
 */
export type OffenderLine = `${string}: ${string}: ${string}`;

/**
 * BORDER WIDTH — what the rule MUST flag. A raw length in a border value is
 * an offender REGARDLESS of whether a colour token is present: the third
 * sample is the case the handoff brief got wrong, counting only declarations
 * that named no token at all and so reporting 2 where 36 exist.
 */
export declare const BORDER_MUST_FLAG: readonly [
  'border: 1px solid var(--oc-border)',
  'border-bottom: 2px solid var(--oc-border)',
  'border-block: 1px solid var(--oc-border)',
  'border: 1px solid red',
];

/**
 * BORDER WIDTH — the near-misses the rule MUST NOT flag. `border: 0` is how
 * a reset is spelled in this tree and has no unit to tokenise;
 * `border-radius` is the 69-declaration population that must stay outside
 * the set; `outline-offset` is a longhand that the anchored reader must not
 * read as `outline`.
 */
export declare const BORDER_MUST_PASS: readonly [
  'border: var(--oc-border-hairline) solid var(--oc-border)',
  'border: 0',
  'border-radius: 4px',
  'outline-offset: 2px',
];

/**
 * TRACKING — what the rule MUST flag. The last sample is a token of the
 * WRONG FAMILY: `--oc-space-2` is a token, so a predicate that merely tests
 * for `var(` waves it through, which is the defect C3's `WEIGHT_TOKEN`
 * regex exists to close. The tracking rule must assert the
 * `--oc-tracking-*` family, not merely some token.
 */
export declare const TRACKING_MUST_FLAG: readonly [
  'letter-spacing: 0.04em',
  'letter-spacing: 0.06em',
  'letter-spacing: normal',
  'letter-spacing: var(--oc-space-2)',
];

/** TRACKING — what the rule MUST NOT flag. Both shipped tracking tokens pass. */
export declare const TRACKING_MUST_PASS: readonly [
  'letter-spacing: var(--oc-tracking-wide)',
  'letter-spacing: var(--oc-tracking-tight)',
  'letter-spacing:var(--oc-tracking-wide)',
];

/**
 * THE SCANNED POPULATION. Both new rules walk every `*.module.css` under
 * `src/renderer/src` — the existing `allModuleStylesheets()` — and carry NO
 * exception list of any kind. There is no tolerated-declaration constant for
 * either property, and none is introduced: emptying the last such list is
 * this session's purpose.
 */
export type CensusScope = 'every *.module.css under src/renderer/src';

/**
 * THE FAILURE MODE BOTH RULES MUST NOT HAVE, and the guard against it. A
 * census that silently scans nothing reports as a pass. The existing census
 * guard asserts the file list is non-empty, names files OUTSIDE
 * `beachcomber/`/`helm/`/`shell/`, and asserts the list is strictly longer
 * than `panelStylesheets()`. Both new rules scan the list that guard covers.
 */
export type CensusSelfCheck = 'non-empty, reaches outside the three legacy roots by name, strictly wider than panelStylesheets()';

/**
 * BOTH NEW RULES ARE TWO-SIDED, like every other census in the file: the
 * offender list is compared against the empty list, so a declaration that
 * stops being tokenised fails, and no tolerated entry can absorb one.
 */
export type CensusAssertionShape = 'expect(offenders).toEqual([])';

// ---------------------------------------------------------------------------
// 3. What the pin deletion must not take with it
// ---------------------------------------------------------------------------

/**
 * `PRE_TOKEN_SHELL_DECLARATIONS` and the two-sided assertion comparing the
 * scoped scan against it are DELETED by T4, in the same commit as the five
 * `shell/` conversions — the assertion is two-sided, so converting without
 * deleting turns the suite red, and deleting without converting does too.
 *
 * THE DELETION MUST NOT WEAKEN THE SCOPED RULE. After it, the scoped scan
 * over `beachcomber/`/`helm/`/`shell/` tolerates NOTHING, which is strictly
 * stronger than tolerating a five-entry list. The identifier appears 5 times
 * at `af12edc` (`grep -ro PRE_TOKEN_SHELL_DECLARATIONS src | wc -l` → 5),
 * all in `src/renderer/src/__tests__/hygiene.test.ts`: the declaration, two
 * comments, the assertion, and one historical docblock reference.
 */
export type ScopedRuleAfterPinDeletion = 'expect(offenders).toEqual([])';
