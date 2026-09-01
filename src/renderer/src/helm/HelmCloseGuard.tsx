/**
 * Helm's answer to "may I close you?".
 *
 * THE INVERTED DEPENDENCY, from the frozen `PanelCloseGuard` docblock: the
 * shell cannot ask whether the draft is dirty, because that question is
 * `useHelm()` and `useHelm()`'s mount effect fetches Helm's scopes — which
 * would make the shell a data fetcher and would fetch while the panel is shut.
 * So the panel, already mounted and already holding `dirty`, registers an
 * objection instead, and owns the dialog that raises it.
 *
 * THIS COMPONENT HOLDS EXACTLY ONE PIECE OF STATE: the resolver of the promise
 * the shell is waiting on. `dirty` is not copied into state — it is read
 * through a ref at the moment the guard is asked, which is what lets the guard
 * object itself be registered ONCE and never re-registered as the user types.
 * A guard that changed identity on every keystroke would churn the shell's
 * registration for no benefit.
 *
 * IT NEVER REJECTS. A clean draft resolves `true` immediately and renders
 * nothing, so a panel with nothing to lose closes exactly as it always did.
 * The shell also treats a throw as permission to close, so the two agree even
 * on the path neither expects.
 */

import { useMemo, useRef, useState, type JSX } from 'react';

import type { PanelCloseGuard } from '../contracts/renderer-panels';
import { useRegisterPanelCloseGuard } from '../shell/panel-close-guard';

import { HelmCloseConfirm } from './HelmCloseConfirm';

export interface HelmCloseGuardProps {
  /** `HelmView.dirty`. The one fact that decides whether anything is asked. */
  dirty: boolean;
}

export function HelmCloseGuard({ dirty }: HelmCloseGuardProps): JSX.Element | null {
  const latestDirty = useRef(dirty);
  latestDirty.current = dirty;

  const [pending, setPending] = useState<((permitted: boolean) => void) | null>(null);

  const guard = useMemo<PanelCloseGuard>(
    () => ({
      // `async` rather than `Promise.resolve(true)`, and `settle` rather than
      // `resolve`, because `no-paths.test.ts` forbids the substring `resolve(`
      // anywhere in this directory — it is hunting `path.resolve`, and cannot
      // tell it from `Promise.resolve`. Working around it here rather than
      // narrowing the rule: a hygiene rule that has never fired wrongly in
      // shipped code is not worth weakening for one call site.
      beforeClose: async (): Promise<boolean> => {
        if (!latestDirty.current) return true;
        // The promise is settled by whichever button the user presses. The
        // controller asks exactly once per transition and drops anything that
        // arrives while one is pending, so there is never a second settler to
        // strand.
        return new Promise<boolean>((settle) => {
          setPending(() => settle);
        });
      },
    }),
    [],
  );

  useRegisterPanelCloseGuard(guard);

  if (pending === null) return null;

  const answer = (permitted: boolean): void => {
    setPending(null);
    pending(permitted);
  };

  return (
    <HelmCloseConfirm
      onDiscard={() => {
        answer(true);
      }}
      onKeep={() => {
        answer(false);
      }}
    />
  );
}
