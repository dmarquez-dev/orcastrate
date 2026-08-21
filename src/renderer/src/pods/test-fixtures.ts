import type { PermissionMode, PodStatus } from '@shared/contracts/events';
import type { PodTabVm } from '../contracts/renderer-state';
import { makeStubPod } from '../test-utils';

export interface TabOverrides {
  id: string;
  title?: string;
  active?: boolean;
  opened?: boolean;
  status?: PodStatus;
  /**
   * Claude Code's session id, or null for a Pod that never reached its first
   * turn. Explicit here because the delete confirmation's checkbox is ABSENT
   * when it is null, and a fixture that could not express both sides would let
   * that assertion pass by rendering nothing.
   */
  ccSessionId?: string | null;
  permissionMode?: PermissionMode;
  awaitingPermission?: boolean;
  pendingPermissionCount?: number;
  unreadEventCount?: number;
}

/** One `PodTabVm`, with every field the Pod bar reads made explicit. */
export function tabVm(overrides: TabOverrides): PodTabVm {
  const {
    id,
    title = `Pod ${id}`,
    active = false,
    opened = true,
    status = 'idle',
    ccSessionId = null,
    permissionMode = 'default',
    awaitingPermission = false,
    pendingPermissionCount = awaitingPermission ? 1 : 0,
    unreadEventCount = 0,
  } = overrides;

  return {
    pod: makeStubPod({ id, title, permissionMode, status, ccSessionId }),
    active,
    opened,
    status,
    awaitingPermission,
    pendingPermissionCount,
    unreadEventCount,
  };
}

/** The `data-testid` of every rendered tab, in DOM order. */
export function renderedPodIds(root: HTMLElement): string[] {
  return Array.from(root.querySelectorAll('[data-testid^="pod-tab:"]')).map(
    (el) => el.getAttribute('data-testid')?.slice('pod-tab:'.length) ?? '',
  );
}
