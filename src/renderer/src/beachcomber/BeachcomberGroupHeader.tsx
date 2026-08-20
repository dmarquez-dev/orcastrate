import { useEffect, useRef, type JSX } from 'react';

import type { BeachcomberRootKey } from '@shared/contracts/beachcomber';
import { PANEL_TEST_IDS, type BeachcomberGroupVm } from '../contracts/renderer-panels';
import { formatBytes, formatCount } from './format';
import styles from './Beachcomber.module.css';

export interface BeachcomberGroupHeaderProps {
  group: BeachcomberGroupVm;
  headingId: string;
  toggleId: string;
  onToggleGroup(root: BeachcomberRootKey): void;
}

/**
 * One root's heading line: what it is, where it lives, how much is in it, and
 * the select-all for it.
 *
 * `heading` and `displayPath` are READ OFF THE VIEW MODEL and never
 * reconstructed here. Two sources of that copy would drift, and the path in
 * particular is prose the renderer must not compose.
 *
 * The toggle reflects only SELECTABLE rows: it is checked when every one of
 * them is selected, indeterminate when some are, and disabled when the group
 * has none — because `toggleGroup` skips blocked rows, and a control that
 * claims to select everything and then does not is a lie about a delete.
 */
export function BeachcomberGroupHeader({
  group,
  headingId,
  toggleId,
  onToggleGroup,
}: BeachcomberGroupHeaderProps): JSX.Element {
  const selectable = group.rows.filter((row) => row.blockedReason === null);
  const selectedCount = selectable.filter((row) => row.selected).length;
  const allSelected = selectable.length > 0 && selectedCount === selectable.length;
  const someSelected = selectedCount > 0 && !allSelected;

  const toggleRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    // `indeterminate` is a DOM property with no attribute, so it cannot be
    // expressed in JSX. `aria-checked="mixed"` below is what assistive tech
    // reads; this is what the pixels show.
    if (toggleRef.current !== null) toggleRef.current.indeterminate = someSelected;
  }, [someSelected]);

  return (
    <div className={styles.groupHeader}>
      <div className={styles.groupToggle}>
        <input
          aria-checked={someSelected ? 'mixed' : undefined}
          checked={allSelected}
          data-testid={PANEL_TEST_IDS.beachcomberGroupToggle}
          disabled={selectable.length === 0}
          id={toggleId}
          onChange={() => {
            onToggleGroup(group.root);
          }}
          ref={toggleRef}
          type="checkbox"
        />
        <label className={styles.groupToggleLabel} htmlFor={toggleId}>
          {`Select all in ${group.heading}`}
        </label>
      </div>

      <h3 className={styles.groupHeading} id={headingId}>
        {group.heading}
      </h3>
      <p className={styles.groupPath}>{group.displayPath}</p>
      <p className={styles.groupFacts}>
        {`${formatCount(group.rows.length, 'entry', 'entries')} · ${formatBytes(group.totalBytes)}`}
      </p>

      {group.error === null ? null : (
        <p
          className={styles.groupError}
          data-testid={PANEL_TEST_IDS.beachcomberGroupError}
          role="alert"
        >
          {group.error}
        </p>
      )}
    </div>
  );
}
