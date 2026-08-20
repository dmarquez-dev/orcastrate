import type { JSX } from 'react';

import type { IpcError } from '@shared/contracts/ipc';
import { PANEL_TEST_IDS } from '../contracts/renderer-panels';
import styles from './Beachcomber.module.css';

export interface BeachcomberErrorProps {
  /** `Loadable.error` — non-null IF AND ONLY IF the scan itself failed. */
  error: IpcError | null;
  /** `BeachcomberView.actionError` — set by a failed action while the panel is
   * still `ready`. Two fields, two meanings; see `renderer-panels.ts` E5. */
  actionError: string | null;
}

/**
 * THE REASON `beachcomber:scan`, `beachcomber:preview` AND `beachcomber:trash`
 * ARE NOT ON THE SURFACE-LESS ALLOWLIST. Every failure of all three lands here,
 * verbatim, unconditionally. A cleanup panel that silently does nothing when it
 * cannot read or cannot delete is this feature's worst failure mode.
 */
export function BeachcomberError({ error, actionError }: BeachcomberErrorProps): JSX.Element | null {
  const messages: string[] = [];
  if (error !== null) messages.push(error.message);
  // A failed scan sets both fields to the same sentence. Saying it twice would
  // read as two separate failures — and would break any `getByText` on it.
  if (actionError !== null && actionError !== error?.message) messages.push(actionError);
  if (messages.length === 0) return null;

  return (
    <div className={styles.error} data-testid={PANEL_TEST_IDS.beachcomberError} role="alert">
      {messages.map((message) => (
        <p className={styles.errorLine} key={message}>
          {message}
        </p>
      ))}
    </div>
  );
}
