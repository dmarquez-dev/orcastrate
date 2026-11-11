/**
 * The in-app notification region: the provider that owns the queue, the hook
 * that hands callers a `Notifier`, and the viewport the queue renders into.
 *
 * STATE OWNERSHIP. The queue is client interaction state and lives here alone,
 * never in the workspace store. Auto-dismiss timers are DERIVED from the queue
 * and the pause state by one effect (`syncTimers`), so no code path schedules a
 * timer by hand and a timer cannot outlive the item it belongs to.
 *
 * PAUSE AND RESUME. While the pointer is over the viewport or focus is within
 * it, every pending timer is stopped and keeps the time it had left; when both
 * have left, each resumes with that remainder. A keyed replacement starts its
 * item's timer again from the full `autoDismissMs`.
 *
 * FOCUS. `notify` and `dismiss` never move focus. Only the dismiss control
 * does: focus goes to the following item's control, else the preceding one's,
 * else the viewport (contract, "FOCUS AFTER A DISMISS-CONTROL ACTIVATION").
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type JSX,
} from 'react';

import { NotificationItem } from './NotificationItem';
import styles from './Notifications.module.css';
import {
  NOTIFICATION_TEST_IDS,
  type NotificationProviderProps,
  type NotificationRequest,
  type Notifier,
} from './types';

/** The app's lifetime for a transient notification (contract, `autoDismissMs`). */
const DEFAULT_AUTO_DISMISS_MS = 6000;

/** At most this many `'info'` + `'success'` notifications are live at once. */
const TRANSIENT_CAP = 3;

interface LiveNotification extends NotificationRequest {
  /** Provider-assigned identity; the React key and the timer key. */
  id: number;
  /** Bumped by a keyed replacement, so the derived timer restarts. */
  revision: number;
}

interface PendingTimer {
  revision: number;
  remainingMs: number;
  /** `null` while paused. */
  handle: ReturnType<typeof setTimeout> | null;
  startedAt: number;
}

const NotifierContext = createContext<Notifier | null>(null);

function isTransient(item: LiveNotification): boolean {
  return item.kind !== 'error';
}

/**
 * Removes the oldest transients beyond the cap, never `keep` (the item the
 * current call added or replaced) and never an error.
 */
function applyTransientCap(items: LiveNotification[], keep: number): LiveNotification[] {
  let excess = items.filter(isTransient).length - TRANSIENT_CAP;
  if (excess <= 0) return items;
  return items.filter((item) => {
    if (excess > 0 && isTransient(item) && item.id !== keep) {
      excess -= 1;
      return false;
    }
    return true;
  });
}

function addOrReplace(
  items: LiveNotification[],
  request: NotificationRequest,
  id: number,
): LiveNotification[] {
  const index =
    request.key === undefined ? -1 : items.findIndex((item) => item.key === request.key);
  const existing = index === -1 ? undefined : items[index];
  if (existing === undefined) {
    return applyTransientCap([...items, { ...request, id, revision: 0 }], id);
  }
  const next = [...items];
  next[index] = {
    ...existing,
    kind: request.kind,
    message: request.message,
    revision: existing.revision + 1,
  };
  return applyTransientCap(next, existing.id);
}

export function NotificationProvider({
  children,
  autoDismissMs = DEFAULT_AUTO_DISMISS_MS,
}: NotificationProviderProps): JSX.Element {
  const [items, setItems] = useState<LiveNotification[]>([]);
  const [pointerInside, setPointerInside] = useState(false);
  const [focusInside, setFocusInside] = useState(false);

  const nextId = useRef(0);
  const timers = useRef(new Map<number, PendingTimer>());
  const viewportRef = useRef<HTMLElement>(null);
  const dismissControls = useRef(new Map<number, HTMLButtonElement>());
  /** Where focus goes once the item a dismiss control removed has left the DOM. */
  const focusAfterRemoval = useRef<number | 'viewport' | null>(null);

  const remove = useCallback((id: number): void => {
    setItems((prev) => (prev.some((item) => item.id === id) ? prev.filter((item) => item.id !== id) : prev));
  }, []);

  const notifier = useMemo<Notifier>(
    () => ({
      notify(request) {
        nextId.current += 1;
        const id = nextId.current;
        setItems((prev) => addOrReplace(prev, request, id));
      },
      dismiss(key) {
        setItems((prev) =>
          prev.some((item) => item.key === key) ? prev.filter((item) => item.key !== key) : prev,
        );
      },
    }),
    [],
  );

  const paused = pointerInside || focusInside;

  useEffect(
    function syncTimers() {
      const live = new Map(items.map((item) => [item.id, item]));
      for (const [id, timer] of timers.current) {
        const item = live.get(id);
        if (item === undefined || !isTransient(item) || item.revision !== timer.revision) {
          if (timer.handle !== null) clearTimeout(timer.handle);
          timers.current.delete(id);
        }
      }
      const now = Date.now();
      for (const item of items) {
        if (!isTransient(item)) continue;
        let timer = timers.current.get(item.id);
        if (timer === undefined) {
          timer = { revision: item.revision, remainingMs: autoDismissMs, handle: null, startedAt: now };
          timers.current.set(item.id, timer);
        }
        if (paused && timer.handle !== null) {
          clearTimeout(timer.handle);
          timer.handle = null;
          timer.remainingMs = Math.max(0, timer.remainingMs - (now - timer.startedAt));
        } else if (!paused && timer.handle === null) {
          const id = item.id;
          timer.startedAt = now;
          timer.handle = setTimeout(() => remove(id), timer.remainingMs);
        }
      }
    },
    [items, paused, autoDismissMs, remove],
  );

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending.values()) {
        if (timer.handle !== null) clearTimeout(timer.handle);
      }
      pending.clear();
    };
  }, []);

  useLayoutEffect(() => {
    const target = focusAfterRemoval.current;
    focusAfterRemoval.current = null;
    if (target === 'viewport') {
      viewportRef.current?.focus();
    } else if (target !== null) {
      dismissControls.current.get(target)?.focus();
    }
    // A focused item removed by `dismiss(key)` takes focus with it and fires
    // no blur, so read focus from the document rather than trust the last
    // focus event; otherwise every timer would stay paused.
    const viewport = viewportRef.current;
    if (viewport !== null && !viewport.contains(document.activeElement)) {
      setFocusInside(false);
    }
  }, [items]);

  function handleDismissControl(id: number): void {
    const index = items.findIndex((item) => item.id === id);
    if (index === -1) return;
    const neighbour = items[index + 1] ?? items[index - 1];
    focusAfterRemoval.current = neighbour === undefined ? 'viewport' : neighbour.id;
    remove(id);
  }

  return (
    <NotifierContext.Provider value={notifier}>
      {children}
      <section
        aria-label="Notifications"
        className={styles.viewport}
        data-testid={NOTIFICATION_TEST_IDS.viewport}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setFocusInside(false);
        }}
        onFocus={() => setFocusInside(true)}
        onMouseEnter={() => setPointerInside(true)}
        onMouseLeave={() => setPointerInside(false)}
        ref={viewportRef}
        tabIndex={-1}
      >
        {items.map((item) => (
          <NotificationItem
            dismissRef={(element) => {
              if (element === null) dismissControls.current.delete(item.id);
              else dismissControls.current.set(item.id, element);
            }}
            key={item.id}
            kind={item.kind}
            message={item.message}
            onDismiss={() => handleDismissControl(item.id)}
          />
        ))}
      </section>
    </NotifierContext.Provider>
  );
}

/**
 * The provider's `Notifier`, referentially stable for the provider's lifetime.
 * Outside a provider it throws rather than returning a no-op that would drop
 * errors without a trace.
 */
export function useNotify(): Notifier {
  const notifier = useContext(NotifierContext);
  if (notifier === null) {
    throw new Error('useNotify() must be called inside a NotificationProvider');
  }
  return notifier;
}
