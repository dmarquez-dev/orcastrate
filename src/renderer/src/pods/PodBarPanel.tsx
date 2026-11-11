import { useEffect, useRef, useState, type JSX } from 'react';

import type { PodId } from '@shared/contracts/events';
import type { ActionResult, PodTabVm } from '../contracts/renderer-state';
import { PodBar } from './PodBar';
import styles from './PodBarPanel.module.css';

export interface PodBarPanelProps {
  /** Server order, straight from `PodListView.value`. */
  tabs: PodTabVm[];
  onSelect(podId: PodId): void;
  onClose(podId: PodId): void;
  /** Start the Pod's process; the connector picks open vs. reconnect. */
  onOpen(podId: PodId): void;
  /** Ask for the delete confirmation; the connector owns the dialog. */
  onDelete(podId: PodId): void;
  /** Fork the Pod; the connector owns the call, its busy state and its error. */
  onFork(podId: PodId): void;
  /** Pods with a fork in flight, so their Fork controls report busy. */
  forkingPodIds: ReadonlySet<PodId>;
  onNewPod(): void;
  /**
   * Commits a reorder. Resolves and never rejects (frozen `renderer-state.ts`),
   * so there is no `catch` here by design. The caller reports the outcome; the
   * panel only reads `settled` to drop its optimistic order.
   */
  reorderPods(orderedPodIds: PodId[]): Promise<ActionResult<void>>;
}

/**
 * Holds the OPTIMISTIC tab order across a reorder round trip, and drops it the
 * moment the call settles.
 *
 * That is the whole revert story, and it is deterministic: on failure the
 * optimistic order is discarded and `tabs` — which the state layer has by then
 * refetched — is what renders, so the bar cannot keep an order the main
 * process rejected. It does not depend on the `tabs` array changing identity.
 *
 * It renders no message of its own: `PodsChrome`, which hands `reorderPods`
 * down, raises the outcome in the notification region.
 */
export function PodBarPanel({
  tabs,
  onSelect,
  onClose,
  onOpen,
  onDelete,
  onFork,
  forkingPodIds,
  onNewPod,
  reorderPods,
}: PodBarPanelProps): JSX.Element {
  const [optimisticIds, setOptimisticIds] = useState<PodId[] | null>(null);
  const generation = useRef(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const byId = new Map(tabs.map((tab) => [tab.pod.id, tab]));
  const optimisticTabs =
    optimisticIds === null || optimisticIds.length !== tabs.length
      ? null
      : optimisticIds.map((id) => byId.get(id));

  const ordered: PodTabVm[] =
    optimisticTabs !== null && optimisticTabs.every((tab) => tab !== undefined)
      ? (optimisticTabs as PodTabVm[])
      : tabs;

  function handleReorder(orderedPodIds: PodId[]): void {
    const ticket = ++generation.current;
    setOptimisticIds(orderedPodIds);

    void reorderPods(orderedPodIds).then(() => {
      if (!mounted.current || ticket !== generation.current) return;
      // Success or failure alike: `tabs` is now the order to show.
      setOptimisticIds(null);
    });
  }

  return (
    <div className={styles.panel}>
      <PodBar
        onClose={onClose}
        forkingPodIds={forkingPodIds}
        onDelete={onDelete}
        onFork={onFork}
        onNewPod={onNewPod}
        onOpen={onOpen}
        onReorder={handleReorder}
        onSelect={onSelect}
        tabs={ordered}
      />
    </div>
  );
}
