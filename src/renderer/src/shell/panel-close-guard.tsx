import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type JSX,
  type ReactNode,
} from 'react';

import type * as PanelContracts from '../contracts/renderer-panels';
import type {
  PanelCloseController,
  PanelCloseGuard,
  PanelKey,
} from '../contracts/renderer-panels';

/**
 * The panel close guard: the registration mechanism, and the one guarded
 * transition every shell affordance routes through.
 *
 * WHY THIS MODULE EXISTS AT ALL. `App.tsx` used to move `openPanel` directly,
 * so closing Helm on a dirty draft threw the draft away. The obvious fix —
 * have the shell ask "is the draft dirty?" — is the one thing the shell may
 * not do: that question is `useHelm()`, and `useHelm()`'s mount effect issues
 * the scope fetch, which would make the shell a data fetcher and would fetch
 * Helm's scopes while the Helm panel is shut. `App.tsx`'s invariant comment
 * says so, and `renderer-panels.ts` restates it.
 *
 * SO THE DEPENDENCY IS INVERTED. The shell knows only that SOME panel may
 * object to being closed; the panel — already mounted, already knowing whether
 * it is dirty — is the one that objects, and it owns the confirmation UI.
 * Nothing here fetches anything, nothing here subscribes to a store, and
 * nothing here knows the word "draft". Beachcomber registers nothing and is
 * therefore bit-for-bit unchanged.
 *
 * THE SYNCHRONOUS PATH IS LOAD-BEARING. With no guard registered the
 * transition applies the new `openPanel` BEFORE returning, with no awaited
 * turn inserted — see `transition` below. That is what keeps every existing
 * open/switch/close test observing the behaviour it always observed.
 */

/**
 * What the provider carries. `controller` is the asking side, consumed by the
 * shell; `register` is the registration side, reached only through
 * `useRegisterPanelCloseGuard`.
 */
export interface PanelCloseGuardHost {
  readonly controller: PanelCloseController;
  /**
   * Registers `guard` (or clears the registration when `null`) and returns the
   * undo. The undo clears the slot ONLY if this registration still holds it,
   * so a panel unmounting after its successor registered cannot wipe the
   * successor's guard.
   */
  register(guard: PanelCloseGuard | null): () => void;
}

const PanelCloseGuardContext = createContext<PanelCloseGuardHost | null>(null);

/**
 * Asks the guard, and NEVER rejects. A guard that threw — synchronously or by
 * rejection — is treated as having permitted the transition: refusing to close
 * would strand the user in a panel with no way out, which is the more trapping
 * failure of the two (`PanelCloseGuard.beforeClose`).
 */
async function ask(guard: PanelCloseGuard): Promise<boolean> {
  try {
    return await guard.beforeClose();
  } catch {
    return true;
  }
}

/**
 * Creates the host. Called by `App` alone, which owns `openPanel` and its
 * setter; the setter is called from exactly one place, `transition` below.
 */
export function usePanelCloseGuardHost(
  openPanel: PanelKey | null,
  setOpenPanel: (next: PanelKey | null) => void,
): PanelCloseGuardHost {
  const guard = useRef<PanelCloseGuard | null>(null);

  // ONE in-flight flag, shared by both methods. A second flag would be a
  // second way to be wrong (`PanelTransitionRules`).
  const inFlight = useRef(false);

  // Read at click time, not at render time, so the memoized host below never
  // goes stale. Assigning during render is safe: both are plain mirrors of the
  // arguments and neither is read during rendering.
  const open = useRef(openPanel);
  open.current = openPanel;
  const apply = useRef(setOpenPanel);
  apply.current = setOpenPanel;

  return useMemo<PanelCloseGuardHost>(() => {
    const transition = (next: PanelKey | null): Promise<void> => {
      // DROPPED, not queued and not latest-wins. The user is answering a
      // dialog raised for the pending destination; a click made while that
      // dialog is up must not be honoured with the consent of a different one.
      if (inFlight.current) return Promise.resolve();

      const registered = guard.current;
      if (registered === null) {
        // THE SYNCHRONOUS PATH. No await, so `openPanel` has already moved by
        // the time this returns.
        apply.current(next);
        return Promise.resolve();
      }

      inFlight.current = true;
      return ask(registered)
        .then((permitted) => {
          // DECLINED leaves `openPanel` EXACTLY as it was. For a switch that
          // means the switch does not happen and the original panel stays
          // open and mounted — the old panel is never closed first.
          if (permitted) apply.current(next);
        })
        .finally(() => {
          inFlight.current = false;
        });
    };

    return {
      controller: {
        requestClose: () => transition(null),
        requestOpen: (next: PanelKey) =>
          // Re-opening what is already open is a no-op and the guard is NOT
          // asked: re-clicking Helm's own button must not raise a dialog.
          next === open.current ? Promise.resolve() : transition(next),
      },
      register: (next: PanelCloseGuard | null) => {
        guard.current = next;
        return () => {
          if (guard.current === next) guard.current = null;
        };
      },
    };
  }, []);
}

export function PanelCloseGuardProvider({
  host,
  children,
}: {
  host: PanelCloseGuardHost;
  children: ReactNode;
}): JSX.Element {
  return <PanelCloseGuardContext.Provider value={host}>{children}</PanelCloseGuardContext.Provider>;
}

/**
 * The asking side, for anything under the provider that needs it. `App` holds
 * the host directly and does not go through this.
 */
export function usePanelCloseController(): PanelCloseController {
  const host = useContext(PanelCloseGuardContext);
  if (host === null) {
    throw new Error('usePanelCloseController must be used inside PanelCloseGuardProvider');
  }
  return host.controller;
}

/**
 * The registration side, consumed by the panel (frozen `renderer-panels.ts`).
 *
 * Passing a guard registers it; passing `null` clears the registration. The
 * registration is cleared on unmount, so a panel that unmounted for any reason
 * cannot veto a later close of a different panel.
 *
 * FETCHES NOTHING and subscribes to no store — that is precisely what lets the
 * shell host the provider without becoming a data fetcher.
 */
export function useRegisterPanelCloseGuard(guard: PanelCloseGuard | null): void {
  const host = useContext(PanelCloseGuardContext);

  useEffect(() => {
    if (host === null) return undefined;
    return host.register(guard);
  }, [host, guard]);

  if (host === null) {
    throw new Error('useRegisterPanelCloseGuard must be used inside PanelCloseGuardProvider');
  }
}

/**
 * Compile-time proof that the hook above still matches the signature T1 landed
 * in the frozen contract. Type-only: nothing is imported at runtime, because
 * the contract declares the hook without implementing it.
 */
type DeclaredRegisterHook = typeof PanelContracts.useRegisterPanelCloseGuard;
const _matchesContract: DeclaredRegisterHook = useRegisterPanelCloseGuard;
