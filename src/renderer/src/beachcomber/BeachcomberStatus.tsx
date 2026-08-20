import type { JSX } from 'react';

import type { LoadPhase } from '../contracts/renderer-state';
import { BEACHCOMBER_LOCAL_TEST_IDS, COPY } from './copy';
import styles from './Beachcomber.module.css';

export interface BeachcomberStatusProps {
  phase: LoadPhase;
  groupCount: number;
}

/**
 * Loading and empty, as words. The third state — error — is
 * `BeachcomberError`'s, and the three are mutually exclusive here: a scan in
 * flight says so, a finished scan with nothing in it says so, and a failed one
 * renders neither because its message is the thing to read.
 *
 * `idle` is folded into loading on purpose: the panel mounting is what issues
 * the scan, so a user never sees `idle` as a resting state.
 */
export function BeachcomberStatus({ phase, groupCount }: BeachcomberStatusProps): JSX.Element | null {
  if (phase === 'idle' || phase === 'loading') {
    return (
      <p
        className={styles.status}
        data-testid={BEACHCOMBER_LOCAL_TEST_IDS.loading}
        role="status"
      >
        {COPY.loading}
      </p>
    );
  }

  if (phase === 'ready' && groupCount === 0) {
    return (
      <p className={styles.status} data-testid={BEACHCOMBER_LOCAL_TEST_IDS.empty} role="status">
        {COPY.empty}
      </p>
    );
  }

  return null;
}
