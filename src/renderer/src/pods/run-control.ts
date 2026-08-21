import type { PodStatus } from '@shared/contracts/events';

/**
 * The run control's verb, derived from status and from nothing else
 * (`contracts/pod-verbs.ts`, Part A).
 *
 * WHY BOTH VERBS SURVIVE. Not because `pods.open` refuses a beached Pod — it
 * does not; see `PodsChrome.handleRun` for the two reasons that are true. This
 * function exists so the ONE decision — which verb, and what the control is
 * called — is made in one place and read by both the tab (for the name) and
 * the connector (for the action). Two call sites deriving it separately is how
 * a label and an invocation drift apart.
 */
export interface RunControlVm {
  /** `'Reconnect'` when `status === 'beached'`, `'Open'` otherwise. */
  label: 'Open' | 'Reconnect';
  /**
   * The control's ACCESSIBLE NAME, which is where the cause lives.
   *
   *   beached -> `Reconnect <title>, stopped with an error`
   *   closed  -> `Open <title>`
   *
   * Design section 8 requires a beached Pod to keep an affordance carrying its
   * CAUSE. Both modes render the same PLAY icon — the icon says "this will
   * run" — so the icon cannot carry the distinction and the name must. A user
   * reaching the control by keyboard hears only the control's own name; the
   * tab's status line ("Beached, process stopped") is read separately and is
   * therefore a second carrier rather than the only one.
   */
  accessibleName: string;
  /** Which action the connector invokes. */
  verb: 'open' | 'reconnect';
}

/**
 * The clause appended to a beached Pod's accessible name. Exported so a suite
 * can assert the JOIN rather than re-typing the sentence and matching itself.
 */
export const BEACHED_CAUSE = ', stopped with an error';

export function runControlFor(status: PodStatus, title: string): RunControlVm {
  if (status === 'beached') {
    return {
      label: 'Reconnect',
      accessibleName: `Reconnect ${title}${BEACHED_CAUSE}`,
      verb: 'reconnect',
    };
  }
  return { label: 'Open', accessibleName: `Open ${title}`, verb: 'open' };
}
