import type { Pod, PodId } from '@shared/contracts/events';
import { forkEligibility, type ForkEligibility } from '@shared/fork-eligibility';

/**
 * The Fork control's view model, and the tab's ancestry sentence.
 *
 * ELIGIBILITY IS `forkEligibility`'s ALONE. Main answers `pod:fork` with
 * CONFLICT from the same function, so the control and the channel cannot
 * disagree about which Pods may be forked. Nothing in this directory compares a
 * status to decide it; this file reads the verdict and words it.
 */
export interface ForkControlVm {
  eligibility: ForkEligibility;
  /** `Fork <title>`, in every state, so the control is findable by name. */
  accessibleName: string;
  /**
   * Why the control is unavailable, or `null` when it is available. Carried as
   * the control's accessible DESCRIPTION, so a keyboard user who lands on the
   * control hears the reason as well as the name.
   */
  reason: string | null;
}

/** The reason for a Pod with no Claude Code conversation yet. */
export const FORK_REASON_NO_SESSION = 'There is no conversation to fork yet.';

/** The reason for a Pod whose turn is still in progress. */
export const FORK_REASON_MID_TURN = 'This Pod is mid-turn. Fork it once the turn ends.';

export function forkControlFor(pod: Pick<Pod, 'ccSessionId' | 'status' | 'title'>): ForkControlVm {
  const eligibility = forkEligibility(pod);
  const reason =
    eligibility === 'eligible'
      ? null
      : eligibility === 'no-session'
        ? FORK_REASON_NO_SESSION
        : FORK_REASON_MID_TURN;
  return { eligibility, accessibleName: `Fork ${pod.title}`, reason };
}

/** The ancestry sentence for a fork whose parent is no longer listed. */
export const FORKED_FROM_DELETED = 'Forked from a deleted Pod';

/**
 * The tab's ancestry sentence, or `null` for a Pod that was never forked.
 *
 * DERIVED AT RENDER from the CURRENT Pod list, never stored: the parent's title
 * is looked up each time, so renaming the parent renames the sentence with no
 * further action.
 *
 *   forkedFromPodId names a listed Pod   -> `Forked from <its title>`
 *   forkedFromPodId names no listed Pod  -> the deleted-parent sentence. The
 *                                           store nulls the column when the
 *                                           parent is deleted, but a list read
 *                                           before that refetch can still name
 *                                           the old id.
 *   forkedFromPodId null, source session -> the deleted-parent sentence
 *   both null                            -> null: never forked
 */
export function forkAncestryFor(
  pod: Pick<Pod, 'forkedFromPodId' | 'forkedFromCcSessionId'>,
  titleOf: (podId: PodId) => string | undefined,
): string | null {
  if (pod.forkedFromPodId !== null) {
    const parentTitle = titleOf(pod.forkedFromPodId);
    return parentTitle === undefined ? FORKED_FROM_DELETED : `Forked from ${parentTitle}`;
  }
  return pod.forkedFromCcSessionId === null ? null : FORKED_FROM_DELETED;
}
