/**
 * KEYWORD HAIRLINE SWEEP — THE SHARED SURFACE BETWEEN THE CONVERSIONS, THE
 * WIDENED CENSUS, AND THE DRIVEN HAND-RUN.
 *
 * Frozen at Gate 2 of 2026-10-16-orcastrate-keyword-hairline-sweep.
 * Base branch `main` at `6914e49`.
 *
 * This session changes no TypeScript interface either. As in the token sweep,
 * the surface that genuinely crosses task boundaries is TEXTUAL and
 * PREDICATE-SHAPED: two conversion tasks (T1, T2) run CONCURRENTLY and must
 * write the same replacement text; the widened census (T4) must accept
 * exactly what they wrote and reject exactly what they removed; and the
 * driven hand-run (T5) must enumerate the sites they converted and measure
 * them against a reference taken in the same window. A disagreement between
 * any two of those is invisible inside either one.
 *
 * DECLARATIONS ONLY. Every sample set below is a declared error case, not an
 * implementation. T4 owns the matcher code; T5 owns the driver code.
 *
 * ---------------------------------------------------------------------------
 * MEASURED IN THE SESSION WORKTREE AT KICKOFF, and these are the populations
 * the rules below are frozen against. Each figure names the command that
 * produced it, and the border-keyword census is read a second,
 * differently-shaped way because a census of this exact population has now
 * been wrong twice.
 *
 *  (a) 6 border-width declarations use a bare CSS width KEYWORD. All six are
 *      `thin`; `medium` and `thick` appear as a bare keyword in none.
 *      Command (the keyword census, term-anchored on both sides):
 *        grep -rnE '(^|[;{])[[:space:]]*(border(-top|-right|-bottom|-left|-width|-block|-inline)?|outline)[[:space:]]*:[^;}]*(^|[^-[:alnum:]])(thin|medium|thick)([^-[:alnum:]]|$)' --include='*.module.css' src/renderer/src
 *      -> the 6 lines named in `KEYWORD_WIDTH_SITES` below, exit 0.
 *
 *  (b) THE SECOND, DIFFERENTLY-SHAPED READING, which is what found the
 *      near-miss this contract exists to pin. Dropping the term anchors and
 *      matching `\b(thin|medium|thick)\b` in the same properties returns
 *      13 declarations, not 6. The extra 7 are
 *      `var(--oc-border-thick)` references — a TOKEN whose NAME ends in a
 *      width keyword:
 *        beachcomber/Beachcomber.module.css:225,
 *        beachcomber/BeachcomberPreviewDialog.module.css:38,
 *        helm/Helm.module.css:143, helm/Helm.module.css:430,
 *        lanes/LaneRail.module.css:312, pods/PodBar.module.css:155,
 *        shell/PanelBar.module.css:50.
 *      13 - 7 = 6, which is (a) reached from the other side.
 *      **`var(--oc-border-thick)` IS THEREFORE THE LOAD-BEARING NEAR-MISS OF
 *      THIS SESSION**, exactly as `--oc-border` was for the token sweep and
 *      `border-radius` was for C3. A predicate that substring-matches a
 *      keyword inside a value flags all 7 and goes red on a clean tree. Five
 *      of the 7 sit INSIDE `beachcomber/`/`helm/`/`shell/`, so the scoped
 *      rule is exposed to it too.
 *
 *  (c) 69 `border-radius` declarations exist and none may enter the offender
 *      set — the highest-volume near-miss by count, carried forward from the
 *      token sweep's own contract.
 *
 *  (d) 8 `--oc-status-*` tokens ship. Command:
 *        grep -nE '^\s*--oc-status-[a-z]+\s*:' src/renderer/src/styles/tokens.css
 *      -> 8 (idle, running, waiting, done, beached, orphaned, closed,
 *      stopped). Read a second way, from the frozen contract rather than the
 *      stylesheet: `grep -cE '\-\-oc-status-[a-z]+' src/renderer/src/contracts/renderer-theme.ts`
 *      -> 8, same eight names.
 * ---------------------------------------------------------------------------
 */

// ---------------------------------------------------------------------------
// 1. The token, and the exact text a conversion writes
// ---------------------------------------------------------------------------

/** `styles/tokens.css:144` — `--oc-border-hairline: 1px`. */
export type BorderWidthTokenName = '--oc-border-hairline';

/** `styles/tokens.css:145` — `--oc-border-thick: 2px`. Declared here only so
 *  the near-miss below has a name; no task converts anything to it. */
export type ThickBorderTokenName = '--oc-border-thick';

/**
 * THE ONLY FORM A CONVERSION WRITES. The replacement is a TEXTUAL
 * SUBSTITUTION of the width term alone: the exact substring `thin` becomes
 * this string and nothing else on the line changes. No conversion splits a
 * shorthand into longhands, reorders a value, adds a `border-width`
 * declaration beside an existing shorthand, or changes a colour term.
 *
 * NOTE THE TERMINATION HAZARD, which this repository has already paid for
 * once: a bulk substitution that eats the following space emits
 * `var(--oc-border-hairline)solid`, which is invalid CSS a browser discards
 * whole. The repo-wide unterminated-reference census in `hygiene.test.ts`
 * already detects it; no task may weaken that rule.
 */
export type TokenisedBorderWidth = `var(${BorderWidthTokenName})`;

/**
 * THE SIX SITES, file and line as measured at kickoff against this tree.
 * A conversion task may not add a site to this list or drop one from it;
 * either is a contract-change escalation.
 */
export declare const KEYWORD_WIDTH_SITES: readonly [
  'src/renderer/src/composer/Composer.module.css:15',
  'src/renderer/src/composer/Composer.module.css:44',
  'src/renderer/src/composer/Composer.module.css:70',
  'src/renderer/src/permissions/PermissionCards.module.css:27',
  'src/renderer/src/permissions/PermissionCards.module.css:85',
  'src/renderer/src/permissions/PermissionCards.module.css:100',
];

// ---------------------------------------------------------------------------
// 2. The widened predicate
// ---------------------------------------------------------------------------

/**
 * The three CSS border-width keywords. ALL THREE ARE FLAGGED, not only the
 * one that ships: a rule named for the keyword forms that reads only `thin`
 * is narrower than its own name, and the next `medium` anyone writes walks
 * past it. `medium` and `thick` are therefore covered by synthetic samples
 * rather than by a shipped declaration, and that is stated rather than left
 * to be inferred from an empty offender list.
 */
export declare const BORDER_WIDTH_KEYWORDS: readonly ['thin', 'medium', 'thick'];

/**
 * THE PREDICATE IS A TERM MATCH, NOT A SUBSTRING MATCH. A keyword counts only
 * where it stands as a whole term in the declared value — not where it is a
 * tail of an identifier. `-` must be treated as an identifier character on
 * both sides, which is the whole of the difference between flagging 6 and
 * flagging 13 (see (b) in the header).
 *
 * Declared as the property it must have, not as the regex that has it: T4
 * owns the matcher.
 */
export type KeywordWidthMatchShape =
  'a width keyword flagged only as a whole term in the value; `-` counts as an identifier character on both sides';

/**
 * BOTH READERS, UNCHANGED. The census keeps `anchoredValues`; the scoped rule
 * keeps `declaredValues`. This session changes neither reader. The keyword
 * predicate is a VALUE test, so it is independent of which reader produced
 * the value, which is what lets one helper serve both rules.
 */
export type DeclarationReader = 'anchoredValues' | 'declaredValues';

/**
 * THE SCOPED RULE WIDENS TOO. DECIDED HERE, STATED HERE.
 *
 * The scoped rule over `beachcomber/`/`helm/`/`shell/` contains none of the
 * six, so nothing forces this. It is decided anyway, for one reason that is
 * specific to this session rather than general tidiness: 5 of the 7
 * `var(--oc-border-thick)` references of (b) are INSIDE those three roots, so
 * widening the scoped rule is what exercises the term-boundary requirement
 * against real shipped declarations instead of against synthetic samples
 * alone. A scoped rule left un-widened would also be a second predicate for
 * the same property that disagrees with the census about what a border width
 * is, which is the shape of defect this session is the third instalment of.
 */
export type ScopedRuleDecision = 'borderOffenders widens to the keyword forms, with the same term-match predicate';

/**
 * MUST FLAG. The first two are the shipped shapes; the next two are the
 * keywords that ship nowhere and are covered synthetically; the last is the
 * logical form, which the census property list reaches and the scoped
 * rule's own list does not.
 */
export declare const KEYWORD_MUST_FLAG: readonly [
  'border: thin solid var(--oc-border)',
  'border-top: thin solid var(--oc-border)',
  'border: medium solid var(--oc-border)',
  'border-width: thick',
  'border-block: thin solid var(--oc-border)',
];

/**
 * MUST NOT FLAG. The first is the converted form every one of the six
 * becomes. The SECOND IS THE ONE THAT MATTERS — the 7-declaration population
 * of (b), which a substring predicate flags and a term predicate does not.
 * The rest are the near-misses carried forward from the token sweep's
 * contract, re-asserted here because a widened predicate is a new predicate
 * and inherits nothing.
 */
export declare const KEYWORD_MUST_PASS: readonly [
  'border: var(--oc-border-hairline) solid var(--oc-border)',
  'border: var(--oc-border-thick) solid var(--oc-border)',
  'border-width: var(--oc-border-thick)',
  'border: 0',
  'border-radius: 4px',
  'outline-offset: 2px',
  '--oc-border: thin',
];

/** Unchanged from the token sweep, and no task may narrow either. */
export type CensusScope = 'every *.module.css under src/renderer/src';
export type CensusAssertionShape = 'expect(offenders).toEqual([])';

/**
 * THE SELF-CHECK BOTH RULES ALREADY CARRY AND MUST KEEP: a census that
 * silently scans nothing reports as a pass. The existing guard asserts the
 * file list is non-empty, names files outside the three legacy roots, and
 * asserts the list is strictly longer than `panelStylesheets()`.
 */
export type CensusSelfCheck =
  'non-empty, reaches outside the three legacy roots by name, strictly wider than panelStylesheets()';

// ---------------------------------------------------------------------------
// 3. The hand-run: site enumeration and the measurement protocol
// ---------------------------------------------------------------------------

/**
 * THE ENUMERATION DEFECT THIS SESSION CLOSES, stated as the property the fix
 * must have rather than as the one site that exposed it.
 *
 * `run-token-sweep.mjs` keys its site map by CLASS NAME: `borders` maps one
 * class to the sides its declaration sets. A declaration written under a
 * COMMA-GROUPED selector has more than one class and the map can hold only
 * one of them, so the others are never probed and the declaration is reported
 * `not reached` while it is on screen.
 * `transcript/Transcript.module.css:45-46` (`.filterToggle, .unpin`, its
 * hairline declaration at `:51`) is the instance: enumerated as `unpin`
 * alone, reported as needing a SPLIT pane, while `.filterToggle` renders
 * unconditionally in the pane header (`TranscriptPane.tsx:175-181`) in the
 * very state the run measured `.pane` and `.paneHeader` in.
 */
export type SiteEnumerationRequirement =
  'a declaration is keyed by the declaration, carries every selector in its group, and counts as reached when ANY of those selectors renders';

/**
 * The shape a site entry must therefore have. Declared as the fields it must
 * carry; T5 owns the literal.
 */
export interface HandrunSite {
  /** Every class in the declaration's selector group, not just one. */
  readonly selectors: readonly string[];
  /** The sides the declaration actually sets. A longhand leaves the other
   *  three at 0, so probing all four would manufacture a failure. */
  readonly sides: readonly ('top' | 'right' | 'bottom' | 'left')[];
  /** Why this site may be out of reach, written BEFORE the run so an
   *  unreachable site is a recorded limit and not a surprise. */
  readonly reachNote?: string;
}

/**
 * THE SIX CONVERTED SITES, mapped to the classes that carry them. Measured
 * from the stylesheets and their consumers at kickoff.
 *
 *   composer/Composer.module.css      .composer (top), .input (all), .send (all)
 *   permissions/PermissionCards.module.css
 *                                     .card (all), .reason (all), .action (all)
 *
 * REACHABILITY IS AN OPEN QUESTION AND IS NOT ASSERTED HERE. `.composer`,
 * `.input` and `.send` render together whenever `Composer` renders
 * (`Composer.tsx:126,133,173` — no conditional between them), and the token
 * sweep's run measured `.composerRegion`, the shell wrapper around it.
 * `PermissionCardList` returns `null` on an empty card list
 * (`PermissionCardList.tsx:35`), and a card needs a real permission prompt,
 * which needs a live `claude` process. A site that turns out unreachable is a
 * recorded limit with a reason, exactly as the previous run's 18 are — not a
 * failure, and not a criterion anyone may call unmet.
 */
export type ConvertedSiteMap = 'the six sites above, keyed by declaration, with reach notes written before the run';

/**
 * THE MEASUREMENT PROTOCOL. THIS IS A CONSTRAINT ON WHAT MAY BE WRITTEN DOWN,
 * not only on what the driver does, and the project has paid for it twice.
 *
 * No pixel literal is ever the reference. What survives this display's
 * device-pixel quantization is an EQUALITY BETWEEN TWO VALUES MEASURED IN THE
 * SAME WINDOW: the converted border's used width against the used width of a
 * declared `1px` rendered in that same window. `0.8px` is this display's
 * quantization of `1px` and must appear nowhere as an expectation.
 *
 * The token sweep's T6 criterion 6 demanded a border "with a computed border
 * width of 1px" when no `1px` border computes to `1px` in that window, and
 * contradicted criterion 4 of its own task, which forbade exactly that. It
 * needed an amendment at Gate 3.
 */
export type MeasurementProtocol =
  'equality against a declared 1px reference measured in the same window; never a pixel literal';

/**
 * THE ZERO-PIXEL CLAIM, AND ITS EXACT STRENGTH. An engine measurement on one
 * display, not a standards claim: the CSS specification fixes only the
 * `thin < medium < thick` ordering and leaves the widths UA-defined. MDN
 * states `thin` is equivalent to `1px`. Every artifact that repeats the claim
 * must word it as an engine measurement.
 */
export type ZeroPixelClaimStrength =
  'an engine measurement on one display, not a standards claim';

// ---------------------------------------------------------------------------
// 4. The lightness count correction
// ---------------------------------------------------------------------------

/**
 * THE METRIC IS WCAG CONTRAST RATIO, not CIE lightness, despite the prose's
 * wording — `tokens.css` states its own figures that way ("WCAG contrast
 * 1.796 against `idle`"). sRGB relative luminance per WCAG 2.x,
 * `(Lmax + 0.05) / (Lmin + 0.05)`.
 *
 * The population is the 8 shipped `--oc-status-*` tokens of (d), so 28
 * unordered pairs. The prose at `styles/tokens.css:85-89` says the worst
 * shipped pair is `idle`/`beached` at 1.005 and that FIVE shipped pairs sit
 * under 1.2.
 *
 * THE SUBTLETY, STATED SO THE CORRECTION READS AS A MEASUREMENT RATHER THAN
 * AS A SWAPPED DIGIT: "five" was written in the session that ADDED `stopped`,
 * so it may have been counted over the 7 tokens that pre-dated it (21 pairs).
 * A re-derivation over 8 can legitimately differ from a correct original, so
 * BOTH populations are derived and both numbers stated if they differ.
 *
 * NO DERIVED ANSWER APPEARS HERE, BY GATE 2 DECISION. The architect returned
 * its own counts for both populations and the orchestrator independently
 * reproduced them, agreeing exactly; both were then STRIPPED from this
 * contract before the freeze so that the task deriving the correction cannot
 * read the answer off the artifact it is handed. A count this project has now
 * had wrong in three separate documents is worth a genuinely independent third
 * reading, and a cross-check the task can see is not one.
 *
 * The orchestrator holds both withheld figures and checks the task's result
 * against them at review. A disagreement is the finding, and is reported
 * rather than silently reconciled — in either direction.
 */
export type LightnessMetric = 'WCAG 2.x contrast ratio over sRGB relative luminance';

/** No reusable helper exists. `lanes/LaneRail.styles.test.ts:163` explicitly
 *  records that relative luminance was not needed there, so the derivation is
 *  a one-off computation whose method is reported with its result. */
export type LightnessHelperAvailability = 'none in this repository';
