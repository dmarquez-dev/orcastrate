import type { JSX } from 'react';

import type { BeachcomberPreviewRefusal } from '@shared/contracts/beachcomber';
import styles from './Beachcomber.module.css';

export interface BeachcomberRefusalsProps {
  refused: readonly BeachcomberPreviewRefusal[];
  heading: string;
  headingId: string;
  listTestId: string;
}

/**
 * What main will NOT act on, and why.
 *
 * A refusal is not an error: the preview's whole job is to say no BEFORE the
 * confirm button, so the trash step never has to surprise anyone. The same
 * component serves the preview and the result, because the two lists mean the
 * same thing and phrasing them differently would suggest they do not.
 *
 * Each refusal names its entry: the path sits in its own element and the
 * reason beside it, as in the result's failure rows, so neither is a fragment
 * of the other's text.
 */
export function BeachcomberRefusals({
  refused,
  heading,
  headingId,
  listTestId,
}: BeachcomberRefusalsProps): JSX.Element | null {
  if (refused.length === 0) return null;

  return (
    <section aria-labelledby={headingId} className={styles.refusals} data-testid={listTestId}>
      <h4 className={styles.refusalsHeading} id={headingId}>
        {heading}
      </h4>
      <ul className={styles.refusalList}>
        {refused.map((refusal) => (
          <li className={styles.refusal} key={refusal.id}>
            <span className={styles.refusalPath}>{refusal.displayPath}</span>
            <span className={styles.refusalReason}>{refusal.reason}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
