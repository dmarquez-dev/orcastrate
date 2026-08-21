import { useEffect, useRef, type CSSProperties, type DragEvent, type JSX, type KeyboardEvent } from 'react';

import type { PodStatus } from '@shared/contracts/events';
import type { PodTabVm } from '../contracts/renderer-state';
import { BYPASS_PERMISSIONS_WARNING, TEST_IDS } from '../contracts/renderer-view';
import { statusToken, testId } from '../shell/contract-runtime';
import a11y from '../shell/a11y.module.css';
import { runControlFor } from './run-control';
import styles from './PodBar.module.css';

/*
 * The three icon glyphs. This app draws its icons as characters — `+` on New
 * Pod, `−` on a removed env row, `BYPASS` on the bypass chip — and has no SVG
 * anywhere, so a glyph is the convention rather than a shortcut. Each rides in
 * an `aria-hidden` span with a `data-icon` attribute: the name is what a screen
 * reader gets, `data-icon` is what a test asserts the SHAPE by, and neither is
 * a colour.
 */
const PLAY = '▶';
const PAUSE = '❚❚';
const CROSS = '×';

/** Status in words. Colour is never the only carrier of meaning. */
const STATUS_LABEL: Readonly<Record<PodStatus, string>> = {
  idle: 'Idle',
  running: 'Running',
  waiting: 'Waiting on you',
  beached: 'Beached, process stopped',
  // Literal, per design §2: a routine steady state is not themed. It reads
  // correctly beside `Idle` — `Idle` is open and between turns, `Closed` is
  // no process at all — and it is what makes the dot's colour a secondary
  // signal rather than the message.
  closed: 'Closed',
};

/**
 * The RUN mode of the run/stop control, suffixed with the PodId:
 * `pod-tab-open:<podId>`. Present only while `opened` is false.
 *
 * NOT in the frozen `TEST_IDS`, deliberately. That object's own note allows an
 * id a component adds for its internal use as long as it does not collide, and
 * `pod-tab-open` collides with nothing (`pod-tab:` and `pod-tab-permission:` /
 * `pod-tab-bypass:` are all anchored on their own colon). Adding it to the
 * contract would be a contract change, which is out of scope here.
 *
 * ONE id covers both verbs — Open and Reconnect — so "no run control is
 * reachable for an opened Pod" is a single query rather than two.
 */
export const POD_TAB_OPEN_TEST_ID = 'pod-tab-open';

/**
 * The STOP mode of the same control: `pod-tab-stop:<podId>`, present only while
 * `opened` is true. One control, two mutually exclusive modes — a Pod is never
 * both runnable and stoppable — so the id names the meaning the control
 * currently has rather than leaving a suite to infer it from the Pod's state.
 */
export const POD_TAB_STOP_TEST_ID = 'pod-tab-stop';

/**
 * The DELETE control: `pod-tab-delete:<podId>`. A SEPARATE control from
 * run/stop, present only while `opened` is false.
 *
 * It is absent — not disabled — for a running Pod, because a Pod with a live
 * process must not be one click from deletion, and a disabled control is still
 * a control a user can land on, read, and misjudge.
 */
export const POD_TAB_DELETE_TEST_ID = 'pod-tab-delete';

export interface PodTabProps {
  tab: PodTabVm;
  index: number;
  total: number;
  dragging: boolean;
  dropTarget: boolean;
  onSelect(): void;
  /** STOPS the process. The row and the transcript survive, so it is "Stop". */
  onClose(): void;
  /**
   * Starts the Pod's process. The parent decides whether that is `openPod` or
   * `reconnectPod`; this component only decides whether to OFFER the control
   * and what to call it, both through `runControlFor`.
   */
  onOpen(): void;
  /**
   * Opens the DELETE CONFIRMATION. It does not delete anything — no component
   * below `PodsChrome` reaches `deletePod`, and the confirmation is the only
   * route to it.
   */
  onDelete(): void;
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
 * that carries `pod-tab:<podId>`; the run/stop and delete controls are siblings
 * rather than buttons nested inside a button.
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
  onDelete,
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
   * TWO CONTROLS, NOT ONE CONTROL WITH TWO MEANINGS.
   *
   *   run/stop   ALWAYS present. PLAY when the Pod has no process, PAUSE when
   *              it has one. A listed Pod with no live process needs somewhere
   *              to start one, or its composer stays disabled with no way out
   *              — which is every Pod after a restart, since `pods.list`
   *              restores rows and nothing else.
   *   delete     Present ONLY when the Pod has no process. A running Pod must
   *              not be one click from deletion, so it is absent rather than
   *              disabled.
   *
   * `opened` is the state layer's single derivation (`PodTabVm`), and
   * `'beached'` is one of the two statuses it reports false for, so `!opened`
   * already covers the beached case and no second predicate is needed here.
   * WHICH verb the run control offers is `runControlFor`'s decision alone.
   */
  const run = runControlFor(status, pod.title);
  const showDeleteControl = !opened;

  const tabRef = useRef<HTMLButtonElement>(null);
  const runRef = useRef<HTMLButtonElement>(null);
  const hadDeleteControl = useRef(showDeleteControl);

  /*
   * The delete control unmounts the moment the Pod opens, which strands
   * keyboard focus on `document.body`. Focus then moves to the run/stop control
   * — the element immediately before it in the row, and the one the user was
   * about to reach anyway. If focus had already moved somewhere else it is left
   * alone.
   *
   * THE RUN/STOP CONTROL NEEDS NO SUCH RESCUE, because it never unmounts: it is
   * ONE element whose mode changes, so a user focused on Open is still focused
   * on the same button when it becomes Stop.
   */
  useEffect(() => {
    const had = hadDeleteControl.current;
    hadDeleteControl.current = showDeleteControl;
    if (!had || showDeleteControl) return;
    if (document.activeElement !== null && document.activeElement !== document.body) return;
    (runRef.current ?? tabRef.current)?.focus();
  }, [showDeleteControl]);

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

      {/*
        ONE ELEMENT, TWO MODES. Rendering the two modes as a single button is
        not a saving: it is what keeps a keyboard user's focus in place when the
        Pod starts or stops under them, and it is why the run/stop control needs
        no focus rescue while the delete control does.

        "Stop", not "Close": the Pod row and its transcript survive, and a name
        that said Close would describe closing the tab. PAUSE rather than a
        square because reopening RESUMES the conversation. PLAY for BOTH run
        verbs — the icon says "this will run", and which verb, and why, is
        carried by the accessible name.
      */}
      <button
        aria-label={opened ? `Stop ${pod.title}` : run.accessibleName}
        className={styles.runControl}
        data-testid={testId(opened ? POD_TAB_STOP_TEST_ID : POD_TAB_OPEN_TEST_ID, pod.id)}
        data-verb={opened ? 'stop' : run.verb}
        onClick={opened ? onClose : onOpen}
        ref={runRef}
        type="button"
      >
        <span aria-hidden="true" data-icon={opened ? 'pause' : 'play'}>
          {opened ? PAUSE : PLAY}
        </span>
      </button>

      {showDeleteControl ? (
        <button
          // Red, AND its own icon shape, AND its own name. Colour is never the
          // only carrier: a user who cannot see that this is red still reads
          // "Delete Alpha" and still sees a glyph that is not the run control's.
          aria-label={`Delete ${pod.title}`}
          className={styles.deleteControl}
          data-testid={testId(POD_TAB_DELETE_TEST_ID, pod.id)}
          onClick={onDelete}
          type="button"
        >
          <span aria-hidden="true" data-icon="delete">
            {CROSS}
          </span>
        </button>
      ) : null}
    </li>
  );
}
