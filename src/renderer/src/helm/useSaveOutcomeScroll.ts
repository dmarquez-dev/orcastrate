/**
 * A settled save brings its outcome into view.
 *
 * THE RULE: when `saving` goes from true to false between two renders, the
 * first save-outcome banner inside `root` — Saved (the backup path), the error
 * banner, or the conflict banner — is scrolled into view. It is a scroll and
 * nothing more: no focus moves, and the message is not printed a second time
 * anywhere; the banner `HelmNotices` already renders is the one brought into
 * view. A mount, any render where `saving` did not fall, and a settle with no
 * banner on screen scroll nothing. Save sits at the foot of a panel that
 * scrolls and the notices sit at its head, so without this the result of a
 * save lands out of sight.
 *
 * "Settled" needs the previous value, so it is kept in a ref: a record of the
 * last render, not a fact about the view. The banner is found in the rendered
 * DOM rather than re-derived here, so this cannot disagree with `HelmNotices`
 * about whether one is showing. The call is guarded because not every
 * environment implements `scrollIntoView` (jsdom does not).
 *
 * WHY THIS IS ITS OWN FILE: the source rules in `rules.ts` forbid a file that
 * runs a React effect from also naming the comparison action, because that
 * action is reachable only from an explicit user action. `HelmPanel.tsx` wires
 * that action to its handler, so the effect this rule needs cannot live there.
 * This file names no action at all, which keeps it on the right side of that
 * rule by construction.
 */

import { useEffect, useRef, type RefObject } from 'react';

import { PANEL_TEST_IDS } from '../contracts/renderer-panels';

/**
 * The banners that report how a save ended. All three are rendered by
 * `HelmNotices` and nothing else, so a match inside the panel is always one of
 * its banners.
 */
const SAVE_OUTCOME_SELECTOR = [
  PANEL_TEST_IDS.helmBackupPath,
  PANEL_TEST_IDS.helmError,
  PANEL_TEST_IDS.helmConflict,
]
  .map((id) => `[data-testid="${id}"]`)
  .join(', ');

export function useSaveOutcomeScroll(saving: boolean, root: RefObject<HTMLElement | null>): void {
  const wasSaving = useRef<boolean>(saving);
  useEffect(() => {
    const settled = wasSaving.current && !saving;
    wasSaving.current = saving;
    if (!settled) return;
    const outcome = root.current?.querySelector<HTMLElement>(SAVE_OUTCOME_SELECTOR) ?? null;
    if (outcome === null || typeof outcome.scrollIntoView !== 'function') return;
    outcome.scrollIntoView({ block: 'nearest' });
  }, [saving, root]);
}
