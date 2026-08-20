import type { JSX } from 'react';

import { PANEL_DESCRIPTIONS, PANEL_LABELS } from '../contracts/renderer-panels';
import styles from './Beachcomber.module.css';

export interface BeachcomberHeaderProps {
  /** Owned by the panel, which is what the region is labelled by. */
  headingId: string;
}

/** The panel's title and one-line purpose. Both come from the frozen contract,
 * so the panel bar's button and this heading can never disagree. */
export function BeachcomberHeader({ headingId }: BeachcomberHeaderProps): JSX.Element {
  return (
    <header className={styles.header}>
      <h2 className={styles.heading} id={headingId}>
        {PANEL_LABELS.beachcomber}
      </h2>
      <p className={styles.description}>{PANEL_DESCRIPTIONS.beachcomber}</p>
    </header>
  );
}
