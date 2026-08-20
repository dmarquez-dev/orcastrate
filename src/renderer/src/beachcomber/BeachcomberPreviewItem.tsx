import type { JSX } from 'react';

import type { BeachcomberPreviewItem as PreviewItem } from '@shared/contracts/beachcomber';
import { PANEL_TEST_IDS } from '../contracts/renderer-panels';
import { testId } from '../shell/contract-runtime';
import { COPY } from './copy';
import { formatBytes, formatCount } from './format';
import styles from './BeachcomberPreviewDialog.module.css';

export interface BeachcomberPreviewItemProps {
  item: PreviewItem;
}

/**
 * One thing that is about to move to the recycle bin: where it is, how big it
 * is, how many files, and — the part that makes this a preview rather than a
 * receipt — a sample of the names inside it. A byte count tells a user nothing
 * about whether they are about to lose something they wanted.
 */
export function BeachcomberPreviewItem({ item }: BeachcomberPreviewItemProps): JSX.Element {
  return (
    <li
      className={styles.item}
      data-testid={testId(PANEL_TEST_IDS.beachcomberPreviewItem, item.id)}
    >
      <p className={styles.itemPath}>{item.displayPath}</p>
      <p className={styles.itemFacts}>
        {`${formatBytes(item.sizeBytes)} · ${formatCount(item.fileCount, 'file', 'files')}`}
      </p>
      {item.stale ? <p className={styles.itemStale}>{COPY.previewStale}</p> : null}
      {item.sampleNames.length === 0 ? null : (
        <>
          <p className={styles.itemSampleHeading}>{COPY.previewSampleHeading}</p>
          <ul className={styles.itemSamples}>
            {item.sampleNames.map((name) => (
              <li className={styles.itemSample} key={name}>
                {name}
              </li>
            ))}
          </ul>
        </>
      )}
    </li>
  );
}
