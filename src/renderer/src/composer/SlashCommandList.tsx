/**
 * The slash-command suggestion list, rendered above the composer's textarea.
 *
 * Presentation only: a pure function of its props. It holds no state, decides
 * nothing about which rows match or which is selected, and reaches no state
 * layer or IPC bridge. The composer owns all of that and hands it in.
 *
 * Focus never leaves the textarea. The textarea points at this list through
 * `aria-controls` and at the selected row through `aria-activedescendant`,
 * which is why every row carries an id from `slashOptionId`. A press picks a
 * row on `mousedown` with the default prevented, so the press does not move
 * focus off the textarea before the pick lands.
 *
 * Each row shows `/` + `name` and, separately, `description`, and nothing
 * else a screen reader reads. The selected row is marked twice, by
 * `aria-selected` and by a visible marker hidden from assistive technology,
 * so colour is never the only carrier of which row Tab or Enter will take.
 */

import type { JSX, MouseEvent } from 'react';

import type { SlashCommandInfo } from '@shared/contracts/ipc';

import styles from './Composer.module.css';

export interface SlashCommandListProps {
  /** The rows to show, already matched and capped, in display order. */
  rows: readonly SlashCommandInfo[];
  /** Index into `rows` of the selected row. */
  selectedIndex: number;
  /** The listbox element's id. Each row's id is `slashOptionId(listboxId, index)`. */
  listboxId: string;
  /** Called with the row's index when the row is pressed. */
  onPick(index: number): void;
}

/** The id of row `index` in the listbox whose id is `listboxId`. */
export function slashOptionId(listboxId: string, index: number): string {
  return `${listboxId}-option-${index}`;
}

export function SlashCommandList({ rows, selectedIndex, listboxId, onPick }: SlashCommandListProps): JSX.Element {
  return (
    <ul className={styles.suggestions} id={listboxId} role="listbox" aria-label="Slash commands">
      {rows.map((row, index) => {
        const selected = index === selectedIndex;
        return (
          <li
            key={`${index}:${row.name}`}
            id={slashOptionId(listboxId, index)}
            className={selected ? `${styles.suggestion} ${styles.suggestionSelected}` : styles.suggestion}
            role="option"
            aria-selected={selected}
            onMouseDown={(event: MouseEvent<HTMLLIElement>) => {
              event.preventDefault();
              onPick(index);
            }}
          >
            {selected && (
              <span className={styles.suggestionMarker} aria-hidden="true">
                {'>'}
              </span>
            )}
            <span className={styles.suggestionName}>{`/${row.name}`}</span>
            <span className={styles.suggestionDescription}>{row.description}</span>
          </li>
        );
      })}
    </ul>
  );
}
