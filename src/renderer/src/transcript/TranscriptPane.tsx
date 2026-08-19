import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';

import type { Lane, Seq } from '@shared/contracts/events';

import { TEST_IDS, type TranscriptPaneProps } from '../contracts/renderer-view';
import { dispatchedLaneIdOf } from './DispatchCard';
import { buildLaneIndex, collectDispatchedLanes } from './lane-index';
import styles from './Transcript.module.css';
import { TranscriptEventItem } from './TranscriptEventItem';

/**
 * How close to the bottom still counts as "at the bottom". Sub-pixel scroll
 * positions and fractional device pixels mean an exact equality check reports
 * "not at bottom" for a reader who plainly is.
 */
const BOTTOM_EPSILON_PX = 24;

/**
 * One lane's transcript (spec 5.2).
 *
 * SCROLL BEHAVIOUR is the part that is easy to get wrong and miserable to use:
 * a new event auto-scrolls the pane ONLY IF the reader was already at the
 * bottom. Someone who has scrolled up to read is never yanked back down. The
 * "at bottom" fact lives in a ref, not in state, because it is an input to an
 * effect and not something the render output depends on — storing it in state
 * would re-render the whole pane on every scroll frame.
 *
 * The pane renders `permissionSlot` (T7's cards) inside its own scroll
 * container, at the end of the event stream. It renders nothing about the
 * slot's contents.
 *
 * There is NO COMPOSER here, in either pane. There is one composer per Pod,
 * docked below the center region by the shell (spec 5.2) — a split pane with
 * its own composer would imply Calf lanes are addressable, and they are not.
 */
export function TranscriptPane({
  lane,
  view,
  lanes,
  routingMode,
  isSplit,
  hasMore,
  onLoadMore,
  onJumpToLane,
  permissionSlot,
}: TranscriptPaneProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const atBottomRef = useRef(true);

  const laneId = lane === null ? null : lane.id;
  const events = view.events;

  /**
   * Dispatch lanes, keyed by `seq`.
   *
   * THE LANE REGISTRY IS THE `lanes` PROP, NEVER `view.events`. `view` is one
   * lane's stream and a Calf's `lane_opened` is stamped with the Calf's own
   * laneId, so it never lands here — deriving the index from events yields an
   * empty map in production and silently strips every card's per-agent rows.
   * See the amendment comment on `TranscriptPaneProps.lanes`.
   *
   * In 'inline' routing mode this stays empty on purpose: every event carries
   * the Matriarch's laneId, and the frozen contract says the card's `lanes` is
   * "permanently empty" there. Neither branch is hardcoded — the mode arrives
   * as a prop and both paths run in the same component.
   */
  const dispatchLanesBySeq = useMemo(() => {
    const bySeq = new Map<Seq, Lane[]>();
    if (routingMode === 'inline') return bySeq;

    const index = buildLaneIndex(lanes);
    for (const event of events) {
      const dispatchedLaneId = dispatchedLaneIdOf(event);
      if (dispatchedLaneId === undefined) continue;
      bySeq.set(event.seq, collectDispatchedLanes(index, dispatchedLaneId));
    }
    return bySeq;
  }, [events, lanes, routingMode]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (el === null) return;
    atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight <= BOTTOM_EPSILON_PX;
  }, []);

  // Appended events land at the bottom. Follow them only for a reader who is
  // already there.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el === null || !atBottomRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [events, laneId]);

  // A pane that swaps to a different lane has changed what is on screen, so
  // focus moves — predictably, to the pane's own heading — rather than being
  // left pointing at a control that no longer means what it did. Deliberately
  // NOT done on first mount: nothing changed for the user there.
  const previousLaneIdRef = useRef(laneId);
  useEffect(() => {
    if (previousLaneIdRef.current === laneId) return;
    previousLaneIdRef.current = laneId;
    headingRef.current?.focus();
  }, [laneId]);

  const title =
    lane === null
      ? 'No lane selected'
      : lane.kind === 'matriarch'
        ? 'Matriarch'
        : (lane.subagentType ?? 'Calf');

  return (
    <section
      className={styles.pane}
      data-testid={isSplit ? TEST_IDS.transcriptSplit : TEST_IDS.transcriptPrimary}
      data-routing-mode={routingMode}
      aria-label={isSplit ? `Pinned transcript: ${title}` : `Transcript: ${title}`}
    >
      <header className={styles.paneHeader}>
        <h2 className={styles.paneTitle} ref={headingRef} tabIndex={-1}>
          {title}
          {isSplit ? <span className={styles.pinnedTag}> (pinned)</span> : null}
        </h2>
        {lane !== null && lane.description !== null ? (
          <p className={styles.paneSubtitle}>{lane.description}</p>
        ) : null}
      </header>

      {/*
        Loading, error and empty are all declared. `view.events` renders
        regardless of `phase` (frozen `Loadable` semantics), so a refetch never
        blanks a populated pane.
      */}
      {view.phase === 'loading' ? (
        <p className={styles.paneStatus} role="status">
          Loading transcript…
        </p>
      ) : null}
      {view.phase === 'error' && view.error !== null ? (
        <p className={styles.paneError} role="alert">
          {view.error.message}
        </p>
      ) : null}

      <div
        className={styles.scroll}
        ref={scrollRef}
        onScroll={handleScroll}
        data-testid={isSplit ? 'transcript-scroll-split' : 'transcript-scroll-primary'}
        tabIndex={0}
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        aria-label={`${title} events`}
      >
        {events.length === 0 && view.phase !== 'loading' ? (
          <p className={styles.paneStatus}>
            {lane === null ? 'Select a lane to see its transcript.' : 'No events in this lane yet.'}
          </p>
        ) : (
          <ol className={styles.events}>
            {events.map((event) => (
              <TranscriptEventItem
                key={event.seq}
                event={event}
                dispatchLanes={dispatchLanesBySeq.get(event.seq)}
                onJumpToLane={onJumpToLane}
              />
            ))}
          </ol>
        )}

        {/*
          Backfill. Hidden entirely when `hasMore` is false — and a page that
          came back shorter than requested is NOT an error and produces no
          message here. Exhaustion is `hasMore === false`, nothing else.
        */}
        {hasMore ? (
          <button
            type="button"
            className={styles.loadMore}
            data-testid={TEST_IDS.transcriptLoadMore}
            onClick={onLoadMore}
          >
            Load more events
          </button>
        ) : null}

        {/* T7's permission cards: inside this scroll container, at the end of
            the lane's event stream. In document flow — never a modal, never an
            overlay, never a portal. */}
        <div className={styles.permissionSlot} data-testid="transcript-permission-slot">
          {permissionSlot}
        </div>
      </div>
    </section>
  );
}
