import { useId, type JSX } from 'react';

import type { BeachcomberTrashResult } from '@shared/contracts/beachcomber';
import { PANEL_TEST_IDS } from '../contracts/renderer-panels';
import { BeachcomberRefusals } from './BeachcomberRefusals';
import { BEACHCOMBER_LOCAL_TEST_IDS, COPY } from './copy';
import { formatCount } from './format';
import styles from './Beachcomber.module.css';

export interface BeachcomberResultProps {
  result: BeachcomberTrashResult;
}

/**
 * BOTH HALVES OF WHAT HAPPENED. A PARTIAL SUCCESS MUST NOT READ AS A SUCCESS.
 *
 * Partial success is the normal case, not an error (`beachcomber.ts`): trashing
 * eleven directories where the fourth is locked by another process really did
 * move seven things to the recycle bin, and the user has to be told which four
 * are still on disk — with the OS's own message, verbatim, because "could not
 * delete" is not something anyone can act on.
 */
export function BeachcomberResult({ result }: BeachcomberResultProps): JSX.Element {
  const headingId = useId();
  const refusedHeadingId = useId();
  const failed = result.failed;

  const summary =
    failed.length === 0
      ? `Moved ${formatCount(result.trashed.length, 'item', 'items')} to the recycle bin.`
      : `Moved ${formatCount(result.trashed.length, 'item', 'items')} to the recycle bin. ` +
        `${formatCount(failed.length, 'item', 'items')} could not be moved and ${
          failed.length === 1 ? 'is' : 'are'
        } still on disk.`;

  return (
    <section
      aria-labelledby={headingId}
      className={styles.result}
      data-testid={PANEL_TEST_IDS.beachcomberResult}
    >
      <h3 className={styles.resultHeading} id={headingId}>
        {COPY.resultHeading}
      </h3>
      <p
        className={styles.resultSummary}
        data-testid={BEACHCOMBER_LOCAL_TEST_IDS.resultSummary}
        role="status"
      >
        {summary}
      </p>

      {failed.length === 0 ? null : (
        <>
          <h4 className={styles.resultSubheading}>{COPY.resultFailuresHeading}</h4>
          <ul className={styles.resultFailures}>
            {failed.map((failure) => (
              <li className={styles.resultFailure} key={failure.id}>
                <span className={styles.resultFailurePath}>{failure.displayPath}</span>
                <span
                  className={styles.resultFailureMessage}
                  data-testid={PANEL_TEST_IDS.beachcomberResultFailure}
                >
                  {failure.message}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      <BeachcomberRefusals
        heading={COPY.resultRefusedHeading}
        headingId={refusedHeadingId}
        listTestId={`${PANEL_TEST_IDS.beachcomberResult}-refused`}
        refused={result.refused}
      />
    </section>
  );
}
