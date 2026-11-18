/**
 * A settled save brings its outcome into view.
 *
 * THE RULE: when `saving` goes from true to false between two renders, the
 * banner for THAT save's outcome is scrolled into view, and no other:
 *   - a save that landed (no `actionError`) goes to Saved, the backup path;
 *   - a save rejected with a conflict (`actionError` equal to `conflict`) goes
 *     to the conflict banner;
 *   - any other failed save goes to the error banner.
 * When that banner is not on screen — a Saved banner for a file no longer
 * shown, say — nothing scrolls. No other banner stands in for it: a leftover
 * scope-listing error, an older Saved banner a failed save left behind, and an
 * older conflict banner a later failure left up are each someone else's
 * outcome. It is a scroll and nothing more: no focus moves, and the message is
 * not printed a second time anywhere; the banner `HelmNotices` already renders
 * is the one brought into view. A mount and any render where `saving` did not
 * fall scroll nothing. Save sits at the foot of a panel that scrolls and the
 * notices sit at its head, so without this the result of a save lands out of
 * sight.
 *
 * The target is derived from the view on the settling render, by
 * `saveOutcomeTestId`, and is stored nowhere. A save clears `actionError` as
 * it starts, and a rejected save sets `conflict` and `actionError` to the same
 * sentence, which is what lets the settling render's view name its own
 * outcome. "Settled" needs the previous value of `saving`, so that one fact is
 * kept in a ref: a record of the last render, not a fact about the view. The
 * banner itself is found in the rendered DOM by its test id rather than
 * re-derived here, so this cannot disagree with `HelmNotices` about whether it
 * is showing. The call is guarded because not every environment implements
 * `scrollIntoView` (jsdom does not).
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

/** What a settle's outcome is read from: the view on the settling render. */
export interface SaveOutcome {
  saving: boolean;
  actionError: string | null;
  conflict: string | null;
}

/**
 * The test id of the one banner that reports how this save ended: Saved
 * (`helmBackupPath`) for a save that landed, `helmConflict` for a save
 * rejected with a conflict, `helmError` for any other failed save. This is the
 * single place the target is chosen, and the selector is built from it alone,
 * so when that banner is not on screen nothing matches and nothing scrolls.
 * All three are rendered by `HelmNotices` and nothing else, so a match inside
 * the panel is always that banner.
 */
export function saveOutcomeTestId(actionError: string | null, conflict: string | null): string {
  if (actionError === null) return PANEL_TEST_IDS.helmBackupPath;
  if (actionError === conflict) return PANEL_TEST_IDS.helmConflict;
  return PANEL_TEST_IDS.helmError;
}

export function useSaveOutcomeScroll(
  { saving, actionError, conflict }: SaveOutcome,
  root: RefObject<HTMLElement | null>,
): void {
  const wasSaving = useRef<boolean>(saving);
  useEffect(() => {
    const settled = wasSaving.current && !saving;
    wasSaving.current = saving;
    if (!settled) return;
    const selector = `[data-testid="${saveOutcomeTestId(actionError, conflict)}"]`;
    const outcome = root.current?.querySelector<HTMLElement>(selector) ?? null;
    if (outcome === null || typeof outcome.scrollIntoView !== 'function') return;
    outcome.scrollIntoView({ block: 'nearest' });
  }, [saving, actionError, conflict, root]);
}
