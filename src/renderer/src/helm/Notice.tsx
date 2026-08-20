/**
 * One banner. Presentation only: it takes a tone, a heading and children, and
 * knows nothing about Helm.
 *
 * ACCESSIBILITY FLOOR, "colour is never the only carrier of meaning": the tone
 * decides a hue AND a mono glyph AND the heading word the caller passes, so a
 * user who cannot see the border colour still reads "Nothing was written" next
 * to a `!`. The glyph is `aria-hidden` because the heading already says it.
 */

import type { JSX, ReactNode } from 'react';

import { cx } from './cx';
import styles from './Helm.module.css';

export type NoticeTone = 'danger' | 'warning' | 'success' | 'info';

const MARKERS: Readonly<Record<NoticeTone, string>> = {
  danger: '!',
  warning: '?',
  success: '✓',
  info: 'i',
};

export interface NoticeProps {
  tone: NoticeTone;
  heading: string;
  testId: string;
  /** `alert` for anything the user did not ask for; `status` for the rest. */
  live?: 'alert' | 'status';
  children: ReactNode;
}

export function Notice({ tone, heading, testId, live, children }: NoticeProps): JSX.Element {
  return (
    <div
      className={cx(styles.notice, styles[tone])}
      data-testid={testId}
      role={live === undefined ? undefined : live}
    >
      <span aria-hidden="true" className={styles.marker}>
        {MARKERS[tone]}
      </span>
      <div className={styles.noticeBody}>
        <p className={styles.noticeHeading}>{heading}</p>
        {children}
      </div>
    </div>
  );
}
