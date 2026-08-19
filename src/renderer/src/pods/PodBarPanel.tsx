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
  onNewPod(): void;
  /**
   * `WorkspaceActions.reorderPods`. Resolves and never rejects (frozen
   * `renderer-state.ts`), so there is no `catch` here by design.
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
 */
export function PodBarPanel({
  tabs,
  onSelect,
  onClose,
  onNewPod,
  reorderPods,
}: PodBarPanelProps): JSX.Element {
  const [optimisticIds, setOptimisticIds] = useState<PodId[] | null>(null);
  const [reorderError, setReorderError] = useState<string | null>(null);
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
    setReorderError(null);

    void reorderPods(orderedPodIds).then((result) => {
      if (!mounted.current || ticket !== generation.current) return;
      setOptimisticIds(null);
      setReorderError(result.ok ? null : result.error.message);
    });
  }

  return (
    <div className={styles.panel}>
      <PodBar
        onClose={onClose}
        onNewPod={onNewPod}
        onReorder={handleReorder}
        onSelect={onSelect}
        tabs={ordered}
      />
      {reorderError === null ? null : (
        <p className={styles.reorderError} role="alert">
          {reorderError}
        </p>
      )}
    </div>
  );
}
