import { useEffect, useRef, type CSSProperties, type DragEvent, type JSX, type KeyboardEvent } from 'react';

import type { PodStatus } from '@shared/contracts/events';
import type { PodTabVm } from '../contracts/renderer-state';
import { BYPASS_PERMISSIONS_WARNING, TEST_IDS } from '../contracts/renderer-view';
import { statusToken, testId } from '../shell/contract-runtime';
import a11y from '../shell/a11y.module.css';
import styles from './PodBar.module.css';

/** Status in words. Colour is never the only carrier of meaning. */
const STATUS_LABEL: Readonly<Record<PodStatus, string>> = {
  idle: 'Idle',
  running: 'Running',
  waiting: 'Waiting on you',
  beached: 'Beached, process stopped',
};

/**
 * The run-control's `data-testid` base, suffixed with the PodId:
 * `pod-tab-open:<podId>`.
 *
 * NOT in the frozen `TEST_IDS`, deliberately. That object's own note allows an
 * id a component adds for its internal use as long as it does not collide, and
 * `pod-tab-open` collides with nothing (`pod-tab:` and `pod-tab-permission:` /
 * `pod-tab-bypass:` are all anchored on their own colon). Adding it to the
 * contract would be a contract change, which is out of scope here.
 *
 * ONE id covers both modes — Open and Reconnect — so "no run control is
 * reachable for an opened Pod" is a single query rather than two.
 */
export const POD_TAB_OPEN_TEST_ID = 'pod-tab-open';

export interface PodTabProps {
  tab: PodTabVm;
  index: number;
  total: number;
  dragging: boolean;
  dropTarget: boolean;
  onSelect(): void;
  onClose(): void;
  /**
   * Starts the Pod's process. The parent decides whether that is `openPod` or
   * `reconnectPod`; this component only decides whether to OFFER the control
   * and what to call it.
   */
  onOpen(): void;
  /** Keyboard reorder. `delta` is -1 or +1; the bar clamps. */
  onMove(delta: number): void;
  /** Roving focus between tabs, for the unmodified arrow keys. */
  onFocusSibling(delta: number): void;
  onDragStart(): void;
  onDragEnter(): void;
  onDrop(): void;
  onDragEnd(): void;
}

/**
 * One Pod bar tab.
 *
 * The tab itself is the `<button>` that selects the Pod, so it is the element
 * that carries `pod-tab:<podId>`; Close is a sibling control rather than a
 * button nested inside a button.
 */
export function PodTab({
  tab,
  index,
  total,
  dragging,
  dropTarget,
  onSelect,
  onClose,
  onOpen,
  onMove,
  onFocusSibling,
  onDragStart,
  onDragEnter,
  onDrop,
  onDragEnd,
}: PodTabProps): JSX.Element {
  const { pod, active, opened, status, awaitingPermission, pendingPermissionCount, unreadEventCount } =
    tab;
  const bypass = pod.permissionMode === 'bypassPermissions';

  /*
   * A listed Pod with no live process needs somewhere to start one, or its
   * composer stays disabled with no way out — which is exactly what happens to
   * every Pod after a restart, since `pods.list` restores rows and nothing
   * else. Beached is the same predicament reached from the other direction, so
   * it gets the same slot with the verb the state layer actually needs
   * (`reconnectPod`); the word is never the only difference, because the
   * status line above already says "Beached, process stopped".
   */
  const beached = status === 'beached';
  const showRunControl = beached || !opened;
  const runLabel = beached ? 'Reconnect' : 'Open';

  const tabRef = useRef<HTMLButtonElement>(null);
  const hadRunControl = useRef(showRunControl);

  /*
   * The run control unmounts the moment the Pod opens, which strands keyboard
   * focus on `document.body`. Focus then moves to the tab the user was
   * operating — predictable, and adjacent to where the control stood. If focus
   * had already moved somewhere else it is left alone.
   */
  useEffect(() => {
    const had = hadRunControl.current;
    hadRunControl.current = showRunControl;
    if (!had || showRunControl) return;
    if (document.activeElement !== null && document.activeElement !== document.body) return;
    tabRef.current?.focus();
  }, [showRunControl]);

  const itemClass = [
    styles.tabItem,
    active ? styles.tabItemActive : '',
    dragging ? styles.tabItemDragging : '',
    dropTarget ? styles.tabItemDropTarget : '',
  ]
    .filter(Boolean)
    .join(' ');

  const tabClass = [styles.tab, active ? styles.tabActive : '', opened ? '' : styles.tabClosed]
    .filter(Boolean)
    .join(' ');

  // A genuinely dynamic value a static class cannot carry: the status hue is
  // chosen by `statusToken(status)` at render time (frozen `renderer-theme.ts`).
  const dotStyle = { '--pod-status-color': `var(${statusToken(status)})` } as CSSProperties;

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>): void {
    const reorder = event.ctrlKey || event.metaKey;
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      if (reorder) onMove(-1);
      else onFocusSibling(-1);
      return;
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      if (reorder) onMove(1);
      else onFocusSibling(1);
    }
  }

  function handleDragOver(event: DragEvent<HTMLButtonElement>): void {
    // Without this the browser refuses the drop.
    event.preventDefault();
  }

  return (
    <li className={itemClass}>
      <button
        aria-current={active ? 'true' : undefined}
        aria-keyshortcuts="Control+ArrowLeft Control+ArrowRight"
        className={tabClass}
        data-pod-tab-index={index}
        data-testid={testId(TEST_IDS.podTab, pod.id)}
        draggable
        onClick={onSelect}
        onDragEnd={onDragEnd}
        onDragEnter={onDragEnter}
        onDragOver={handleDragOver}
        onDragStart={onDragStart}
        onDrop={onDrop}
        onKeyDown={handleKeyDown}
        ref={tabRef}
        type="button"
      >
        <span className={styles.statusDot} data-status={status} style={dotStyle} />
        <span className={a11y.srOnly}>
          {`${STATUS_LABEL[status]}.${opened ? '' : ' Not opened.'} Pod ${index + 1} of ${total}.`}
        </span>
        <span className={styles.title}>{pod.title}</span>

        {awaitingPermission ? (
          <span
            aria-label={`Waiting for your permission decision: ${String(pendingPermissionCount)} pending`}
            className={styles.permissionBadge}
            data-testid={testId(TEST_IDS.podTabPermissionBadge, pod.id)}
            role="img"
          >
            <span className={a11y.srOnly}>
              {`Waiting for your permission decision: ${String(pendingPermissionCount)} pending`}
            </span>
          </span>
        ) : null}

        {bypass ? (
          <span
            aria-label={BYPASS_PERMISSIONS_WARNING}
            className={styles.bypassBadge}
            data-testid={testId(TEST_IDS.podTabBypassBadge, pod.id)}
            role="img"
            title={BYPASS_PERMISSIONS_WARNING}
          >
            <span className={a11y.srOnly}>{BYPASS_PERMISSIONS_WARNING}</span>
          </span>
        ) : null}

        {unreadEventCount > 0 ? (
          <span className={styles.unread}>
            {unreadEventCount}
            <span className={a11y.srOnly}> unread events</span>
          </span>
        ) : null}
      </button>

      {showRunControl ? (
        <button
          aria-label={`${runLabel} ${pod.title}`}
          className={styles.runControl}
          data-testid={testId(POD_TAB_OPEN_TEST_ID, pod.id)}
          onClick={onOpen}
          type="button"
        >
          {runLabel}
        </button>
      ) : null}

      <button
        aria-label={`Close ${pod.title}`}
        className={styles.close}
        onClick={onClose}
        type="button"
      >
        <span aria-hidden="true">&times;</span>
      </button>
    </li>
  );
}
