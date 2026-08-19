/**
 * The permission cards for ONE lane, rendered inline at the end of that lane's
 * event stream. T6's transcript renders this through its `permissionSlot` prop
 * and knows nothing about what is inside it; this component knows nothing about
 * the transcript.
 *
 * It is a list, in document flow. No portal, no overlay, no dialog role, no
 * focus trap — see the note at the top of `PermissionCards.module.css`.
 */

import type { JSX } from 'react';

import type { PermissionCardVm } from '../contracts/renderer-state';
import type { PermissionCardListProps } from '../contracts/renderer-view';

import { PermissionCard } from './PermissionCard';
import styles from './PermissionCards.module.css';

/**
 * Oldest first. The state layer already guarantees that order; sorting a copy
 * here costs nothing and means the rendered order is a property of this
 * component rather than of an upstream promise. `receivedAt` is an ISO
 * `Timestamp`, so lexicographic order is chronological order; `requestId`
 * breaks a tie so the sort is total and stable.
 */
export function orderCards(cards: readonly PermissionCardVm[]): PermissionCardVm[] {
  return [...cards].sort((a, b) => {
    if (a.receivedAt !== b.receivedAt) return a.receivedAt < b.receivedAt ? -1 : 1;
    if (a.requestId === b.requestId) return 0;
    return a.requestId < b.requestId ? -1 : 1;
  });
}

export function PermissionCardList({ cards, onRespond }: PermissionCardListProps): JSX.Element | null {
  if (cards.length === 0) return null;

  const ordered = orderCards(cards);

  return (
    <section aria-label="Permission requests" aria-live="polite" data-testid="permission-card-list">
      <ul className={styles.list}>
        {ordered.map((card) => (
          // Keyed by requestId: a card resolving out of order does not remount
          // its siblings, so a half-typed deny reason in another card survives.
          <PermissionCard key={card.requestId} card={card} onRespond={onRespond} />
        ))}
      </ul>
    </section>
  );
}
