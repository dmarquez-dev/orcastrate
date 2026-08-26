import type { LaneStatus } from '@shared/contracts/events';

/**
 * The word that accompanies every lane status swatch.
 *
 * Accessibility floor: color is never the only carrier of meaning. Every place
 * a lane status is drawn — the rail row and the dispatch card's agent rows —
 * pairs the `--oc-status-*` hue with this label, so the state survives
 * greyscale, color blindness, and a screen reader.
 */
export const LANE_STATUS_LABEL: Readonly<Record<LaneStatus, string>> = {
  running: 'Running',
  done: 'Done',
  orphaned: 'Orphaned',
  /**
   * The fourth `LaneStatus` (`contracts/lane-stopped-status.ts`). The Pod that
   * owns this lane was stopped deliberately — terminal, carrying an `endedAt`,
   * and unlike `Orphaned` not a recovery state that needs explaining.
   *
   * One word, and it is the whole accessibility story: the `--oc-status-stopped`
   * swatch beside it is the third carrier, never the first.
   */
  stopped: 'Stopped',
};
