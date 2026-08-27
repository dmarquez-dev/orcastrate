import type { PodStatus } from '@shared/contracts/events';

/**
 * The word that accompanies every Pod status dot.
 *
 * Accessibility floor: colour is never the only carrier of meaning. Every place
 * a Pod status is drawn — the Pod tab's dot and the Matriarch lane row's — pairs
 * the `--oc-status-*` hue with this label, so the state survives greyscale,
 * colour blindness, and a screen reader.
 *
 * `Readonly<Record<PodStatus, string>>` is the guard on the set: a member added
 * to `PodStatus` without an entry here stops this file compiling, so no status
 * can reach the screen wordless.
 */
export const POD_STATUS_LABEL: Readonly<Record<PodStatus, string>> = {
  idle: 'Idle',
  running: 'Running',
  waiting: 'Waiting on you',
  beached: 'Beached, process stopped',
  // Literal, per design §2: a routine steady state is not themed. It reads
  // correctly beside `Idle` — `Idle` is open and between turns, `Closed` is
  // no process at all — and it is what makes the dot's colour a secondary
  // signal rather than the message.
  closed: 'Closed',
};
