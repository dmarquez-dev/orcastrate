import { useId, type JSX } from 'react';

import type { BeachcomberEntryId, BeachcomberRootKey } from '@shared/contracts/beachcomber';
import { PANEL_TEST_IDS, type BeachcomberGroupVm } from '../contracts/renderer-panels';
import { testId } from '../shell/contract-runtime';
import { BeachcomberGroupHeader } from './BeachcomberGroupHeader';
import { BeachcomberRow } from './BeachcomberRow';
import styles from './Beachcomber.module.css';

export interface BeachcomberGroupProps {
  group: BeachcomberGroupVm;
  onToggleRow(id: BeachcomberEntryId): void;
  onToggleGroup(root: BeachcomberRootKey): void;
}

/**
 * One root, as a labelled section holding its header and its rows. It arranges;
 * every word on screen comes from one of the two components it composes.
 *
 * A GROUP THAT COULD NOT BE READ STILL RENDERS ITS ROWS. The error belongs to
 * the root, not to the entries the scan did manage to enumerate, and one
 * unreadable root must not cost the user the rest of the panel.
 */
export function BeachcomberGroup({
  group,
  onToggleRow,
  onToggleGroup,
}: BeachcomberGroupProps): JSX.Element {
  const headingId = useId();
  const toggleId = useId();

  return (
    <section
      aria-labelledby={headingId}
      className={styles.group}
      data-testid={testId(PANEL_TEST_IDS.beachcomberGroup, group.root)}
    >
      <BeachcomberGroupHeader
        group={group}
        headingId={headingId}
        onToggleGroup={onToggleGroup}
        toggleId={toggleId}
      />
      <ul className={styles.rows}>
        {group.rows.map((row) => (
          <BeachcomberRow key={row.entry.id} onToggle={onToggleRow} row={row} />
        ))}
      </ul>
    </section>
  );
}
