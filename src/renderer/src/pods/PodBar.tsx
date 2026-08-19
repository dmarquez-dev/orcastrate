import { useRef, useState, type JSX } from 'react';

import type { PodId } from '@shared/contracts/events';
import { TEST_IDS, type PodBarProps } from '../contracts/renderer-view';
import a11y from '../shell/a11y.module.css';
import styles from './PodBar.module.css';
import { PodTab } from './PodTab';

/**
 * The Pod bar (spec 5.1). Presentational: it renders `tabs` IN THE ARRAY'S
 * ORDER and sorts nothing — the ordering guarantee is the state layer's
 * (`PodListView`, frozen `renderer-state.ts`).
 *
 * Reorder has two paths, because a pointer-only affordance fails the
 * accessibility floor:
 *   - drag and drop, and
 *   - `Ctrl`/`Cmd` + `ArrowLeft`/`ArrowRight` on a focused tab.
 * Both commit through the same `onReorder(orderedPodIds)` with the FULL list.
 */
export function PodBar({ tabs, onSelect, onReorder, onNewPod, onClose }: PodBarProps): JSX.Element {
  const listRef = useRef<HTMLUListElement>(null);
  const [draggingId, setDraggingId] = useState<PodId | null>(null);
  const [dropTargetId, setDropTargetId] = useState<PodId | null>(null);
  const [announcement, setAnnouncement] = useState('');

  const ids = tabs.map((tab) => tab.pod.id);

  function moveTo(from: number, to: number): PodId[] | null {
    if (from < 0 || to < 0 || from >= ids.length || to >= ids.length || from === to) return null;
    const next = ids.slice();
    const [moved] = next.splice(from, 1);
    if (moved === undefined) return null;
    next.splice(to, 0, moved);
    return next;
  }

  function commit(from: number, to: number): void {
    const next = moveTo(from, to);
    if (next === null) return;
    const title = tabs[from]?.pod.title ?? '';
    setAnnouncement(`Moved ${title} to position ${String(to + 1)} of ${String(next.length)}.`);
    onReorder(next);
  }

  function focusTabAt(index: number): void {
    const clamped = Math.max(0, Math.min(index, ids.length - 1));
    const target = listRef.current?.querySelector<HTMLButtonElement>(
      `[data-pod-tab-index="${String(clamped)}"]`,
    );
    target?.focus();
  }

  function endDrag(): void {
    setDraggingId(null);
    setDropTargetId(null);
  }

  return (
    <div className={styles.bar} data-testid={TEST_IDS.podBar}>
      <ul aria-label="Pods" className={styles.tabs} ref={listRef} role="list">
        {tabs.map((tab, index) => (
          <PodTab
            dragging={draggingId === tab.pod.id}
            dropTarget={dropTargetId === tab.pod.id && draggingId !== tab.pod.id}
            index={index}
            key={tab.pod.id}
            onClose={() => {
              onClose(tab.pod.id);
            }}
            onDragEnd={endDrag}
            onDragEnter={() => {
              setDropTargetId(tab.pod.id);
            }}
            onDragStart={() => {
              setDraggingId(tab.pod.id);
              setDropTargetId(tab.pod.id);
            }}
            onDrop={() => {
              const from = draggingId === null ? -1 : ids.indexOf(draggingId);
              endDrag();
              commit(from, index);
            }}
            onFocusSibling={(delta) => {
              focusTabAt(index + delta);
            }}
            onMove={(delta) => {
              const to = index + delta;
              commit(index, to);
              // Focus follows the tab the user just moved, so a second
              // keypress keeps moving the same Pod.
              if (to >= 0 && to < ids.length) window.requestAnimationFrame(() => { focusTabAt(to); });
            }}
            onSelect={() => {
              onSelect(tab.pod.id);
            }}
            tab={tab}
            total={tabs.length}
          />
        ))}
      </ul>

      <button
        aria-label="New Pod"
        className={styles.newPod}
        data-testid={TEST_IDS.newPodButton}
        onClick={onNewPod}
        type="button"
      >
        <span aria-hidden="true">+</span>
      </button>

      <span aria-live="polite" className={a11y.srOnly} role="status">
        {announcement}
      </span>
    </div>
  );
}
