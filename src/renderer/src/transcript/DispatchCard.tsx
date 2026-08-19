import type { LaneId, NormalizedEvent } from '@shared/contracts/events';

import { TEST_IDS, type DispatchCardProps } from '../contracts/renderer-view';
import { LANE_STATUS_LABEL } from '../lanes/lane-status';
import { testId } from '../shell/contract-runtime';
import styles from './Transcript.module.css';

/**
 * THE DISPATCH DETECTOR. This is the whole reason the card exists as its own
 * module.
 *
 * A dispatch is a `tool_use` payload whose `dispatchedLaneId` is SET. It is
 * NOT "a tool_use whose name is 'Task'", and it is NOT "…whose name is
 * 'Agent'" either. The dispatch tool is named `Agent` on CLI 2.1.235 and `Task`
 * on older ones (frozen `events.ts`, Gate 3 amendment E2), so a name check
 * written against either one alone renders ZERO cards on the other CLI — and
 * renders them silently, with no error anywhere, which is why the frozen
 * contract calls the field out by name and why this function ignores
 * `payload.name` entirely.
 *
 * Returns the LaneId the dispatch opened, or `undefined` for any other event.
 */
export function dispatchedLaneIdOf(event: NormalizedEvent): LaneId | undefined {
  const payload = event.payload;
  if (payload.type !== 'tool_use') return undefined;
  return payload.dispatchedLaneId;
}

/** `true` when this event should render as a dispatch card. */
export function isDispatchEvent(event: NormalizedEvent): boolean {
  return dispatchedLaneIdOf(event) !== undefined;
}

/**
 * The inline dispatch card (spec 5.2). Rendered at the position in the
 * Matriarch transcript where the dispatch fired, so the main narrative keeps
 * its causality — it is a list item in the event stream, not a sidebar.
 *
 * `lanes` is empty in 'inline' routing mode and while a lane has not
 * materialized. The card then renders its count with no per-agent rows RATHER
 * THAN DISAPPEARING (frozen `DispatchCardProps`), because a dispatch that
 * leaves no trace in the transcript is worse than one with no detail.
 */
export function DispatchCard({ event, lanes, onJumpToLane }: DispatchCardProps) {
  // A dispatch event opened at least one agent by definition — that is what
  // `dispatchedLaneId` being set means. When the lanes have not materialized,
  // or routing is 'inline' and there are deliberately none to list, the count
  // still reports the one this event fired.
  const count = lanes.length > 0 ? lanes.length : 1;

  return (
    <div className={styles.dispatchCard} data-testid={TEST_IDS.dispatchCard} data-seq={event.seq}>
      <p className={styles.dispatchCount}>dispatched {count} agents</p>

      {lanes.length === 0 ? (
        <p className={styles.dispatchNoRows}>No agent lanes to show for this dispatch.</p>
      ) : (
        <ul className={styles.dispatchList}>
          {lanes.map((lane) => (
            <li key={lane.id}>
              <button
                type="button"
                className={styles.dispatchAgent}
                data-testid={TEST_IDS.dispatchCardAgent}
                data-lane-id={lane.id}
                onClick={() => onJumpToLane(lane.id)}
              >
                <span className={styles.dispatchAgentType}>{lane.subagentType ?? 'agent'}</span>
                <span className={styles.status} data-status={lane.status}>
                  <span className={styles.dot} aria-hidden="true" />
                  {LANE_STATUS_LABEL[lane.status]}
                </span>
                {lane.description === null ? null : (
                  <span className={styles.dispatchAgentDescription}>{lane.description}</span>
                )}
                <span className={styles.srOnly}>Jump to this lane</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
