/**
 * Focus after a row is added or removed.
 *
 * ACCESSIBILITY FLOOR: "focus moves predictably after an action that changes
 * what is on screen." Adding a row and having focus stay on the Add button
 * means a keyboard user has to tab back into the list to type the thing they
 * just asked for; removing a row and having focus fall to `<body>` means they
 * lose their place entirely. Both editors in this directory share this hook so
 * they cannot drift into two different answers.
 *
 * WHY IT READS THE DOM RATHER THAN HOLDING REFS PER ROW: the rows are derived
 * from the draft on every render and are keyed by position, so a per-row ref
 * map would need the same bookkeeping the derivation exists to avoid. One
 * query against `data-row-index` after the render that changed the list is the
 * whole mechanism.
 */

import { useCallback, useLayoutEffect, useRef } from 'react';

interface FocusRequest {
  row: number;
  cell: number;
}

export interface RowFocus {
  /** Put on the element wrapping the rows. */
  listRef: (node: HTMLElement | null) => void;
  /** Put on the Add button — where focus lands when no row remains. */
  fallbackRef: (node: HTMLElement | null) => void;
  /** Focus the `cell`-th control of row `row` after the next render. */
  focusRow(row: number, cell?: number): void;
  /** Focus the nearest remaining row after removing `row`, else the fallback. */
  focusAfterRemove(row: number, remaining: number): void;
}

export function useRowFocus(): RowFocus {
  const list = useRef<HTMLElement | null>(null);
  const fallback = useRef<HTMLElement | null>(null);
  const pending = useRef<FocusRequest | null>(null);

  useLayoutEffect(() => {
    const request = pending.current;
    if (request === null) return;
    pending.current = null;

    const container = list.current;
    const row =
      container === null
        ? null
        : container.querySelector(`[data-row-index="${String(request.row)}"]`);
    const controls =
      row === null ? [] : [...row.querySelectorAll<HTMLElement>('input, textarea, button')];
    const target = controls[request.cell] ?? fallback.current;
    target?.focus();
  });

  const focusRow = useCallback((row: number, cell = 0) => {
    pending.current = { row, cell };
  }, []);

  const focusAfterRemove = useCallback(
    (row: number, remaining: number) => {
      // The row that slid into this position, or the last one left, or — when
      // the list is now empty — the Add button that is still on screen.
      pending.current = remaining === 0 ? { row: -1, cell: 0 } : { row: Math.min(row, remaining - 1), cell: 0 };
    },
    [],
  );

  const listRef = useCallback((node: HTMLElement | null) => {
    list.current = node;
  }, []);

  const fallbackRef = useCallback((node: HTMLElement | null) => {
    fallback.current = node;
  }, []);

  return { listRef, fallbackRef, focusRow, focusAfterRemove };
}
