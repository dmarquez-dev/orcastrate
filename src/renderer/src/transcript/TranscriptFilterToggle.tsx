import { TRANSCRIPT_FILTER_TEST_IDS } from '../contracts/renderer-view';
import { testId } from '../shell/contract-runtime';
import styles from './Transcript.module.css';
import type { TranscriptFilterMode } from './transcript-filter';

/**
 * The accessible name, in words, with the count in it.
 *
 * "Hidden" as a bare label leaves the user unable to tell an empty lane from a
 * filtered one, and a count that exists only as a visual badge is not
 * available to a screen reader at all — so the number goes in the NAME, not
 * just in the pixels.
 *
 * `hiddenCount` is how many events the 'conversation' mode hides RIGHT NOW,
 * which is a property of the stream and not of the current mode. In
 * 'everything' mode nothing is hidden, but the button still has to say how
 * many it is about to hide.
 */
export function filterToggleLabel(mode: TranscriptFilterMode, hiddenCount: number): string {
  if (mode === 'everything') {
    return hiddenCount === 0 ? 'Hide system events' : `Hide ${hiddenCount} system events`;
  }
  return hiddenCount === 0 ? 'Show system events' : `Show ${hiddenCount} hidden system events`;
}

export interface TranscriptFilterToggleProps {
  mode: TranscriptFilterMode;
  /** How many events 'conversation' mode hides in this stream right now. */
  hiddenCount: number;
  /** 'primary' | 'split' — the test-id suffix, because BOTH panes render one. */
  pane: string;
  onToggle(): void;
}

/**
 * ALWAYS PRESENT, in both panes, whether or not anything is currently hidden,
 * and NEVER `disabled`. An affordance that appears only when it has work to do
 * is one a user never learns exists, and a disabled control in an empty lane
 * teaches them the feature does not exist at all.
 *
 * Presentation only: it takes the mode and the count and hands back a click.
 * Which mode a pane is in is the pane's own state.
 */
export function TranscriptFilterToggle({
  mode,
  hiddenCount,
  pane,
  onToggle,
}: TranscriptFilterToggleProps) {
  const label = filterToggleLabel(mode, hiddenCount);

  return (
    <button
      type="button"
      className={styles.filterToggle}
      data-testid={testId(TRANSCRIPT_FILTER_TEST_IDS.transcriptFilter, pane)}
      data-mode={mode}
      aria-pressed={mode === 'everything'}
      aria-label={label}
      title={label}
      onClick={onToggle}
    >
      {/* The word carries the state; the colour never does it alone. */}
      <span aria-hidden="true">{mode === 'everything' ? 'Hide' : 'Show'} system events</span>
      {hiddenCount === 0 ? null : (
        <span
          className={styles.filterCount}
          data-testid={TRANSCRIPT_FILTER_TEST_IDS.transcriptFilterCount}
          aria-hidden="true"
        >
          {hiddenCount}
        </span>
      )}
    </button>
  );
}
