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
};
