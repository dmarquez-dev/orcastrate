import { memo } from 'react';

import styles from './WorkingIndicator.module.css';

/**
 * A test id so both mount sites' suites can assert presence AND absence
 * without matching a class name. Rendered LITERALLY, with no suffix — the
 * enclosing row or tab disambiguates it, which is the pattern `laneRowUnread`
 * and `laneRowSteer` already use, so a suite reaches it with `within(row)`.
 *
 * Not in the frozen `TEST_IDS`: that object's own note permits an id a
 * component adds for its own use as long as it does not collide, and this one
 * collides with nothing.
 */
export const WORKING_INDICATOR_TEST_ID = 'working-indicator';

export interface WorkingIndicatorProps {
  /**
   * Whether work is in flight. The MOUNT SITE decides this from state it
   * already has; the component never derives it. `false` renders `null`.
   */
  active: boolean;
  /**
   * Visual weight. `'dot'` is the compact form for a dense surface; `'bar'` is
   * the wider form for a surface with room. Two named sizes, not a free
   * length, so the two mount sites cannot drift into two bespoke indicators.
   */
  size: 'dot' | 'bar';
}

/**
 * The status affordance for work in flight — the answer to "the only way that
 * I can tell the session isn't stalled is if something visual like a new
 * subagent spawning occurs".
 *
 * NO TIMER, NO CLOCK, NO JS ANIMATION. The animation is a `@keyframes` rule in
 * this component's own stylesheet, applied by a class. Nothing here schedules
 * a frame, so a row whose work has finished renders this once — as `null` —
 * and the last lane ending leaves nothing ticking. The provider's single
 * `useElapsedClock(hasRunningLane)` stays the only clock in the renderer.
 *
 * PRESENTATIONAL. It takes data and nothing else: no store, no hook, no
 * context. It does not know whether it sits on a tab or in a rail row, which
 * is what lets two tasks mount it without coordinating.
 *
 * THE MOTION CARRIES NOTHING BY ITSELF. The element is `aria-hidden` and
 * contributes no accessible text; it is the third carrier of meaning, after
 * the status word and the status shape — the same rule colour answers to
 * everywhere else in this app. A mount site may therefore only place it where
 * the same state is ALREADY in text. It adds no `aria-live` region: an
 * announcement on every turn start would narrate the whole session.
 */
function WorkingIndicatorImpl({ active, size }: WorkingIndicatorProps) {
  if (!active) {
    return null;
  }

  return (
    <span
      className={`${styles.indicator} ${size === 'dot' ? styles.dot : styles.bar}`}
      data-testid={WORKING_INDICATOR_TEST_ID}
      data-size={size}
      aria-hidden="true"
    />
  );
}

export const WorkingIndicator = memo(WorkingIndicatorImpl);
