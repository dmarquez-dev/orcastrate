/**
 * Scope table. The no-paths rule (frozen `helm.ts` header) lives here.
 *
 * A `HelmScopeId` is a KEY, never a path fragment. `buildScopeTable` is the
 * only place a settings path is ever produced, and it produces one from a
 * `PodDirectory.cwd` or from `deps.claudeHome` — both main-side values that
 * never came from the renderer. Resolution is a `Map.get`, so a scopeId of
 * `project:../../../etc` is a miss, not a traversal: nothing joins, resolves or
 * normalizes the caller's string.
 */

import { join } from 'node:path';

import type { HelmScope, HelmScopeId, HelmScopeKind } from '../../shared/contracts/helm';
import type { PodDirectory } from '../../shared/contracts/panel-host';

/** The label the user scope carries, per the frozen contract. */
export const USER_SCOPE_LABEL = 'All projects';

/** The one id that is not derived from a Pod. */
export const USER_SCOPE_ID: HelmScopeId = 'user';

export interface ScopeEntry {
  id: HelmScopeId;
  kind: HelmScopeKind;
  podId: string | null;
  label: string;
  /** ABSOLUTE, main-side only. Leaves this process only as `displayPath`. */
  path: string;
}

/**
 * The user scope plus two per Pod, in `deps.pods()` order.
 *
 * Rebuilt on every call rather than cached: `PodDirectoryProvider` is
 * documented as "every Pod Orcastrate knows about, AT THE MOMENT OF THE CALL",
 * so a Pod created after the service was constructed must still be listable.
 */
export function buildScopeTable(pods: readonly PodDirectory[], claudeHome: string): Map<HelmScopeId, ScopeEntry> {
  const table = new Map<HelmScopeId, ScopeEntry>();

  table.set(USER_SCOPE_ID, {
    id: USER_SCOPE_ID,
    kind: 'user',
    podId: null,
    label: USER_SCOPE_LABEL,
    path: join(claudeHome, 'settings.json'),
  });

  for (const pod of pods) {
    table.set(`project:${pod.podId}`, {
      id: `project:${pod.podId}`,
      kind: 'project',
      podId: pod.podId,
      label: pod.title,
      path: join(pod.cwd, '.claude', 'settings.json'),
    });
    table.set(`projectLocal:${pod.podId}`, {
      id: `projectLocal:${pod.podId}`,
      kind: 'projectLocal',
      podId: pod.podId,
      label: pod.title,
      path: join(pod.cwd, '.claude', 'settings.local.json'),
    });
  }

  return table;
}

/** The outward-facing view of an entry. `exists` is supplied by the caller's stat. */
export function toScope(entry: ScopeEntry, exists: boolean): HelmScope {
  return {
    id: entry.id,
    kind: entry.kind,
    podId: entry.podId,
    label: entry.label,
    displayPath: entry.path,
    exists,
  };
}
