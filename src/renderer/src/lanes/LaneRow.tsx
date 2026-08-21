import { memo } from 'react';

import type { LaneId } from '@shared/contracts/events';

import type { LaneRowVm } from '../contracts/renderer-state';
import { TEST_IDS } from '../contracts/renderer-view';
import { testId } from '../shell/contract-runtime';
import { formatElapsed } from './format-elapsed';
import { LANE_STATUS_LABEL } from './lane-status';
import styles from './LaneRail.module.css';

/**
 * The row's inner select button. Not in `TEST_IDS`: the contract lists only the
 * ids that cross a task boundary, and the row container plus the three action
 * ids cover everything T8 drives. This one exists so LaneRail's own tests can
 * click selection without matching the enclosing `<li>`.
 */
export const LANE_ROW_SELECT_TEST_ID = 'lane-row-select';

export interface LaneRowProps {
  row: LaneRowVm;
  onSelect(laneId: LaneId): void;
  /**
   * AMENDMENT (`contracts/renderer-panes.ts` section 4). `onPin` and `onUnpin`
   * are DELETED and replaced by these two. Optional for the compile-time
   * concession the contract states, and the rail's own suite is what makes an
   * absent one a failure rather than a valid state.
   */
  onShowInFollower?: (laneId: LaneId) => void;
  onHideFollower?: (laneId: LaneId) => void;
  onSteer(laneId: LaneId): void;
}

/**
 * The pin glyph. Decorative: the button's whole accessible name comes from the
 * sr-only text beside it, because "Pin"/"Unpin" says which state the control is
 * in and not which action it performs.
 */
function PinGlyph() {
  return (
    <svg
      className={styles.pinGlyph}
      viewBox="0 0 16 16"
      width="12"
      height="12"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M9.5 1.5 14.5 6.5 12.6 8.4 12 8.2 8.9 11.3 9.2 13.2 7.8 14.6 5.2 12 1.8 15.4 0.6 14.2 4 10.8 1.4 8.2 2.8 6.8 4.7 7.1 7.8 4 7.6 3.4 9.5 1.5Z"
        fill="currentColor"
      />
    </svg>
  );
}

/**
 * One lane rail row (spec 5.1): agent type, description, status, elapsed time,
 * and an unread indicator.
 *
 * NO TIMER, NO CLOCK. `elapsedMs` arrives on the view model already computed by
 * the state layer, and this component only formats it. That is what makes a
 * `done` lane's row stop re-rendering: nothing in this subtree schedules work,
 * so with `memo` and an unchanged `row` object React never revisits it.
 *
 * The row is a `<li>` holding a select `<button>` plus sibling action buttons —
 * buttons cannot legally nest, and every affordance has to be keyboard
 * operable, so the click target for selection is a real button rather than a
 * `<li onClick>`.
 *
 * TEST IDS. `TEST_IDS.laneRow` is documented `lane-row:<laneId>` and is carried
 * by the `<li>`, the element that ENCLOSES the whole row. The three action ids
 * — `laneRowUnread`, `laneRowPin`, `laneRowSteer` — are documented WITHOUT a
 * suffix and are rendered literally, exactly as `TEST_IDS` spells them; the
 * enclosing row disambiguates them, so a suite reaches them with
 * `within(getByTestId('lane-row:<id>'))`. That is the same pattern T7's
 * permission cards use. The inner select button therefore takes an internal id
 * that `TEST_IDS` does not list, which the contract explicitly permits.
 */
function LaneRowImpl({ row, onSelect, onShowInFollower, onHideFollower, onSteer }: LaneRowProps) {
  const { lane } = row;
  const laneId = lane.id;

  // The contract: Steer is offered only when `steerPrefill(row.lane)` returns
  // non-null — "i.e. the lane has an `agentId`". `steerPrefill` is T5's, and
  // calling it from here would reach across a task boundary for a value the
  // contract already spells out, so the condition is applied directly.
  const canSteer = lane.agentId !== null;

  return (
    <li
      className={styles.row}
      data-testid={testId(TEST_IDS.laneRow, laneId)}
      data-matriarch={row.isMatriarch ? 'true' : 'false'}
      data-in-primary-pane={row.inPrimaryPane ? 'true' : 'false'}
      data-in-follower-pane={row.inFollowerPane ? 'true' : 'false'}
      data-focused-follower={row.focusedFollower ? 'true' : 'false'}
    >
      <button
        type="button"
        className={styles.rowMain}
        data-testid={testId(LANE_ROW_SELECT_TEST_ID, laneId)}
        aria-current={row.inPrimaryPane || row.inFollowerPane ? 'true' : undefined}
        onClick={() => onSelect(laneId)}
      >
        <span className={styles.agentType}>
          {row.agentType}
          {row.isMatriarch ? <span className={styles.srOnly}> (Matriarch, pinned to top)</span> : null}
        </span>

        {row.unreadEventCount > 0 ? (
          <span
            className={styles.unread}
            data-testid={TEST_IDS.laneRowUnread}
            data-unread-count={row.unreadEventCount}
          >
            <span aria-hidden="true">{row.unreadEventCount}</span>
            <span className={styles.srOnly}>{row.unreadEventCount} unread events</span>
          </span>
        ) : null}

        <span className={styles.description}>
          {row.description === null ? (
            <span className={styles.srOnly}>No description</span>
          ) : (
            row.description
          )}
        </span>

        <span className={styles.meta}>
          <span className={styles.status} data-status={row.status}>
            <span className={styles.dot} aria-hidden="true" />
            {LANE_STATUS_LABEL[row.status]}
          </span>
          <span>
            <span className={styles.srOnly}>Elapsed </span>
            {formatElapsed(row.elapsedMs)}
          </span>
          {row.awaitingPermission ? (
            <span className={styles.awaiting}>
              <span className={styles.awaitingDot} aria-hidden="true" />
              Awaiting permission
            </span>
          ) : null}
        </span>
      </button>

      {row.canPin ? (
        <button
          type="button"
          className={styles.pinAction}
          data-testid={TEST_IDS.laneRowPin}
          aria-pressed={row.inFollowerPane}
          onClick={() =>
            row.inFollowerPane ? onHideFollower?.(laneId) : onShowInFollower?.(laneId)
          }
        >
          <PinGlyph />
          <span className={styles.srOnly}>
            {row.inFollowerPane
              ? 'Close the second pane'
              : `Show ${row.agentType} in the second pane`}
          </span>
        </button>
      ) : null}

      {canSteer ? (
        <button
          type="button"
          className={styles.rowAction}
          data-testid={TEST_IDS.laneRowSteer}
          onClick={() => onSteer(laneId)}
        >
          Steer
        </button>
      ) : null}
    </li>
  );
}

export const LaneRow = memo(LaneRowImpl);
