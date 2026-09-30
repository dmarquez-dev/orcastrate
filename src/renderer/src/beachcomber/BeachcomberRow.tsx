import { useId, type JSX } from 'react';

import type { BeachcomberEntryId } from '@shared/contracts/beachcomber';
import {
  PANEL_TEST_IDS,
  UNVERIFIED_PATH_NOTICE,
  type BeachcomberRowVm,
} from '../contracts/renderer-panels';
import { testId } from '../shell/contract-runtime';
import { COPY } from './copy';
import { formatBytes, formatCount, formatDay } from './format';
import styles from './Beachcomber.module.css';

export interface BeachcomberRowProps {
  row: BeachcomberRowVm;
  onToggle(id: BeachcomberEntryId): void;
}

/**
 * One directory, with the three things a user must not get wrong about it.
 *
 * 1. BLOCKED IS UNSELECTABLE, VISIBLY AND PROGRAMMATICALLY. The row carries
 *    `aria-disabled="true"`, the checkbox carries the real `disabled`
 *    attribute — so it answers neither a click nor a key, and is not in the tab
 *    order — and `blockedReason` states which Pod holds it and what to do. The
 *    state layer already refuses the selection; this is so the user is never
 *    invited to try. The state is carried by text and ARIA, never by color.
 *
 * 2. AN UNVERIFIED PATH IS LABELLED A GUESS BEFORE IT IS SHOWN, in the
 *    contract's own words, verbatim. `~/.claude/projects` directory names are
 *    lossy, so a decoded path IS a guess, and a guess shown as fact next to a
 *    delete button is how someone loses live state. The notice therefore
 *    renders above the path: a caveat read after the thing it qualifies is not
 *    a caveat.
 *
 * 3. AN UNVERIFIED ROW IS NEVER CALLED AN ORPHAN. `beachcomber.ts` guarantees
 *    `orphan` is only ever true for `session-record`; the second half of the
 *    condition below is belt and braces, because "this path does not exist" is
 *    unfalsifiable when the path itself is a guess.
 */
export function BeachcomberRow({ row, onToggle }: BeachcomberRowProps): JSX.Element {
  const { entry, selected, blockedReason } = row;
  const blocked = blockedReason !== null;
  const unverified = entry.pathSource === 'decoded-name';
  const orphan = entry.orphan && entry.pathSource === 'session-record';

  const selectId = useId();
  const blockedId = useId();
  const unverifiedId = useId();

  const describedBy = [blocked ? blockedId : null, unverified ? unverifiedId : null]
    .filter((value): value is string => value !== null)
    .join(' ');

  return (
    <li
      aria-disabled={blocked ? 'true' : undefined}
      className={blocked ? `${styles.row} ${styles.rowBlocked}` : styles.row}
      data-testid={testId(PANEL_TEST_IDS.beachcomberRow, entry.id)}
    >
      <div className={styles.rowSelect}>
        <input
          aria-describedby={describedBy === '' ? undefined : describedBy}
          aria-disabled={blocked ? 'true' : undefined}
          checked={selected}
          data-testid={PANEL_TEST_IDS.beachcomberRowSelect}
          disabled={blocked}
          id={selectId}
          onChange={() => {
            onToggle(entry.id);
          }}
          type="checkbox"
        />
        <label className={styles.rowSelectLabel} htmlFor={selectId}>
          {entry.name}
        </label>
      </div>

      {/*
        THE CAVEAT COMES FIRST. The notice precedes the path it qualifies, so a
        reader going top to bottom — and a screen reader doing the same — is
        told the path is a guess before meeting the guess. The wording is the
        contract's, verbatim; only the position is this component's choice. The
        marker label is a sibling, not a child, so the element carrying the test
        id holds the sentence and nothing else.
      */}
      {unverified ? (
        <div className={styles.marker}>
          <span className={styles.markerLabel}>{COPY.unverifiedHeading}</span>
          <span
            className={styles.rowUnverified}
            data-testid={PANEL_TEST_IDS.beachcomberRowUnverified}
            id={unverifiedId}
          >
            {UNVERIFIED_PATH_NOTICE}
          </span>
        </div>
      ) : null}

      <p className={styles.rowPath}>{entry.displayPath}</p>

      <p className={styles.rowFacts}>
        {[
          formatBytes(entry.sizeBytes),
          formatCount(entry.fileCount, 'file', 'files'),
          entry.sessionCount === null
            ? null
            : formatCount(entry.sessionCount, 'session', 'sessions'),
          `modified ${formatDay(entry.lastModified)}`,
        ]
          .filter((fact): fact is string => fact !== null)
          .join(' · ')}
      </p>

      {/*
        THE MARKER LABEL IS A SIBLING, NOT A CHILD. The sentence below is
        asserted verbatim, so the element carrying the test id holds the
        sentence and nothing else — a prefix inside it would make its
        `textContent` something no contract states.
      */}
      {blocked ? (
        <div className={styles.marker}>
          <span className={styles.markerLabel}>{COPY.blockedHeading}</span>
          <span
            className={styles.rowBlockedReason}
            data-testid={PANEL_TEST_IDS.beachcomberRowBlocked}
            id={blockedId}
          >
            {blockedReason}
          </span>
        </div>
      ) : null}

      {orphan ? (
        <div className={styles.marker}>
          <span className={styles.rowOrphan} data-testid={PANEL_TEST_IDS.beachcomberRowOrphan}>
            {COPY.orphanMarker}
          </span>
        </div>
      ) : null}
    </li>
  );
}
